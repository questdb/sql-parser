import { operandTokenNames } from "./classification"
import { StreamToken } from "./lexer"

export type Piece = {
  token: StreamToken
  gapBefore: string
  unary: boolean
  endsLine: boolean
}

const noSpaceBefore: ReadonlySet<string> = new Set([
  "Comma",
  "RParen",
  "RBracket",
  "Semicolon",
  "Dot",
  "DoubleColon",
  "Colon",
  "LBracket",
])

const noSpaceAfter: ReadonlySet<string> = new Set([
  "LParen",
  "LBracket",
  "Dot",
  "DoubleColon",
  "Colon",
])

const isComment = (piece: Piece) =>
  piece.token.kind === "lineComment" || piece.token.kind === "blockComment"

const isNumber = (piece: Piece) => piece.token.tokenName === "NumberLiteral"

const isUncertain = (piece: Piece) =>
  piece.token.kind === "opaque" || piece.token.kind === "tolerant"

export const isSign = (piece: Piece) =>
  piece.token.tokenName === "Minus" || piece.token.tokenName === "Plus"

export const isOperand = (piece: Piece | null) =>
  piece !== null &&
  piece.token.tokenName !== null &&
  operandTokenNames.has(piece.token.tokenName)

const preserved = (next: Piece) => (next.gapBefore === "" ? "" : " ")

export const gapBetween = (previous: Piece | null, next: Piece): string => {
  if (previous === null) return ""
  if (previous.token.kind === "lineComment" || previous.endsLine) return ""
  if (isUncertain(previous) || isUncertain(next)) return next.gapBefore
  if (previous.token.kind === "operator" && next.token.kind === "operator") {
    return preserved(next)
  }
  if (previous.unary && !isComment(next)) return ""
  const previousName = previous.token.tokenName
  const nextName = next.token.tokenName
  if (nextName === "Dot" && isNumber(previous)) return " "
  if (previousName === "Dot" && isNumber(next)) return " "
  if (nextName !== null && noSpaceBefore.has(nextName)) return ""
  if (previousName !== null && noSpaceAfter.has(previousName)) return ""
  if (nextName === "LParen" && previous.token.kind === "word") {
    return preserved(next)
  }
  return " "
}
