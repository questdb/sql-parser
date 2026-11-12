import { describe, expect, it } from "vitest"
import {
  createAutocompleteProvider,
  parseToAst,
  SuggestionKind,
} from "../src/index"

const provider = createAutocompleteProvider({
  tables: [{ name: "base" }, { name: "mv" }, { name: "unrelated" }],
  columns: {
    base: [
      { name: "ts", type: "TIMESTAMP" },
      { name: "k", type: "SYMBOL" },
      { name: "v", type: "DOUBLE" },
    ],
    mv: [
      { name: "bucket", type: "TIMESTAMP" },
      { name: "total", type: "DOUBLE" },
    ],
    unrelated: [{ name: "wrong", type: "INT" }],
  },
})

const suggestionsAt = (marked: string) => {
  const cursor = marked.indexOf("|")
  const sql = marked.replace("|", "")
  return provider.getSuggestions(sql, cursor)
}
const columnsAt = (marked: string) =>
  suggestionsAt(marked)
    .filter((s) => s.kind === SuggestionKind.Column)
    .map((s) => s.label)

describe("EXPIRE ROWS WHEN column scope", () => {
  it.each([
    "CREATE MATERIALIZED VIEW newmv AS (SELECT ts AS bucket, sum(v) AS total FROM base SAMPLE BY 1h) EXPIRE ROWS WHEN |total < 10 CLEANUP EVERY 1h",
    "CREATE MATERIALIZED VIEW newmv AS (SELECT ts AS bucket, sum(v) AS total FROM base SAMPLE BY 1h) EXPIRE ROWS WHEN abs(|total) < 10",
    "CREATE MATERIALIZED VIEW newmv AS (SELECT ts AS bucket, sum(v) AS total FROM base SAMPLE BY 1h) EXPIRE ROWS WHEN total > 0 AND |total < 10",
    "CREATE MATERIALIZED VIEW newmv AS (SELECT ts AS bucket, sum(v) AS total FROM base SAMPLE BY 1h) EXPIRE ROWS WHEN |",
  ])("uses CREATE output aliases rather than source columns: %s", (sql) => {
    expect(columnsAt(sql).sort()).toEqual(["bucket", "total"])
  })

  it.each([
    ["SELECT * FROM base", ["k", "ts", "v"]],
    ["SELECT b.* FROM base b", ["k", "ts", "v"]],
    [
      "WITH c AS (SELECT ts AS bucket, v AS total FROM base) SELECT c.* FROM c",
      ["bucket", "total"],
    ],
    [
      "SELECT * FROM (SELECT ts AS bucket, v AS total FROM base)",
      ["bucket", "total"],
    ],
  ])("expands query output for %s", (query, expected) => {
    const sql = `CREATE MATERIALIZED VIEW newmv AS (${query}) EXPIRE ROWS WHEN |true`
    expect(columnsAt(sql).sort()).toEqual(expected)
    expect(parseToAst(sql.replace("|", "")).errors).toEqual([])
  })

  it.each([
    "ALTER MATERIALIZED VIEW mv SET EXPIRE ROWS WHEN |total < 10",
    'ALTER MATERIALIZED VIEW "mv" SET EXPIRE ROWS WHEN abs(|total) < 10',
    "ALTER MATERIALIZED VIEW mv SET EXPIRE ROWS WHEN |",
    "ALTER MATERIALIZED VIEW 'mv' SET EXPIRE ROWS WHEN |total < 10",
    "ALTER MATERIALIZED VIEW `mv` SET EXPIRE ROWS WHEN |total < 10",
  ])("uses the ALTER target and excludes unrelated tables: %s", (sql) => {
    expect(columnsAt(sql).sort()).toEqual(["bucket", "total"])
  })

  it("keeps expression functions without suggesting table placeholders", () => {
    const suggestions = suggestionsAt(
      "CREATE MATERIALIZED VIEW newmv AS (SELECT ts, sum(v) AS total FROM base SAMPLE BY 1h) EXPIRE ROWS WHEN |total < 10",
    )
    const prefix =
      "CREATE MATERIALIZED VIEW newmv AS (SELECT ts, sum(v) AS total FROM base SAMPLE BY 1h) EXPIRE ROWS WHEN "
    expect(
      suggestionsAt(`${prefix}a|bs(total) < 10`).map((s) => s.label),
    ).toContain("abs")
    expect(suggestionsAt(`${prefix}n|ow() > ts`).map((s) => s.label)).toContain(
      "now",
    )
    expect(suggestions.filter((s) => s.kind === SuggestionKind.Table)).toEqual(
      [],
    )
  })

  it("does not fall back to unrelated columns for an unknown output or target", () => {
    expect(
      columnsAt(
        "CREATE MATERIALIZED VIEW newmv AS (SELECT * FROM read_parquet('x')) EXPIRE ROWS WHEN |true",
      ),
    ).toEqual([])
    expect(
      columnsAt("ALTER MATERIALIZED VIEW missing SET EXPIRE ROWS WHEN |true"),
    ).toEqual([])
  })

  it("preserves ordinary SELECT column scope", () => {
    expect(columnsAt("SELECT |v FROM base").sort()).toEqual(["k", "ts", "v"])
  })

  it("does not replace a predicate subquery's own column scope", () => {
    const columns = columnsAt(
      "CREATE MATERIALIZED VIEW newmv AS (SELECT ts, v AS total FROM base) EXPIRE ROWS WHEN total IN (SELECT |wrong FROM unrelated)",
    )
    expect(columns).toContain("wrong")
    expect(columns).not.toContain("total")
  })
})
