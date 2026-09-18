import { PrintOptions } from "./doc"
import { formatStatement } from "./layout"
import { scan } from "./lexer"
import { splitStatements } from "./statements"

export type FormatOptions = {
  indent?: string
  maxLineWidth?: number
}

const DEFAULT_OPTIONS: PrintOptions = { indent: "  ", maxLineWidth: 50 }

const resolveOptions = (options: FormatOptions): PrintOptions => {
  const indent = options.indent ?? DEFAULT_OPTIONS.indent
  if (typeof indent !== "string" || !/^[ \t]*$/.test(indent)) {
    throw new TypeError("indent must be a string of spaces and tabs")
  }
  const maxLineWidth = options.maxLineWidth ?? DEFAULT_OPTIONS.maxLineWidth
  if (
    typeof maxLineWidth !== "number" ||
    !Number.isFinite(maxLineWidth) ||
    maxLineWidth <= 0
  ) {
    throw new TypeError("maxLineWidth must be a finite number greater than 0")
  }
  return { indent, maxLineWidth }
}

export const format = (sql: string, options: FormatOptions = {}): string => {
  const resolved = resolveOptions(options)
  return splitStatements(scan(sql))
    .map((statement) => formatStatement(statement, resolved))
    .join("\n\n")
}
