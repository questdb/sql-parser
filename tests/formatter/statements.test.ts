import { describe, expect, it } from "vitest"
import { reconstruct, scan } from "../../src/formatter/lexer"
import { splitStatements } from "../../src/formatter/statements"
import { detectStatementKind } from "../../src/formatter/context"

const split = (sql: string) => splitStatements(scan(sql))

const texts = (sql: string) => split(sql).map((s) => reconstruct(s.tokens))

const verbatimText = (sql: string) => {
  const [statement] = split(sql)
  return statement.verbatimFrom === null
    ? null
    : reconstruct(statement.tokens.slice(statement.verbatimFrom))
}

describe("splitStatements", () => {
  it("splits at semicolons outside delimiters and strings", () => {
    // Given
    const sql = "SELECT (a; b) FROM t; SELECT ';' FROM u; SELECT c"

    // When / Then
    expect(texts(sql)).toEqual([
      "SELECT (a; b) FROM t;",
      " SELECT ';' FROM u;",
      " SELECT c",
    ])
  })

  it("drops trailing whitespace after the last semicolon", () => {
    // When / Then
    expect(texts("SELECT a;\n\n")).toEqual(["SELECT a;"])
  })

  it("keeps a trailing comment as its own statement", () => {
    // When / Then
    expect(texts("SELECT a; -- done")).toEqual(["SELECT a;", " -- done"])
  })

  it("marks no verbatim region for balanced input", () => {
    // When / Then
    expect(split("SELECT (a) FROM t")[0].verbatimFrom).toBeNull()
  })

  it("preserves from an opener that never closes, including later semicolons", () => {
    // Given
    const sql = "SELECT (a; SELECT b;"

    // When
    const statements = split(sql)

    // Then
    expect(statements).toHaveLength(1)
    expect(verbatimText(sql)).toBe("(a; SELECT b;")
  })

  it("preserves from the outermost open delimiter on a mismatch", () => {
    // Given
    const sql = "SELECT f([)] FROM t; SELECT b"

    // When
    const statements = split(sql)

    // Then
    expect(statements).toHaveLength(1)
    expect(verbatimText(sql)).toBe("([)] FROM t; SELECT b")
  })

  it("preserves from the outermost unclosed opener with several open", () => {
    // When / Then
    expect(verbatimText("SELECT (a, (b FROM t")).toBe("(a, (b FROM t")
  })

  it("treats a stray closer as an ordinary token", () => {
    // Given
    const sql = "SELECT a) FROM t; SELECT b"

    // When
    const statements = split(sql)

    // Then
    expect(statements).toHaveLength(2)
    expect(statements[0].verbatimFrom).toBeNull()
  })

  it("preserves from a tolerant token and swallows later statements", () => {
    // Given
    const sql = "SELECT a FROM t WHERE x = 'oops; SELECT b;"

    // When
    const statements = split(sql)

    // Then
    expect(statements).toHaveLength(1)
    expect(verbatimText(sql)).toBe("'oops; SELECT b;")
  })

  it("reconstructs the input from all statements", () => {
    // Given
    const sql = "SELECT a; /* c */ SELECT (b; SELECT 'x"

    // When / Then
    expect(texts(sql).join("")).toBe(sql)
  })
})

describe("detectStatementKind", () => {
  it.each([
    ["SELECT a FROM t", "select"],
    ["select a from t", "select"],
    ["trades WHERE x = 1", "select"],
    ['"my table" WHERE x = 1', "select"],
    ["WITH c AS (SELECT 1) SELECT * FROM c", "select"],
    ["DECLARE @x := 1 SELECT @x", "select"],
    ["(SELECT a FROM t) UNION (SELECT b FROM u)", "select"],
    ["INSERT INTO t VALUES (1)", "insert"],
    ["UPDATE t SET a = 1", "update"],
    ["CREATE TABLE t (a INT)", "createTable"],
    ["CREATE MATERIALIZED VIEW mv AS SELECT 1", "createMaterializedView"],
    ["CREATE LIVE VIEW lv AS SELECT 1", "createLiveView"],
    ["ALTER TABLE t ADD COLUMN a INT", "alterTable"],
    ["ALTER MATERIALIZED VIEW mv SET TTL 1d", "alterMaterializedView"],
    ["  -- c\n  SELECT 1", "select"],
    ["EXPLAIN SELECT 1", "select"],
    ["EXPLAIN INSERT INTO t VALUES (1)", "insert"],
    ["DROP TABLE t", "other"],
    ["CREATE USER u", "other"],
    ["", "other"],
  ])("detects %s as %s", (sql, kind) => {
    expect(detectStatementKind(scan(sql))).toBe(kind)
  })
})
