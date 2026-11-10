/**
 * Decimal `m` / double `d` literals in expressions (reports §3.1).
 *
 * Server FunctionParser.createConstant types a literal token as:
 *   - DOUBLE when Numbers.parseDouble accepts it. FastDouble skips an
 *     optional `d`/`D` suffix, so `1d`, `0d`, `1.5D`, `1e36d` are doubles.
 *   - DECIMAL when it ends in `m`/`M` (`(c | 32) == 'm'`), parsed by
 *     DecimalParser, which also takes an exponent: `99m`, `1.5m`, `1.5e3m`,
 *     `2.5e-3M` (Decimal256Test:1839 `1.5e2M`).
 *
 * The lexer keeps `99m` / `1d` as DurationLiteral tokens (SAMPLE BY, TTL,
 * o3MaxLag, REFRESH EVERY ... need them), but in an expression the visitor
 * now types them as numbers with the raw text preserved. `1.5e3m` used to
 * lex as `1.5e3` + `m` and silently became `1.5e3 AS m`.
 *
 * Valid server queries are in tests/fixtures/server-queries.json
 * (feature "numeric-literal-typing").
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

/** The single select item of `SELECT <expr>` */
const selectItem = (sql: string) => {
  const select = parseOne(sql) as AST.SelectStatement
  expect(select.columns).toHaveLength(1)
  return select.columns[0] as AST.ExpressionSelectItem
}

const roundTrip = (sql: string) => toSql(parseOne(sql))

describe("lexer", () => {
  it.each([
    "1.5e3m",
    "1e5m",
    "1.5E3M",
    "2.5e-3m",
    "2.5e+3M",
    "1_000e2m",
    "1.e3m",
    "1.2300e2m",
  ])("reads %s as one decimal token", (d) => {
    expect(tokenTypes(d)).toEqual([`DecimalLiteral:${d}`])
  })

  it("keeps the existing decimal and duration tokens", () => {
    expect(tokenTypes("10.5m")).toEqual(["DecimalLiteral:10.5m"])
    expect(tokenTypes("99m")).toEqual(["DurationLiteral:99m"])
    expect(tokenTypes("99M")).toEqual(["DurationLiteral:99M"])
    expect(tokenTypes("1.5M")).toEqual(["DurationLiteral:1.5M"])
    expect(tokenTypes("1d")).toEqual(["DurationLiteral:1d"])
    expect(tokenTypes("1.5d")).toEqual(["DurationLiteral:1.5d"])
    expect(tokenTypes("1e36d")).toEqual(["FloatLiteral:1e36d"])
    expect(tokenTypes("1.5e3")).toEqual(["NumberLiteral:1.5e3"])
  })

  it("ends an exponent decimal at punctuation", () => {
    expect(tokenTypes("1.5e3m)")).toEqual(["DecimalLiteral:1.5e3m", "RParen:)"])
    expect(tokenTypes("1e5m,")).toEqual(["DecimalLiteral:1e5m", "Comma:,"])
  })
})

describe("expression literals", () => {
  it.each([
    ["99m", 99],
    ["0m", 0],
    ["99M", 99],
    ["1_000m", 1000],
    ["1.5M", 1.5],
    ["10.5m", 10.5],
    ["1.5e3m", 1500],
    ["1e5m", 100000],
    ["2.5e-3m", 0.0025],
    ["1.5E3M", 1500],
  ])("types %s as a decimal number", (raw, value) => {
    const item = selectItem(`SELECT ${raw}`)
    expect(item.alias).toBeUndefined()
    expect(item.expression).toEqual({
      type: "literal",
      value,
      literalType: "number",
      raw,
    })
  })

  it.each([
    ["1d", 1],
    ["0d", 0],
    ["1D", 1],
    ["1.5d", 1.5],
    ["10000d", 10000],
    ["1_000d", 1000],
  ])("types %s as a double number", (raw, value) => {
    const item = selectItem(`SELECT ${raw}`)
    expect(item.alias).toBeUndefined()
    expect(item.expression).toEqual({
      type: "literal",
      value,
      literalType: "number",
      raw,
    })
  })

  it.each(["1h", "30s", "1ms", "100us", "100ns", "1y", "1w", "100T"])(
    "keeps %s a duration (not a number on the server)",
    (raw) => {
      expect(selectItem(`SELECT ${raw}`).expression).toEqual({
        type: "literal",
        value: raw,
        literalType: "duration",
      })
    },
  )

  it("no longer reads 1.5e3m as 1.5e3 AS m", () => {
    expect(roundTrip("SELECT 1.5e3m")).toBe("SELECT 1.5e3m")
    expect(roundTrip("SELECT 1.5e3m m")).toBe("SELECT 1.5e3m AS m")
    expect(roundTrip("SELECT * FROM t WHERE price > 1.5e3m")).toBe(
      "SELECT * FROM t WHERE price > 1.5e3m",
    )
    expect(roundTrip("SELECT cast(2.5e-3M AS DECIMAL(10, 4))")).toBe(
      "SELECT CAST(2.5e-3M AS DECIMAL(10, 4))",
    )
  })

  it("types numbers inside larger expressions", () => {
    const select = parseOne(
      "SELECT x * 2m, -99m, 10d * 0d, generate_series(-3d, 3d) FROM t",
    ) as AST.SelectStatement
    const [mul, neg, dbl] = select.columns.map(
      (c) => (c as AST.ExpressionSelectItem).expression,
    )
    expect((mul as AST.BinaryExpression).right).toMatchObject({
      literalType: "number",
      value: 2,
      raw: "2m",
    })
    expect((neg as AST.UnaryExpression).operand).toMatchObject({
      literalType: "number",
      value: 99,
      raw: "99m",
    })
    expect((dbl as AST.BinaryExpression).left).toMatchObject({
      literalType: "number",
      raw: "10d",
    })
  })

  it("types VALUES literals", () => {
    const insert = parseOne(
      "INSERT INTO t VALUES (1, 99.99m, 100m, 123.33d, 1.5e3m)",
    ) as AST.InsertStatement
    const row = insert.values![0]
    expect(row.map((e) => (e as AST.Literal).literalType)).toEqual([
      "number",
      "number",
      "number",
      "number",
      "number",
    ])
    expect(row.map((e) => (e as AST.Literal).raw)).toEqual([
      "1",
      "99.99m",
      "100m",
      "123.33d",
      "1.5e3m",
    ])
  })

  it("rejects an exponent decimal glued to a word like before", () => {
    // 1e5mx is not a decimal; it stays a number followed by an alias
    expect(tokenTypes("1e5mx")).toEqual(["NumberLiteral:1e5", "Identifier:mx"])
  })
})

