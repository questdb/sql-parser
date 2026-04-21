// =============================================================================
// Suggestion Builder
// =============================================================================
// Converts parser token types to autocomplete suggestions.
// This is the SINGLE SOURCE OF TRUTH for suggestion building - the UI should
// NOT duplicate this logic.
// =============================================================================

import { TokenType } from "chevrotain"
import {
  Suggestion,
  SuggestionKind,
  SuggestionPriority,
  SchemaInfo,
  ColumnInfo,
} from "./types"
import {
  SKIP_TOKENS,
  PUNCTUATION_TOKENS,
  tokenNameToKeyword,
} from "./token-classification"
import {
  scalarFunctions,
  aggregateFunctions,
  windowFunctions,
  tableValuedFunctions,
} from "../grammar/index"
import type { TableRef } from "./content-assist"

/**
 * Column with table context for detailed suggestions
 */
interface ColumnWithTable extends ColumnInfo {
  tableName: string
  tableAlias?: string
}

/**
 * Get columns from tables in scope
 */
function getColumnsInScope(
  tablesInScope: TableRef[],
  schema: SchemaInfo,
): ColumnWithTable[] {
  const columns: ColumnWithTable[] = []

  for (const tableRef of tablesInScope) {
    // Look up columns by table name (case-insensitive)
    const tableNameLower = tableRef.table.toLowerCase()
    const tableColumns = schema.columns[tableNameLower] ?? []

    for (const col of tableColumns) {
      columns.push({
        ...col,
        tableName: tableRef.table,
        tableAlias: tableRef.alias,
      })
    }
  }

  return columns
}

/**
 * Get all columns from schema (when no tables in scope)
 */
function getAllColumns(schema: SchemaInfo): ColumnWithTable[] {
  const columns: ColumnWithTable[] = []

  for (const [tableName, tableColumns] of Object.entries(schema.columns)) {
    for (const col of tableColumns) {
      columns.push({
        ...col,
        tableName,
      })
    }
  }

  return columns
}

/**
 * Join prefix tokens → compound keyword.
 * When "Join" is among the valid next tokens, these prefixes are combined
 * into compound suggestions (e.g., "Left" → "LEFT JOIN") instead of
 * suggesting bare "LEFT" which is incomplete on its own.
 */
// Keywords that are valid but rarely the primary intent — suggest at MediumLow.
const MEDIUM_LOW_KEYWORDS = new Set(["Unnest"])

const JOIN_COMPOUND_MAP = new Map<string, string>([
  ["Left", "LEFT JOIN"],
  ["Inner", "INNER JOIN"],
  ["Cross", "CROSS JOIN"],
  ["Asof", "ASOF JOIN"],
  ["Lt", "LT JOIN"],
  ["Splice", "SPLICE JOIN"],
  ["Window", "WINDOW JOIN"],
  ["Horizon", "HORIZON JOIN"],
  ["Outer", "OUTER JOIN"],
])

/**
 * Build suggestions from parser's nextTokenTypes
 *
 * @param tokenTypes - Valid next tokens from parser.computeContentAssist()
 * @param schema - Schema information (tables, columns)
 * @param tablesInScope - Tables found in the query
 * @returns Array of suggestions
 */
