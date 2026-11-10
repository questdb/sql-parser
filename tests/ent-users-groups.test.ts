/**
 * Enterprise users/groups: ADD COLUMN ... OWNED BY, quoted SET MEMORY LIMIT,
 * unquoted external aliases and passwords, REST token REFRESH/TRANSIENT order.
 */

import { describe, it, expect } from "vitest"
import { parseToAst } from "../src/index"
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
