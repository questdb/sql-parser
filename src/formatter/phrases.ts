import { StatementKind } from "./context"
import { StreamToken } from "./lexer"

export type PhraseRole = "clause" | "join" | "setOp" | "action"

export type Phrase = {
  names: string[]
  role: PhraseRole
}

export type PhraseMatch = {
  phrase: Phrase
  endIndex: number
}

const phrases =
  (role: PhraseRole) =>
  (...list: string[][]): Phrase[] =>
    list.map((names) => ({ names, role }))

const clause = phrases("clause")
const join = phrases("join")
const setOp = phrases("setOp")
const action = phrases("action")

const selectPhrases: Phrase[] = [
  ...clause(
    ["With"],
    ["Declare"],
    ["Select"],
    ["From"],
    ["Where"],
    ["Latest", "On"],
    ["Latest", "By"],
    ["Sample", "By"],
    ["Group", "By"],
    ["Subsample"],
    ["Order", "By"],
    ["Limit"],
    ["Window"],
    ["Pivot"],
  ),
  ...join(
    ["Join"],
    ["Inner", "Join"],
    ["Left", "Join"],
    ["Left", "Outer", "Join"],
    ["Right", "Join"],
    ["Right", "Outer", "Join"],
    ["Full", "Join"],
    ["Full", "Outer", "Join"],
    ["Cross", "Join"],
    ["Asof", "Join"],
    ["Lt", "Join"],
    ["Splice", "Join"],
    ["Window", "Join"],
    ["Prevailing", "Join"],
    ["Horizon", "Join"],
  ),
  ...setOp(["Union", "All"], ["Union"], ["Except"], ["Intersect"]),
]

const insertPhrases: Phrase[] = [
  ...clause(
    ["Insert", "Into"],
    ["Insert", "Atomic", "Into"],
    ["Insert"],
    ["Values"],
  ),
  ...selectPhrases,
]

const joinPhrases: Phrase[] = selectPhrases.filter(
  (phrase) => phrase.role === "join",
)

const updatePhrases: Phrase[] = [
  ...clause(["Update"], ["Set"], ["From"], ["Where"]),
  ...joinPhrases,
]

const createOptionPhrases: Phrase[] = clause(
  ["Dedup"],
  ["Ttl"],
  ["Expire", "Rows"],
  ["Storage", "Policy"],
  ["With"],
  ["In", "Volume"],
  ["Refresh"],
  ["Flush"],
)

const alterActionPhrases: Phrase[] = action(
  ["Add", "Column"],
  ["Drop", "Column"],
  ["Rename", "Column"],
  ["Alter", "Column"],
  ["Attach", "Partition"],
  ["Attach", "Partition", "List"],
  ["Detach", "Partition"],
  ["Detach", "Partition", "List"],
  ["Drop", "Partition"],
  ["Drop", "Partition", "List"],
  ["Set"],
  ["Squash"],
  ["Dedup"],
  ["Resume", "Wal"],
  ["Suspend", "Wal"],
  ["Rebase", "Wal"],
  ["Convert", "Partition"],
  ["Convert", "Partition", "List"],
  ["Drop", "Expire"],
  ["Drop", "Storage", "Policy"],
  ["Enable", "Storage", "Policy"],
  ["Disable", "Storage", "Policy"],
)

export const joinSubClauses: Phrase[] = clause(
  ["On"],
  ["Range"],
  ["List"],
  ["Tolerance"],
  ["Include", "Prevailing"],
  ["Exclude", "Prevailing"],
)

export const windowSubClauses: Phrase[] = clause(
  ["Partition", "By"],
  ["Order", "By"],
  ["Rows"],
  ["Range"],
  ["Groups"],
  ["Exclude"],
  ["Anchor"],
)

export const pivotSubClauses: Phrase[] = clause(["For"], ["Group", "By"])

export const clausePhrases: Record<StatementKind, Phrase[]> = {
  select: selectPhrases,
  insert: insertPhrases,
  update: updatePhrases,
  createTable: [...clause(["Create", "Table"]), ...createOptionPhrases],
  createMaterializedView: [
    ...clause(["Create", "Materialized", "View"]),
    ...createOptionPhrases,
  ],
  createLiveView: [
    ...clause(["Create", "Live", "View"]),
    ...createOptionPhrases,
  ],
  alterTable: [...clause(["Alter", "Table"]), ...alterActionPhrases],
  alterMaterializedView: [
    ...clause(["Alter", "Materialized", "View"]),
    ...alterActionPhrases,
  ],
  other: [],
}

const phraseKey = (phrase: Phrase) => phrase.names.join(" ")

const continuations: Record<string, ReadonlySet<string>> = {
  "Sample By": new Set(["From", "With"]),
}

export const continuesPhrase = (current: Phrase | null, next: Phrase) =>
  current !== null &&
  (continuations[phraseKey(current)]?.has(phraseKey(next)) ?? false)

const matchSingle = (
  tokens: StreamToken[],
  start: number,
  phrase: Phrase,
): PhraseMatch | null => {
  let index = start
  for (const name of phrase.names) {
    while (index < tokens.length && tokens[index].kind === "whitespace") index++
    if (index >= tokens.length || tokens[index].tokenName !== name) return null
    index++
  }
  return { phrase, endIndex: index }
}

export const matchPhrase = (
  tokens: StreamToken[],
  index: number,
  candidates: Phrase[],
): PhraseMatch | null => {
  let best: PhraseMatch | null = null
  for (const phrase of candidates) {
    const match = matchSingle(tokens, index, phrase)
    if (
      match &&
      (best === null || phrase.names.length > best.phrase.names.length)
    ) {
      best = match
    }
  }
  return best
}
