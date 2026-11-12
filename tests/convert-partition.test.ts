/**
 * ALTER TABLE .. CONVERT PARTITION TO PARQUET|NATIVE LIST .. [WITH (..)]
 * (SqlCompilerImpl: target first, then LIST | WHERE).
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

describe("convert partition", () => {
  it("LIST after the target", () => {
    const stmt = ok(
      "ALTER TABLE t CONVERT PARTITION TO PARQUET LIST '2024-01-01', '2024-01-02' WITH (bloom_filter_columns = 'id', fpp = 0.01)",
    )
    expect(stmt).toMatchObject({
      action: {
        target: "PARQUET",
        partitions: ["2024-01-01", "2024-01-02"],
      },
    })
    expect(toSql(stmt)).toBe(
      "ALTER TABLE t CONVERT PARTITION TO PARQUET LIST '2024-01-01', '2024-01-02' WITH (bloom_filter_columns = 'id', fpp = 0.01)",
    )
  })

  it("existing forms still parse", () => {
    expect(
      toSql(ok("ALTER TABLE t CONVERT PARTITION LIST '2024-01-01' TO PARQUET")),
    ).toBe("ALTER TABLE t CONVERT PARTITION LIST '2024-01-01' TO PARQUET")
    ok("ALTER TABLE t CONVERT PARTITION TO NATIVE WHERE ts > 0")
  })

  it("autocomplete", () => {
    expect(
      getNextValidTokens("ALTER TABLE t CONVERT PARTITION TO PARQUET "),
    ).toEqual(expect.arrayContaining(["List", "Where", "With"]))
  })
})
