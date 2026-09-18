import { detectStatementKind, isExplainPrefix, StatementKind } from "./context"
import {
  asLine,
  concat,
  Doc,
  gap,
  group,
  hardline,
  indent,
  printDoc,
  PrintOptions,
  text,
  verbatim,
} from "./doc"
import { reconstruct, StreamToken } from "./lexer"
import {
  clausePhrases,
  continuesPhrase,
  joinSubClauses,
  matchPhrase,
  Phrase,
  PhraseMatch,
  pivotSubClauses,
  windowSubClauses,
} from "./phrases"
import { gapBetween, isOperand, isSign, Piece } from "./spacing"
import { Statement } from "./statements"

type Element = { leading: Doc; doc: Doc }

type Separator = {
  kind: "comma" | "logical" | "subClause"
  leading: Doc
  doc: Doc
}

type Sequence = { items: Element[]; separators: Separator[] }

type GroupExpansion = "none" | "first" | "all"

type SequenceContext = {
  phrase: Phrase | null
  clauseLevel: boolean
  insideParens: boolean
  logical: boolean
  subClauses: Phrase[]
  commas: boolean
  expandableGroups: GroupExpansion
  groupsSeen: number
}

const groupContext = (): SequenceContext => ({
  phrase: null,
  clauseLevel: false,
  insideParens: true,
  logical: false,
  subClauses: [],
  commas: true,
  expandableGroups: "none",
  groupsSeen: 0,
})

const caseContext = (): SequenceContext => ({
  ...groupContext(),
  insideParens: false,
  commas: false,
})

const isComment = (piece: Piece) =>
  piece.token.kind === "lineComment" || piece.token.kind === "blockComment"

const isCloser = (piece: Piece) =>
  piece.token.tokenName === "RParen" || piece.token.tokenName === "RBracket"

const startsQuery = (piece: Piece | undefined) =>
  piece !== undefined &&
  (piece.token.tokenName === "Select" ||
    piece.token.tokenName === "With" ||
    piece.token.tokenName === "Declare")

const opensBlock = (next: Piece | undefined) => startsQuery(next)

type Clause = { doc: Doc; headless: boolean }

const alwaysBreaksList = (phrase: Phrase | null) =>
  phrase !== null && phrase.names[0] === "Declare"

const allowsLogical = (phrase: Phrase | null) =>
  phrase !== null && phrase.names[0] === "Where"

const subClausesFor = (phrase: Phrase | null): Phrase[] =>
  phrase !== null && phrase.role === "join" ? joinSubClauses : []

const endsOperand = (piece: Piece | null) =>
  piece !== null &&
  (piece.token.kind === "word" ||
    piece.token.tokenName === "RParen" ||
    piece.token.tokenName === "RBracket")

const groupExpansionFor = (phrase: Phrase | null): GroupExpansion => {
  if (phrase === null) return "none"
  if (phrase.names[0] === "Values") return "all"
  if (phrase.names.join(" ") === "Create Table") return "first"
  return "none"
}

const withoutTrailingWhitespace = (tokens: StreamToken[]): StreamToken[] => {
  let end = tokens.length
  while (end > 0 && tokens[end - 1].kind === "whitespace") end--
  return tokens.slice(0, end)
}

const toPieces = (
  tokens: StreamToken[],
): { pieces: Piece[]; trailingGap: string } => {
  const pieces: Piece[] = []
  let gapBefore = ""
  for (const token of tokens) {
    if (token.kind === "whitespace") {
      gapBefore += token.image
      continue
    }
    pieces.push({ token, gapBefore, unary: false, endsLine: false })
    gapBefore = ""
  }
  return { pieces, trailingGap: gapBefore }
}

class StatementBuilder {
  private index = 0
  private phrases: Phrase[]
  private kind: StatementKind
  private readonly tokens: StreamToken[]
  previous: Piece | null = null

  constructor(
    private readonly pieces: Piece[],
    kind: StatementKind,
    private readonly uppercaseOffsets: ReadonlySet<number>,
  ) {
    this.kind = kind
    this.phrases = clausePhrases[kind]
    this.tokens = pieces.map((piece) => piece.token)
  }

  private enterQuery() {
    this.kind = "select"
    this.phrases = clausePhrases.select
  }

  private startsQueryBody(match: PhraseMatch | null): boolean {
    if (match === null) return false
    const first = match.phrase.names[0]
    if (first === "Select" || first === "Declare") return true
    return (
      first === "With" &&
      (this.kind === "insert" || this.phrases === clausePhrases.select)
    )
  }

