// =============================================================================
// Autocomplete Provider
// =============================================================================
// Factory function that creates an autocomplete provider.
// This is the main entry point for UI integration.
//
// Usage in UI:
//   import { createAutocompleteProvider } from "@questdb/sql-parser";
//
//   const provider = createAutocompleteProvider({
//     tables: [{ name: "trades" }, { name: "orders" }],
//     columns: {
//       trades: [{ name: "symbol", type: "STRING" }, ...],
//       orders: [{ name: "id", type: "LONG" }, ...],
//     },
//   });
//
//   const suggestions = provider.getSuggestions("SELECT ", 7);
// =============================================================================

import type { IToken } from "chevrotain"
import { getContentAssist } from "./content-assist"
import { buildSuggestions } from "./suggestion-builder"
import { shouldSkipToken } from "./token-classification"
import type { AutocompleteProvider, SchemaInfo, Suggestion } from "./types"
import { SuggestionKind, SuggestionPriority } from "./types"

const TABLE_NAME_TOKENS = new Set([
  "From",
  "Join",
  "Asof",
  "Lt",
  "Splice",
  "Cross",
  "Into",
  "Update",
  "Table",
  "View",
])

function getLastSignificantTokens(tokens: IToken[]): string[] {
  const result: string[] = []
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tokenName = tokens[i]?.tokenType?.name
    if (!tokenName) continue
    if (shouldSkipToken(tokenName)) continue
    result.push(tokenName)
    if (result.length >= 2) {
      break
    }
  }
  return result
}

/**
 * Create an autocomplete provider with the given schema
 *
 * @param schema - Schema information (tables and columns)
 * @returns AutocompleteProvider instance
 *
 * @example
 * ```typescript
 * const provider = createAutocompleteProvider({
 *   tables: [{ name: "trades" }],
 *   columns: { trades: [{ name: "symbol", type: "STRING" }] },
 * });
 *
 * // Get suggestions after "SELECT "
 * const suggestions = provider.getSuggestions("SELECT  FROM trades", 7);
 * // suggestions will include "symbol" column from trades
 * ```
 */
export function createAutocompleteProvider(
  schema: SchemaInfo,
): AutocompleteProvider {
  // Normalize schema: lowercase table names for case-insensitive lookup
  const normalizedSchema: SchemaInfo = {
    tables: schema.tables,
    columns: Object.fromEntries(
      Object.entries(schema.columns).map(([tableName, cols]) => [
        tableName.toLowerCase(),
        cols,
      ]),
    ),
  }

  return {
    getSuggestions(query: string, cursorOffset: number): Suggestion[] {
      // Get content assist from parser
      const {
        nextTokenTypes,
        tablesInScope,
        cteColumns,
        tokensBefore,
        isMidWord,
        qualifiedTableRef,
        suggestColumns,
        suggestTables,
      } = getContentAssist(query, cursorOffset)

      // Merge CTE columns into the schema so getColumnsInScope() can find them
      const effectiveSchema =
        Object.keys(cteColumns).length > 0
          ? {
              ...normalizedSchema,
              columns: { ...normalizedSchema.columns, ...cteColumns },
            }
          : normalizedSchema

      // When mid-word, the last token in tokensBefore is a partial word
      // the user is still typing. It may have been captured as a table name
      // by extractTables (e.g., "FROM te" → {table: "te"}). Filter it out
      // to prevent suggesting the incomplete text back to the user.
      let effectiveTablesInScope = tablesInScope
      if (isMidWord && tokensBefore.length > 0) {
        const partialLower =
          tokensBefore[tokensBefore.length - 1].image.toLowerCase()
        const cteNameSet = new Set(Object.keys(cteColumns))
        const schemaLower = new Set(
          normalizedSchema.tables.map((t) => t.name.toLowerCase()),
        )
        effectiveTablesInScope = tablesInScope.filter((t) => {
          const lower = t.table.toLowerCase()
          return (
            lower !== partialLower ||
            cteNameSet.has(lower) ||
            schemaLower.has(lower)
          )
        })
      }

      // When the cursor is in a qualified reference (e.g., "t1." or "trades."),
      // resolve the qualifier against tablesInScope aliases/names and filter
      // so only that table's columns are suggested.
      if (qualifiedTableRef && effectiveTablesInScope.length > 1) {
        const qualifierLower = qualifiedTableRef.toLowerCase()
        const matched = effectiveTablesInScope.filter(
          (t) =>
            t.alias?.toLowerCase() === qualifierLower ||
            t.table.toLowerCase() === qualifierLower,
        )
        if (matched.length > 0) {
          effectiveTablesInScope = matched
        }
      }

      // If parser returned valid next tokens, use grammar-based classification
      if (nextTokenTypes.length > 0) {
        return buildSuggestions(
          nextTokenTypes,
          effectiveSchema,
          effectiveTablesInScope,
          {
            includeColumns: suggestColumns,
            includeTables: suggestTables,
            isMidWord,
          },
        )
      }

      // Fallback: when Chevrotain returns no suggestions (malformed SQL like
      // "SELECT FROM |" where columns are missing), check if the cursor follows
      // a table-introducing keyword. If so, suggest table names directly.
      const fallbackTokens =
        isMidWord && tokensBefore.length > 0
          ? tokensBefore.slice(0, -1)
          : tokensBefore
      const [lastFallback] = getLastSignificantTokens(fallbackTokens)
      if (lastFallback && TABLE_NAME_TOKENS.has(lastFallback)) {
        const suggestions: Suggestion[] = []
        const seen = new Set<string>()
        for (const table of effectiveSchema.tables) {
          seen.add(table.name.toLowerCase())
          suggestions.push({
            label: table.name,
            kind: SuggestionKind.Table,
            insertText: table.name,
            priority: SuggestionPriority.MediumLow,
          })
        }
        // Include CTE names not in the schema. Only add tablesInScope
        // entries that are known CTE names to avoid re-suggesting partial
        // table names from the token-extracted FROM/JOIN references.
        const cteNameSet = new Set(Object.keys(cteColumns))
        for (const ref of tablesInScope) {
          const lower = ref.table.toLowerCase()
          if (cteNameSet.has(lower) && !seen.has(lower)) {
            seen.add(lower)
            suggestions.push({
              label: ref.table,
              kind: SuggestionKind.Table,
              insertText: ref.table,
              priority: SuggestionPriority.MediumLow,
            })
          }
        }
        return suggestions
      }

      return []
    },
  }
}
