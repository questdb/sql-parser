import { describe, expect, it } from "vitest"
import { createAutocompleteProvider, parseToAst } from "../src/index"

const provider = createAutocompleteProvider({ tables: [], columns: {} })
const labelsAt = (marked: string) => {
  const cursor = marked.indexOf("|")
  return provider
    .getSuggestions(marked.replace("|", ""), cursor)
    .map((s) => s.label)
}

// Enterprise rejects storage policies on materialized views. Accepting these
// statements remains useful for old SQL, but completion should guide users to
// features that the current server supports.
describe("materialized view storage policy completion", () => {
  it.each([
    "CREATE MATERIALIZED VIEW mv AS (SELECT ts, sum(v) AS total FROM base SAMPLE BY 1h) PARTITION BY DAY |EXPIRE ROWS WHEN total < 10",
    "ALTER MATERIALIZED VIEW mv |SET TTL 1d",
    "ALTER MATERIALIZED VIEW mv SET |TTL 1d",
    "ALTER MATERIALIZED VIEW mv DROP |EXPIRE ROWS",
    "ALTER MATERIALIZED VIEW mv ENABLE |STORAGE POLICY",
    "ALTER MATERIALIZED VIEW mv DISABLE |STORAGE POLICY",
    "ALTER MATERIALIZED VIEW mv DROP STORAGE |POLICY",
    "ALTER MATERIALIZED VIEW mv SET STORAGE |POLICY(TO REMOTE 1d)",
  ])("omits unsupported storage policy syntax: %s", (sql) => {
    const labels = labelsAt(sql)
    for (const word of ["STORAGE", "POLICY", "ENABLE", "DISABLE"])
      expect(labels).not.toContain(word)
  })

  it("retains supported materialized-view alternatives", () => {
    expect(labelsAt("ALTER MATERIALIZED VIEW mv |SET TTL 1d")).toEqual(
      expect.arrayContaining(["ALTER", "SET", "RESUME", "SUSPEND", "DROP"]),
    )
    expect(labelsAt("ALTER MATERIALIZED VIEW mv SET |TTL 1d")).toEqual(
      expect.arrayContaining(["TTL", "REFRESH", "EXPIRE"]),
    )
    expect(labelsAt("ALTER MATERIALIZED VIEW mv DROP |EXPIRE ROWS")).toContain(
      "EXPIRE",
    )
  })

  it.each([
    "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY |STORAGE POLICY(TO REMOTE 1d)",
    "ALTER TABLE t SET |STORAGE POLICY(TO REMOTE 1d)",
    "ALTER TABLE t DROP |STORAGE POLICY",
    "ALTER TABLE t ENABLE |STORAGE POLICY",
    "ALTER TABLE t DISABLE |STORAGE POLICY",
  ])("preserves table storage policy completion: %s", (sql) => {
    expect(labelsAt(sql)).toContain("STORAGE")
  })

  it("preserves parsing old materialized-view storage policy SQL", () => {
    for (const sql of [
      "CREATE MATERIALIZED VIEW mv AS (SELECT ts, sum(v) AS total FROM base SAMPLE BY 1h) PARTITION BY DAY STORAGE POLICY(TO REMOTE 1d)",
      "ALTER MATERIALIZED VIEW mv SET STORAGE POLICY(TO REMOTE 1d)",
      "ALTER MATERIALIZED VIEW mv DROP STORAGE POLICY",
      "ALTER MATERIALIZED VIEW mv ENABLE STORAGE POLICY",
      "ALTER MATERIALIZED VIEW mv DISABLE STORAGE POLICY",
    ]) {
      const parsed = parseToAst(sql)
      expect(parsed.errors, sql).toEqual([])
      expect(parsed.ast, sql).toHaveLength(1)
    }
  })
})
