/**
 * Nested and unterminated block comments; empty statements (reports §3.1).
 *
 * Server: SqlUtil.fetchNext counts `/*` and `*\/` (blockCount), so block
 * comments nest (`SELECT 1 /* a /* b *\/ c *\/ FROM t`) and a comment that is
 * never closed runs to the end of the input (SqlParserTest.testBlockCommentUnclosed).
 * SqlCompilerImpl.compileBatch skips empty statements
 * (getNextValidTokenPosition): `select 1;;`, `;;`, `; /* c *\/`.
 *
 * Not replicated on purpose (server tokenizer artefacts):
 * - `--` inside a block comment starting a line comment;
 * - quoted text inside a block comment hiding a `*\/` (GenericLexer still
 *   reads quotes there, pairing an apostrophe with a later quote).
 *
 * Server queries live in tests/fixtures/server-queries.json
 * (feature "comments-empty-statements").
 */

import { describe, it, expect } from "vitest"
import {
  parseToAst,
  tokenize,
  createAutocompleteProvider,
  getNextValidTokens,
} from "../src/index"
import { toSql } from "../src/parser/toSql"
import { format } from "../src/formatter/index"
import { reconstruct, scan } from "../src/formatter/lexer"

const tokenTypes = (sql: string) =>
  tokenize(sql).tokens.map((t) => `${t.tokenType.name}:${t.image}`)

const parse = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors.map((e) => e.message)).toEqual([])
  return result.ast
}

const roundTrip = (sql: string, statements = 1) => {
  const ast = parse(sql)
  expect(ast).toHaveLength(statements)
  return toSql(ast)
}

const expectError = (sql: string) => {
  expect(parseToAst(sql).errors.length).toBeGreaterThan(0)
}

describe("nested block comments", () => {
  it.each([
    ["SELECT 1 /* a /* nested */ still */ FROM t", "SELECT 1 FROM t"],
    ["SELECT 1 /* a /* b /* c */ d */ e */ FROM t", "SELECT 1 FROM t"],
    ["SELECT /* /**/ */ 1", "SELECT 1"],
    ["SELECT /**/ 1", "SELECT 1"],
    ["SELECT /***/ 1", "SELECT 1"],
    ["SELECT a /* x */ + /* y /* z */ */ b FROM t", "SELECT a + b FROM t"],
    ["SELECT a FROM t /* ; SELECT b */", "SELECT a FROM t"],
  ])("%s", (sql, expected) => {
    expect(roundTrip(sql)).toBe(expected)
  })

  it("reads a comment nested in a hint (SqlParserTest:6427)", () => {
    // Not in the fixture: the formatter wraps this long hint differently on
    // a second pass (pre-existing, also without nesting).
    expect(
      roundTrip(
        "select /*+ NO_INDEX(a) /* THIS IS JUST A REGULAR COMMENT */ AFTER */ a,b,c from xyz where a = 1",
      ),
    ).toBe("SELECT a, b, c FROM xyz WHERE a = 1")
  })

  it("skips the whole nested comment in the lexer", () => {
    expect(tokenTypes("1 /* a /* b */ c */ 2")).toEqual([
      "NumberLiteral:1",
      "NumberLiteral:2",
    ])
  })

  it("keeps line numbers after a multi-line comment", () => {
    const tokens = tokenize("/* a\n/* b\n*/\n*/ x").tokens
    expect(tokens).toHaveLength(1)
    expect(tokens[0].startLine).toBe(4)
  })

  it("does not treat -- inside a block comment as a line comment", () => {
    expect(roundTrip("SELECT 1 /* -- not a line comment */ FROM t")).toBe(
      "SELECT 1 FROM t",
    )
    expect(roundTrip("SELECT 1 /* a -- b \n */ FROM t")).toBe("SELECT 1 FROM t")
  })

  it("does not let quotes inside a block comment hide its end", () => {
    // Server quirk not replicated: there the apostrophe pairs with the next
    // quote, the comment never closes and only `SELECT 1` remains.
    expect(roundTrip("SELECT 1 /* don't */ FROM t WHERE s = 'x'")).toBe(
      "SELECT 1 FROM t WHERE s = 'x'",
    )
    expect(roundTrip("SELECT 1 /* '*/ FROM t")).toBe("SELECT 1 FROM t")
  })

  it("keeps comment markers inside strings and quoted identifiers", () => {
    expect(roundTrip("SELECT '/* x' FROM t")).toBe("SELECT '/* x' FROM t")
    expect(roundTrip('SELECT "*/" FROM t')).toBe('SELECT "*/" FROM t')
    expect(roundTrip("SELECT 1 -- /* x\nFROM t")).toBe("SELECT 1 FROM t")
  })

  it("leaves a stray */ outside a comment as operators", () => {
    expectError("SELECT 1 */ FROM t")
    expect(tokenTypes("2 */ 3")).toEqual([
      "NumberLiteral:2",
      "Star:*",
      "Divide:/",
      "NumberLiteral:3",
    ])
  })
})

