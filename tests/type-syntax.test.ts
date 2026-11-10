/**
 * Type syntax the QuestDB server accepts in expressions (reports §3.2):
 *   - `<expr> AT TIME ZONE '<tz>'`         ExpressionParser case 'a' (BRANCH_TIMESTAMP_ZONE),
 *                                          rewritten to to_timezone(expr, tz)
 *   - `timestamp[_ns] WITH TIME ZONE` as a cast target (`::` and CAST(.. AS ..))
 *   - `DOUBLE PRECISION`                   ExpressionParser isPrecisionKeyword (casts),
 *                                          SqlParser.toColumnType (CREATE TABLE columns, CTAS casts)
 *
 * Server queries live in tests/fixtures/server-queries.json (feature "type-syntax").
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

const firstItem = (sql: string): AST.Expression => {
  const select = ok(sql)[0] as AST.SelectStatement
  return (select.columns[0] as { expression: AST.Expression }).expression
}

const roundTrip = (sql: string) => toSql(ok(sql))

const fails = (sql: string) => {
  expect(parseToAst(sql).errors.length).toBeGreaterThan(0)
}

describe("AT TIME ZONE", () => {
  it("builds an atTimeZone node", () => {
    expect(firstItem("SELECT ts AT TIME ZONE 'UTC' FROM t")).toEqual({
      type: "atTimeZone",
      expression: {
        type: "column",
        name: { type: "qualifiedName", parts: ["ts"] },
      },
      timeZone: { type: "literal", value: "UTC", literalType: "string" },
    })
    expect(roundTrip("select ts at time zone 'UTC' from t")).toBe(
      "SELECT ts AT TIME ZONE 'UTC' FROM t",
    )
  })

  it("applies to the cast operand and binds tighter than arithmetic", () => {
    const e = firstItem(
      "SELECT x::timestamp AT TIME ZONE 'UTC' + 5",
    ) as AST.BinaryExpression
    expect(e.type).toBe("binary")
    expect(e.operator).toBe("+")
    const left = e.left as AST.AtTimeZoneExpression
    expect(left.type).toBe("atTimeZone")
    expect(left.expression).toMatchObject({
      type: "typeCast",
      dataType: "TIMESTAMP",
    })
  })

  it("sits inside unary minus", () => {
    const e = firstItem("SELECT -ts AT TIME ZONE 'UTC'") as AST.UnaryExpression
    expect(e.type).toBe("unary")
    expect(e.operand.type).toBe("atTimeZone")
  })

  it("works in WHERE, function args and with E'' strings", () => {
    expect(
      roundTrip(
        "SELECT date_trunc('day', ts AT TIME ZONE E'Europe/London') FROM t WHERE ts AT TIME ZONE 'EST' > 0",
      ),
    ).toBe(
      "SELECT date_trunc('day', ts AT TIME ZONE E'Europe/London') FROM t WHERE ts AT TIME ZONE 'EST' > 0",
    )
  })

  it("keeps alias names at, time and zone", () => {
    expect(roundTrip("SELECT ts at FROM t")).toBe("SELECT ts AS at FROM t")
    expect(roundTrip("SELECT at, time, zone FROM t")).toBe(
      "SELECT at, time, zone FROM t",
    )
    expect(roundTrip("SELECT ts time FROM t")).toBe("SELECT ts AS time FROM t")
    expect(roundTrip("CREATE TABLE at (at INT)")).toBe(
      "CREATE TABLE at (at INT)",
    )
  })

  it.each([
    "SELECT ts AT 'UTC' FROM t",
    "SELECT ts AT TIME 'UTC' FROM t",
    "SELECT ts AT TIME ZONE FROM t",
    "SELECT ts AT TIME ZONE tz FROM t",
  ])("rejects incomplete forms: %s", (sql) => fails(sql))

  // TimestampAtTimeZoneTest testFail2 / testFailDangling2 / testFailDangling3:
  // the server reports "did you mean 'at time zone <tz>'?". These used to be
  // split silently into `... AS at; time AS UTC`.
  it.each([
    "select to_timestamp_ns('2022-03-11T22:00:30.555555555Z') at time 'UTC'",
    "select to_timestamp('2022-03-11T22:00:30.555555Z') at time",
    "select to_timestamp_ns('2022-03-11T22:00:30.555555555Z') at time",
  ])("rejects what the server rejects: %s", (sql) => fails(sql))
})

describe("timestamp WITH TIME ZONE as a cast target", () => {
  it("parses CAST(.. AS timestamp with time zone)", () => {
    expect(
      firstItem("SELECT CAST(x AS timestamp with time zone) FROM t"),
    ).toEqual({
      type: "cast",
      expression: {
        type: "column",
        name: { type: "qualifiedName", parts: ["x"] },
      },
      dataType: "TIMESTAMP WITH TIME ZONE",
    })
    expect(
      roundTrip("SELECT CAST(x AS timestamp_ns with time zone) FROM t"),
    ).toBe("SELECT CAST(x AS TIMESTAMP_NS WITH TIME ZONE) FROM t")
  })

  it("parses x::timestamp with time zone, with an alias", () => {
    expect(firstItem("SELECT x::timestamp with time zone ts FROM t")).toEqual({
      type: "typeCast",
      expression: {
        type: "column",
        name: { type: "qualifiedName", parts: ["x"] },
      },
      dataType: "TIMESTAMP WITH TIME ZONE",
    })
    expect(roundTrip("SELECT x::timestamp with time zone ts FROM t")).toBe(
      "SELECT x::TIMESTAMP WITH TIME ZONE AS ts FROM t",
    )
  })

  it("keeps the typed literal form", () => {
    expect(
      roundTrip("SELECT timestamp with time zone '2020-01-01' FROM t"),
    ).toBe("SELECT TIMESTAMP WITH TIME ZONE '2020-01-01' FROM t")
  })

  it.each([
    "SELECT CAST(x AS int with time zone) FROM t",
    "SELECT x::date with time zone FROM t",
    "SELECT CAST(x AS timestamp with time) FROM t",
    "CREATE TABLE t (ts TIMESTAMP WITH TIME ZONE)",
    "ALTER TABLE t ADD COLUMN ts TIMESTAMP WITH TIME ZONE",
  ])("rejects it elsewhere: %s", (sql) => fails(sql))
})

describe("DOUBLE PRECISION", () => {
  it("is a cast target", () => {
    expect(firstItem("SELECT CAST(x AS DOUBLE PRECISION) FROM t")).toEqual({
      type: "cast",
      expression: {
        type: "column",
        name: { type: "qualifiedName", parts: ["x"] },
      },
      dataType: "DOUBLE PRECISION",
    })
    expect(roundTrip("SELECT x::double precision[] FROM t")).toBe(
      "SELECT x::DOUBLE PRECISION[] FROM t",
    )
  })

  it("is a column type in CREATE TABLE", () => {
    const stmt = ok(
      "CREATE TABLE t (x DOUBLE PRECISION, y double precision[], ts TIMESTAMP) TIMESTAMP(ts)",
    )[0] as AST.CreateTableStatement
    expect(stmt.columns!.map((c) => c.dataType)).toEqual([
      "DOUBLE PRECISION",
      "DOUBLE PRECISION[]",
      "TIMESTAMP",
    ])
    expect(toSql(stmt)).toBe(
      "CREATE TABLE t (x DOUBLE PRECISION, y DOUBLE PRECISION[], ts TIMESTAMP) TIMESTAMP(ts)",
    )
  })

  it("is a CTAS cast target", () => {
    expect(
      roundTrip(
        "CREATE TABLE t AS (SELECT * FROM s), CAST(x AS DOUBLE PRECISION)",
      ),
    ).toBe("CREATE TABLE t AS (SELECT * FROM s), CAST(x AS DOUBLE PRECISION)")
  })

  it("keeps precision usable as a name", () => {
    expect(roundTrip("SELECT x precision FROM t")).toBe(
      "SELECT x AS precision FROM t",
    )
    expect(roundTrip("SELECT x::int precision FROM t")).toBe(
      "SELECT x::INT AS precision FROM t",
    )
    expect(roundTrip("CREATE TABLE precision (precision DOUBLE)")).toBe(
      "CREATE TABLE precision (precision DOUBLE)",
    )
  })

  it("rejects it after other types", () => {
    fails("SELECT CAST(x AS INT PRECISION) FROM t")
  })

  it("is not an ALTER TABLE ADD COLUMN type (addColumnWithType)", () => {
    // like any trailing word there, PRECISION is not part of the ALTER
    const result = parseToAst("ALTER TABLE t ADD COLUMN x DOUBLE PRECISION")
    expect(result.ast.length).not.toBe(1)
    const alter = result.ast[0] as AST.AlterTableStatement
    expect(toSql(alter)).toBe("ALTER TABLE t ADD COLUMN x DOUBLE")
  })
})

describe("formatter", () => {
  it("keeps WITH TIME ZONE after timestamp on the same line", () => {
    expect(
      format(
        "select x::timestamp with time zone a, timestamp with time zone '2020-01-01' b from t",
      ),
    ).toBe(
      "select\n  x::timestamp with time zone a,\n  timestamp with time zone '2020-01-01' b\nfrom t",
    )
    expect(format("select ts at time zone 'UTC' from t")).toBe(
      "select ts at time zone 'UTC'\nfrom t",
    )
  })

  it("still breaks before a WITH clause", () => {
    expect(format("with a as (select 1) select * from a")).toBe(
      "with a as (\n  select 1\n)\nselect *\nfrom a",
    )
  })
})

describe("autocomplete", () => {
  it.each([
    ["SELECT x::timestamp ", "With"],
    ["SELECT x::timestamp_ns ", "With"],
    ["SELECT CAST(x AS TIMESTAMP ", "With"],
    ["SELECT CAST(x AS TIMESTAMP WITH ", "Time"],
    ["SELECT CAST(x AS TIMESTAMP WITH TIME ", "Zone"],
    ["SELECT CAST(x AS DOUBLE ", "Precision"],
    ["SELECT x::double ", "Precision"],
    ["CREATE TABLE t (x DOUBLE ", "Precision"],
    ["SELECT ts ", "At"],
    ["SELECT * FROM t WHERE ts ", "At"],
    ["SELECT ts AT ", "Time"],
    ["SELECT ts AT TIME ", "Zone"],
  ])("after `%s` offers %s", (sql, token) => {
    expect(getNextValidTokens(sql)).toContain(token)
  })

  it.each([
    ["SELECT x::int ", "With"],
    ["SELECT CAST(x AS INT ", "With"],
    ["SELECT CAST(x AS INT ", "Precision"],
    ["CREATE TABLE t (ts TIMESTAMP ", "With"],
    ["CREATE TABLE t (x INT ", "Precision"],
    ["ALTER TABLE t ADD COLUMN x DOUBLE ", "Precision"],
    ["SELECT * FROM t WHERE ts > x ", "With"],
    ["SELECT ", "At"],
    ["SELECT ", "Precision"],
    ["SELECT * FROM t WHERE ", "At"],
  ])("after `%s` does not offer %s", (sql, token) => {
    expect(getNextValidTokens(sql)).not.toContain(token)
  })

  it("offers ZONE only after AT TIME", () => {
    expect(getNextValidTokens("SELECT ts AT TIME ")).toEqual(["Zone"])
  })
})
