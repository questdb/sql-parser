/**
 * Suggestions that the server would reject in their position (PR #42 audit).
 *  - REGCLASS / REGPROCEDURE / bare ARRAY are cast-only types: the server can
 *    not persist them as column types (SqlUtil.toPersistedType).
 *  - UNLIMITED is only a memory_limit value
 *    (EntSqlCompilerImpl resource group options).
 */
import { describe, it, expect } from "vitest"
import { createAutocompleteProvider } from "../src/index"

const provider = createAutocompleteProvider({
  tables: [{ name: "trades" }],
  columns: { trades: [{ name: "price", type: "DOUBLE" }] },
})
const labels = (sql: string) =>
  provider.getSuggestions(sql, sql.length).map((s) => s.label)

describe("column type positions offer only persistable types", () => {
  it.each([
    "CREATE TABLE t (a ",
    "ALTER TABLE trades ALTER COLUMN price TYPE ",
    "ALTER TABLE trades ADD COLUMN b ",
  ])("%s", (sql) => {
    const l = labels(sql)
    expect(l).not.toContain("REGCLASS")
    expect(l).not.toContain("REGPROCEDURE")
    expect(l).not.toContain("ARRAY")
    expect(l).toContain("DOUBLE")
    expect(l).toContain("BIGINT")
  })

  it.each(["SELECT price::", "SELECT CAST(price AS "])(
    "casts still offer them: %s",
    (sql) => {
      expect(labels(sql)).toContain("REGCLASS")
    },
  )
})

describe("UNLIMITED only for memory limits", () => {
  it.each([
    "CREATE RESOURCE GROUP g WITH (cpu_weight = ",
    "ALTER RESOURCE GROUP g SET (max_active_queries = ",
    "ALTER RESOURCE GROUP g SET (max_queued_queries = ",
    "ALTER RESOURCE GROUP g SET (queue_timeout = ",
    "CREATE RESOURCE GROUP g WITH (memory_limit = '8M', cpu_weight = ",
  ])("not after %s", (sql) => {
    expect(labels(sql)).not.toContain("UNLIMITED")
  })

  it.each([
    "CREATE RESOURCE GROUP g WITH (memory_limit = ",
    "ALTER RESOURCE GROUP g SET (cpu_weight = 1, memory_limit = ",
    "ALTER USER u SET MEMORY LIMIT ",
  ])("still after %s", (sql) => {
    expect(labels(sql)).toContain("UNLIMITED")
  })
})
