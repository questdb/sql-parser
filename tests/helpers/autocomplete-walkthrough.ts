/**
 * Shared autocomplete walkthrough used by the docs and server-query suites.
 *
 * For a SQL string, tokenizes it and walks token-by-token, checking that at
 * each position the provider's getSuggestions() includes the actual next word
 * (keywords, and known table/column names in reference positions). Literals,
 * punctuation and operators are skipped (SKIP_TOKEN_TYPES).
 *
 * Moved verbatim from tests/docs-autocomplete.test.ts.
 */
import {
  tokenize,
  createAutocompleteProvider,
  getNextValidTokens,
} from "../../src/index"
import type { SchemaInfo } from "../../src/autocomplete/types"
import type * as AST from "../../src/parser/ast"
import {
  tokenNameToKeyword,
  IDENTIFIER_KEYWORD_TOKENS,
} from "../../src/autocomplete/token-classification"

// =============================================================================
// Schema extraction from AST
// =============================================================================

export interface ExtractedSchema {
  tables: Set<string>
  columns: Map<string, Set<string>> // tableName → column names
}

/**
 * Extract table and column names from a parsed AST.
 * Walks all nodes recursively to find table references and column definitions.
 */
export function extractSchemaFromAst(
  statements: AST.Statement[],
): ExtractedSchema {
  const tables = new Set<string>()
  const columns = new Map<string, Set<string>>()

  function addColumn(table: string, col: string) {
    const lower = table.toLowerCase()
    if (!columns.has(lower)) columns.set(lower, new Set())
    columns.get(lower)!.add(col)
  }

  function getTableName(name: AST.QualifiedName): string {
    return name.parts[name.parts.length - 1]
  }

  function walkNode(node: unknown): void {
    if (!node || typeof node !== "object") return
    const n = node as Record<string, unknown>

    // Handle arrays
    if (Array.isArray(node)) {
      for (const item of node) walkNode(item)
      return
    }

    const type = n.type as string | undefined

    // TableRef: extract table name from FROM/JOIN
    if (type === "tableRef") {
      const ref = node as AST.TableRef
      if (
        ref.table &&
        (ref.table as AST.QualifiedName).type === "qualifiedName"
      ) {
        const name = getTableName(ref.table as AST.QualifiedName)
        tables.add(name)
      }
      // Recurse into joins
      if (ref.joins) walkNode(ref.joins)
      // Recurse into subqueries
      if (ref.table && (ref.table as AST.SelectStatement).type === "select") {
        walkNode(ref.table)
      }
      return
    }

    // JoinClause: extract table from joined table
    if (type === "join") {
      const join = node as AST.JoinClause
      walkNode(join.table)
      if (join.on) walkNode(join.on)
      return
    }

    // CreateTable: extract table name and column definitions
    if (type === "createTable") {
      const ct = node as AST.CreateTableStatement
      const tableName = getTableName(ct.table)
      tables.add(tableName)
      if (ct.columns) {
        for (const col of ct.columns) {
          addColumn(tableName, col.name)
        }
      }
      if (ct.asSelect) walkNode(ct.asSelect)
      if (ct.like) tables.add(getTableName(ct.like))
      return
    }

    // InsertStatement: extract table name and column names
    if (type === "insert") {
      const ins = node as AST.InsertStatement
      const tableName = getTableName(ins.table)
      tables.add(tableName)
      if (ins.columns) {
        for (const col of ins.columns) {
          addColumn(tableName, col)
        }
      }
      if (ins.select) walkNode(ins.select)
      return
    }

    // SelectStatement: recurse into all parts
    if (type === "select") {
      const sel = node as AST.SelectStatement
      if (sel.from) walkNode(sel.from)
      if (sel.columns) walkNode(sel.columns)
      if (sel.where) walkNode(sel.where)
      if (sel.with) {
        for (const cte of sel.with) {
          if (cte.name) tables.add(cte.name)
          if (cte.query) walkNode(cte.query)
        }
      }
      if (sel.groupBy) walkNode(sel.groupBy)
      if (sel.orderBy) walkNode(sel.orderBy)
      if (sel.sampleBy) walkNode(sel.sampleBy)
      if (sel.latestOn) walkNode(sel.latestOn)
      if (sel.declare) walkNode(sel.declare)
      return
    }

    // AlterTable: extract table name
    if (type === "alterTable") {
      const alt = node as AST.AlterTableStatement
      tables.add(getTableName(alt.table))
      return
    }

    // UpdateStatement: extract table name
    if (type === "update") {
      const upd = node as AST.UpdateStatement
      tables.add(getTableName(upd.table))
      if (upd.from) walkNode(upd.from)
      if (upd.where) walkNode(upd.where)
      return
    }

    // For all other node types, recurse into all object/array properties
    for (const value of Object.values(n)) {
      if (value && typeof value === "object") {
        walkNode(value)
      }
    }
  }

  for (const stmt of statements) {
    walkNode(stmt)
  }

  return { tables, columns }
}

/**
 * Build a SchemaInfo from extracted table/column data
 */
export function buildSchema(extracted: ExtractedSchema): SchemaInfo {
  const tableList = Array.from(extracted.tables).map((name) => ({ name }))
  const columnsMap: Record<string, { name: string; type: string }[]> = {}

  for (const [tableName, cols] of extracted.columns) {
    columnsMap[tableName] = Array.from(cols).map((name) => ({
      name,
      type: "STRING",
    }))
  }

  return { tables: tableList, columns: columnsMap }
}

