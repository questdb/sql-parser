// =============================================================================
// Token Classification for Autocomplete
// =============================================================================
// These sets define how tokens are classified for autocomplete suggestions.
//
// IMPORTANT: The IDENTIFIER_KEYWORD_TOKENS set MUST match the parser's
// `identifier` rule alternatives. When you add a new keyword alternative
// to the identifier rule in parser.ts, add it here too.
//
// This is the SINGLE SOURCE OF TRUTH for autocomplete - the UI should NOT
// duplicate these definitions.
// =============================================================================

/**
 * Token types that represent actual identifiers
 */
export const IDENTIFIER_TOKENS = new Set(["Identifier", "QuotedIdentifier", "IdentifierKeyword"]);

/**
 * Keywords that can be used as identifiers in the grammar.
 *
 * These are tokens that appear as alternatives in the parser's `identifier` rule.
 * When these appear in nextTokenTypes, it means an identifier/column is expected,
 * so we should suggest columns and tables, not these keywords.
 *
 * SYNC WITH: parser.ts `identifier` rule (lines ~1019-1060)
 */
export const IDENTIFIER_KEYWORD_TOKENS = new Set([
  // Data type keywords
  "Symbol",
  "Timestamp",
  "Date",
  "Time",
  "Int",
  "Integer",
  "Long",
  "Long128",
  "Long256",
  "Short",
  "Byte",
  "Float",
  "Double",
  "Boolean",
  "String",
  "Char",
  "Binary",
  "Uuid",
  "Ipv4",
  "Geohash",
  "Varchar",
  "Decimal",
  "Interval",
  "TimestampNs",
  // Common identifier-like keywords
  "Index",
  "Key",
  "Column",
  "Type",
  "Level",
  "Offset",
  "First",
  "Volume",
  "Start",
  "Current",
  "User",
  "Users",
  "Public",
  "Default",
  "View",
  // Time units (singular and plural, from grammar/constants.ts)
  "Hour",
  "Day",
  "Week",
  "Month",
  "Year",
  "Days",
  "Hours",
  "Months",
  "Weeks",
  "Years",
  "Minute",
  "Minutes",
  "Second",
  "Seconds",
  "Millisecond",
  "Milliseconds",
  "Microsecond",
  "Microseconds",
  "Nanosecond",
  "Nanoseconds",
  "Century",
  "Decade",
  "Millennium",
  "Quarter",
  "Dow",
  "Doy",
  "Epoch",
  "Isodow",
  "Isoyear",
  // Function name keywords
  "Replace",
  "Tables",
  "Format",
  "Header",
  "Query",
  "Enable",
  "Disable",
  "None",
  "Error",
  "System",
  "Http",
  // Entity/config keywords
  "Account",
  "Accounts",
  "Service",
  "Token",
  "Rest",
  "Password",
  "Partition",
  "Partitions",
  "PartitionBy",
  "Dedup",
  "Wal",
  "Bypass",
  "Batch",
  "No",
  "Groups",
  "Assume",
  "Database",
  "Backup",
  "Foreign",
  "Primary",
  "References",
  "Cascade",
  "Capacity",
  "Cancel",
  "Prevailing",
  "Writer",
  "Materialized",
  "Range",
  "Snapshot",
  "Unlock",
  "Refresh",
  // ALTER TABLE sub-operations
  "Add",
  "Attach",
  "Detach",
  "Convert",
  "Remove",
  "Squash",
  "Suspend",
  "Resume",
  "Release",
  // COPY/export parameters
  "Parquet",
  "ParquetVersion",
  "Abort",
  "Alias",
  "Base",
  "Complete",
  "CompressionCodec",
  "CompressionLevel",
  "DataPageSize",
  "Delimiter",
  "Exit",
  "Ignore",
  "Option",
  "Param",
  "Prepare",
  "RowGroupSize",
  "SkipRow",
  "SkipColumn",
  "Verification",
  // CREATE TABLE / DDL config
  "Atomic",
  "CommitLag",
  "Delay",
  "External",
  "Incremental",
  "MaxUncommittedRows",
  "O3MaxLag",
  "Ttl",
  "Deferred",
  // SHOW sub-keywords
  "Columns",
  "Keys",
  "List",
  "Parameters",
  "Permissions",
  "ServerVersion",
  "StatisticsEnabled",
  "Txn",
  "Within",
  // Config/metadata
  "Calendar",
  "Checkpoint",
  "Cumulative",
  "Isolation",
  "Jwk",
  "Length",
  "Manual",
  "Nocache",
  "Observation",
  "Overridable",
  "Owned",
  "Period",
  "Reindex",
  "Tolerance",
  "Transaction",
  "Zone",
  // Compression codecs
  "RawArrayEncoding",
  "Uncompressed",
  "Snappy",
  "Gzip",
  "Lz4",
  "Zstd",
  "Lz4Raw",
  "Brotli",
  "Lzo",
  // Other non-reserved keywords
  "Compile",
  "Delete",
  "Upsert",
  "Cache",
  "Exclusive",
  "Immediate",
  "Only",
  "Align",
  // New constants that can be used as identifiers
  "Ilp",
  "Native",
  "Pgwire",
  // Window frame keywords
  "Row",
  "Rows",
  "Preceding",
  "Following",
  "Unbounded",
  "Exclude",
  "Others",
  "Nulls",
  // SAMPLE BY keywords
  "Fill",
  "Every",
  "Prev",
  "Linear",
  // LATEST keyword (can be used as identifier/alias)
  "Latest",
]);

