import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"

const distFormatter = path.join(__dirname, "..", "..", "dist", "formatter")
const bundlePath = path.join(distFormatter, "index.js")

const built = fs.existsSync(bundlePath)

describe("formatter bundle", () => {
  it.skipIf(!built)("carries the parser but not the AST layer", () => {
    const bundle = fs.readFileSync(bundlePath, "utf-8")
    // The capitalize option needs the grammar to tell syntax from names.
    expect(bundle).toContain("performSelfAnalysis")
    // Nothing needs the CST-to-AST visitor or its serializer.
    expect(bundle).not.toContain("toSql")
  })
})
