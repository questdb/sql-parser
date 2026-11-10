import { createToken, IToken, Lexer, TokenType } from "chevrotain"

// Import all keyword tokens from tokens.ts (auto-generated from grammar arrays)
// Re-export all named tokens for parser usage
import {
  IdentifierKeyword,
  keywordTokenArray,
  Abort,
  Account,
  Accounts,
  Add,
  Alias,
  Align,
  All,
  Alter,
  And,
  Any,
  As,
  Asc,
  Asof,
  Assume,
  Attach,
  Atomic,
  Backup,
  Base,
  Batch,
  Between,
  Binary,
  Boolean,
  BloomFilter,
  BloomFilterColumns,
  BloomFilterFpp,
  By,
  Bypass,
  Byte,
  Cache,
  Calendar,
  Cancel,
  Capacity,
  Cascade,
  Case,
  Cast,
  Char,
  Checkpoint,
  Column,
  Columns,
  Compile,
  Complete,
  CompressionCodec,
  CompressionLevel,
  CommitLag,
  Convert,
  Copy,
  Create,
  Cross,
  Cumulative,
  Current,
  Database,
  DataPageSize,
  Datestyle,
  Date,
  Day,
  Days,
  Decimal,
  Declare,
  Dedup,
  Deduplicate,
  Default,
  DefaultTransactionReadOnly,
  DeltaBinaryPacked,
  DeltaLengthByteArray,
  Deferred,
  Delay,
  Delete,
  Delimiter,
  Desc,
  Detach,
  Details,
  Disable,
  Distinct,
  Double,
  Drop,
  Else,
  Enable,
  End,
  Error,
  Every,
  Except,
  Exclude,
  Exclusive,
  Exists,
  Exit,
  Explain,
  External,
  False,
  Fill,
  First,
  Float,
  Following,
  For,
  Foreign,
  Format,
  From,
  Full,
  Geohash,
  Grant,
  Group,
  Groups,
  Header,
  Horizon,
  Hour,
  Hours,
  Http,
  If,
  Ignore,
  Ilike,
  Immediate,
  In,
  Include,
  Index,
  Inner,
  Insert,
  Incremental,
  Int,
  Integer,
  Intersect,
  Interval,
  Into,
  Ipv4,
  Is,
  Isolation,
  Jwk,
  Join,
  Keep,
  Key,
  Keys,
  Lateral,
  Latest,
  Left,
  Length,
  Level,
  Like,
  Limit,
  Linear,
  List,
  Lock,
  Long,
  Long128,
  Long256,
  Lt,
  Manual,
  Maps,
  Materialized,
  MaxIdentifierLength,
  MaxUncommittedRows,
  Microsecond,
  Microseconds,
  Millennium,
  Millisecond,
  Milliseconds,
  Minute,
  Minutes,
  Month,
  Months,
  NaN,
  Nanosecond,
  Nanoseconds,
  No,
  Nocache,
  None,
  Not,
  Null,
  Nulls,
  O3MaxLag,
  Observation,
  Offset,
  On,
  Only,
  Option,
  Or,
  Order,
  Ordinality,
  Others,
  Outer,
  Over,
  Overridable,
  Owned,
  Param,
  Parameters,
  Native,
  Parquet,
  ParquetVersion,
  PartitionBy,
  Partition,
  Partitions,
  Password,
  Period,
  Permissions,
  Pivot,
  Plain,
  Prepare,
  Preceding,
  Prev,
  Prevailing,
  Primary,
  Public,
  Query,
  Range,
  References,
  Refresh,
  Release,
  Reindex,
  Remove,
  Rename,
  Repair,
  Replace,
  Rest,
  Respect,
  Resume,
  Revoke,
  Right,
  RleDictionary,
  Row,
  RowGroupSize,
  Rows,
  Sample,
  SearchPath,
  Second,
  Seconds,
  Select,
  ServerVersion,
  ServerVersionNum,
  Service,
  Set,
  Short,
  Show,
  Skip,
  SkipColumn,
  SkipRow,
  Snapshot,
  Splice,
  Squash,
  StandardConformingStrings,
  Step,
  Start,
  StatisticsEnabled,
  String,
  Suspend,
  Symbol,
  System,
  Table,
  Tables,
  Then,
  Time,
  Timestamp,
  TimestampNs,
  To,
  Token,
  Tolerance,
  Transaction,
  TransactionIsolation,
  Transient,
  True,
  Truncate,
  Ttl,
  Txn,
  Type,
  Unbounded,
  Union,
  Unlock,
  Unlimited,
  Unnest,
  Unpivot,
  Update,
  Upsert,
  User,
  Users,
  Uuid,
  Vacuum,
  Values,
  Varchar,
  Verification,
  View,
  Volume,
  Wal,
  Week,
  Weeks,
  When,
  Where,
  Window,
  With,
  Within,
  Writer,
  Year,
  Years,
  Zone,
  RawArrayEncoding,
  Uncompressed,
  Snappy,
  Gzip,
  Lz4,
  Zstd,
  Lz4Raw,
  Brotli,
  Lzo,
  Storage,
  Subsample,
  Cube,
  Grouping,
  Rollup,
  Sets,
  Policy,
  Local,
  Remote,
  Rebase,
  Stats,
  Switch,
  Role,
  Status,
  Replica,
  Timeout,
  Expire,
  Cleanup,
  Cold,
  Force,
  Manager,
  Refresher,
  Highest,
  Lowest,
  Live,
  Flush,
  Anchor,
  Beginning,
  Now,
  Memory,
  Daily,
  Expression,
  Posting,
  Delta,
  Ef,
  Bitmap,
} from "./tokens"

