# Contributing to @questdb/sql-parser

## Setup

```bash
yarn                # Install dependencies
yarn build          # Compile TypeScript (tsup + tsc)
yarn test           # Run all tests (6,100+ tests)
yarn test:watch     # Run tests in watch mode
yarn typecheck      # Type-check without emitting
yarn lint           # Run ESLint
yarn lint:fix       # Auto-fix lint issues
yarn generate:cst   # Regenerate CST type definitions from parser grammar
yarn clean          # Remove dist/ and coverage/
```

## Pipeline Overview

Every SQL string flows through this pipeline:

```
SQL String ──> Lexer (tokens.ts/lexer.ts) ──> Token[]
                                                  │
Token[] ──────> Parser (parser.ts) ───────> CST (Concrete Syntax Tree)
                                                  │
CST ──────────> Visitor (visitor.ts) ──────> AST (typed, clean)
                                                  │
AST ──────────> toSql (toSql.ts) ──────────> SQL String (round-trip)
```

The **CST** is Chevrotain's lossless tree that preserves every token. The **visitor** transforms it into a clean, typed **AST** that is easy to work with. `toSql()` converts any AST node back to valid SQL.

For **autocomplete**, the flow is:

```
SQL + cursor offset ──> content-assist.ts ──> parser.computeContentAssist()
                                                  │
                              nextTokenTypes + tablesInScope + cteColumns
                                                  │
                         suggestion-builder.ts ──> Suggestion[] (filtered, prioritized)
```

## How Tokens Work

Grammar arrays (`src/grammar/keywords.ts`, `dataTypes.ts`, `constants.ts`) are the source of truth. `src/parser/tokens.ts` auto-generates Chevrotain tokens from them:

1. Each keyword string is converted to a PascalCase token name (`"select"` → `Select`, `"data_page_size"` → `DataPageSize`)
2. Each token gets a case-insensitive regex pattern with word boundary (e.g., `/select\b/i`)
3. Non-reserved keywords are assigned to the `IdentifierKeyword` category, which lets the parser accept them as table/column names via a single `CONSUME(IdentifierKeyword)` rule

The `IDENTIFIER_KEYWORD_NAMES` set in `tokens.ts` controls which keywords are non-reserved. Reserved keywords (SELECT, FROM, WHERE, JOIN, etc.) are **not** in this set and cannot be used as unquoted identifiers.

## Workflow: Adding a New Keyword

Example: adding a hypothetical `RETENTION` keyword.

**1. Add to grammar** — `src/grammar/keywords.ts`:
```typescript
export const keywords: string[] = [
  // ...existing keywords in alphabetical order...
  "retention",
  // ...
]
```
This auto-generates a `Retention` token in `tokens.ts`.

**2. If non-reserved, mark it** — `src/parser/tokens.ts`:

If the keyword can be used as an identifier (table/column name), add it to `IDENTIFIER_KEYWORD_NAMES`:
```typescript
export const IDENTIFIER_KEYWORD_NAMES = new Set([
  // ...
  "Retention",
])
```

Skip this step if the keyword is reserved (i.e., it introduces structural ambiguity as an identifier).

**3. Use in parser grammar** — `src/parser/parser.ts`:

Reference the token in a grammar rule:
```typescript
private retentionClause = this.RULE("retentionClause", () => {
  this.CONSUME(Retention)
  this.CONSUME(NumberLiteral)
  this.SUBRULE(this.partitionPeriod)  // DAY, MONTH, etc.
})
```

Make sure to import the token from `lexer.ts` at the top of `parser.ts`. The token is available by its PascalCase name.

**4. Regenerate CST types**:
```bash
yarn generate:cst
```
This reads the parser's grammar rules and regenerates `src/parser/cst-types.d.ts`. The new rule's CST children type will appear automatically (e.g., `RetentionClauseCstChildren`).

**5. Add visitor method** — `src/parser/visitor.ts`:

Import the new CST type from `cst-types.d.ts`, then add a visitor method:
```typescript
retentionClause(ctx: RetentionClauseCstChildren): AST.RetentionClause {
  return {
    type: "retentionClause",
    value: parseInt(ctx.NumberLiteral[0].image, 10),
    unit: this.visit(ctx.partitionPeriod[0]),
  }
}
```

