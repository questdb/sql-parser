import type { CstNode, IToken } from "chevrotain"
import { parse } from "../parser/parser"
import { reconstruct, type StreamToken } from "./lexer"

/**
 * The server reads an unquoted password as one token. Our lexer splits some
 * of them at a bare @ (pass@2026, @123, abc@), which must not acquire spaces
 * when formatted. Use passwordValue CST boundaries to keep those values
 * atomic without changing the spacing of @ elsewhere in SQL.
 */
export function preservePasswordValues(tokens: StreamToken[]): StreamToken[] {
  if (
    !tokens.some((token) => token.tokenName === "AtSign") ||
    !tokens.some((token) => token.tokenName === "Password")
  ) {
    return tokens
  }

  const ranges: { start: number; end: number }[] = []
  const base = tokens[0].startOffset
  const { cst } = parse(reconstruct(tokens))

  const collect = (node: CstNode, password: IToken[] | undefined): void => {
    const value = node.name === "passwordValue" ? [] : password
    for (const children of Object.values(node.children)) {
      for (const child of children) {
        if ("tokenType" in child) value?.push(child)
        else collect(child, value)
      }
    }
    if (
      node.name === "passwordValue" &&
      value?.some((token) => token.tokenType.name === "AtSign")
    ) {
      const offsets = value.filter((token) =>
        Number.isFinite(token.startOffset),
      )
      if (offsets.length === 0) return
      ranges.push({
        start: base + Math.min(...offsets.map((token) => token.startOffset)),
        end:
          base +
          Math.max(
            ...offsets.map((token) => token.startOffset + token.image.length),
          ),
      })
    }
  }
  collect(cst, undefined)
  if (ranges.length === 0) return tokens
  ranges.sort((a, b) => a.start - b.start)

  const result: StreamToken[] = []
  let index = 0
  for (const range of ranges) {
    while (index < tokens.length && tokens[index].startOffset < range.start) {
      result.push(tokens[index++])
    }
    const first = index
    while (index < tokens.length && tokens[index].startOffset < range.end)
      index++
    result.push({
      kind: "word",
      tokenName: "PasswordValue",
      image: reconstruct(tokens.slice(first, index)),
      startOffset: range.start,
      endOffset: range.end,
    })
  }
  result.push(...tokens.slice(index))
  return result
}