// Re-export all keyword tokens for parser and external use
export { IdentifierKeyword }
export {
  Abort,
  Account,
  Accounts,
  Add,
  Alias,
  Align,
  All,
  Alter,
  And,
  Any,
  As,
  Asc,
  Asof,
  Assume,
  Attach,
  Atomic,
  Backup,
  Base,
  Batch,
  Between,
  Binary,
  Boolean,
  BloomFilter,
  BloomFilterColumns,
  BloomFilterFpp,
  By,
  Bypass,
  Byte,
  Cache,
  Calendar,
  Cancel,
  Capacity,
  Cascade,
  Case,
  Cast,
  Char,
  Checkpoint,
  Column,
  Columns,
  Compile,
  Complete,
  CompressionCodec,
  CompressionLevel,
  CommitLag,
  Convert,
  Copy,
  Create,
  Cross,
  Cumulative,
  Current,
  Database,
  DataPageSize,
  Datestyle,
  Date,
  Day,
  Days,
  Decimal,
  Declare,
  Dedup,
  Deduplicate,
  Default,
  DefaultTransactionReadOnly,
  DeltaBinaryPacked,
  DeltaLengthByteArray,
  Deferred,
  Delay,
  Delete,
  Delimiter,
  Desc,
  Detach,
  Details,
  Disable,
  Distinct,
  Double,
  Drop,
  Else,
  Enable,
  End,
  Error,
  Every,
  Except,
  Exclude,
  Exclusive,
  Exists,
  Exit,
  Explain,
  External,
  False,
  Fill,
  First,
  Float,
  Following,
  For,
  Foreign,
  Format,
  From,
  Full,
  Geohash,
  Grant,
  Group,
  Groups,
  Header,
  Horizon,
  Hour,
  Hours,
  Http,
  If,
  Ignore,
  Ilike,
  Immediate,
  In,
  Include,
  Index,
  Inner,
  Insert,
  Incremental,
  Int,
  Integer,
  Intersect,
  Interval,
  Into,
  Ipv4,
  Is,
  Isolation,
  Jwk,
  Join,
  Keep,
  Key,
  Keys,
  Lateral,
  Latest,
  Left,
  Length,
  Level,
  Like,
  Limit,
  Linear,
  List,
  Lock,
  Long,
  Long128,
  Long256,
  Lt,
  Manual,
  Maps,
  Materialized,
  MaxIdentifierLength,
  MaxUncommittedRows,
  Microsecond,
  Microseconds,
  Millennium,
  Millisecond,
  Milliseconds,
  Minute,
  Minutes,
  Month,
  Months,
  NaN,
  Nanosecond,
  Nanoseconds,
  No,
  Nocache,
  None,
  Not,
  Null,
  Nulls,
  O3MaxLag,
  Observation,
  Offset,
  On,
  Only,
  Option,
  Or,
  Order,
  Ordinality,
  Others,
  Outer,
  Over,
  Overridable,
  Owned,
  Param,
  Parameters,
  Native,
  Parquet,
  ParquetVersion,
  PartitionBy,
  Partition,
  Partitions,
  Password,
  Period,
  Permissions,
  Pivot,
  Plain,
  Prepare,
  Preceding,
  Prev,
  Prevailing,
  Primary,
  Public,
  Query,
  Range,
  References,
  Refresh,
  Release,
  Reindex,
  Remove,
  Rename,
  Repair,
  Replace,
  Rest,
  Respect,
  Resume,
  Revoke,
  Right,
  RleDictionary,
  Row,
  RowGroupSize,
  Rows,
  Sample,
  SearchPath,
  Second,
  Seconds,
  Select,
  ServerVersion,
  ServerVersionNum,
  Service,
  Set,
  Short,
  Show,
  Skip,
  SkipColumn,
  SkipRow,
  Snapshot,
  Splice,
  Squash,
  StandardConformingStrings,
  Step,
  Start,
  StatisticsEnabled,
  String,
  Suspend,
  Symbol,
  System,
  Table,
  Tables,
  Then,
  Time,
  Timestamp,
  TimestampNs,
  To,
  Token,
  Tolerance,
  Transaction,
  TransactionIsolation,
  Transient,
  True,
  Truncate,
  Ttl,
  Txn,
  Type,
  Unbounded,
  Union,
  Unlock,
  Unlimited,
  Unnest,
  Unpivot,
  Update,
  Upsert,
  User,
  Users,
  Uuid,
  Vacuum,
  Values,
  Varchar,
  Verification,
  View,
  Volume,
  Wal,
  Week,
  Weeks,
  When,
  Where,
  Window,
  With,
  Within,
  Writer,
  Year,
  Years,
  Zone,
  RawArrayEncoding,
  Uncompressed,
  Snappy,
  Gzip,
  Lz4,
  Zstd,
  Lz4Raw,
  Brotli,
  Lzo,
  Storage,
  Subsample,
  Cube,
  Grouping,
  Rollup,
  Sets,
  Policy,
  Local,
  Remote,
  Rebase,
  Stats,
  Switch,
  Role,
  Status,
  Replica,
  Timeout,
  Expire,
  Cleanup,
  Cold,
  Force,
  Manager,
  Refresher,
  Highest,
  Lowest,
  Live,
  Flush,
  Anchor,
  Beginning,
  Now,
  Memory,
  Daily,
  Expression,
  Posting,
  Delta,
  Ef,
  Bitmap,
}

