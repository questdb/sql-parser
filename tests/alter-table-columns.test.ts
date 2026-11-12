/**
 * ALTER TABLE: ALTER COLUMN .. TYPE SYMBOL .. INDEX, ADD without COLUMN,
 * RENAME COLUMN lists, per-column IF NOT EXISTS
 * (SqlCompilerImpl.alterTableAddColumn / addColumnWithType / alterTableRenameColumn).
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"

const ok = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}
const rt = (sql: string, expected: string) => {
  expect(toSql(ok(sql))).toBe(expected)
  expect(toSql(ok(expected))).toBe(expected)
}

describe("alter table columns", () => {
  it("TYPE SYMBOL .. INDEX", () => {
    rt(
      "ALTER TABLE t ALTER COLUMN s TYPE SYMBOL CAPACITY 256 NOCACHE INDEX TYPE BITMAP CAPACITY 512",
      "ALTER TABLE t ALTER COLUMN s TYPE SYMBOL CAPACITY 256 NOCACHE INDEX TYPE BITMAP CAPACITY 512",
    )
    rt(
      "ALTER TABLE t ALTER COLUMN s TYPE SYMBOL CACHE INDEX",
      "ALTER TABLE t ALTER COLUMN s TYPE SYMBOL CACHE INDEX",
    )
  })

  it("ADD without COLUMN, IF NOT EXISTS per column", () => {
    rt(
      "ALTER TABLE t ADD x INT, y DOUBLE",
      "ALTER TABLE t ADD COLUMN x INT, y DOUBLE",
    )
    rt(
      "ALTER TABLE t ADD IF NOT EXISTS x INT",
      "ALTER TABLE t ADD COLUMN IF NOT EXISTS x INT",
    )
    rt(
      "ALTER TABLE t ADD COLUMN x INT, IF NOT EXISTS y INT",
      "ALTER TABLE t ADD COLUMN x INT, IF NOT EXISTS y INT",
    )
  })

  it("RENAME COLUMN list", () => {
    expect(ok("ALTER TABLE t RENAME COLUMN a TO b, c TO d")).toMatchObject({
      action: {
        oldName: "a",
        newName: "b",
        additionalRenames: [{ oldName: "c", newName: "d" }],
      },
    })
  })

  it("autocomplete", () => {
    expect(getNextValidTokens("ALTER TABLE t ADD ")).toEqual(
      expect.arrayContaining(["Column", "If"]),
    )
    expect(
      getNextValidTokens("ALTER TABLE t ALTER COLUMN s TYPE SYMBOL "),
    ).toContain("Index")
  })
})
