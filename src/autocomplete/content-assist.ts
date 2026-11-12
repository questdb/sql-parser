import { type ILexingError, IToken, TokenType } from "chevrotain"
import { parse as parseRaw } from "../parser/parser"
import { visitor } from "../parser/visitor"
import { QuestDBLexer } from "../parser/lexer"
import { CLAUSE_IDENTIFIER_KEYWORD_NAMES } from "../parser/tokens"
import type { Statement } from "../parser/ast"
import {
  IDENTIFIER_KEYWORD_TOKENS,
  IDENTIFIER_TOKENS,
  EXPRESSION_OPERATORS,
} from "./token-classification"
import {
  computeContentAssistBudgeted,
  type ContentAssistSuggestion,
} from "./budgeted-content-assist"

// =============================================================================
// Constants
// =============================================================================

const WORD_BOUNDARY_CHARS = new Set([
  " ",
  "\n",
  "\t",
  "\r",
  "(",
  ")",
  ",",
  ";",
  ".",
  "=",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "'",
  '"',
  "`",
  "|",
  "&",
  "^",
  "~",
  "!",
  "@",
  ":",
  "[",
  "]",
])

// =============================================================================
// Types
// =============================================================================

/**
 * A table reference found in the SQL query
 */
export interface TableRef {
  /** The table name */
  table: string
  /** Optional alias */
  alias?: string
}

/**
 * Result from content assist analysis
 */
export interface ContentAssistResult {
  /** Token types that are syntactically valid at the cursor position */
  nextTokenTypes: TokenType[]
  /** Tables/aliases found in the query (for column suggestions) */
  tablesInScope: TableRef[]
  /** Columns from CTEs, keyed by CTE name (lowercase) */
  cteColumns: Record<string, { name: string; type: string }[]>
  /** The tokens before the cursor */
  tokensBefore: IToken[]
  /** Whether the cursor is in the middle of a word (partial token being typed) */
  isMidWord: boolean
  /** Any lexer errors */
  lexErrors: ILexingError[]
  /**
   * When the cursor is after a qualified reference (e.g., "t1." or "trades."),
   * this contains the qualifier name (e.g., "t1" or "trades"). The provider
   * should resolve this against tablesInScope aliases/names to filter columns.
   */
  qualifiedTableRef?: string
  /** Whether the grammar context expects column names (expression/columnRef positions) */
  suggestColumns: boolean
  /** Whether the grammar context expects table names (tableName positions, or expression context) */
  suggestTables: boolean
  /** Whether scalar functions are valid at this position (any expression context) */
  suggestScalarFunctions: boolean
  /** Whether aggregate functions are valid at this position (SELECT/ORDER BY/HAVING) */
  suggestAggregateFunctions: boolean
  /** Whether window functions are valid at this position (SELECT/ORDER BY) */
  suggestWindowFunctions: boolean
  /** Whether table-valued functions are valid at this position (FROM/JOIN) */
  suggestTableValuedFunctions: boolean
  /**
   * Bare column names (lowercase) referenced before the cursor in expression
   * context. Used by the provider to boost tables containing all these columns.
   */
  referencedColumns: Set<string>
  /** Whether the cursor is inside a WHERE clause expression */
  isConditionContext: boolean
  /**
   * Concrete keywords the grammar accepts only through the generic `identifier`
   * sub-rule (so the word stays non-reserved) and therefore never surface via
   * the normal `IdentifierKeyword` path. Re-injected per rule context so
   * multi-word `GRANT`/`REVOKE`, `CONVERT PARTITION` and `SHOW CREATE DATABASE`
   * clauses can be autocompleted. See `contextKeywordSuggestions`.
   */
  contextKeywords: string[]
  /**
   * Function names the grammar accepts only through `identifier` at the cursor,
   * such as the SUBSAMPLE methods. Rendered as functions, not keywords.
   * See `contextFunctionSuggestions`.
   */
  contextFunctions: string[]
}

// =============================================================================
// Table Extraction from AST
// =============================================================================

/**
 * Extract table references from a parsed AST
 */
function normalizeTableName(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === "string") return value
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>
    if (Array.isArray(obj.parts)) {
      // Use only the last part (table name) for schema lookup.
      // Schema-qualified names like "public.trades" should resolve to "trades"
      // since the schema columns map is keyed by bare table name.
      const parts = obj.parts as string[]
      return parts[parts.length - 1]
    }
    if (typeof obj.name === "string") return obj.name
  }
  return undefined
}

interface ExtractResult {
  tables: TableRef[]
  cteColumns: Record<string, { name: string; type: string }[]>
}

/**
 * Infer column names from a CTE's inner SELECT columns.
 * Uses alias if present, otherwise derives name from expression.
 */
function extractCteColumnNames(
  columns: unknown[],
): { name: string; type: string }[] {
  const result: { name: string; type: string }[] = []
  for (const col of columns) {
    if (!col || typeof col !== "object") continue
    const c = col as Record<string, unknown>

    // StarSelectItem or QualifiedStarSelectItem — can't resolve without schema
    if (c.type === "star" || c.type === "qualifiedStar") continue

    // ExpressionSelectItem
    if (c.type === "selectItem") {
      // Prefer alias
      if (typeof c.alias === "string") {
        result.push({ name: c.alias, type: "" })
        continue
      }

      const expr = c.expression as Record<string, unknown> | undefined
      if (!expr) continue

      // Column reference → use last part of qualified name
      if (expr.type === "column" && expr.name) {
        const qn = expr.name as Record<string, unknown>
        if (Array.isArray(qn.parts) && qn.parts.length > 0) {
          result.push({
            name: qn.parts[qn.parts.length - 1] as string,
            type: "",
          })
          continue
        }
      }

      // Function call → use function name
      if (expr.type === "function" && typeof expr.name === "string") {
        result.push({ name: expr.name, type: "" })
        continue
      }
    }
  }
  return result
}

function extractTablesFromAst(ast: unknown): ExtractResult {
  const tables: TableRef[] = []
  const cteColumns: Record<string, { name: string; type: string }[]> = {}
  const visited = new WeakSet()

  function visit(node: unknown) {
    if (!node || typeof node !== "object") return
    if (visited.has(node)) return
    visited.add(node)

    const n = node as Record<string, unknown>

    // Handle CTE definitions — surface CTE names as virtual tables
    // and extract column names from the inner SELECT
    if (n.type === "cte" && typeof n.name === "string") {
      tables.push({ table: n.name })
      const query = n.query as Record<string, unknown> | undefined
      if (query && Array.isArray(query.columns)) {
        const cols = extractCteColumnNames(query.columns)
        cteColumns[n.name.toLowerCase()] = cols
      } else {
        // Register CTE name even if no columns are extractable (e.g., SELECT *)
        cteColumns[n.name.toLowerCase()] = []
      }
      // Don't recurse into the CTE's inner query — its tables are not
      // in the outer scope. We already extracted the CTE name and columns.
      return
    }

    // Handle table references in FROM clause
    if (n.type === "tableRef") {
      const tableName = normalizeTableName(n.table ?? n.name)
      if (tableName) {
        tables.push({
          table: tableName,
          alias: n.alias as string | undefined,
        })
      }
    }

    // Handle FROM clause with table
    if (n.from) {
      const tableName = normalizeTableName(n.from)
      if (tableName) {
        const from = n.from as Record<string, unknown>
        tables.push({
          table: tableName,
          alias: from.alias as string | undefined,
        })
      } else {
        visit(n.from)
      }
    }

    // Handle JOIN clauses
    if (n.joins && Array.isArray(n.joins)) {
      for (const join of n.joins as Record<string, unknown>[]) {
        const joinTableName = normalizeTableName(join.table)
        if (joinTableName) {
          tables.push({
            table: joinTableName,
            alias: join.alias as string | undefined,
          })
        }
        visit(join)
      }
    }

    // Handle UPDATE table
    if (n.type === "update" && n.table) {
      const tableName = normalizeTableName(n.table)
      if (tableName) {
        tables.push({ table: tableName })
      }
    }

    // Handle INSERT INTO table
    if (n.type === "insert" && n.table) {
      const tableName = normalizeTableName(n.table)
      if (tableName) {
        tables.push({ table: tableName })
      }
    }

    // Handle ALTER TABLE / ALTER MATERIALIZED VIEW
    if (
      (n.type === "alterTable" || n.type === "alterMaterializedView") &&
      n.table
    ) {
      const tableName = normalizeTableName(n.table)
      if (tableName) {
        tables.push({ table: tableName })
      }
    }
    if (n.type === "alterMaterializedView" && n.view) {
      const viewName = normalizeTableName(n.view)
      if (viewName) {
        tables.push({ table: viewName })
      }
    }

    // Recurse into child nodes
    for (const key of Object.keys(n)) {
      const child = n[key]
      if (Array.isArray(child)) {
        for (const item of child) {
          visit(item)
        }
      } else if (typeof child === "object" && child !== null) {
        visit(child)
      }
    }
  }

  if (Array.isArray(ast)) {
    for (const stmt of ast) {
      visit(stmt)
    }
  } else {
    visit(ast)
  }

  return { tables, cteColumns }
}