// =============================================================================
// Operators & Symbols
// =============================================================================

export const Star = createToken({ name: "Star", pattern: /\*/ })
export const Comma = createToken({ name: "Comma", pattern: /,/ })
export const Semicolon = createToken({ name: "Semicolon", pattern: /;/ })
export const LParen = createToken({ name: "LParen", pattern: /\(/ })
export const RParen = createToken({ name: "RParen", pattern: /\)/ })
export const LBracket = createToken({ name: "LBracket", pattern: /\[/ })
export const RBracket = createToken({ name: "RBracket", pattern: /\]/ })
export const Colon = createToken({ name: "Colon", pattern: /:/ })
export const ColonEquals = createToken({ name: "ColonEquals", pattern: /:=/ })

// IPv4 Containment Operators (longest first to avoid conflicts)
export const IPv4ContainedByOrEqual = createToken({
  name: "IPv4ContainedByOrEqual",
  pattern: /<<=/,
})
export const IPv4ContainedBy = createToken({
  name: "IPv4ContainedBy",
  pattern: /<</,
  longer_alt: IPv4ContainedByOrEqual,
})
export const IPv4ContainsOrEqual = createToken({
  name: "IPv4ContainsOrEqual",
  pattern: />>=/,
})
export const IPv4Contains = createToken({
  name: "IPv4Contains",
  pattern: />>/,
  longer_alt: IPv4ContainsOrEqual,
})

