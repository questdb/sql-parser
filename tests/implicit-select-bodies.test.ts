/**
 * Implicit select bodies (bare table / table + clauses / table function /
 * PIVOT) in CREATE MATERIALIZED VIEW, CTAS, CREATE/ALTER VIEW and
 * COPY (...) TO (reports §1.4, §3.4, §3.5, §3.6).
 *
 * Server grammar: all of these bodies go through SqlParser.parseDml, which
 * reads `t [WHERE ...] [... clauses]`, `t UNION ...`, `fn(...)` and
 * `t PIVOT (...)` as an implicit `SELECT * FROM ...`:
 *   CREATE MATERIALIZED VIEW v AS ( body ) | body      (parseCreateMatView)
 *   CREATE [ATOMIC] TABLE t AS ( body ) [, CAST/INDEX]  (parseCreateTableAsSelect, '(' required)
 *   CREATE VIEW v AS ( body ) | body                    (parseCreateView)
 *   ALTER VIEW v AS ( body ) | body                     (parseViewSql)
 *   COPY ( body ) TO '...'                              (parseCopy)
 *
 * Server queries for this feature live in tests/fixtures/server-queries.json.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const parseOne = (sql: string): AST.Statement => {
  const result = parseToAst(sql)
  expect(result.errors.map((e) => e.message)).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

/** true when sql is rejected or does not read as a single statement */
const rejected = (sql: string) => {
  const result = parseToAst(sql)
  return result.errors.length > 0 || result.ast.length !== 1
}

const roundTrip = (sql: string, expected: string) => {
  const out = toSql(parseOne(sql))
  expect(out).toBe(expected)
  expect(toSql(parseOne(out))).toBe(expected)
}

const tableName = (q: AST.SelectStatement, i = 0) =>
  (q.from?.[i]?.table as AST.QualifiedName).parts.join(".")

describe("CREATE MATERIALIZED VIEW with an implicit body", () => {
  it("parenthesised table + WHERE", () => {
    const stmt = parseOne(
      "CREATE MATERIALIZED VIEW v5 AS (base_price WHERE price > 0)",
    ) as AST.CreateMaterializedViewStatement
    expect(stmt.type).toBe("createMaterializedView")
    expect(stmt.asParens).toBe(true)
    expect(stmt.query.implicit).toBe(true)
    expect(tableName(stmt.query)).toBe("base_price")
    expect(stmt.query.where).toBeDefined()
  })

  it("bare table without parentheses", () => {
    const stmt = parseOne(
      "CREATE MATERIALIZED VIEW v4 AS base_price",
    ) as AST.CreateMaterializedViewStatement
    expect(stmt.asParens).toBeUndefined()
    expect(stmt.query.implicit).toBe(true)
    expect(tableName(stmt.query)).toBe("base_price")
  })

  it.each([
    [
      "CREATE MATERIALIZED VIEW v5 AS (base_price WHERE price > 0) EXPIRE ROWS WHEN price < 1",
      "CREATE MATERIALIZED VIEW v5 AS (base_price WHERE price > 0) EXPIRE ROWS WHEN price < 1",
    ],
    [
      "CREATE MATERIALIZED VIEW v AS (t) PARTITION BY DAY TTL 2 DAYS OWNED BY bob",
      "CREATE MATERIALIZED VIEW v AS (t) PARTITION BY DAY TTL 2 DAYS OWNED BY bob",
    ],
    [
      "CREATE MATERIALIZED VIEW v AS (t SAMPLE BY 1h), INDEX(s) TIMESTAMP(ts) PARTITION BY DAY",
      "CREATE MATERIALIZED VIEW v AS (t SAMPLE BY 1h), INDEX(s) TIMESTAMP(ts) PARTITION BY DAY",
    ],
    [
      "CREATE MATERIALIZED VIEW v AS (a UNION ALL b)",
      "CREATE MATERIALIZED VIEW v AS (a UNION ALL b)",
    ],
  ])("round trips %s", (sql, expected) => roundTrip(sql, expected))

  it("keeps the SELECT forms", () => {
    roundTrip(
      "CREATE MATERIALIZED VIEW v AS (SELECT * FROM t SAMPLE BY 1h)",
      "CREATE MATERIALIZED VIEW v AS (SELECT * FROM t SAMPLE BY 1h)",
    )
    roundTrip(
      "CREATE MATERIALIZED VIEW v AS SELECT * FROM t SAMPLE BY 1h",
      "CREATE MATERIALIZED VIEW v AS SELECT * FROM t SAMPLE BY 1h",
    )
    roundTrip(
      "CREATE MATERIALIZED VIEW v AS (WITH c AS (SELECT * FROM t) SELECT * FROM c)",
      "CREATE MATERIALIZED VIEW v AS (WITH c AS (SELECT * FROM t) SELECT * FROM c)",
    )
  })

  it("does not read the TIMESTAMP(...) parenthesis as a parenthesised body", () => {
    const stmt = parseOne(
      "CREATE MATERIALIZED VIEW v AS SELECT ts, avg(x) FROM t SAMPLE BY 1h TIMESTAMP(ts)",
    ) as AST.CreateMaterializedViewStatement
    expect(stmt.asParens).toBeUndefined()
    expect(toSql(stmt)).toBe(
      "CREATE MATERIALIZED VIEW v AS SELECT ts, avg(x) FROM t SAMPLE BY 1h TIMESTAMP(ts)",
    )
  })

  it("rejects unbalanced parentheses", () => {
    expect(rejected("CREATE MATERIALIZED VIEW v AS (SELECT * FROM t")).toBe(
      true,
    )
    expect(rejected("CREATE MATERIALIZED VIEW v AS (base_price")).toBe(true)
    expect(rejected("CREATE MATERIALIZED VIEW v AS")).toBe(true)
  })
})