/**
 * Extract CTE column information from the token stream by finding CTE
 * boundaries and parsing each inner SELECT independently.
 *
 * This is used when the full SQL fails to parse (incomplete outer query)
 * but the CTE definitions themselves are complete.
 */
interface CteTokenExtractResult {
  cteNames: string[]
  cteColumns: Record<string, { name: string; type: string }[]>
  /** Token index where the CTE block ends (first token of the outer query) */
  outerQueryStart: number
}

/**
 * Extract CTE names and column information from the token stream by finding
 * CTE boundaries and parsing each inner SELECT independently.
 *
 * This is used when the full SQL fails to parse (incomplete outer query)
 * but the CTE definitions themselves are complete.
 */
function extractCtesFromTokens(
  fullSql: string,
  tokens: IToken[],
): CteTokenExtractResult {
  const cteNames: string[] = []
  const cteColumns: Record<string, { name: string; type: string }[]> = {}
  if (tokens.length === 0 || tokens[0].tokenType.name !== "With")
    return { cteNames, cteColumns, outerQueryStart: 0 }

  const isIdent = (t: IToken | undefined): boolean =>
    !!t &&
    (t.tokenType.name === "Identifier" ||
      t.tokenType.name === "QuotedIdentifier" ||
      IDENTIFIER_KEYWORD_TOKENS.has(t.tokenType.name))

  let i = 1 // skip WITH
  while (i < tokens.length) {
    // Expect: cteName AS (
    if (!isIdent(tokens[i])) break
    const cteName = tokens[i].image
    i++
    if (tokens[i]?.tokenType.name !== "As") break
    i++
    if (tokens[i]?.tokenType.name !== "LParen") break
    const innerStart = i + 1
    i++

    // Find matching RParen
    let depth = 1
    while (i < tokens.length && depth > 0) {
      if (tokens[i].tokenType.name === "LParen") depth++
      if (tokens[i].tokenType.name === "RParen") depth--
      i++
    }

    // Always register the CTE name, even if we can't extract columns
    cteNames.push(cteName)
    // Initialize with empty array; will be populated below if columns are found
    cteColumns[cteName.toLowerCase()] = []

    if (depth === 0) {
      // tokens[innerStart..i-2] is the inner SELECT body
      const innerEnd = i - 1 // RParen index
      if (innerStart < innerEnd) {
        const innerSql = fullSql.substring(
          tokens[innerStart].startOffset,
          tokens[innerEnd - 1].startOffset + tokens[innerEnd - 1].image.length,
        )
        try {
          const { cst } = parseRaw(innerSql)
          const ast = visitor.visit(cst) as Statement[]
          if (ast && ast.length > 0) {
            const stmt = ast[0] as unknown as Record<string, unknown>
            if (Array.isArray(stmt.columns)) {
              const cols = extractCteColumnNames(stmt.columns)
              if (cols.length > 0) {
                cteColumns[cteName.toLowerCase()] = cols
              }
            }
          }
        } catch {
          // Inner SELECT parse failed, skip this CTE's columns
        }
      }
    } else {
      // Unclosed paren — CTE body is incomplete, can't extract columns
      break
    }

    // After RParen, expect Comma (another CTE) or SELECT/INSERT/UPDATE
    if (tokens[i]?.tokenType.name === "Comma") {
      i++ // next CTE
      continue
    }
    break
  }

  return { cteNames, cteColumns, outerQueryStart: i }
}

// =============================================================================
// CTE cursor detection
// =============================================================================

interface CteBodyContext {
  /** Name of the CTE containing the cursor (unquoted) */
  name: string
  /** Token index of the first token inside the CTE body (after LParen) */
  bodyTokenStart: number
  /** Token index of the RParen (or tokens.length if unclosed) */
  bodyTokenEnd: number
}

/**
 * Detect whether the cursor is inside a CTE body. Returns the CTE name and
 * body token range so callers can exclude self-references and extract inner
 * table references.
 */
function findCteContainingCursor(
  tokens: IToken[],
  cursorOffset: number,
): CteBodyContext | null {
  if (tokens.length === 0 || tokens[0].tokenType.name !== "With") return null

  const isIdent = (t: IToken | undefined): boolean =>
    !!t &&
    (t.tokenType.name === "Identifier" ||
      t.tokenType.name === "QuotedIdentifier" ||
      IDENTIFIER_KEYWORD_TOKENS.has(t.tokenType.name))

  let i = 1 // skip WITH
  while (i < tokens.length) {
    if (!isIdent(tokens[i])) break
    const rawName = tokens[i].image
    const cteName =
      tokens[i].tokenType.name === "QuotedIdentifier"
        ? rawName.slice(1, -1)
        : rawName
    i++
    if (tokens[i]?.tokenType.name !== "As") break
    i++
    if (tokens[i]?.tokenType.name !== "LParen") break
    const lparenOffset = tokens[i].startOffset
    i++
    const bodyTokenStart = i

    // Find matching RParen
    let depth = 1
    while (i < tokens.length && depth > 0) {
      if (tokens[i].tokenType.name === "LParen") depth++
      if (tokens[i].tokenType.name === "RParen") depth--
      i++
    }

    if (depth === 0) {
      // i is past RParen; tokens[i-1] is RParen
      const rparenIdx = i - 1
      const rparenEndOffset =
        tokens[rparenIdx].startOffset + tokens[rparenIdx].image.length
      if (cursorOffset > lparenOffset && cursorOffset < rparenEndOffset) {
        return { name: cteName, bodyTokenStart, bodyTokenEnd: rparenIdx }
      }
    } else {
      // Unclosed paren — if cursor is after LParen, it's inside this CTE
      if (cursorOffset > lparenOffset) {
        return { name: cteName, bodyTokenStart, bodyTokenEnd: tokens.length }
      }
      break
    }

    // After RParen, expect Comma or end of CTEs
    if (tokens[i]?.tokenType.name === "Comma") {
      i++
      continue
    }
    break
  }

  return null
}

/**
 * Try to extract tables by parsing the query.
 * If parsing fails, try to extract from tokens.
 */
function extractTables(fullSql: string, tokens: IToken[]): ExtractResult {
  // First, try to parse and extract from AST
  try {
    const { cst } = parseRaw(fullSql)
    const ast = visitor.visit(cst) as Statement[]
    if (ast && ast.length > 0) {
      return extractTablesFromAst(ast)
    }
  } catch {
    // Parsing or visitor failed, fall through to token-based extraction
  }

  // Fallback: extract from tokens by looking for table name patterns
  // Handles malformed input where full AST extraction is not available.
  const tables: TableRef[] = []
  const TABLE_PREFIX_TOKENS = new Set(["From", "Join", "Update", "Into"])
  const isIdentifierLike = (token: IToken | undefined): token is IToken =>
    !!token &&
    (token.tokenType.name === "Identifier" ||
      token.tokenType.name === "QuotedIdentifier" ||
      IDENTIFIER_KEYWORD_TOKENS.has(token.tokenType.name))

  const tokenToNamePart = (token: IToken): string => {
    if (token.tokenType.name === "QuotedIdentifier") {
      return token.image.slice(1, -1)
    }
    return token.image
  }

  const readQualifiedName = (
    startIndex: number,
  ): { name: string; nextIndex: number } | null => {
    const first = tokens[startIndex]
    if (!isIdentifierLike(first)) return null

    const parts = [tokenToNamePart(first)]
    let i = startIndex + 1

    while (
      i + 1 < tokens.length &&
      tokens[i].tokenType.name === "Dot" &&
      isIdentifierLike(tokens[i + 1])
    ) {
      parts.push(tokenToNamePart(tokens[i + 1]))
      i += 2
    }

    // Use only the last part (table name) for schema lookup.
    // Schema-qualified names like "metrics.trades" resolve to "trades".
    return { name: parts[parts.length - 1], nextIndex: i }
  }

  // Extract CTE names and columns from the token stream. CTE definitions are
  // usually complete even when the outer query is incomplete, so parse each
  // inner SELECT independently.
  const { cteNames, cteColumns, outerQueryStart } = extractCtesFromTokens(
    fullSql,
    tokens,
  )

  // Scan for FROM/JOIN table references only in the outer query (after CTEs).
  // This avoids leaking tables referenced inside CTE bodies into the outer scope.
  // Also detect ALTER TABLE / TRUNCATE TABLE patterns for column scoping.
  const DDL_TABLE_PREFIXES = new Set(["Alter", "Truncate", "Drop"])
  for (let i = outerQueryStart; i < tokens.length; i++) {
    const tokenName = tokens[i].tokenType.name

    // Standard DML: FROM/JOIN/UPDATE/INTO <table>
    if (TABLE_PREFIX_TOKENS.has(tokenName)) {
      const tableNameResult = readQualifiedName(i + 1)
      if (!tableNameResult) continue

      let alias: string | undefined
      let aliasStart = tableNameResult.nextIndex
      const explicitAs = tokens[aliasStart]?.tokenType.name === "As"
      if (explicitAs) {
        aliasStart++
      }
      if (
        isIdentifierLike(tokens[aliasStart]) &&
        // `FROM t GROUP BY`, `FROM t LEFT JOIN`: clause words are no alias
        (explicitAs ||
          !CLAUSE_IDENTIFIER_KEYWORD_NAMES.has(
            tokens[aliasStart].tokenType.name,
          ))
      ) {
        alias = tokenToNamePart(tokens[aliasStart])
      }

      tables.push({
        table: tableNameResult.name,
        alias,
      })

      // Continue from where we consumed table/alias to avoid duplicate captures.
      i = alias ? aliasStart : tableNameResult.nextIndex - 1
      continue
    }

    // DDL: ALTER TABLE / TRUNCATE TABLE / DROP TABLE <name>
    if (
      DDL_TABLE_PREFIXES.has(tokenName) &&
      tokens[i + 1]?.tokenType.name === "Table"
    ) {
      const tableNameResult = readQualifiedName(i + 2)
      if (tableNameResult) {
        tables.push({ table: tableNameResult.name })
        i = tableNameResult.nextIndex - 1
      }
    }
  }
  for (const name of cteNames) {
    tables.push({ table: name })
  }

  return { tables, cteColumns }
}