// Comparison Operators (order matters - longer first)
export const NotEquals = createToken({ name: "NotEquals", pattern: /!=|<>/ })
export const LessThanOrEqual = createToken({
  name: "LessThanOrEqual",
  pattern: /<=/,
  longer_alt: IPv4ContainedByOrEqual,
})
export const GreaterThanOrEqual = createToken({
  name: "GreaterThanOrEqual",
  pattern: />=/,
  longer_alt: IPv4ContainsOrEqual,
})
export const LessThan = createToken({
  name: "LessThan",
  pattern: /</,
  longer_alt: IPv4ContainedBy,
})
export const GreaterThan = createToken({
  name: "GreaterThan",
  pattern: />/,
  longer_alt: IPv4Contains,
})
export const Equals = createToken({ name: "Equals", pattern: /=/ })

// Arithmetic Operators
export const Plus = createToken({ name: "Plus", pattern: /\+/ })
export const Minus = createToken({ name: "Minus", pattern: /-/ })
export const Divide = createToken({ name: "Divide", pattern: /\// })
export const Modulo = createToken({ name: "Modulo", pattern: /%/ })

// String Operators
export const Concat = createToken({ name: "Concat", pattern: /\|\|/ })

// Bitwise Operators
export const BitAnd = createToken({ name: "BitAnd", pattern: /&/ })
export const BitXor = createToken({ name: "BitXor", pattern: /\^/ })
export const BitOr = createToken({
  name: "BitOr",
  pattern: /\|/,
  longer_alt: Concat,
})

// Regex Operators
export const RegexMatch = createToken({ name: "RegexMatch", pattern: /~/ })
export const RegexNotMatch = createToken({
  name: "RegexNotMatch",
  pattern: /!~/,
})
export const RegexNotEquals = createToken({
  name: "RegexNotEquals",
  pattern: /~=/,
})

// Cast Operator
export const DoubleColon = createToken({ name: "DoubleColon", pattern: /::/ })

// Variable reference: @variableName — captured as a single token so that
// keywords after @ (e.g., @select, @window, @limit) are never tokenized
// as keyword tokens. DECLARE lets you use ANY word as a variable name.
export const VariableReference = createToken({
  name: "VariableReference",
  pattern: /@[a-zA-Z_\u0080-\uFFFF][a-zA-Z0-9_\u0080-\uFFFF]*/,
})

// Bare @ sign (only matches when not followed by a word character)
export const AtSign = createToken({ name: "AtSign", pattern: /@/ })

// Bind variables: `$1` (positional) and `:name` (named).
// Server: ExpressionNode.of types a token as BIND_VARIABLE when it is `$` +
// digits or starts with `:`. A named variable is glued in
// ExpressionParser.processColon: a lone `:` that does not follow a completed
// operand (literal, constant, `)`, `]`) and is not followed by whitespace takes
// the next token as its name. So `arr[1:n]` / `arr[i:j]` stay slices, while
// `x = :sym`, `IN (:a, :b)`, `LIMIT :n` and `arr[:1]` are bind variables.
// `::` and `:=` are matched earlier by DoubleColon / ColonEquals.
const POSITIONAL_BIND_VARIABLE = /\$\d+(?![\w$\u0080-\uFFFF])/y
// The name may contain `$` after its first character, like an identifier
// (`:a$b`); `:$1` stays a slice colon followed by a positional variable.
const NAMED_BIND_VARIABLE =
  /:[a-zA-Z0-9_\u0080-\uFFFF][a-zA-Z0-9_$\u0080-\uFFFF]*/y

const COMPLETED_OPERAND_TOKEN_NAMES: ReadonlySet<string> = new globalThis.Set([
  "Identifier",
  "QuotedIdentifier",
  "RParen",
  "RBracket",
  "BindVariable",
  "VariableReference",
  "True",
  "False",
  "Null",
  "Nan",
])

/**
 * Whether the token before a `:` ends an operand, which makes the colon an
 * array-slice separator rather than the start of a `:name` bind variable.
 * Keywords are operators / clause words (`= :x`, `LIMIT :x`, `THEN :x`)
 * except the value constants; a non-reserved keyword glued to the colon is a
 * column name (`arr[offset:n]`).
 */
function endsOperand(prev: IToken, colonOffset: number): boolean {
  const type = prev.tokenType
  if (COMPLETED_OPERAND_TOKEN_NAMES.has(type.name)) return true
  if (type.name.endsWith("Literal")) return true
  return (
    prev.endOffset !== undefined &&
    prev.endOffset + 1 === colonOffset &&
    (type.CATEGORIES ?? []).includes(IdentifierKeyword)
  )
}

function matchBindVariable(
  text: string,
  offset: number,
  tokens: IToken[],
): RegExpExecArray | null {
  const ch = text.charAt(offset)
  if (ch === "$") {
    POSITIONAL_BIND_VARIABLE.lastIndex = offset
    return POSITIONAL_BIND_VARIABLE.exec(text)
  }
  if (ch !== ":") return null
  const prev = tokens[tokens.length - 1]
  if (prev && endsOperand(prev, offset)) return null
  NAMED_BIND_VARIABLE.lastIndex = offset
  return NAMED_BIND_VARIABLE.exec(text)
}

export const BindVariable = createToken({
  name: "BindVariable",
  pattern: matchBindVariable,
  start_chars_hint: ["$", ":"],
  line_breaks: false,
})

// =============================================================================
// Literals
// =============================================================================

// Geohash literals: ##binary or #alphanumeric
export const GeohashBinaryLiteral = createToken({
  name: "GeohashBinaryLiteral",
  pattern: /##[01]+/,
})
export const GeohashLiteral = createToken({
  name: "GeohashLiteral",
  pattern: /#[a-z0-9/]+/i,
})

// Long256 hex literal: 0x1F, 0x7ee65ec7...  (FunctionParser.createConstant ->
// Numbers.extractLong256). Must be before NumberLiteral, which would otherwise
// match the leading "0" and leave "x1F" as an identifier.
export const HexLiteral = createToken({
  name: "HexLiteral",
  pattern: /0[xX][0-9a-fA-F]+\b/,
})

// Float / double suffix: 1.5f, 10f, 1e36f, 1e36d (FunctionParser.createConstant ->
// Numbers.parseFloat / parseDouble). `f` is not a duration unit, so it never
// collides with DurationLiteral. `d` is only treated as a double suffix after an
// exponent, because `1d` / `1.5d` are durations (days) in SAMPLE BY / TTL.
export const FloatLiteral = createToken({
  name: "FloatLiteral",
  pattern:
    /(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(([eE][+-]?\d[\d_]*)?[fF]|[eE][+-]?\d[\d_]*[dD])\b/,
})

// Long literal suffix: 100000L (must be before DurationLiteral and NumberLiteral)
export const LongLiteral = createToken({
  name: "LongLiteral",
  pattern: /\d[\d_]*[Ll]\b/,
})

// QuestDB DECIMAL literal with m suffix: 10.5m, 99.99m, and the exponent form
// 1.5e3m / 2.5e-3M (FunctionParser.createConstant -> DecimalParser.parse, which
// takes an exponent and `m` in either case). Integer + m (like 5m) and 1.5M
// stay DurationLiteral (minutes / months); the visitor types them as decimals
// in expressions. An exponent never forms a duration, so `[mM]` is safe there.
export const DecimalLiteral = createToken({
  name: "DecimalLiteral",
  pattern: /\d[\d_]*(\.\d[\d_]*m|(\.[\d_]*)?[eE][+-]?\d[\d_]*[mM])\b/,
})

// QuestDB time units for SAMPLE BY (e.g., 1h, 5m, 30s, 1d, 1M, 1y, 100T, 1U, 1.5d)
// and storage policy / TTL DDL (e.g., 2Y, 2W, 2D, 1M).
// SAMPLE BY units: n=nanos, u/U=micros, T=millis, ms=millis, s=seconds,
//   m=minutes, h/H=hours, d=days, w=weeks, M=months, y=years.
// Storage policy / TTL docs additionally use the uppercase canonical forms
//   H, D, W, M, Y for hour/day/week/month/year — QuestDB's TTL parser is
//   case-insensitive on the unit suffix (LowerCaseCharSequenceIntHashMap in
//   PartitionBy.ttlUnitToIndexMap), so we accept D/W/Y here too. Semantic
//   disambiguation (e.g. rejecting nanos in storage policy) is enforced by
//   per-context grammar rules.
// Supports decimal values like 1.5d, 0.5h.
// Multi-char units (ms, us, ns) must appear before single-char alternatives to
// avoid prefix match. `ns` is an o3MaxLag unit (SqlUtil.expectMicros).
// A duration ends at a word boundary: the server reads `1hour`, `1days`, `1sec`
// as one token and rejects it, so they must not lex as `1h` + `our`.
export const DurationLiteral = createToken({
  name: "DurationLiteral",
  pattern:
    /\d[\d_]*(\.\d[\d_]*)?(ms|us|ns|[smhdwyMDWYNnTUuH])(?![\w\u0080-\uFFFF])/,
})

// A number glued to a word that starts with a duration unit but is not a valid
// duration (`1hour`, `1days`, `1sec`, `100nsx`, `1.5hour`). The server lexer
// reads it as one token and rejects it ("Invalid unit: 1hour", "invalid
// interval qualifier", "invalid time unit"). No grammar rule accepts this
// token, so it is a parse error instead of `1` + `hour` (which would read as
// `TTL 1 HOUR` or `SELECT 1 AS hour`). Numbers glued to other letters keep
// splitting (`GEOHASH(8c)`, `MEMORY LIMIT 1G`). Must come after
// DurationLiteral and before NumberLiteral.
export const MalformedDurationLiteral = createToken({
  name: "MalformedDurationLiteral",
  pattern: /\d[\d_]*(\.\d[\d_]*)?[smhdwyMDWYNnTUuH][\w\u0080-\uFFFF]+/,
})

// Numbers (negation is handled as unary minus in the parser, not in the lexer)
// Must start with a digit or dot-digit to avoid matching identifiers starting with _
export const NumberLiteral = createToken({
  name: "NumberLiteral",
  pattern: /(\d[\d_]*\.?[\d_]*|\.\d[\d_]*)([eE][+-]?\d[\d_]*)?/,
})

// Dot is declared after NumberLiteral so longer_alt can reference it.
// When the lexer matches ".", it will also check if NumberLiteral gives a
// longer match (e.g. ".5"), and prefer that.
export const Dot = createToken({
  name: "Dot",
  pattern: /\./,
  longer_alt: [FloatLiteral, NumberLiteral],
})

// Strings — QuestDB follows PostgreSQL convention: backslash is literal,
// only '' (doubled single-quote) escapes a single quote.
export const StringLiteral = createToken({
  name: "StringLiteral",
  pattern: /'([^']|'')*'/,
})

// PostgreSQL escape-string constant: E'abc' (ExpressionParser case 'E',
// FunctionParser.createConstant strips the E and the quotes). Uppercase E only,
// glued to the quote, exactly as on the server. Must be before Identifier,
// which would otherwise match the "E" and leave the string as an alias.
export const EscapeStringLiteral = createToken({
  name: "EscapeStringLiteral",
  pattern: /E'([^']|'')*'/,
})