export function buildSuggestions(
  tokenTypes: TokenType[],
  schema: SchemaInfo,
  tablesInScope: TableRef[],
  options?: {
    includeColumns?: boolean
    includeTables?: boolean
    includeScalarFunctions?: boolean
    includeAggregateFunctions?: boolean
    includeWindowFunctions?: boolean
    includeTableValuedFunctions?: boolean
    isMidWord?: boolean
  },
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const seenKeywords = new Set<string>()
  let expectsIdentifier = false
  const includeColumns = options?.includeColumns ?? true
  const includeTables = options?.includeTables ?? true
  // Function category flags default to false — context-driven emission means
  // no suggestions unless the caller (content-assist.ts) explicitly opts in
  // based on the position's PositionKind.
  const includeScalarFunctions = options?.includeScalarFunctions ?? false
  const includeAggregateFunctions = options?.includeAggregateFunctions ?? false
  const includeWindowFunctions = options?.includeWindowFunctions ?? false
  const includeTableValuedFunctions =
    options?.includeTableValuedFunctions ?? false
  const isMidWord = options?.isMidWord ?? false

  // Detect join context: when "Join" is a valid next token, join prefix
  // keywords (LEFT, RIGHT, ASOF, etc.) should be suggested as compounds.
  const isJoinContext = tokenTypes.some((t) => t.name === "Join")

  // Process each token type from the parser
  for (const tokenType of tokenTypes) {
    const name = tokenType.name

    // Skip internal tokens (operators, literals, punctuation)
    if (SKIP_TOKENS.has(name)) {
      continue
    }

    // IdentifierKeyword means the parser's `identifier` rule is active,
    // so column/table names are expected. Bare Identifier/QuotedIdentifier
    // alone (e.g., for custom type names) should not trigger schema suggestions.
    if (name === "IdentifierKeyword") {
      expectsIdentifier = true
      continue
    }
    if (name === "Identifier" || name === "QuotedIdentifier") {
      continue
    }

    // In join context, combine join prefix tokens into compound keywords
    // (e.g., "Left" → "LEFT JOIN") instead of suggesting bare "LEFT".
    if (isJoinContext && JOIN_COMPOUND_MAP.has(name)) {
      const compound = JOIN_COMPOUND_MAP.get(name)!
      if (seenKeywords.has(compound)) continue
      seenKeywords.add(compound)
      suggestions.push({
        label: compound,
        kind: SuggestionKind.Keyword,
        insertText: compound,
        filterText: compound.toLowerCase(),
        priority: SuggestionPriority.Medium,
      })
      continue
    }

    // Convert token name to keyword display string
    const keyword = tokenNameToKeyword(name)

    // Skip duplicates
    if (seenKeywords.has(keyword)) {
      continue
    }
    seenKeywords.add(keyword)

    // All parser keyword tokens are keywords (not functions).
    // Functions are suggested separately in the functions loop below.
    const kind = SuggestionKind.Keyword

    // Some keywords are valid but rarely typed directly — suggest them lower.
    const priority = MEDIUM_LOW_KEYWORDS.has(name)
      ? SuggestionPriority.MediumLow
      : SuggestionPriority.Medium

    suggestions.push({
      label: keyword,
      kind,
      insertText: keyword,
      filterText: keyword.toLowerCase(),
      priority,
    })
  }

  // If identifier is expected, add columns and tables
  if (expectsIdentifier) {
    // Get columns: prefer tables in scope (FROM, JOIN), fall back to all columns.
    // Also fall back when tables are in scope but none have known columns
    // (e.g., FROM read_parquet(...) — function call, not a schema table).
    const scopedColumns =
      tablesInScope.length > 0 ? getColumnsInScope(tablesInScope, schema) : []
    const columnsInScope = includeColumns
      ? scopedColumns.length > 0
        ? scopedColumns
        : getAllColumns(schema)
      : []

    // Add columns with HIGH priority (they should appear first).
    // When a column name appears from multiple distinct aliased table refs
    // (e.g., self-join: trades t1 JOIN trades t2), emit alias-qualified
    // suggestions (e.g., "t1.amount", "t2.amount") to avoid ambiguity.
    // Otherwise, emit a single bare column name.
    if (includeColumns) {
      // Group columns by name, collecting each source (alias/table + type).
      const columnMap = new Map<
        string,
        {
          sources: {
            qualifier: string
            type: string
            hasAlias: boolean
          }[]
        }
      >()
      for (const col of columnsInScope) {
        const qualifier = col.tableAlias ?? col.tableName
        const existing = columnMap.get(col.name)
        if (existing) {
          // Only add if this qualifier is new (avoid duplicates from same alias)
          if (!existing.sources.some((s) => s.qualifier === qualifier)) {
            existing.sources.push({
              qualifier,
              type: col.type,
              hasAlias: !!col.tableAlias,
            })
          }
        } else {
          columnMap.set(col.name, {
            sources: [
              { qualifier, type: col.type, hasAlias: !!col.tableAlias },
            ],
          })
        }
      }
      for (const [colName, info] of columnMap) {
        // Only qualify when there are multiple sources and at least one has
        // an explicit alias. This covers self-joins (trades t1 JOIN trades t2)
        // without qualifying columns from unrelated CTEs that happen to share
        // column names.
        const needsQualification =
          info.sources.length > 1 && info.sources.some((s) => s.hasAlias)
        if (needsQualification) {
          // Ambiguous: emit one qualified suggestion per source
          for (const source of info.sources) {
            const qualified = `${source.qualifier}.${colName}`
            suggestions.unshift({
              label: qualified,
              kind: SuggestionKind.Column,
              insertText: qualified,
              detail: ` (${source.qualifier})`,
              description: source.type,
              filterText: colName,
              priority: SuggestionPriority.High,
            })
          }
        } else {
          // Unambiguous: emit bare column name
          const source = info.sources[0]
          suggestions.unshift({
            label: colName,
            kind: SuggestionKind.Column,
            insertText: colName,
            detail: ` (${source.qualifier})`,
            description: source.type,
            priority: SuggestionPriority.High,
          })
        }
      }
    }

    // Add functions per category. Only mid-word so we don't flood empty
    // positions (e.g. just-typed "SELECT " with no prefix). The category
    // include flags are derived from PositionKind in content-assist:
    //   - expression           → scalar + aggregate + window
    //   - restrictedExpression → scalar only (WHERE / GROUP BY / JOIN ON /
    //                            SET RHS / VALUES / DECLARE assignment)
    //   - tableSource          → tableValued
    //   - tableName / numeric  → none
    if (isMidWord) {
      const emitFn = (name: string) => {
        if (seenKeywords.has(name.toUpperCase())) return
        suggestions.push({
          label: name,
          kind: SuggestionKind.Function,
          insertText: name,
          priority: SuggestionPriority.Low,
        })
      }
      if (includeScalarFunctions) {
        for (const fn of scalarFunctions) emitFn(fn)
      }
      if (includeAggregateFunctions) {
        for (const fn of aggregateFunctions) emitFn(fn)
      }
      if (includeWindowFunctions) {
        for (const fn of windowFunctions) emitFn(fn)
      }
      if (includeTableValuedFunctions) {
        for (const fn of tableValuedFunctions) emitFn(fn)
      }
    }

    // Add tables with MEDIUM-LOW priority (lower than columns).
    if (includeTables) {
      for (const table of schema.tables) {
        suggestions.push({
          label: table.name,
          kind: SuggestionKind.Table,
          insertText: table.name,
          priority: SuggestionPriority.MediumLow,
        })
      }

      // Add tables from query scope (CTEs, etc.) that aren't in the schema
      const seenTableNames = new Set(
        schema.tables.map((t) => t.name.toLowerCase()),
      )
      for (const ref of tablesInScope) {
        const lower = ref.table.toLowerCase()
        if (!seenTableNames.has(lower)) {
          seenTableNames.add(lower)
          suggestions.push({
            label: ref.table,
            kind: SuggestionKind.Table,
            insertText: ref.table,
            priority: SuggestionPriority.MediumLow,
          })
        }
      }
    }
  }

  // Fallback: when no keyword/identifier suggestions were produced, check if the
  // parser expected punctuation tokens (e.g., "(" after "VALUES (1), ").
  // Suggest those so Monaco doesn't fall back to junk word-based completions.
  if (suggestions.length === 0 && !expectsIdentifier) {
    for (const tokenType of tokenTypes) {
      const name = tokenType.name
      if (!PUNCTUATION_TOKENS.has(name)) continue
      const display = tokenNameToKeyword(name)
      suggestions.push({
        label: display,
        kind: SuggestionKind.Keyword,
        insertText: display,
        filterText: display.toLowerCase(),
        priority: SuggestionPriority.Low,
      })
    }
  }

  return suggestions
}
