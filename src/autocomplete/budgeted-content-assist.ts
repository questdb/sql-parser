// =============================================================================
// Budgeted content-assist
// =============================================================================
// Wraps Chevrotain's content-assist path exploration with a hard budget on the
// number of paths explored. Chevrotain's pruning only activates once some
// parse path consumes the input to its end; for malformed input where no
// complete parse exists (unbalanced parens, an unsupported clause, stray
// terminators) the DFS fans out — often exponentially in the size of the
// select list — and never terminates in practice.
//
// The implementation below is a verbatim port of Chevrotain 11's
// `nextPossibleTokensAfter` from `@chevrotain/lib/src/parse/grammar/interpreter.js`
// with a single change: after each path is popped from the stack we increment
// a counter and abort once it exceeds `maxPaths`. On abort we return whatever
// complete paths were found so far — for the pathological inputs we care about
// that set is typically empty, which the caller interprets as "no suggestions".
// =============================================================================

import type { IToken, TokenType } from "chevrotain"
import {
  Alternation,
  Alternative,
  NonTerminal,
  Option,
  Repetition,
  RepetitionMandatory,
  RepetitionMandatoryWithSeparator,
  RepetitionWithSeparator,
  Rule,
  Terminal,
} from "chevrotain"
import { parser } from "../parser/parser"

export interface ContentAssistSuggestion {
  nextTokenType: TokenType
  nextTokenOccurrence: number
  ruleStack: string[]
  occurrenceStack: number[]
}

export interface BudgetedResult {
  suggestions: ContentAssistSuggestion[]
  /** True if the path budget was hit before exploration finished. */
  aborted: boolean
}

// Budget chosen by measurement: valid queries with up to ~200 select items
// explore ~66k paths. Pathological inputs (trailing comma + function calls in
// select list) grow ~4x per item and never terminate. 500k gives ~10x headroom
// over the largest valid case while aborting pathological inputs in <200ms.
export const DEFAULT_MAX_PATHS = 500_000

// Chevrotain's path interpreter mixes grammar productions with string sentinels
// in the `def` arrays and stacks. We model both slots as `unknown[]` to mirror
// Chevrotain's own loose JS typing and cast through IProduction only where the
// productions' constructors demand it.
const EXIT_NON_TERMINAL = "EXIT_NONE_TERMINAL"
const EXIT_NON_TERMINAL_ARR: readonly unknown[] = [EXIT_NON_TERMINAL]
const EXIT_ALTERNATIVE = "EXIT_ALTERNATIVE"

// Accessors for parser internals that Chevrotain's ContentAssist trait uses.
// These fields are not in the public .d.ts but are set by the framework on the
// parser instance and are stable across the Chevrotain 11.x line.
interface ParserInternals {
  tokenMatcher: (token: IToken, tokenType: TokenType) => boolean
  maxLookahead: number
  gastProductionsCache: Record<string, Rule>
}

const parserInternals = parser as unknown as ParserInternals

