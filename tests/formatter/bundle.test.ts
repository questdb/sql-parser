import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"

const bundlePath = path.join(
  __dirname,
  "..",
  "..",
  "dist",
  "formatter",
  "index.js",
)
const built = fs.existsSync(bundlePath)

describe("formatter bundle", () => {
  it.skipIf(!built)("does not include the parser", () => {
    const bundle = fs.readFileSync(bundlePath, "utf-8")
    expect(bundle).not.toContain("CstParser")
    expect(bundle).not.toContain("toSql")
    expect(bundle).not.toContain("performSelfAnalysis")
  })
})
