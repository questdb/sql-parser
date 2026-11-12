/**
 * PostgreSQL session statements the server accepts as (no-op) statements:
 * BEGIN/COMMIT/ROLLBACK [TRANSACTION], DEALLOCATE name, SET ..., and
 * DISCARD/CLOSE/UNLISTEN/RESET <arg> (SqlCompilerImpl.registerKeywordBasedExecutors).
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"

const ok = (sql: string, n = 1) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(n)
  return result.ast
}

describe("PG session statements", () => {
  it("transaction statements", () => {
    expect(ok("BEGIN")[0]).toMatchObject({
      type: "transaction",
      action: "begin",
    })
    expect(ok("rollback transaction")[0]).toMatchObject({
      type: "transaction",
      action: "rollback",
      transaction: true,
    })
    expect(toSql(ok("commit"))).toBe("COMMIT")
  })

  it("SET forms", () => {
    expect(ok("SET datestyle TO ISO, MDY")[0]).toMatchObject({ type: "set" })
    expect(toSql(ok("SET search_path TO public"))).toBe(
      "SET search_path TO public",
    )
    ok("SET SESSION x = y")
    ok("SET LOCAL x = y")
    ok("SET extra_float_digits = 3")
    ok("SET x GARBAGE y")
    ok("SET x = -1; SELECT 1", 2)
    expect(ok("SET TYPE BYPASS WAL")[0]).toMatchObject({
      type: "setType",
      bypass: true,
    })
    expect(ok("set type wal")[0]).toMatchObject({ type: "setType" })
    expect(ok("SET type TO wal")[0]).toMatchObject({ type: "set" })
  })

  it("no-op statements", () => {
    expect(ok("UNLISTEN *")[0]).toMatchObject({
      type: "pgNoOp",
      keyword: "unlisten",
    })
    expect(toSql(ok("DISCARD TEMP"))).toBe("DISCARD TEMP")
    expect(toSql(ok("DEALLOCATE 'stmt1'"))).toBe("DEALLOCATE 'stmt1'")
  })

  it("words stay usable as identifiers", () => {
    for (const w of [
      "begin",
      "commit",
      "rollback",
      "deallocate",
      "discard",
      "close",
      "unlisten",
      "reset",
    ]) {
      const ast = ok(`SELECT ${w} FROM ${w} WHERE ${w} > 0`)
      expect(ast[0]).toMatchObject({ type: "select" })
    }
    expect(ok("SELECT close, reset AS begin FROM t")[0]).toMatchObject({
      type: "select",
    })
  })

  it("autocomplete", () => {
    const start = getNextValidTokens("")
    for (const t of ["Begin", "Commit", "Rollback", "Set"]) {
      expect(start).toContain(t)
    }
    expect(getNextValidTokens("BEGIN ")).toContain("Transaction")
  })
})
