/**
 * Server SQL parity tests
 *
 * Every entry in tests/fixtures/server-queries.json is a query copied from the
 * QuestDB server test suites (questdb/questdb or questdb/questdb-enterprise),
 * with the source file and line it came from. The server accepts each of them,
 * so sql-parser must too. For every entry we check:
 *
 *   1. parse     — no errors, and exactly `statements` statements (default 1),
 *                  so a query that is silently split in two fails
 *   2. roundtrip — toSql(ast) equals the reviewed `toSql` string, re-parses
 *                  cleanly, and is a fixpoint (toSql of the re-parse is equal)
 *   3. autocomplete — token-by-token walkthrough: at each keyword / known
 *                  identifier, the provider suggests the word that comes next
 *   4. formatter — format() changes no tokens or meaning and is idempotent
 *                  (assertPreserved); optionally equals the reviewed `format`
 */

import { describe, it, expect } from "vitest"
import * as fs from "fs"
import * as path from "path"
import { parseToAst } from "../src/index"
import { toSql } from "../src/parser/toSql"
import { format } from "../src/formatter/index"
import {
  autocompleteWalkthrough,
  buildSchema,
  extractSchemaFromAst,
} from "./helpers/autocomplete-walkthrough"
import { assertPreserved } from "./formatter/oracles"

export interface ServerQuery {
  /** SQL exactly as written in the server test */
  query: string
  /** "<repo>:<path>:<line>" of the server test the query comes from */
  source: string
  /** Feature / report item the query belongs to */
  feature: string
  /** Expected number of statements (default 1) */
  statements?: number
  /** Reviewed expected toSql output */
  toSql: string
  /** Reviewed expected formatter output (optional) */
  format?: string
  /** Reason to skip the autocomplete walkthrough (optional) */
  skipAutocomplete?: string
}

const fixturePath = path.join(__dirname, "fixtures", "server-queries.json")
const entries: ServerQuery[] = JSON.parse(
  fs.readFileSync(fixturePath, "utf-8"),
) as ServerQuery[]

const label = (q: ServerQuery) =>
  `[${q.feature}] ${q.query.substring(0, 70).replace(/\n/g, " ")}`

const cases = entries.map((q) => [label(q), q] as const)

describe("server SQL parity", () => {
  it("fixture entries are well formed", () => {
    expect(entries.length).toBeGreaterThan(0)
    for (const q of entries) {
      expect(q.source).toMatch(/^questdb(-enterprise)?:.+:\d+$/)
      expect(q.feature).not.toBe("")
      expect(typeof q.toSql).toBe("string")
    }
  })

  describe("1. parses without errors, as the expected number of statements", () => {
    it.each(cases)("%s", (_label, q) => {
      const result = parseToAst(q.query)
      expect(result.errors.map((e) => e.message)).toEqual([])
      expect(result.ast).toHaveLength(q.statements ?? 1)
    })
  })

  describe("2. parse + toSql round trip", () => {
    it.each(cases)("%s", (_label, q) => {
      const sql = toSql(parseToAst(q.query).ast)
      expect(sql).toBe(q.toSql)
      const again = parseToAst(sql)
      expect(again.errors.map((e) => e.message)).toEqual([])
      expect(again.ast).toHaveLength(q.statements ?? 1)
      expect(toSql(again.ast)).toBe(sql)
    })
  })

  describe("3. autocomplete suggests each next token", () => {
    it.each(cases.filter(([, q]) => !q.skipAutocomplete))("%s", (_label, q) => {
      const schema = buildSchema(extractSchemaFromAst(parseToAst(q.query).ast))
      const result = autocompleteWalkthrough(q.query, schema)
      expect(result.success).toBe(true)
      const failures = result.failedSteps.map(
        (s) =>
          `offset ${s.position}: "${s.expectedLabel}" (${s.tokenType}) not in [${s.suggestions.join(", ")}]`,
      )
      expect(failures).toEqual([])
    })
  })

  describe("4. formatter preserves the query", () => {
    it.each(cases)("%s", (_label, q) => {
      assertPreserved(q.query)
      if (q.format !== undefined) expect(format(q.query)).toBe(q.format)
    })
  })
})
