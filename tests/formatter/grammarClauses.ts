import {
  Alternation,
  IProduction,
  NonTerminal,
  Option,
  Repetition,
  RepetitionMandatory,
  RepetitionMandatoryWithSeparator,
  RepetitionWithSeparator,
  Rule,
  Terminal,
} from "chevrotain"
import { parser } from "../../src/parser/parser"
import { keywordTokenArray } from "../../src/parser/tokens"

const keywordNames = new Set(keywordTokenArray.map((token) => token.name))
const MAX_WORDS = 3
const MAX_DEPTH = 4

const productions: Record<string, Rule> = parser.getGAstProductions()

/** Chevrotain types the children of a group loosely; read them structurally. */
const childrenOf = (item: IProduction): IProduction[] =>
  (item as { definition?: IProduction[] }).definition ?? []

const isGroup = (item: IProduction) =>
  item instanceof Option ||
  item instanceof Repetition ||
  item instanceof RepetitionMandatory ||
  item instanceof RepetitionWithSeparator ||
  item instanceof RepetitionMandatoryWithSeparator

const isOptionalGroup = (item: IProduction) =>
  item instanceof Option ||
  item instanceof Repetition ||
  item instanceof RepetitionWithSeparator

const isKeyword = (item: IProduction): item is Terminal =>
  item instanceof Terminal && keywordNames.has(item.terminalType.name)

const ruleBody = (item: NonTerminal): IProduction[] =>
  item.referencedRule?.definition ??
  productions[item.nonTerminalName].definition

/** Keyword sequences that can begin `definition`, e.g. [["Latest", "On"]]. */
const firstKeywords = (
  definition: IProduction[],
  prefix: string[],
  depth: number,
): string[][] => {
  const done = prefix.length > 0 ? [prefix] : []
  if (prefix.length >= MAX_WORDS || depth > MAX_DEPTH) return done
  const [head, ...rest] = definition
  if (head === undefined) return done

  if (head instanceof Terminal) {
    if (!isKeyword(head)) return done
    return firstKeywords(rest, [...prefix, head.terminalType.name], depth)
  }
  if (head instanceof NonTerminal) {
    return prefix.length > 0
      ? done
      : firstKeywords(ruleBody(head), prefix, depth + 1)
  }
  if (head instanceof Alternation) {
    return childrenOf(head).flatMap((alternative) =>
      firstKeywords([...childrenOf(alternative), ...rest], prefix, depth),
    )
  }
  if (isGroup(head)) {
    return [
      ...firstKeywords([...childrenOf(head), ...rest], prefix, depth),
      ...(isOptionalGroup(head) ? firstKeywords(rest, prefix, depth) : []),
    ]
  }
  return done
}

export type GrammarPart = { source: string; phrases: string[] }

/**
 * The keyword sequences that can begin each part of a grammar rule. Optional
 * and repeated groups are flattened, since they only structure the rule. A
 * choice contributes the leading keywords of every alternative, a sub-rule the
 * keywords it can begin with, and consecutive inline keywords form one phrase.
 */
export const partsOf = (ruleName: string): GrammarPart[] => {
  const rule = productions[ruleName]
  if (rule === undefined) throw new Error(`unknown grammar rule: ${ruleName}`)
  const parts: GrammarPart[] = []

  const push = (source: string, sequences: string[][]) => {
    const phrases = [
      ...new Set(sequences.map((words) => words.join(" ")).filter(Boolean)),
    ]
    if (phrases.length > 0) parts.push({ source, phrases })
  }

  const walk = (items: IProduction[], source: string) => {
    let run: string[] = []
    // Keywords after a choice belong to it: `OR(IN | ...) VOLUME` is IN VOLUME.
    let absorbedByChoice = false

    const flushRun = () => {
      if (run.length > 0) push(`${source}/keywords`, [run])
      run = []
    }

    items.forEach((item, index) => {
      if (item instanceof Terminal) {
        if (!isKeyword(item)) {
          flushRun()
          absorbedByChoice = false
        } else if (!absorbedByChoice) {
          run.push(item.terminalType.name)
        }
        return
      }
      flushRun()
      absorbedByChoice = false
      if (item instanceof NonTerminal) {
        push(item.nonTerminalName, firstKeywords([item], [], 0))
      } else if (item instanceof Alternation) {
        const continuation = items.slice(index + 1)
        const alternatives = childrenOf(item).map((alternative) =>
          firstKeywords([...childrenOf(alternative), ...continuation], [], 0),
        )
        alternatives.forEach((phrases, i) => push(`${source}/alt${i}`, phrases))
        absorbedByChoice = alternatives.some((phrases) => phrases.length > 0)
      } else if (isGroup(item)) {
        walk(childrenOf(item), `${source}/${index}`)
      }
    })
    flushRun()
  }

  walk(rule.definition, ruleName)
  return parts
}
