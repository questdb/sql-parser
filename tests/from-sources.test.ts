/**
 * Schema-qualified table functions in FROM / JOIN
 * (`pg_catalog.pg_class()`, `information_schema.tables()`) and
 * `UNION DISTINCT` (server parseDml: same as UNION).
 */

import { describe, it, expect } from "vitest"
import { parseToAst } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.SelectStatement => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0] as AST.SelectStatement
}

const roundTrip = (sql: string, expected: string) => {
  const out = toSql(ok(sql))
  expect(out).toBe(expected)
  expect(toSql(ok(out))).toBe(expected)
}

describe("FROM sources", () => {
  it("schema-qualified table functions", () => {
    const sel = ok(
      "SELECT * FROM pg_catalog.pg_class() c JOIN pg_catalog.pg_namespace() n ON n.oid = c.relnamespace",
    )
    const from = sel.from![0]
    expect(from.table).toMatchObject({
      type: "tableFunctionCall",
      name: "pg_catalog.pg_class",
    })
    expect(from.alias).toBe("c")
    roundTrip(
      "SELECT * FROM pg_catalog.pg_class() c JOIN pg_catalog.pg_namespace() n ON n.oid = c.relnamespace",
      "SELECT * FROM pg_catalog.pg_class() AS c JOIN pg_catalog.pg_namespace() AS n ON n.oid = c.relnamespace",
    )
    roundTrip(
      "SELECT * FROM information_schema._pg_expandarray(x)",
      "SELECT * FROM information_schema._pg_expandarray(x)",
    )
    // qualified table names still parse as tables
    expect(ok("SELECT * FROM s.t x").from![0].table).toMatchObject({
      type: "qualifiedName",
    })
  })

  it("UNION DISTINCT", () => {
    roundTrip(
      "SELECT a FROM t UNION DISTINCT SELECT a FROM u",
      "SELECT a FROM t UNION SELECT a FROM u",
    )
  })
})
