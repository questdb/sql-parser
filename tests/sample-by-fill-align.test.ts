/**
 * SAMPLE BY forms the QuestDB server accepts (SqlParser.expectSample and the
 * FILL / ALIGN TO parsing after it):
 *   - SAMPLE BY <expr> [one-letter unit]: `@q h`, `2 h`, `(1m)`, `(10+20)m`, `$1 d`
 *   - FILL(<expr>, ...): `-1`, `@f`, `true`, `PREV(abs(a))`, `1+2`, `100L`, `NaN`, `'5'`
 *   - ALIGN TO CALENDAR TIME ZONE <expr> [WITH OFFSET <expr>]
 *
 * Statement-level server queries live in tests/fixtures/server-queries.json
 * (feature "sample-by-fill-align").
 */

import { describe, it, expect } from "vitest"
import { parseToAst, createAutocompleteProvider } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.SelectStatement => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  const out = toSql(result.ast)
  // canonical output re-parses to itself
  const again = parseToAst(out)
  expect(again.errors).toEqual([])
  expect(toSql(again.ast)).toBe(out)
  return result.ast[0] as AST.SelectStatement
}

describe("SAMPLE BY expression + unit", () => {
  it.each([
    ["SELECT count() FROM t SAMPLE BY @q h", "@q h"],
    ["SELECT count() FROM t SAMPLE BY 2 h", "2 h"],
    ["SELECT count() FROM t SAMPLE BY (1m)", "(1m)"],
    ["SELECT count() FROM t SAMPLE BY (10+20)m", "(10 + 20) m"],
    ["SELECT count() FROM t SAMPLE BY $1 d", "$1 d"],
    ["SELECT count() FROM t SAMPLE BY 1h", "1h"],
    ["SELECT count() FROM t SAMPLE BY w", "w"],
    ["SELECT count() FROM t SAMPLE BY @unit", "@unit"],
  ])("%s", (sql, duration) => {
    expect(ok(sql).sampleBy!.duration).toBe(duration)
  })
})

describe("FILL with any expression", () => {
  it.each([
    ["FILL(-1)", ["-1"]],
    ["FILL(prev, -1, -1.5, prev)", ["PREV", "-1", "-1.5", "PREV"]],
    ["FILL(@f)", ["@f"]],
    ["FILL(true)", ["TRUE"]],
    ["FILL(prev(abs(a)))", ["PREV(abs(a))"]],
    ["FILL(PREV(a))", ["PREV(a)"]],
    ["FILL(1+2)", ["1 + 2"]],
    ["FILL(100L)", ["100L"]],
    ["FILL(NaN)", ["NaN"]],
    ["FILL('5')", ["'5'"]],
    ["FILL(NULL, LINEAR, NONE)", ["NULL", "LINEAR", "NONE"]],
  ])("%s", (fill, values) => {
    expect(
      ok(`SELECT count() FROM t SAMPLE BY 1h ${fill}`).sampleBy!.fill,
    ).toEqual(values)
  })

  it("keeps FILL keyword suggestions", () => {
    const labels = (sql: string) =>
      createAutocompleteProvider({ tables: [], columns: {} })
        .getSuggestions(sql, sql.length)
        .map((s) => s.label)
    const fill = labels("SELECT count() FROM t SAMPLE BY 1h FILL(")
    for (const k of ["NULL", "PREV", "LINEAR", "NONE"])
      expect(fill).toContain(k)
    // no function / operator noise at the top level of FILL / SAMPLE BY
    expect(fill).not.toContain("CASE")
    expect(labels("SELECT count() FROM t SAMPLE BY ")).not.toContain("CASE")
  })
})

describe("ALIGN TO CALENDAR TIME ZONE / WITH OFFSET expressions", () => {
  it("keeps string values", () => {
    const s = ok(
      "SELECT count() FROM t SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'Europe/London' WITH OFFSET '00:15'",
    )
    expect(s.sampleBy!.alignTo).toEqual({
      type: "alignTo",
      mode: "calendar",
      timeZone: "Europe/London",
      offset: "00:15",
    })
  })

  it.each([
    "TIME ZONE @tz",
    "WITH OFFSET @o",
    "TIME ZONE concat('Europe', '/London')",
    "TIME ZONE $1 WITH OFFSET $2",
  ])("%s", (align) => {
    const sql = `SELECT count() FROM t SAMPLE BY 1h ALIGN TO CALENDAR ${align}`
    ok(sql)
    expect(toSql(parseToAst(sql).ast)).toBe(sql)
  })
})