// =============================================================================
// Main API
// =============================================================================

/**
 * Collapse a trailing qualified reference (ident.ident...ident) in the token
 * stream into a single identifier token. This allows re-computing suggestions
 * as if the user typed a simple column name, working around Chevrotain's
 * qualifiedStar path dominating the selectItem alternatives.
 *
 * Example: [SELECT, t, ., col] → [SELECT, col]
 */
/**
 * Check if a token type name represents an identifier-like token.
 * This includes plain Identifier, QuotedIdentifier, and any keyword
 * that has the IdentifierKeyword category (e.g., Timestamp, Index, Type).
 */
function isIdentifierLikeTokenName(name: string): boolean {
  return (
    name === "Identifier" ||
    name === "QuotedIdentifier" ||
    name === "IdentifierKeyword" ||
    IDENTIFIER_KEYWORD_TOKENS.has(name)
  )
}

function collapseTrailingQualifiedRef(tokens: IToken[]): IToken[] | null {
  if (tokens.length < 3) return null

  // Walk backwards from end: expect Identifier (. Identifier)+ pattern
  const i = tokens.length - 1
  const lastToken = tokens[i]
  if (!isIdentifierLikeTokenName(lastToken.tokenType.name)) {
    return null
  }

  // Walk backwards: Dot Identifier pairs
  let start = i
  while (start >= 2) {
    const maybeDot = tokens[start - 1]
    const maybeIdent = tokens[start - 2]
    if (maybeDot.tokenType.name !== "Dot") break
    if (!isIdentifierLikeTokenName(maybeIdent.tokenType.name)) break
    start -= 2
  }

  // Must have at least one Dot (i.e., start < i - 1) to be a qualified ref
  if (start >= i) return null

  // Replace tokens[start..i] with just the last identifier
  return [...tokens.slice(0, start), lastToken]
}

/**
 * Position categories used to drive context-aware suggestion emission.
 *
 * - "newName"             — name being defined (CREATE TABLE <name>): suppress
 *                           all schema/function suggestions.
 * - "expression"          — expression position where aggregates and windows
 *                           are syntactically valid: SELECT items, ORDER BY.
 * - "restrictedExpression"— any expression where aggregates and windows are
 *                           NOT valid: WHERE / GROUP BY / JOIN ON predicates,
 *                           UPDATE SET RHS, INSERT VALUES rows, DECLARE
 *                           assignment RHS.
 * - "columnReference"     — bare column-name reference with no surrounding
 *                           expression context: ALTER TABLE … DROP COLUMN
 *                           <name>, ALTER TABLE … RENAME COLUMN <name>.
 *                           Columns suggested; functions never valid here.
 * - "tableSource"         — FROM/JOIN positions: tables + table-valued fns.
 * - "tableName"           — DROP TABLE / INSERT INTO / UPDATE / TRUNCATE
 *                           TABLE / RENAME TABLE: tables only, no functions.
 * - "numeric"             — LIMIT / OFFSET: numeric literal expected; nothing
 *                           useful to suggest from schema or functions.
 */
export type PositionKind =
  | "newName"
  | "expression"
  | "restrictedExpression"
  | "columnReference"
  | "tableSource"
  | "tableName"
  | "numeric"

// Marker rules that, when encountered before any "fresh expression" marker
// while walking the ruleStack innermost-to-outermost, restrict the position
// to scalar-only (no aggregates, no windows). These are positions where SQL
// disallows aggregation: WHERE/GROUP BY/JOIN ON predicates, UPDATE SET, INSERT
// VALUES rows, DECLARE assignments.
const RESTRICTED_EXPRESSION_RULES = new Set([
  "whereClause",
  "groupByClause",
  "setClause", // UPDATE x SET col = <expr>
  "valuesList", // INSERT INTO t VALUES (<expr>, ...)
  "joinClause", // ... JOIN ... ON <expr>
  "declareAssignment", // DECLARE @x := <expr>
])

// Marker rules that introduce a fresh expression context. When walking the
// ruleStack innermost-to-outermost, hitting one of these BEFORE a restriction
// marker means we're inside a nested expression where aggregates/windows are
// valid again — e.g. `WHERE id IN (SELECT count(*) FROM ...)`. The inner
// selectItem overrides the outer whereClause restriction.
const FRESH_EXPRESSION_RULES = new Set(["selectItem"])

/**
 * Classify an identifier suggestion path based on its ruleStack.
 * Walks ruleStack markers to map a Chevrotain parse position onto a semantic
 * PositionKind that the suggestion-builder can dispatch on.
 */
function classifyIdentifierPath(ruleStack: string[]): PositionKind {
  if (ruleStack.includes("limitClause")) return "numeric"

  // Full expression context: the parser explicitly entered identifierExpression
  // (the productive expression rule) OR qualifiedStar (`t.*` — only legal in
  // selectItem position). Both allow aggregates/windows where applicable.
  const hasExpressionMarker =
    ruleStack.includes("identifierExpression") ||
    ruleStack.includes("qualifiedStar")
  if (hasExpressionMarker) {
    // Walk innermost-to-outermost. The first scope marker we hit wins:
    // - selectItem → fresh expression context, aggregates allowed (handles
    //   subqueries inside WHERE/SET/JOIN-ON without inheriting restriction)
    // - whereClause/groupByClause/etc. → restricted, scalar only
    for (let i = ruleStack.length - 1; i >= 0; i--) {
      const r = ruleStack[i]
      if (FRESH_EXPRESSION_RULES.has(r)) return "expression"
      if (RESTRICTED_EXPRESSION_RULES.has(r)) return "restrictedExpression"
    }
    return "expression"
  }

  // columnRef without an enclosing expression rule = bare column-name reference.
  // E.g. ALTER TABLE x DROP COLUMN <name>, CREATE INDEX ON x(<name>).
  // Columns are valid; functions and other tables are not.
  // keyColumn = DEDUP KEYS / EXPIRE ROWS KEEP ... ON / PARTITION BY columns.
  if (ruleStack.includes("columnRef") || ruleStack.includes("keyColumn"))
    return "columnReference"

  if (ruleStack.includes("tableName")) {
    // tableSource = under fromClause / joinClause / tableRef (functions OK).
    // Anything else (DROP/INSERT INTO/UPDATE/etc.) is a bare table reference
    // where table-valued functions don't apply.
    if (
      ruleStack.includes("fromClause") ||
      ruleStack.includes("joinClause") ||
      ruleStack.includes("tableRef")
    ) {
      return "tableSource"
    }
    return "tableName"
  }

  return "newName"
}

/**
 * Set of category flags that the suggestion-builder consults to decide which
 * function and schema buckets to emit.
 */
export interface CategoryFlags {
  suggestColumns: boolean
  suggestTables: boolean
  suggestScalarFunctions: boolean
  suggestAggregateFunctions: boolean
  suggestWindowFunctions: boolean
  suggestTableValuedFunctions: boolean
}

