/**
 * Function name lists (highlighting / autocomplete) checked against the
 * server FunctionFactory signatures (OSS + Enterprise).
 */

import { describe, it, expect } from "vitest"
import { createAutocompleteProvider, SuggestionKind } from "../src/index"
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
    ]) {
      expect(tableValuedFunctions).toContain(f)
    }
    expect(tableValuedFunctions).not.toContain("storage_policies")
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
  })
})
