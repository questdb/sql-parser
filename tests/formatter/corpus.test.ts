import { describe, it } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { assertPreserved } from "./oracles"

const docsQueries: string[] = (
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "fixtures", "docs-queries.json"),
      "utf-8",
    ),
  ) as Array<{ query: string }>
).map((entry) => entry.query)

describe("docs corpus", () => {
  it.each(docsQueries.map((query, index) => [index, query] as const))(
    "#%i preserves tokens, adjacency, meaning, and is idempotent",
    (_index, query) => {
      assertPreserved(query)
    },
  )
})