/** All flags off — starting point for OR-accumulation across ruleStacks. */
function emptyCategoryFlags(): CategoryFlags {
  return {
    suggestColumns: false,
    suggestTables: false,
    suggestScalarFunctions: false,
    suggestAggregateFunctions: false,
    suggestWindowFunctions: false,
    suggestTableValuedFunctions: false,
  }
}

/**
 * Map a PositionKind to the set of category flags valid at that position.
 * The suggestion-builder unions flags from every ruleStack the parser explored.
 */
function flagsForPosition(kind: PositionKind): Partial<CategoryFlags> {
  switch (kind) {
    case "expression":
      return {
        suggestColumns: true,
        suggestTables: true,
        suggestScalarFunctions: true,
        suggestAggregateFunctions: true,
        suggestWindowFunctions: true,
      }
    case "restrictedExpression":
      return {
        suggestColumns: true,
        suggestTables: true,
        suggestScalarFunctions: true,
      }
    case "columnReference":
      // Bare column name (e.g. ALTER DROP COLUMN <name>) — only columns of
      // the relevant table. No functions, no other tables.
      return {
        suggestColumns: true,
      }
    case "tableSource":
      return {
        suggestTables: true,
        suggestTableValuedFunctions: true,
      }
    case "tableName":
      return {
        suggestTables: true,
      }
    case "numeric":
    case "newName":
      return {}
  }
}

/** Accumulate (OR) the flags for one PositionKind into the running set. */
function accumulateFlags(target: CategoryFlags, kind: PositionKind): void {
  const partial = flagsForPosition(kind)
  for (const key of Object.keys(partial) as (keyof CategoryFlags)[]) {
    if (partial[key]) target[key] = true
  }
}

interface ComputeResult extends CategoryFlags {
  nextTokenTypes: TokenType[]
  isConditionContext: boolean
  contextKeywords: string[]
  contextFunctions: string[]
  /** Rule stack for columns bound to the object being created or altered. */
  objectColumnRuleStack?: string[]
}

// SUBSAMPLE methods (questdb/questdb#7013). The grammar reads the method
// through `identifier` so the names stay non-reserved; suggest them here.
const SUBSAMPLE_METHODS = ["uniform", "cadence", "m4", "minmax", "lttb", "sdt"]

/**
 * Function names to suggest where the grammar only accepts them through the
 * generic `identifier` sub-rule. Today that is the method after SUBSAMPLE.
 */
function contextFunctionSuggestions(
  tokens: IToken[],
  suggestions: ContentAssistSuggestion[],
): string[] {
  const last = tokens[tokens.length - 1]?.tokenType.name
  if (last !== "Subsample") return []
  const inSubsample = suggestions.some(
    (s) =>
      s.nextTokenType.name === "IdentifierKeyword" &&
      s.ruleStack.includes("subsampleClause"),
  )
  return inSubsample ? [...SUBSAMPLE_METHODS] : []
}

// Enterprise permission names (Permission.java namePermissionMap)
export const PERMISSION_NAMES: readonly string[] = [
  "ALL",
  "SELECT",
  "INSERT",
  "UPDATE",
  "CREATE TABLE",
  "DROP TABLE",
  "RENAME TABLE",
  "TRUNCATE TABLE",
  "ADD COLUMN",
  "DROP COLUMN",
  "RENAME COLUMN",
  "ALTER COLUMN TYPE",
  "ALTER COLUMN CACHE",
  "ALTER SYMBOL CAPACITY",
  "ADD INDEX",
  "DROP INDEX",
  "REINDEX",
  "ATTACH PARTITION",
  "DETACH PARTITION",
  "DROP PARTITION",
  "SET TABLE PARAM",
  "SET TABLE TYPE",
  "SET TABLE FORMAT",
  "RESUME WAL",
  "CREATE GROUP",
  "DROP GROUP",
  "CREATE USER",
  "DROP USER",
  "CREATE SERVICE ACCOUNT",
  "DROP SERVICE ACCOUNT",
  "ADD USER",
  "REMOVE USER",
  "CANCEL ANY COPY",
  "BACKUP TABLE",
  "BACKUP DATABASE",
  "SNAPSHOT",
  "VACUUM TABLE",
  "ENABLE USER",
  "DISABLE USER",
  "ADD PASSWORD",
  "REMOVE PASSWORD",
  "ADD EXTERNAL ALIAS",
  "REMOVE EXTERNAL ALIAS",
  "CREATE JWK",
  "DROP JWK",
  "CREATE REST TOKEN",
  "DROP REST TOKEN",
  "LIST USERS",
  "USER DETAILS",
  "DEDUP ENABLE",
  "DEDUP DISABLE",
  "HTTP",
  "PGWIRE",
  "ILP",
  "SQL ENGINE ADMIN",
  "SYSTEM ADMIN",
  "CREATE MATERIALIZED VIEW",
  "DROP MATERIALIZED VIEW",
  "REFRESH MATERIALIZED VIEW",
  "SETTINGS",
  "DATABASE ADMIN",
  "AUDIT VIEW",
  "CREATE VIEW",
  "DROP VIEW",
  "CREATE LIVE VIEW",
  "DROP LIVE VIEW",
  "COMPILE VIEW",
  "ALTER VIEW",
  "SET REFRESH LIMIT",
  "SET REFRESH TYPE",
  "CONVERT PARTITION TO PARQUET",
  "CONVERT PARTITION TO NATIVE",
  "SET PARQUET SETTINGS",
  "SET STORAGE POLICY",
  "REMOVE STORAGE POLICY",
  "ENABLE STORAGE POLICY",
  "DISABLE STORAGE POLICY",
  "SWITCH ROLE",
  "SET MEMORY LIMIT",
  "RESOURCE GROUP ADMIN",
]

// Category names valid inside SHOW CREATE DATABASE (INCLUDE|EXCLUDE) ( ... ).
// The grammar consumes these via `identifier` (they are non-reserved), so only
// the explicit `ALL` token surfaces on its own; re-inject the rest.
const DATABASE_CATEGORY_KEYWORDS = [
  "ALL",
  "TABLES",
  "VIEWS",
  "MATERIALIZED_VIEWS",
  "USERS",
  "GROUPS",
  "SERVICE_ACCOUNTS",
  "PERMISSIONS",
  "SCHEMA",
  "ACL",
]

/**
 * Next words of every server permission name that extends the words typed so
 * far in the current GRANT / REVOKE list item.
 */
function typedPermissionWords(tokens: IToken[]): string[] {
  const words: string[] = []
  for (let i = tokens.length - 1; i >= 0; i--) {
    const name = tokens[i].tokenType.name
    if (name === "Grant" || name === "Revoke" || name === "Comma") break
    words.unshift(tokens[i].image.toUpperCase())
  }
  return words
}

function nextPermissionWords(tokens: IToken[]): Set<string> {
  const words = typedPermissionWords(tokens)
  const prefix = words.length > 0 ? words.join(" ") + " " : ""
  const next = new Set<string>()
  for (const perm of PERMISSION_NAMES) {
    if (perm.startsWith(prefix)) next.add(perm.split(" ")[words.length])
  }
  return next
}

// Tokens that end a permission in the GRANT / REVOKE permission list.
const PERMISSION_LIST_ENDERS = new Set(["On", "To", "From", "Comma"])

/**
 * GRANT / REVOKE permissions are parsed loosely (any 1-3 words), so content
 * assist offers every word the grammar allows there. Keep only words that
 * continue a real permission name, and offer ON / TO / FROM / `,` only once
 * the typed words form a complete permission. Applies to the permission list
 * only, not to what follows ON.
 */
function filterPermissionSuggestions(
  tokens: IToken[],
  suggestions: ContentAssistSuggestion[],
): (s: ContentAssistSuggestion) => boolean {
  if (!suggestions.some((s) => s.ruleStack.includes("permissionList"))) {
    return () => true
  }
  const next = nextPermissionWords(tokens)
  const complete = PERMISSION_NAMES.includes(
    typedPermissionWords(tokens).join(" "),
  )
  return (s) => {
    const name = s.nextTokenType.name
    if (s.ruleStack.includes("permissionToken")) {
      // Generic name tokens stay: they show no suggestion here, and the
      // provider needs a grammar token to add the context keywords (the real
      // next words from PERMISSION_NAMES). Explicit keywords must continue a
      // permission name.
      if (IDENTIFIER_TOKENS.has(name) || name === "StringLiteral") return true
      return next.has(name.toUpperCase())
    }
    if (PERMISSION_LIST_ENDERS.has(name)) return complete
    return true
  }
}

