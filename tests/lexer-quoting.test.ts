/**
 * Backtick identifiers and `$` inside identifiers (reports §3.1).
 *
 * Server: GenericLexer treats '`' as a quote (Chars.isQuote: `'`, `"`, '`').
 * A backtick-quoted token has no escapes: it ends at the next backtick, so
 * `a``b` is two tokens. Quoted tokens are identifiers wherever an identifier
 * is expected (GenericLexer.unquote strips the outer quotes), e.g.
 * PivotTest `where \`BTC-USD_buy\` > 25780`, CopyExportTest
 * `copy \`test_table❤️\` to ...`.
 *
 * SqlParser.validateIdentifier allows letters, digits, '_' and '$' after the
 * first character of an unquoted identifier (`select 'a' a1$_`,
 * SqlParserTest.testGoodNonQuotedAlias). `$` + digits at the start of a token
 * stays a bind variable (ExpressionNode.of).
 *
 * Server queries live in tests/fixtures/server-queries.json
 * (feature "lexer-quoting").
 */

import { describe, it, expect } from "vitest"
import { parseToAst, tokenize, createAutocompleteProvider } from "../src/index"
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

const columnParts = (expr: AST.Expression | undefined) =>
  (expr as AST.ColumnRef).name.parts

describe("backtick identifiers", () => {
  describe("lexer", () => {
    it.each([
      ["`BTC-USD_buy`", "QuotedIdentifier:`BTC-USD_buy`"],
      ["`test_table❤️`", "QuotedIdentifier:`test_table❤️`"],
      ["`@c`", "QuotedIdentifier:`@c`"],
      ["``", "QuotedIdentifier:``"],
      ['`a""b`', 'QuotedIdentifier:`a""b`'],
      ["`it's`", "QuotedIdentifier:`it's`"],
      ["`a b`", "QuotedIdentifier:`a b`"],
    ])("reads %s as one quoted identifier", (sql, token) => {
      expect(tokenTypes(sql)).toEqual([token])
    })

    it("has no escape: a doubled backtick ends the token", () => {
      expect(tokenTypes("`a``b`")).toEqual([
        "QuotedIdentifier:`a`",
        "QuotedIdentifier:`b`",
      ])
    })

    it("does not affect double-quoted identifiers or strings", () => {
      expect(tokenTypes("\"a`b\" 'c`d'")).toEqual([
        'QuotedIdentifier:"a`b"',
        "StringLiteral:'c`d'",
      ])
    })

    it("reports an unterminated backtick", () => {
      expect(tokenize("SELECT `abc FROM t").errors.length).toBeGreaterThan(0)
    })
  })

  describe("AST", () => {
    it("unquotes a column reference", () => {
      const stmt = parseOne(
        "SELECT * FROM p WHERE `BTC-USD_buy` > 25780",
      ) as AST.SelectStatement
      const where = stmt.where as AST.BinaryExpression
      expect(columnParts(where.left)).toEqual(["BTC-USD_buy"])
    })

    it("keeps double quotes inside backticks verbatim", () => {
      const stmt = parseOne('SELECT `a""b` FROM t') as AST.SelectStatement
      const item = stmt.columns[0] as AST.ExpressionSelectItem
      expect(columnParts(item.expression)).toEqual(['a""b'])
    })

    it("unquotes qualified names, table names and aliases", () => {
      const stmt = parseOne(
        "SELECT `t`.`c` AS `my col` FROM `my-table` `t`",
      ) as AST.SelectStatement
      const item = stmt.columns[0] as AST.ExpressionSelectItem
      expect(columnParts(item.expression)).toEqual(["t", "c"])
      expect(item.alias).toBe("my col")
      const from = stmt.from![0]
      expect((from.table as AST.QualifiedName).parts).toEqual(["my-table"])
      expect(from.alias).toBe("t")
    })

    it("reads a doubled backtick as a column and its alias", () => {
      const stmt = parseOne("SELECT `a``b` FROM t") as AST.SelectStatement
      const item = stmt.columns[0] as AST.ExpressionSelectItem
      expect(columnParts(item.expression)).toEqual(["a"])
      expect(item.alias).toBe("b")
    })

    it("names a CREATE TABLE column", () => {
      const stmt = parseOne(
        "CREATE TABLE t (`a b` INT, `c` SYMBOL)",
      ) as AST.CreateTableStatement
      expect(stmt.columns!.map((c) => c.name)).toEqual(["a b", "c"])
    })
  })

  describe("toSql", () => {
    it.each([
      [
        "SELECT * FROM p WHERE `BTC-USD_buy` > 25780",
        'SELECT * FROM p WHERE "BTC-USD_buy" > 25780',
      ],
      ["SELECT `a` FROM `t`", "SELECT a FROM t"],
      ['SELECT `a"b` FROM t', 'SELECT "a""b" FROM t'],
      ["SELECT `select` FROM t", 'SELECT "select" FROM t'],
      [
        "SELECT `t`.`c` AS `my col` FROM `my-table` `t`",
        'SELECT t.c AS "my col" FROM "my-table" AS t',
      ],
      ["SELECT `a``b` FROM t", "SELECT a AS b FROM t"],
      [
        "INSERT INTO `my-table` (`a b`) VALUES (1)",
        'INSERT INTO "my-table" ("a b") VALUES (1)',
      ],
    ])("%s", (sql, expected) => {
      const out = roundTrip(sql)
      expect(out).toBe(expected)
      expect(roundTrip(out)).toBe(expected)
    })
  })
})

