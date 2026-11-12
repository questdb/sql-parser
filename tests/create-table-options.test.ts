/**
 * CREATE TABLE / ALTER TABLE column modifiers ignored by the server
 * (`[PRECISION] [NOT] NULL`), CTAS `CAST(col AS SYMBOL [CAPACITY n]
 * [CACHE|NOCACHE])` and CAST/INDEX clauses in any order.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"

const ok = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

describe("create table options", () => {
  it("[PRECISION] [NOT] NULL after column types", () => {
    ok(
      "CREATE TABLE t (a INT NOT NULL, b STRING NULL, ts TIMESTAMP) TIMESTAMP(ts)",
    )
    ok(
      "CREATE TABLE t (a DOUBLE PRECISION NOT NULL, b VARCHAR PARQUET(PLAIN) NULL)",
    )
    ok("CREATE TABLE t (a INT PRECISION NULL, b LONG)")
    ok("ALTER TABLE t ADD COLUMN a INT NOT NULL, b STRING NULL")
    ok("ALTER TABLE t ALTER COLUMN x TYPE VARCHAR NULL")
    ok("ALTER TABLE t ALTER COLUMN x TYPE VARCHAR NOT NULL")
  })

  it("CTAS cast symbol options and CAST/INDEX in any order", () => {
    const stmt = ok(
      "CREATE TABLE t AS (SELECT * FROM x), INDEX(s), CAST(a AS LONG), CAST(s AS SYMBOL CAPACITY 64 CACHE)",
    ) as { casts?: unknown[]; indexes?: unknown[] }
    expect(stmt.casts).toHaveLength(2)
    expect(stmt.casts![1]).toMatchObject({
      dataType: "SYMBOL",
      symbolCapacity: 64,
      cache: true,
    })
    expect(stmt.indexes).toHaveLength(1)
  })

  it("autocomplete", () => {
    const afterType = getNextValidTokens("CREATE TABLE t (a INT ")
    expect(afterType).toContain("Not")
    expect(afterType).toContain("Null")
    expect(afterType).not.toContain("Precision")
    expect(getNextValidTokens("CREATE TABLE t (a DOUBLE ")).toContain(
      "Precision",
    )
    const afterSym = getNextValidTokens(
      "CREATE TABLE t AS (SELECT * FROM x), CAST(s AS SYMBOL ",
    )
    expect(afterSym).toContain("Capacity")
    expect(afterSym).toContain("Nocache")
    expect(
      getNextValidTokens("CREATE TABLE t AS (SELECT * FROM x), INDEX(s), "),
    ).toContain("Cast")
  })
})
