import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { Lexer } from "chevrotain"
import { allTokens } from "../../src/parser/lexer"
import {
  delimiterTokenNames,
  operatorTokenNames,
  wordTokenNames,
} from "../../src/formatter/classification"
import {
  buildFormatterTokens,
  reconstruct,
  scan,
  StreamToken,
} from "../../src/formatter/lexer"

const docsQueries: string[] = (
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "fixtures", "docs-queries.json"),
      "utf-8",
    ),
  ) as Array<{ query: string }>
).map((entry) => entry.query)

const signature = (tokens: StreamToken[]) =>
  tokens
    .filter((token) => token.kind !== "whitespace")
    .map((token) => `${token.kind}:${token.image}`)

describe("formatter lexer definition", () => {
  it("classifies every parser token", () => {
    // Given
    const triviaNames = new Set(["WhiteSpace", "LineComment", "BlockComment"])
    const unclassified = allTokens
      .filter((token) => !triviaNames.has(token.name))
      .filter((token) => token.PATTERN !== Lexer.NA)
      .map((token) => token.name)
      .filter(
        (name) =>
          !wordTokenNames.has(name) &&
          !operatorTokenNames.has(name) &&
          !delimiterTokenNames.has(name),
      )

    // Then
    expect(unclassified).toEqual([])
  })

  it("builds without definition errors and keeps first-character optimization", () => {
    // When / Then
    expect(
      () =>
        new Lexer(buildFormatterTokens(), {
          positionTracking: "onlyOffset",
          ensureOptimizations: true,
        }),
    ).not.toThrow()
  })

  it("does not mutate the parser token list", () => {
    // Given
    const parserNames = allTokens.map((token) => token.name)

    // When
    buildFormatterTokens()

    // Then
    expect(allTokens.map((token) => token.name)).toEqual(parserNames)
    expect(parserNames).not.toContain("UnterminatedString")
  })
})

describe("scan", () => {
  it("reconstructs every docs query exactly", () => {
    for (const query of docsQueries) {
      expect(reconstruct(scan(query))).toBe(query)
    }
  })

  it("keeps whitespace and comments as trivia tokens", () => {
    // Given
    const sql = "SELECT a -- one\n  /* two */ FROM t"

    // When
    const tokens = scan(sql)

    // Then
    expect(tokens.map((token) => token.kind)).toEqual([
      "word",
      "whitespace",
      "word",
      "whitespace",
      "lineComment",
      "whitespace",
      "blockComment",
      "whitespace",
      "word",
      "whitespace",
      "word",
    ])
    expect(reconstruct(tokens)).toBe(sql)
  })

  it("classifies operators and delimiters", () => {
    // Given
    const sql = "a::long <<= (b, c[1:2])"

    // When
    const tokens = signature(scan(sql))

    // Then
    expect(tokens).toEqual([
      "word:a",
      "operator:::",
      "word:long",
      "operator:<<=",
      "delimiter:(",
      "word:b",
      "delimiter:,",
      "word:c",
      "delimiter:[",
      "word:1",
      "operator::",
      "word:2",
      "delimiter:]",
      "delimiter:)",
    ])
  })

  it.each([
    ["'a''", ["tolerant:'a''"]],
    ["'a''b", ["tolerant:'a''b"]],
    ["'a' 'b", ["word:'a'", "tolerant:'b"]],
    ['"a""', ['tolerant:"a""']],
    ["x /* open", ["word:x", "tolerant:/* open"]],
    ["'x /* y' z", ["word:'x /* y'", "word:z"]],
    ["'x -- y' z", ["word:'x -- y'", "word:z"]],
    ["-- it's\nz", ["lineComment:-- it's", "word:z"]],
    ["/* it's */ z", ["blockComment:/* it's */", "word:z"]],
  ])("lexes %s tolerantly", (sql, expected) => {
    // When
    const tokens = scan(sql)

    // Then
    expect(signature(tokens)).toEqual(expected)
    expect(reconstruct(tokens)).toBe(sql)
  })

  it.each([
    ["'unterminated at start", 0],
    ["SELECT 'in the middle FROM t", 7],
    ["SELECT a FROM t WHERE x = '", 26],
  ])(
    "consumes the rest of the input from an unterminated string in %s",
    (sql, offset) => {
      // When
      const tokens = scan(sql)
      const tolerant = tokens.find((token) => token.kind === "tolerant")

      // Then
      expect(tolerant).toMatchObject({
        startOffset: offset,
        endOffset: sql.length,
      })
      expect(tokens[tokens.length - 1]).toBe(tolerant)
      expect(reconstruct(tokens)).toBe(sql)
    },
  )

  it("turns unknown characters into one opaque token", () => {
    // Given
    const sql = "SELECT a $$$ b"

    // When
    const tokens = scan(sql)

    // Then
    expect(signature(tokens)).toEqual([
      "word:SELECT",
      "word:a",
      "opaque:$$$",
      "word:b",
    ])
    expect(reconstruct(tokens)).toBe(sql)
  })

  it("keeps an opaque token adjacent to a tolerant token", () => {
    // Given
    const sql = "SELECT $'abc"

    // When
    const tokens = scan(sql)

    // Then
    expect(signature(tokens)).toEqual([
      "word:SELECT",
      "opaque:$",
      "tolerant:'abc",
    ])
    expect(reconstruct(tokens)).toBe(sql)
  })

  it("keeps offsets contiguous", () => {
    // Given
    const sql = "SELECT a,\n\tb $ FROM t /* c"

    // When
    const tokens = scan(sql)

    // Then
    tokens.forEach((token, index) => {
      expect(token.startOffset).toBe(
        index === 0 ? 0 : tokens[index - 1].endOffset,
      )
    })
    expect(tokens[tokens.length - 1].endOffset).toBe(sql.length)
  })
})