  build(): Doc {
    const first = this.peek()
    if (first === undefined || !isExplainPrefix(first.token)) {
      return this.buildClauses(false)
    }
    const prefix = this.takeText()
    return concat([prefix.doc, gap(" "), this.buildClauses(false)])
  }

  private get atEnd() {
    return this.index >= this.pieces.length
  }

  private peek(offset = 0): Piece | undefined {
    return this.pieces[this.index + offset]
  }

  private take(): Piece {
    const piece = this.pieces[this.index++]
    piece.unary = isSign(piece) && !isOperand(this.previous)
    this.previous = piece
    return piece
  }

  private leadingFor(piece: Piece): Doc {
    if (
      isComment(piece) &&
      this.previous !== null &&
      piece.gapBefore.includes("\n")
    ) {
      piece.endsLine = true
      return hardline
    }
    return gap(gapBetween(this.previous, piece))
  }

  /** Raises the words the caller identified as syntax; see the capitalize option. */
  private textOf(piece: Piece): string {
    return this.uppercaseOffsets.has(piece.token.startOffset)
      ? piece.token.image.toUpperCase()
      : piece.token.image
  }

  private takeText(): Element {
    const piece = this.peek()!
    const leading = this.leadingFor(piece)
    this.take()
    return { leading, doc: text(this.textOf(piece)) }
  }

  private matchClause(current: Phrase | null): PhraseMatch | null {
    const match = matchPhrase(this.tokens, this.index, this.phrases)
    if (match === null || continuesPhrase(current, match.phrase)) return null
    return match
  }

  private buildClauses(insideParens: boolean): Doc {
    return concat(
      this.collectClauses(insideParens).map((clause, i) =>
        i === 0 ? clause.doc : concat([hardline, clause.doc]),
      ),
    )
  }

  private collectClauses(insideParens: boolean): Clause[] {
    const clauses: Clause[] = []
    while (!this.atEnd) {
      const piece = this.peek()!
      if (insideParens && piece.token.tokenName === "RParen") break
      if (clauses.length > 0 && this.kind !== "select") {
        if (this.startsQueryBody(this.matchClause(null))) {
          this.enterQuery()
          clauses.push({
            doc: indent(concat([hardline, this.buildClauses(insideParens)])),
            headless: false,
          })
          break
        }
      }
      const start = this.index
      const clause = this.buildClause(insideParens)
      if (this.index === start) {
        const element = this.takeText()
        clauses.push({
          doc: concat([element.leading, element.doc]),
          headless: true,
        })
        continue
      }
      clauses.push(clause)
    }
    return clauses
  }

  private buildClause(insideParens: boolean): Clause {
    const match = this.matchClause(null)
    const phrase = match === null ? null : match.phrase
    let head: Doc | null = null
    if (match !== null) {
      const headParts: Doc[] = [this.takeText().doc]
      while (this.index < match.endIndex) {
        const element = this.takeText()
        headParts.push(element.leading, element.doc)
      }
      head = concat(headParts)
    }
    const sequence = this.buildSequence({
      phrase,
      clauseLevel: true,
      insideParens,
      logical: allowsLogical(phrase),
      subClauses: subClausesFor(phrase),
      commas: true,
      expandableGroups: groupExpansionFor(phrase),
      groupsSeen: 0,
    })
    return {
      doc: this.renderClause(head, sequence, alwaysBreaksList(phrase)),
      headless: head === null,
    }
  }

  private renderClause(
    head: Doc | null,
    sequence: Sequence,
    alwaysBreak: boolean,
  ): Doc {
    const { items } = sequence
    if (head === null) return this.renderList(sequence, false)
    if (items.length === 0) return head
    if (items.length === 1) {
      return concat([head, this.renderList(sequence, false)])
    }
    const firstInline = sequence.separators.every(
      (separator) => separator.kind === "subClause",
    )
    const body = concat([
      head,
      indent(this.renderList(sequence, true, firstInline)),
    ])
    return alwaysBreak ? body : group(body)
  }

  private renderList(
    sequence: Sequence,
    breakable: boolean,
    firstInline = false,
  ): Doc {
    const { items, separators } = sequence
    const parts: Doc[] = []
    items.forEach((item, i) => {
      const afterComma = i === 0 || separators[i - 1].kind === "comma"
      const breaks = breakable && afterComma && !(firstInline && i === 0)
      parts.push(breaks ? asLine(item.leading) : item.leading, item.doc)
      const separator = separators[i]
      if (separator === undefined) return
      parts.push(
        breakable && separator.kind !== "comma"
          ? asLine(separator.leading)
          : separator.leading,
        separator.doc,
      )
    })
    return concat(parts)
  }

