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

import { getContentAssist } from "./content-assist";
import { buildSuggestions } from "./suggestion-builder";
import { shouldSkipToken } from "./token-classification";
import type { AutocompleteProvider, SchemaInfo, Suggestion } from "./types";

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
]);

function getLastSignificantTokens(tokens: any[]): string[] {
  const result: string[] = [];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const tokenName = tokens[i]?.tokenType?.name;
    if (!tokenName) continue;
    if (shouldSkipToken(tokenName)) continue;
    result.push(tokenName);
    if (result.length >= 2) {
      break;
    }
  }
  return result;
}
function getIdentifierSuggestionScope(lastTokenName?: string, prevTokenName?: string): {
  includeColumns: boolean;
  includeTables: boolean;
} {
  if (prevTokenName && TABLE_NAME_TOKENS.has(prevTokenName)) {
    return { includeColumns: false, includeTables: true };
  }
  if (lastTokenName && TABLE_NAME_TOKENS.has(lastTokenName)) {
    return { includeColumns: false, includeTables: true };
  }
  // At statement start (no significant tokens before cursor), only suggest
  // tables and keywords, not columns. Identifier is valid here only because
  // of PIVOT syntax (e.g., "trades PIVOT (...)"), not for column references.
  if (!lastTokenName) {
    return { includeColumns: false, includeTables: true };
  }
  return { includeColumns: true, includeTables: true };
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
  schema: SchemaInfo
): AutocompleteProvider {
  // Normalize schema: lowercase table names for case-insensitive lookup
  const normalizedSchema: SchemaInfo = {
    tables: schema.tables,
    columns: Object.fromEntries(
      Object.entries(schema.columns).map(([tableName, cols]) => [
        tableName.toLowerCase(),
        cols,
      ])
    ),
  };

  return {
    getSuggestions(query: string, cursorOffset: number): Suggestion[] {
      // Get content assist from parser
      const { nextTokenTypes, tablesInScope, tokensBefore, isMidWord } = getContentAssist(
        query,
        cursorOffset
      );

      // If parser returned valid next tokens, use them
      if (nextTokenTypes.length > 0) {
        // When mid-word, the last token in tokensBefore is the partial word being typed.
        // For scope detection, we need the tokens BEFORE that partial word.
        const tokensForScope = isMidWord && tokensBefore.length > 0
          ? tokensBefore.slice(0, -1)
          : tokensBefore;
        const [lastTokenName, prevTokenName] = getLastSignificantTokens(tokensForScope);
        const scope = getIdentifierSuggestionScope(lastTokenName, prevTokenName);
        return buildSuggestions(
          nextTokenTypes,
          normalizedSchema,
          tablesInScope,
          { ...scope, isMidWord }
        );
      }

      return [];
    },
  };
}
