/**
 * PIVOT forms from the server's parsePivot:
 *   - table alias after `)`: `PIVOT (...) p` / `PIVOT (...) AS p`
 *   - `FOR <expr> IN`: the FOR expression stops at the top-level IN
 *   - IN values aliased with or without AS: `IN (2000 y2000)`
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.Statement => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

const roundTrip = (sql: string, expected: string) => {
  const out = toSql(ok(sql))
  expect(out).toBe(expected)
  expect(toSql(ok(out))).toBe(expected)
}

describe("PIVOT", () => {
  it("alias after the closing parenthesis", () => {
    const sel = ok(
      "SELECT * FROM cities PIVOT (sum(p) FOR year IN (2000, 2010)) p",
    ) as AST.SelectStatement
    expect(sel.pivot?.alias).toBe("p")
    roundTrip(
      "SELECT * FROM cities PIVOT (sum(p) FOR year IN (2000, 2010)) AS p ORDER BY country",
      "SELECT * FROM cities PIVOT (sum(p) FOR year IN (2000, 2010)) AS p ORDER BY country",
    )
    roundTrip(
      "cities PIVOT (sum(p) FOR year IN (2000, 2010)) p",
      "cities PIVOT (sum(p) FOR year IN (2000, 2010)) AS p",
    )
  })

  it("clause words after `)` are not taken as an alias", () => {
    ok("SELECT * FROM t PIVOT (sum(v) FOR c IN ('a','b')) SUBSAMPLE lttb(a, 5)")
    ok("SELECT * FROM t PIVOT (sum(v) FOR c IN ('a')) LIMIT 5")
    ok("SELECT * FROM t PIVOT (sum(v) FOR c IN ('a')) GROUP BY x")
    ok("SELECT * FROM t PIVOT (sum(v) FOR c IN ('a')) SAMPLE BY 1h")
  })

  it("FOR <expression> IN", () => {
    roundTrip(
      "SELECT * FROM t PIVOT (sum(p) FOR year(ts) IN (2000))",
      "SELECT * FROM t PIVOT (sum(p) FOR year(ts) IN (2000))",
    )
    roundTrip(
      "SELECT * FROM t PIVOT (sum(p) FOR year - 2000 IN (0, 10) a IN ('x'))",
      "SELECT * FROM t PIVOT (sum(p) FOR year - 2000 IN (0, 10) a IN ('x'))",
    )
    // IN still works as an operator inside parentheses / WHERE
    ok("SELECT * FROM t WHERE a IN (1, 2) PIVOT (sum(p) FOR y IN (1))")
  })

  it("IN values aliased without AS", () => {
    roundTrip(
      "SELECT * FROM t PIVOT (sum(p) FOR year IN (2000 y2000, 2010 AS y2010))",
      "SELECT * FROM t PIVOT (sum(p) FOR year IN (2000 AS y2000, 2010 AS y2010))",
    )
  })

  it("autocomplete after PIVOT (...) still offers clause keywords", () => {
    const names = getNextValidTokens(
      "SELECT * FROM t PIVOT (sum(v) FOR c IN ('a')) ",
    )
    expect(names).toContain("Order")
    expect(names).toContain("As")
  })
})
