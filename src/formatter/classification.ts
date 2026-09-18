import { IdentifierKeyword, keywordTokenArray } from "../parser/tokens"

export type SignificantKind = "word" | "operator" | "delimiter"

export const operatorTokenNames: ReadonlySet<string> = new Set([
  "Star",
  "Plus",
  "Minus",
  "Divide",
  "Modulo",
  "Equals",
  "NotEquals",
  "LessThan",
  "GreaterThan",
  "LessThanOrEqual",
  "GreaterThanOrEqual",
  "IPv4ContainedBy",
  "IPv4ContainedByOrEqual",
  "IPv4Contains",
  "IPv4ContainsOrEqual",
  "Concat",
  "BitAnd",
  "BitXor",
  "BitOr",
  "RegexMatch",
  "RegexNotMatch",
  "RegexNotEquals",
  "DoubleColon",
  "ColonEquals",
  "Colon",
  "AtSign",
])

export const delimiterTokenNames: ReadonlySet<string> = new Set([
  "LParen",
  "RParen",
  "LBracket",
  "RBracket",
  "Comma",
  "Semicolon",
  "Dot",
])

const literalTokenNames = [
  "GeohashBinaryLiteral",
  "GeohashLiteral",
  "LongLiteral",
  "DecimalLiteral",
  "DurationLiteral",
  "NumberLiteral",
  "StringLiteral",
  "QuotedIdentifier",
  "Identifier",
  "VariableReference",
]

export const wordTokenNames: ReadonlySet<string> = new Set([
  ...keywordTokenArray.map((token) => token.name),
  ...literalTokenNames,
])

const nonReservedKeywordNames = keywordTokenArray
  .filter((token) => token.CATEGORIES?.includes(IdentifierKeyword))
  .map((token) => token.name)

export const operandTokenNames: ReadonlySet<string> = new Set([
  ...literalTokenNames,
  ...nonReservedKeywordNames,
  "Null",
  "True",
  "False",
  "NaN",
  "RParen",
  "RBracket",
])

export const classify = (tokenName: string): SignificantKind => {
  if (operatorTokenNames.has(tokenName)) return "operator"
  if (delimiterTokenNames.has(tokenName)) return "delimiter"
  return "word"
}