describe("CREATE TABLE AS with an implicit body", () => {
  it("bare table", () => {
    const stmt = parseOne("CREATE TABLE y AS (x)") as AST.CreateTableStatement
    expect(stmt.asSelect?.implicit).toBe(true)
    expect(tableName(stmt.asSelect!)).toBe("x")
  })

  it("UNION ALL of bare tables", () => {
    const stmt = parseOne(
      "CREATE ATOMIC TABLE y AS (x UNION ALL append)",
    ) as AST.CreateTableStatement
    expect(stmt.atomic).toBe(true)
    expect(stmt.asSelect?.implicit).toBe(true)
    expect(stmt.asSelect?.setOperations).toHaveLength(1)
    expect(stmt.asSelect?.setOperations?.[0].operator).toBe("UNION")
    expect(stmt.asSelect?.setOperations?.[0].all).toBe(true)
  })

  it.each([
    [
      "create table y as (x where a > 1 limit 10), index(s) timestamp(ts) partition by day wal",
      "CREATE TABLE y AS (x WHERE a > 1 LIMIT 10), INDEX(s) TIMESTAMP(ts) PARTITION BY DAY WAL",
    ],
    [
      "create table y as (long_sequence(10))",
      "CREATE TABLE y AS (long_sequence(10))",
    ],
    [
      "create table y as (select * from x)",
      "CREATE TABLE y AS (SELECT * FROM x)",
    ],
  ])("round trips %s", (sql, expected) => roundTrip(sql, expected))

  it("still requires the parentheses (server expects '(')", () => {
    expect(rejected("CREATE TABLE y AS x")).toBe(true)
    expect(rejected("CREATE TABLE y AS (x")).toBe(true)
  })
})

describe("CREATE VIEW with an implicit body", () => {
  it("unparenthesised table + WHERE", () => {
    const stmt = parseOne(
      "CREATE VIEW v AS t WHERE x > 0",
    ) as AST.CreateViewStatement
    expect(stmt.asParens).toBeUndefined()
    expect(stmt.query.implicit).toBe(true)
    expect(tableName(stmt.query)).toBe("t")
    expect(stmt.query.where).toBeDefined()
  })

  it.each([
    ["CREATE VIEW v AS t WHERE x > 0", "CREATE VIEW v AS t WHERE x > 0"],
    [
      "create view v as t where x > 0 owned by bob",
      "CREATE VIEW v AS t WHERE x > 0 OWNED BY bob",
    ],
    ["CREATE VIEW v AS (t WHERE x > 0)", "CREATE VIEW v AS (t WHERE x > 0)"],
    ["CREATE VIEW v AS (a UNION b)", "CREATE VIEW v AS (a UNION b)"],
    ["CREATE VIEW v AS a UNION b", "CREATE VIEW v AS a UNION b"],
    [
      "CREATE OR REPLACE VIEW v AS SELECT * FROM t",
      "CREATE OR REPLACE VIEW v AS SELECT * FROM t",
    ],
  ])("round trips %s", (sql, expected) => roundTrip(sql, expected))

  it("rejects clauses after a parenthesised body", () => {
    expect(rejected("CREATE VIEW v AS (t) WHERE x > 0")).toBe(true)
  })
})

describe("ALTER VIEW with an implicit body", () => {
  it.each([
    ["ALTER VIEW v AS (t WHERE x > 0)", "ALTER VIEW v AS (t WHERE x > 0)"],
    ["ALTER VIEW v AS t WHERE x > 0", "ALTER VIEW v AS (t WHERE x > 0)"],
    ["alter view v1 as bla", "ALTER VIEW v1 AS (bla)"],
    ["ALTER VIEW v AS (a UNION ALL b)", "ALTER VIEW v AS (a UNION ALL b)"],
    ["ALTER VIEW v AS SELECT * FROM t", "ALTER VIEW v AS (SELECT * FROM t)"],
  ])("round trips %s", (sql, expected) => roundTrip(sql, expected))

  it("builds an implicit select", () => {
    const stmt = parseOne(
      "ALTER VIEW v AS t WHERE x > 0",
    ) as AST.AlterViewStatement
    expect(stmt.type).toBe("alterView")
    expect(stmt.query.implicit).toBe(true)
    expect(tableName(stmt.query)).toBe("t")
  })
})