  private buildSequence(ctx: SequenceContext): Sequence {
    const items: Element[] = []
    const separators: Separator[] = []
    let current: Element | null = null
    let betweenPending = false
    let subClauseStarted = false

    const closeItem = () => {
      items.push(current ?? { leading: gap(""), doc: concat([]) })
      current = null
    }

    while (!this.atEnd) {
      const piece = this.peek()!
      const name = piece.token.tokenName
      if (ctx.insideParens && isCloser(piece)) break
      if (ctx.clauseLevel && this.matchClause(ctx.phrase) !== null) break
      if (
        items.length === 0 &&
        current === null &&
        ctx.subClauses.length > 0 &&
        matchPhrase(this.tokens, this.index, ctx.subClauses) !== null
      ) {
        subClauseStarted = true
      }
      if (ctx.clauseLevel && name === "As" && startsQuery(this.peek(1))) {
        const element = this.takeText()
        current = this.append(current, element)
        this.phrases = clausePhrases.select
        break
      }

      if (ctx.commas && !subClauseStarted && name === "Comma") {
        closeItem()
        separators.push({
          kind: "comma",
          leading: this.leadingFor(piece),
          doc: text(","),
        })
        this.take()
        continue
      }

      const subClause =
        current !== null && endsOperand(this.previous)
          ? matchPhrase(this.tokens, this.index, ctx.subClauses)
          : null
      if (subClause !== null) {
        closeItem()
        const leading = this.leadingFor(piece)
        const words: Doc[] = [this.takeText().doc]
        while (this.index < subClause.endIndex) {
          const word = this.takeText()
          words.push(word.leading, word.doc)
        }
        separators.push({ kind: "subClause", leading, doc: concat(words) })
        subClauseStarted = true
        continue
      }

      if (name === "Between") betweenPending = true
      const closesBetween = name === "And" && betweenPending
      if (closesBetween) betweenPending = false

      if (
        ctx.logical &&
        !closesBetween &&
        (name === "And" || name === "Or") &&
        current !== null
      ) {
        closeItem()
        separators.push({
          kind: "logical",
          leading: this.leadingFor(piece),
          doc: text(this.textOf(piece)),
        })
        this.take()
        continue
      }

      const element = this.buildElement(ctx)
      const lastSeparator = separators[separators.length - 1]
      if (
        current === null &&
        lastSeparator !== undefined &&
        items.length === separators.length &&
        piece.token.kind === "lineComment" &&
        element.leading.type === "gap"
      ) {
        lastSeparator.doc = concat([
          lastSeparator.doc,
          element.leading,
          element.doc,
        ])
        continue
      }
      current = this.append(current, element)
    }

    if (current !== null) closeItem()
    return { items, separators }
  }

  private append(current: Element | null, element: Element): Element {
    if (current === null) return element
    return {
      leading: current.leading,
      doc: concat([current.doc, element.leading, element.doc]),
    }
  }

  private buildElement(ctx: SequenceContext): Element {
    const piece = this.peek()!
    const name = piece.token.tokenName
    if (name === "LParen") {
      if (opensBlock(this.peek(1)) || this.precedesTableSource(ctx)) {
        return this.buildBlock()
      }
      const afterIn = this.previous?.token.tokenName === "In"
      const afterOver =
        this.previous?.token.tokenName === "Over" ||
        (ctx.phrase?.names[0] === "Window" &&
          this.previous?.token.tokenName === "As")
      const afterPivot =
        this.previous?.token.tokenName === "Pivot" ||
        this.previous?.token.tokenName === "Unpivot"
      const expandable =
        ctx.expandableGroups === "all" ||
        (ctx.expandableGroups === "first" && ctx.groupsSeen === 0)
      ctx.groupsSeen++
      return this.buildGroup(
        expandable || afterIn || afterOver || afterPivot,
        "RParen",
        afterOver ? windowSubClauses : afterPivot ? pivotSubClauses : [],
      )
    }
    if (name === "LBracket") return this.buildGroup(false, "RBracket")
    if (name === "Case") return this.buildCase()

    const element = this.takeText()
    if (
      piece.token.kind === "lineComment" ||
      (piece.token.kind === "blockComment" && this.followedByNewline(piece))
    ) {
      piece.endsLine = true
      return { leading: element.leading, doc: concat([element.doc, hardline]) }
    }
    return element
  }

