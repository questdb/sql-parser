import { PrintOptions } from "./doc"
import { formatStatement } from "./layout"
import { scan } from "./lexer"
import { splitStatements } from "./statements"
import { syntaxOffsets } from "./syntax"

export type FormatOptions = {
  indent?: string
  maxWidth?: number
  /**
   * Uppercase the words the parser reads as syntax, leaving the names of
   * tables, views and columns as written. Off by default, and a no-op for SQL
   * the parser cannot read.
   */
  capitalize?: boolean
}

const DEFAULT_OPTIONS: PrintOptions = { indent: "  ", maxWidth: 50 }

const NOTHING_TO_RAISE: ReadonlySet<number> = new Set()

const resolveOptions = (options: FormatOptions): PrintOptions => {
  const indent = options.indent ?? DEFAULT_OPTIONS.indent
  if (typeof indent !== "string" || !/^[ \t]*$/.test(indent)) {
    throw new TypeError("indent must be a string of spaces and tabs")
  }
  const maxWidth = options.maxWidth ?? DEFAULT_OPTIONS.maxWidth
  if (
    typeof maxWidth !== "number" ||
    !Number.isFinite(maxWidth) ||
    maxWidth <= 0
  ) {
    throw new TypeError("maxWidth must be a finite number greater than 0")
  }
  return { indent, maxWidth }
}

export const format = (sql: string, options: FormatOptions = {}): string => {
  const print = resolveOptions(options)
  const uppercase = options.capitalize ? syntaxOffsets(sql) : NOTHING_TO_RAISE
  return splitStatements(scan(sql))
    .map((statement) => formatStatement(statement, print, uppercase))
    .join("\n\n")
}