describe("COPY (...) TO with an implicit body", () => {
  it("table + WHERE", () => {
    const stmt = parseOne(
      "COPY (test_table WHERE x > 0) TO 'o' WITH FORMAT parquet",
    ) as AST.CopyToStatement
    const source = stmt.source as AST.SelectStatement
    expect(source.type).toBe("select")
    expect(source.implicit).toBe(true)
    expect(tableName(source)).toBe("test_table")
    expect(source.where).toBeDefined()
  })

  it("table function", () => {
    const stmt = parseOne(
      "copy (generate_series(0, '9999-01-01', '1U')) TO 'big' WITH FORMAT PARQUET",
    ) as AST.CopyToStatement
    const source = stmt.source as AST.SelectStatement
    expect(source.implicit).toBe(true)
    expect(source.from?.[0].table).toMatchObject({ type: "tableFunctionCall" })
  })

  it("PIVOT body", () => {
    const stmt = parseOne(
      "copy (monthly_sales PIVOT (SUM(amount) FOR month IN ('JAN') GROUP BY empid) ORDER BY empid) to 'p' with format parquet",
    ) as AST.CopyToStatement
    const source = stmt.source as AST.SelectStatement
    expect(source.implicit).toBe(true)
    expect(source.pivot?.type).toBe("pivotClause")
    expect(source.orderBy).toHaveLength(1)
  })

  it("keeps a bare table name source", () => {
    const stmt = parseOne("COPY t TO 'o'") as AST.CopyToStatement
    expect(stmt.source).toMatchObject({ type: "qualifiedName", parts: ["t"] })
  })

  it.each([
    ["COPY (a UNION ALL b) TO 'o'", "COPY (a UNION ALL b) TO 'o'"],
    ["COPY (SELECT * FROM t) TO 'o'", "COPY (SELECT * FROM t) TO 'o'"],
  ])("round trips %s", (sql, expected) => roundTrip(sql, expected))

  it("rejects an unclosed body", () => {
    expect(rejected("COPY (t WHERE x > 0 TO 'o'")).toBe(true)
  })
})

describe("implicit PIVOT body in a subquery", () => {
  it("parses (t PIVOT (...) ORDER BY ...) as a table source", () => {
    roundTrip(
      "SELECT * FROM (monthly_sales PIVOT (sum(amount) FOR month IN ('JAN')) ORDER BY empid)",
      "SELECT * FROM (monthly_sales PIVOT (sum(amount) FOR month IN ('JAN')) ORDER BY empid)",
    )
  })

  it("keeps the top-level PIVOT statement", () => {
    const stmt = parseOne(
      "monthly_sales PIVOT (sum(amount) FOR month IN ('JAN')) ORDER BY empid",
    )
    expect(stmt.type).toBe("pivot")
  })
})

describe("autocomplete", () => {
  const tableSource = ["Identifier", "QuotedIdentifier", "LParen"]
  it.each([
    "CREATE TABLE y AS (",
    "COPY (",
    "CREATE MATERIALIZED VIEW v AS (",
    "CREATE MATERIALIZED VIEW v AS ",
    "ALTER VIEW v AS ",
    "ALTER VIEW v AS (",
    "CREATE VIEW v AS ",
  ])("offers SELECT and table sources after %s", (sql) => {
    const tokens = getNextValidTokens(sql)
    expect(tokens).toEqual(expect.arrayContaining(["Select", ...tableSource]))
  })

  it.each([
    "CREATE TABLE y AS (x ",
    "COPY (t ",
    "CREATE MATERIALIZED VIEW v AS (t ",
    "ALTER VIEW v AS (t ",
  ])("offers clauses after the table in %s", (sql) => {
    const tokens = getNextValidTokens(sql)
    expect(tokens).toEqual(
      expect.arrayContaining(["Where", "Union", "Order", "Limit", "RParen"]),
    )
  })

  it("offers clauses after an unparenthesised CREATE VIEW table", () => {
    expect(getNextValidTokens("CREATE VIEW v AS t ")).toEqual(
      expect.arrayContaining(["Where", "Union", "Owned"]),
    )
  })

  it("offers PIVOT after the table inside COPY (", () => {
    expect(getNextValidTokens("COPY (t ")).toContain("Pivot")
  })
})
