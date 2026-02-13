// Core exports
export { QuestDBLexer, tokenize, allTokens } from "./parser/lexer";
export { parser, parse } from "./parser/parser";
export { visitor } from "./parser/visitor";
export { toSql } from "./parser/toSql";

// AST types
export * from "./parser/ast";

// High-level API
export { parseToAst, parseStatements, parseOne } from "./api";

// Content Assist API for Monaco Editor autocomplete
export {
  getContentAssist,
  getNextValidTokens,
  isTokenExpected,
} from "./autocomplete/content-assist";
export type {
  ContentAssistResult,
  TableRef,
} from "./autocomplete/content-assist";

// Autocomplete Provider API (zero-duplication architecture)
// This is the recommended way to integrate autocomplete in the UI
export { createAutocompleteProvider } from "./autocomplete/index";
export type {
  AutocompleteProvider,
  Suggestion,
  SchemaInfo,
  TableInfo,
  ColumnInfo,
} from "./autocomplete/index";
export { SuggestionKind, SuggestionPriority } from "./autocomplete/index";

// Advanced autocomplete utilities (for custom implementations)
export {
  IDENTIFIER_TOKENS,
  IDENTIFIER_KEYWORD_TOKENS,
  SKIP_TOKENS,
  tokenNameToKeyword,
  buildSuggestions,
  buildFallbackSuggestions,
} from "./autocomplete/index";

// Grammar arrays for Monaco Editor integration (syntax highlighting & completion)
// These replace @questdb/sql-grammar exports
export { keywords, dataTypes, constants, functions, operators } from "./grammar/index";

// Re-export commonly used tokens for convenience
export {
  Select,
  From,
  Where,
  Insert,
  Update,
  Delete,
  Create,
  Drop,
  Alter,
  Table,
  Sample,
  By,
  Latest,
  On,
  Partition,
} from "./parser/lexer";
