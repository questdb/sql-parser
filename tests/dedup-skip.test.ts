/**
 * DEDUP UPSERT | SKIP KEYS, the DEDUPLICATE synonym, ALTER TABLE DEDUP
 * without ENABLE (questdb/questdb#7885, reports §1.2).
 *
 * Server grammar (SqlParser CREATE TABLE dedup block,
 * SqlCompilerImpl.alterTableDedupEnable and the ALTER TABLE dedup branch):
 *   CREATE TABLE ... WAL (DEDUP | DEDUPLICATE) (UPSERT | SKIP) KEYS(col, ...)
 *     [FORMAT PARQUET | NATIVE] [OWNED BY ...]
 *   ALTER TABLE t (DEDUP | DEDUPLICATE) DISABLE
 *   ALTER TABLE t (DEDUP | DEDUPLICATE) [ENABLE] (UPSERT | SKIP) KEYS(col, ...)
 * `skip` and `deduplicate` are not reserved words on the server.
 *
 * Server queries for this feature live in tests/fixtures/server-queries.json.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const parseOne = (sql: string): AST.Statement => {
  const result = parseToAst(sql)
  expect(result.errors.map((e) => e.message)).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

/** true when sql is rejected or does not read as a single statement */
const rejected = (sql: string) => {
  const result = parseToAst(sql)
  return result.errors.length > 0 || result.ast.length !== 1
}

const CREATE =
  "CREATE TABLE t (ts TIMESTAMP, s SYMBOL) TIMESTAMP(ts) PARTITION BY DAY WAL"

describe("CREATE TABLE dedup mode", () => {
  it.each([
    [`${CREATE} DEDUP UPSERT KEYS(ts, s)`, "upsert"],
    [`${CREATE} DEDUP SKIP KEYS(ts, s)`, "skip"],
    [`${CREATE} DEDUPLICATE UPSERT KEYS(ts, s)`, "upsert"],
    [`${CREATE} DEDUPLICATE SKIP KEYS(ts, s)`, "skip"],
  ])("%s", (sql, mode) => {
    const stmt = parseOne(sql) as AST.CreateTableStatement
    expect(stmt.type).toBe("createTable")
    expect(stmt.dedupKeys).toEqual(["ts", "s"])
    expect(stmt.dedupMode).toBe(mode)
  })

  it("has no dedupMode without a DEDUP clause", () => {
    const stmt = parseOne(CREATE) as AST.CreateTableStatement
    expect(stmt.dedupKeys).toBeUndefined()
    expect(stmt.dedupMode).toBeUndefined()
  })

  it.each([
    [`${CREATE} DEDUP SKIP KEYS(ts, s)`, `${CREATE} DEDUP SKIP KEYS(ts, s)`],
    [`${CREATE} DEDUP UPSERT KEYS(ts)`, `${CREATE} DEDUP UPSERT KEYS(ts)`],
    [`${CREATE} DEDUPLICATE SKIP KEYS(ts)`, `${CREATE} DEDUP SKIP KEYS(ts)`],
    [`${CREATE} dedup skip keys(ts)`, `${CREATE} DEDUP SKIP KEYS(ts)`],
    [
      `${CREATE} DEDUP SKIP KEYS(ts) FORMAT PARQUET`,
      `${CREATE} FORMAT PARQUET DEDUP SKIP KEYS(ts)`,
    ],
    [
      `${CREATE} DEDUPLICATE SKIP KEYS(ts) FORMAT PARQUET OWNED BY bob`,
      `${CREATE} FORMAT PARQUET DEDUP SKIP KEYS(ts) OWNED BY bob`,
    ],
    [
      "CREATE TABLE t AS (SELECT * FROM x) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS(ts) FORMAT PARQUET",
      // FORMAT position is not tracked; toSql prints it before DEDUP
      "CREATE TABLE t AS (SELECT * FROM x) TIMESTAMP(ts) PARTITION BY DAY WAL FORMAT PARQUET DEDUP SKIP KEYS(ts)",
    ],
  ])("round trips %s", (sql, expected) => {
    const result = parseToAst(sql)
    expect(result.errors.map((e) => e.message)).toEqual([])
    expect(result.ast).toHaveLength(1)
    expect(toSql(result.ast)).toBe(expected)
    const again = parseToAst(expected)
    expect(again.errors).toEqual([])
    expect(toSql(again.ast)).toBe(expected)
  })

  it("keeps the CTAS dedup mode", () => {
    const stmt = parseOne(
      "CREATE TABLE t AS (SELECT * FROM x) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS(ts) FORMAT PARQUET",
    ) as AST.CreateTableStatement
    expect(stmt.dedupMode).toBe("skip")
    expect(stmt.dedupKeys).toEqual(["ts"])
    expect(stmt.tableFormat).toBe("parquet")
  })
})

