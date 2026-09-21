import { describe, expect, it } from "vitest"
import { StatementKind } from "../../src/formatter/context"
import { clausePhrases } from "../../src/formatter/phrases"
import { partsOf } from "./grammarClauses"

/**
 * The formatter's phrase table is hand-written, while QuestDB syntax arrives
 * through the parser. These tests read the grammar and fail when the two drift
 * apart, so adding a clause to the parser forces a layout decision here.
 */

type Kind = Exclude<StatementKind, "other">

/** Grammar rules that make up each statement kind the formatter lays out. */
/** Dispatch rules that carry the leading words of each statement. */
const HEAD_RULES = ["createStatement", "alterStatement"]

const STATEMENT_RULES: Record<Kind, string[]> = {
  select: [
    "selectStatement",
    "selectBody",
    "simpleSelect",
    "fromClause",
    "joinClause",
  ],
  insert: ["insertStatement"],
  update: ["updateStatement"],
  createTable: ["createTableBody"],
  createMaterializedView: ["createMaterializedViewBody"],
  createLiveView: ["createLiveViewBody"],
  alterTable: ["alterTableAction"],
  alterMaterializedView: ["alterMaterializedViewAction"],
}

/**
 * Sub-rules whose leading keywords are values or belong to a nested query,
 * not to a clause of the statement being laid out.
 */
const NON_CLAUSE_RULES = new Set([
  "booleanLiteral",
  "columnDefinition",
  "columnRef",
  "dataType",
  "expression",
  "fromClause",
  "fromSource",
  "identifier",
  "implicitSelectBody",
  "indexDefinition",
  "partitionPeriod",
  "pivotBody",
  "qualifiedName",
  "selectList",
  "selectStatement",
  "setClause",
  "stringOrIdentifier",
  "stringOrQualifiedName",
  "tableName",
  "tableNameOrString",
  "tableRef",
  "timeUnit",
])

/**
 * Keyword sequences the grammar can start a part with that the formatter keeps
 * on the current line on purpose. Every entry is a layout decision, not a gap.
 */
const INLINE_BY_DESIGN: Record<Kind, string[]> = {
  select: ["Distinct"],
  insert: ["Into", "Atomic", "Batch"],
  update: [],
  createTable: [
    "Table",
    "Atomic",
    "Batch",
    "If Not Exists",
    "As",
    "Timestamp",
    "Partition By",
    "Wal",
    "Bypass Wal",
    "Format",
    "Owned By",
  ],
  createMaterializedView: [
    "Materialized View",
    "If Not Exists",
    "As",
    "Timestamp",
    "Partition By",
    "Wal",
    "Bypass Wal",
    "Format",
    "Owned By",
    // REFRESH strategies stay on the REFRESH line.
    "Immediate",
    "Manual",
    "Every",
    "Period",
    "Incremental",
    "Deferred",
    "Start",
    "Limit",
    "Time Zone",
  ],
  createLiveView: [
    "Live View",
    "If Not Exists",
    "Flush Every",
    "In Memory",
    "Partition By",
    "Start From",
    "As",
    "Owned By",
    // The query after AS, with or without parentheses.
    "Select",
    "Declare",
    "With",
  ],
  alterTable: [],
  alterMaterializedView: [],
}

const words = (phrase: string) => phrase.split(" ")

/** True when one phrase is a leading run of the other, in either direction. */
const related = (a: string, b: string) => {
  const [short, long] = words(a).length <= words(b).length ? [a, b] : [b, a]
  return words(short).every((word, i) => word === words(long)[i])
}

const tablePhrases = (kind: Kind) =>
  clausePhrases[kind].map((phrase) => phrase.names.join(" "))

const grammarParts = (kind: Kind) =>
  STATEMENT_RULES[kind]
    .flatMap(partsOf)
    .filter((part) => !NON_CLAUSE_RULES.has(part.source))
    .flatMap((part) => part.phrases.map((phrase) => ({ phrase, part })))

const kinds = Object.keys(STATEMENT_RULES) as Kind[]

describe("phrase table follows the grammar", () => {
  it.each(kinds)(
    "%s: every clause the grammar can start is laid out or inline by design",
    (kind) => {
      // Given
      const known = [...tablePhrases(kind), ...INLINE_BY_DESIGN[kind]]

      // When
      const unhandled = grammarParts(kind)
        .filter(({ phrase }) => !known.some((entry) => related(entry, phrase)))
        .map(({ phrase, part }) => `${phrase} (${part.source})`)

      // Then
      expect(
        unhandled,
        "add a phrase to phrases.ts, or list it as inline by design",
      ).toEqual([])
    },
  )

  it("every phrase in the table still exists in the grammar", () => {
    // Given
    const grammar = [
      ...kinds.flatMap((kind) =>
        grammarParts(kind).map(({ phrase }) => phrase),
      ),
      ...HEAD_RULES.flatMap(partsOf).flatMap((part) => part.phrases),
    ]

    // When
    const dead = [...new Set(kinds.flatMap(tablePhrases))].filter(
      (phrase) => !grammar.some((entry) => related(entry, phrase)),
    )

    // Then
    expect(dead, "the grammar no longer starts a part with this").toEqual([])
  })
})
