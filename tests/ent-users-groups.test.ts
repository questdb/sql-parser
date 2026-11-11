/**
 * Enterprise users/groups: ADD COLUMN ... OWNED BY, quoted SET MEMORY LIMIT,
 * unquoted external aliases and passwords, REST token REFRESH/TRANSIENT order.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, createAutocompleteProvider } from "../src/index"
import { toSql } from "../src/parser/toSql"

const ok = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors, sql).toEqual([])
  expect(result.ast, sql).toHaveLength(1)
  return result.ast[0]
}

describe("enterprise users / groups", () => {
  it("ADD COLUMN ... OWNED BY", () => {
    expect(
      ok("ALTER TABLE t ADD COLUMN a INT, b DOUBLE OWNED BY 'g1'"),
    ).toMatchObject({ action: { actionType: "addColumn", ownedBy: "g1" } })
  })

  it("quoted memory limits", () => {
    ok("ALTER USER u SET MEMORY LIMIT 'UNLIMITED'")
    ok("ALTER SERVICE ACCOUNT sa SET MEMORY LIMIT '2G'")
    ok("ALTER USER u SET MEMORY LIMIT 512M")
  })

  it("unquoted external alias", () => {
    expect(ok("ALTER GROUP g WITH EXTERNAL ALIAS ext_g")).toMatchObject({
      action: "setAlias",
      externalAlias: "ext_g",
    })
    expect(ok("CREATE GROUP g WITH EXTERNAL ALIAS 'x'")).toMatchObject({
      externalAlias: "x",
    })
  })

  it("unquoted passwords", () => {
    expect(ok("ALTER SERVICE ACCOUNT sa WITH PASSWORD pw")).toMatchObject({
      action: { actionType: "password", password: "pw" },
    })
    ok("ALTER USER u WITH PASSWORD 'x'")
    ok("ALTER USER u WITH NO PASSWORD")
  })

  it("REST token REFRESH / TRANSIENT in any order", () => {
    const stmt = ok(
      "ALTER USER u CREATE TOKEN TYPE REST WITH TTL '42m' TRANSIENT REFRESH",
    )
    expect(stmt).toMatchObject({
      action: { actionType: "createToken", refresh: true, transient: true },
    })
    expect(toSql(stmt)).toBe(
      "ALTER USER u CREATE TOKEN TYPE REST WITH TTL '42m' REFRESH TRANSIENT",
    )
    ok("ALTER USER u CREATE TOKEN TYPE REST WITH TTL '42m' REFRESH TRANSIENT")
    ok("ALTER USER u CREATE TOKEN TYPE REST WITH TTL '42m' REFRESH")
    ok("ALTER USER u CREATE TOKEN TYPE REST")
  })
})

// PR #42 audit: the server takes the whole unquoted token as the password
// (EntSqlCompilerImpl.parsePassword), so glued forms must not split.
describe("unquoted password values are one value", () => {
  it.each([
    ["CREATE USER u WITH PASSWORD 1G", "1G"],
    ["CREATE USER u WITH PASSWORD 1h", "1h"],
    ["ALTER USER u WITH PASSWORD true", "true"],
    ["ALTER USER u WITH PASSWORD false", "false"],
    ["ALTER USER u WITH PASSWORD abc1", "abc1"],
    ["ALTER USER u WITH PASSWORD 12ab", "12ab"],
    ["CREATE USER u WITH PASSWORD 'it''s'", "it's"],
  ])("%s", (sql, password) => {
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
    expect(JSON.stringify(result.ast[0])).toContain(
      `"password":${JSON.stringify(password)}`,
    )
  })

  it("does not swallow a following clause", () => {
    const result = parseToAst(
      "CREATE SERVICE ACCOUNT sa WITH PASSWORD 1G OWNED BY g",
    )
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
  })
})

describe("password slot suggestions", () => {
  it.each(["CREATE USER u WITH PASSWORD ", "ALTER USER u WITH PASSWORD "])(
    "offers no NULL / TRUE / FALSE after %s",
    (sql) => {
      const labels = createAutocompleteProvider({ tables: [], columns: {} })
        .getSuggestions(sql, sql.length)
        .map((s) => s.label)
      expect(labels).not.toContain("NULL")
      expect(labels).not.toContain("TRUE")
      expect(labels).not.toContain("FALSE")
    },
  )
})

// PR #42 follow-up review: never glue across a quoted token; any word works.
describe("password value boundaries", () => {
  it.each([
    ["CREATE SERVICE ACCOUNT sa WITH PASSWORD 'pw'OWNED BY g", "pw"],
    ['CREATE SERVICE ACCOUNT sa WITH PASSWORD "pw"OWNED BY g', "pw"],
  ])("%s", (sql, password) => {
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
    const json = JSON.stringify(result.ast[0])
    expect(json).toContain(`"password":${JSON.stringify(password)}`)
    expect(json).toContain('"g"')
  })

  it.each([
    ["CREATE USER u WITH PASSWORD select", "select"],
    ["CREATE USER u WITH PASSWORD 1hour", "1hour"],
    ["CREATE USER u WITH PASSWORD 12true", "12true"],
    ["ALTER USER u WITH PASSWORD from", "from"],
    ["CREATE USER u WITH PASSWORD 1G", "1G"],
  ])("any word as a password: %s", (sql, password) => {
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
    expect(JSON.stringify(result.ast[0])).toContain(
      `"password":${JSON.stringify(password)}`,
    )
  })
})