interface Path {
  idx: number
  def: unknown[]
  ruleStack: string[]
  occurrenceStack: number[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProductionDef = any[] // concrete type hidden by Chevrotain's API

function concatDef(...parts: unknown[][]): unknown[] {
  const out: unknown[] = []
  for (const p of parts) out.push(...p)
  return out
}

function nextPossibleTokensAfterBudgeted(
  initialDef: unknown[],
  tokenVector: IToken[],
  tokMatcher: (t: IToken, tt: TokenType) => boolean,
  maxLookAhead: number,
  maxPaths: number,
): BudgetedResult {
  let foundCompletePath = false
  const tokenVectorLength = tokenVector.length
  const minimalAlternativesIndex = tokenVectorLength - maxLookAhead - 1
  const result: ContentAssistSuggestion[] = []
  const possiblePaths: unknown[] = []
  possiblePaths.push({
    idx: -1,
    def: initialDef,
    ruleStack: [],
    occurrenceStack: [],
  } satisfies Path)

  let pathsExplored = 0
  while (possiblePaths.length > 0) {
    pathsExplored++
    if (pathsExplored > maxPaths) {
      return { suggestions: result, aborted: true }
    }

    const currPath = possiblePaths.pop()
    if (currPath === EXIT_ALTERNATIVE) {
      if (foundCompletePath) {
        const top = possiblePaths[possiblePaths.length - 1]
        if (
          typeof top === "object" &&
          top !== null &&
          typeof (top as Path).idx === "number" &&
          (top as Path).idx <= minimalAlternativesIndex
        ) {
          possiblePaths.pop()
        }
      }
      continue
    }
    if (typeof currPath !== "object" || currPath === null) continue

    const path = currPath as Path
    const currDef = path.def
    const currIdx = path.idx
    const currRuleStack = path.ruleStack
    const currOccurrenceStack = path.occurrenceStack
    if (currDef.length === 0) continue

    const prod = currDef[0]
    if (prod === EXIT_NON_TERMINAL) {
      possiblePaths.push({
        idx: currIdx,
        def: currDef.slice(1),
        ruleStack: currRuleStack.slice(0, -1),
        occurrenceStack: currOccurrenceStack.slice(0, -1),
      } satisfies Path)
    } else if (prod instanceof Terminal) {
      if (currIdx < tokenVectorLength - 1) {
        const nextIdx = currIdx + 1
        const actualToken = tokenVector[nextIdx]
        if (tokMatcher(actualToken, prod.terminalType)) {
          possiblePaths.push({
            idx: nextIdx,
            def: currDef.slice(1),
            ruleStack: currRuleStack,
            occurrenceStack: currOccurrenceStack,
          } satisfies Path)
        }
      } else if (currIdx === tokenVectorLength - 1) {
        result.push({
          nextTokenType: prod.terminalType,
          nextTokenOccurrence: prod.idx,
          ruleStack: currRuleStack,
          occurrenceStack: currOccurrenceStack,
        })
        foundCompletePath = true
      }
    } else if (prod instanceof NonTerminal) {
      const newRuleStack = currRuleStack.slice()
      newRuleStack.push(prod.nonTerminalName)
      const newOccurrenceStack = currOccurrenceStack.slice()
      newOccurrenceStack.push(prod.idx)
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(
          prod.definition as ProductionDef,
          EXIT_NON_TERMINAL_ARR as unknown[],
          currDef.slice(1),
        ),
        ruleStack: newRuleStack,
        occurrenceStack: newOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof Option) {
      possiblePaths.push({
        idx: currIdx,
        def: currDef.slice(1),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
      possiblePaths.push(EXIT_ALTERNATIVE)
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(prod.definition as ProductionDef, currDef.slice(1)),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof RepetitionMandatory) {
      const secondIteration = new Repetition({
        definition: prod.definition,
        idx: prod.idx,
      })
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(
          prod.definition as ProductionDef,
          [secondIteration],
          currDef.slice(1),
        ),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof RepetitionMandatoryWithSeparator) {
      const separatorGast = new Terminal({ terminalType: prod.separator })
      const secondIteration = new Repetition({
        definition: [separatorGast, ...prod.definition],
        idx: prod.idx,
      })
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(
          prod.definition as ProductionDef,
          [secondIteration],
          currDef.slice(1),
        ),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof RepetitionWithSeparator) {
      possiblePaths.push({
        idx: currIdx,
        def: currDef.slice(1),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
      possiblePaths.push(EXIT_ALTERNATIVE)
      const separatorGast = new Terminal({ terminalType: prod.separator })
      const nthRepetition = new Repetition({
        definition: [separatorGast, ...prod.definition],
        idx: prod.idx,
      })
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(
          prod.definition as ProductionDef,
          [nthRepetition],
          currDef.slice(1),
        ),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof Repetition) {
      possiblePaths.push({
        idx: currIdx,
        def: currDef.slice(1),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
      possiblePaths.push(EXIT_ALTERNATIVE)
      const nthRepetition = new Repetition({
        definition: prod.definition,
        idx: prod.idx,
      })
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(
          prod.definition as ProductionDef,
          [nthRepetition],
          currDef.slice(1),
        ),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof Alternation) {
      for (let i = prod.definition.length - 1; i >= 0; i--) {
        const currAlt = prod.definition[i] as Alternative
        possiblePaths.push({
          idx: currIdx,
          def: concatDef(currAlt.definition as ProductionDef, currDef.slice(1)),
          ruleStack: currRuleStack,
          occurrenceStack: currOccurrenceStack,
        } satisfies Path)
        possiblePaths.push(EXIT_ALTERNATIVE)
      }
    } else if (prod instanceof Alternative) {
      possiblePaths.push({
        idx: currIdx,
        def: concatDef(prod.definition as ProductionDef, currDef.slice(1)),
        ruleStack: currRuleStack,
        occurrenceStack: currOccurrenceStack,
      } satisfies Path)
    } else if (prod instanceof Rule) {
      const newRuleStack = currRuleStack.slice()
      newRuleStack.push(prod.name)
      const newCurrOccurrenceStack = currOccurrenceStack.slice()
      newCurrOccurrenceStack.push(1)
      possiblePaths.push({
        idx: currIdx,
        def: prod.definition as ProductionDef,
        ruleStack: newRuleStack,
        occurrenceStack: newCurrOccurrenceStack,
      } satisfies Path)
    }
  }

  return { suggestions: result, aborted: false }
}

/**
 * Drop-in replacement for `parser.computeContentAssist` that aborts after a
 * fixed number of explored paths. Returns the partial set of suggestions
 * collected before abort (typically empty for inputs that trigger the
 * exponential blow-up) along with an `aborted` flag.
 */
export function computeContentAssistBudgeted(
  ruleName: string,
  tokens: IToken[],
  maxPaths: number = DEFAULT_MAX_PATHS,
): BudgetedResult {
  const gast = parserInternals.gastProductionsCache[ruleName]
  if (!gast) {
    throw new Error(`Rule ->${ruleName}<- does not exist in this grammar.`)
  }
  return nextPossibleTokensAfterBudgeted(
    [gast],
    tokens,
    parserInternals.tokenMatcher,
    parserInternals.maxLookahead,
    maxPaths,
  )
}
