/**
 * Literal forms the QuestDB server accepts (see reports §7):
 *   - long256 hex constants        0x1F               FunctionParser.createConstant
 *   - float / double suffixes      1.5f, 10f, 1e36d   FunctionParser.createConstant
 *   - PostgreSQL escape strings    E'abc'             ExpressionParser case 'E'
 *   - typed literals               timestamp '...'    ExpressionParser.processPgTimestampCast
 *
 * Server queries for these live in tests/fixtures/server-queries.json and are
 * checked by tests/server-queries.test.ts (parse, round trip, autocomplete,
 * formatter). This file pins the lexer, AST and edge-case behaviour.
 */

import { describe, it, expect } from "vitest"
import {
  parseToAst,
  tokenize,
  getNextValidTokens,
  createAutocompleteProvider,
} from "../src/index"
import { toSql } from "../src/parser/toSql"
import { format } from "../src/formatter/index"
import type * as AST from "../src/parser/ast"

const tokenTypes = (sql: string) =>
  tokenize(sql).tokens.map((t) => `${t.tokenType.name}:${t.image}`)

/** First select item of a single SELECT statement */
const firstItem = (sql: string): AST.Expression => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  const select = result.ast[0] as AST.SelectStatement
  const item = select.columns[0]
  return (item as { expression: AST.Expression }).expression
}

const roundTrip = (sql: string) => toSql(parseToAst(sql).ast)

describe("lexer", () => {
  it("reads a hex constant as one token", () => {
    expect(tokenTypes("0x1F")).toEqual(["HexLiteral:0x1F"])
    expect(tokenTypes("0x7ee65ec7b6e3bc3a")).toEqual([
      "HexLiteral:0x7ee65ec7b6e3bc3a",
    ])
  })

  it("reads float and double suffixes as one token", () => {
    expect(tokenTypes("1.5f")).toEqual(["FloatLiteral:1.5f"])
    expect(tokenTypes("10f")).toEqual(["FloatLiteral:10f"])
    expect(tokenTypes("1e-30f")).toEqual(["FloatLiteral:1e-30f"])
    expect(tokenTypes("-1e30d")).toEqual(["Minus:-", "FloatLiteral:1e30d"])
    expect(tokenTypes(".5f")).toEqual(["FloatLiteral:.5f"])
  })

  it("keeps day durations: `d` is only a double suffix after an exponent", () => {
    expect(tokenTypes("1d")).toEqual(["DurationLiteral:1d"])
    expect(tokenTypes("1.5d")).toEqual(["DurationLiteral:1.5d"])
    expect(tokenTypes("SAMPLE BY 1d")).toContain("DurationLiteral:1d")
  })

  it("reads E'...' as one escape-string token, uppercase E only", () => {
    expect(tokenTypes("E'abc'")).toEqual(["EscapeStringLiteral:E'abc'"])
    expect(tokenTypes("E'it''s'")).toEqual(["EscapeStringLiteral:E'it''s'"])
    // the server only treats an uppercase E as the escape prefix
    expect(tokenTypes("e'abc'")).toEqual([
      "Identifier:e",
      "StringLiteral:'abc'",
    ])
    // an identifier ending in E is not an escape string
    expect(tokenTypes("nameE'x'")).toEqual([
      "Identifier:nameE",
      "StringLiteral:'x'",
    ])
  })
})

describe("AST", () => {
  it("hex constant is a number literal that keeps its text", () => {
    expect(firstItem("SELECT 0x1F")).toEqual({
      type: "literal",
      value: "0x1F",
      literalType: "number",
      raw: "0x1F",
    })
  })

  it("float suffix is a number literal that keeps its text", () => {
    expect(firstItem("SELECT 1.5f")).toEqual({
      type: "literal",
      value: 1.5,
      literalType: "number",
      raw: "1.5f",
    })
  })

  it("E'...' is a string literal; only '' is unescaped", () => {
    expect(firstItem("SELECT E'it''s \\n'")).toEqual({
      type: "literal",
      value: "it's \\n",
      literalType: "string",
      raw: "E'it''s \\n'",
    })
  })

  it("typed literal is a string literal with its type name", () => {
    expect(firstItem("SELECT timestamp '2020-01-01'")).toEqual({
      type: "literal",
      value: "2020-01-01",
      literalType: "string",
      typeName: "TIMESTAMP",
    })
    expect(firstItem("SELECT ipv4 '1.2.3.4'")).toMatchObject({
      typeName: "IPV4",
    })
    expect(firstItem("SELECT bigint '42'")).toMatchObject({
      typeName: "BIGINT",
    })
    expect(
      firstItem("SELECT timestamp with time zone '2020-12-31 15:15:51+00:00'"),
    ).toMatchObject({
      value: "2020-12-31 15:15:51+00:00",
      typeName: "TIMESTAMP WITH TIME ZONE",
    })
  })
})

