/**
 * Duration literals (reports §2 X5, §3.1):
 *   - a duration ends at a word boundary. The server lexer reads `1hour`,
 *     `1days`, `1sec` as ONE token and rejects it (SampleByTest:250
 *     "Invalid unit: 1hour", AlterTableO3MaxLagTest:363 "interval qualifier",
 *     SqlParser.parseTtlHoursOrMonths "invalid time unit"). sql-parser used to
 *     split them into a duration plus a second statement (`1h; our`).
 *   - the `ns` unit (SqlUtil.expectMicros accepts s, m, ms, h, d, us, ns;
 *     SqlUtilTest:829 `expectMicros("1000ns")`).
 *
 * Valid server queries are guarded in tests/fixtures/server-queries.json
 * (feature "duration-boundary").
 */

import { describe, it, expect } from "vitest"
import { parseToAst, tokenize } from "../src/index"
import { toSql } from "../src/parser/toSql"

const tokenTypes = (sql: string) =>
  tokenize(sql).tokens.map((t) => `${t.tokenType.name}:${t.image}`)

const roundTrip = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return toSql(result.ast)
}

const expectError = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors.length).toBeGreaterThan(0)
}

describe("lexer", () => {
  it.each([
    "1h",
    "30m",
    "1M",
    "1y",
    "100T",
    "1U",
    "1n",
    "1_000T",
    "2W",
    "12H",
    "1.5d",
    "1ms",
    "1us",
    "100ns",
    "5_600ns",
    "2Y",
    "2D",
    "1000000000n",
  ])("reads %s as one duration token", (d) => {
    expect(tokenTypes(d)).toEqual([`DurationLiteral:${d}`])
  })

  it("ends a duration before punctuation", () => {
    expect(tokenTypes("1h)")).toEqual(["DurationLiteral:1h", "RParen:)"])
    expect(tokenTypes("1h,")).toEqual(["DurationLiteral:1h", "Comma:,"])
    expect(tokenTypes("100ns;")).toEqual([
      "DurationLiteral:100ns",
      "Semicolon:;",
    ])
  })

  it.each([
    "1hour",
    "1days",
    "1sec",
    "1min",
    "100nsx",
    "111ml",
    "1.5hour",
    "1_000days",
    "6h30m",
    "1hé",
  ])("reads %s as one malformed duration, not a duration and a word", (w) => {
    expect(tokenTypes(w)).toEqual([`MalformedDurationLiteral:${w}`])
  })

  it("keeps numbers glued to non-duration letters (geohash, memory sizes)", () => {
    expect(tokenTypes("8c")).toEqual(["NumberLiteral:8", "Identifier:c"])
    expect(tokenTypes("5b")).toEqual(["NumberLiteral:5", "Identifier:b"])
    expect(tokenTypes("1G")).toEqual(["NumberLiteral:1", "Identifier:G"])
    expect(tokenTypes("64K")).toEqual(["NumberLiteral:64", "Identifier:K"])
  })

  it("keeps other numeric literals", () => {
    expect(tokenTypes("1e5")).toEqual(["NumberLiteral:1e5"])
    expect(tokenTypes("1.5")).toEqual(["NumberLiteral:1.5"])
    expect(tokenTypes("1_000_000")).toEqual(["NumberLiteral:1_000_000"])
    expect(tokenTypes("100L")).toEqual(["LongLiteral:100L"])
    expect(tokenTypes("10.5m")).toEqual(["DecimalLiteral:10.5m"])
    expect(tokenTypes("1.5f")).toEqual(["FloatLiteral:1.5f"])
  })
})

describe("ns unit", () => {
  it("parses o3MaxLag in nanoseconds", () => {
    expect(roundTrip("ALTER TABLE t SET PARAM o3MaxLag = 100ns")).toBe(
      "ALTER TABLE t SET PARAM o3MaxLag = 100ns",
    )
    expect(
      roundTrip(
        "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WITH o3MaxLag=1000ns",
      ),
    ).toBe(
      "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WITH o3MaxLag = 1000ns",
    )
    expect(
      roundTrip("INSERT BATCH 100 o3MaxLag 500ns INTO x SELECT * FROM y"),
    ).toBe("INSERT BATCH 100 o3MaxLag 500ns INTO x SELECT * FROM y")
  })
})

describe("invalid units are errors, not a second statement", () => {
  it.each([
    // SampleByTest:250 / :262 ("Invalid unit: 1hour" / "1min")
    "select b, sum(a), k from x sample by 1hour",
    "select b, sum(a), k from x sample by 1min",
    // AlterTableO3MaxLagTest:363 / :370 ("interval qualifier")
    "ALTER TABLE X SET PARAM o3MaxLag = 111days",
    "ALTER TABLE X SET PARAM o3MaxLag = 111ml",
    "ALTER TABLE t SET PARAM o3MaxLag = 1sec",
    "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WITH o3MaxLag=1sec",
    // parseTtlHoursOrMonths: "invalid time unit"
    "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 1days",
    "ALTER TABLE t SET TTL 1hours",
    "ALTER TABLE t SET TTL 1_000days",
    "INSERT BATCH 100 o3MaxLag 3days INTO x SELECT * FROM y",
    "SELECT * FROM a ASOF JOIN b TOLERANCE 1hour",
    "SELECT 1hour",
    "SELECT 1.5hour",
  ])("%s", (sql) => {
    expectError(sql)
  })

  it("long-form TTL with a space still parses", () => {
    expect(
      roundTrip(
        "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 1 DAYS",
      ),
    ).toBe(
      "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 1 DAY",
    )
    expect(roundTrip("ALTER TABLE t SET TTL 12 HOURS")).toBe(
      "ALTER TABLE t SET TTL 12 HOURS",
    )
  })

  it("geohash precision and memory sizes still parse", () => {
    expect(roundTrip("CREATE TABLE t (g GEOHASH(8c), h GEOHASH(5b))")).toBe(
      "CREATE TABLE t (g GEOHASH(8c), h GEOHASH(5b))",
    )
    expect(roundTrip("ALTER USER u SET MEMORY LIMIT 64K")).toBe(
      "ALTER USER u SET MEMORY LIMIT 64K",
    )
    expect(roundTrip("ALTER USER u SET MEMORY LIMIT 512M")).toBe(
      "ALTER USER u SET MEMORY LIMIT 512M",
    )
  })
})
