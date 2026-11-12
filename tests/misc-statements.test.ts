/**
 * DROP ALL [TABLES], UPDATE t AS alias, COPY TO with quoted
 * compression_codec / partition_by values, VACUUM PARTITIONS t.
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

describe("misc statements", () => {
  it("DROP ALL", () => {
    expect(toSql(ok("DROP ALL"))).toBe("DROP ALL TABLES")
    expect(toSql(ok("DROP ALL TABLES"))).toBe("DROP ALL TABLES")
  })

  it("UPDATE t AS alias", () => {
    expect(toSql(ok("UPDATE tblx AS xx SET tt = 1 WHERE x > 10"))).toBe(
      "UPDATE tblx xx SET tt = 1 WHERE x > 10",
    )
    expect(toSql(ok("UPDATE tblx xx SET tt = 1"))).toBe(
      "UPDATE tblx xx SET tt = 1",
    )
  })

  it("COPY TO quoted options", () => {
    ok("copy t to 'o' with format parquet compression_codec 'zstd'")
    ok("copy t to 'o' with format parquet partition_by 'DAY'")
    ok(
      "copy t to 'o' with format parquet compression_codec 'zstd' partition_by 'DAY' row_group_size 1000",
    )
  })

  it("VACUUM PARTITIONS", () => {
    expect(ok("VACUUM PARTITIONS t")).toMatchObject({ type: "vacuumTable" })
    expect(getNextValidTokens("VACUUM ")).toContain("Partitions")
  })
})
