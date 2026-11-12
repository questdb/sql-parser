/**
 * Index type / parquet option names accepted by the server as single words
 * (IndexType.valueOf, ParquetEncoding, ParquetCompression) and the PG type
 * aliases of ColumnType.nameTypeMap (highlighting / autocomplete).
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import { dataTypes } from "../src/grammar/dataTypes"
import { keywords } from "../src/grammar/keywords"

const ok = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

const ALIASES = [
  "text",
  "smallint",
  "bigint",
  "real",
  "bytea",
  "regclass",
  "regprocedure",
]

describe("option names", () => {
  it("POSTING_DELTA / POSTING_EF index types", () => {
    ok("ALTER TABLE t ALTER COLUMN s ADD INDEX TYPE POSTING_DELTA")
    ok("ALTER TABLE t ALTER COLUMN s ADD INDEX TYPE posting_ef")
    ok("CREATE TABLE t (s SYMBOL INDEX TYPE POSTING_DELTA, ts TIMESTAMP)")
    ok("ALTER TABLE t ALTER COLUMN s ADD INDEX TYPE POSTING DELTA")
  })

  it("parquet encodings and codecs", () => {
    ok("ALTER TABLE x ALTER COLUMN e SET PARQUET(plain, default)")
    ok("ALTER TABLE x ALTER COLUMN e SET PARQUET(byte_stream_split, zstd(3))")
    ok("copy t to 'o' with format parquet compression_codec default")
    expect(
      getNextValidTokens("ALTER TABLE x ALTER COLUMN e SET PARQUET("),
    ).toContain("ByteStreamSplit")
  })

  it("type aliases are data types and identifiers", () => {
    for (const t of ALIASES) expect(dataTypes).toContain(t)
    for (const t of ALIASES) {
      expect(toSql(ok(`SELECT x::${t} FROM t`))).toBe(
        `SELECT x::${t.toUpperCase()} FROM t`,
      )
      ok(`SELECT CAST(x AS ${t}) FROM t`)
      ok(`CREATE TABLE t (a ${t}, ts TIMESTAMP)`)
      // still usable as names
      ok(`SELECT ${t}, ${t}.${t} FROM ${t} WHERE ${t} > 0`)
      ok(`CREATE TABLE ${t} (${t} INT)`)
    }
    expect(toSql(ok("SELECT ARRAY[1, 2] AS array FROM t"))).toBe(
      "SELECT ARRAY[1, 2] AS array FROM t",
    )
    ok("SELECT array, ARRAY[[1.0], [2.0]] FROM array")
    ok("SELECT x::text[] FROM t")
    expect(getNextValidTokens("SELECT CAST(x AS ")).toContain("Bigint")
  })

  it("classifies ARRAY as a constructor keyword rather than a data type", () => {
    expect(dataTypes).not.toContain("array")
    expect(keywords).toContain("array")
    ok("SELECT CAST(ARRAY[1.0, 2.0] AS DOUBLE[])")
    ok("SELECT ARRAY[[1.0], [2.0]]::DOUBLE[][]")
    ok("CREATE TABLE array (array DOUBLE[])")
  })
})
