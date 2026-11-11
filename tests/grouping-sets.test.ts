/**
 * GROUP BY ROLLUP / CUBE / GROUPING SETS and the SAMPLE BY grouping form
 * (questdb/questdb#6853, reports §1.1).
 *
 * Server grammar (SqlParser.parseGroupByColumns, parseExplicitGroupingSets,
 * hasGroupingSyntaxLookahead and the SAMPLE BY branch of parseSelectClause):
 *   GROUP BY ROLLUP(col, ...) | CUBE(col, ...)
 *   GROUP BY GROUPING SETS ((a, b), (a), ())    -- only GROUP BY item
 *   GROUP BY expr, ..., ROLLUP(...) | CUBE(...) -- ROLLUP/CUBE last
 *   SAMPLE BY <interval> [ROLLUP(...) | CUBE(...) | GROUPING SETS (...)]
 *     [FROM ... TO ...] [FILL(...)] [ALIGN TO ...]
 * `rollup`, `cube`, `grouping` and `sets` are not reserved words: they are
 * grouping syntax only when `(` (ROLLUP/CUBE) or SETS (GROUPING) follows.
 *
 * Server queries for this feature live in tests/fixtures/server-queries.json.
 */

import { describe, it, expect } from "vitest"
import {
  parseToAst,
  getNextValidTokens,
  createAutocompleteProvider,
} from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const parseOne = (sql: string): AST.SelectStatement => {
  const result = parseToAst(sql)
  expect(result.errors.map((e) => e.message)).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0] as AST.SelectStatement
}

const col = (...parts: string[]) => ({
  type: "column",
  name: { type: "qualifiedName", parts },
})

/** true when sql is rejected or does not read as a single statement */
const rejected = (sql: string) => {
  const result = parseToAst(sql)
  return result.errors.length > 0 || result.ast.length !== 1
}

describe("the grouping words stay usable as identifiers", () => {
  it.each([
    "SELECT rollup, cube, sets, grouping FROM t",
    "CREATE TABLE t (sets INT, cube INT)",
    "CREATE TABLE cube (sets INT, rollup INT, grouping INT)",
    "SELECT grouping(a) FROM t GROUP BY a",
    "SELECT grouping_id(a, b) FROM t GROUP BY a, b",
    "SELECT a FROM t GROUP BY rollup",
    "SELECT a FROM t GROUP BY cube, rollup, grouping, sets",
    "SELECT a FROM t GROUP BY a, rollup",
    "SELECT a FROM t GROUP BY grouping + 1",
    "SELECT a FROM t GROUP BY a, grouping(b)",
    "SELECT * FROM rollup",
    "SELECT sets.a FROM t AS sets",
    "SELECT ts, sum(v) FROM t SAMPLE BY 1h FILL(NULL)",
  ])("%s", (sql) => {
    const stmt = parseToAst(sql)
    expect(stmt.errors.map((e) => e.message)).toEqual([])
    expect(stmt.ast).toHaveLength(1)
    expect(toSql(stmt.ast)).toBe(sql)
  })

  it("reads GROUP BY grouping(b) as a plain function key", () => {
    const stmt = parseOne("SELECT a FROM t GROUP BY grouping(b)")
    expect(stmt.groupBy).toHaveLength(1)
    expect(stmt.groupBy![0].type).toBe("function")
    expect(stmt.groupingSets).toBeUndefined()
  })

  it("reads GROUP BY rollup as a plain column key", () => {
    const stmt = parseOne("SELECT a FROM t GROUP BY rollup")
    expect(stmt.groupBy).toEqual([col("rollup")])
    expect(stmt.groupingSets).toBeUndefined()
  })
})

