import { describe, it, expect } from "vitest"
import { createAutocompleteProvider } from "../src/autocomplete"

// These tests exercise the path-count budget in budgeted-content-assist.ts.
// Each input is a case where no complete parse path exists, so Chevrotain's
// EXIT_ALTERNATIVE pruning never activates and the DFS fans out exponentially
// in the size of the select list. Without the budget, each of these would
// hang the UI; with it, they abort in well under a second and return empty
// suggestions (the correct answer when there's no syntactic continuation).

describe("autocomplete — path-count budget regression tests", () => {
  const schema = {
    tables: [{ name: "trades" }, { name: "orders" }],
    columns: {
      trades: [
        { name: "symbol", type: "STRING" },
        { name: "price", type: "DOUBLE" },
        { name: "timestamp", type: "TIMESTAMP" },
      ],
      orders: [
        { name: "id", type: "LONG" },
        { name: "user_id", type: "LONG" },
      ],
    },
  }
  const provider = createAutocompleteProvider(schema)

  // Each pathological SQL body is parameterised by how many aggregate items
  // precede the malformed tail. Growth is ~2-4x per item; n=12-15 is already
  // multi-second without the budget.
  const aggItems = (n: number): string =>
    Array(n)
      .fill(0)
      .map((_, i) => `avg(price) a${i}`)
      .join(", ")

  it("survives unbalanced extra closing parens on a big select list", () => {
    // Direct analogue of the original bug report's tail shape (a subquery
    // that closes with more ")" than it opens). Raw Chevrotain at n=15 runs
    // ~7.7s.
    const sql = `SELECT ${aggItems(15)} FROM trades)))`

    const start = performance.now()
    const suggestions = provider.getSuggestions(sql, sql.length)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(Array.isArray(suggestions)).toBe(true)
  })

  it("survives an unsupported JOIN ... USING (col) clause", () => {
    // USING is standard SQL but not in QuestDB's grammar — join conditions
    // go through ON only. Raw Chevrotain on n=12 runs ~1.9s.
    const sql = `SELECT ${aggItems(12)} FROM trades a JOIN orders b USING (id)`

    const start = performance.now()
    const suggestions = provider.getSuggestions(sql, sql.length)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(Array.isArray(suggestions)).toBe(true)
  })

  it("survives stray trailing semicolons inside a statement", () => {
    // `SELECT ... FROM t;;;;` — the first `;` ends the statement, but the
    // extra ones have no grammar home and keep the outer `statements` MANY
    // from closing cleanly. Exercises the budget at relatively small n.
    const sql = `SELECT ${aggItems(10)} FROM trades;;;;`

    const start = performance.now()
    const suggestions = provider.getSuggestions(sql, sql.length)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(1000)
    expect(Array.isArray(suggestions)).toBe(true)
  })

  it("stays fast on a large well-formed query (budget headroom)", () => {
    // A syntactically valid query with 50 aggregate select items, a WHERE
    // clause, SAMPLE BY, and ORDER BY. Pruning is active because the parse
    // completes, so the DFS stays linear and the 500k budget should never
    // be approached. Guards against shrinking the budget or adding grammar
    // forks that would push valid queries past it.
    const items = Array(50)
      .fill(0)
      .map((_, i) => `count(CASE WHEN symbol = 'S${i}' THEN 1 END) as col${i}`)
      .join(", ")
    const sql = `SELECT ${items} FROM trades WHERE symbol = 'X' SAMPLE BY 1h ORDER BY timestamp`

    const start = performance.now()
    const suggestions = provider.getSuggestions(sql, sql.length)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(200)
    expect(suggestions.length).toBeGreaterThan(0)
  })
})