/**
 * Keywords that should always be suggested even when identifiers are allowed.
 * These are context-sensitive keywords that appear in expression positions.
 */
export const ALWAYS_SUGGEST_KEYWORDS = new Set([
  "Current",
]);

/**
 * Expression-continuation operators that are valid after any expression but
 * should be deprioritized so clause-level keywords (ASC, DESC, LIMIT, etc.)
 * appear first in the suggestion list.
 */
export const EXPRESSION_OPERATORS = new Set([
  "And",
  "Or",
  "Not",
  "Between",
  "In",
  "Is",
  "Like",
  "Ilike",
  "Within",
  // Query connectors — valid after any complete query but should not
  // overshadow clause-level keywords the user is more likely typing.
  "Union",
  "Except",
  "Intersect",
]);

/**
 * Punctuation tokens — worth suggesting in fallback (e.g., "(" after "VALUES (1), ")
 */
export const PUNCTUATION_TOKENS = new Set([
  "LParen",
  "RParen",
  "Comma",
  "Semicolon",
  "LBracket",
  "RBracket",
]);

/**
 * Token types that should NOT be suggested (internal/structural tokens)
 */
export const SKIP_TOKENS = new Set([
  // Punctuation
  "LParen",
  "RParen",
  "Comma",
  "Dot",
  "Semicolon",
  "AtSign",
  "ColonEquals",
  "LBracket",
  "RBracket",
  // Comparison operators (suggest columns/values, not operators)
  "Equals",
  "NotEquals",
  "LessThan",
  "LessThanOrEqual",
  "GreaterThan",
  "GreaterThanOrEqual",
  // Arithmetic operators
  "Plus",
  "Minus",
  "Star",  // Note: Star is also SELECT * - handled specially
  "Divide",
  "Modulo",
  "Concat",
  "DoubleColon",
  "RegexMatch",
  "RegexNotMatch",
  "RegexNotEquals",
  // Bitwise operators
  "BitAnd",
  "BitXor",
  "BitOr",
  // Variable references (user-defined, can't suggest)
  "VariableReference",
  // Literals (don't suggest literal tokens)
  "StringLiteral",
  "NumberLiteral",
  "LongLiteral",
  "DecimalLiteral",
  "DurationLiteral",
  "GeohashLiteral",
  "GeohashBinaryLiteral",
  "Nan",
  // Whitespace
  "WhiteSpace",
]);

/**
 * Operator map for converting token names to display strings
 */
export const OPERATOR_MAP: Record<string, string> = {
  Star: "*",
  Plus: "+",
  Minus: "-",
  Divide: "/",
  Modulo: "%",
  Equals: "=",
  NotEquals: "!=",
  LessThan: "<",
  LessThanOrEqual: "<=",
  GreaterThan: ">",
  GreaterThanOrEqual: ">=",
  LParen: "(",
  RParen: ")",
  Comma: ",",
  Semicolon: ";",
};

/**
 * Convert a token type name to a keyword string for display
 * e.g., "Table" → "TABLE", "PartitionBy" → "PARTITION BY"
 */
export function tokenNameToKeyword(name: string): string {
  // Check if it's an operator
  if (OPERATOR_MAP[name]) {
    return OPERATOR_MAP[name];
  }

  // Convert PascalCase to UPPERCASE with spaces
  // e.g., "PartitionBy" → "PARTITION BY", "LatestOn" → "LATEST ON"
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").toUpperCase();
}

/**
 * Check if a token represents an identifier context
 */
export function isIdentifierToken(tokenName: string): boolean {
  return (
    IDENTIFIER_TOKENS.has(tokenName) || IDENTIFIER_KEYWORD_TOKENS.has(tokenName)
  );
}

/**
 * Check if a token should be skipped in suggestions
 */
export function shouldSkipToken(tokenName: string): boolean {
  return SKIP_TOKENS.has(tokenName);
}
