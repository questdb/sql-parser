/**
 * Column suggestions in DEDUP KEYS(...) and EXPIRE ROWS KEEP ... ON /
 * PARTITION BY (PR #42 audit): these slots used a bare identifier, which
 * autocomplete reads as "a new name", so it offered nothing.
 */
import { describe, it, expect } from "vitest"
import { createAutocompleteProvider, parseToAst } from "../src/index"

const provider = createAutocompleteProvider({
  tables: [{ name: "trades" }],
  columns: {
    trades: [
      { name: "ts", type: "TIMESTAMP" },
      { name: "sym", type: "SYMBOL" },
      { name: "price", type: "DOUBLE" },
    ],
  },
})
const labels = (sql: string) =>
  provider.getSuggestions(sql, sql.length).map((s) => s.label)

describe("key column slots suggest columns", () => {
  it.each([
    "ALTER TABLE trades DEDUP ENABLE UPSERT KEYS( ",
    "ALTER TABLE trades DEDUP SKIP KEYS(ts, ",
    "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM trades) EXPIRE ROWS KEEP HIGHEST ON ",
    "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM trades) EXPIRE ROWS KEEP 2 LOWEST ON price PARTITION BY ",
    "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM trades) EXPIRE ROWS KEEP LATEST ON ",
    "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM trades) EXPIRE ROWS KEEP LATEST PARTITION BY ",
  ])("%s", (sql) => {
    const l = labels(sql)
    expect(l).toEqual(expect.arrayContaining(["ts", "sym", "price"]))
    // a name-only slot: no tables or functions
    expect(l).not.toContain("trades")
  })

  it("keeps the AST shape", () => {
    const create = parseToAst(
      "CREATE TABLE t (ts TIMESTAMP, s SYMBOL) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS(ts, s)",
    ).ast[0] as unknown as { dedupKeys: string[]; dedupMode: string }
    expect(create.dedupKeys).toEqual(["ts", "s"])
    expect(create.dedupMode).toBe("skip")
    const mv = parseToAst(
      "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM trades) EXPIRE ROWS KEEP 2 HIGHEST ON price PARTITION BY sym",
    )
    expect(mv.errors).toEqual([])
    expect(JSON.stringify(mv.ast[0])).toContain('"price"')
    expect(JSON.stringify(mv.ast[0])).toContain('"sym"')
  })
})

// PR #42 follow-up review: the key-column slots resolve names against the
// object being defined, not against the global schema or the base table.
describe("key column scope", () => {
  const base = createAutocompleteProvider({
    tables: [{ name: "base" }, { name: "unrelated" }],
    columns: {
      base: [
        { name: "k", type: "SYMBOL" },
        { name: "v", type: "DOUBLE" },
        { name: "ts", type: "TIMESTAMP" },
      ],
      unrelated: [{ name: "other", type: "INT" }],
    },
  })
  const l = (sql: string) =>
    base.getSuggestions(sql, sql.length).map((s) => s.label)

  it.each([
    "CREATE MATERIALIZED VIEW mv AS (SELECT k AS output_k, v AS output_v, ts FROM base) EXPIRE ROWS KEEP HIGHEST ON ",
    "CREATE MATERIALIZED VIEW mv AS (SELECT k AS output_k, v AS output_v, ts FROM base) EXPIRE ROWS KEEP HIGHEST ON output_v PARTITION BY ",
  ])("MV retention uses the view's output columns: %s", (sql) => {
    const labels = l(sql)
    expect(labels).toEqual(
      expect.arrayContaining(["output_k", "output_v", "ts"]),
    )
    expect(labels).not.toContain("k")
    expect(labels).not.toContain("v")
    expect(labels).not.toContain("other")
  })

  it("MV with SELECT * offers the base table's columns", () => {
    const labels = l(
      "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM base) EXPIRE ROWS KEEP HIGHEST ON ",
    )
    expect(labels).toEqual(expect.arrayContaining(["k", "v", "ts"]))
    expect(labels).not.toContain("other")
  })

  it("CREATE TABLE DEDUP KEYS offers the declared columns only", () => {
    const labels = l(
      "CREATE TABLE t (local_ts TIMESTAMP, local_sym SYMBOL) TIMESTAMP(local_ts) PARTITION BY DAY WAL DEDUP SKIP KEYS( ",
    )
    expect(labels).toEqual(expect.arrayContaining(["local_ts", "local_sym"]))
    expect(labels).not.toContain("other")
    expect(labels).not.toContain("k")
  })

  it("ALTER TABLE DEDUP KEYS keeps the target table's columns", () => {
    const labels = l("ALTER TABLE base DEDUP ENABLE UPSERT KEYS( ")
    expect(labels).toEqual(expect.arrayContaining(["k", "v", "ts"]))
    expect(labels).not.toContain("other")
  })

  it("ALTER MATERIALIZED VIEW uses the view's columns", () => {
    const p = createAutocompleteProvider({
      tables: [{ name: "mv" }, { name: "unrelated" }],
      columns: {
        mv: [{ name: "output_v", type: "DOUBLE" }],
        unrelated: [{ name: "other", type: "INT" }],
      },
    })
    const sql = "ALTER MATERIALIZED VIEW mv SET EXPIRE ROWS KEEP HIGHEST ON "
    const labels = p.getSuggestions(sql, sql.length).map((s) => s.label)
    expect(labels).toContain("output_v")
    expect(labels).not.toContain("other")
  })
})

