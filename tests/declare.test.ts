/**
 * DECLARE forms the QuestDB server accepts (questdb#7602, SqlParser.parseDeclare,
 * isMarkedDeclarationAhead):
 *   - `DECLARE [OVERRIDABLE] [AUDITED] @x := ...` markers in any order (per variable)
 *   - a trailing comma in a value list `('a',)` and after the last declaration
 *   - an implicit select after DECLARE / WITH: `DECLARE @x := 1 (SELECT @x)`,
 *     `DECLARE @lim := 1 t WHERE x > @lim`, `(WITH c AS (...) c)`
 *   - set-operation branches starting with WITH or DECLARE
 *
 * Statement-level server queries live in tests/fixtures/server-queries.json
 * (feature "declare").
 */

import { describe, it, expect } from "vitest"
import type { CstNode } from "chevrotain"
import { format, parse, parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.Statement[] => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast
}

describe("DECLARE", () => {
  it("AUDITED / OVERRIDABLE markers in any order", () => {
    const sel = ok(
      "DECLARE AUDITED OVERRIDABLE @x := 1, AUDITED @y := 2, @z := 3 SELECT @x",
    )[0] as AST.SelectStatement
    expect(
      sel.declare!.assignments.map((a) => [a.audited, a.overridable]),
    ).toEqual([
      [true, true],
      [true, undefined],
      [undefined, undefined],
    ])
    expect(toSql(sel)).toBe(
      "DECLARE OVERRIDABLE AUDITED @x := 1, AUDITED @y := 2, @z := 3 SELECT @x",
    )
  })

  it("audited / overridable stay usable as table names", () => {
    for (const q of [
      "DECLARE @lim := 1 audited WHERE x > @lim",
      "DECLARE @lim := 1 overridable WHERE x > @lim",
      "DECLARE @lim := 1, overridable WHERE x > @lim",
      "DECLARE @lim := 1 audited overridable WHERE overridable.x > @lim",
      "SELECT audited FROM audited",
    ]) {
      const out = toSql(ok(q))
      expect(toSql(ok(out))).toBe(out)
    }
  })

  it("trailing comma in a value list", () => {
    ok("DECLARE @x := (2,) SELECT l FROM k WHERE l IN @x")
  })

  it("implicit select after DECLARE / WITH", () => {
    expect(toSql(ok("DECLARE @x := abs(-1) (SELECT @x)"))).toBe(
      "DECLARE @x := abs(-1) (SELECT @x)",
    )
    expect(toSql(ok("SELECT * FROM (WITH c AS (SELECT 1 a) c)"))).toBe(
      "SELECT * FROM (WITH c AS (SELECT 1 AS a) c)",
    )
  })

  it("set-operation branch starting with DECLARE", () => {
    ok("SELECT 1 a UNION ALL DECLARE @x := 2 SELECT @x")
    ok(
      "CREATE TABLE c_union AS (SELECT 1 a UNION ALL DECLARE AUDITED @x := 2 SELECT @x)",
    )
  })

  it("suggests AUDITED and OVERRIDABLE after DECLARE", () => {
    const names = getNextValidTokens("DECLARE ")
    expect(names).toContain("Audited")
    expect(names).toContain("Overridable")
  })
})

// The web console walks the CST of `DECLARE ... SELECT` (notebook variable
// injection, ui src/scenes/Editor/Notebook/declareUtils.ts) and expects the
// body as a direct `selectStatement.children.selectBody`, as before the
// implicit-select form was added. Keep that shape.
describe("DECLARE / WITH CST shape stays compatible", () => {
  const selectStatement = (sql: string) => {
    const r = parse(sql)
    expect(r.parseErrors).toEqual([])
    const stmt = (r.cst.children.statement as CstNode[])[0]
    return (stmt.children.selectStatement as CstNode[])[0]
  }

  it.each([
    "DECLARE @y := 99 SELECT @x + @y",
    "DECLARE OVERRIDABLE @a := 1, @b := 2 SELECT @a + @b",
    "DECLARE @x := 1 WITH a AS (SELECT 1) SELECT * FROM a",
  ])("%s: selectBody is a direct child", (sql) => {
    const sel = selectStatement(sql)
    expect(sel.children.declareClause).toHaveLength(1)
    expect(sel.children.selectBody).toHaveLength(1)
  })

  it("implicit select after DECLARE is still accepted", () => {
    const sel = selectStatement("DECLARE @x := 1 trades WHERE price > @x")
    expect(sel.children.declareClause).toHaveLength(1)
    expect(sel.children.implicitSelectStatement).toHaveLength(1)
    expect(
      toSql(parseToAst("DECLARE @x := 1 trades WHERE price > @x").ast[0]),
    ).toContain("@x")
  })
})

// The server lexer does not split on `@`, so a variable is `@` followed by
// any identifier characters, including a leading digit or `$`
// (`DECLARE @1 := 1 SELECT @1`). Before, `@1` lexed as `@` + `1` and the
// formatter wrote `@ 1`, which the server rejects.
describe("variable names with a leading digit or $", () => {
  it.each([
    ["DECLARE @1 := 1 SELECT @1", "DECLARE @1 := 1\nSELECT @1"],
    [
      "DECLARE @foo$bar := 1 SELECT @foo$bar",
      "DECLARE @foo$bar := 1\nSELECT @foo$bar",
    ],
    [
      "DECLARE @1a := 2 SELECT * FROM t WHERE x = @1a",
      "DECLARE @1a := 2\nSELECT *\nFROM t\nWHERE x = @1a",
    ],
  ])("%s parses, round-trips and formats as one token", (sql, formatted) => {
    const r = parseToAst(sql)
    expect(r.errors).toEqual([])
    expect(r.ast).toHaveLength(1)
    const again = parseToAst(toSql(r.ast[0]))
    expect(again.errors).toEqual([])
    expect(format(sql)).toBe(formatted)
  })

  it("names the variable without the @", () => {
    const stmt = parseToAst("DECLARE @1 := 1 SELECT @1")
      .ast[0] as AST.SelectStatement
    expect(stmt.declare?.assignments[0].name).toBe("1")
  })

  it("keeps passwords, binds and slices", () => {
    for (const sql of [
      "CREATE USER u WITH PASSWORD abc@123",
      "CREATE USER u WITH PASSWORD @123",
      "SELECT * FROM t WHERE x = $1 AND y = :sym",
      "SELECT arr[1:2], arr[i:j] FROM t",
    ]) {
      expect(parseToAst(sql).errors, sql).toEqual([])
      expect(format(sql), sql).not.toMatch(/@ \d/)
    }
    expect(format("CREATE USER u WITH PASSWORD abc@123")).toContain("abc@123")
  })
})