describe("AST", () => {
  it("GROUP BY ROLLUP(a, b)", () => {
    const stmt = parseOne("SELECT a, b, sum(v) FROM t GROUP BY ROLLUP(a, b)")
    expect(stmt.groupBy).toBeUndefined()
    expect(stmt.groupingSets).toEqual({
      type: "groupingSets",
      kind: "rollup",
      columns: [col("a"), col("b")],
    })
  })

  it("GROUP BY cube(t.a) (any case, qualified columns)", () => {
    const stmt = parseOne("SELECT 1 FROM t GROUP BY cube(t.a)")
    expect(stmt.groupingSets).toEqual({
      type: "groupingSets",
      kind: "cube",
      columns: [col("t", "a")],
    })
  })

  it("GROUP BY GROUPING SETS ((a, b), (a), ())", () => {
    const stmt = parseOne(
      "SELECT a, b, sum(v) FROM t GROUP BY GROUPING SETS ((a, b), (a), ())",
    )
    expect(stmt.groupBy).toBeUndefined()
    expect(stmt.groupingSets).toEqual({
      type: "groupingSets",
      kind: "groupingSets",
      sets: [[col("a"), col("b")], [col("a")], []],
    })
  })

  it("composite GROUP BY expr, ROLLUP(...): plain keys stay in groupBy", () => {
    const stmt = parseOne(
      "SELECT trim(s) k, b, sum(v) FROM t GROUP BY trim(s), k, CUBE(b)",
    )
    expect(stmt.groupBy).toHaveLength(2)
    expect(stmt.groupBy![0].type).toBe("function")
    expect(stmt.groupBy![1]).toEqual(col("k"))
    expect(stmt.groupingSets).toEqual({
      type: "groupingSets",
      kind: "cube",
      columns: [col("b")],
    })
  })

  it("SAMPLE BY interval ROLLUP(...)", () => {
    const stmt = parseOne(
      "SELECT ts, sym, sum(q) FROM t SAMPLE BY 1h ROLLUP(sym) FILL(NULL)",
    )
    expect(stmt.groupBy).toBeUndefined()
    expect(stmt.groupingSets).toBeUndefined()
    expect(stmt.sampleBy).toMatchObject({
      type: "sampleBy",
      duration: "1h",
      fill: ["NULL"],
      groupingSets: {
        type: "groupingSets",
        kind: "rollup",
        columns: [col("sym")],
      },
    })
  })

  it("SAMPLE BY interval GROUPING SETS (...)", () => {
    const stmt = parseOne(
      "SELECT ts, sym, sum(x) FROM t SAMPLE BY 1d GROUPING SETS ((sym), ())",
    )
    expect(stmt.sampleBy!.groupingSets).toEqual({
      type: "groupingSets",
      kind: "groupingSets",
      sets: [[col("sym")], []],
    })
  })
})

describe("round trip", () => {
  it.each([
    "SELECT a, sum(b) FROM t GROUP BY ROLLUP(a)",
    "SELECT a, b, sum(c) FROM t GROUP BY CUBE(a, b)",
    "SELECT a, b, grouping_id(a, b) AS gid, sum(v) FROM t GROUP BY GROUPING SETS ((a, b), (a), ())",
    "SELECT 1 FROM t GROUP BY GROUPING SETS (())",
    "SELECT trim(s) AS k, b, grouping(b) AS g, sum(v) FROM t GROUP BY trim(s), ROLLUP(b)",
    "SELECT a, b FROM t GROUP BY a, rollup, CUBE(b)",
    "SELECT grouping(sym), ts, sym, sum(q) FROM t SAMPLE BY 1h ROLLUP(sym) FILL(NULL)",
    "SELECT ts, sym, sum(x) FROM t SAMPLE BY 1d GROUPING SETS ((sym), ()) FILL(NONE) ALIGN TO CALENDAR",
    "SELECT ts, sym, sum(x) FROM t SAMPLE BY 1d CUBE(sym, side) FROM '2024-01-01' TO '2024-01-02' FILL(0) ALIGN TO CALENDAR TIME ZONE 'Europe/Riga' WITH OFFSET '00:30'",
    "SELECT ts, a, sum(v) FROM t SAMPLE BY 1d ROLLUP(a) ORDER BY ts, a LIMIT 10",
    "t GROUP BY ROLLUP(a)",
    "t SAMPLE BY 1h GROUPING SETS ((a))",
  ])("%s", (sql) => {
    expect(toSql(parseToAst(sql).ast)).toBe(sql)
    expect(parseToAst(sql).errors).toEqual([])
  })

  it("normalises keyword case", () => {
    expect(toSql(parseToAst("select a from t group by rollup(a)").ast)).toBe(
      "SELECT a FROM t GROUP BY ROLLUP(a)",
    )
    expect(
      toSql(
        parseToAst("select a from t sample by 1h grouping sets ((a),())").ast,
      ),
    ).toBe("SELECT a FROM t SAMPLE BY 1h GROUPING SETS ((a), ())")
  })
})