// Quoted Identifiers — same convention: "" escapes a double quote,
// backslash is literal. Backticks quote too (GenericLexer, Chars.isQuote):
// `BTC-USD_buy`. A backtick token has no escapes, it ends at the next
// backtick (`a``b` is two tokens, as on the server).
export const QuotedIdentifier = createToken({
  name: "QuotedIdentifier",
  pattern: /"([^"]|"")*"|`[^`]*`/,
})

// Identifiers (must come after keywords)
// Uses Unicode ranges to support non-ASCII identifiers (e.g., café, 日本語)
// \u0080-\uFFFF covers all non-ASCII characters; Chevrotain's regex analyzer
// cannot handle \p{L} Unicode property escapes, so we use explicit ranges.
// `$` is allowed after the first character (SqlParser.validateIdentifier:
// `a1$_`, `_a1$`); a leading `$` is a bind variable or an error.
export const Identifier = createToken({
  name: "Identifier",
  pattern: /[a-zA-Z_\u0080-\uFFFF][a-zA-Z0-9_$\u0080-\uFFFF]*/,
})

// =============================================================================
// Whitespace & Comments
// =============================================================================

export const WhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: Lexer.SKIPPED,
})

export const LineComment = createToken({
  name: "LineComment",
  pattern: /--[^\n\r]*/,
  group: Lexer.SKIPPED,
})

