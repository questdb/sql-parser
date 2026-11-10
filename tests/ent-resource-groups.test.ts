/**
 * Enterprise resource groups: CREATE / ALTER / DROP RESOURCE GROUP and
 * ALTER USER | SERVICE ACCOUNT | GROUP ... SET | UNSET RESOURCE GROUP.
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

describe("resource groups", () => {
  it("CREATE / DROP", () => {
    expect(ok("CREATE RESOURCE GROUP batch")).toMatchObject({
      type: "createResourceGroup",
    })
    ok("CREATE RESOURCE GROUP memory_guard WITH (memory_limit = 1_024K)")
    ok("CREATE RESOURCE GROUP g WITH (memory_limit = UNLIMITED)")
    ok("CREATE RESOURCE GROUP g WITH (memory_limit = 64M)")
    ok("CREATE RESOURCE GROUP g WITH ()")
    ok("CREATE RESOURCE GROUP g WITH (queue_timeout = 30000)")
    expect(toSql(ok("drop resource group reporting"))).toBe(
      "DROP RESOURCE GROUP reporting",
    )
  })

  it("ALTER USER SET / UNSET", () => {
    expect(ok("ALTER USER alice SET RESOURCE GROUP DEFAULT")).toMatchObject({
      type: "alterUser",
      action: { actionType: "setResourceGroup" },
    })
    expect(toSql(ok("ALTER USER john UNSET RESOURCE GROUP"))).toBe(
      "ALTER USER john UNSET RESOURCE GROUP",
    )
    expect(toSql(ok("ALTER GROUP acl_high UNSET RESOURCE GROUP"))).toBe(
      "ALTER GROUP acl_high UNSET RESOURCE GROUP",
    )
    // existing forms unchanged
    ok("ALTER USER u SET MEMORY LIMIT 1G")
  })

  it("resource words stay identifiers", () => {
    ok("SELECT resource, unset, memory_limit, cpu_weight FROM t")
    ok("CREATE TABLE resource (mapping INT, priority INT)")
  })

  it("autocomplete", () => {
    expect(getNextValidTokens("CREATE ")).toContain("Resource")
    expect(getNextValidTokens("ALTER ")).toContain("Resource")
    expect(getNextValidTokens("DROP ")).toContain("Resource")
    expect(getNextValidTokens("ALTER RESOURCE GROUP g ")).toEqual(
      expect.arrayContaining(["Set", "Reset", "Rename"]),
    )
    expect(getNextValidTokens("CREATE RESOURCE GROUP g WITH (")).toEqual(
      expect.arrayContaining([
        "MemoryLimit",
        "CpuWeight",
        "MaxActiveQueries",
        "MaxQueuedQueries",
        "QueueTimeout",
      ]),
    )
    expect(getNextValidTokens("ALTER USER u ")).toEqual(
      expect.arrayContaining(["Set", "Unset"]),
    )
    expect(getNextValidTokens("ALTER USER u SET ")).toEqual(
      expect.arrayContaining(["Memory", "Resource"]),
    )
  })
})
