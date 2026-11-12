/**
 * Function name lists (highlighting / autocomplete) checked against the
 * server FunctionFactory signatures (OSS + Enterprise).
 */

import { describe, it, expect } from "vitest"
import {
  createAutocompleteProvider,
  parseToAst,
  SuggestionKind,
} from "../src/index"
import { scalarFunctions, tableValuedFunctions } from "../src/grammar/functions"

const provider = createAutocompleteProvider({ tables: [], columns: {} })
const functionsAt = (sql: string) =>
  provider
    .getSuggestions(sql, sql.length)
    .filter((s) => s.kind === SuggestionKind.Function)
    .map((s) => s.label)

describe("function lists", () => {
  it("table-valued functions", () => {
    for (const f of [
      "checkpoint_status",
      "export_activity",
      "pg_enum",
      "pg_catalog.pg_extension",
      "information_schema.tables",
      "information_schema.columns",
      "information_schema.key_column_usage",
      "information_schema.table_constraints",
      "information_schema.referential_constraints",
      "information_schema.character_sets",
      "information_schema.questdb_columns",
      "backup_status",
      "table_cold_partitions",
      "tick_calendars",
      "files",
      "glob",
      "storage_policies",
    ]) {
      expect(tableValuedFunctions).toContain(f)
    }
  })

  it("scalar functions", () => {
    for (const f of [
      "build",
      "current_data_id",
      "from_base64",
      "interval",
      "cancel_query",
      "timestamp_floor_utc",
      "backup_instance_name",
      "node_role",
      "reload_tick_calendars",
      "glob",
    ]) {
      expect(scalarFunctions).toContain(f)
    }
    expect(scalarFunctions).not.toContain("files")
  })

  it("autocomplete", () => {
    expect(functionsAt("SELECT * FROM checkp")).toContain("checkpoint_status")
    expect(functionsAt("SELECT from_b")).toContain("from_base64")
    expect(functionsAt("SELECT fil")).not.toContain("files")
    expect(functionsAt("SELECT * FROM storage_p")).toContain("storage_policies")
  })

  it.each([
    "SELECT",
    "SEL",
    "SELECT * FROM se",
    "SELECT * FROM lect",
    "SELECT * FROM p",
    "SELECT * FROM schema",
  ])("omits fuzzy information_schema matches after %s", (sql) => {
    expect(
      functionsAt(sql).filter((name) => name.startsWith("information_schema.")),
    ).toEqual([])
  })

  it.each([
    ["SELECT * FROM info", "information_schema.tables"],
    ["SELECT * FROM INFORMATION_SCH", "information_schema.columns"],
    ["SELECT * FROM tab", "information_schema.table_constraints"],
    ["SELECT * FROM tables", "information_schema.tables"],
    ["SELECT * FROM constraints", "information_schema.table_constraints"],
    ["SELECT * FROM constraints", "information_schema.referential_constraints"],
    ["SELECT * FROM INFORMATION_SCHEMA.tab", "information_schema.tables"],
    [
      "SELECT * FROM trades JOIN information_schema.col",
      "information_schema.columns",
    ],
  ])("offers matching information_schema functions after %s", (sql, name) => {
    expect(functionsAt(sql)).toContain(name)
  })

  it("still parses information_schema function calls", () => {
    const result = parseToAst("SELECT * FROM information_schema.tables()")
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
  })

  it.each([
    "SELECT * FROM pg_catalog.",
    "SELECT * FROM PG_CATALOG.",
    "SELECT * FROM trades JOIN pg_catalog.",
    "SELECT * FROM pg_catalog.pg_c",
  ])("completes catalog table functions after %s", (sql) => {
    const suggestions = provider.getSuggestions(sql, sql.length)
    expect(suggestions.map((s) => s.label)).toContain("pg_catalog.pg_class")
    expect(suggestions.every((s) => s.kind === SuggestionKind.Function)).toBe(
      true,
    )
    expect(suggestions.every((s) => s.label.startsWith("pg_catalog."))).toBe(
      true,
    )
  })

  it("completes catalog scalar functions in expressions", () => {
    expect(functionsAt("SELECT pg_catalog.")).toContain("pg_catalog.version")
    expect(functionsAt("SELECT pg_catalog.")).not.toContain(
      "pg_catalog.pg_class",
    )
  })

  it("completes explicitly qualified information_schema functions", () => {
    expect(functionsAt("SELECT * FROM information_schema.")).toContain(
      "information_schema.tables",
    )
  })

  it("keeps columns when a table alias has a catalog namespace's name", () => {
    const p = createAutocompleteProvider({
      tables: [{ name: "trades" }],
      columns: { trades: [{ name: "price", type: "DOUBLE" }] },
    })
    const query = "SELECT pg_catalog. FROM trades pg_catalog"
    const suggestions = p.getSuggestions(query, "SELECT pg_catalog.".length)
    expect(suggestions.map((s) => s.label)).toContain("price")
    expect(suggestions.some((s) => s.kind === SuggestionKind.Function)).toBe(
      false,
    )
  })

  it.each([
    "SELECT * FROM storage_policies()",
    "SELECT * FROM storage_policies",
  ])("parses %s", (sql) => {
    const result = parseToAst(sql)
    expect(result.errors).toEqual([])
    expect(result.ast).toHaveLength(1)
  })
})
