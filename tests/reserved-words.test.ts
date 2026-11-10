/**
 * Words the server does not reserve (not in SqlKeywords.KEYWORDS) are usable
 * as identifiers: join words, BY / GROUP / WHEN / THEN / ELSE / FOR / IF /
 * PIVOT / SHOW / COPY / ... and IS / ILIKE / DECLARE as column names. They
 * still start joins / clauses / statements where they did before.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens, format } from "../src/index"
import { toSql } from "../src/parser/toSql"

const ok = (sql: string, n = 1) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(n)
  return result.ast
}

describe("non-reserved clause words as identifiers", () => {
  it("column names", () => {
    ok(
      "SELECT left, right, full, inner, cross, asof, lt, splice, horizon, window, by, group, when, then, else FROM t",
    )
    ok(
      "SELECT details, repair, unpivot, show, copy, truncate, vacuum, grant, revoke, if, include, respect, pivot, for FROM t",
    )
    ok("CREATE TABLE x (is INT, ilike INT, declare INT, group INT, if INT)")
    ok("ALTER TABLE x ADD COLUMN is INT")
  })

  it("after a dot and as aliases / entity names", () => {
    expect(toSql(ok("SELECT t.left, t.window FROM t"))).toBe(
      'SELECT t."left", t."window" FROM t',
    )
    ok("SELECT a AS left, b group FROM t")
    ok("CREATE USER left")
    ok("CREATE TABLE group (a INT)")
  })

  it("still start joins, clauses and statements", () => {
    expect(toSql(ok("SELECT * FROM t LEFT JOIN u ON t.a = u.a"))).toBe(
      "SELECT * FROM t LEFT JOIN u ON t.a = u.a",
    )
    expect(toSql(ok("SELECT * FROM t ASOF JOIN u TOLERANCE 1s"))).toBe(
      "SELECT * FROM t ASOF JOIN u TOLERANCE 1s",
    )
    expect(toSql(ok("SELECT a, count() FROM t GROUP BY a"))).toBe(
      "SELECT a, count() FROM t GROUP BY a",
    )
    ok("SELECT avg(x) OVER w FROM t WINDOW w AS (ORDER BY ts)")
    ok("SELECT CASE WHEN a THEN b ELSE c END FROM t")
    ok("SELECT * FROM t PIVOT (sum(v) FOR k IN ('a') GROUP BY s)")
    ok("SELECT * FROM t\nSHOW TABLES", 2)
    ok("SELECT 1\nSHOW TABLES", 2)
    ok("DROP TABLE IF EXISTS t")
    // never an implicit SELECT of a table named copy / show / vacuum
    expect(parseToAst("copy").errors.length).toBeGreaterThan(0)
    expect(parseToAst("VACUUM must remove").errors.length).toBeGreaterThan(0)
  })

  it("autocomplete keeps the clause keywords", () => {
    const afterTable = getNextValidTokens("SELECT * FROM t ")
    for (const k of ["Left", "Asof", "Join", "Group", "Window", "Where"]) {
      expect(afterTable).toContain(k)
    }
    expect(
      getNextValidTokens("SELECT * FROM t ASOF JOIN u ON t.ts = u.ts "),
    ).toContain("Tolerance")
    expect(getNextValidTokens("SELECT CASE WHEN (v > 1) ")).toContain("Then")
    // a statement keyword at statement start, not an implicit-select table
    expect(getNextValidTokens("SHOW ")).not.toContain("Where")
    expect(getNextValidTokens("SELECT 1; COPY ")).not.toContain("Pivot")
    const colName = getNextValidTokens("CREATE TABLE x (")
    expect(colName).not.toContain("Is")
    expect(colName).not.toContain("Declare")
  })

  it("formatter", () => {
    expect(format("SELECT t.window FROM t")).toBe("SELECT t.window\nFROM t")
    expect(format("SELECT CASE WHEN a THEN -1 ELSE -2 END FROM t")).toBe(
      "SELECT CASE WHEN a THEN -1 ELSE -2 END\nFROM t",
    )
  })
})