describe("ALTER TABLE dedup", () => {
  const action = (sql: string) =>
    (parseOne(sql) as AST.AlterTableStatement).action

  it.each([
    ["ALTER TABLE t DEDUP ENABLE UPSERT KEYS (ts, s)", "upsert"],
    ["ALTER TABLE t DEDUP ENABLE SKIP KEYS (ts, s)", "skip"],
    ["ALTER TABLE t DEDUP UPSERT KEYS(ts, s)", "upsert"],
    ["ALTER TABLE t DEDUP SKIP KEYS(ts, s)", "skip"],
    ["ALTER TABLE t DEDUPLICATE ENABLE SKIP KEYS(ts, s)", "skip"],
    ["ALTER TABLE t DEDUPLICATE UPSERT KEYS(ts, s)", "upsert"],
  ])("%s", (sql, mode) => {
    expect(action(sql)).toEqual({
      actionType: "dedupEnable",
      keys: ["ts", "s"],
      dedupMode: mode,
    })
  })

  it.each(["ALTER TABLE t DEDUP DISABLE", "ALTER TABLE t DEDUPLICATE DISABLE"])(
    "%s",
    (sql) => {
      expect(action(sql)).toEqual({ actionType: "dedupDisable" })
      expect(toSql(parseToAst(sql).ast)).toBe("ALTER TABLE t DEDUP DISABLE")
    },
  )

  it.each([
    [
      "ALTER TABLE t DEDUP SKIP KEYS(ts, s)",
      "ALTER TABLE t DEDUP ENABLE SKIP KEYS (ts, s)",
    ],
    [
      "ALTER TABLE t DEDUP UPSERT KEYS(ts)",
      "ALTER TABLE t DEDUP ENABLE UPSERT KEYS (ts)",
    ],
    [
      "ALTER TABLE t DEDUPLICATE ENABLE SKIP KEYS(ts)",
      "ALTER TABLE t DEDUP ENABLE SKIP KEYS (ts)",
    ],
    [
      "ALTER TABLE t DEDUP ENABLE SKIP KEYS (ts)",
      "ALTER TABLE t DEDUP ENABLE SKIP KEYS (ts)",
    ],
  ])("round trips %s", (sql, expected) => {
    expect(toSql(parseToAst(sql).ast)).toBe(expected)
    expect(toSql(parseToAst(expected).ast)).toBe(expected)
  })
})

describe("rejected dedup forms", () => {
  it.each([
    // CreateTableDedupTest: server errors
    "alter table a dedup enable skipped keys(ts)",
    "alter table a dedup skip (ts)",
    "ALTER TABLE t DEDUP ENABLE KEYS(ts)",
    "ALTER TABLE t DEDUP KEYS(ts)",
    `${CREATE} DEDUP KEYS(ts)`,
    `${CREATE} DEDUP SKIP (ts)`,
    `${CREATE} DEDUPLICATE KEYS(ts)`,
    `${CREATE} DEDUP ENABLE SKIP KEYS(ts)`,
  ])("%s", (sql) => {
    expect(rejected(sql)).toBe(true)
  })
})

describe("skip and deduplicate stay usable as identifiers", () => {
  it.each([
    "SELECT skip FROM t",
    "SELECT deduplicate FROM t",
    "SELECT skip, deduplicate FROM skip",
    "CREATE TABLE skip (skip INT, deduplicate INT, ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS(ts, skip)",
    "CREATE TABLE deduplicate (ts TIMESTAMP)",
    "SELECT * FROM t WHERE skip > 0",
    "ALTER TABLE skip DEDUP DISABLE",
    "ALTER TABLE t DEDUP ENABLE SKIP KEYS (ts, skip)",
  ])("%s", (sql) => {
    const stmt = parseToAst(sql)
    expect(stmt.errors.map((e) => e.message)).toEqual([])
    expect(stmt.ast).toHaveLength(1)
    expect(toSql(stmt.ast)).toBe(sql)
  })
})

describe("autocomplete", () => {
  it.each([`${CREATE} DEDUP `, `${CREATE} DEDUPLICATE `])(
    "offers UPSERT and SKIP after: %s",
    (sql) => {
      expect([...getNextValidTokens(sql)].sort()).toEqual(["Skip", "Upsert"])
    },
  )

  it.each(["ALTER TABLE t DEDUP ", "ALTER TABLE t DEDUPLICATE "])(
    "offers ENABLE, DISABLE, UPSERT and SKIP after: %s",
    (sql) => {
      expect([...getNextValidTokens(sql)].sort()).toEqual([
        "Disable",
        "Enable",
        "Skip",
        "Upsert",
      ])
    },
  )

  it("offers UPSERT and SKIP after ALTER TABLE t DEDUP ENABLE", () => {
    expect(
      [...getNextValidTokens("ALTER TABLE t DEDUP ENABLE ")].sort(),
    ).toEqual(["Skip", "Upsert"])
  })

  it("offers KEYS after SKIP", () => {
    expect(getNextValidTokens(`${CREATE} DEDUP SKIP `)).toEqual(["Keys"])
    expect(getNextValidTokens("ALTER TABLE t DEDUP SKIP ")).toEqual(["Keys"])
  })

  it("offers DEDUP and DEDUPLICATE after WAL in CREATE TABLE", () => {
    const tokens = getNextValidTokens(`${CREATE} `)
    expect(tokens).toContain("Dedup")
    expect(tokens).toContain("Deduplicate")
  })

  it("does not offer SKIP or DEDUPLICATE at statement start or after SELECT", () => {
    for (const sql of ["", "SELECT ", "SELECT a FROM t "]) {
      const tokens = getNextValidTokens(sql)
      expect(tokens).not.toContain("Deduplicate")
      expect(tokens).not.toContain("Skip")
    }
  })
})
