import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { format } from "../../src/formatter/index"

/**
 * A wall-clock budget does not survive a shared CI runner, where this file
 * runs beside suites that saturate the machine. These tests check the shape
 * of the cost instead: work must grow with the input, not with its square. A
 * quadratic regression fails here, a slow machine does not.
 *
 * Measured on 2026-09-18: ten times the script costs 7.5 to 9.4 times the
 * work, and four times the nesting costs 2.4 times the work.
 */
const GROWTH_LIMIT = 25
const DEPTH_LIMIT = 12
/** Only catches a hang; a loaded runner is an order of magnitude under this. */
const HANG_LIMIT_MS = 5000

const docsQueries: string[] = (
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "fixtures", "docs-queries.json"),
      "utf-8",
    ),
  ) as Array<{ query: string }>
).map((entry) => entry.query)

const buildScript = (lines: number) => {
  let script = ""
  let index = 0
  while (script.split("\n").length < lines) {
    script += docsQueries[index++ % docsQueries.length] + ";\n"
  }
  return script
}

const buildNested = (depth: number) => {
  let inner = "t"
  for (let level = 0; level < depth; level++) {
    inner = `(SELECT * FROM ${inner} WHERE x = ${level})`
  }
  return `SELECT * FROM ${inner}`
}

const medianDuration = (sql: string) => {
  format(sql)
  const durations: number[] = []
  for (let run = 0; run < 9; run++) {
    const start = performance.now()
    format(sql)
    durations.push(performance.now() - start)
  }
  return durations.sort((a, b) => a - b)[4]
}

describe("formatter performance", () => {
  it("costs grow with the size of a script, not with its square", () => {
    // Given
    const small = medianDuration(buildScript(500))
    const large = medianDuration(buildScript(5000))

    // Then
    expect(large / small).toBeLessThan(GROWTH_LIMIT)
    expect(large).toBeLessThan(HANG_LIMIT_MS)
  })

  it("costs grow with nesting depth, not with its square", () => {
    // Given
    const shallow = medianDuration(buildNested(50))
    const deep = medianDuration(buildNested(200))

    // Then
    expect(deep / shallow).toBeLessThan(DEPTH_LIMIT)
    expect(deep).toBeLessThan(HANG_LIMIT_MS)
  })
})
