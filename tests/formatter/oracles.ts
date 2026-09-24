import { expect } from "vitest"
import { parseToAst, toSql } from "../../src/index"
import { format, FormatOptions } from "../../src/formatter/index"
import { scan, StreamToken } from "../../src/formatter/lexer"
import { tokenize } from "../../src/parser/lexer"

const significant = (sql: string): StreamToken[] =>
  scan(sql).filter((token) => token.kind !== "whitespace")

export const streamSignature = (sql: string): string[] =>
  significant(sql).map((token) => `${token.kind}:${token.image}`)

export const assertSameStream = (input: string, output: string) => {
  expect(streamSignature(output)).toEqual(streamSignature(input))
}

const isOperator = (token: StreamToken) => token.kind === "operator"

const isUncertain = (token: StreamToken) =>
  token.kind === "opaque" || token.kind === "tolerant"

const adjacencyPairs = (sql: string) =>
  significant(sql).flatMap((token, index, tokens) => {
    const next = tokens[index + 1]
    if (next === undefined) return []
    const guarded =
      (isOperator(token) && isOperator(next)) ||
      isUncertain(token) ||
      isUncertain(next)
    if (!guarded) return []
    return [
      `${token.image}${next.startOffset > token.endOffset ? " " : ""}${next.image}`,
    ]
  })

export const assertSameOperatorAdjacency = (input: string, output: string) => {
  expect(adjacencyPairs(output)).toEqual(adjacencyPairs(input))
}

const lexemeSignature = (sql: string): string[] => {
  const result = tokenize(sql)
  return [
    ...result.tokens.map((token) => `${token.tokenType.name}:${token.image}`),
    ...result.errors.map(
      (error) =>
        `error:${sql.slice(error.offset, error.offset + error.length)}`,
    ),
  ]
}

export const assertSameLexemes = (input: string, output: string) => {
  expect(lexemeSignature(output)).toEqual(lexemeSignature(input))
}

const withoutWhitespace = (sql: string) => sql.replace(/\s+/g, "")

export const assertSameCharacters = (input: string, output: string) => {
  expect(withoutWhitespace(output)).toBe(withoutWhitespace(input))
}

export const assertIdempotent = (sql: string, options?: FormatOptions) => {
  const once = format(sql, options)
  expect(format(once, options)).toBe(once)
}

const parsesCleanly = (sql: string) => parseToAst(sql).errors.length === 0

export const assertSameAst = (input: string, output: string) => {
  expect(parsesCleanly(output)).toBe(true)
  expect(toSql(parseToAst(output).ast)).toBe(toSql(parseToAst(input).ast))
}

export const assertPreserved = (input: string, options?: FormatOptions) => {
  const output = format(input, options)
  assertSameStream(input, output)
  assertSameOperatorAdjacency(input, output)
  if (!options?.capitalize) {
    assertSameCharacters(input, output)
    assertSameLexemes(input, output)
  }
  assertIdempotent(input, options)
  if (parsesCleanly(input)) assertSameAst(input, output)
}
