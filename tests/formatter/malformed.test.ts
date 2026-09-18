import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { format } from "../../src/formatter/index"
import { scan, StreamToken } from "../../src/formatter/lexer"
import {
  assertIdempotent,
  assertSameOperatorAdjacency,
  assertSameStream,
} from "./oracles"

const docsQueries: string[] = (
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "fixtures", "docs-queries.json"),
      "utf-8",
    ),
  ) as Array<{ query: string }>
).map((entry) => entry.query)

const FULL_TRUNCATION_QUERIES = 100
const RANDOM_TRUNCATIONS_PER_QUERY = 10

const createRandom = (seed: number) => {
  let state = seed >>> 0
  return (bound: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state % bound
  }
}

const significant = (sql: string): StreamToken[] =>
  scan(sql).filter((token) => token.kind !== "whitespace")

const insertAt = (sql: string, offset: number, text: string) =>
  sql.slice(0, offset) + text + sql.slice(offset)

const removeAt = (sql: string, offset: number, length: number) =>
  sql.slice(0, offset) + sql.slice(offset + length)

type Mutation = (sql: string, random: (bound: number) => number) => string[]

const truncations: Mutation = (sql, random) => {
  const offsets =
    docsQueries.indexOf(sql) < FULL_TRUNCATION_QUERIES
      ? Array.from({ length: sql.length }, (_, i) => i)
      : Array.from({ length: RANDOM_TRUNCATIONS_PER_QUERY }, () =>
          random(sql.length),
        )
  return offsets.map((offset) => sql.slice(0, offset))
}

const removeCloser: Mutation = (sql, random) => {
  const closers = significant(sql).filter(
    (token) => token.tokenName === "RParen" || token.tokenName === "RBracket",
  )
  if (closers.length === 0) return []
  const closer = closers[random(closers.length)]
  return [removeAt(sql, closer.startOffset, 1)]
}

const insertOpener: Mutation = (sql, random) => {
  const tokens = significant(sql)
  if (tokens.length === 0) return []
  const token = tokens[random(tokens.length)]
  return [insertAt(sql, token.startOffset, "(")]
}

const mismatchCloser: Mutation = (sql, random) => {
  const closers = significant(sql).filter(
    (token) => token.tokenName === "RParen",
  )
  if (closers.length === 0) return []
  const closer = closers[random(closers.length)]
  return [
    insertAt(removeAt(sql, closer.startOffset, 1), closer.startOffset, "]"),
  ]
}

const semicolonInsideParens: Mutation = (sql, random) => {
  const openers = significant(sql).filter(
    (token) => token.tokenName === "LParen",
  )
  if (openers.length === 0) return []
  const opener = openers[random(openers.length)]
  return [insertAt(sql, opener.endOffset, ";")]
}

const foreignTokens: Mutation = (sql, random) => {
  const tokens = significant(sql)
  if (tokens.length === 0) return []
  return ["$$$", "->", "<=>", "größe", "$$$'", "/*", "--"].map((text) =>
    insertAt(sql, tokens[random(tokens.length)].endOffset, ` ${text} `),
  )
}

const commentInsidePhrase: Mutation = (sql) => {
  const tokens = significant(sql)
  return tokens.flatMap((token, index) => {
    const next = tokens[index + 1]
    if (next === undefined) return []
    const phrase = `${token.tokenName} ${next.tokenName}`
    const isPhrase = [
      "Latest On",
      "Sample By",
      "Group By",
      "Order By",
      "Partition By",
      "Asof Join",
      "Add Column",
      "Union All",
    ].includes(phrase)
    return isPhrase ? [insertAt(sql, token.endOffset, " /* c */")] : []
  })
}

const mutations: Record<string, Mutation> = {
  truncations,
  removeCloser,
  insertOpener,
  mismatchCloser,
  semicolonInsideParens,
  foreignTokens,
  commentInsidePhrase,
}

const failuresFor = (mutate: Mutation, seed: number) => {
  const random = createRandom(seed)
  const failures: string[] = []
  for (const query of docsQueries) {
    for (const input of mutate(query, random)) {
      try {
        const output = format(input)
        assertSameStream(input, output)
        assertSameOperatorAdjacency(input, output)
        assertIdempotent(input)
      } catch (error) {
        failures.push(
          `${JSON.stringify(input)}\n${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }
  return failures
}

describe("malformed input", () => {
  it.each(
    Object.entries(mutations).map(
      ([name, mutate], index) => [name, mutate, index] as const,
    ),
  )("%s never throws and preserves the stream", (_name, mutate, index) => {
    const failures = failuresFor(mutate, 1000 + index)
    expect(failures.slice(0, 5)).toEqual([])
    expect(failures).toHaveLength(0)
  })
})