/**
 * End offset (exclusive) of the block comment that starts with `/*` at
 * `offset`, or -1 when it is never closed. Block comments nest: every `/*`
 * needs its own `*\/` (SqlUtil.fetchNext blockCount). Quotes and `--` inside
 * the comment are plain text.
 */
export function blockCommentEnd(text: string, offset: number): number {
  let depth = 0
  let index = offset
  while (index < text.length - 1) {
    const ch = text[index]
    const next = text[index + 1]
    if (ch === "/" && next === "*") {
      depth++
      index += 2
    } else if (ch === "*" && next === "/") {
      index += 2
      if (--depth === 0) return index
    } else {
      index++
    }
  }
  return -1
}

// A block comment that is never closed runs to the end of the input, as on
// the server (SqlParserTest.testBlockCommentUnclosed).
function matchBlockComment(text: string, offset: number): [string] | null {
  if (!text.startsWith("/*", offset)) return null
  const end = blockCommentEnd(text, offset)
  return [text.slice(offset, end === -1 ? text.length : end)]
}

export const BlockComment = createToken({
  name: "BlockComment",
  pattern: { exec: matchBlockComment },
  start_chars_hint: ["/"],
  line_breaks: true,
  group: Lexer.SKIPPED,
})

// =============================================================================
// Token List (ORDER MATTERS - longer patterns first)
// =============================================================================

