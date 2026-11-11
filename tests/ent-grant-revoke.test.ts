/**
 * Enterprise GRANT / REVOKE: every permission name of Permission.java
 * namePermissionMap, WITH VERIFICATION / WITH GRANT OPTION in either order,
 * REVOKE ... WITH VERIFICATION, ASSUME SERVICE ACCOUNT grantee lists.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, createAutocompleteProvider } from "../src/index"
import { PERMISSION_NAMES } from "../src/autocomplete/content-assist"

const ok = (sql: string) => {
  const result = parseToAst(sql)
  expect(result.errors, sql).toEqual([])
  expect(result.ast, sql).toHaveLength(1)
  return result.ast[0]
}

// Permission.java namePermissionMap (80 names)
const SERVER_PERMISSIONS = [
  "ALL",
  "SELECT",
  "INSERT",
  "UPDATE",
  "CREATE TABLE",
  "DROP TABLE",
  "RENAME TABLE",
  "TRUNCATE TABLE",
  "ADD COLUMN",
  "DROP COLUMN",
  "RENAME COLUMN",
  "ALTER COLUMN TYPE",
  "ALTER COLUMN CACHE",
  "ALTER SYMBOL CAPACITY",
  "ADD INDEX",
  "DROP INDEX",
  "REINDEX",
  "ATTACH PARTITION",
  "DETACH PARTITION",
  "DROP PARTITION",
  "SET TABLE PARAM",
  "SET TABLE TYPE",
  "SET TABLE FORMAT",
  "RESUME WAL",
  "CREATE GROUP",
  "DROP GROUP",
  "CREATE USER",
  "DROP USER",
  "CREATE SERVICE ACCOUNT",
  "DROP SERVICE ACCOUNT",
  "ADD USER",
  "REMOVE USER",
  "CANCEL ANY COPY",
  "BACKUP TABLE",
  "BACKUP DATABASE",
  "SNAPSHOT",
  "VACUUM TABLE",
  "ENABLE USER",
  "DISABLE USER",
  "ADD PASSWORD",
  "REMOVE PASSWORD",
  "ADD EXTERNAL ALIAS",
  "REMOVE EXTERNAL ALIAS",
  "CREATE JWK",
  "DROP JWK",
  "CREATE REST TOKEN",
  "DROP REST TOKEN",
  "LIST USERS",
  "USER DETAILS",
  "DEDUP ENABLE",
  "DEDUP DISABLE",
  "HTTP",
  "PGWIRE",
  "ILP",
  "SQL ENGINE ADMIN",
  "SYSTEM ADMIN",
  "CREATE MATERIALIZED VIEW",
  "DROP MATERIALIZED VIEW",
  "REFRESH MATERIALIZED VIEW",
  "SETTINGS",
  "DATABASE ADMIN",
  "AUDIT VIEW",
  "CREATE VIEW",
  "DROP VIEW",
  "CREATE LIVE VIEW",
  "DROP LIVE VIEW",
  "COMPILE VIEW",
  "ALTER VIEW",
  "SET REFRESH LIMIT",
  "SET REFRESH TYPE",
  "CONVERT PARTITION TO PARQUET",
  "CONVERT PARTITION TO NATIVE",
  "SET PARQUET SETTINGS",
  "SET STORAGE POLICY",
  "REMOVE STORAGE POLICY",
  "ENABLE STORAGE POLICY",
  "DISABLE STORAGE POLICY",
  "SWITCH ROLE",
  "SET MEMORY LIMIT",
  "RESOURCE GROUP ADMIN",
]

describe("GRANT / REVOKE permissions", () => {
  it("parses every server permission name", () => {
    expect(SERVER_PERMISSIONS).toHaveLength(80)
    for (const p of SERVER_PERMISSIONS) {
      ok(`GRANT ${p} TO u`)
      ok(`REVOKE ${p} FROM u`)
      ok(`GRANT ${p}, SELECT ON t TO u WITH GRANT OPTION`)
      ok(`revoke select, ${p.toLowerCase()} on all tables from u`)
    }
  })

  it("autocomplete permission list matches the server", () => {
    expect([...PERMISSION_NAMES].sort()).toEqual([...SERVER_PERMISSIONS].sort())
  })

  it("WITH VERIFICATION / WITH GRANT OPTION in either order", () => {
    ok("GRANT SELECT ON t TO u WITH GRANT OPTION WITH VERIFICATION")
    ok("GRANT SELECT ON t TO u WITH VERIFICATION WITH GRANT OPTION")
    ok("GRANT SELECT ON t TO u WITH VERIFICATION")
    ok("REVOKE SELECT, INSERT FROM 'admin' WITH VERIFICATION")
  })

  it("ASSUME SERVICE ACCOUNT grantee lists", () => {
    ok("GRANT ASSUME SERVICE ACCOUNT sa TO a, b, c WITH GRANT OPTION")
    ok("REVOKE ASSUME SERVICE ACCOUNT sa FROM a, b")
  })

  it("autocomplete offers permission continuations", () => {
    const provider = createAutocompleteProvider({ tables: [], columns: {} })
    const labels = (sql: string) =>
      provider.getSuggestions(sql, sql.length).map((s) => s.label)
    expect(labels("GRANT ")).toEqual(
      expect.arrayContaining(["CANCEL", "RENAME", "SWITCH", "RESOURCE", "SQL"]),
    )
    expect(labels("GRANT SET ")).toEqual(
      expect.arrayContaining(["REFRESH", "MEMORY", "PARQUET", "STORAGE"]),
    )
    expect(labels("GRANT SET MEMORY ")).toContain("LIMIT")
    expect(labels("GRANT CANCEL ")).toContain("ANY")
    expect(labels("GRANT CANCEL ANY ")).toContain("COPY")
    expect(labels("REVOKE SELECT, RENAME ")).toEqual(
      expect.arrayContaining(["TABLE", "COLUMN"]),
    )
    expect(labels("GRANT SQL ENGINE ")).toContain("ADMIN")
    expect(labels("REVOKE SELECT FROM u WITH ")).toContain("VERIFICATION")
  })
})

// PR #42 review: the grammar allows LIMIT as a third permission word (SET
// REFRESH LIMIT / SET MEMORY LIMIT), so it was suggested after any two words.
describe("permission completion does not offer LIMIT where no permission continues with it", () => {
  const labels = (sql: string) =>
    createAutocompleteProvider({ tables: [], columns: {} })
      .getSuggestions(sql, sql.length)
      .map((s) => s.label)

  it.each(["GRANT CREATE TABLE ", "REVOKE CREATE TABLE ", "GRANT CANCEL ANY "])(
    "%s",
    (sql) => {
      expect(labels(sql)).not.toContain("LIMIT")
    },
  )

  it.each(["GRANT SET REFRESH ", "GRANT SET MEMORY ", "REVOKE SET MEMORY "])(
    "still offers LIMIT after %s",
    (sql) => {
      expect(labels(sql)).toContain("LIMIT")
    },
  )

  it("keeps the valid continuation after GRANT CANCEL ANY", () => {
    expect(labels("GRANT CANCEL ANY ")).toContain("COPY")
  })
})
