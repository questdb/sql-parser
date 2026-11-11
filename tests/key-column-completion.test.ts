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
