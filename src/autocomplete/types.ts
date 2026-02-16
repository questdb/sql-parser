// =============================================================================
// Autocomplete Types
// =============================================================================
// Generic suggestion types that are NOT tied to Monaco Editor.
// The UI maps these to Monaco's CompletionItem.
// =============================================================================

/**
 * Kind of suggestion - maps to Monaco CompletionItemKind in the UI
 */
export enum SuggestionKind {
  Keyword = "keyword",
  Function = "function",
  Table = "table",
  Column = "column",
  Operator = "operator",
  DataType = "dataType",
}

/**
 * Priority for sorting suggestions
 */
export enum SuggestionPriority {
  High = 1,
  Medium = 2,
  MediumLow = 3,
  Low = 4,
}

/**
 * A generic autocomplete suggestion
 */
export interface Suggestion {
  /** Display label */
  label: string
  /** Kind of suggestion */
  kind: SuggestionKind
  /** Text to insert when selected */
  insertText: string
  /** Text used for filtering (optional, defaults to label) */
  filterText?: string
  /** Sort priority (lower = higher priority) */
  priority: SuggestionPriority
  /** Additional detail text shown inline after label (e.g., " (trades)") */
  detail?: string
  /** Description text shown on the right side (e.g., "DOUBLE") */
  description?: string
}

/**
 * Column information for schema-aware suggestions
 */
export interface ColumnInfo {
  /** Column name */
  name: string
  /** Column data type (e.g., "STRING", "DOUBLE", "TIMESTAMP") */
  type: string
}

/**
 * Table information for schema-aware suggestions
 */
export interface TableInfo {
  /** Table name */
  name: string
  /** Designated timestamp column (if any) */
  designatedTimestamp?: string
}

/**
 * Schema information passed to the autocomplete provider
 */
export interface SchemaInfo {
  /** Available tables */
  tables: TableInfo[]
  /** Columns indexed by table name (lowercase) */
  columns: Record<string, ColumnInfo[]>
}

/**
 * Autocomplete provider interface
 */
export interface AutocompleteProvider {
  /**
   * Get suggestions for a SQL query at the given cursor position
   * @param query - The SQL query string
   * @param cursorOffset - Cursor position (0-indexed character offset)
   * @returns Array of suggestions
   */
  getSuggestions(query: string, cursorOffset: number): Suggestion[]
}