/**
 * Re-inject the concrete keywords that the grammar only accepts through the
 * generic `identifier` sub-rule — kept non-reserved on purpose, which means
 * Chevrotain's content-assist reports them merely as the abstract
 * `IdentifierKeyword` category and the suggestion builder renders that slot as
 * "type a name here" rather than a keyword. We recover the intended words from
 * the active rule context (the `ruleStack` of any `IdentifierKeyword` path) plus
 * the immediately preceding tokens, so multi-word `GRANT`/`REVOKE`,
 * `CONVERT PARTITION` and `SHOW CREATE DATABASE` clauses autocomplete
 * token-by-token. Parsing already accepts all of these; this only affects hints.
 */
function contextKeywordSuggestions(
  tokens: IToken[],
  suggestions: ContentAssistSuggestion[],
): string[] {
  // Rule contexts in which the `identifier` catch-all is a valid next token.
  const idKeywordStacks = suggestions
    .filter((s) => s.nextTokenType.name === "IdentifierKeyword")
    .map((s) => s.ruleStack)
  if (idKeywordStacks.length === 0) return []
  const inRule = (r: string): boolean =>
    idKeywordStacks.some((stack) => stack.includes(r))

  const last = tokens[tokens.length - 1]?.tokenType.name
  const out = new Set<string>()

  // GRANT / REVOKE permission phrases: the grammar takes any 1-3 words (most
  // via `identifier`), so offer the next word of every server permission name
  // that extends the words typed so far in the current list item.
  if (inRule("permissionToken")) {
    for (const word of nextPermissionWords(tokens)) out.add(word)
  }

  // ALTER TABLE ... CONVERT PARTITION TO { PARQUET | NATIVE }: the target is
  // OR([CONSUME(Table), SUBRULE(identifier)]) so PARQUET/NATIVE go via identifier.
  if (inRule("convertPartitionTarget") && last === "To") {
    out.add("PARQUET")
    out.add("NATIVE")
  }

  // SHOW CREATE DATABASE (INCLUDE|EXCLUDE) ( <category>, ... ).
  if (inRule("showCreateDatabaseCategory")) {
    for (const c of DATABASE_CATEGORY_KEYWORDS) out.add(c)
  }

  return [...out]
}

// Types the server only accepts as cast targets (SqlUtil.toPersistedType
// rejects them as column types): offered after `::` / CAST, not in DDL.
const CAST_ONLY_TYPE_TOKENS: ReadonlySet<string> = new Set([
  "Regclass",
  "Regprocedure",
])

/** Key of the resource group option whose value is being typed (`key =`). */
function resourceGroupOptionKey(tokens: IToken[]): string | undefined {
  for (let i = tokens.length - 1; i > 0; i--) {
    const name = tokens[i].tokenType.name
    if (name === "Equals") return tokens[i - 1].image.toLowerCase()
    if (name === "Comma" || name === "LParen") return undefined
  }
  return undefined
}

const QUIET_EXPRESSION_ANCHORS = [
  "sampleByClause",
  "alignToClause",
  "fillValue",
]
// Literal / variable / punctuation tokens stay valid there (no keyword noise)
const QUIET_EXPRESSION_KEPT_TOKENS = new Set([
  "DurationLiteral",
  "NumberLiteral",
  "LongLiteral",
  "DecimalLiteral",
  "FloatLiteral",
  "StringLiteral",
  "EscapeStringLiteral",
  "VariableReference",
  "BindVariable",
  "Minus",
  "LParen",
])

/**
 * If the ruleStack is at the top level of the expression directly under
 * SAMPLE BY, ALIGN TO (TIME ZONE / WITH OFFSET) or a FILL value, return that
 * anchor rule. Nested expressions (function arguments, parentheses) are not
 * top level.
 */
function quietExpressionAnchor(ruleStack: string[]): string | undefined {
  for (let i = ruleStack.length - 2; i >= 0; i--) {
    if (!QUIET_EXPRESSION_ANCHORS.includes(ruleStack[i])) continue
    if (ruleStack[i + 1] !== "expression") return undefined
    const nested = ruleStack
      .slice(i + 2)
      .some((r) => r === "expression" || r === "selectStatement")
    return nested ? undefined : ruleStack[i]
  }
  return undefined
}

/** A policy expression binds to view output; a SELECT nested in it has its own scope. */
function isExpiryPredicatePath(ruleStack: string[]): boolean {
  const expiry = ruleStack.lastIndexOf("expireRowsClause")
  if (
    expiry < 0 ||
    !ruleStack.slice(expiry + 1).includes("identifierExpression")
  )
    return false
  return !ruleStack
    .slice(expiry + 1)
    .some(
      (rule) =>
        rule === "selectStatement" || rule === "implicitSelectStatement",
    )
}

/** Materialized-view storage policies are parsed for compatibility, but no longer supported. */
function isMatViewStorageSuggestion(s: ContentAssistSuggestion): boolean {
  const inAlter = s.ruleStack.includes("alterMaterializedViewAction")
  if (!inAlter && !s.ruleStack.includes("createMaterializedViewBody"))
    return false
  if (s.ruleStack.includes("storagePolicy")) return true
  // DROP / ENABLE / DISABLE STORAGE POLICY consume their tokens directly in
  // the action rule. Table actions use a separate rule and stay unaffected.
  return (
    inAlter &&
    s.ruleStack[s.ruleStack.length - 1] === "alterMaterializedViewAction" &&
    ["Enable", "Disable", "Storage", "Policy"].includes(s.nextTokenType.name)
  )
}

/**
 * Compute content assist suggestions, handling CTE context specially.
 *
 * Chevrotain's computeContentAssist at the "statement" level may only find
 * the insertStatement path when WITH is present, missing selectStatement and
 * updateStatement paths. This function detects that case and merges suggestions
 * from all WITH-capable statement types.
 *
 * Note on the implicit-SELECT / pivot backtrack paths: a previous version of
 * this file filtered ruleStacks that traversed `implicitSelectBody` /
 * `implicitSelectStatement` / `pivotStatement` to suppress noise when a
 * specific statement rule had matched. That filter was removed because the
 * category flags below already gate function emission per PositionKind, so
 * the implicit/pivot paths can only contribute tableSource-style identifier
 * suggestions — which is the desired behaviour for shorthand table queries.
 */
