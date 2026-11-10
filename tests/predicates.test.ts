/**
 * Predicates the QuestDB server accepts (reports §3.2):
 *   - `a IS [NOT] TRUE|FALSE`   ExpressionParser.validateIsKeyword (IS [NOT] NULL|TRUE|FALSE,
 *                               rewritten to `=` / `!=`)
 *   - `a <> ALL (...)`,
 *     `a != ALL (...)`          ExpressionParser isAllKeyword + allFunctions (`<>`/`!=` -> `<>all`);
 *                               any other operator before ALL is "unexpected operator"
 *   - `a NOT WITHIN (...)`      OperatorExpression.UnarySetNegation (NOT before a SET operator:
 *                               in / between / within)
 *
 * Statement-level server queries live in tests/fixtures/server-queries.json
 * (feature "predicates"). The server tests for IS TRUE/FALSE, `!= all` and
 * NOT WITHIN are expression-only (ExpressionParserTest, ExpressionParserFuzzTest),
 * so they are wrapped in a WHERE clause here.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import { format } from "../src/formatter/index"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.Statement[] => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast
}

const where = (cond: string): AST.Expression => {
  const select = ok(`SELECT * FROM tab WHERE ${cond}`)[0] as AST.SelectStatement
  return select.where!
}

const roundTrip = (sql: string) => toSql(ok(sql))

const fails = (sql: string) => {
  expect(parseToAst(sql).errors.length).toBeGreaterThan(0)
}

const col = (...parts: string[]) => ({
  type: "column",
  name: { type: "qualifiedName", parts },
})

describe("IS [NOT] TRUE / FALSE", () => {
  it("builds an isBoolean node", () => {
    expect(where("a IS TRUE")).toEqual({
      type: "isBoolean",
      expression: col("a"),
      value: true,
      not: false,
    })
    expect(where("a IS NOT FALSE")).toEqual({
      type: "isBoolean",
      expression: col("a"),
      value: false,
      not: true,
    })
  })

  // ExpressionParserTest.testIsTrue / testIsNotTrue / testIsNotFalse
  it.each([
    ["a IS True", "a IS TRUE"],
    ["tab.a IS True", "tab.a IS TRUE"],
    ["'true' IS true", "'true' IS TRUE"],
    ["a IS not True", "a IS NOT TRUE"],
    ["tab.a IS NOT True", "tab.a IS NOT TRUE"],
    ["'true' IS not true", "'true' IS NOT TRUE"],
    ["a IS not False", "a IS NOT FALSE"],
    ["tab.a IS NOT False", "tab.a IS NOT FALSE"],
    ["'False' IS not False", "'False' IS NOT FALSE"],
    ["a is false", "a IS FALSE"],
    ["(a > 1) IS NOT TRUE", "(a > 1) IS NOT TRUE"],
  ])("WHERE %s", (cond, expected) => {
    expect(roundTrip(`SELECT * FROM tab WHERE ${cond}`)).toBe(
      `SELECT * FROM tab WHERE ${expected}`,
    )
  })

  it("combines with AND / OR and works in the select list", () => {
    expect(
      roundTrip(
        "select a is true, b is not false from t where a is not true and b is false",
      ),
    ).toBe(
      "SELECT a IS TRUE, b IS NOT FALSE FROM t WHERE a IS NOT TRUE AND b IS FALSE",
    )
  })

  it("keeps IS [NOT] NULL unchanged", () => {
    expect(where("a IS NOT NULL")).toEqual({
      type: "isNull",
      expression: col("a"),
      not: true,
    })
    expect(roundTrip("SELECT * FROM t WHERE a IS NULL")).toBe(
      "SELECT * FROM t WHERE a IS NULL",
    )
  })

  // ExpressionParserTest.testIsNull / testIsNotNull assertFail cases
  it.each([
    "a IS 3",
    "a IS NOT 3",
    "a IS $1",
    "a IS NOT $1",
    "a IS",
    "a IS NOT",
    "a IS NOT NOT TRUE",
  ])("rejects WHERE %s", (cond) => {
    fails(`SELECT * FROM tab WHERE ${cond}`)
  })

  it("formats", () => {
    expect(format("select * from t where a is not false")).toBe(
      "select *\nfrom t\nwhere a is not false",
    )
  })

  it("suggests TRUE / FALSE after IS and IS NOT", () => {
    const afterIs = getNextValidTokens("SELECT * FROM t WHERE a IS ")
    expect(afterIs).toEqual(
      expect.arrayContaining(["Not", "Null", "True", "False"]),
    )
    const afterIsNot = getNextValidTokens("SELECT * FROM t WHERE a IS NOT ")
    expect(afterIsNot).toEqual(
      expect.arrayContaining(["Null", "True", "False"]),
    )
    expect(afterIsNot).not.toContain("Not")
  })
})

describe("<> ALL / != ALL", () => {
  it("builds a binary node with the quantified operator", () => {
    expect(where("a <> all(b)")).toEqual({
      type: "binary",
      operator: "<> ALL",
      left: col("a"),
      right: { type: "paren", expression: col("b") },
    })
    expect(where("a != ALL (b)")).toMatchObject({
      type: "binary",
      operator: "!= ALL",
    })
  })

  // ExpressionParserTest.testAllNotEqual
  it.each([
    ["a <> all(b)", "a <> ALL (b)"],
    ["a != all(b)", "a != ALL (b)"],
    ["a<>ALL('{x}'::text[])", "a <> ALL ('{x}'::TEXT[])"],
    ["a <> all(b) and c = 1", "a <> ALL (b) AND c = 1"],
    ["not a <> all(b)", "NOT a <> ALL (b)"],
  ])("WHERE %s", (cond, expected) => {
    expect(roundTrip(`SELECT * FROM tab WHERE ${cond}`)).toBe(
      `SELECT * FROM tab WHERE ${expected}`,
    )
  })

  it("keeps plain <> / != unchanged", () => {
    expect(where("a <> b")).toEqual({
      type: "binary",
      operator: "!=",
      left: col("a"),
      right: col("b"),
    })
  })

  // ExpressionParserTest.testAllInvalidOperator / testAllNoOperator:
  // only <> and != take ALL
  it.each(["a || all(b)", "a all(b)", "a = all(b)", "a > all(b)", "a <> all"])(
    "rejects WHERE %s",
    (cond) => {
      fails(`SELECT * FROM tab WHERE ${cond}`)
    },
  )

  it("formats", () => {
    expect(format("select * from t where a <> all(b)")).toBe(
      "select *\nfrom t\nwhere a <> all(b)",
    )
  })

  it("suggests ALL only after <> / !=", () => {
    expect(getNextValidTokens("SELECT * FROM t WHERE a <> ")).toContain("All")
    expect(getNextValidTokens("SELECT * FROM t WHERE a != ")).toContain("All")
    expect(getNextValidTokens("SELECT * FROM t WHERE a = ")).not.toContain(
      "All",
    )
    expect(getNextValidTokens("SELECT * FROM t WHERE a < ")).not.toContain(
      "All",
    )
  })
})

describe("NOT WITHIN", () => {
  it("sets not on the within node", () => {
    expect(where("g NOT WITHIN (#u33)")).toEqual({
      type: "within",
      expression: col("g"),
      values: [{ type: "literal", value: "#u33", literalType: "geohash" }],
      not: true,
    })
  })

  it("keeps plain WITHIN without a not field", () => {
    expect(where("g WITHIN (#u33)")).not.toHaveProperty("not")
  })

  it.each([
    ["g NOT WITHIN (#u33)", "g NOT WITHIN (#u33)"],
    ["geo not within(#gk1gj8, #mbx5c0)", "geo NOT WITHIN (#gk1gj8, #mbx5c0)"],
    ["NOT g WITHIN (#u33)", "NOT g WITHIN (#u33)"],
    [
      "g not within (#u33) and x not in (1, 2)",
      "g NOT WITHIN (#u33) AND x NOT IN (1, 2)",
    ],
  ])("WHERE %s", (cond, expected) => {
    expect(roundTrip(`SELECT * FROM tab WHERE ${cond}`)).toBe(
      `SELECT * FROM tab WHERE ${expected}`,
    )
  })

  it("builds NOT WITHIN in a LATEST ON query", () => {
    expect(
      roundTrip(
        "select * from x where geo not within(#gk1gj8, #mbx5c0) latest on ts partition by sym",
      ),
    ).toBe(
      "SELECT * FROM x WHERE geo NOT WITHIN (#gk1gj8, #mbx5c0) LATEST ON ts PARTITION BY sym",
    )
  })

  it("rejects NOT WITHIN without a value list", () => {
    fails("SELECT * FROM t WHERE g NOT WITHIN")
  })

  it("formats", () => {
    expect(format("select * from t where g not within (#u33)")).toBe(
      "select *\nfrom t\nwhere g not within (#u33)",
    )
  })

  it("suggests WITHIN after a NOT that follows an operand", () => {
    const afterNot = getNextValidTokens("SELECT * FROM t WHERE g NOT ")
    expect(afterNot).toEqual(
      expect.arrayContaining(["In", "Between", "Within", "Like", "Ilike"]),
    )
  })
})