  private followedByNewline(piece: Piece) {
    const next = this.peek()
    return (
      piece.endsLine || (next !== undefined && next.gapBefore.includes("\n"))
    )
  }

  private buildGroup(
    expandable: boolean,
    closer: string,
    subClauses: Phrase[] = [],
  ): Element {
    const open = this.takeText()
    const sequence = this.buildSequence({ ...groupContext(), subClauses })
    const close =
      this.peek()?.token.tokenName === closer ? this.takeText() : null
    const closeParts = close === null ? [] : [close.leading, close.doc]

    if (expandable) {
      return {
        leading: open.leading,
        doc: group(
          concat([
            open.doc,
            indent(this.renderList(sequence, true)),
            ...closeParts.map(asLine),
          ]),
        ),
      }
    }
    return {
      leading: open.leading,
      doc: concat([open.doc, this.renderList(sequence, false), ...closeParts]),
    }
  }

  private precedesTableSource(ctx: SequenceContext): boolean {
    const name = this.previous?.token.tokenName
    if (name === undefined || name === null) return false
    if (name === "From" || name === "Join") return true
    const clause = ctx.phrase?.names[0]
    if (name === "Comma") return clause === "From"
    if (name === "As")
      return clause === "With" || this.kind.startsWith("create")
    return false
  }

  private buildBlock(): Element {
    const open = this.peek()!
    const base = gapBetween(this.previous, open)
    const leading = gap(
      base === "" && this.previous?.token.kind === "word" ? " " : base,
    )
    this.take()

    const outerPhrases = this.phrases
    const outerKind = this.kind
    this.enterQuery()
    const clauses = this.collectClauses(true)
    this.phrases = outerPhrases
    this.kind = outerKind

    const close =
      this.peek()?.token.tokenName === "RParen" ? this.takeText() : null

    if (clauses.length === 1 && clauses[0].headless) {
      const closeParts = close === null ? [] : [close.leading, close.doc]
      return {
        leading,
        doc: concat([text(open.token.image), clauses[0].doc, ...closeParts]),
      }
    }

    const body = concat(
      clauses.map((clause, i) =>
        i === 0 ? clause.doc : concat([hardline, clause.doc]),
      ),
    )
    const closeParts = close === null ? [] : [hardline, close.doc]
    return {
      leading,
      doc: concat([
        text(open.token.image),
        indent(concat([hardline, body])),
        ...closeParts,
      ]),
    }
  }

  private buildCase(): Element {
    const start = this.takeText()
    const head: Doc[] = [start.doc]
    const rows: Element[] = []
    let end: Element | null = null

    while (!this.atEnd) {
      const piece = this.peek()!
      const name = piece.token.tokenName
      if (isCloser(piece)) break
      if (name === "End") {
        end = this.takeText()
        break
      }
      if (name === "When" || name === "Else") {
        rows.push(this.takeText())
        continue
      }
      const element = this.buildElement(caseContext())
      if (rows.length === 0) {
        head.push(element.leading, element.doc)
        continue
      }
      const row = rows[rows.length - 1]
      row.doc = concat([row.doc, element.leading, element.doc])
    }

    const parts: Doc[] = [concat(head)]
    if (rows.length > 0) {
      parts.push(
        indent(concat(rows.flatMap((row) => [asLine(row.leading), row.doc]))),
      )
    }
    if (end !== null) parts.push(asLine(end.leading), end.doc)
    return { leading: start.leading, doc: group(concat(parts)) }
  }
}

export const formatStatement = (
  statement: Statement,
  options: PrintOptions,
  uppercaseOffsets: ReadonlySet<number>,
): string => {
  const kind = detectStatementKind(statement.tokens)
  const boundary = statement.verbatimFrom ?? statement.tokens.length
  const { pieces, trailingGap } = toPieces(statement.tokens.slice(0, boundary))
  const builder = new StatementBuilder(pieces, kind, uppercaseOffsets)
  const parts: Doc[] = [builder.build()]

  if (statement.verbatimFrom !== null) {
    const tail = statement.tokens.slice(statement.verbatimFrom)
    const tailPiece: Piece = {
      token: tail[0],
      gapBefore: trailingGap,
      unary: false,
      endsLine: false,
    }
    parts.push(
      gap(gapBetween(builder.previous, tailPiece)),
      verbatim(reconstruct(withoutTrailingWhitespace(tail))),
    )
  }

  return printDoc(concat(parts), options)
}
