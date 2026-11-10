/**
 * CREATE MATERIALIZED VIEW: TTL without PARTITION BY, REFRESH without a mode /
 * DEFERRED / INCREMENTAL (obsolete IMMEDIATE), TTL with a one-letter unit.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"

const ok = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

const q = "AS (SELECT ts, avg(v) FROM t SAMPLE BY 30s)"

describe("mat view create options", () => {
  it("TTL without PARTITION BY", () => {
    const mv = ok(`CREATE MATERIALIZED VIEW test ${q} TTL 12 HOURS`)
    expect(mv).toMatchObject({ ttl: { value: 12, unit: "HOURS" } })
    ok(`CREATE MATERIALIZED VIEW test ${q} TIMESTAMP(ts) TTL 1 MONTH`)
    expect(
      toSql(
        ok(`CREATE MATERIALIZED VIEW test ${q} PARTITION BY DAY TTL 3 DAYS`),
      ),
    ).toBe(`CREATE MATERIALIZED VIEW test ${q} PARTITION BY DAY TTL 3 DAYS`)
  })

  it("TTL with a one-letter unit", () => {
    expect(
      ok(`CREATE MATERIALIZED VIEW test ${q} PARTITION BY DAY TTL 2 h`),
    ).toMatchObject({ ttl: { value: 2, unit: "HOURS" } })
    expect(
      ok(
        "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 1 d",
      ),
    ).toMatchObject({ ttl: { value: 1, unit: "DAYS" } })
    ok(
      "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 1 M WAL",
    )
  })

  it("REFRESH without mode, DEFERRED, INCREMENTAL", () => {
    ok(`CREATE MATERIALIZED VIEW test REFRESH ${q}`)
    expect(
      ok(`CREATE MATERIALIZED VIEW test REFRESH DEFERRED ${q}`),
    ).toMatchObject({ refresh: { deferred: true } })
    ok(`CREATE MATERIALIZED VIEW test REFRESH DEFERRED PERIOD(LENGTH 1d) ${q}`)
    expect(
      ok(`CREATE MATERIALIZED VIEW test REFRESH INCREMENTAL ${q}`),
    ).toMatchObject({ refresh: { mode: "immediate" } })
    ok(
      `CREATE MATERIALIZED VIEW test REFRESH INCREMENTAL PERIOD(LENGTH 1d) ${q}`,
    )
    ok(`CREATE MATERIALIZED VIEW test REFRESH PERIOD(LENGTH 1d) ${q}`)
  })

  it("autocomplete", () => {
    const afterRefresh = getNextValidTokens(
      "CREATE MATERIALIZED VIEW v REFRESH ",
    )
    expect(afterRefresh).toEqual(
      expect.arrayContaining([
        "Immediate",
        "Manual",
        "Every",
        "Deferred",
        "Period",
        "As",
      ]),
    )
    expect(afterRefresh).not.toContain("Incremental")
    expect(getNextValidTokens(`CREATE MATERIALIZED VIEW v ${q} `)).toContain(
      "Ttl",
    )
  })
})