// =============================================================================
// Token classification
// =============================================================================

/**
 * Token types that we cannot verify via suggestion labels:
 * - Literals: user-provided values, not suggested
 * - Punctuation and operators: not shown as keyword suggestions
 * - Variable references: user-defined
 */
export const SKIP_TOKEN_TYPES = new Set([
  // Literals
  "StringLiteral",
  "NumberLiteral",
  "DurationLiteral",
  "MalformedDurationLiteral",
  "BooleanLiteral",
  "NullLiteral",
  "GeohashLiteral",
  "GeohashBinaryLiteral",
  "DecimalLiteral",
  "LongLiteral",
  "HexLiteral",
  "FloatLiteral",
  "EscapeStringLiteral",
  // Punctuation
  "LParen",
  "RParen",
  "Comma",
  "Dot",
  "Semicolon",
  "LBracket",
  "RBracket",
  "Colon",
  "AtSign",
  "ColonEquals",
  // Operators
  "Equals",
  "NotEquals",
  "LessThan",
  "LessThanOrEqual",
  "GreaterThan",
  "GreaterThanOrEqual",
  "Plus",
  "Minus",
  "Star",
  "Divide",
  "Modulo",
  "Concat",
  "DoubleColon",
  "RegexMatch",
  "RegexNotMatch",
  "RegexNotEquals",
  "IPv4ContainedBy",
  "IPv4Contains",
  "BitXor",
  "BitOr",
  "BitAnd",
  // Variable references
  "VariableReference",
  // Bind variables ($1, :name)
  "BindVariable",
  // Interval literals
  "IntervalLiteral",
])

// =============================================================================
// Walkthrough logic
// =============================================================================

export interface WalkthroughStep {
  position: number
  tokenImage: string
  tokenType: string
  expectedLabel: string
  suggestions: string[]
  found: boolean
}

export function autocompleteWalkthrough(
  sql: string,
  schema: SchemaInfo,
): {
  success: boolean
  steps: WalkthroughStep[]
  failedSteps: WalkthroughStep[]
} {
  const { tokens, errors } = tokenize(sql)
  if (errors.length > 0) {
    return { success: false, steps: [], failedSteps: [] }
  }

  const provider = createAutocompleteProvider(schema)

  // Build a set of known table and column names for identifier matching
  const knownNames = new Set<string>()
  for (const t of schema.tables) knownNames.add(t.name.toLowerCase())
  for (const cols of Object.values(schema.columns)) {
    for (const c of cols) knownNames.add(c.name.toLowerCase())
  }

  const steps: WalkthroughStep[] = []

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const tokenType = token.tokenType.name

    // Skip literals, punctuation, operators
    if (SKIP_TOKEN_TYPES.has(tokenType)) continue

    const prefix = sql.substring(0, token.startOffset)
    const labels = provider
      .getSuggestions(prefix, prefix.length)
      .map((s) => s.label)

    let found: boolean
    let expectedLabel: string

    if (tokenType === "Identifier" || tokenType === "QuotedIdentifier") {
      // Identifier token: check if it's a known table/column name (reference)
      // or an unknown name (new table, alias, new column definition) → skip
      const word =
        tokenType === "QuotedIdentifier"
          ? token.image.slice(1, -1).toLowerCase()
          : token.image.toLowerCase()
      if (!knownNames.has(word)) continue

      // If the provider suggests ANY known name at this position, it's a
      // reference position (FROM, JOIN, WHERE, etc.) → verify our name is there.
      // If it suggests none, it's a definition position (CREATE TABLE name,
      // column definition, alias) → skip.
      const suggestsAnyKnownName = labels.some((l) =>
        knownNames.has(l.toLowerCase()),
      )
      if (!suggestsAnyKnownName) continue

      expectedLabel = word
      found = labels.some((l) => l.toLowerCase() === word)
    } else {
      // Keyword token: check if keyword label appears in suggestions.
      // Join prefix tokens (LEFT, ASOF, etc.) are now suggested as compound
      // keywords ("LEFT JOIN", "ASOF JOIN"), so also accept those forms.
      expectedLabel = tokenNameToKeyword(tokenType)
      const expectedUpper = expectedLabel.toUpperCase()
      found = labels.some((l) => {
        const upper = l.toUpperCase()
        return upper === expectedUpper || upper === expectedUpper + " JOIN"
      })

      // Fallback: keyword tokens used as identifiers (e.g., `timestamp`
      // as a column name). Accept if the word is a known column/table in
      // the schema OR IdentifierKeyword is expected at this position.
      if (!found && IDENTIFIER_KEYWORD_TOKENS.has(tokenType)) {
        const word = token.image.toLowerCase()
        if (knownNames.has(word)) {
          found = labels.some((l) => l.toLowerCase() === word)
        }
        if (!found) {
          const rawTokens = getNextValidTokens(prefix)
          if (
            rawTokens.includes("IdentifierKeyword") ||
            rawTokens.includes(tokenType)
          ) {
            found = true
          }
        }
      }
    }

    steps.push({
      position: token.startOffset,
      tokenImage: token.image,
      tokenType,
      expectedLabel,
      suggestions: labels.slice(0, 15),
      found,
    })
  }

  return {
    success: true,
    steps,
    failedSteps: steps.filter((s) => !s.found),
  }
}
