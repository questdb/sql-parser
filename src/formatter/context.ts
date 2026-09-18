import { StreamToken } from "./lexer"

export type StatementKind =
  | "select"
  | "insert"
  | "update"
  | "createTable"
  | "createMaterializedView"
  | "createLiveView"
  | "alterTable"
  | "alterMaterializedView"
  | "other"

const selectStarters: ReadonlySet<string> = new Set([
  "Select",
  "With",
  "Declare",
  "Identifier",
  "QuotedIdentifier",
  "LParen",
])

export const isSignificant = (token: StreamToken) =>
  token.kind === "word" ||
  token.kind === "operator" ||
  token.kind === "delimiter"

export const isExplainPrefix = (token: StreamToken) =>
  token.tokenName === "Explain"

export const detectStatementKind = (tokens: StreamToken[]): StatementKind => {
  const names = tokens.filter(isSignificant).map((token) => token.tokenName)
  if (names[0] === "Explain") names.shift()
  const [first, second] = names

  if (first === undefined || first === null) return "other"
  if (selectStarters.has(first)) return "select"
  if (first === "Insert") return "insert"
  if (first === "Update") return "update"
  if (first === "Create") {
    if (second === "Table") return "createTable"
    if (second === "Materialized") return "createMaterializedView"
    if (second === "Live") return "createLiveView"
  }
  if (first === "Alter") {
    if (second === "Table") return "alterTable"
    if (second === "Materialized") return "alterMaterializedView"
  }
  return "other"
}
