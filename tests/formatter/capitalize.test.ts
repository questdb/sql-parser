import { describe, expect, it } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { format } from "../../src/formatter/index"
import { parse, parseToAst, toSql } from "../../src/index"

const docsQueries: string[] = (
  JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "..", "fixtures", "docs-queries.json"),
      "utf-8",
    ),
  ) as Array<{ query: string }>
).map((entry) => entry.query)

const wide = { maxWidth: 80, capitalize: true } as const

describe("format with capitalize", () => {
  it.each([
    [
      "raises types and options but not column names",
      "create table tab (s symbol index type bitmap, timestamp timestamp) timestamp(timestamp) partition by day wal with maxUncommittedRows = 10",
      [
        "CREATE TABLE tab (",
        "  s SYMBOL INDEX TYPE BITMAP,",
        "  timestamp TIMESTAMP",
        ") TIMESTAMP(timestamp) PARTITION BY DAY WAL",
        "WITH maxUncommittedRows = 10",
      ].join("\n"),
    ],
    [
      "leaves columns alone where a keyword names one",
      "select symbol, avg(price) from trades where ts in today() latest on ts partition by symbol",
      [
        "SELECT symbol, avg(price)",
        "FROM trades",
        "WHERE ts IN today()",
        "LATEST ON ts PARTITION BY symbol",
      ].join("\n"),
    ],
    [
      "raises the modifiers of a SAMPLE BY",
      "select ts, avg(px) from trades sample by 1h align to calendar",
      [
        "SELECT ts, avg(px)",
        "FROM trades",
        "SAMPLE BY 1h ALIGN TO CALENDAR",
      ].join("\n"),
    ],
    [
      "raises statements the formatter has no layout for",
      "rename table trades_new to trades",
      "RENAME TABLE trades_new TO trades",
    ],
    [
      "raises a permission list",
      "grant select on all tables to dashboard",
      "GRANT SELECT ON ALL TABLES TO dashboard",
    ],
    [
      "leaves a quoted name alone",
      'select "select", status from t',
      ['SELECT "select", status', "FROM t"].join("\n"),
    ],
    [
      "leaves the case of SQL the parser cannot read",
      "select * from t where",
      ["select *", "from t", "where"].join("\n"),
    ],
  ])("%s", (_name, input, expected) => {
    expect(format(input, wide)).toBe(expected)
  })

  it("lays out exactly like format without it", () => {
    // Given
    const sql = "select a, b from t where x = 1 order by a"

    // When / Then
    expect(format(sql, wide).toLowerCase()).toBe(
      format(sql, { maxWidth: 80 }).toLowerCase(),
    )
  })
})

type CstNode = { name?: string; children?: Record<string, unknown[]> }
type CstToken = { image?: string; tokenType?: unknown }

/**
 * The words the grammar read as a table, view or column name. Written here
 * rather than imported so the check does not share code with what it checks.
 */
const namesIn = (sql: string): string[] => {
  const names: string[] = []
  const walk = (node: unknown, insideName: boolean) => {
    if (node === null || typeof node !== "object") return
    const token = node as CstToken
    if (token.image !== undefined && token.tokenType !== undefined) {
      if (insideName) names.push(token.image)
      return
    }
    const rule = node as CstNode
    const naming = insideName || rule.name === "identifier"
    for (const children of Object.values(rule.children ?? {})) {
      for (const child of children) walk(child, naming)
    }
  }
  walk(parse(sql).cst, false)
  return names
}

/**
 * The parser decides which words are syntax, so a mistake would rewrite a
 * table or column name. Names must come back exactly as written, and nothing
 * but case may change anywhere else.
 */
describe("docs corpus, capitalized", () => {
  const parseable = docsQueries.filter(
    (query) => parseToAst(query).errors.length === 0,
  )

  it.each(parseable.map((query, index) => [index, query] as const))(
    "#%i keeps every name and the meaning of the statement",
    (_index, query) => {
      // When
      const output = format(query, { capitalize: true })
      const reparsed = parseToAst(output)

      // Then
      expect(reparsed.errors).toEqual([])
      expect(namesIn(output)).toEqual(namesIn(query))
      expect(toSql(reparsed.ast).toLowerCase()).toBe(
        toSql(parseToAst(query).ast).toLowerCase(),
      )
      expect(format(output, { capitalize: true })).toBe(output)
    },
  )
})
