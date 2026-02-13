/**
 * SQL Operators for Monaco Editor
 * Used for:
 * 1. Operator highlighting (Monaco tokenizer)
 * 2. Autocomplete suggestions with CompletionItemKind.Operator
 *
 * Note: These are SQL operators that appear as keywords in queries.
 * Arithmetic operators (+, -, *, /, %) are handled separately.
 */
export const operators: string[] = [
  // Logical operators
  "ALL",
  "AND",
  "ANY",
  "BETWEEN",
  "EXISTS",
  "IN",
  "LIKE",
  "NOT",
  "OR",
  "SOME",

  // Set operators
  "EXCEPT",
  "INTERSECT",
  "UNION",

  // Join keywords
  "APPLY",
  "CROSS",
  "FULL",
  "INNER",
  "JOIN",
  "LEFT",
  "OUTER",
  "RIGHT",

  // Predicates
  "CONTAINS",
  "FREETEXT",
  "IS",
  "NULL",
  "~",
  "!~",
  "~=",

  // Pivoting
  "PIVOT",
  "UNPIVOT",

  // Merging
  "MATCHED",

  // Query explanation
  "EXPLAIN",
];