describe("duration contexts are unchanged", () => {
  it("SAMPLE BY", () => {
    for (const d of ["1m", "5m", "1M", "1d", "1D"]) {
      const select = parseOne(
        `SELECT ts, avg(x) FROM t SAMPLE BY ${d}`,
      ) as AST.SelectStatement
      expect(select.sampleBy?.duration).toBe(d)
    }
  })

  it("TTL", () => {
    const create = parseOne(
      "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY HOUR TTL 1M",
    ) as AST.CreateTableStatement
    expect(create.ttl).toEqual({ value: 1, unit: "MONTHS" })
    expect(
      roundTrip(
        "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 2D",
      ),
    ).toBe(
      "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 2 DAYS",
    )
  })

  it.each(["7d", "10m", "2h", "100ms", "1.5d"])(
    "o3MaxLag = %s stays a duration",
    (d) => {
      const alter = parseOne(
        `ALTER TABLE x SET PARAM o3MaxLag = ${d}`,
      ) as AST.AlterTableStatement
      const action = alter.action as { params: AST.TableParam[] }
      expect(action.params[0].value).toEqual({
        type: "literal",
        value: d,
        literalType: "duration",
      })
      const create = parseOne(
        `CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WITH maxUncommittedRows=7, o3MaxLag=${d}`,
      ) as AST.CreateTableStatement
      expect(create.withParams?.[1].value).toEqual({
        type: "literal",
        value: d,
        literalType: "duration",
      })
    },
  )

  it("DECLARE keeps a bare duration value (it may be used in SAMPLE BY)", () => {
    const select = parseOne(
      "DECLARE @period := 1m SELECT ts, sum(x) FROM t SAMPLE BY @period",
    ) as AST.SelectStatement
    expect(select.declare?.assignments[0].value).toEqual({
      type: "literal",
      value: "1m",
      literalType: "duration",
    })
    // an expression around it is evaluated by the server: typed as a number
    const select2 = parseOne(
      "DECLARE @x := 1m + 1 SELECT @x",
    ) as AST.SelectStatement
    expect(
      (select2.declare?.assignments[0].value as AST.BinaryExpression).left,
    ).toMatchObject({ literalType: "number", raw: "1m" })
  })

  it("window frames, WINDOW JOIN and HORIZON LIST", () => {
    expect(
      roundTrip(
        "SELECT sum(x) OVER (ORDER BY ts RANGE BETWEEN 1d PRECEDING AND CURRENT ROW) FROM t",
      ),
    ).toBe(
      "SELECT sum(x) OVER (ORDER BY ts RANGE BETWEEN 1d PRECEDING AND CURRENT ROW) FROM t",
    )
    expect(
      roundTrip(
        "SELECT avg(p.price) FROM trades AS t HORIZON JOIN prices AS p ON (t.sym = p.sym) LIST (100T, 1s, 1m, 1h, 1d) AS h",
      ),
    ).toBe(
      "SELECT avg(p.price) FROM trades AS t HORIZON JOIN prices AS p ON (t.sym = p.sym) LIST (100T, 1s, 1m, 1h, 1d) AS h",
    )
  })

  it("keeps a suffixed number verbatim in a COPY option", () => {
    expect(roundTrip("COPY t TO 'x' WITH COMPRESSION_LEVEL 3d")).toBe(
      "COPY t TO 'x' WITH COMPRESSION_LEVEL 3d",
    )
    expect(roundTrip("COPY t TO 'x' WITH ROW_GROUP_SIZE 1m")).toBe(
      "COPY t TO 'x' WITH ROW_GROUP_SIZE 1m",
    )
  })
})

describe("autocomplete", () => {
  const provider = createAutocompleteProvider({
    tables: [{ name: "t" }],
    columns: { t: [{ name: "price", type: "DECIMAL" }] },
  })
  const labels = (sql: string) =>
    provider.getSuggestions(sql, sql.length).map((s) => s.label)

  it("continues after an exponent decimal like after any number", () => {
    expect(labels("SELECT 1.5e3m ")).toEqual(labels("SELECT 1.5m "))
    expect(labels("SELECT * FROM t WHERE price > 1.5e3m ")).toEqual(
      labels("SELECT * FROM t WHERE price > 1.5m "),
    )
    expect(labels("SELECT * FROM t WHERE price > 1.5e3m ")).toContain("AND")
  })

  it("accepts a decimal where an expression can start", () => {
    expect(getNextValidTokens("SELECT * FROM t WHERE price > ")).toContain(
      "DecimalLiteral",
    )
  })
})

describe("formatter", () => {
  it("keeps exponent decimals as one token", () => {
    expect(format("select 1.5e3m, 2.5E-3M from t")).toBe(
      "select 1.5e3m, 2.5E-3M\nfrom t",
    )
  })
})
