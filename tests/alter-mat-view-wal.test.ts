/**
 * ALTER MATERIALIZED VIEW .. SUSPEND WAL [WITH <code|'tag'>, '<message>']
 * (SqlCompilerImpl.parseSuspendWal, shared with tables).
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

describe("ALTER MATERIALIZED VIEW SUSPEND WAL WITH", () => {
  it("parses and round-trips", () => {
    const stmt = ok("ALTER MATERIALIZED VIEW mv SUSPEND WAL WITH 24, 'msg'")
    expect(stmt).toMatchObject({
      action: { actionType: "suspendWal", code: 24, message: "msg" },
    })
    expect(toSql(stmt)).toBe(
      "ALTER MATERIALIZED VIEW mv SUSPEND WAL WITH 24, 'msg'",
    )
    expect(
      toSql(
        ok("ALTER MATERIALIZED VIEW mv SUSPEND WAL WITH 'DISK FULL', 'oops'"),
      ),
    ).toBe("ALTER MATERIALIZED VIEW mv SUSPEND WAL WITH 'DISK FULL', 'oops'")
    expect(toSql(ok("ALTER MATERIALIZED VIEW mv SUSPEND WAL"))).toBe(
      "ALTER MATERIALIZED VIEW mv SUSPEND WAL",
    )
  })

  it("autocomplete", () => {
    expect(
      getNextValidTokens("ALTER MATERIALIZED VIEW mv SUSPEND WAL "),
    ).toContain("With")
  })
})
