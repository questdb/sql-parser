import { describe, expect, it } from "vitest"
import { format } from "../../src/formatter/index"
import {
  assertPreserved,
  assertSameCharacters,
  assertSameLexemes,
  assertSameStream,
} from "./oracles"

const splitLexemes = [
  "0x1F",
  "0xDEADbeef",
  "16777217.0f",
  "1.5f",
  "5c",
  "7b",
  "1500ns",
  "1.5L",
  "2h30m",
  "123abc",
  "1e",
]

const contexts = [
  (lexeme: string) => `SELECT id, ${lexeme} FROM t`,
  (lexeme: string) => `SELECT f(${lexeme}) FROM t`,
  (lexeme: string) => `SELECT * FROM t WHERE h = ${lexeme}`,
  (lexeme: string) => `SELECT -${lexeme}`,
  (lexeme: string) => `SELECT a[${lexeme}]`,
  (lexeme: string) => `INSERT INTO t VALUES (1, ${lexeme})`,
  (lexeme: string) => `CREATE TABLE g (h geohash(${lexeme}), ts timestamp)`,
]

describe("lexemes the lexer splits into several tokens", () => {
  it.each(
    splitLexemes.flatMap((lexeme) =>
      contexts.map((context) => [context(lexeme)] as const),
    ),
  )("keeps %s glued", (sql) => {
    assertPreserved(sql)
  })

  it("formats a hex literal without touching it", () => {
    // Given
    const sql = "SELECT id, 0x1F FROM t"

    // When
    const output = format(sql)

    // Then
    expect(output).toBe("SELECT id, 0x1F\nFROM t")
  })

  it("formats a geohash precision without touching it", () => {
    // Given
    const sql = "CREATE TABLE g (h geohash(5c), ts timestamp) timestamp(ts)"

    // When
    const output = format(sql)

    // Then
    expect(output).toBe(
      "CREATE TABLE g (\n  h geohash(5c),\n  ts timestamp\n) timestamp(ts)",
    )
  })

  it("does not start a clause inside a glued run", () => {
    // Given
    const sql = "SELECT 10.5mFROM FROM t"

    // When
    const output = format(sql)

    // Then
    expect(output).toBe("SELECT 10.5mFROM\nFROM t")
  })

  it("keeps a dot apart from a suffixed number", () => {
    // Given
    const sql = "SELECT t. 5m"

    // When
    const output = format(sql)

    // Then
    expect(output).toBe("SELECT t. 5m")
  })
})

const lexemes = [
  "SELECT",
  "FROM",
  "WHERE",
  "AND",
  "AS",
  "NULL",
  "key",
  "a",
  "x1F",
  "f",
  "café",
  "0",
  "1.5",
  ".5",
  "5.",
  "1e5",
  "1.5E+3",
  "1_000",
  "0x1F",
  "1.5f",
  "5c",
  "1500ns",
  "100L",
  "10.5m",
  "5m",
  "1d",
  "#sp052w92p1p8",
  "##0101",
  "#",
  "'a'",
  "'a''b'",
  "'abc",
  '"a"',
  '"abc',
  "+",
  "-",
  "*",
  "/",
  "%",
  "=",
  "!=",
  "<>",
  "<",
  "<=",
  ">",
  ">=",
  "<<",
  "<<=",
  ">>",
  ">>=",
  "||",
  "|",
  "&",
  "^",
  "~",
  "!~",
  "~=",
  "::",
  ":",
  ":=",
  "@",
  "!",
  "?",
  "$",
  "(",
  ")",
  "[",
  "]",
  ",",
  ";",
  ".",
  "--c\n",
  "/*c*/",
  "/*c",
  "@x",
  ":name",
  "$1",
]

const separators = ["", " ", "\n"]

describe("adjacent lexeme pairs", () => {
  it("never changes characters or lexemes for any pair", () => {
    // Given
    const pairs = lexemes.flatMap((left) =>
      lexemes.flatMap((right) =>
        separators.map((separator) => `${left}${separator}${right}`),
      ),
    )

    // When / Then
    for (const sql of pairs) {
      const output = format(sql)
      assertSameCharacters(sql, output)
      assertSameLexemes(sql, output)
      assertSameStream(sql, output)
    }
  })
})
