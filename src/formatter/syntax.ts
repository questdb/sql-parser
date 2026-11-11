import { parse } from "../parser/parser"
import { keywordTokenArray } from "../parser/tokens"

const keywordNames = new Set(keywordTokenArray.map((token) => token.name))

/**
 * Grammar rules whose words are names or values, never syntax: `identifier`
 * (any word becomes a name) and `passwordValue` (an unquoted password is
 * case-sensitive text on the server).
 */
const NAME_RULES: ReadonlySet<string> = new Set(["identifier", "passwordValue"])

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
  for (const children of Object.values(rule.children ?? {})) {
    for (const child of children) collect(child, namesSomething, offsets)
  }
}

/**
 * The offset of every keyword the grammar consumed as syntax. A keyword the
 * grammar took through its identifier rule names a table, view or column, and
 * is left out. SQL that does not parse has no syntax to report.
 */
export const syntaxOffsets = (sql: string): ReadonlySet<number> => {
  const { cst, lexErrors, parseErrors } = parse(sql)
  if (lexErrors.length > 0 || parseErrors.length > 0) return new Set()

  const offsets = new Set<number>()
  collect(cst, false, offsets)
  return offsets
}
