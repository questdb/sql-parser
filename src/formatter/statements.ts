import { StreamToken } from "./lexer"

export type Statement = {
  tokens: StreamToken[]
  verbatimFrom: number | null
}

const closerFor: Record<string, string> = {
  LParen: "RParen",
  LBracket: "RBracket",
}

const isOpener = (token: StreamToken) =>
  token.tokenName !== null && token.tokenName in closerFor

const isCloser = (token: StreamToken) =>
  token.tokenName === "RParen" || token.tokenName === "RBracket"

const hasContent = (tokens: StreamToken[]) =>
  tokens.some((token) => token.kind !== "whitespace")

export const splitStatements = (tokens: StreamToken[]): Statement[] => {
  const statements: Statement[] = []
  let current: StreamToken[] = []
  let openers: number[] = []

  const flush = (verbatimFrom: number | null) => {
    if (hasContent(current)) statements.push({ tokens: current, verbatimFrom })
    current = []
    openers = []
  }

  const preserveRest = (from: number, verbatimFrom: number) => {
    current.push(...tokens.slice(from))
    flush(verbatimFrom)
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]

    if (token.kind === "tolerant") {
      preserveRest(index, current.length)
      return statements
    }

    if (isOpener(token)) {
      openers.push(current.length)
      current.push(token)
      continue
    }

    if (isCloser(token)) {
      const opener =
        openers.length > 0 ? current[openers[openers.length - 1]] : null
      if (opener !== null && closerFor[opener.tokenName!] !== token.tokenName) {
        preserveRest(index, openers[0])
        return statements
      }
      if (opener !== null) openers.pop()
      current.push(token)
      continue
    }

    current.push(token)

    if (token.tokenName === "Semicolon" && openers.length === 0) {
      flush(null)
    }
  }

  flush(openers.length > 0 ? openers[0] : null)
  return statements
}