describe("$ inside identifiers", () => {
  describe("lexer", () => {
    it.each(["a$b", "a1$_", "_a1$", "a$1", "price$1", "x$$y"])(
      "reads %s as one identifier",
      (name) => {
        expect(tokenTypes(name)).toEqual([`Identifier:${name}`])
      },
    )

    it.each(["select$x", "from$", "table$1", "timestamp$"])(
      "does not split a keyword glued to $: %s",
      (name) => {
        expect(tokenTypes(name)).toEqual([`Identifier:${name}`])
      },
    )

    it("keeps $n bind variables", () => {
      expect(tokenTypes("a = $1")).toEqual([
        "Identifier:a",
        "Equals:=",
        "BindVariable:$1",
      ])
      expect(tokenTypes("a$1 = $1")).toEqual([
        "Identifier:a$1",
        "Equals:=",
        "BindVariable:$1",
      ])
    })

    it("includes $ in a :name bind variable (processColon glues the next token)", () => {
      expect(tokenTypes("a = :a$b")).toEqual([
        "Identifier:a",
        "Equals:=",
        "BindVariable::a$b",
      ])
    })

    it("keeps `:$1` a colon followed by a positional variable", () => {
      expect(tokenTypes("arr[:$1]")).toEqual([
        "Identifier:arr",
        "LBracket:[",
        "Colon::",
        "BindVariable:$1",
        "RBracket:]",
      ])
    })
  })

  describe("parser", () => {
    it("reads a$b as a column", () => {
      const stmt = parseOne("SELECT a$b FROM t") as AST.SelectStatement
      const item = stmt.columns[0] as AST.ExpressionSelectItem
      expect(columnParts(item.expression)).toEqual(["a$b"])
      expect(item.alias).toBeUndefined()
    })

    it("names a CREATE TABLE column", () => {
      const stmt = parseOne(
        "CREATE TABLE t (a$b INT)",
      ) as AST.CreateTableStatement
      expect(stmt.columns!.map((c) => c.name)).toEqual(["a$b"])
    })

    it.each([
      // identifiers cannot start with $ (validateIdentifier)
      "SELECT $a FROM t",
      "SELECT 'a' $",
      "SELECT * FROM t WHERE a = $",
    ])("rejects %s", (sql) => {
      expectError(sql)
    })
  })

  describe("toSql", () => {
    it.each([
      ["SELECT a$b FROM t", "SELECT a$b FROM t"],
      ["select 'a' a1$_", "SELECT 'a' AS a1$_"],
      ["select 'a' _a1$", "SELECT 'a' AS _a1$"],
      ["CREATE TABLE t (a$b INT)", "CREATE TABLE t (a$b INT)"],
      ['SELECT "a$b" FROM "x$y"', "SELECT a$b FROM x$y"],
      // a leading $ still needs quotes
      ['SELECT "$a", "$1" FROM t', 'SELECT "$a", "$1" FROM t'],
      ["SELECT a$1 FROM t WHERE b = $1", "SELECT a$1 FROM t WHERE b = $1"],
      ["SELECT select$x FROM t", "SELECT select$x FROM t"],
    ])("%s", (sql, expected) => {
      const out = roundTrip(sql)
      expect(out).toBe(expected)
      expect(roundTrip(out)).toBe(expected)
    })
  })
})

describe("formatter", () => {
  it("keeps backtick identifiers as written", () => {
    expect(format("select `BTC-USD_buy` from p where `a b` > 1")).toBe(
      "select `BTC-USD_buy`\nfrom p\nwhere `a b` > 1",
    )
  })

  it("keeps $ identifiers whole", () => {
    expect(format("select a$b, x from t where a$1 = $1")).toBe(
      "select a$b, x\nfrom t\nwhere a$1 = $1",
    )
  })
})

describe("autocomplete", () => {
  const provider = createAutocompleteProvider({
    tables: [{ name: "my-table" }, { name: "t" }],
    columns: {
      "my-table": [{ name: "price", type: "DOUBLE" }],
      t: [{ name: "a$b", type: "INT" }],
    },
  })
  const labels = (sql: string) =>
    provider.getSuggestions(sql, sql.length).map((s) => s.label)

  it("resolves columns of a backtick-quoted table", () => {
    expect(labels("SELECT * FROM `my-table` WHERE ")).toContain("price")
  })

  it("continues the expression after a backtick identifier", () => {
    const sql = "SELECT * FROM t WHERE `a$b` "
    expect(labels(sql)).toContain("AND")
  })

  it("continues the expression after a $ identifier", () => {
    const sql = "SELECT * FROM t WHERE a$b "
    expect(labels(sql)).toContain("AND")
    expect(labels(sql)).toContain("ORDER")
  })
})
