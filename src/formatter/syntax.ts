import { parse } from "../parser/parser"
import { tokenize } from "../parser/lexer"
import { keywordTokenArray } from "../parser/tokens"

const keywordNames = new Set(keywordTokenArray.map((token) => token.name))

/**
 * Grammar rules whose words are names or values, never syntax: `identifier`
 * (any word becomes a name) and `passwordValue` (an unquoted password is
 * case-sensitive text on the server).
 */
const NAME_RULES: ReadonlySet<string> = new Set(["identifier", "passwordValue"])

/** CST label of keywords consumed as names (columnDefinition: IS / ILIKE / DECLARE). */
const NAME_LABEL = "keywordName"

type CstNode = { name?: string; children?: Record<string, unknown[]> }
type CstToken = { startOffset?: number; tokenType?: { name: string } }

const collect = (
  node: unknown,
  insideName: boolean,
  offsets: Set<number>,
): void => {
  if (node === null || typeof node !== "object") return

  const token = node as CstToken
  if (token.startOffset !== undefined && token.tokenType !== undefined) {
    if (!insideName && keywordNames.has(token.tokenType.name)) {
      offsets.add(token.startOffset)
    }
    return
  }

  const rule = node as CstNode
  const namesSomething =
    insideName || (rule.name !== undefined && NAME_RULES.has(rule.name))
  for (const [label, children] of Object.entries(rule.children ?? {})) {
    // `keywordName`: a keyword used as a column name (IS / ILIKE / DECLARE)
    const isName = namesSomething || label === NAME_LABEL
    for (const child of children) collect(child, isName, offsets)
  }
}

/** Syntax offsets of `sql`, shifted by `base`; undefined if it does not parse. */
const offsetsOf = (sql: string, base: number): Set<number> | undefined => {
  const { cst, lexErrors, parseErrors } = parse(sql)
  if (lexErrors.length > 0 || parseErrors.length > 0) return undefined
  const local = new Set<number>()
  collect(cst, false, local)
  if (base === 0) return local
  const shifted = new Set<number>()
  for (const offset of local) shifted.add(offset + base)
  return shifted
}

/**
 * The offset of every keyword the grammar consumed as syntax. A keyword the
 * grammar took through its identifier rule names a table, view or column, and
 * is left out. SQL that does not parse has no syntax to report.
 *
 * When the whole input does not parse, each `;`-separated statement is tried
 * on its own, so one unsupported statement does not leave the rest of the
 * script uncapitalized. Semicolons come from the lexer, so the ones inside
 * strings, quoted names and comments do not split.
 */
export const syntaxOffsets = (sql: string): ReadonlySet<number> => {
  const whole = offsetsOf(sql, 0)
  if (whole) return whole

  const offsets = new Set<number>()
  let start = 0
  const segments: [number, number][] = []
  for (const token of tokenize(sql).tokens) {
    if (token.tokenType.name !== "Semicolon") continue
    segments.push([start, token.startOffset])
    start = token.startOffset + 1
  }
  if (segments.length === 0) return offsets
  segments.push([start, sql.length])
  for (const [from, to] of segments) {
    const part = offsetsOf(sql.slice(from, to), from)
    if (part) for (const offset of part) offsets.add(offset)
  }
  return offsets
}
