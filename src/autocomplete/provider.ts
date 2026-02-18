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
import {
  shouldSkipToken,
  IDENTIFIER_KEYWORD_TOKENS,
} from "./token-classification"
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
 * Tokens that signal the end of an expression / value. When these appear as
 * the raw last token before the cursor, the cursor is in alias or keyword
 * position — NOT column position. e.g., "SELECT symbol |" → alias position.
 */
const EXPRESSION_END_TOKENS = new Set([
  "Identifier",
  "QuotedIdentifier",
  "RParen",
  "NumberLiteral",
  "LongLiteral",
  "DecimalLiteral",
  "StringLiteral",
])

function isExpressionEnd(tokenName: string): boolean {
  return (
    EXPRESSION_END_TOKENS.has(tokenName) ||
    IDENTIFIER_KEYWORD_TOKENS.has(tokenName)
  )
}

function getIdentifierSuggestionScope(
  lastTokenName?: string,
  prevTokenName?: string,
  rawLastTokenName?: string,
  rawPrevTokenName?: string,
): {
  includeColumns: boolean
  includeTables: boolean
} {
  // Expression-end tokens indicate alias / post-expression position.
  // e.g., "SELECT symbol |" or "FROM trades |" — no columns expected.
  if (rawLastTokenName && isExpressionEnd(rawLastTokenName)) {
    return { includeColumns: false, includeTables: false }
  }

  // Star (*) is context-dependent: it's a wildcard after SELECT/comma/LParen,
  // but multiplication after an expression (identifier, number, rparen).
  // "SELECT * |"      → wildcard, suppress columns (alias/keyword position)
  // "SELECT price * |" → multiplication, suggest columns for RHS
  if (rawLastTokenName === "Star") {
    if (rawPrevTokenName && isExpressionEnd(rawPrevTokenName)) {
      // Multiplication: previous token is an expression-end, so * is an operator.
      // The user needs columns/functions for the right-hand side.
      return { includeColumns: true, includeTables: true }
    }
    // Wildcard: no expression before *, e.g., SELECT *, t.*, or start of expression
    return { includeColumns: false, includeTables: false }
  }

  // After AS keyword: either subquery start (WITH name AS (|) or alias (SELECT x AS |).
  if (lastTokenName === "As") {
    // "WITH name AS (|" → LParen is raw last → subquery start, suggest tables
    if (rawLastTokenName === "LParen") {
      return { includeColumns: false, includeTables: true }
    }
    // "SELECT x AS |" → alias position
    return { includeColumns: false, includeTables: false }
  }

  if (prevTokenName && TABLE_NAME_TOKENS.has(prevTokenName)) {
    return { includeColumns: false, includeTables: true }
  }
  if (lastTokenName && TABLE_NAME_TOKENS.has(lastTokenName)) {
    return { includeColumns: false, includeTables: true }
  }
  // At statement start (no significant tokens before cursor), only suggest
  // tables and keywords, not columns. Identifier is valid here only because
  // of PIVOT syntax (e.g., "trades PIVOT (...)"), not for column references.
  if (!lastTokenName) {
    return { includeColumns: false, includeTables: true }
  }
  return { includeColumns: true, includeTables: true }
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

      // If parser returned valid next tokens, use them
      if (nextTokenTypes.length > 0) {
        // When mid-word, the last token in tokensBefore is the partial word being typed.
        // For scope detection, we need the tokens BEFORE that partial word.
        const tokensForScope =
          isMidWord && tokensBefore.length > 0
            ? tokensBefore.slice(0, -1)
            : tokensBefore
        const [lastTokenName, prevTokenName] =
          getLastSignificantTokens(tokensForScope)
        const rawLastTokenName =
          tokensForScope.length > 0
            ? tokensForScope[tokensForScope.length - 1]?.tokenType?.name
            : undefined
        const rawPrevTokenName =
          tokensForScope.length > 1
            ? tokensForScope[tokensForScope.length - 2]?.tokenType?.name
            : undefined
        const scope = getIdentifierSuggestionScope(
          lastTokenName,
          prevTokenName,
          rawLastTokenName,
          rawPrevTokenName,
        )
        return buildSuggestions(
          nextTokenTypes,
          effectiveSchema,
          effectiveTablesInScope,
          { ...scope, isMidWord },
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
