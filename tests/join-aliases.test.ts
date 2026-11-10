/**
 * Join forms where a clause word follows the joined table directly
 * (server tableAliasStop: TOLERANCE, RANGE; EXCLUDE/INCLUDE PREVAILING),
 * HORIZON JOIN with an optional alias / sub-query target / `+` offsets,
 * and UNNEST column aliases without a table alias.
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

describe("join aliases", () => {
  it("TOLERANCE / RANGE / EXCLUDE right after the joined table", () => {
    const sel = ok("SELECT * FROM a ASOF JOIN b TOLERANCE 10s")
    expect(sel.from![0].joins![0].table.alias).toBeUndefined()
    roundTrip(
      "SELECT * FROM a WINDOW JOIN p RANGE BETWEEN 1 MINUTE PRECEDING AND CURRENT ROW EXCLUDE PREVAILING",
      "SELECT * FROM a WINDOW JOIN p RANGE BETWEEN 1 MINUTE PRECEDING AND CURRENT ROW EXCLUDE PREVAILING",
    )
    // the words still work as explicit aliases and identifiers
    ok("SELECT * FROM a ASOF JOIN b AS tolerance TOLERANCE 10s")
    ok("SELECT tolerance, range FROM t")
    expect(ok("SELECT * FROM t exclude").from![0].alias).toBe("exclude")
  })

  it("HORIZON JOIN alias optional, sub-query target, + offsets", () => {
    const sel = ok(
      "SELECT * FROM t HORIZON JOIN quotes ON (sym) LIST (1s, 5s) AS h",
    )
    const join = sel.from![0].joins![0]
    expect(join.table.alias).toBeUndefined()
    expect(join.horizonAlias).toBe("h")
    roundTrip(
      "SELECT * FROM t HORIZON JOIN (quotes WHERE x > 0) q ON (sym) LIST (0s, 1s) AS h",
      "SELECT * FROM t HORIZON JOIN (quotes WHERE x > 0) AS q ON (sym) LIST (0s, 1s) AS h",
    )
    roundTrip(
      "SELECT * FROM t HORIZON JOIN q RANGE FROM -1m TO +1m STEP 1m AS h",
      "SELECT * FROM t HORIZON JOIN q RANGE FROM -1m TO +1m STEP 1m AS h",
    )
    roundTrip(
      "SELECT * FROM t HORIZON JOIN q AS x LIST (+1s) AS h",
      "SELECT * FROM t HORIZON JOIN q AS x LIST (+1s) AS h",
    )
  })

  it("UNNEST column aliases without a table alias", () => {
    const sel = ok("SELECT * FROM UNNEST(ARRAY[1.0,2.0]) (v)")
    expect(sel.from![0].alias).toBeUndefined()
    expect(sel.from![0].columnAliases).toEqual(["v"])
    roundTrip(
      "SELECT * FROM UNNEST(ARRAY[1.0, 2.0]) u(v)",
      "SELECT * FROM UNNEST(ARRAY[1.0, 2.0]) AS u(v)",
    )
  })
})