describe("unterminated block comments", () => {
  it.each([
    ["SELECT 1 /* trailing", "SELECT 1"],
    ["SELECT 1 /* trailing\nFROM t", "SELECT 1"],
    ["SELECT 1 FROM t /* a /* b */", "SELECT 1 FROM t"],
    ["SELECT 1 FROM t /*", "SELECT 1 FROM t"],
    ["SELECT 1 FROM t /*/", "SELECT 1 FROM t"],
  ])("%s runs to the end of the input", (sql, expected) => {
    expect(roundTrip(sql)).toBe(expected)
  })

  it("leaves no tokens behind", () => {
    expect(tokenTypes("1 /* a /* b */ 2")).toEqual(["NumberLiteral:1"])
    expect(tokenize("1 /* a").errors).toEqual([])
  })

  it("still rejects a statement that the comment cuts short", () => {
    // SqlParserTest:6596 `select /* HINT_A` -> "[distinct] column expected"
    expectError("select /* HINT_A")
    expectError("SELECT * FROM t WHERE /* x")
  })

  it("is only a comment input when nothing precedes it", () => {
    expect(roundTrip("/* only a comment", 0)).toBe("")
  })
})

describe("empty statements", () => {
  it.each([
    ["SELECT 1;; ; SELECT 1 ; SELECT 1; /* c */ ;", 3],
    ["select 1;;", 1],
    ["; SELECT 1", 1],
    [";;SELECT 1;;SELECT 2;;", 2],
    ["SELECT 1;\n;\nSELECT 2;", 2],
    [";", 0],
    [";;", 0],
    [" ; ; ", 0],
    ["; -- c\n; /* d */ ;", 0],
    ["", 0],
  ])("%s", (sql, count) => {
    expect(parse(sql)).toHaveLength(count)
  })

  it("prints only the real statements", () => {
    expect(roundTrip("SELECT 1;; ; SELECT 1 ; SELECT 1; /* c */ ;", 3)).toBe(
      "SELECT 1;\nSELECT 1;\nSELECT 1",
    )
    expect(roundTrip("; ; INSERT INTO t VALUES (1);;", 1)).toBe(
      "INSERT INTO t VALUES (1)",
    )
  })

  it("still reports errors inside a statement between empty ones", () => {
    const result = parseToAst(";; SELECT FROM ;; SELECT 2")
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it("still splits consecutive statements without a semicolon", () => {
    expect(parse("SELECT 1 SELECT 2")).toHaveLength(2)
  })
})

describe("formatter", () => {
  const signature = (sql: string) =>
    scan(sql).map((t) => `${t.kind}:${t.image}`)

  it("scans a nested comment as one block comment", () => {
    const sql = "/* a /* b */ c */ z"
    expect(signature(sql)).toEqual([
      "blockComment:/* a /* b */ c */",
      "whitespace: ",
      "word:z",
    ])
    expect(reconstruct(scan(sql))).toBe(sql)
  })

  it("keeps an unterminated nested comment tolerant", () => {
    expect(signature("x /* a /* b */ c")).toEqual([
      "word:x",
      "whitespace: ",
      "tolerant:/* a /* b */ c",
    ])
  })

  it("formats around a nested comment without touching it", () => {
    expect(format("SELECT 1 /* a /* nested */ still */ FROM t")).toBe(
      "SELECT 1 /* a /* nested */ still */\nFROM t",
    )
    expect(format("SELECT 1 FROM t /* a /* b */ c")).toBe(
      "SELECT 1\nFROM t /* a /* b */ c",
    )
  })
})

describe("autocomplete", () => {
  const provider = createAutocompleteProvider({
    tables: [{ name: "trades" }],
    columns: { trades: [{ name: "price", type: "DOUBLE" }] },
  })
  const labels = (sql: string) =>
    provider.getSuggestions(sql, sql.length).map((s) => s.label)

  it("suggests statement starts after empty statements", () => {
    expect(labels("SELECT 1;; ")).toContain("SELECT")
    expect(labels("; ")).toContain("SELECT")
    expect(getNextValidTokens(";; ")).toContain("Select")
  })

  it("never suggests a semicolon", () => {
    expect(labels("SELECT 1;; ")).not.toContain(";")
  })

  it("reads past a nested comment", () => {
    expect(labels("SELECT * FROM trades /* a /* b */ c */ ")).toContain("WHERE")
  })
})
