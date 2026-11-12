/**
 * Enterprise CREATE [OR REPLACE] VIEW ... WITH AUDIT [OWNED BY x]
 * (either clause order).
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"

const parse = (sql: string, n = 1) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(n)
  return result.ast
}

describe("CREATE VIEW WITH AUDIT", () => {
  it("sets audit flag", () => {
    const [stmt] = parse("CREATE VIEW v AS (SELECT ts FROM t) WITH AUDIT")
    expect(stmt).toMatchObject({ type: "createView", audit: true })
    expect(toSql(stmt)).toBe("CREATE VIEW v AS (SELECT ts FROM t) WITH AUDIT")
  })

  it("unparenthesised body", () => {
    const [stmt] = parse("CREATE VIEW v AS SELECT ts FROM t WITH AUDIT")
    expect(stmt).toMatchObject({ audit: true })
  })

  it("WITH CTE after a view is still a separate statement", () => {
    parse("CREATE VIEW v AS (SELECT 1) WITH x AS (SELECT 1) SELECT * FROM x", 2)
  })

  it("audit stays an identifier", () => {
    parse("SELECT audit FROM audit")
  })

  it("autocomplete", () => {
    expect(
      getNextValidTokens("CREATE VIEW v AS (SELECT ts FROM t) WITH "),
    ).toContain("Audit")
    expect(
      getNextValidTokens("CREATE VIEW v AS (SELECT ts FROM t) WITH AUDIT "),
    ).toContain("Owned")
  })
})