describe("what the server rejects stays rejected", () => {
  it.each([
    // nothing may follow ROLLUP / CUBE / GROUPING SETS
    "SELECT a, b FROM t GROUP BY ROLLUP(a), b",
    "SELECT a, b FROM t GROUP BY CUBE(a), CUBE(b)",
    "SELECT a FROM t GROUP BY GROUPING SETS ((a)), a",
    // GROUPING SETS must be the only GROUP BY item
    "SELECT a, c1 FROM t GROUP BY a, GROUPING SETS ((c1), ())",
    "SELECT a, c1, count() FROM t GROUP BY a, c1, grouping sets ((c2))",
    // every set needs parentheses
    "SELECT a FROM t GROUP BY GROUPING SETS (a)",
    "SELECT a FROM t GROUP BY GROUPING SETS ()",
    "SELECT a FROM t GROUP BY GROUPING SETS",
    // ROLLUP / CUBE need at least one column
    "SELECT a FROM t GROUP BY ROLLUP()",
    "SELECT a FROM t GROUP BY a, CUBE()",
    // keys must be column references
    "SELECT sum(v) FROM t GROUP BY ROLLUP(a + b)",
    "SELECT sum(v) FROM t GROUP BY CUBE(1)",
    "SELECT sum(v) FROM t GROUP BY GROUPING SETS ((a + b))",
    "SELECT sum(v) FROM t GROUP BY GROUPING SETS ((a, ))",
    "SELECT sum(v) FROM t SAMPLE BY 1h ROLLUP(a + b)",
    // SAMPLE BY: grouping right after the interval, only one
    "SELECT ts, a FROM t SAMPLE BY 1h FILL(NULL) ROLLUP(a)",
    "SELECT ts, a FROM t SAMPLE BY 1h ROLLUP(a), CUBE(a)",
    "SELECT ts, a FROM t SAMPLE BY 1h ROLLUP(a) CUBE(a)",
    "SELECT ts, a FROM t SAMPLE BY 1h GROUPING a",
  ])("%s", (sql) => {
    expect(rejected(sql)).toBe(true)
  })

  it("GROUPING SETS after plain keys is an error, not a second statement", () => {
    const result = parseToAst(
      "SELECT a, c1, count() FROM t GROUP BY a, c1, grouping sets ((c2))",
    )
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

describe("autocomplete", () => {
  it.each([
    "SELECT a FROM t GROUP BY ",
    "SELECT ts, a FROM t SAMPLE BY 1h ",
    "t SAMPLE BY 1h ",
  ])("offers ROLLUP, CUBE and GROUPING after: %s", (sql) => {
    const tokens = getNextValidTokens(sql)
    expect(tokens).toContain("Rollup")
    expect(tokens).toContain("Cube")
    expect(tokens).toContain("Grouping")
  })

  it("offers ROLLUP and CUBE (not GROUPING) after a plain GROUP BY key", () => {
    const tokens = getNextValidTokens("SELECT a FROM t GROUP BY a, ")
    expect(tokens).toContain("Rollup")
    expect(tokens).toContain("Cube")
    expect(tokens).not.toContain("Grouping")
  })

  it("offers SETS after GROUPING", () => {
    expect(getNextValidTokens("SELECT a FROM t GROUP BY GROUPING ")).toContain(
      "Sets",
    )
    expect(
      getNextValidTokens("SELECT a FROM t SAMPLE BY 1h GROUPING "),
    ).toEqual(["Sets"])
  })

  it("keeps FROM / FILL / ALIGN after the SAMPLE BY grouping", () => {
    const tokens = getNextValidTokens(
      "SELECT ts, a FROM t SAMPLE BY 1h ROLLUP(a) ",
    )
    expect(tokens).toContain("Fill")
    expect(tokens).toContain("Align")
    expect(tokens).toContain("From")
    expect(tokens).not.toContain("Rollup")
  })

  it.each([
    "SELECT ",
    "SELECT * FROM t WHERE ",
    "SELECT * FROM t WHERE a > ",
    "SELECT * FROM t ORDER BY ",
  ])("does not offer grouping keywords where they are invalid: %s", (sql) => {
    const tokens = getNextValidTokens(sql)
    expect(tokens).not.toContain("Rollup")
    expect(tokens).not.toContain("Cube")
    expect(tokens).not.toContain("Sets")
  })

  const provider = createAutocompleteProvider({
    tables: [{ name: "trades" }],
    columns: {
      trades: [
        { name: "symbol", type: "SYMBOL" },
        { name: "side", type: "SYMBOL" },
        { name: "ts", type: "TIMESTAMP" },
      ],
    },
  })
  const labels = (sql: string) =>
    provider.getSuggestions(sql, sql.length).map((s) => s.label)

  it("suggests the keywords and columns after GROUP BY", () => {
    const l = labels("SELECT symbol, count() FROM trades GROUP BY ")
    expect(l).toContain("ROLLUP")
    expect(l).toContain("CUBE")
    expect(l).toContain("GROUPING")
    expect(l).toContain("symbol")
  })

  it.each([
    "SELECT symbol, count() FROM trades GROUP BY ROLLUP(",
    "SELECT symbol, count() FROM trades GROUP BY symbol, CUBE(side, ",
    "SELECT symbol, count() FROM trades GROUP BY GROUPING SETS ((",
    "SELECT symbol, count() FROM trades GROUP BY GROUPING SETS ((symbol), (",
    "SELECT ts, symbol, count() FROM trades SAMPLE BY 1h ROLLUP(",
  ])("suggests columns inside the parentheses: %s", (sql) => {
    expect(labels(sql)).toContain("side")
  })
})

// PR #42 review: the server parses each grouping key as an expression and
// then checks it resolves to a column (SqlParser.parseParenthesizedColumnList,
// parseExplicitGroupingSets), so parenthesized keys and DECLARE variables work.
describe("grouping keys: parentheses and declared variables", () => {
  it.each([
    [
      "SELECT x, count() FROM long_sequence(10) GROUP BY ROLLUP((x))",
      "SELECT x, count() FROM long_sequence(10) GROUP BY ROLLUP(x)",
    ],
    [
      "SELECT x, count() FROM long_sequence(10) GROUP BY CUBE((x))",
      "SELECT x, count() FROM long_sequence(10) GROUP BY CUBE(x)",
    ],
    [
      "SELECT x, count() FROM long_sequence(10) GROUP BY GROUPING SETS (((x)), ())",
      "SELECT x, count() FROM long_sequence(10) GROUP BY GROUPING SETS ((x), ())",
    ],
    [
      "DECLARE @k := x SELECT x, count() FROM long_sequence(10) GROUP BY ROLLUP(@k)",
      "DECLARE @k := x SELECT x, count() FROM long_sequence(10) GROUP BY ROLLUP(@k)",
    ],
    [
      "DECLARE @k := x SELECT x, count() FROM long_sequence(10) GROUP BY GROUPING SETS ((@k), ())",
      "DECLARE @k := x SELECT x, count() FROM long_sequence(10) GROUP BY GROUPING SETS ((@k), ())",
    ],
  ])("%s", (sql, expected) => {
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
    expect(toSql(result.ast)).toBe(expected)
  })

  it("keeps column completion after a parenthesized grouping clause", () => {
    const provider = createAutocompleteProvider({
      tables: [{ name: "t" }],
      columns: { t: [{ name: "x", type: "LONG" }] },
    })
    const sql =
      "SELECT x, count() FROM t GROUP BY GROUPING SETS (((x)), ()) ORDER BY "
    expect(
      provider.getSuggestions(sql, sql.length).map((s) => s.label),
    ).toContain("x")
  })
})
