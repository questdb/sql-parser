// =============================================================================
// High-level API for QuestDB SQL Parser
// =============================================================================

import { parse } from "./parser/parser";
import { visitor } from "./parser/visitor";
import type { Statement } from "./parser/ast";

export interface ParseResult {
  ast: Statement[];
  errors: Array<{ message: string; line?: number; column?: number }>;
}

/**
 * Parse SQL string to AST
 */
export function parseToAst(sql: string): ParseResult {
  const { cst, lexErrors, parseErrors } = parse(sql);

  const errors: ParseResult["errors"] = [];

  // Collect lex errors
  for (const err of lexErrors) {
    errors.push({
      message: err.message,
      line: err.line,
      column: err.column,
    });
  }

  // Collect parse errors
  for (const err of parseErrors) {
    errors.push({
      message: err.message,
      line: err.token?.startLine,
      column: err.token?.startColumn,
    });
  }

  // If there are errors, return empty AST
  if (errors.length > 0) {
    return { ast: [], errors };
  }

  // Transform CST to AST
  const ast = visitor.visit(cst) as Statement[];

  return { ast, errors: [] };
}

/**
 * Parse multiple SQL statements (no semicolons needed)
 */
export function parseStatements(sql: string): Statement[] {
  const result = parseToAst(sql);

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(
      `Parse error at line ${firstError.line}, column ${firstError.column}: ${firstError.message}`
    );
  }

  return result.ast;
}

/**
 * Parse single SQL statement and return AST
 */
export function parseOne(sql: string): Statement {
  const statements = parseStatements(sql);

  if (statements.length === 0) {
    throw new Error("No statement found");
  }

  if (statements.length > 1) {
    throw new Error(`Expected 1 statement, found ${statements.length}`);
  }

  return statements[0];
}
