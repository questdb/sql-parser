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
import { parseToAst, getNextValidTokens } from "../src/index"
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