// PR #42 review: resolve the output columns of CTAS and nested queries.
describe("key column scope: CTAS and nested queries", () => {
  const p = createAutocompleteProvider({
    tables: [{ name: "base" }, { name: "other" }],
    columns: {
      base: [
        { name: "k", type: "SYMBOL" },
        { name: "v", type: "DOUBLE" },
        { name: "ts", type: "TIMESTAMP" },
      ],
      other: [{ name: "wrong", type: "INT" }],
    },
  })
  const l = (sql: string) =>
    p.getSuggestions(sql, sql.length).map((s) => s.label)

  it("CTAS with aliases offers the query's output names", () => {
    const labels = l(
      "CREATE TABLE out AS (SELECT ts, k AS output_k FROM base) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS( ",
    )
    expect(labels).toEqual(expect.arrayContaining(["ts", "output_k"]))
    expect(labels).not.toContain("k")
    expect(labels).not.toContain("v")
    expect(labels).not.toContain("wrong")
  })

  it("CTAS over a bare table offers that table's columns", () => {
    const labels = l(
      "CREATE TABLE out AS (base) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS( ",
    )
    expect(labels).toEqual(expect.arrayContaining(["ts", "v", "k"]))
    expect(labels).not.toContain("base")
    expect(labels).not.toContain("wrong")
  })

  it.each([
    "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM (SELECT k AS out_k, v AS out_v, ts FROM base)) EXPIRE ROWS KEEP HIGHEST ON ",
    "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM (SELECT k AS out_k, v AS out_v, ts FROM base)) EXPIRE ROWS KEEP HIGHEST ON out_v PARTITION BY ",
  ])("SELECT * over a sub-query uses its output names: %s", (sql) => {
    const labels = l(sql)
    expect(labels).toEqual(expect.arrayContaining(["ts", "out_v", "out_k"]))
    expect(labels).not.toContain("k")
    expect(labels).not.toContain("v")
  })
})

// PR #42 follow-up review: JOIN sources, qualified stars, comma sources and
// CTEs in the defining query; no global fallback in a known key slot.
describe("key column scope: joins, qualified stars and CTEs", () => {
  const p = createAutocompleteProvider({
    tables: [{ name: "base" }, { name: "other" }, { name: "third" }],
    columns: {
      base: [
        { name: "k", type: "SYMBOL" },
        { name: "v", type: "DOUBLE" },
        { name: "ts", type: "TIMESTAMP" },
      ],
      other: [{ name: "wrong", type: "INT" }],
      third: [{ name: "unrelated", type: "INT" }],
    },
  })
  const l = (sql: string) =>
    p.getSuggestions(sql, sql.length).map((s) => s.label)
  const ctas = (q: string) =>
    `CREATE TABLE out AS (${q}) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP SKIP KEYS( `

  it.each([
    [
      "SELECT * FROM base CROSS JOIN other",
      ["ts", "v", "k", "wrong"],
      ["unrelated"],
    ],
    [
      "SELECT b.ts, o.* FROM base b CROSS JOIN other o",
      ["ts", "wrong"],
      ["v", "k", "unrelated"],
    ],
    [
      "SELECT b.* FROM base b, other o",
      ["ts", "v", "k"],
      ["wrong", "unrelated"],
    ],
    [
      "WITH c AS (SELECT * FROM (SELECT k AS out_k, ts FROM base)) SELECT * FROM c",
      ["ts", "out_k"],
      ["k", "v", "wrong", "unrelated"],
    ],
    [
      "WITH c AS (SELECT k AS a FROM base) SELECT c.* FROM c",
      ["a"],
      ["k", "wrong"],
    ],
  ])("%s", (query, present, absent) => {
    const labels = l(ctas(query))
    expect(labels).toEqual(expect.arrayContaining(present))
    for (const name of absent) expect(labels).not.toContain(name)
  })

  it("offers nothing rather than every schema column when the output is unknown", () => {
    const labels = l(ctas("SELECT * FROM read_parquet('x.parquet')"))
    expect(labels).not.toContain("wrong")
    expect(labels).not.toContain("unrelated")
  })
})