**6. Add AST type** — `src/parser/ast.ts`:
```typescript
export interface RetentionClause extends AstNode {
  type: "retentionClause"
  value: number
  unit: string
}
```

**7. Add toSql serialization** — `src/parser/toSql.ts`:
```typescript
function retentionClauseToSql(clause: AST.RetentionClause): string {
  return `RETENTION ${clause.value} ${clause.unit}`
}
```
Wire it into the parent statement's toSql function.

**8. Add tests** — `tests/parser.test.ts`:
```typescript
it("should parse RETENTION clause", () => {
  const result = parseToAst("CREATE TABLE t (x INT) RETENTION 30 DAY")
  expect(result.errors).toHaveLength(0)
  // assert AST structure...
})

it("should round-trip RETENTION clause", () => {
  const sql = "CREATE TABLE t (x INT) RETENTION 30 DAY"
  const result = parseToAst(sql)
  const roundtrip = toSql(result.ast[0])
  const result2 = parseToAst(roundtrip)
  expect(result2.errors).toHaveLength(0)
})
```

**9. Run tests**:
```bash
yarn test
```

## Workflow: Adding a New Statement Type

Same as adding a keyword, but the scope is larger:

1. **Grammar**: add all tokens to `src/grammar/keywords.ts` (and `src/parser/tokens.ts` if non-reserved)
2. **Parser**: add a new top-level rule in `parser.ts`, register it in the `statement` rule's alternatives
3. **CST types**: `yarn generate:cst`
4. **AST**: add the statement interface to `ast.ts`, add it to the `Statement` union type
5. **Visitor**: add visitor method in `visitor.ts`
6. **toSql**: add serializer in `toSql.ts`, add the case to the `statementToSql` switch
7. **Tests**: parse tests, AST structure assertions, and round-trip tests

## Workflow: Modifying Autocomplete Behavior

Autocomplete has four layers:

1. **`content-assist.ts`** — determines what the parser expects at the cursor position. Extracts tables in scope (FROM/JOIN clauses), CTE definitions, and qualified references (e.g., `t1.`). You rarely need to modify this unless you're changing how scope is detected.

2. **`token-classification.ts`** — classifies tokens into categories: `SKIP_TOKENS` (never suggested), `EXPRESSION_OPERATORS` (lower priority), `IDENTIFIER_KEYWORD_TOKENS` (trigger schema suggestions). When adding a new token, decide which category it belongs to.

3. **`suggestion-builder.ts`** — converts parser token types + schema into `Suggestion[]`. Controls priority (columns > keywords > functions > tables), handles qualified references, and manages deduplication.

4. **`provider.ts`** — orchestrates the above and adds context detection: after FROM → suggest tables, after SELECT → suggest columns, after `*` → suppress columns (alias position), etc. The `getIdentifierSuggestionScope()` function is the main context switcher.

## Key Concepts

**Reserved vs. non-reserved keywords**: QuestDB has ~60 reserved keywords. Everything else (data types, time units, config keys like `maxUncommittedRows`) is non-reserved and can be used as an unquoted identifier. The `IdentifierKeyword` token category in Chevrotain handles this — the parser's `identifier` rule accepts any `IdentifierKeyword` token.

**CST vs. AST**: The CST preserves every token (including keywords, punctuation, whitespace position). The AST is a clean semantic representation. The visitor decides what to keep. For example, the CST has separate `Select`, `Star`, `From` tokens; the AST just has `{ type: "select", columns: [{ type: "star" }], from: [...] }`.

**Round-trip correctness**: `toSql(parseToAst(sql).ast)` must produce SQL that parses to an equivalent AST. This is verified against 1,726 real queries in `docs-roundtrip.test.ts`. When adding new features, always test round-trip.

**Error recovery**: The parser uses Chevrotain's semicolon-based error recovery. When a statement fails to parse, it skips to the next semicolon and continues. The visitor handles incomplete CST nodes with try-catch. This means `parseToAst()` can return both `ast` (partial) and `errors` simultaneously.