function computeSuggestions(tokens: IToken[]): ComputeResult {
  const ruleName = tokens.some((t) => t.tokenType.name === "Semicolon")
    ? "statements"
    : "statement"
  // Budgeted: aborts after a fixed number of path-exploration steps.
  // The budget keeps autocomplete responsive and falls back to empty suggestions when hit.
  const { suggestions: rawSuggestions } = computeContentAssistBudgeted(
    ruleName,
    tokens,
  )
  // timestampWithTimeZoneLiteral opens with explicit TIMESTAMP / TIMESTAMP_NS
  // tokens. Content assist ignores its GATE, so without this filter those two
  // keywords would be offered wherever an expression can start. Only the
  // rule's first token is dropped; WITH TIME ZONE after `timestamp` stays.
  // Same for doublePrecisionLiteral's leading DOUBLE.
  // columnDefinition only takes DOUBLE PRECISION in CREATE TABLE (a rule
  // argument gates it); ALTER TABLE ADD COLUMN shares the rule, so drop
  // PRECISION there as well.
  // SAMPLE BY / FILL / ALIGN TO ... TIME ZONE / WITH OFFSET take any
  // expression on the server, but at the top level of those expressions we
  // keep the short lists offered before (nothing for SAMPLE BY and ALIGN TO,
  // NULL / PREV / LINEAR / NONE for FILL) instead of every column, function
  // and operator.
  let fillOperandStart = false
  const suggestions = rawSuggestions.filter((s) => {
    const quiet = quietExpressionAnchor(s.ruleStack)
    if (quiet === "fillValue" && s.nextTokenType.name === "Null") {
      fillOperandStart = true
      return true
    }
    return !(
      isMatViewStorageSuggestion(s) ||
      (quiet && !QUIET_EXPRESSION_KEPT_TOKENS.has(s.nextTokenType.name)) ||
      (s.ruleStack[s.ruleStack.length - 1] === "timestampWithTimeZoneLiteral" &&
        (s.nextTokenType.name === "Timestamp" ||
          s.nextTokenType.name === "TimestampNs")) ||
      (s.ruleStack[s.ruleStack.length - 1] === "doublePrecisionLiteral" &&
        s.nextTokenType.name === "Double") ||
      (s.nextTokenType.name === "Precision" &&
        (s.ruleStack.includes("alterTableAction") ||
          s.ruleStack[s.ruleStack.length - 1] === "columnNullModifier")) ||
      // SET <name> ... takes free-form tokens; only offer TO after the name
      (s.ruleStack[s.ruleStack.length - 1] === "setStatement" &&
        (s.nextTokenType.name !== "To" ||
          tokens[tokens.length - 1]?.tokenType.name === "Set")) ||
      // ARRAY is a constructor, not a bare type. Keep the lenient dataType
      // grammar, but do not suggest it in casts or column definitions, or
      // offer the constructor at every expression start.
      (s.nextTokenType.name === "Array" &&
        (s.ruleStack.includes("dataType") ||
          s.ruleStack[s.ruleStack.length - 1] === "arrayLiteral")) ||
      // IS / ILIKE / DECLARE are accepted as column names, not suggested
      (s.ruleStack[s.ruleStack.length - 1] === "columnDefinition" &&
        (s.nextTokenType.name === "Is" ||
          s.nextTokenType.name === "Ilike" ||
          s.nextTokenType.name === "Declare")) ||
      // ANY only continues CANCEL in permission names (CANCEL ANY COPY)
      (s.nextTokenType.name === "Any" &&
        s.ruleStack[s.ruleStack.length - 1] === "permissionToken" &&
        tokens[tokens.length - 1]?.tokenType.name !== "Cancel") ||
      // INCREMENTAL is an obsolete synonym of IMMEDIATE in REFRESH modes
      (s.nextTokenType.name === "Incremental" &&
        s.ruleStack[s.ruleStack.length - 1] === "materializedViewRefresh") ||
      // Cast-only types: the server cannot persist them as column types
      (CAST_ONLY_TYPE_TOKENS.has(s.nextTokenType.name) &&
        s.ruleStack.includes("dataType") &&
        !s.ruleStack.includes("castDataType")) ||
      // UNLIMITED is only a memory_limit value among resource group options
      (s.nextTokenType.name === "Unlimited" &&
        s.ruleStack.includes("resourceGroupOption") &&
        resourceGroupOptionKey(tokens) !== "memory_limit")
    )
  })
  const keepPermissionWord = filterPermissionSuggestions(tokens, suggestions)
  const result = suggestions
    .filter(keepPermissionWord)
    .filter(
      (s) =>
        // permissionToken accepts LIMIT as a third word (SET REFRESH LIMIT,
        // SET MEMORY LIMIT); only offer it where a permission continues so.
        // A password is free text: don't offer NULL / TRUE / FALSE there.
        !(
          s.ruleStack[s.ruleStack.length - 1] === "passwordValue" &&
          (s.nextTokenType.name === "Null" ||
            s.nextTokenType.name === "True" ||
            s.nextTokenType.name === "False")
        ) &&
        !(
          s.nextTokenType.name === "Limit" &&
          s.ruleStack[s.ruleStack.length - 1] === "permissionToken" &&
          !nextPermissionWords(tokens).has("LIMIT")
        ),
    )
    .map((s) => s.nextTokenType)

  // Walk every IdentifierKeyword path and union the category flags valid at
  // that position. Multiple paths may be alive simultaneously (Chevrotain
  // explores all reachable alternatives) — OR-ing covers all valid contexts.
  const flags = emptyCategoryFlags()
  for (const s of suggestions) {
    if (s.nextTokenType.name === "IdentifierKeyword") {
      accumulateFlags(flags, classifyIdentifierPath(s.ruleStack))
    }
  }

  // qualifiedStar fix: When computeContentAssist finds the qualifiedStar
  // path in selectItem (suggesting just Dot), the expression path is missed.
  // Detect this by checking if the suggestions are all from qualifiedStar,
  // then re-compute with the qualified reference collapsed to a single
  // identifier to get expression-path suggestions.
  if (
    suggestions.length > 0 &&
    suggestions.every((s) => s.ruleStack.includes("qualifiedStar"))
  ) {
    const collapsed = collapseTrailingQualifiedRef(tokens)
    if (collapsed) {
      try {
        const extra = computeContentAssistBudgeted(
          ruleName,
          collapsed,
        ).suggestions
        const seen = new Set(result.map((t) => t.name))
        for (const s of extra) {
          if (!seen.has(s.nextTokenType.name)) {
            seen.add(s.nextTokenType.name)
            result.push(s.nextTokenType)
          }
          if (s.nextTokenType.name === "IdentifierKeyword") {
            accumulateFlags(flags, classifyIdentifierPath(s.ruleStack))
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
  }

  // Check if an expression operator's ruleStack includes "whereClause".
  // Must check operators specifically — Chevrotain explores ahead into
  // not-yet-started WHERE paths even from JOIN ON positions.
  const isConditionContext = suggestions.some(
    (s) =>
      EXPRESSION_OPERATORS.has(s.nextTokenType.name) &&
      s.ruleStack.includes("whereClause"),
  )

  const contextKeywords = contextKeywordSuggestions(tokens, suggestions)
  if (fillOperandStart) contextKeywords.push("PREV", "LINEAR", "NONE")
  const contextFunctions = contextFunctionSuggestions(tokens, suggestions)

  const objectColumnRuleStack = suggestions.find(
    (s) =>
      s.nextTokenType.name === "IdentifierKeyword" &&
      (s.ruleStack.includes("keyColumn") || isExpiryPredicatePath(s.ruleStack)),
  )?.ruleStack

  return {
    nextTokenTypes: result,
    ...flags,
    isConditionContext,
    contextKeywords,
    contextFunctions,
    objectColumnRuleStack,
  }
}

// Placeholder scope names for key-column slots (not valid table names)
const DECLARED_COLUMNS_SCOPE = "<declared columns>"
const VIEW_OUTPUT_SCOPE = "<view output>"
/**
 * Placeholder scopes of key-column slots. When one is in scope the slot's
 * columns are known exactly, so the suggestion builder must not fall back to
 * every schema column when they resolve to nothing.
 */
export const KEY_COLUMN_SCOPES: ReadonlySet<string> = new Set([
  DECLARED_COLUMNS_SCOPE,
  VIEW_OUTPUT_SCOPE,
])

function namePart(token: IToken): string {
  if (
    token.tokenType.name === "QuotedIdentifier" ||
    token.tokenType.name === "StringLiteral"
  ) {
    const quote = token.image[0]
    return token.image
      .slice(1, -1)
      .split(quote + quote)
      .join(quote)
  }
  return token.image
}

/** Index of the `)` that closes the `(` at `open` (or tokens.length). */
function matchingParen(tokens: IToken[], open: number): number {
  let depth = 0
  for (let i = open; i < tokens.length; i++) {
    const name = tokens[i].tokenType.name
    if (name === "LParen") depth++
    else if (name === "RParen" && --depth === 0) return i
  }
  return tokens.length
}

/**
 * Output columns of a query, as a scope for a key-column slot:
 *  - named items (aliases, column names) become columns of the output;
 *  - `*` expands every FROM / JOIN source, `t.*` only the source aliased or
 *    named `t`;
 *  - a source that is a sub-query or a CTE (from this query's WITH or an
 *    enclosing one) expands to that query's output, recursively; a physical
 *    table is returned as a table, whose columns come from the schema.
 */
function queryOutput(
  query: Record<string, unknown>,
  ctes: ReadonlyMap<string, Record<string, unknown>> = new Map(),
  depth = 0,
): { columns: { name: string; type: string }[]; tables: TableRef[] } {
  const columns: { name: string; type: string }[] = []
  const tables: TableRef[] = []
  if (depth > 8) return { columns, tables }

  // CTEs visible inside this query: its own WITH plus the enclosing ones
  const env = new Map(ctes)
  for (const cte of Array.isArray(query.with) ? query.with : []) {
    const c = cte as { name?: unknown; query?: unknown }
    if (typeof c.name === "string" && c.query && typeof c.query === "object") {
      env.set(c.name.toLowerCase(), c.query as Record<string, unknown>)
    }
  }

  // FROM / JOIN / comma sources with their aliases
  type Source = { table: unknown; alias?: string }
  const sources: Source[] = []
  const addSource = (ref: unknown) => {
    const r = ref as { table?: unknown; alias?: unknown } | undefined
    if (!r) return
    sources.push({
      table: r.table,
      alias: typeof r.alias === "string" ? r.alias : undefined,
    })
  }
  for (const ref of Array.isArray(query.from) ? query.from : []) {
    addSource(ref)
    const joins = (ref as { joins?: { table?: unknown }[] }).joins ?? []
    for (const join of joins) addSource(join.table) // join.table is a tableRef
  }

  const expand = (source: Source) => {
    const src = source.table as Record<string, unknown> | undefined
    if (!src) return
    if (src.type === "select") {
      const inner = queryOutput(src, env, depth + 1)
      columns.push(...inner.columns)
      tables.push(...inner.tables)
      return
    }
    const name = normalizeTableName(src)
    if (!name) return
    const cte = env.get(name.toLowerCase())
    if (cte) {
      const inner = queryOutput(cte, env, depth + 1)
      columns.push(...inner.columns)
      tables.push(...inner.tables)
    } else {
      tables.push({ table: name })
    }
  }
  const matches = (source: Source, qualifier: string) => {
    const q = qualifier.toLowerCase()
    if (source.alias) return source.alias.toLowerCase() === q
    return normalizeTableName(source.table)?.toLowerCase() === q
  }

  for (const item of Array.isArray(query.columns) ? query.columns : []) {
    const it = item as { type?: string; qualifier?: unknown } | null
    if (it?.type === "star") {
      sources.forEach(expand)
    } else if (it?.type === "qualifiedStar") {
      const parts = (it.qualifier as { parts?: string[] } | undefined)?.parts
      const qualifier = parts?.[parts.length - 1]
      if (qualifier)
        sources.filter((s) => matches(s, qualifier)).forEach(expand)
    } else {
      columns.push(...extractCteColumnNames([item]))
    }
  }
  return { columns, tables }
}

/** Scope for a key-column slot from the query text between `first` and `last`. */
function queryOutputScope(
  body: IToken[],
  fullSql: string,
  scopeName: string,
):
  | {
      tables: TableRef[]
      columns: Record<string, { name: string; type: string }[]>
    }
  | undefined {
  if (body.length === 0) return undefined
  const last = body[body.length - 1]
  const sql = fullSql.substring(
    body[0].startOffset,
    last.startOffset + last.image.length,
  )
  let ast: Statement[]
  try {
    ast = visitor.visit(parseRaw(sql).cst) as Statement[]
  } catch {
    return undefined
  }
  const query = ast[0] as unknown as Record<string, unknown> | undefined
  if (!query || query.type !== "select") return undefined
  const out = queryOutput(query)
  return {
    tables: [{ table: scopeName }, ...out.tables],
    columns: { [scopeName.toLowerCase()]: out.columns },
  }
}

/**
 * Scope for DEDUP keys and EXPIRE ROWS KEEP / WHEN columns. These name a
 * column of the table or view being defined or altered (the server resolves
 * them against the new table's columns / the query's output metadata):
 *  - CREATE TABLE (cols ...): the column definitions of the statement;
 *  - CREATE TABLE ... AS (query) and CREATE MATERIALIZED VIEW: the query's
 *    output (see queryOutput);
 *  - ALTER MATERIALIZED VIEW: the named target, even with an unfinished policy;
 *  - ALTER TABLE: the target, already in scope.
 * Returns undefined when the default scope applies.
 */
function objectColumnScope(
  ruleStack: string[],
  statementTokens: IToken[],
  fullSql: string,
):
  | {
      tables: TableRef[]
      columns: Record<string, { name: string; type: string }[]>
    }
  | undefined {
  // The query after AS: `AS ( query )` or an unparenthesized query that ends
  // before the clause the slot belongs to.
  const queryAfter = (as: number, stopAt: string): IToken[] => {
    let start = as + 1
    let end: number
    if (statementTokens[start]?.tokenType.name === "LParen") {
      end = matchingParen(statementTokens, start)
      start++
    } else {
      end = statementTokens.findIndex(
        (t, i) => i > as && t.tokenType.name === stopAt,
      )
      if (end < 0) end = statementTokens.length
    }
    return statementTokens.slice(start, end)
  }

  if (ruleStack.includes("createTableBody")) {
    const table = statementTokens.findIndex((t) => t.tokenType.name === "Table")
    // Whichever comes first after TABLE <name>: `(` (columns) or AS (CTAS)
    const next = statementTokens.findIndex(
      (t, i) =>
        i > table &&
        (t.tokenType.name === "LParen" || t.tokenType.name === "As"),
    )
    if (table < 0 || next < 0) return undefined
    if (statementTokens[next].tokenType.name === "As") {
      return queryOutputScope(
        queryAfter(next, "Timestamp"),
        fullSql,
        DECLARED_COLUMNS_SCOPE,
      )
    }
    const close = matchingParen(statementTokens, next)
    const cols: { name: string; type: string }[] = []
    let depth = 0
    let expectName = true
    for (let i = next + 1; i < close; i++) {
      const name = statementTokens[i].tokenType.name
      if (name === "LParen") depth++
      else if (name === "RParen") depth--
      else if (depth === 0 && name === "Comma") expectName = true
      else if (depth === 0 && expectName) {
        expectName = false
        if (name === "Like") return undefined // CREATE TABLE t (LIKE x)
        cols.push({ name: namePart(statementTokens[i]), type: "" })
      }
    }
    if (cols.length === 0) return undefined
    return {
      tables: [{ table: DECLARED_COLUMNS_SCOPE }],
      columns: { [DECLARED_COLUMNS_SCOPE.toLowerCase()]: cols },
    }
  }
  if (ruleStack.includes("alterMaterializedViewStatement")) {
    const view = statementTokens.findIndex((t) => t.tokenType.name === "View")
    let target = view + 1
    if (view < 0 || !statementTokens[target]) return undefined
    while (statementTokens[target + 1]?.tokenType.name === "Dot") target += 2
    if (!statementTokens[target]) return undefined
    return {
      // The placeholder also disables global fallback when schema metadata
      // for the target is unavailable.
      tables: [
        { table: VIEW_OUTPUT_SCOPE },
        { table: namePart(statementTokens[target]) },
      ],
      columns: { [VIEW_OUTPUT_SCOPE.toLowerCase()]: [] },
    }
  }
  if (ruleStack.includes("createMaterializedViewBody")) {
    const as = statementTokens.findIndex((t) => t.tokenType.name === "As")
    if (as < 0) return undefined
    return queryOutputScope(
      queryAfter(as, "Expire"),
      fullSql,
      VIEW_OUTPUT_SCOPE,
    )
  }
  return undefined
}

/**
 * When tablesInScope is empty (no FROM/JOIN yet), try to infer a table name
 * from a trailing qualified reference before the cursor.
 * e.g. "SELECT trades." → infer "trades" as table in scope.
 */
function inferTableFromQualifiedRef(
  tokensBefore: IToken[],
  isMidWord: boolean,
): TableRef | null {
  // If mid-word, the last token is a partial column name — look before it.
  const effective = isMidWord ? tokensBefore.slice(0, -1) : tokensBefore
  const lastIdx = effective.length - 1
  if (lastIdx < 1) return null
  if (effective[lastIdx].tokenType.name !== "Dot") return null

  const tableToken = effective[lastIdx - 1]
  if (!isIdentifierLikeTokenName(tableToken.tokenType.name)) return null

  const table =
    tableToken.tokenType.name === "QuotedIdentifier"
      ? tableToken.image.slice(1, -1)
      : tableToken.image

  return { table }
}

/**
 * Extract bare column names referenced in expression context from a token list.
 *
 * Scans the tokens and collects identifier names that are likely column
 * references, excluding:
 * - Qualified identifiers (followed by a Dot token — table/alias qualifiers)
 * - Middle segments of multi-part names (preceded AND followed by a Dot)
 * - Known table names and aliases (matched against tableAndAliasSet)
 * - Function calls (followed by a left-parenthesis token)
 *
 * @param tokens - Tokens to scan
 * @param tableAndAliasSet - Lowercase table names and aliases already in scope
 *   (built from tablesInScope by the caller). Identifiers matching any of these
 *   are excluded because they are table/alias references, not column names.
 *
 * Returns a Set of lowercase column names for efficient lookup.
 */
export function extractReferencedColumns(
  tokens: IToken[],
  tableAndAliasSet: Set<string>,
): Set<string> {
  const result = new Set<string>()

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const name = token.tokenType.name

    // Only consider identifier-like tokens
    if (
      name !== "Identifier" &&
      name !== "QuotedIdentifier" &&
      !IDENTIFIER_KEYWORD_TOKENS.has(name)
    ) {
      continue
    }

    // Exclude: followed by Dot → this is a table/alias qualifier (e.g. "t1" in "t1.col")
    if (i + 1 < tokens.length && tokens[i + 1].tokenType.name === "Dot") {
      continue
    }

    // Exclude: preceded by Dot AND followed by Dot → middle segment of a multi-part name.
    // But a trailing segment (preceded by Dot, NOT followed by Dot) IS a column name
    // (e.g. "ecn" in "c.ecn") and should be included for table ranking.
    if (
      i > 0 &&
      tokens[i - 1].tokenType.name === "Dot" &&
      i + 1 < tokens.length &&
      tokens[i + 1].tokenType.name === "Dot"
    ) {
      continue
    }

    // Exclude: followed by "(" → function call
    if (i + 1 < tokens.length && tokens[i + 1].tokenType.name === "LParen") {
      continue
    }

    const image =
      name === "QuotedIdentifier" ? token.image.slice(1, -1) : token.image
    const lower = image.toLowerCase()

    // Exclude: matches a known table name or alias → this is a table reference,
    // not a column name. This replaces the keyword-whitelist approach and is
    // grammar-aware: tablesInScope is already built from the parsed AST.
    if (tableAndAliasSet.has(lower)) {
      continue
    }

    result.add(lower)
  }

  return result
}

/**
 * Get content assist suggestions for a SQL string at a given cursor position
 *
 * @param fullSql - The complete SQL string
 * @param cursorOffset - The cursor position (0-indexed character offset)
 * @returns Content assist result with next valid tokens and tables in scope
 */
export function getContentAssist(
  fullSql: string,
  cursorOffset: number,
): ContentAssistResult {
  // Suppress suggestions when the cursor is inside any quoted string (single or double).
  // This covers both string literal values and single-quoted identifiers — while QuestDB
  // accepts single-quoted identifiers, providing completions inside quotes causes more
  // problems than it solves (prefix filtering breaks, ambiguity with string values).
  const fullTokens = QuestDBLexer.tokenize(fullSql).tokens
  for (const token of fullTokens) {
    if (
      token.tokenType.name !== "StringLiteral" &&
      token.tokenType.name !== "EscapeStringLiteral"
    )
      continue
    const start = token.startOffset
    const end = token.startOffset + token.image.length
    if (cursorOffset > start && cursorOffset < end) {
      return {
        nextTokenTypes: [],
        tablesInScope: [],
        cteColumns: {},
        tokensBefore: [],
        isMidWord: true,
        lexErrors: [],
        suggestColumns: false,
        suggestTables: false,
        suggestScalarFunctions: false,
        suggestAggregateFunctions: false,
        suggestWindowFunctions: false,
        suggestTableValuedFunctions: false,
        referencedColumns: new Set(),
        isConditionContext: false,
        contextKeywords: [],
        contextFunctions: [],
      }
    }
  }

  // Split the text at cursor position
  const beforeCursor = fullSql.substring(0, cursorOffset)

  // Tokenize text before cursor
  const lexResult = QuestDBLexer.tokenize(beforeCursor)
  const tokens = lexResult.tokens

  // Check if cursor is mid-word (last char before cursor is not whitespace/punctuation).
  // If so, the last token is a partial word the user is still typing.
  // Drop it before calling computeContentAssist so the parser tells us what's
  // valid at the position BEFORE that word. The caller filters by the prefix.
  // Structural characters like ( ) , ; are NOT mid-word — they are complete tokens.
  const lastChar =
    cursorOffset > 0 && cursorOffset <= fullSql.length
      ? fullSql[cursorOffset - 1]
      : " "
  const isMidWord = !WORD_BOUNDARY_CHARS.has(lastChar)
  const tokensForAssist =
    isMidWord && tokens.length > 0 ? tokens.slice(0, -1) : tokens

  // Get syntactically valid next tokens using Chevrotain's content assist
  let nextTokenTypes: TokenType[] = []
  let suggestColumns = false
  let suggestTables = false
  let suggestScalarFunctions = false
  let suggestAggregateFunctions = false
  let suggestWindowFunctions = false
  let suggestTableValuedFunctions = false
  let isConditionContext = false
  let contextKeywords: string[] = []
  let contextFunctions: string[] = []
  let objectColumnRuleStack: string[] | undefined
  try {
    const computed = computeSuggestions(tokensForAssist)
    objectColumnRuleStack = computed.objectColumnRuleStack
    nextTokenTypes = computed.nextTokenTypes
    suggestColumns = computed.suggestColumns
    suggestTables = computed.suggestTables
    suggestScalarFunctions = computed.suggestScalarFunctions
    suggestAggregateFunctions = computed.suggestAggregateFunctions
    suggestWindowFunctions = computed.suggestWindowFunctions
    suggestTableValuedFunctions = computed.suggestTableValuedFunctions
    isConditionContext = computed.isConditionContext
    contextKeywords = computed.contextKeywords
    contextFunctions = computed.contextFunctions
  } catch (e) {
    // If content assist fails, return empty suggestions
    // This can happen with malformed input
  }

  // Extract tables and CTE columns from the full query (reuses fullTokens from above)
  const { tables: tablesInScope, cteColumns } = extractTables(
    fullSql,
    fullTokens,
  )

  // If cursor is inside a CTE body, exclude the CTE itself from scope
  // to prevent self-reference (e.g., "WITH x AS (SELECT |)" shouldn't
  // suggest x's own columns). Also extract tables from the CTE body so
  // columns from the inner FROM/JOIN are available.
  const cursorCte = findCteContainingCursor(fullTokens, cursorOffset)
  if (cursorCte) {
    const cteNameLower = cursorCte.name.toLowerCase()
    // Remove self-reference from tablesInScope
    for (let j = tablesInScope.length - 1; j >= 0; j--) {
      if (tablesInScope[j].table.toLowerCase() === cteNameLower) {
        tablesInScope.splice(j, 1)
      }
    }
    // Remove self-reference from cteColumns
    delete cteColumns[cteNameLower]

    // Extract tables from the CTE body tokens so inner FROM/JOIN tables
    // are available for column scoping.
    const BODY_TABLE_PREFIXES = new Set(["From", "Join", "Update", "Into"])
    const seen = new Set(tablesInScope.map((t) => t.table.toLowerCase()))
    for (let j = cursorCte.bodyTokenStart; j < cursorCte.bodyTokenEnd; j++) {
      if (!BODY_TABLE_PREFIXES.has(fullTokens[j].tokenType.name)) continue
      const next = fullTokens[j + 1]
      if (
        next &&
        (next.tokenType.name === "Identifier" ||
          next.tokenType.name === "QuotedIdentifier" ||
          IDENTIFIER_KEYWORD_TOKENS.has(next.tokenType.name))
      ) {
        const tableName =
          next.tokenType.name === "QuotedIdentifier"
            ? next.image.slice(1, -1)
            : next.image
        const lower = tableName.toLowerCase()
        if (!seen.has(lower)) {
          seen.add(lower)
          tablesInScope.push({ table: tableName })
        }
      }
    }
  }

  // DEDUP keys and retention expressions bind against the object being
  // defined or altered, rather than the defining SELECT's source tables.
  if (objectColumnRuleStack) {
    let start = 0
    for (let j = 0; j < tokensForAssist.length; j++) {
      if (tokensForAssist[j].tokenType.name === "Semicolon") start = j + 1
    }
    const scope = objectColumnScope(
      objectColumnRuleStack,
      tokensForAssist.slice(start),
      fullSql,
    )
    if (scope) {
      tablesInScope.splice(0, tablesInScope.length, ...scope.tables)
      Object.assign(cteColumns, scope.columns)
      // Policy expressions can suggest functions, but table names and the
      // synthetic output scope are not operands. Nested SELECT paths retain
      // their ordinary table suggestions.
      if (isExpiryPredicatePath(objectColumnRuleStack)) suggestTables = false
    }
  }

  // Detect qualified reference context (e.g., "t1." or "trades.sym")
  // and extract the qualifier name so the provider can filter columns.
  const qualifiedRef = inferTableFromQualifiedRef(tokens, isMidWord)
  if (tablesInScope.length === 0 && qualifiedRef) {
    tablesInScope.push(qualifiedRef)
  }

  // Build a set of known table names and aliases so extractReferencedColumns
  // can exclude them without a keyword whitelist.
  const tableAndAliasSet = new Set<string>()
  for (const t of tablesInScope) {
    tableAndAliasSet.add(t.table.toLowerCase())
    if (t.alias) tableAndAliasSet.add(t.alias.toLowerCase())
  }

  // Extract bare column references for table ranking (use tokensForAssist so
  // a partial mid-word token isn't mistaken for a complete column name).
  const referencedColumns = extractReferencedColumns(
    tokensForAssist,
    tableAndAliasSet,
  )

  return {
    nextTokenTypes,
    tablesInScope,
    cteColumns,
    tokensBefore: tokens,
    isMidWord,
    lexErrors: lexResult.errors,
    qualifiedTableRef: qualifiedRef?.table,
    suggestColumns,
    suggestTables,
    suggestScalarFunctions,
    suggestAggregateFunctions,
    suggestWindowFunctions,
    suggestTableValuedFunctions,
    referencedColumns,
    isConditionContext,
    contextKeywords,
    contextFunctions,
  }
}

/**
 * Simplified version that just returns next valid token names
 */
export function getNextValidTokens(sql: string): string[] {
  const lexResult = QuestDBLexer.tokenize(sql)
  try {
    return computeSuggestions(lexResult.tokens).nextTokenTypes.map(
      (t) => t.name,
    )
  } catch (e) {
    return []
  }
}

/**
 * Check if a token type is expected at the current position
 */
export function isTokenExpected(sql: string, tokenName: string): boolean {
  const validTokens = getNextValidTokens(sql)
  return validTokens.includes(tokenName)
}
