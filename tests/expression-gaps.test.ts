/**
 * Expression forms the QuestDB server's ExpressionParser accepts:
 *   - `(expr).member`        member access on a parenthesised value (DOT dereference
 *                            after `)`; ExpressionParserTest:672, DeclareTest:4545)
 *   - `- -a`, `~-a`, `-~-~1` stacked prefix operators (ExpressionParserTest:1863)
 *   - `NOT NOT x`, `x = NOT y` NOT as a nested / right-hand operand
 *                            (BooleanSubQueryPredicateTest:252, CompiledFilterIRSerializerTest:301)
 *   - `a = 1 = true`          left-associative chained comparisons
 *
 * Statement-level server queries live in tests/fixtures/server-queries.json
 * (feature "expression-gaps").
 */

import { describe, it, expect } from "vitest"
import { parseToAst } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.Statement[] => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast
}

const roundTrip = (sql: string) => {
  const out = toSql(ok(sql))
  // the output must re-parse to the same SQL
  expect(toSql(ok(out))).toBe(out)
  return out
}

describe("expression gaps", () => {
  it("member access on a parenthesised value", () => {
    expect(roundTrip("SELECT (x).a FROM t")).toBe("SELECT (x).a FROM t")
    expect(
      roundTrip("SELECT case when (a).b then (b).c + 1 else -(b).c end FROM t"),
    ).toBe("SELECT CASE WHEN (a).b THEN (b).c + 1 ELSE -(b).c END FROM t")
    const sel = ok("SELECT (x).a FROM t")[0] as AST.SelectStatement
    expect(sel.columns[0]).toMatchObject({
      expression: {
        type: "memberAccess",
        member: "a",
        expression: { type: "paren" },
      },
    })
  })

  it("stacked unary operators", () => {
    expect(roundTrip("SELECT - -a FROM t")).toBe("SELECT - -a FROM t")
    expect(roundTrip("SELECT ~-a FROM t")).toBe("SELECT ~-a FROM t")
    expect(roundTrip("SELECT * FROM t WHERE -~-~1 > ~-1")).toBe(
      "SELECT * FROM t WHERE -~-~1 > ~-1",
    )
  })

  it("NOT NOT and NOT as a comparison operand", () => {
    expect(roundTrip("SELECT * FROM t WHERE NOT NOT x")).toBe(
      "SELECT * FROM t WHERE NOT NOT x",
    )
    expect(roundTrip("SELECT * FROM t WHERE x = NOT y")).toBe(
      "SELECT * FROM t WHERE x = NOT y",
    )
    expect(
      roundTrip(
        "SELECT * FROM t WHERE aboolean = true or not aboolean = not false",
      ),
    ).toBe("SELECT * FROM t WHERE aboolean = TRUE OR NOT aboolean = NOT FALSE")
  })

  it("chained comparisons are left-associative", () => {
    const sel = ok(
      "SELECT * FROM t WHERE a = 1 = true",
    )[0] as AST.SelectStatement
    expect(sel.where).toMatchObject({
      type: "binary",
      operator: "=",
      left: { type: "binary", operator: "=" },
      right: { type: "literal", value: true },
    })
    expect(roundTrip("SELECT * FROM t WHERE a = 1 = true")).toBe(
      "SELECT * FROM t WHERE a = 1 = TRUE",
    )
    expect(roundTrip("SELECT * FROM t WHERE a <> 1 != b")).toBe(
      "SELECT * FROM t WHERE a != 1 != b",
    )
    expect(roundTrip("SELECT * FROM t WHERE a < b < c")).toBe(
      "SELECT * FROM t WHERE a < b < c",
    )
  })

  it("dotted names and plain expressions are unchanged", () => {
    expect(roundTrip("SELECT t.a, -a, NOT b FROM t")).toBe(
      "SELECT t.a, -a, NOT b FROM t",
    )
  })
})