describe("typed literals only apply to castable type names", () => {
  it.each([
    "boolean",
    "byte",
    "short",
    "char",
    "int",
    "integer",
    "long",
    "date",
    "timestamp",
    "timestamp_ns",
    "float",
    "double",
    "string",
    "symbol",
    "long256",
    "uuid",
    "ipv4",
    "varchar",
    "decimal",
    "text",
    "smallint",
    "bigint",
    "real",
    "bytea",
  ])("%s 'x' is a typed literal", (type) => {
    const sql = `SELECT ${type} 'x' FROM t`
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
    expect(roundTrip(sql)).toBe(`SELECT ${type.toUpperCase()} 'x' FROM t`)
  })

  it("a non-type name followed by a string stays a column with an alias", () => {
    expect(roundTrip("SELECT price 'p' FROM t")).toBe(
      "SELECT price AS p FROM t",
    )
  })

  it("type names are still plain columns when no string follows", () => {
    expect(roundTrip("SELECT timestamp, date, symbol FROM t")).toBe(
      "SELECT timestamp, date, symbol FROM t",
    )
    expect(roundTrip("SELECT * FROM t WHERE date = '2020-01-01'")).toBe(
      "SELECT * FROM t WHERE date = '2020-01-01'",
    )
    expect(roundTrip("SELECT ts timestamp FROM t")).toBe(
      "SELECT ts AS timestamp FROM t",
    )
  })

  it("a type name used as a function is still a function call", () => {
    expect(roundTrip("SELECT timestamp(ts) FROM t")).toBe(
      "SELECT timestamp(ts) FROM t",
    )
  })
})

describe("no silent splits", () => {
  it.each([
    ["SELECT * FROM t WHERE l = 0x01", "SELECT * FROM t WHERE l = 0x01"],
    ["SELECT 1.5f FROM t", "SELECT 1.5f FROM t"],
    ["UPDATE t1 SET f = 5.2f", "UPDATE t1 SET f = 5.2f"],
    [
      "SELECT * FROM t WHERE relname LIKE E'x'",
      "SELECT * FROM t WHERE relname LIKE E'x'",
    ],
    [
      "SELECT * FROM t WHERE ts > timestamp '2020-01-01'",
      "SELECT * FROM t WHERE ts > TIMESTAMP '2020-01-01'",
    ],
  ])("%s", (sql, expected) => {
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
    expect(toSql(result.ast)).toBe(expected)
  })
})

describe("autocomplete", () => {
  const provider = createAutocompleteProvider({
    tables: [{ name: "t" }],
    columns: { t: [{ name: "ts", type: "TIMESTAMP" }] },
  })

  it("does not suggest anything inside an E'...' string", () => {
    const sql = "SELECT * FROM t WHERE ts = E'ab"
    expect(provider.getSuggestions(sql + "c'", sql.length)).toEqual([])
  })

  it("offers WITH after `timestamp` (timestamp with time zone '...')", () => {
    expect(getNextValidTokens("INSERT INTO t VALUES (timestamp ")).toContain(
      "With",
    )
  })

  it("does not offer WITH after an ordinary column in an expression", () => {
    expect(getNextValidTokens("SELECT * FROM t WHERE ts > x ")).not.toContain(
      "With",
    )
  })

  it.each([
    "SELECT ",
    "SELECT * FROM t WHERE ",
    "SELECT * FROM t WHERE ts > ",
    "INSERT INTO t VALUES (",
    "UPDATE t SET ts = ",
  ])("does not add type keywords where a value can start: %s", (sql) => {
    const labels = provider.getSuggestions(sql, sql.length).map((s) => s.label)
    expect(labels).not.toContain("TIMESTAMP")
    expect(labels).not.toContain("TIMESTAMP_NS")
  })

  it("continues after a typed literal", () => {
    const sql = "SELECT * FROM t WHERE ts > timestamp '2020-01-01' "
    const labels = provider.getSuggestions(sql, sql.length).map((s) => s.label)
    expect(labels).toContain("AND")
  })
})

describe("formatter keeps literals intact", () => {
  it("formats a query with typed, hex and float literals", () => {
    expect(
      format(
        "select * from test where ip = ipv4 '0.0.0.1' and l = 0x01 and f > 1.5f",
      ),
    ).toBe(
      "select *\nfrom test\nwhere\n  ip = ipv4 '0.0.0.1'\n  and l = 0x01\n  and f > 1.5f",
    )
  })

  it("formats a query with an escape string", () => {
    expect(
      format(
        "SELECT x, count() FROM (SELECT dateadd(E'h', 1, ts) x FROM jan) SAMPLE BY 1d",
      ),
    ).toBe(
      "SELECT x, count()\nFROM (\n  SELECT dateadd(E'h', 1, ts) x\n  FROM jan\n)\nSAMPLE BY 1d",
    )
  })
})
