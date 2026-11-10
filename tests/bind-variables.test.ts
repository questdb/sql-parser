/**
 * Bind variables (reports §3.1): `$1` (positional) and `:name` (named).
 *
 * Server: ExpressionNode.of turns a literal token into BIND_VARIABLE when it
 * is `$` + digits or starts with `:`; FunctionParser.createBindVariable binds
 * it. A `:name` token is glued by ExpressionParser.processColon: a single `:`
 * that does NOT follow a completed operand (literal, constant, `)` or `]`) and
 * is not followed by whitespace takes the next token as the variable name.
 * So `arr[1:n]` / `arr[i:j]` stay array slices, while `x = :sym`,
 * `IN (:a, :b)`, `LIMIT :lo, :hi` and even `arr[:1]` (ArrayTest:4428
 * "undefined bind variable: :1") are bind variables.
 *
 * Server queries live in tests/fixtures/server-queries.json
 * (feature "bind-variables").
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

const parseOne = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

const roundTrip = (sql: string) => toSql([parseOne(sql)])

const expectError = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors.length).toBeGreaterThan(0)
}

const whereOf = (sql: string) =>
  (parseOne(sql) as AST.SelectStatement).where as AST.Expression

describe("lexer", () => {
  it.each(["$1", "$2", "$12", "$100"])("reads %s as one bind variable", (v) => {
    expect(tokenTypes(`a = ${v}`)).toEqual([
      "Identifier:a",
      "Equals:=",
      `BindVariable:${v}`,
    ])
  })

  it.each([
    ["x = :sym", "BindVariable::sym"],
    ["(:sym", "BindVariable::sym"],
    [", :k2", "BindVariable::k2"],
    ["-:sv", "BindVariable::sv"],
    ["SELECT :b0", "BindVariable::b0"],
    ["LIMIT :lim", "BindVariable::lim"],
    ["IN :date", "BindVariable::date"],
    ["@a := :value", "BindVariable::value"],
    ["TIME ZONE :tz", "BindVariable::tz"],
    ["a[:1]", "BindVariable::1"],
    ["a[1, :n]", "BindVariable::n"],
    ["CASE WHEN x THEN :a", "BindVariable::a"],
  ])("reads the :name in `%s` as a bind variable", (sql, expected) => {
    expect(tokenTypes(sql)).toContain(expected)
    expect(tokenTypes(sql)).not.toContain("Colon::")
  })

  it.each([
    "arr[1:n]",
    "arr[i:j]",
    "arr[i:j+1]",
    "arr[(i):j]",
    "arr[x[1]:j]",
    "arr[$1:n]",
    "arr[:a:b]",
    "arr['a':b]",
    "arr[1.5:b]",
    "arr[null:b]",
    "arr[@v:b]",
    "arr[offset:b]",
    'arr["i":j]',
  ])("keeps the slice colon in %s", (sql) => {
    expect(tokenTypes(sql)).toContain("Colon::")
  })

  it("does not glue a colon followed by whitespace", () => {
    expect(tokenTypes("x = : sym")).toEqual([
      "Identifier:x",
      "Equals:=",
      "Colon::",
      "Identifier:sym",
    ])
  })

  it("keeps :: and := as operators", () => {
    expect(tokenTypes("x::int")).toEqual([
      "Identifier:x",
      "DoubleColon:::",
      "Int:int",
    ])
    expect(tokenTypes(":b0::LONG")).toEqual([
      "BindVariable::b0",
      "DoubleColon:::",
      "Long:LONG",
    ])
    expect(tokenTypes("@x := 1")).toEqual([
      "VariableReference:@x",
      "ColonEquals::=",
      "NumberLiteral:1",
    ])
    expect(tokenTypes("@x:=:a")).toEqual([
      "VariableReference:@x",
      "ColonEquals::=",
      "BindVariable::a",
    ])
  })

  it("leaves $ and : inside strings and quoted names alone", () => {
    expect(tokenTypes("'$1'")).toEqual(["StringLiteral:'$1'"])
    expect(tokenTypes("':keep'")).toEqual(["StringLiteral:':keep'"])
    expect(tokenTypes('"price$1"')).toEqual(['QuotedIdentifier:"price$1"'])
  })

  it.each(["$", "$a", "$1abc", "$1_"])("rejects %s", (v) => {
    expect(tokenize(`SELECT ${v}`).errors.length).toBeGreaterThan(0)
  })
})

describe("AST", () => {
  it("parses $1 as a bindVariable node", () => {
    expect(whereOf("SELECT * FROM t WHERE a = $1")).toEqual({
      type: "binary",
      operator: "=",
      left: { type: "column", name: { type: "qualifiedName", parts: ["a"] } },
      right: { type: "bindVariable", name: "$1" },
    })
  })

  it("parses :name as a bindVariable node", () => {
    const where = whereOf(
      "SELECT * FROM t WHERE a = :sym",
    ) as AST.BinaryExpression
    expect(where.right).toEqual({ type: "bindVariable", name: ":sym" })
  })

  it("parses bind variables in LIMIT", () => {
    const stmt = parseOne(
      "SELECT * FROM t LIMIT $1, :hi",
    ) as AST.SelectStatement
    expect(stmt.limit?.lowerBound).toEqual({ type: "bindVariable", name: "$1" })
    expect(stmt.limit?.upperBound).toEqual({
      type: "bindVariable",
      name: ":hi",
    })
  })

  it("parses a bind variable as a select item and function argument", () => {
    const stmt = parseOne("SELECT $1 AS a, f(:x) FROM t") as AST.SelectStatement
    const items = stmt.columns as AST.ExpressionSelectItem[]
    expect(items[0].expression).toEqual({ type: "bindVariable", name: "$1" })
    expect(items[0].alias).toBe("a")
    expect((items[1].expression as AST.FunctionCall).args).toEqual([
      { type: "bindVariable", name: ":x" },
    ])
  })

  it("parses `arr[:1]` as an index by bind variable :1, like the server", () => {
    const stmt = parseOne("SELECT arr[:1] FROM t") as AST.SelectStatement
    const item = (stmt.columns as AST.ExpressionSelectItem[])[0]
    expect(item.expression).toEqual({
      type: "arrayAccess",
      array: {
        type: "column",
        name: { type: "qualifiedName", parts: ["arr"] },
      },
      subscripts: [{ type: "bindVariable", name: ":1" }],
    })
  })

  it("keeps `arr[1:n]` an array slice", () => {
    const stmt = parseOne("SELECT arr[1:n] FROM t") as AST.SelectStatement
    const item = (stmt.columns as AST.ExpressionSelectItem[])[0]
    const access = item.expression as AST.ArrayAccessExpression
    expect(access.subscripts[0]).toMatchObject({
      type: "arraySlice",
      start: { type: "literal", value: 1 },
      end: { type: "column" },
    })
  })

  it("keeps the open-start slice when the colon is followed by whitespace", () => {
    const stmt = parseOne("SELECT arr[: 5] FROM t") as AST.SelectStatement
    const item = (stmt.columns as AST.ExpressionSelectItem[])[0]
    const access = item.expression as AST.ArrayAccessExpression
    expect(access.subscripts[0]).toMatchObject({
      type: "arraySlice",
      end: { type: "literal", value: 5 },
    })
  })

  it("parses SAMPLE BY $1 <unit> with the unit kept in the duration", () => {
    const stmt = parseOne(
      "SELECT ts, count() FROM t SAMPLE BY $1 d",
    ) as AST.SelectStatement
    expect(stmt.sampleBy?.duration).toBe("$1 d")
  })
})

describe("round trip", () => {
  it.each([
    ["SELECT * FROM t WHERE a = $1", "SELECT * FROM t WHERE a = $1"],
    ["select * from t where a=:sym", "SELECT * FROM t WHERE a = :sym"],
    ["insert into t values ($1, :b, 3)", "INSERT INTO t VALUES ($1, :b, 3)"],
    ["select * from t limit $1", "SELECT * FROM t LIMIT $1"],
    ["select * from t limit :lo,:hi", "SELECT * FROM t LIMIT :lo, :hi"],
    ["select * from t sample by $1 h", "SELECT * FROM t SAMPLE BY $1 h"],
    [
      "select * from t sample by :n T fill(null)",
      "SELECT * FROM t SAMPLE BY :n T FILL(NULL)",
    ],
    [
      "select * from t sample by 1h from $1 to $2",
      "SELECT * FROM t SAMPLE BY 1h FROM $1 TO $2",
    ],
    ["select $1::int + :x", "SELECT $1::INT + :x"],
    ["select -$1, -:x", "SELECT -$1, -:x"],
    ["select arr[:1] from t", "SELECT arr[:1] FROM t"],
    ["select arr[1:n] from t", "SELECT arr[1:n] FROM t"],
    ["select arr[$1:$2] from t", "SELECT arr[$1:$2] FROM t"],
    [
      "select case when a then :x else $2 end from t",
      "SELECT CASE WHEN a THEN :x ELSE $2 END FROM t",
    ],
    ["update t set a = :a where b = $1", "UPDATE t SET a = :a WHERE b = $1"],
    ["declare @a := :v select @a", "DECLARE @a := :v SELECT @a"],
  ])("%s", (sql, expected) => {
    const out = roundTrip(sql)
    expect(out).toBe(expected)
    expect(roundTrip(out)).toBe(expected)
  })
})

describe("errors", () => {
  it.each([
    // (SAMPLE BY $1 without a unit letter is accepted: SAMPLE BY takes any
    // expression and the unit stays optional, looser than SqlParser.expectSample)
    // a bare colon is not a value
    "SELECT * FROM t WHERE a = : sym",
    // a colon after a completed operand is not a bind variable
    "SELECT a :b FROM t",
    "SELECT * FROM t WHERE a = $",
  ])("rejects %s", (sql) => {
    expectError(sql)
  })
})

describe("autocomplete", () => {
  const provider = createAutocompleteProvider({
    tables: [{ name: "t" }],
    columns: { t: [{ name: "a", type: "INT" }] },
  })
  const labels = (sql: string) =>
    provider.getSuggestions(sql, sql.length).map((s) => s.label)

  it.each(["SELECT * FROM t WHERE a = $1 ", "SELECT * FROM t WHERE a = :sym "])(
    "continues the expression after a bind variable: %s",
    (sql) => {
      expect(labels(sql)).toContain("AND")
      expect(labels(sql)).toContain("ORDER")
    },
  )

  it("does not suggest anything for the bind variable token itself", () => {
    for (const sql of [
      "SELECT * FROM t WHERE a = ",
      "SELECT * FROM t LIMIT ",
    ]) {
      expect(labels(sql).some((l) => /^[$:]/.test(l))).toBe(false)
    }
  })

  it("accepts a bind variable where an expression can start", () => {
    expect(getNextValidTokens("SELECT * FROM t WHERE a = ")).toContain(
      "BindVariable",
    )
    expect(getNextValidTokens("SELECT * FROM t SAMPLE BY ")).toContain(
      "BindVariable",
    )
  })
})

describe("formatter", () => {
  it("keeps bind variables glued", () => {
    expect(
      format(
        "select a, $1 from t where a = :sym and b in (:k1, :k2) limit :lo, :hi",
      ),
    ).toBe(
      "select a, $1\nfrom t\nwhere a = :sym and b in (:k1, :k2)\nlimit :lo, :hi",
    )
  })

  it("keeps unary minus and array subscripts glued", () => {
    expect(
      format("SELECT id FROM neg_min WHERE -:sv = s and arr[:1] > -$1"),
    ).toBe("SELECT id\nFROM neg_min\nWHERE -:sv = s and arr[:1] > -$1")
  })

  it("does not glue a slice colon to the following word", () => {
    expect(format("SELECT arr[: 5], arr[1: n], arr[1 :n] FROM t")).toBe(
      "SELECT arr[: 5], arr[1: n], arr[1:n]\nFROM t",
    )
  })

  it("keeps a SAMPLE BY bind variable and its unit", () => {
    expect(format("select count() from t sample by $1 d")).toBe(
      "select count()\nfrom t\nsample by $1 d",
    )
  })
})
