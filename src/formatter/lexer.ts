import { createToken, Lexer, TokenType } from "chevrotain"
import {
  allTokens,
  BlockComment,
  LineComment,
  QuotedIdentifier,
  StringLiteral,
  WhiteSpace,
} from "../parser/lexer"
import { classify, SignificantKind } from "./classification"

export type StreamTokenKind =
  | SignificantKind
  | "whitespace"
  | "lineComment"
  | "blockComment"
  | "tolerant"
  | "opaque"

export type StreamToken = {
  kind: StreamTokenKind
  image: string
  startOffset: number
  endOffset: number
  tokenName: string | null
}

const TRIVIA_GROUP = "trivia"

const FormatterWhiteSpace = createToken({
  name: "WhiteSpace",
  pattern: /\s+/,
  group: TRIVIA_GROUP,
  line_breaks: true,
})

const FormatterLineComment = createToken({
  name: "LineComment",
  pattern: /--[^\n\r]*/,
  group: TRIVIA_GROUP,
})

const FormatterBlockComment = createToken({
  name: "BlockComment",
  pattern: /\/\*[\s\S]*?\*\//,
  group: TRIVIA_GROUP,
  line_breaks: true,
})

const matchUnterminatedQuoted =
  (quote: string) =>
  (text: string, offset: number): [string] | null => {
    if (text[offset] !== quote) return null
    let index = offset + 1
    while (index < text.length) {
      if (text[index] === quote) {
        if (text[index + 1] === quote) {
          index += 2
          continue
        }
        return null
      }
      index++
    }
    return [text.slice(offset)]
  }

const matchUnterminatedBlockComment = (
  text: string,
  offset: number,
): [string] | null => {
  if (!text.startsWith("/*", offset)) return null
  if (text.indexOf("*/", offset + 2) !== -1) return null
  return [text.slice(offset)]
}

const UnterminatedBlockComment = createToken({
  name: "UnterminatedBlockComment",
  pattern: { exec: matchUnterminatedBlockComment },
  line_breaks: true,
  start_chars_hint: ["/"],
})

const UnterminatedString = createToken({
  name: "UnterminatedString",
  pattern: { exec: matchUnterminatedQuoted("'") },
  line_breaks: true,
  start_chars_hint: ["'"],
})

const UnterminatedQuotedIdentifier = createToken({
  name: "UnterminatedQuotedIdentifier",
  pattern: { exec: matchUnterminatedQuoted('"') },
  line_breaks: true,
  start_chars_hint: ['"'],
})

const tolerantTokenNames: ReadonlySet<string> = new Set([
  UnterminatedBlockComment.name,
  UnterminatedString.name,
  UnterminatedQuotedIdentifier.name,
])

const triviaKinds: Record<string, StreamTokenKind> = {
  [FormatterWhiteSpace.name]: "whitespace",
  [FormatterLineComment.name]: "lineComment",
  [FormatterBlockComment.name]: "blockComment",
}

export const buildFormatterTokens = (): TokenType[] =>
  allTokens.flatMap((token) => {
    if (token === WhiteSpace) return [FormatterWhiteSpace]
    if (token === LineComment) return [FormatterLineComment]
    if (token === BlockComment) {
      return [FormatterBlockComment, UnterminatedBlockComment]
    }
    if (token === StringLiteral) return [UnterminatedString, StringLiteral]
    if (token === QuotedIdentifier) {
      return [UnterminatedQuotedIdentifier, QuotedIdentifier]
    }
    return [token]
  })

export const formatterLexer = new Lexer(buildFormatterTokens(), {
  positionTracking: "onlyOffset",
})

export const scan = (sql: string): StreamToken[] => {
  const result = formatterLexer.tokenize(sql)

  const significant = result.tokens.map(
    (token): StreamToken => ({
      kind: tolerantTokenNames.has(token.tokenType.name)
        ? "tolerant"
        : classify(token.tokenType.name),
      image: token.image,
      startOffset: token.startOffset,
      endOffset: token.startOffset + token.image.length,
      tokenName: tolerantTokenNames.has(token.tokenType.name)
        ? null
        : token.tokenType.name,
    }),
  )

  const trivia = (result.groups[TRIVIA_GROUP] ?? []).map(
    (token): StreamToken => ({
      kind: triviaKinds[token.tokenType.name],
      image: token.image,
      startOffset: token.startOffset,
      endOffset: token.startOffset + token.image.length,
      tokenName: null,
    }),
  )

  const opaque = result.errors.map(
    (error): StreamToken => ({
      kind: "opaque",
      image: sql.slice(error.offset, error.offset + error.length),
      startOffset: error.offset,
      endOffset: error.offset + error.length,
      tokenName: null,
    }),
  )

  return [...significant, ...trivia, ...opaque].sort(
    (a, b) => a.startOffset - b.startOffset,
  )
}

export const reconstruct = (tokens: StreamToken[]): string =>
  tokens.map((token) => token.image).join("")
