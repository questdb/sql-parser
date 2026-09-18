import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { format } from "../../src/formatter/index"

// Measured locally on 2026-09-17 (median of ten runs, three separate
// processes): 5,000-line script 18.7-19.1 ms, 50-level nesting 0.28-0.31 ms.
// Budgets are four times the measured medians, with a floor for timer noise.
const SCRIPT_BUDGET_MS = 80
const NESTED_BUDGET_MS = 5

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
  for (let run = 0; run < 10; run++) {
    const start = performance.now()
    format(sql)
    durations.push(performance.now() - start)
  }
  return durations.sort((a, b) => a - b)[5]
}

describe("formatter performance", () => {
  it("formats a 5,000-line script within budget", () => {
    expect(medianDuration(buildScript(5000))).toBeLessThan(SCRIPT_BUDGET_MS)
  })

  it("formats a 50-level nested query within budget", () => {
    expect(medianDuration(buildNested(50))).toBeLessThan(NESTED_BUDGET_MS)
  })
})