export const allTokens: TokenType[] = [
  // Whitespace & Comments (skipped)
  WhiteSpace,
  LineComment,
  BlockComment,

  // Multi-char operators (before single-char)
  DoubleColon,
  ColonEquals,
  IPv4ContainedByOrEqual,
  IPv4ContainedBy,
  IPv4ContainsOrEqual,
  IPv4Contains,
  NotEquals,
  LessThanOrEqual,
  GreaterThanOrEqual,
  Concat,
  RegexNotMatch,
  RegexNotEquals,

  // Token category for non-reserved keywords (used as identifiers)
  IdentifierKeyword,

  // All keyword tokens (auto-generated from grammar arrays)
  // Keywords use word boundaries so order doesn't matter among them
  ...keywordTokenArray,

  // Single-char operators
  LessThan,
  GreaterThan,
  Equals,
  Plus,
  Minus,
  Star,
  Divide,
  Modulo,
  BitAnd,
  BitXor,
  BitOr,
  RegexMatch,
  BindVariable,
  Colon,
  VariableReference,
  AtSign,

  // Symbols
  Comma,
  Semicolon,
  Dot,
  LParen,
  RParen,
  LBracket,
  RBracket,

  // Literals (order matters - longer/more specific patterns first)
  GeohashBinaryLiteral,
  GeohashLiteral,
  HexLiteral,
  FloatLiteral,
  LongLiteral,
  DecimalLiteral,
  DurationLiteral,
  MalformedDurationLiteral,
  NumberLiteral,
  StringLiteral,
  EscapeStringLiteral,
  QuotedIdentifier,
  Identifier,
]

// =============================================================================
// Lexer Instance
// =============================================================================

export const QuestDBLexer = new Lexer(allTokens, { positionTracking: "full" })

export function tokenize(input: string) {
  const result = QuestDBLexer.tokenize(input)
  return result
}
