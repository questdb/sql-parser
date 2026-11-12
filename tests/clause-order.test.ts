/**
 * Server clause order (SqlParser.parseFromClause):
 *   joins -> WHERE -> LATEST ON -> PIVOT -> SAMPLE BY -> GROUP BY -> WINDOW
 *   -> SUBSAMPLE -> ORDER BY -> LIMIT
 * plus the deprecated `LATEST BY` right after the table (before WHERE),
 * `@var` operands in LATEST ON, and open-ended `LIMIT 5,` / `LIMIT ,5`.
 * The orders sql-parser accepted before (SAMPLE BY -> LATEST ON,
 * GROUP BY -> PIVOT, WHERE -> LATEST BY) must keep parsing.
 */

import { describe, it, expect } from "vitest"
import { parseToAst } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.SelectStatement => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0] as AST.SelectStatement
}

const roundTrip = (sql: string, expected: string) => {
  const out = toSql(ok(sql))
  expect(out).toBe(expected)
  expect(toSql(ok(out))).toBe(expected)
}

describe("clause order", () => {
  it("LATEST ON before SAMPLE BY", () => {
    roundTrip(
      "SELECT ts, count() FROM t WHERE x > 1 LATEST ON ts PARTITION BY sym SAMPLE BY 1d",
      "SELECT ts, count() FROM t WHERE x > 1 LATEST ON ts PARTITION BY sym SAMPLE BY 1d",
    )
  })

  it("PIVOT before GROUP BY / SAMPLE BY keeps its position", () => {
    const sel = ok(
      "SELECT * FROM t PIVOT (sum(p) FOR y IN (2000, 2010)) GROUP BY x",
    )
    expect(sel.pivot).toBeDefined()
    expect(sel.groupBy).toHaveLength(1)
    roundTrip(
      "SELECT * FROM t PIVOT (sum(p) FOR y IN (2000, 2010)) GROUP BY x",
      "SELECT * FROM t PIVOT (sum(p) FOR y IN (2000, 2010)) GROUP BY x",
    )
    roundTrip(
      "SELECT * FROM t WHERE a > 1 LATEST ON ts PARTITION BY s PIVOT (sum(p) FOR y IN (1)) SAMPLE BY 1h",
      "SELECT * FROM t WHERE a > 1 LATEST ON ts PARTITION BY s PIVOT (sum(p) FOR y IN (1)) SAMPLE BY 1h",
    )
    // implicit select body
    roundTrip(
      "SELECT * FROM (t PIVOT (sum(p) FOR y IN (1)) GROUP BY x)",
      "SELECT * FROM (t PIVOT (sum(p) FOR y IN (1)) GROUP BY x)",
    )
  })

  it("deprecated LATEST BY before WHERE", () => {
    const sel = ok("SELECT * FROM t LATEST BY s WHERE x > 1")
    expect(sel.latestOn?.partitionBy[0].parts).toEqual(["s"])
    expect(sel.where).toBeDefined()
    roundTrip(
      "SELECT * FROM (t LATEST BY s WHERE x > 1)",
      "SELECT * FROM (t LATEST BY s WHERE x > 1)",
    )
  })

  it("LATEST ON with @variables", () => {
    roundTrip(
      "SELECT * FROM t LATEST ON @ts PARTITION BY @a, b",
      "SELECT * FROM t LATEST ON @ts PARTITION BY @a, b",
    )
  })

  it("open-ended LIMIT", () => {
    expect(ok("SELECT * FROM t LIMIT 5,").limit?.upperBound).toBeUndefined()
    roundTrip("SELECT * FROM t LIMIT 5,", "SELECT * FROM t LIMIT 5")
    roundTrip("SELECT * FROM t LIMIT ,5", "SELECT * FROM t LIMIT 0, 5")
    roundTrip("SELECT * FROM t LIMIT 1, 5", "SELECT * FROM t LIMIT 1, 5")
  })

  it("previously accepted orders still parse", () => {
    ok("SELECT ts, count() FROM t SAMPLE BY 1d LATEST ON ts PARTITION BY s")
    ok("SELECT * FROM t WHERE x > 1 LATEST BY s")
    ok("SELECT * FROM t GROUP BY x PIVOT (sum(p) FOR y IN (1))")
  })
})
