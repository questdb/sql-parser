/**
 * Documentation SQL - Autocomplete Walkthrough Tests
 *
 * For each SQL statement from docs-queries.json, tokenizes it and walks
 * through token-by-token, verifying that at each position the autocomplete
 * provider's getSuggestions() includes the actual next word as a suggestion.
 *
 * This tests the REAL end-to-end autocomplete behavior that users see.
 *
 * Per-query schema extraction:
 * 1. Parse the query with parseToAst() to get the AST
 * 2. Walk the AST to extract table names and column definitions
 * 3. Create a provider with the extracted schema
 * 4. Walk token-by-token, checking that each keyword and known identifier
 *    appears in the suggestion list
 *
 * Queries with skipAutocomplete: true are known edge cases (implicit SELECT,
 * SQL hints, semicolons, array slice colon syntax).
 *
 * Source of truth: tests/fixtures/docs-queries.json
 */

import { describe, it } from "vitest"
import { parseToAst } from "../src/index"
import {
  autocompleteWalkthrough,
  buildSchema,
  extractSchemaFromAst,
} from "./helpers/autocomplete-walkthrough"
import * as fs from "fs"
import * as path from "path"

interface DocsQuery {
  query: string
  skipAutocomplete?: boolean
}

const fixtureP = path.join(__dirname, "fixtures", "docs-queries.json")
const queries: DocsQuery[] = JSON.parse(
  fs.readFileSync(fixtureP, "utf-8"),
) as DocsQuery[]

// =============================================================================
// Test setup
// =============================================================================

const testable = queries
  .map((q, i) => ({ ...q, index: i }))
  .filter((q) => !q.skipAutocomplete)

describe("Documentation SQL - Autocomplete Walkthrough", () => {
  describe("token-by-token autocomplete", () => {
    it.each(
      testable.map((q) => [
        `#${q.index}: ${q.query.substring(0, 60).replace(/\n/g, " ")}`,
        q,
      ]),
    )("%s", (_label, entry) => {
      const q = entry as DocsQuery & { index: number }

      // Extract schema from AST
      const parseResult = parseToAst(q.query)
      const extracted = extractSchemaFromAst(parseResult.ast)
      const schema = buildSchema(extracted)

      const result = autocompleteWalkthrough(q.query, schema)

      if (!result.success) {
        return
      }

      if (result.failedSteps.length > 0) {
        const failures = result.failedSteps
          .slice(0, 3)
          .map(
            (s) =>
              `  At offset ${s.position}: expected "${s.expectedLabel}" (from token "${s.tokenImage}" [${s.tokenType}]) ` +
              `not found in suggestions [${s.suggestions.join(", ")}${s.suggestions.length >= 15 ? "..." : ""}]`,
          )
          .join("\n")

        throw new Error(
          `Autocomplete walkthrough failed for #${q.index} (${result.failedSteps.length} failures):\n${failures}\n\nSQL: ${q.query.substring(0, 120)}`,
        )
      }
    })
  })
})
