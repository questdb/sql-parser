import { describe, it, expect } from "vitest"
import {
  createAutocompleteProvider,
  SuggestionKind,
  SuggestionPriority,
} from "../src/index"
import type {
  AutocompleteProvider,
  Suggestion,
} from "../src/autocomplete/types"

// =============================================================================
// Test Utility: Autocomplete Walkthrough
// =============================================================================
// Tests that autocomplete provides relevant suggestions at each word boundary
// in a SQL statement. This ensures the parser is responsive and provides
// correct context-aware suggestions as the user types.

interface WalkthroughStep {
  /** The partial SQL up to this point (what user has typed so far) */
  typed: string
  /** Token names or keyword labels expected in suggestions */
  expects: string[]
  /** Token names or keyword labels that should NOT appear */
  rejects?: string[]
}

/**
 * Assert autocomplete suggestions at each step of typing a SQL statement.
 * Each step represents a word boundary where the user pauses and expects suggestions.
 */
function assertSuggestionsWalkthrough(
  provider: AutocompleteProvider,
  steps: WalkthroughStep[],
) {
  for (const step of steps) {
    const suggestions = provider.getSuggestions(step.typed, step.typed.length)
    const labels = suggestions.map((s) => s.label)

    for (const expected of step.expects) {
      expect(labels).toContain(expected)
    }

    if (step.rejects) {
      for (const rejected of step.rejects) {
        expect(labels).not.toContain(rejected)
      }
    }
  }
}

/**
 * Helper: get suggestion labels at a given position
 */
function getLabelsAt(
  provider: AutocompleteProvider,
  sql: string,
  offset?: number,
): string[] {
  return provider.getSuggestions(sql, offset ?? sql.length).map((s) => s.label)
}

/**
 * Helper: get suggestions of a specific kind at a given position
 */
function getSuggestionsOfKind(
  provider: AutocompleteProvider,
  sql: string,
  kind: SuggestionKind,
  offset?: number,
): Suggestion[] {
  return provider
    .getSuggestions(sql, offset ?? sql.length)
    .filter((s) => s.kind === kind)
}

// =============================================================================
// Test Schema
// =============================================================================

const schema = {
  tables: [
    { name: "trades", designatedTimestamp: "timestamp" },
    { name: "orders" },
    { name: "users" },
  ],
  columns: {
    trades: [
      { name: "symbol", type: "STRING" },
      { name: "price", type: "DOUBLE" },
      { name: "amount", type: "DOUBLE" },
      { name: "timestamp", type: "TIMESTAMP" },
    ],
    orders: [
      { name: "id", type: "LONG" },
      { name: "status", type: "STRING" },
    ],
    users: [
      { name: "name", type: "STRING" },
      { name: "email", type: "STRING" },
    ],
  },
}

const provider = createAutocompleteProvider(schema)

// =============================================================================
// Tests
// =============================================================================

describe("createAutocompleteProvider", () => {
  describe("keyword suggestions", () => {
    it("suggests TABLE after CREATE", () => {
      const labels = getLabelsAt(provider, "CREATE ")
      expect(labels).toContain("TABLE")
      expect(labels).not.toContain("SELECT")
    })

    it("suggests valid actions after ALTER TABLE tableName", () => {
      const labels = getLabelsAt(provider, "ALTER TABLE trades ")
      expect(labels).toContain("ADD")
      expect(labels).toContain("DROP")
      expect(labels).toContain("RENAME")
    })

    it("suggests FROM after SELECT * and does NOT suggest columns", () => {
      const suggestions = provider.getSuggestions("SELECT * ", 9)
      const labels = suggestions.map((s) => s.label)
      expect(labels).toContain("FROM")
      // After SELECT *, all columns are already selected — suggesting
      // column names makes no sense. Only keywords should appear.
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns).toHaveLength(0)
    })

    it("suggests FROM when typing 'FR' after SELECT * (mid-word)", () => {
      const suggestions = provider.getSuggestions("SELECT * FR", 11)
      const labels = suggestions.map((s) => s.label)
      expect(labels).toContain("FROM")
      // No columns, tables, or functions should appear — only keywords
      const nonKeywords = suggestions.filter(
        (s) => s.kind !== SuggestionKind.Keyword,
      )
      expect(nonKeywords).toHaveLength(0)
    })

    it("suggests BY after ORDER", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades ORDER ")
      expect(labels).toContain("BY")
    })
  })

  describe("column suggestions", () => {
    it("suggests columns after SELECT (with FROM clause)", () => {
      const columns = getSuggestionsOfKind(
        provider,
        "SELECT  FROM trades",
        SuggestionKind.Column,
        7,
      )
      expect(columns.length).toBeGreaterThan(0)
      const columnLabels = columns.map((s) => s.label)
      expect(columnLabels).toContain("symbol")
      expect(columnLabels).toContain("price")
      expect(columnLabels).toContain("timestamp")
      expect(columns.every((s) => s.priority === SuggestionPriority.High)).toBe(
        true,
      )
    })

    it("suggests columns in WHERE clause", () => {
      const columns = getSuggestionsOfKind(
        provider,
        "SELECT * FROM trades WHERE ",
        SuggestionKind.Column,
      )
      expect(columns.length).toBeGreaterThan(0)
      expect(columns.map((s) => s.label)).toContain("symbol")
    })
  })

  describe("table suggestions", () => {
    it("suggests tables after FROM", () => {
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT * FROM ",
        SuggestionKind.Table,
      )
      expect(tables.length).toBeGreaterThan(0)
      const tableLabels = tables.map((s) => s.label)
      expect(tableLabels).toContain("trades")
      expect(tableLabels).toContain("orders")
    })

    it("suggests tables after JOIN", () => {
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT * FROM trades JOIN ",
        SuggestionKind.Table,
      )
      expect(tables.length).toBeGreaterThan(0)
    })

    it("suggests tables after FROM when select items are missing", () => {
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT FROM ",
        SuggestionKind.Table,
      )
      expect(tables.length).toBe(3)
      const tableLabels = tables.map((s) => s.label).sort()
      expect(tableLabels).toContain("trades")
      expect(tableLabels).toContain("orders")
      expect(tableLabels).toContain("users")
    })

    it("suggests tables after FROM when typing partial table name without select items", () => {
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT FROM t",
        SuggestionKind.Table,
      )
      expect(tables.length).toBe(3)
    })

    it("should NOT suggest the partial word itself as a table (phantom suggestion)", () => {
      // Typing "FROM te" — "te" is not a real table but gets captured by
      // extractTables because it follows FROM. It must not be suggested back.
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT amount FROM te",
        SuggestionKind.Table,
      )
      const labels = tables.map((s) => s.label)
      expect(labels).not.toContain("te")
      // Real schema tables should still be present
      expect(labels).toContain("trades")
      expect(labels).toContain("orders")
      expect(labels).toContain("users")
    })

    it("should NOT suggest longer partial words as tables", () => {
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT amount FROM tes",
        SuggestionKind.Table,
      )
      const labels = tables.map((s) => s.label)
      expect(labels).not.toContain("tes")
    })

    it("should NOT suggest partial word after JOIN", () => {
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT * FROM trades JOIN or",
        SuggestionKind.Table,
      )
      const labels = tables.map((s) => s.label)
      expect(labels).not.toContain("or")
      expect(labels).toContain("orders")
    })

    it("should still suggest real table when partial matches schema table", () => {
      // Typing "trades" mid-word — it IS a real table, should be kept
      const tables = getSuggestionsOfKind(
        provider,
        "SELECT * FROM trades",
        SuggestionKind.Table,
      )
      const labels = tables.map((s) => s.label)
      expect(labels).toContain("trades")
    })

    it("should still suggest CTE name when partial matches CTE", () => {
      const sql =
        "WITH my_cte AS (SELECT symbol FROM trades) SELECT * FROM my_cte"
      const tables = getSuggestionsOfKind(provider, sql, SuggestionKind.Table)
      const labels = tables.map((s) => s.label)
      expect(labels).toContain("my_cte")
    })
  })

  describe("suggestion details", () => {
    it("includes column details with table and type", () => {
      const suggestions = provider.getSuggestions("SELECT  FROM trades", 7)
      const symbolSuggestion = suggestions.find((s) => s.label === "symbol")
      expect(symbolSuggestion).toBeDefined()
      expect(symbolSuggestion?.detail).toContain("trades")
      expect(symbolSuggestion?.description).toBe("STRING")
    })
  })

  describe("priority ordering", () => {
    it("columns have higher priority than tables", () => {
      const suggestions = provider.getSuggestions("SELECT  FROM trades", 7)
      const columnSuggestion = suggestions.find(
        (s) => s.kind === SuggestionKind.Column,
      )
      const tableSuggestion = suggestions.find(
        (s) => s.kind === SuggestionKind.Table,
      )
      expect(columnSuggestion).toBeDefined()
      expect(tableSuggestion).toBeDefined()
      expect(columnSuggestion!.priority).toBeLessThan(tableSuggestion!.priority)
    })
  })
})

// =============================================================================
// Autocomplete Walkthrough Tests
// =============================================================================

describe("Autocomplete walkthrough", () => {
  describe("SELECT * FROM trades WHERE price > 100", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT ",
          expects: ["DISTINCT", "CASE", "CAST"],
        },
        {
          typed: "SELECT * ",
          expects: ["FROM"],
        },
        {
          typed: "SELECT * FROM ",
          expects: ["trades", "orders", "users"],
        },
        {
          typed: "SELECT * FROM trades ",
          expects: ["WHERE", "ORDER", "GROUP", "LIMIT", "JOIN"],
        },
        {
          typed: "SELECT * FROM trades WHERE ",
          expects: ["symbol", "price", "amount", "timestamp"],
        },
      ])
    })
  })

  describe("SELECT symbol, price FROM trades ORDER BY price DESC", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT ",
          expects: ["CASE", "CAST"],
        },
        {
          typed: "SELECT symbol, ",
          expects: ["CASE", "CAST"],
        },
        {
          typed: "SELECT symbol, price ",
          expects: ["FROM", "AS"],
        },
        {
          typed: "SELECT symbol, price FROM ",
          expects: ["trades", "orders"],
        },
        {
          typed: "SELECT symbol, price FROM trades ",
          expects: ["WHERE", "ORDER", "GROUP", "JOIN"],
        },
        {
          typed: "SELECT symbol, price FROM trades ORDER ",
          expects: ["BY"],
        },
      ])
    })
  })

  describe("INSERT INTO trades (symbol, price) VALUES ('BTC', 100)", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "INSERT ",
          expects: ["INTO"],
        },
        {
          typed: "INSERT INTO ",
          expects: ["trades", "orders"],
        },
      ])
    })
  })

  describe("CREATE TABLE new_table (id INT, name STRING) TIMESTAMP(id) PARTITION BY DAY", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "CREATE ",
          expects: ["TABLE"],
        },
        {
          typed:
            "CREATE TABLE new_table (id INT, name STRING) TIMESTAMP(id) PARTITION ",
          expects: ["BY"],
        },
      ])
    })
  })

  // Expression-related walkthroughs
  describe("SELECT * FROM trades WHERE symbol ILIKE '%btc%'", () => {
    it("should suggest ILIKE and LIKE after column name in WHERE", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT * FROM trades WHERE symbol ",
          expects: ["LIKE", "ILIKE", "IN", "BETWEEN", "IS"],
        },
      ])
    })
  })

  describe("SELECT * FROM trades WHERE price BETWEEN 100 AND 200", () => {
    it("should suggest BETWEEN and IN after column in WHERE", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT * FROM trades WHERE price ",
          expects: ["BETWEEN", "IN", "LIKE", "ILIKE", "IS"],
        },
      ])
    })
  })
})

// =============================================================================
// Documentation Example Tests
// =============================================================================

describe("Documentation examples - autocomplete", () => {
  // From /query/operators/text.md
  describe("text operators", () => {
    it("should suggest operators after string literal", () => {
      // SELECT 'a' || 'b' - after 'a' we should get valid next tokens
      const labels = getLabelsAt(provider, "SELECT 'a' ")
      expect(labels).toContain("FROM")
      expect(labels).toContain("AS")
    })

    it("should suggest LIKE and ILIKE in WHERE context", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE symbol ")
      expect(labels).toContain("LIKE")
      expect(labels).toContain("ILIKE")
    })
  })

  // From /query/sql/where.md
  describe("WHERE clause operators", () => {
    it("should suggest IS after column name", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE price ")
      expect(labels).toContain("IS")
    })

    it("should suggest NOT after IS", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades WHERE price IS ",
      )
      expect(labels).toContain("NOT")
    })

    it("should suggest IN after column name", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE symbol ")
      expect(labels).toContain("IN")
    })

    it("should suggest BETWEEN after column name", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE price ")
      expect(labels).toContain("BETWEEN")
    })
  })

  // From /query/sql/sample-by.md
  describe("SAMPLE BY autocomplete", () => {
    it("should suggest SAMPLE after FROM table clause", () => {
      const labels = getLabelsAt(provider, "SELECT avg(price) FROM trades ")
      expect(labels).toContain("SAMPLE")
    })

    it("should suggest BY after SAMPLE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE ",
      )
      expect(labels).toContain("BY")
    })

    it("should suggest FILL after SAMPLE BY duration", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ",
      )
      expect(labels).toContain("FILL")
    })

    it("should suggest ALIGN after SAMPLE BY duration", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ",
      )
      expect(labels).toContain("ALIGN")
    })

    it("should suggest FROM after SAMPLE BY duration (for FROM/TO range)", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ",
      )
      expect(labels).toContain("FROM")
    })

    it("should suggest ALIGN after FILL clause", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h FILL(PREV) ",
      )
      expect(labels).toContain("ALIGN")
    })

    it("should suggest TO after ALIGN", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ALIGN ",
      )
      expect(labels).toContain("TO")
    })

    it("should suggest CALENDAR and FIRST after ALIGN TO", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ALIGN TO ",
      )
      expect(labels).toContain("CALENDAR")
      expect(labels).toContain("FIRST")
    })

    it("should suggest OBSERVATION after FIRST", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ALIGN TO FIRST ",
      )
      expect(labels).toContain("OBSERVATION")
    })

    it("should suggest TIME and WITH after CALENDAR", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ALIGN TO CALENDAR ",
      )
      expect(labels).toContain("TIME")
      expect(labels).toContain("WITH")
    })

    it("should suggest ZONE after TIME", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT avg(price) FROM trades SAMPLE BY 1h ALIGN TO CALENDAR TIME ",
      )
      expect(labels).toContain("ZONE")
    })
  })
})

// =============================================================================
// SAMPLE BY Autocomplete Walkthrough
// =============================================================================

describe("SAMPLE BY walkthrough", () => {
  describe("SELECT ts, count() FROM trades SAMPLE BY 1d FILL(NULL) ALIGN TO CALENDAR", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT ts, count() FROM trades ",
          expects: ["SAMPLE", "WHERE", "ORDER", "GROUP", "JOIN"],
        },
        {
          typed: "SELECT ts, count() FROM trades SAMPLE ",
          expects: ["BY"],
        },
        {
          typed: "SELECT ts, count() FROM trades SAMPLE BY 1d ",
          expects: ["FILL", "ALIGN", "FROM"],
        },
        {
          typed: "SELECT ts, count() FROM trades SAMPLE BY 1d FILL(NULL) ",
          expects: ["ALIGN"],
        },
        {
          typed:
            "SELECT ts, count() FROM trades SAMPLE BY 1d FILL(NULL) ALIGN ",
          expects: ["TO"],
        },
        {
          typed:
            "SELECT ts, count() FROM trades SAMPLE BY 1d FILL(NULL) ALIGN TO ",
          expects: ["CALENDAR", "FIRST"],
        },
      ])
    })
  })

  describe("SELECT ts, count() FROM trades SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'UTC' WITH OFFSET '00:15'", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed:
            "SELECT ts, count() FROM trades SAMPLE BY 1h ALIGN TO CALENDAR ",
          expects: ["TIME", "WITH"],
        },
        {
          typed:
            "SELECT ts, count() FROM trades SAMPLE BY 1h ALIGN TO CALENDAR TIME ",
          expects: ["ZONE"],
        },
      ])
    })
  })
})

// =============================================================================
// JOIN Autocomplete Tests (Chunk 3)
// =============================================================================

describe("JOIN autocomplete", () => {
  it("should suggest compound JOIN types after FROM table", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades ")
    expect(labels).toContain("JOIN")
    expect(labels).toContain("INNER JOIN")
    expect(labels).toContain("LEFT JOIN")
    expect(labels).toContain("CROSS JOIN")
    expect(labels).toContain("ASOF JOIN")
    // Bare prefixes should NOT appear when compounds are available
    expect(labels).not.toContain("INNER")
    expect(labels).not.toContain("LEFT")
    expect(labels).not.toContain("CROSS")
    expect(labels).not.toContain("ASOF")
  })

  it("should suggest JOIN and OUTER JOIN after LEFT", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades LEFT ")
    expect(labels).toContain("JOIN")
    expect(labels).toContain("OUTER JOIN")
    expect(labels).not.toContain("OUTER")
  })

  it("should suggest ON after JOIN table", () => {
    const labels = getLabelsAt(
      provider,
      "SELECT * FROM trades t JOIN orders o ",
    )
    expect(labels).toContain("ON")
  })

  it("should suggest TOLERANCE after ON condition in ASOF JOIN", () => {
    const labels = getLabelsAt(
      provider,
      "SELECT * FROM trades t ASOF JOIN quotes q ON t.ts = q.ts ",
    )
    expect(labels).toContain("TOLERANCE")
  })

  describe("ASOF JOIN walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT * FROM trades ",
          expects: ["JOIN", "ASOF JOIN", "LEFT JOIN", "CROSS JOIN"],
        },
        {
          typed: "SELECT * FROM trades ASOF ",
          expects: ["JOIN"],
        },
        {
          typed: "SELECT * FROM trades ASOF JOIN quotes ",
          expects: ["ON"],
        },
      ])
    })

    it("should NOT suggest OUTER after ASOF", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades ASOF ")
      expect(labels).not.toContain("OUTER")
    })

    it("should suggest OUTER JOIN after LEFT", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades LEFT ")
      expect(labels).toContain("OUTER JOIN")
      expect(labels).toContain("JOIN")
    })

    it("should suggest compound join types after ON condition (chained joins)", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t ASOF JOIN quotes q ON (symbol) ",
      )
      expect(labels).toContain("ASOF JOIN")
      expect(labels).toContain("JOIN")
      expect(labels).toContain("CROSS JOIN")
      expect(labels).toContain("LEFT JOIN")
    })
  })

  describe("join-type-specific postamble suggestions", () => {
    it("ASOF JOIN: should suggest ON and TOLERANCE, not INCLUDE/EXCLUDE/RANGE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t ASOF JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).toContain("TOLERANCE")
      expect(labels).not.toContain("INCLUDE")
      expect(labels).not.toContain("EXCLUDE")
      expect(labels).not.toContain("RANGE")
    })

    it("LT JOIN: should suggest ON and TOLERANCE, not INCLUDE/EXCLUDE/RANGE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t LT JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).toContain("TOLERANCE")
      expect(labels).not.toContain("INCLUDE")
      expect(labels).not.toContain("EXCLUDE")
      expect(labels).not.toContain("RANGE")
    })

    it("SPLICE JOIN: should suggest ON, not TOLERANCE/INCLUDE/EXCLUDE/RANGE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t SPLICE JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).not.toContain("TOLERANCE")
      expect(labels).not.toContain("INCLUDE")
      expect(labels).not.toContain("EXCLUDE")
      expect(labels).not.toContain("RANGE")
    })

    it("WINDOW JOIN: should suggest ON, RANGE, INCLUDE, EXCLUDE, not TOLERANCE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t WINDOW JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).toContain("RANGE")
      expect(labels).toContain("INCLUDE")
      expect(labels).toContain("EXCLUDE")
      expect(labels).not.toContain("TOLERANCE")
    })

    it("HORIZON JOIN: should suggest ON, RANGE, LIST, not TOLERANCE/INCLUDE/EXCLUDE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).toContain("RANGE")
      expect(labels).toContain("LIST")
      expect(labels).not.toContain("TOLERANCE")
      expect(labels).not.toContain("INCLUDE")
      expect(labels).not.toContain("EXCLUDE")
    })

    it("HORIZON JOIN: should suggest AS after table name (alias mandatory)", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes ",
      )
      expect(labels).toContain("AS")
    })

    it("HORIZON JOIN: should suggest RANGE and LIST after ON clause", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) ",
      )
      expect(labels).toContain("RANGE")
      expect(labels).toContain("LIST")
    })

    it("HORIZON JOIN RANGE: should suggest FROM after RANGE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) RANGE ",
      )
      expect(labels).toContain("FROM")
    })

    it("HORIZON JOIN RANGE: should suggest TO after FROM offset", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) RANGE FROM 1s ",
      )
      expect(labels).toContain("TO")
    })

    it("HORIZON JOIN RANGE: should suggest STEP after TO offset", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) RANGE FROM 1s TO 60s ",
      )
      expect(labels).toContain("STEP")
    })

    it("HORIZON JOIN RANGE: should suggest AS after STEP offset", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) RANGE FROM 1s TO 60s STEP 1s ",
      )
      expect(labels).toContain("AS")
    })

    it("HORIZON JOIN RANGE: should suggest WHERE, GROUP BY, ORDER BY after AS alias", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) RANGE FROM 1s TO 60s STEP 1s AS h ",
      )
      expect(labels).toContain("WHERE")
      expect(labels).toContain("GROUP")
      expect(labels).toContain("ORDER")
      expect(labels).toContain("LIMIT")
      expect(labels).toContain("SAMPLE")
    })

    it("HORIZON JOIN LIST: should suggest AS after closing paren", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) LIST (1s, 5s) ",
      )
      expect(labels).toContain("AS")
    })

    it("HORIZON JOIN LIST: should suggest WHERE, GROUP BY, ORDER BY after AS alias", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t HORIZON JOIN quotes q ON (symbol) LIST (1s, 5s) AS h ",
      )
      expect(labels).toContain("WHERE")
      expect(labels).toContain("GROUP")
      expect(labels).toContain("ORDER")
      expect(labels).toContain("LIMIT")
      expect(labels).toContain("SAMPLE")
    })

    it("should suggest join types including HORIZON JOIN after FROM table", () => {
      const labels = getLabelsAt(provider, "SELECT * FROM trades t ")
      expect(labels).toContain("HORIZON JOIN")
    })

    it("INNER JOIN: should suggest ON, not TOLERANCE/INCLUDE/EXCLUDE/RANGE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t INNER JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).not.toContain("TOLERANCE")
      expect(labels).not.toContain("INCLUDE")
      expect(labels).not.toContain("EXCLUDE")
      expect(labels).not.toContain("RANGE")
    })

    it("LEFT JOIN: should suggest ON, not TOLERANCE/INCLUDE/EXCLUDE/RANGE", () => {
      const labels = getLabelsAt(
        provider,
        "SELECT * FROM trades t LEFT JOIN quotes q ",
      )
      expect(labels).toContain("ON")
      expect(labels).not.toContain("TOLERANCE")
      expect(labels).not.toContain("INCLUDE")
      expect(labels).not.toContain("EXCLUDE")
      expect(labels).not.toContain("RANGE")
    })
  })
})

// =============================================================================
// LATERAL JOIN Autocomplete Tests
// =============================================================================

describe("LATERAL JOIN autocomplete", () => {
  it("should suggest tables after CROSS JOIN (before LATERAL)", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades CROSS JOIN ")
    expect(labels).toContain("trades")
    expect(labels).toContain("orders")
  })

  it("should suggest clauses after LATERAL JOIN subquery alias", () => {
    const labels = getLabelsAt(
      provider,
      "SELECT * FROM trades t CROSS JOIN LATERAL (SELECT * FROM orders) sub ",
    )
    expect(labels).toContain("WHERE")
    expect(labels).toContain("ORDER")
    expect(labels).toContain("GROUP")
  })

  describe("LATERAL JOIN walkthrough", () => {
    it("CROSS JOIN LATERAL walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT * FROM trades ",
          expects: ["JOIN", "CROSS JOIN", "LEFT JOIN"],
        },
        {
          typed:
            "SELECT * FROM trades t CROSS JOIN LATERAL (SELECT avg(price) FROM trades) sub ",
          expects: ["WHERE", "ORDER", "GROUP"],
        },
      ])
    })
  })
})

// =============================================================================
// UNNEST Autocomplete Tests
// =============================================================================

describe("UNNEST autocomplete", () => {
  it("should suggest UNNEST after FROM", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM ")
    expect(labels).toContain("UNNEST")
  })

  it("should suggest UNNEST after comma in FROM", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades, ")
    expect(labels).toContain("UNNEST")
  })

  it("should suggest WITH after UNNEST closing paren", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM UNNEST(ARRAY[1]) ")
    expect(labels).toContain("WITH")
  })

  it("should suggest ORDINALITY after UNNEST(...) WITH", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM UNNEST(ARRAY[1]) WITH ")
    expect(labels).toContain("ORDINALITY")
  })

  describe("UNNEST walkthrough", () => {
    it("UNNEST with ORDINALITY walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SELECT * FROM ",
          expects: ["UNNEST", "trades", "orders"],
        },
        {
          typed: "SELECT * FROM UNNEST(ARRAY[1, 2]) WITH ",
          expects: ["ORDINALITY"],
        },
        {
          typed: "SELECT * FROM UNNEST(ARRAY[1, 2]) WITH ORDINALITY ",
          expects: ["WHERE", "ORDER", "GROUP"],
        },
      ])
    })
  })

  it("should suggest clauses after UNNEST alias in comma-join", () => {
    const labels = getLabelsAt(
      provider,
      "SELECT * FROM trades t, UNNEST(ARRAY[1, 2]) u ",
    )
    expect(labels).toContain("WHERE")
    expect(labels).toContain("GROUP")
    expect(labels).toContain("ORDER")
  })

  it("should suggest COLUMNS after expression inside UNNEST", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM UNNEST(e.payload ")
    expect(labels).toContain("COLUMNS")
  })

  it("should suggest clauses after JSON UNNEST with COLUMNS alias", () => {
    const labels = getLabelsAt(
      provider,
      "SELECT * FROM events e, UNNEST(e.payload COLUMNS(price DOUBLE, name VARCHAR)) u ",
    )
    expect(labels).toContain("WHERE")
    expect(labels).toContain("ORDER")
    expect(labels).toContain("GROUP")
  })
})

// =============================================================================
// CREATE TABLE Autocomplete Tests (Chunk 4)
// =============================================================================

describe("CREATE TABLE autocomplete", () => {
  it("should suggest TABLE after CREATE", () => {
    const labels = getLabelsAt(provider, "CREATE ")
    expect(labels).toContain("TABLE")
  })

  it("should suggest IF and AS after table name and columns", () => {
    const labels = getLabelsAt(provider, "CREATE TABLE trades (ts TIMESTAMP) ")
    expect(labels).toContain("TIMESTAMP")
    expect(labels).toContain("PARTITION")
  })

  it("should suggest BY after PARTITION", () => {
    const labels = getLabelsAt(
      provider,
      "CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION ",
    )
    expect(labels).toContain("BY")
  })

  it("should suggest partition units after PARTITION BY", () => {
    const labels = getLabelsAt(
      provider,
      "CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY ",
    )
    expect(labels).toContain("DAY")
    expect(labels).toContain("HOUR")
    expect(labels).toContain("MONTH")
    expect(labels).toContain("YEAR")
  })

  it("should suggest WAL and TTL after PARTITION BY UNIT", () => {
    const labels = getLabelsAt(
      provider,
      "CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY ",
    )
    expect(labels).toContain("WAL")
    expect(labels).toContain("TTL")
  })

  it("should suggest PARQUET after column type in CREATE TABLE", () => {
    const labels = getLabelsAt(provider, "CREATE TABLE t (a INT ")
    expect(labels).toContain("PARQUET")
  })

  it("should suggest encoding options inside PARQUET()", () => {
    const labels = getLabelsAt(provider, "CREATE TABLE t (a INT PARQUET(")
    expect(labels).toContain("PLAIN")
    expect(labels).toContain("DELTA_BINARY_PACKED")
    expect(labels).toContain("BLOOM_FILTER")
    expect(labels).toContain("DEFAULT")
  })

  it("should suggest BLOOM_FILTER after PARQUET(encoding,", () => {
    const labels = getLabelsAt(
      provider,
      "CREATE TABLE t (a INT PARQUET(PLAIN, ",
    )
    expect(labels).toContain("BLOOM_FILTER")
    expect(labels).toContain("SNAPPY")
    expect(labels).toContain("ZSTD")
  })

  describe("CREATE VIEW walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "CREATE ",
          expects: ["TABLE", "VIEW"],
        },
        {
          typed: "CREATE VIEW my_view ",
          expects: ["AS"],
        },
        {
          typed: "CREATE OR ",
          expects: ["REPLACE"],
        },
        {
          typed: "CREATE OR REPLACE ",
          expects: ["VIEW"],
        },
      ])
    })
  })

  describe("DROP VIEW walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "DROP ",
          expects: ["TABLE", "VIEW"],
        },
        {
          typed: "DROP VIEW ",
          expects: ["IF"],
        },
      ])
    })
  })

  describe("SHOW walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "SHOW ",
          expects: ["TABLES", "COLUMNS", "CREATE", "PARAMETERS"],
        },
        {
          typed: "SHOW CREATE ",
          expects: ["TABLE", "VIEW", "MATERIALIZED"],
        },
      ])
    })
  })

  describe("CREATE TABLE walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "CREATE ",
          expects: ["TABLE"],
          rejects: ["SELECT"],
        },
        {
          typed:
            "CREATE TABLE trades (ts TIMESTAMP, symbol SYMBOL, price DOUBLE) ",
          expects: ["TIMESTAMP", "PARTITION"],
        },
        {
          typed: "CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) ",
          expects: ["PARTITION"],
        },
        {
          typed: "CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION ",
          expects: ["BY"],
        },
        {
          typed:
            "CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY ",
          expects: ["DAY", "HOUR", "MONTH", "YEAR", "WEEK", "NONE"],
        },
      ])
    })
  })
})

// =============================================================================
// Materialized View Autocomplete Tests (Chunk 9)
// =============================================================================

describe("Materialized View autocomplete", () => {
  describe("CREATE MATERIALIZED VIEW walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "CREATE ",
          expects: ["TABLE", "VIEW", "MATERIALIZED"],
        },
        {
          typed: "CREATE MATERIALIZED ",
          expects: ["VIEW"],
        },
      ])
    })
  })

  describe("DROP MATERIALIZED VIEW walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "DROP ",
          expects: ["TABLE", "VIEW", "MATERIALIZED"],
        },
        {
          typed: "DROP MATERIALIZED ",
          expects: ["VIEW"],
        },
      ])
    })
  })

  describe("REFRESH MATERIALIZED VIEW walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "REFRESH ",
          expects: ["MATERIALIZED"],
        },
        {
          typed: "REFRESH MATERIALIZED ",
          expects: ["VIEW"],
        },
      ])
    })
  })
})

// =============================================================================
// User/Auth Autocomplete Tests (Chunk 10)
// =============================================================================

describe("User/Auth autocomplete", () => {
  describe("CREATE USER walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "CREATE ",
          expects: ["USER", "GROUP", "SERVICE"],
        },
        {
          typed: "CREATE SERVICE ",
          expects: ["ACCOUNT"],
        },
      ])
    })
  })

  describe("GRANT walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "GRANT ",
          expects: ["SELECT", "INSERT", "UPDATE", "ALL"],
        },
      ])
    })
  })

  describe("REVOKE walkthrough", () => {
    it("should provide correct suggestions at each word boundary", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "REVOKE ",
          expects: ["SELECT", "INSERT", "UPDATE", "ALL"],
        },
      ])
    })
  })
})

// =============================================================================
// Administrative Operations Autocomplete Tests (Chunk 11)
// =============================================================================

describe("Admin operations autocomplete", () => {
  it("should suggest QUERY after CANCEL", () => {
    const labels = getLabelsAt(provider, "CANCEL ")
    expect(labels).toContain("QUERY")
  })

  it("should suggest TABLE after VACUUM", () => {
    const labels = getLabelsAt(provider, "VACUUM ")
    expect(labels).toContain("TABLE")
  })

  it("should suggest PREPARE and COMPLETE after SNAPSHOT", () => {
    const labels = getLabelsAt(provider, "SNAPSHOT ")
    expect(labels).toContain("PREPARE")
    expect(labels).toContain("COMPLETE")
  })

  it("should suggest WAL after RESUME", () => {
    const labels = getLabelsAt(provider, "RESUME ")
    expect(labels).toContain("WAL")
  })

  it("should suggest TABLE after REINDEX", () => {
    const labels = getLabelsAt(provider, "REINDEX ")
    expect(labels).toContain("TABLE")
  })

  it("should suggest CREATE and RELEASE after CHECKPOINT", () => {
    const labels = getLabelsAt(provider, "CHECKPOINT ")
    expect(labels).toContain("CREATE")
    expect(labels).toContain("RELEASE")
  })
})

// =============================================================================
// DECLARE & EXPLAIN Autocomplete Tests (Chunk 13)
// =============================================================================

describe("DECLARE autocomplete", () => {
  it("should suggest DECLARE as a valid statement start", () => {
    const labels = getLabelsAt(provider, "")
    expect(labels).toContain("DECLARE")
  })
})

describe("EXPLAIN autocomplete", () => {
  it("should suggest EXPLAIN as a valid statement start", () => {
    const labels = getLabelsAt(provider, "")
    expect(labels).toContain("EXPLAIN")
  })

  it("should suggest SELECT after EXPLAIN", () => {
    const labels = getLabelsAt(provider, "EXPLAIN ")
    expect(labels).toContain("SELECT")
  })
})

// =============================================================================
// Bitwise operators should NOT appear as keyword suggestions
// =============================================================================

describe("Bitwise operator token classification", () => {
  it("should not suggest bitwise operators as keywords in WHERE", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE price ")
    expect(labels).not.toContain("&")
    expect(labels).not.toContain("^")
    expect(labels).not.toContain("|")
    expect(labels).not.toContain("BIT AND")
    expect(labels).not.toContain("BIT XOR")
    expect(labels).not.toContain("BIT OR")
  })

  it("should suggest WITHIN as a keyword in WHERE", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE price ")
    expect(labels).toContain("WITHIN")
  })
})

// =============================================================================
// Expression Autocomplete Tests
// =============================================================================

describe("Expression autocomplete", () => {
  it("should suggest expression keywords after WHERE", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE ")
    expect(labels).toContain("NOT")
    expect(labels).toContain("CAST")
    expect(labels).toContain("CASE")
    // Columns should be suggested for expression context
    expect(labels).toContain("symbol")
    expect(labels).toContain("price")
  })

  it("should suggest clauses after GROUP BY expression", () => {
    // After GROUP BY column, the parser sees expression continuation tokens
    const labels = getLabelsAt(
      provider,
      "SELECT symbol, count() FROM trades GROUP BY symbol ",
    )
    expect(labels).toContain("ORDER")
  })

  it("should suggest AND/OR in WHERE clause after comparison", () => {
    const labels = getLabelsAt(
      provider,
      "SELECT * FROM trades WHERE price > 100 ",
    )
    expect(labels).toContain("AND")
    expect(labels).toContain("OR")
  })

  it("should suggest NOT after WHERE", () => {
    const labels = getLabelsAt(provider, "SELECT * FROM trades WHERE ")
    expect(labels).toContain("NOT")
  })
})

describe("Implicit SELECT autocomplete", () => {
  it("should suggest columns for incomplete implicit select in multi-statement context", () => {
    const labels = getLabelsAt(provider, "SELECT 1; trades WHERE ")
    // Should get suggestions even after semicolon with implicit select
    expect(labels.length).toBeGreaterThan(0)
  })

  // ---------------------------------------------------------------------------
  // Statement start: keywords + tables both suggested (shorthand form enabled)
  // ---------------------------------------------------------------------------

  describe("at statement start", () => {
    it("suggests both top-level keywords and table names at empty buffer", () => {
      const labels = getLabelsAt(provider, "")
      // Top-level statement keywords
      expect(labels).toContain("SELECT")
      expect(labels).toContain("INSERT")
      expect(labels).toContain("UPDATE")
      expect(labels).toContain("CREATE")
      expect(labels).toContain("DROP")
      expect(labels).toContain("ALTER")
      expect(labels).toContain("EXPLAIN")
      expect(labels).toContain("WITH")
      expect(labels).toContain("DECLARE")
      expect(labels).toContain("TRUNCATE")
      expect(labels).toContain("VACUUM")
      // Tables for implicit select / pivot shorthand
      expect(labels).toContain("trades")
      expect(labels).toContain("orders")
      expect(labels).toContain("users")
    })

    it("ranks tables lower than keywords (MediumLow vs Medium)", () => {
      const suggestions = provider.getSuggestions("", 0)
      const select = suggestions.find((s) => s.label === "SELECT")
      const trades = suggestions.find((s) => s.label === "trades")
      expect(select).toBeDefined()
      expect(trades).toBeDefined()
      // Lower priority value = sorts higher. Keywords should sort above tables.
      expect(select!.priority).toBeLessThan(trades!.priority)
    })

    it("suggests tables as Table kind at statement start", () => {
      const tables = getSuggestionsOfKind(provider, "", SuggestionKind.Table)
      const labels = tables.map((s) => s.label).sort()
      expect(labels).toEqual(["orders", "trades", "users"])
    })
  })

  // ---------------------------------------------------------------------------
  // Full walkthrough: bare table → WHERE → SAMPLE BY → ORDER BY → LIMIT → UNION
  // ---------------------------------------------------------------------------

  describe("clause-by-clause walkthrough", () => {
    it("after bare table name, suggests all clause starters", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades ",
          expects: [
            "WHERE",
            "SAMPLE",
            "LATEST",
            "GROUP",
            "ORDER",
            "LIMIT",
            "UNION",
            "INTERSECT",
            "EXCEPT",
            "PIVOT",
            "JOIN",
            "LEFT JOIN",
            "INNER JOIN",
            "CROSS JOIN",
            "ASOF JOIN",
            "LT JOIN",
            "SPLICE JOIN",
            "AS",
            "TIMESTAMP",
          ],
          // No columns or top-level statement keywords here
          rejects: ["symbol", "price", "SELECT", "INSERT", "CREATE"],
        },
      ])
    })

    it("WHERE clause walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades WHERE ",
          // Columns + expression starters
          expects: [
            "symbol",
            "price",
            "amount",
            "timestamp",
            "CASE",
            "CAST",
            "NOT",
            "NULL",
            "TRUE",
            "FALSE",
          ],
          rejects: ["WHERE", "SELECT"],
        },
        {
          typed: "trades WHERE price ",
          // Comparison/predicate operators
          expects: ["BETWEEN", "IN", "LIKE", "ILIKE", "IS", "NOT"],
        },
        {
          typed: "trades WHERE price > 1 ",
          // Boolean continuation + PIVOT (since WHERE can precede PIVOT)
          expects: ["AND", "OR", "PIVOT"],
        },
        {
          typed: "trades WHERE price > 1 AND ",
          // Back to expression start
          expects: ["symbol", "price", "NOT", "CASE"],
          rejects: ["WHERE"],
        },
      ])
    })

    it("SAMPLE BY walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        { typed: "trades SAMPLE ", expects: ["BY"], rejects: ["WHERE"] },
        {
          typed: "trades SAMPLE BY 1h ",
          // After SAMPLE BY interval: modifiers and downstream clauses
          expects: [
            "ALIGN",
            "FILL",
            "FROM",
            "TO",
            "GROUP",
            "ORDER",
            "LIMIT",
            "UNION",
            "EXCEPT",
            "INTERSECT",
          ],
        },
      ])
    })

    it("LATEST ON walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades LATEST ",
          // LATEST ON and LATEST BY + clause continuation
          expects: ["ON", "BY"],
        },
        {
          typed: "trades LATEST ON ",
          expects: ["symbol", "price", "timestamp"],
          rejects: ["WHERE", "SELECT"],
        },
        {
          typed: "trades LATEST ON timestamp ",
          expects: ["PARTITION"],
        },
      ])
    })

    it("GROUP BY walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        { typed: "trades GROUP ", expects: ["BY"] },
        {
          typed: "trades GROUP BY ",
          expects: ["symbol", "price", "CASE", "CAST", "NOT"],
        },
      ])
    })

    it("ORDER BY walkthrough", () => {
      assertSuggestionsWalkthrough(provider, [
        { typed: "trades ORDER ", expects: ["BY"] },
        {
          typed: "trades ORDER BY ",
          expects: ["symbol", "price", "CASE", "CAST", "NOT"],
        },
        {
          typed: "trades ORDER BY price ",
          // Direction + downstream clauses + set operations
          expects: ["ASC", "DESC", "LIMIT", "UNION", "INTERSECT", "EXCEPT"],
        },
        {
          typed: "trades ORDER BY price ASC ",
          expects: ["LIMIT", "UNION", "INTERSECT", "EXCEPT"],
          rejects: ["ASC", "DESC"],
        },
      ])
    })

    it("LIMIT walkthrough", () => {
      // LIMIT/OFFSET expect a numeric literal — schema and functions are not
      // useful here. Position is classified as "numeric" → no column / table /
      // function suggestions.
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades LIMIT ",
          expects: [],
          rejects: ["symbol", "price", "max", "count", "materialized_views"],
        },
        {
          typed: "trades LIMIT 10, ",
          expects: [],
          rejects: ["symbol", "price", "max", "count"],
        },
      ])
    })

    it("UNION / INTERSECT / EXCEPT suggests set-op body starters", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades UNION ",
          // ALL modifier + explicit SELECT body + implicit bare table
          expects: ["ALL", "SELECT", "trades", "orders", "users"],
        },
        {
          typed: "trades UNION ALL ",
          expects: ["SELECT", "trades", "orders"],
          rejects: ["ALL"],
        },
        {
          typed: "trades INTERSECT ",
          expects: ["ALL", "SELECT", "trades"],
        },
        {
          typed: "trades EXCEPT ",
          expects: ["ALL", "SELECT", "trades"],
        },
      ])
    })

    it("comma-separated sources suggest another table reference", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades, ",
          expects: ["trades", "orders", "users", "LATERAL"],
          rejects: ["WHERE", "SELECT"],
        },
      ])
    })

    it("alias (explicit AS and implicit) does not break continuation", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades AS t ",
          expects: ["WHERE", "ORDER", "GROUP", "LIMIT", "JOIN"],
        },
        {
          typed: "trades t ",
          expects: ["WHERE", "ORDER", "GROUP", "LIMIT", "JOIN"],
        },
      ])
    })
  })
})

// =============================================================================
// PIVOT autocomplete walkthrough
// =============================================================================

describe("PIVOT autocomplete walkthrough", () => {
  describe("pivot over a bare table", () => {
    it("suggests PIVOT alongside other clauses after bare table", () => {
      const labels = getLabelsAt(provider, "trades ")
      expect(labels).toContain("PIVOT")
    })

    it("suggests opening paren after PIVOT keyword", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT ",
          expects: ["("],
        },
      ])
    })

    it("suggests aggregation expression tokens inside PIVOT (", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (",
          expects: ["CASE", "CAST", "NOT", "TRUE", "FALSE", "NULL"],
        },
      ])
    })

    it("suggests FOR/AS and expression continuation after aggregation", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) ",
          expects: [
            "FOR",
            "AS",
            "AND",
            "OR",
            "BETWEEN",
            "IN",
            "LIKE",
            "ILIKE",
            "IS",
            "NOT",
            "OVER",
            "IGNORE",
            "RESPECT",
            "WITHIN",
          ],
        },
      ])
    })

    it("suggests FOR after aggregation with AS alias", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) AS total ",
          expects: ["FOR"],
        },
      ])
    })

    it("suggests pivot column identifiers after FOR", () => {
      const labels = getLabelsAt(provider, "trades PIVOT (sum(price) FOR ")
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("amount")
      expect(labels).toContain("timestamp")
    })

    it("suggests IN after FOR column", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) FOR symbol ",
          expects: ["IN"],
        },
      ])
    })

    it("suggests subquery starters and literals inside FOR ... IN (", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) FOR symbol IN (",
          expects: [
            "SELECT",
            "WITH",
            "DECLARE",
            "CASE",
            "CAST",
            "TRUE",
            "FALSE",
            "NULL",
            "NOT",
          ],
        },
      ])
    })

    it("suggests another FOR or GROUP BY after closing a single IN clause", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) FOR symbol IN ('BTC') ",
          expects: ["FOR", "GROUP"],
        },
      ])
    })

    it("GROUP BY walkthrough inside PIVOT", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) FOR symbol IN ('BTC') GROUP ",
          expects: ["BY"],
        },
        {
          typed: "trades PIVOT (sum(price) FOR symbol IN ('BTC') GROUP BY ",
          expects: ["CASE", "CAST", "NOT", "symbol", "price"],
        },
      ])
    })

    it("suggests ORDER/LIMIT/AS after closing PIVOT ))", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades PIVOT (sum(price) FOR symbol IN ('BTC')) ",
          expects: ["ORDER", "LIMIT", "AS"],
        },
      ])
    })
  })

  describe("pivot with WHERE clause before PIVOT", () => {
    it("suggests PIVOT after WHERE predicate", () => {
      const labels = getLabelsAt(provider, "trades WHERE price > 100 ")
      expect(labels).toContain("PIVOT")
    })

    it("suggests ( after WHERE ... PIVOT", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "trades WHERE price > 100 PIVOT ",
          expects: ["("],
        },
      ])
    })
  })

  describe("pivot over a parenthesized subquery", () => {
    it("suggests PIVOT (and WHERE) after (SELECT ...)", () => {
      assertSuggestionsWalkthrough(provider, [
        {
          typed: "(SELECT * FROM trades) ",
          expects: ["PIVOT", "WHERE"],
        },
      ])
    })
  })
})

describe("CTE autocomplete", () => {
  // ---------------------------------------------------------------------------
  // Basic CTE suggestions
  // ---------------------------------------------------------------------------
  it("should suggest CTE name as table in FROM position", () => {
    const sql = "WITH cte AS (SELECT symbol FROM trades) SELECT * FROM "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("cte")
  })

  it("should suggest CTE columns in SELECT position", () => {
    const sql =
      "WITH cte AS (SELECT symbol, price FROM trades) SELECT  FROM cte"
    const cursorOffset = sql.indexOf(" FROM cte")
    const labels = getLabelsAt(provider, sql, cursorOffset)
    expect(labels).toContain("symbol")
    expect(labels).toContain("price")
  })

  it("should suggest aliased CTE columns", () => {
    const sql =
      "WITH cte AS (SELECT symbol AS sym, price AS p FROM trades) SELECT  FROM cte"
    const cursorOffset = sql.indexOf(" FROM cte")
    const labels = getLabelsAt(provider, sql, cursorOffset)
    expect(labels).toContain("sym")
    expect(labels).toContain("p")
  })

  it("should suggest columns from multiple CTEs", () => {
    const sql =
      "WITH a AS (SELECT symbol FROM trades), b AS (SELECT id FROM orders) SELECT  FROM a, b"
    const cursorOffset = sql.indexOf(" FROM a, b")
    const labels = getLabelsAt(provider, sql, cursorOffset)
    expect(labels).toContain("symbol")
    expect(labels).toContain("id")
  })

  it("should suggest both CTE names as tables", () => {
    const sql = "WITH a AS (SELECT 1), b AS (SELECT 2) SELECT * FROM "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("a")
    expect(labels).toContain("b")
  })

  // ---------------------------------------------------------------------------
  // Doc: with.md — Multiple CTEs referencing each other
  // ---------------------------------------------------------------------------
  it("should suggest both CTE names when second references first", () => {
    const sql =
      "WITH first_10 AS (SELECT * FROM users LIMIT 10), first_5 AS (SELECT * FROM first_10 LIMIT 5) SELECT  FROM "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("first_10")
    expect(labels).toContain("first_5")
  })

  // ---------------------------------------------------------------------------
  // Doc: with.md — CTE with CROSS JOIN
  // ---------------------------------------------------------------------------
  it("should suggest CTE aliased column in SELECT with CROSS JOIN", () => {
    const sql =
      "WITH avg_price AS (SELECT avg(price) AS average FROM trades) SELECT  FROM trades CROSS JOIN avg_price"
    // Use "SELECT  FROM" (double space) to target the outer query gap, not the CTE body
    const offset = sql.indexOf("SELECT  FROM") + "SELECT ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("average")
    expect(cols).toContain("symbol")
    expect(cols).toContain("price")
  })

  it("should suggest CTE name in CROSS JOIN position", () => {
    const sql =
      "WITH avg_price AS (SELECT avg(price) AS average FROM trades) SELECT timestamp FROM trades CROSS JOIN "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("avg_price")
  })

  // ---------------------------------------------------------------------------
  // Doc: with.md — CTE with UPDATE and INSERT
  // ---------------------------------------------------------------------------
  it("should suggest UPDATE, SELECT, INSERT after CTE definition", () => {
    const sql = "WITH up AS (SELECT symbol FROM trades) "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("UPDATE")
    expect(labels).toContain("SELECT")
    expect(labels).toContain("INSERT")
  })

  it("should NOT suggest WITH or DECLARE after CTE definition", () => {
    // Multiple CTEs use comma separation, not chained WITH keywords.
    // DECLARE can only appear before WITH, not after it.
    const sql = "WITH x AS (SELECT 1) "
    const labels = getLabelsAt(provider, sql)
    expect(labels).not.toContain("WITH")
    expect(labels).not.toContain("DECLARE")
  })

  it("should suggest comma for additional CTEs after CTE definition", () => {
    // WITH x AS (...), y AS (...) — comma separates CTEs
    const sql = "WITH x AS (SELECT 1) , y AS (SELECT 2) "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("SELECT")
  })

  it("should allow DECLARE before WITH at statement level", () => {
    const sql = "DECLARE @y := 10 WITH x AS (SELECT @y) "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("SELECT")
  })

  it("should allow DECLARE inside CTE subquery", () => {
    const sql = "WITH x AS (DECLARE @y := 10 SELECT @y) "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("SELECT")
  })

  // ---------------------------------------------------------------------------
  // Doc: bollinger-bands.md — Multi-CTE with window function aliases
  // ---------------------------------------------------------------------------
  it("should suggest first CTE columns inside second CTE SELECT", () => {
    const ohlcCte =
      "WITH OHLC AS (SELECT timestamp, symbol, first(price) AS open, max(price) AS high, min(price) AS low, last(price) AS close, sum(amount) AS volume FROM trades SAMPLE BY 15m)"
    const sql = `${ohlcCte}, stats AS (SELECT  FROM OHLC)`
    const offset = ohlcCte.length + ", stats AS (SELECT ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("close")
    expect(cols).toContain("timestamp")
  })

  it("should suggest second CTE columns in final SELECT", () => {
    const sql =
      "WITH OHLC AS (SELECT timestamp, last(price) AS close FROM trades SAMPLE BY 15m), stats AS (SELECT timestamp, close, AVG(close) OVER (ORDER BY timestamp ROWS 19 PRECEDING) AS sma20 FROM OHLC) SELECT  FROM stats"
    const offset = sql.indexOf(" FROM stats")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("timestamp")
    expect(cols).toContain("close")
    expect(cols).toContain("sma20")
  })

  it("should suggest first CTE as table in second CTE FROM", () => {
    const sql =
      "WITH OHLC AS (SELECT timestamp, last(price) AS close FROM trades SAMPLE BY 15m), stats AS (SELECT close FROM "
    const labels = getLabelsAt(provider, sql)
    expect(labels).toContain("OHLC")
  })

  // ---------------------------------------------------------------------------
  // Doc: top-n-plus-others.md — Three-CTE chain
  // ---------------------------------------------------------------------------
  it("should suggest columns from three-CTE chain", () => {
    const sql =
      "WITH totals AS (SELECT symbol, count() AS total FROM trades), ranked AS (SELECT symbol, total, rank() OVER (ORDER BY total DESC) AS ranking FROM totals) SELECT  FROM ranked"
    const offset = sql.indexOf(" FROM ranked")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
    expect(cols).toContain("total")
    expect(cols).toContain("ranking")
  })

  // ---------------------------------------------------------------------------
  // Doc: aggressor-volume-imbalance.md — CTE with CASE+SUM aliases
  // ---------------------------------------------------------------------------
  it("should suggest CASE/SUM aliased CTE columns", () => {
    const sql =
      "WITH volumes AS (SELECT symbol, SUM(CASE WHEN side = 'buy' THEN amount ELSE 0 END) AS buy_volume, SUM(CASE WHEN side = 'sell' THEN amount ELSE 0 END) AS sell_volume FROM trades) SELECT  FROM volumes"
    const offset = sql.indexOf(" FROM volumes")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
    expect(cols).toContain("buy_volume")
    expect(cols).toContain("sell_volume")
  })

  // ---------------------------------------------------------------------------
  // Doc: latest-n-per-partition.md — CTE columns in WHERE clause
  // ---------------------------------------------------------------------------
  it("should suggest CTE columns in WHERE position", () => {
    const sql =
      "WITH ranked AS (SELECT timestamp, symbol, price, row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) AS rn FROM trades) SELECT symbol, price FROM ranked WHERE "
    const suggestions = provider.getSuggestions(sql, sql.length)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("rn")
    expect(cols).toContain("symbol")
    expect(cols).toContain("price")
  })

  // ---------------------------------------------------------------------------
  // Doc: volume-spike.md — Chained CTEs
  // ---------------------------------------------------------------------------
  it("should suggest columns from chained CTEs", () => {
    const sql =
      "WITH candles AS (SELECT timestamp, symbol, sum(amount) AS volume FROM trades SAMPLE BY 30s), prev_volumes AS (SELECT timestamp, symbol, volume, LAG(volume) OVER (PARTITION BY symbol ORDER BY timestamp) AS prev_volume FROM candles) SELECT  FROM prev_volumes"
    const offset = sql.indexOf(" FROM prev_volumes")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("timestamp")
    expect(cols).toContain("symbol")
    expect(cols).toContain("volume")
    expect(cols).toContain("prev_volume")
  })

  // ---------------------------------------------------------------------------
  // Doc: rolling-stddev.md — CTE with window function aliases
  // ---------------------------------------------------------------------------
  it("should suggest window function aliased columns from CTE", () => {
    const sql =
      "WITH stats AS (SELECT timestamp, symbol, price, AVG(price) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_avg, AVG(price * price) OVER (PARTITION BY symbol ORDER BY timestamp) AS rolling_avg_sq FROM trades) SELECT  FROM stats"
    const offset = sql.indexOf(" FROM stats")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("timestamp")
    expect(cols).toContain("symbol")
    expect(cols).toContain("price")
    expect(cols).toContain("rolling_avg")
    expect(cols).toContain("rolling_avg_sq")
  })

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  it("CTE columns in GROUP BY position", () => {
    const sql =
      "WITH totals AS (SELECT symbol, count() AS total FROM trades) SELECT symbol, total FROM totals GROUP BY "
    const suggestions = provider.getSuggestions(sql, sql.length)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
    expect(cols).toContain("total")
  })

  it("CTE columns in ORDER BY position", () => {
    const sql =
      "WITH totals AS (SELECT symbol, count() AS total FROM trades) SELECT symbol, total FROM totals ORDER BY "
    const suggestions = provider.getSuggestions(sql, sql.length)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
    expect(cols).toContain("total")
  })

  it("CTE columns with mid-word prefix filtering", () => {
    const sql =
      "WITH cte AS (SELECT symbol, price FROM trades) SELECT sy FROM cte"
    const offset = sql.indexOf("sy") + 2
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
  })

  it("CTE with mixed bare columns and function aliases", () => {
    const sql =
      "WITH cte AS (SELECT symbol, avg(price) AS avg_price FROM trades) SELECT  FROM cte"
    const offset = sql.indexOf(" FROM cte")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
    expect(cols).toContain("avg_price")
  })

  it("CTE with literal-only select should not crash", () => {
    const sql = "WITH cte AS (SELECT 1, 'hello') SELECT  FROM cte"
    const offset = sql.indexOf(" FROM cte")
    // Should not crash, just might not have column suggestions
    const labels = getLabelsAt(provider, sql, offset)
    expect(labels.length).toBeGreaterThan(0)
  })

  it("CTE with SELECT * should fallback to schema columns", () => {
    const sql = "WITH cte AS (SELECT * FROM users LIMIT 10) SELECT  FROM cte"
    const offset = sql.indexOf(" FROM cte")
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    // Can't extract columns from SELECT *, should fallback to all schema columns
    expect(cols.length).toBeGreaterThan(0)
  })

  it("should suggest identifier after comma between CTEs", () => {
    const sql = "WITH cte AS (SELECT * FROM users LIMIT 10), "
    const labels = getLabelsAt(provider, sql)
    // This position expects a new CTE name — the grammar correctly identifies
    // it as a newName position (not a column or table reference).
    // No column/table suggestions expected; the user types a free-form name.
    expect(labels.every((l) => l !== "symbol" && l !== "price")).toBe(true)
  })

  it("should not leak inner CTE source table columns into outer scope", () => {
    // CTE selects only "id" from orders. "status" is an orders column
    // but should NOT appear in outer suggestions since orders is not
    // in the outer FROM — only "cte" is.
    const sql =
      "WITH cte AS (SELECT id AS order_id FROM orders) SELECT  FROM cte"
    const offset = sql.indexOf(" FROM cte")
    const cols = provider
      .getSuggestions(sql, offset)
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("order_id")
    expect(cols).not.toContain("status")
  })

  it("should not produce duplicate CTE table suggestions", () => {
    const sql = "WITH cte AS (SELECT symbol FROM trades) SELECT * FROM "
    const tables = provider
      .getSuggestions(sql, sql.length)
      .filter((s) => s.kind === SuggestionKind.Table)
      .map((s) => s.label)
    const cteCount = tables.filter((l) => l === "cte").length
    expect(cteCount).toBe(1)
  })

  // ---------------------------------------------------------------------------
  // Regression: alias position / CTE scope fixes
  // ---------------------------------------------------------------------------

  it("should NOT suggest columns after WITH name AS ( — subquery start", () => {
    const sql = "WITH something AS ( ) SELECT * FROM something"
    const offset = sql.indexOf("(") + 2 // cursor inside the paren
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toEqual([])
    // Should still suggest keywords like SELECT
    const kws = suggestions.map((s) => s.label)
    expect(kws).toContain("SELECT")
  })

  it("should NOT self-reference CTE columns inside its own body", () => {
    const sql =
      "WITH something AS (SELECT symbol FROM trades) SELECT symbol FROM something"
    // Cursor inside CTE body after "SELECT symbol "
    const offset = sql.indexOf("SELECT symbol") + "SELECT symbol ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const colDetails = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => ({ label: s.label, detail: s.detail }))
    // CTE "something" should not self-reference
    for (const col of colDetails) {
      expect(col.detail ?? "").not.toContain("something")
    }
    const tables = suggestions
      .filter((s) => s.kind === SuggestionKind.Table)
      .map((s) => s.label)
    expect(tables).not.toContain("something")
  })

  it("should NOT suggest columns after identifier without comma (alias position)", () => {
    const sql = "SELECT symbol FROM trades"
    const offset = "SELECT symbol ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toEqual([])
    // Should suggest FROM and other keywords
    const kws = suggestions.map((s) => s.label)
    expect(kws).toContain("FROM")
  })

  it("should suggest columns after comma in select list", () => {
    const sql = "SELECT symbol, FROM trades"
    const offset = "SELECT symbol, ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toContain("symbol")
    expect(cols).toContain("price")
  })

  it("should suggest columns inside CTE body from inner FROM table", () => {
    const sql = "WITH cte AS (SELECT  FROM trades) SELECT * FROM cte"
    const offset = sql.indexOf("SELECT  FROM") + "SELECT ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    // Should see trades columns, not CTE self-reference
    expect(cols).toContain("symbol")
    expect(cols).toContain("price")
  })

  it("should NOT suggest columns after RParen (alias/keyword position)", () => {
    const sql = "SELECT count(*) FROM trades"
    const offset = "SELECT count(*) ".length
    const suggestions = provider.getSuggestions(sql, offset)
    const cols = suggestions
      .filter((s) => s.kind === SuggestionKind.Column)
      .map((s) => s.label)
    expect(cols).toEqual([])
    const kws = suggestions.map((s) => s.label)
    expect(kws).toContain("FROM")
  })

  // ---------------------------------------------------------------------------
  // Qualified column references: alias/table filtering in JOINs
  // ---------------------------------------------------------------------------

  describe("qualified column references with aliases", () => {
    it("t1. in JOIN WHERE should only suggest aliased table columns", () => {
      const sql =
        "SELECT * FROM trades t1 JOIN orders t2 ON t1.symbol = t2.id WHERE t1."
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // t1 = trades
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("amount")
      expect(labels).toContain("timestamp")
      // Should NOT include orders columns
      expect(labels).not.toContain("id")
      expect(labels).not.toContain("status")
    })

    it("t2. in JOIN WHERE should only suggest aliased table columns", () => {
      const sql =
        "SELECT * FROM trades t1 JOIN orders t2 ON t1.symbol = t2.id WHERE t2."
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // t2 = orders
      expect(labels).toContain("id")
      expect(labels).toContain("status")
      // Should NOT include trades columns
      expect(labels).not.toContain("symbol")
      expect(labels).not.toContain("price")
    })

    it("table name (not alias) before dot should filter in JOIN", () => {
      const sql =
        "SELECT * FROM trades JOIN orders ON trades.symbol = orders.id WHERE trades."
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).not.toContain("id")
      expect(labels).not.toContain("status")
    })

    it("mid-word after alias dot should filter by alias table", () => {
      const sql =
        "SELECT * FROM trades t1 JOIN orders t2 ON t1.symbol = t2.id WHERE t1.s"
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // t1 = trades, so only trades columns should appear
      expect(labels).toContain("symbol")
      // "status" is from orders (t2)
      expect(labels).not.toContain("status")
    })

    it("qualified ref in SELECT list should filter in JOIN", () => {
      const sql =
        "SELECT t1. FROM trades t1 JOIN orders t2 ON t1.symbol = t2.id"
      const offset = sql.indexOf("t1.") + 3
      const cols = getSuggestionsOfKind(
        provider,
        sql,
        SuggestionKind.Column,
        offset,
      )
      const labels = cols.map((s) => s.label)
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).not.toContain("id")
      expect(labels).not.toContain("status")
    })

    it("CTE qualified ref should only suggest that CTE's columns", () => {
      const sql =
        "WITH a AS (SELECT symbol FROM trades), b AS (SELECT id FROM orders) SELECT a. FROM a, b"
      const offset = sql.indexOf("a.") + 2
      const cols = getSuggestionsOfKind(
        provider,
        sql,
        SuggestionKind.Column,
        offset,
      )
      const labels = cols.map((s) => s.label)
      // CTE "a" only has "symbol"
      expect(labels).toContain("symbol")
      // CTE "b" has "id" — should NOT appear for a.
      expect(labels).not.toContain("id")
    })

    it("single table with alias should still show its columns (no regression)", () => {
      const sql = "SELECT * FROM trades t WHERE t."
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("amount")
      expect(labels).toContain("timestamp")
    })

    it("unqualified position should still show all columns from all tables", () => {
      const sql =
        "SELECT * FROM trades t1 JOIN orders t2 ON t1.symbol = t2.id WHERE "
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // Unqualified — should include columns from both tables
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("id")
      expect(labels).toContain("status")
    })

    it("ASOF JOIN alias should filter correctly", () => {
      const sql =
        "SELECT t. FROM trades t ASOF JOIN orders o ON t.symbol = o.id"
      const offset = sql.indexOf("t.") + 2
      const cols = getSuggestionsOfKind(
        provider,
        sql,
        SuggestionKind.Column,
        offset,
      )
      const labels = cols.map((s) => s.label)
      expect(labels).toContain("symbol")
      expect(labels).not.toContain("id")
    })

    it("three-table JOIN: each alias resolves to the correct table", () => {
      const sql =
        "SELECT * FROM trades t JOIN orders o ON t.symbol = o.id JOIN users u ON o.status = u.name WHERE u."
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // u = users
      expect(labels).toContain("name")
      expect(labels).toContain("email")
      // Should NOT include trades or orders columns
      expect(labels).not.toContain("symbol")
      expect(labels).not.toContain("price")
      expect(labels).not.toContain("id")
      expect(labels).not.toContain("status")
    })
  })

  // ---------------------------------------------------------------------------
  // Ambiguous columns: same table joined with different aliases
  // ---------------------------------------------------------------------------

  describe("ambiguous column qualification in self-joins", () => {
    it("self-join should suggest alias-qualified columns", () => {
      const sql =
        "SELECT * FROM trades t1 INNER JOIN trades t2 ON symbol WHERE "
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // Both t1 and t2 point to "trades", so columns are ambiguous.
      // Should emit qualified names like t1.symbol, t2.symbol.
      expect(labels).toContain("t1.symbol")
      expect(labels).toContain("t2.symbol")
      expect(labels).toContain("t1.price")
      expect(labels).toContain("t2.price")
      // Should NOT emit bare unqualified names
      expect(labels).not.toContain("symbol")
      expect(labels).not.toContain("price")
      expect(labels).not.toContain("amount")
    })

    it("self-join insertText should include alias qualifier", () => {
      const sql =
        "SELECT * FROM trades t1 INNER JOIN trades t2 ON symbol WHERE "
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const insertTexts = cols.map((s) => s.insertText)
      expect(insertTexts).toContain("t1.symbol")
      expect(insertTexts).toContain("t2.symbol")
    })

    it("self-join with qualified ref should still filter to one alias", () => {
      const sql =
        "SELECT * FROM trades t1 INNER JOIN trades t2 ON t1.symbol = t2.symbol WHERE t1."
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // t1. qualifier → only trades columns for t1
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("amount")
      expect(labels).toContain("timestamp")
      // Should be bare names (only one source after filtering)
      expect(labels).not.toContain("t1.symbol")
      expect(labels).not.toContain("t2.symbol")
    })

    it("different tables with no shared columns should remain unqualified", () => {
      const sql =
        "SELECT * FROM trades t1 JOIN orders t2 ON t1.symbol = t2.id WHERE "
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const labels = cols.map((s) => s.label)
      // trades and orders have NO shared column names → all unambiguous
      expect(labels).toContain("symbol")
      expect(labels).toContain("price")
      expect(labels).toContain("id")
      expect(labels).toContain("status")
      expect(labels).not.toContain("t1.symbol")
      expect(labels).not.toContain("t2.id")
    })

    it("self-join column detail should show alias, not table name", () => {
      const sql =
        "SELECT * FROM trades t1 INNER JOIN trades t2 ON symbol WHERE "
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const t1Symbol = cols.find((s) => s.label === "t1.symbol")
      const t2Symbol = cols.find((s) => s.label === "t2.symbol")
      expect(t1Symbol?.detail).toContain("t1")
      expect(t2Symbol?.detail).toContain("t2")
    })

    it("self-join filterText should use bare column name for typing", () => {
      const sql =
        "SELECT * FROM trades t1 INNER JOIN trades t2 ON symbol WHERE "
      const cols = getSuggestionsOfKind(provider, sql, SuggestionKind.Column)
      const t1Symbol = cols.find((s) => s.label === "t1.symbol")
      // filterText should be bare "symbol" so typing "sym" matches it
      expect(t1Symbol?.filterText).toBe("symbol")
    })
  })

  // ---------------------------------------------------------------------------
  // Doc-validated table alias tests
  // Queries sourced from ~/Desktop/questdb/documentation/documentation/query/sql/
  // ---------------------------------------------------------------------------

  describe("table alias scenarios from QuestDB documentation", () => {
    // Extended schema with overlapping columns between tables, matching
    // the documentation examples (market_data, core_price, prices, etc.)
    const docSchema = {
      tables: [
        { name: "trades", designatedTimestamp: "timestamp" },
        { name: "orders", designatedTimestamp: "timestamp" },
        { name: "market_data", designatedTimestamp: "timestamp" },
        { name: "core_price", designatedTimestamp: "timestamp" },
        { name: "prices", designatedTimestamp: "timestamp" },
        { name: "spreads", designatedTimestamp: "timestamp" },
      ],
      columns: {
        trades: [
          { name: "timestamp", type: "TIMESTAMP" },
          { name: "symbol", type: "SYMBOL" },
          { name: "price", type: "DOUBLE" },
          { name: "amount", type: "DOUBLE" },
          { name: "side", type: "SYMBOL" },
        ],
        orders: [
          { name: "timestamp", type: "TIMESTAMP" },
          { name: "symbol", type: "SYMBOL" },
          { name: "id", type: "LONG" },
          { name: "status", type: "STRING" },
        ],
        market_data: [
          { name: "timestamp", type: "TIMESTAMP" },
          { name: "symbol", type: "SYMBOL" },
          { name: "bid_price", type: "DOUBLE" },
          { name: "ask_price", type: "DOUBLE" },
        ],
        core_price: [
          { name: "timestamp", type: "TIMESTAMP" },
          { name: "symbol", type: "SYMBOL" },
          { name: "bid_price", type: "DOUBLE" },
          { name: "ask_price", type: "DOUBLE" },
        ],
        prices: [
          { name: "timestamp", type: "TIMESTAMP" },
          { name: "symbol", type: "SYMBOL" },
          { name: "price", type: "DOUBLE" },
          { name: "bid", type: "DOUBLE" },
          { name: "ask", type: "DOUBLE" },
        ],
        spreads: [
          { name: "timestamp", type: "TIMESTAMP" },
          { name: "symbol", type: "SYMBOL" },
          { name: "spread", type: "DOUBLE" },
        ],
      },
    }
    const docProvider = createAutocompleteProvider(docSchema)

    // =======================================================================
    // Doc: join.md — LT JOIN self-join with aliases (tradesA, tradesB)
    // Pattern: FROM miniTrades tradesA LT JOIN miniTrades tradesB
    // =======================================================================

    describe("LT JOIN self-join (join.md)", () => {
      // Doc: "LT join is often useful to join a table to itself in order to
      // get preceding values for every row."
      it("should qualify columns in LT JOIN self-join", () => {
        const sql = "SELECT tradesA. FROM trades tradesA LT JOIN trades tradesB"
        const offset = sql.indexOf("tradesA.") + 8
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // Qualified ref "tradesA." → filter to tradesA only, bare names
        expect(labels).toContain("timestamp")
        expect(labels).toContain("price")
        expect(labels).toContain("symbol")
        expect(labels).not.toContain("tradesB.timestamp")
        expect(labels).not.toContain("tradesB.price")
      })

      it("should qualify columns at unqualified position in LT JOIN self-join", () => {
        const sql = "SELECT  FROM trades tradesA LT JOIN trades tradesB"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // Self-join: all columns ambiguous → must be alias-qualified
        expect(labels).toContain("tradesA.timestamp")
        expect(labels).toContain("tradesB.timestamp")
        expect(labels).toContain("tradesA.price")
        expect(labels).toContain("tradesB.price")
        expect(labels).not.toContain("timestamp")
        expect(labels).not.toContain("price")
      })

      it("tradesB. should filter to tradesB columns only", () => {
        const sql =
          "SELECT tradesA.timestamp, tradesB. FROM trades tradesA LT JOIN trades tradesB"
        const offset = sql.indexOf("tradesB.") + 8
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("timestamp")
        expect(labels).toContain("price")
        // Bare names only — filtered to single source
        expect(labels).not.toContain("tradesA.timestamp")
      })
    })

    // =======================================================================
    // Doc: join.md — CROSS JOIN self-join with AS alias
    // Pattern: FROM t CROSS JOIN t AS t2
    // =======================================================================

    describe("CROSS JOIN self-join with AS alias (join.md)", () => {
      // Doc: "detect potential duplicates, with same values and within a
      // 10 seconds range" — FROM t CROSS JOIN t AS t2 WHERE t.timestamp < t2.timestamp ...
      it("should qualify columns in CROSS JOIN self-join WHERE clause", () => {
        // Use explicit columns in CTE (SELECT * can't resolve columns)
        const sql =
          "WITH t AS (SELECT timestamp, symbol, price, amount, side FROM trades) SELECT * FROM t CROSS JOIN t AS t2 WHERE "
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
        )
        const labels = cols.map((s) => s.label)
        // "t" CTE joined with "t2" alias — same underlying columns,
        // so they should be qualified
        expect(labels).toContain("t.timestamp")
        expect(labels).toContain("t2.timestamp")
        expect(labels).toContain("t.symbol")
        expect(labels).toContain("t2.symbol")
        expect(labels).not.toContain("timestamp")
        expect(labels).not.toContain("symbol")
      })

      it("qualified ref in CROSS JOIN self-join filters to one alias", () => {
        const sql =
          "WITH t AS (SELECT timestamp, symbol, price, amount, side FROM trades) SELECT t2. FROM t CROSS JOIN t AS t2 WHERE t.timestamp < t2.timestamp"
        const offset = sql.indexOf("t2.") + 3
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("timestamp")
        expect(labels).toContain("symbol")
        expect(labels).toContain("price")
        // Should not include t. qualified
        expect(labels).not.toContain("t.timestamp")
      })
    })

    // =======================================================================
    // Doc: asof-join.md — ASOF JOIN with single-letter aliases (m, p)
    // Pattern: FROM market_data m ASOF JOIN core_price p
    // =======================================================================

    describe("ASOF JOIN with aliases (asof-join.md)", () => {
      // Doc: SELECT m.timestamp, m.symbol, p.timestamp, p.symbol, p.bid_price
      // FROM market_data m ASOF JOIN core_price p
      it("m. should suggest only market_data columns", () => {
        const sql = "SELECT m. FROM market_data m ASOF JOIN core_price p"
        const offset = sql.indexOf("m.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("timestamp")
        expect(labels).toContain("symbol")
        expect(labels).toContain("bid_price")
        expect(labels).toContain("ask_price")
        // Should NOT include p's columns
        expect(labels).not.toContain("p.timestamp")
        expect(labels).not.toContain("p.symbol")
      })

      it("p. should suggest only core_price columns", () => {
        const sql = "SELECT p. FROM market_data m ASOF JOIN core_price p"
        const offset = sql.indexOf("p.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("timestamp")
        expect(labels).toContain("symbol")
        expect(labels).toContain("bid_price")
        expect(labels).not.toContain("m.timestamp")
      })

      it("unqualified position should qualify shared columns between market_data and core_price", () => {
        const sql = "SELECT  FROM market_data m ASOF JOIN core_price p"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // market_data and core_price share: timestamp, symbol, bid_price, ask_price
        // All columns overlap → all must be qualified
        expect(labels).toContain("m.timestamp")
        expect(labels).toContain("p.timestamp")
        expect(labels).toContain("m.symbol")
        expect(labels).toContain("p.symbol")
        expect(labels).toContain("m.bid_price")
        expect(labels).toContain("p.bid_price")
        expect(labels).not.toContain("timestamp")
        expect(labels).not.toContain("symbol")
        expect(labels).not.toContain("bid_price")
      })

      it("ASOF JOIN with ON clause: alias filtering still works", () => {
        const sql =
          "SELECT m. FROM market_data m ASOF JOIN core_price p ON (symbol)"
        const offset = sql.indexOf("m.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("timestamp")
        expect(labels).toContain("bid_price")
        expect(labels).not.toContain("p.bid_price")
      })
    })

    // =======================================================================
    // Doc: join.md — INNER JOIN with CTE aliases (Lookup, ManyTrades)
    // Pattern: FROM ManyTrades INNER JOIN Lookup ON Lookup.symbol = Manytrades.symbol
    // =======================================================================

    describe("INNER JOIN with CTE table references (join.md)", () => {
      // Doc: CTE names used directly as table names, referenced with
      // CTE_name.column in ON clause
      it("CTE name as qualifier should filter correctly", () => {
        const sql =
          "WITH Lookup AS (SELECT symbol FROM trades) SELECT Lookup. FROM trades INNER JOIN Lookup ON Lookup.symbol = trades.symbol"
        const offset = sql.indexOf("Lookup.") + 7
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // Lookup CTE only has "symbol"
        expect(labels).toContain("symbol")
        // trades columns should NOT appear
        expect(labels).not.toContain("price")
        expect(labels).not.toContain("amount")
      })
    })

    // =======================================================================
    // Doc: join.md — SPLICE JOIN with CTE names (buy, sell)
    // Pattern: FROM buy SPLICE JOIN sell
    // =======================================================================

    describe("SPLICE JOIN with CTE aliases (join.md)", () => {
      // Doc: SELECT buy.timestamp, sell.timestamp, buy.price, sell.price
      // FROM buy SPLICE JOIN sell
      it("should suggest CTE columns via qualified ref after SPLICE JOIN", () => {
        const sql =
          "WITH buy AS (SELECT timestamp, price FROM trades), sell AS (SELECT timestamp, price FROM trades) SELECT buy. FROM buy SPLICE JOIN sell"
        const offset = sql.indexOf("buy.") + 4
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("timestamp")
        expect(labels).toContain("price")
        expect(labels).not.toContain("sell.timestamp")
      })

      it("unqualified position: CTE names without aliases remain bare (no hasAlias)", () => {
        // CTEs referenced by name (no explicit alias via AS) do not trigger
        // alias qualification. This is correct — the user must add aliases
        // explicitly if they want qualified column references.
        const sql =
          "WITH buy AS (SELECT timestamp, price FROM trades), sell AS (SELECT timestamp, price FROM trades) SELECT  FROM buy SPLICE JOIN sell"
        const offset = sql.indexOf("SELECT  FROM") + "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // CTE names without aliases → no qualification
        expect(labels).toContain("timestamp")
        expect(labels).toContain("price")
        expect(labels).not.toContain("buy.timestamp")
        expect(labels).not.toContain("sell.timestamp")
      })

      it("SPLICE JOIN with explicit aliases should qualify shared CTE columns", () => {
        const sql =
          "WITH buy AS (SELECT timestamp, price FROM trades), sell AS (SELECT timestamp, price FROM trades) SELECT  FROM buy b SPLICE JOIN sell s"
        const offset = sql.indexOf("SELECT  FROM") + "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // With explicit aliases b and s → qualification triggers
        expect(labels).toContain("b.timestamp")
        expect(labels).toContain("s.timestamp")
        expect(labels).toContain("b.price")
        expect(labels).toContain("s.price")
        expect(labels).not.toContain("timestamp")
        expect(labels).not.toContain("price")
      })
    })

    // =======================================================================
    // Doc: join.md — JOIN with ON (column) shorthand
    // Pattern: FROM mayTrades JOIN JuneTrades ON (symbol, side)
    // =======================================================================

    describe("JOIN ON (column) shorthand with CTE aliases (join.md)", () => {
      it("CTE qualifier should filter to that CTE's columns", () => {
        const sql =
          "WITH mayTrades AS (SELECT symbol, side, count() AS total FROM trades), juneTrades AS (SELECT symbol, side, count() AS total FROM trades) SELECT mayTrades. FROM mayTrades JOIN juneTrades ON (symbol, side)"
        const offset = sql.indexOf("mayTrades. FROM") + "mayTrades.".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("symbol")
        expect(labels).toContain("side")
        expect(labels).toContain("total")
      })
    })

    // =======================================================================
    // Doc: update.md — UPDATE FROM with aliases (s, p)
    // Pattern: UPDATE spreads s SET spread = p.ask - p.bid FROM prices p WHERE s.symbol = p.symbol
    // =======================================================================

    describe("UPDATE FROM with aliases (update.md)", () => {
      it("p. should suggest prices columns in UPDATE FROM context", () => {
        const sql =
          "UPDATE spreads s SET spread = p.ask - p.bid FROM prices p WHERE p."
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("symbol")
        expect(labels).toContain("price")
        expect(labels).toContain("bid")
        expect(labels).toContain("ask")
      })
    })

    // =======================================================================
    // Mixed-ambiguity: some columns overlap, some don't
    // Pattern: trades (has "price") JOIN prices (has "price") → "price"
    //          is ambiguous, but "amount" (trades-only) and "bid" (prices-only)
    //          are not.
    // =======================================================================

    describe("partial column overlap between different tables", () => {
      it("shared columns should be qualified, unique columns should be bare", () => {
        const sql = "SELECT  FROM trades t JOIN prices p ON t.symbol = p.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)

        // Shared columns: timestamp, symbol, price → qualified
        expect(labels).toContain("t.timestamp")
        expect(labels).toContain("p.timestamp")
        expect(labels).toContain("t.symbol")
        expect(labels).toContain("p.symbol")
        expect(labels).toContain("t.price")
        expect(labels).toContain("p.price")
        expect(labels).not.toContain("timestamp")
        expect(labels).not.toContain("symbol")
        expect(labels).not.toContain("price")

        // Unique columns: amount (trades), side (trades), bid (prices), ask (prices) → bare
        expect(labels).toContain("amount")
        expect(labels).toContain("side")
        expect(labels).toContain("bid")
        expect(labels).toContain("ask")
        expect(labels).not.toContain("t.amount")
        expect(labels).not.toContain("p.bid")
      })

      it("qualified ref resolves past ambiguity to single table", () => {
        const sql =
          "SELECT t. FROM trades t JOIN prices p ON t.symbol = p.symbol"
        const offset = sql.indexOf("t.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // t. → only trades columns, bare names
        expect(labels).toContain("timestamp")
        expect(labels).toContain("symbol")
        expect(labels).toContain("price")
        expect(labels).toContain("amount")
        expect(labels).toContain("side")
        expect(labels).not.toContain("bid")
        expect(labels).not.toContain("ask")
        expect(labels).not.toContain("t.price")
      })

      it("description should show type for qualified ambiguous columns", () => {
        const sql = "SELECT  FROM trades t JOIN prices p ON t.symbol = p.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const tPrice = cols.find((s) => s.label === "t.price")
        const pPrice = cols.find((s) => s.label === "p.price")
        expect(tPrice).toBeDefined()
        expect(pPrice).toBeDefined()
        expect(tPrice!.description).toBe("DOUBLE")
        expect(pPrice!.description).toBe("DOUBLE")
      })
    })

    // =======================================================================
    // Three-way JOIN with mixed overlap
    // trades (timestamp, symbol, price, amount, side) +
    // orders (timestamp, symbol, id, status) +
    // prices (timestamp, symbol, price, bid, ask)
    // → timestamp and symbol shared by all three → qualified
    // → price shared by trades + prices → qualified
    // → amount, side unique to trades → bare
    // → id, status unique to orders → bare
    // → bid, ask unique to prices → bare
    // =======================================================================

    describe("three-way JOIN with mixed column overlap", () => {
      it("fully shared columns use all three aliases", () => {
        const sql =
          "SELECT  FROM trades t JOIN orders o ON t.symbol = o.symbol JOIN prices p ON t.symbol = p.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // timestamp: trades, orders, prices → 3 aliases
        expect(labels).toContain("t.timestamp")
        expect(labels).toContain("o.timestamp")
        expect(labels).toContain("p.timestamp")
        expect(labels).not.toContain("timestamp")

        // symbol: trades, orders, prices → 3 aliases
        expect(labels).toContain("t.symbol")
        expect(labels).toContain("o.symbol")
        expect(labels).toContain("p.symbol")
        expect(labels).not.toContain("symbol")
      })

      it("partially shared columns use only overlapping aliases", () => {
        const sql =
          "SELECT  FROM trades t JOIN orders o ON t.symbol = o.symbol JOIN prices p ON t.symbol = p.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // price: trades + prices only → 2 aliases
        expect(labels).toContain("t.price")
        expect(labels).toContain("p.price")
        expect(labels).not.toContain("o.price") // orders has no price column
        expect(labels).not.toContain("price")
      })

      it("unique columns remain bare", () => {
        const sql =
          "SELECT  FROM trades t JOIN orders o ON t.symbol = o.symbol JOIN prices p ON t.symbol = p.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // Unique to trades
        expect(labels).toContain("amount")
        expect(labels).toContain("side")
        expect(labels).not.toContain("t.amount")

        // Unique to orders
        expect(labels).toContain("id")
        expect(labels).toContain("status")
        expect(labels).not.toContain("o.id")

        // Unique to prices
        expect(labels).toContain("bid")
        expect(labels).toContain("ask")
        expect(labels).not.toContain("p.bid")
      })

      it("qualified ref in three-way JOIN isolates single table", () => {
        const sql =
          "SELECT o. FROM trades t JOIN orders o ON t.symbol = o.symbol JOIN prices p ON t.symbol = p.symbol"
        const offset = sql.indexOf("o.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // o. → only orders columns
        expect(labels).toContain("timestamp")
        expect(labels).toContain("symbol")
        expect(labels).toContain("id")
        expect(labels).toContain("status")
        expect(labels).not.toContain("price")
        expect(labels).not.toContain("bid")
        expect(labels).not.toContain("amount")
      })
    })

    // =======================================================================
    // LEFT JOIN with aliases — doc: join.md
    // Pattern: FROM ManyTrades LEFT OUTER JOIN Lookup ON Lookup.symbol = Manytrades.symbol
    // =======================================================================

    describe("LEFT JOIN with aliases (join.md)", () => {
      it("LEFT JOIN alias filtering with qualified ref", () => {
        const sql =
          "SELECT t. FROM trades t LEFT JOIN orders o ON t.symbol = o.symbol"
        const offset = sql.indexOf("t.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("symbol")
        expect(labels).toContain("price")
        expect(labels).toContain("timestamp")
        expect(labels).not.toContain("id")
        expect(labels).not.toContain("status")
      })

      it("LEFT OUTER JOIN alias filtering with qualified ref", () => {
        const sql =
          "SELECT o. FROM trades t LEFT OUTER JOIN orders o ON t.symbol = o.symbol"
        const offset = sql.indexOf("o.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("id")
        expect(labels).toContain("status")
        expect(labels).toContain("symbol")
        expect(labels).not.toContain("price")
        expect(labels).not.toContain("amount")
      })
    })

    // =======================================================================
    // Implicit JOIN (FROM a, b) with aliases
    // Doc: join.md — FROM a, b WHERE a.id = b.id
    // =======================================================================

    describe("implicit join (comma-separated tables) with aliases", () => {
      it("unqualified position with different tables shows qualified shared columns", () => {
        const sql = "SELECT  FROM trades t, orders o WHERE t.symbol = o.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // timestamp and symbol are shared → qualified
        expect(labels).toContain("t.timestamp")
        expect(labels).toContain("o.timestamp")
        expect(labels).toContain("t.symbol")
        expect(labels).toContain("o.symbol")
        // price, amount, side unique to trades → bare
        expect(labels).toContain("price")
        expect(labels).toContain("amount")
        // id, status unique to orders → bare
        expect(labels).toContain("id")
        expect(labels).toContain("status")
      })

      it("qualified ref in implicit join isolates table", () => {
        const sql =
          "SELECT t. FROM trades t, orders o WHERE t.symbol = o.symbol"
        const offset = sql.indexOf("t.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("symbol")
        expect(labels).toContain("price")
        expect(labels).not.toContain("id")
      })
    })

    // =======================================================================
    // Suggestion priority invariants
    // =======================================================================

    describe("alias-qualified suggestion properties", () => {
      it("qualified columns have High priority", () => {
        const sql =
          "SELECT  FROM trades t1 INNER JOIN trades t2 ON t1.symbol = t2.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        for (const col of cols) {
          expect(col.priority).toBe(SuggestionPriority.High)
        }
      })

      it("qualified column kind is Column", () => {
        const sql =
          "SELECT  FROM trades t1 INNER JOIN trades t2 ON t1.symbol = t2.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        expect(cols.length).toBeGreaterThan(0)
        for (const col of cols) {
          expect(col.kind).toBe(SuggestionKind.Column)
        }
      })

      it("all qualified columns have matching label and insertText", () => {
        const sql =
          "SELECT  FROM trades t1 INNER JOIN trades t2 ON t1.symbol = t2.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        for (const col of cols) {
          expect(col.insertText).toBe(col.label)
        }
      })

      it("bare columns have no filterText set", () => {
        const sql = "SELECT  FROM trades t WHERE "
        const offset = sql.length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        for (const col of cols) {
          // Bare columns should not have filterText
          expect(col.filterText).toBeUndefined()
        }
      })

      it("qualified columns always have filterText set to bare column name", () => {
        const sql =
          "SELECT  FROM trades t1 INNER JOIN trades t2 ON t1.symbol = t2.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        for (const col of cols) {
          // filterText should be the bare column name (after the dot)
          const bareName = col.label.split(".")[1]
          expect(col.filterText).toBe(bareName)
        }
      })

      it("qualified column detail contains the qualifier", () => {
        const sql = "SELECT  FROM trades t JOIN prices p ON t.symbol = p.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        for (const col of cols) {
          if (col.label.includes(".")) {
            const qualifier = col.label.split(".")[0]
            expect(col.detail).toContain(qualifier)
          }
        }
      })
    })

    // =======================================================================
    // Edge case: no aliases at all
    // =======================================================================

    describe("joins without aliases", () => {
      it("tables without aliases use table name but do not qualify shared columns", () => {
        const sql =
          "SELECT  FROM trades JOIN orders ON trades.symbol = orders.symbol"
        const offset = "SELECT ".length
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        // Without aliases, shared columns (timestamp, symbol) remain bare
        // because the hasAlias check prevents qualification for entries
        // without explicit aliases
        expect(labels).toContain("timestamp")
        expect(labels).toContain("symbol")
        // Unique columns remain bare
        expect(labels).toContain("price")
        expect(labels).toContain("amount")
        expect(labels).toContain("id")
        expect(labels).toContain("status")
      })
    })

    // =======================================================================
    // Edge case: AS keyword with alias
    // =======================================================================

    describe("AS keyword alias syntax", () => {
      it("FROM table AS alias: qualified ref works", () => {
        const sql =
          "SELECT t. FROM trades AS t JOIN orders AS o ON t.symbol = o.symbol"
        const offset = sql.indexOf("t.") + 2
        const cols = getSuggestionsOfKind(
          docProvider,
          sql,
          SuggestionKind.Column,
          offset,
        )
        const labels = cols.map((s) => s.label)
        expect(labels).toContain("symbol")
        expect(labels).toContain("price")
        expect(labels).not.toContain("id")
      })
    })
  })

  // ===========================================================================
  // String literal & quoted identifier suppression
  // ===========================================================================
  // The parser suppresses suggestions when the cursor is inside a string
  // literal ('...') or quoted identifier ("..."). This prevents autocomplete
  // from interfering when the user is typing a value or an escaped name.

  describe("string literal suppression", () => {
    it("should return no suggestions when cursor is inside a string literal", () => {
      // Cursor inside 'BTC-USD' → no suggestions
      const sql = "SELECT * FROM trades WHERE symbol = 'BTC-USD'"
      const offset = sql.indexOf("BTC") + 1 // inside the string
      const suggestions = provider.getSuggestions(sql, offset)
      expect(suggestions).toHaveLength(0)
    })

    it("should return no suggestions at various positions inside a string", () => {
      const sql = "SELECT * FROM trades WHERE symbol = 'hello world'"
      // Right after opening quote
      const afterOpen = sql.indexOf("'") + 1
      expect(provider.getSuggestions(sql, afterOpen)).toHaveLength(0)
      // Middle of string
      const middle = sql.indexOf("world")
      expect(provider.getSuggestions(sql, middle)).toHaveLength(0)
      // Right before closing quote
      const beforeClose = sql.lastIndexOf("'")
      expect(provider.getSuggestions(sql, beforeClose)).toHaveLength(0)
    })

    it("should suggest after a completed string literal (cursor outside)", () => {
      // Cursor AFTER the closing quote → should suggest operators/keywords
      const sql = "SELECT * FROM trades WHERE symbol = 'BTC-USD' "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const labels = suggestions.map((s) => s.label)
      expect(labels.length).toBeGreaterThan(0)
      expect(labels).toContain("AND")
    })

    it("should return no suggestions inside a string in SELECT list", () => {
      const sql = "SELECT 'hello world' FROM trades"
      const offset = sql.indexOf("world")
      const suggestions = provider.getSuggestions(sql, offset)
      expect(suggestions).toHaveLength(0)
    })

    it("should return no suggestions inside a string in INSERT VALUES", () => {
      const sql = "INSERT INTO trades VALUES ('BTC-USD', 100)"
      const offset = sql.indexOf("BTC") + 2
      const suggestions = provider.getSuggestions(sql, offset)
      expect(suggestions).toHaveLength(0)
    })
  })

  // ===========================================================================
  // SELECT * edge cases
  // ===========================================================================

  describe("SELECT * edge cases", () => {
    it("suggests FROM after SELECT * with no other suggestions leaking", () => {
      const suggestions = provider.getSuggestions("SELECT * ", 9)
      const labels = suggestions.map((s) => s.label)
      expect(labels).toContain("FROM")
      // No columns should appear
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns).toHaveLength(0)
      // No functions should appear
      const funcs = suggestions.filter(
        (s) => s.kind === SuggestionKind.Function,
      )
      expect(funcs).toHaveLength(0)
      // No tables should appear
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      expect(tables).toHaveLength(0)
    })

    it("suggests only keywords when typing mid-word after SELECT *", () => {
      // FR, WH, etc. should only yield keyword matches
      for (const partial of ["FR", "WH", "LI", "OR"]) {
        const sql = `SELECT * ${partial}`
        const suggestions = provider.getSuggestions(sql, sql.length)
        const nonKeywords = suggestions.filter(
          (s) => s.kind !== SuggestionKind.Keyword,
        )
        expect(nonKeywords).toHaveLength(0)
      }
    })

    it("still suggests columns after SELECT (no star)", () => {
      // Sanity check: without *, columns should still appear
      const suggestions = provider.getSuggestions("SELECT  FROM trades", 7)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.length).toBeGreaterThan(0)
    })

    it("suggests columns after multiplication operator (price * |)", () => {
      // * after an identifier is multiplication, not wildcard.
      // The user needs columns/functions for the RHS.
      const suggestions = provider.getSuggestions(
        "SELECT price *  FROM trades",
        15,
      )
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.length).toBeGreaterThan(0)
    })

    it("suggests columns after number * (arithmetic)", () => {
      const suggestions = provider.getSuggestions("SELECT 2 *  FROM trades", 11)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.length).toBeGreaterThan(0)
    })

    it("suggests columns after (expr) * (parenthesized multiplication)", () => {
      const suggestions = provider.getSuggestions(
        "SELECT (price + 1) *  FROM trades",
        21,
      )
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.length).toBeGreaterThan(0)
    })

    it("does NOT suggest columns after SELECT * (wildcard)", () => {
      const suggestions = provider.getSuggestions("SELECT * ", 9)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns).toHaveLength(0)
    })

    it("does NOT suggest columns after comma-star (SELECT a, *)", () => {
      // Comma resets expression context, so * after comma is a wildcard
      const suggestions = provider.getSuggestions("SELECT symbol, * ", 17)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns).toHaveLength(0)
    })
  })

  // ===========================================================================
  // Grammar-level tableName classification tests
  // ===========================================================================
  // These tests verify that the grammar-based `tableName` rule correctly
  // classifies positions as table name vs column vs new name contexts.

  describe("grammar-level tableName classification", () => {
    it("CREATE TABLE (LIKE |) suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions(
        "CREATE TABLE mytable (LIKE ",
        27,
      )
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(tables.length).toBeGreaterThan(0)
      expect(tables.map((s) => s.label)).toContain("trades")
      expect(columns).toHaveLength(0)
    })

    it("DROP TABLE suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions("DROP TABLE ", 11)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(tables.map((s) => s.label)).toContain("trades")
      expect(columns).toHaveLength(0)
    })

    it("TRUNCATE TABLE suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions("TRUNCATE TABLE ", 15)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(tables.map((s) => s.label)).toContain("trades")
      expect(columns).toHaveLength(0)
    })

    it("ALTER TABLE suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions("ALTER TABLE ", 12)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(tables.map((s) => s.label)).toContain("trades")
      expect(columns).toHaveLength(0)
    })

    it("INSERT INTO suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions("INSERT INTO ", 12)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(tables.map((s) => s.label)).toContain("trades")
      expect(columns).toHaveLength(0)
    })

    it("SELECT clause suggests columns, not just tables", () => {
      const suggestions = provider.getSuggestions("SELECT  FROM trades", 7)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.map((s) => s.label)).toContain("symbol")
    })

    it("WHERE clause suggests columns", () => {
      const suggestions = provider.getSuggestions(
        "SELECT * FROM trades WHERE ",
        27,
      )
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.map((s) => s.label)).toContain("price")
    })

    it("CREATE TABLE column definition: no columns, no tables", () => {
      const suggestions = provider.getSuggestions("CREATE TABLE mytable (", 22)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      expect(columns).toHaveLength(0)
      expect(tables).toHaveLength(0)
    })

    it("INSERT VALUES: scalar functions allowed (now/rnd_*); no aggregates", () => {
      // VALUES rows are predicate-expression positions: scalar functions are
      // useful (now(), rnd_symbol(), …) but aggregates aren't (you can't
      // collapse rows here). Columns of the target table are technically
      // valid syntax (treated as bare references) so we don't reject them.
      const sugs = provider.getSuggestions(
        "INSERT INTO trades VALUES (n",
        "INSERT INTO trades VALUES (n".length,
      )
      const fns = sugs
        .filter((s) => s.kind === SuggestionKind.Function)
        .map((s) => s.label)
      expect(fns).toContain("now")
      expect(fns).not.toContain("count") // aggregate
      expect(fns).not.toContain("count_distinct")
      expect(fns).not.toContain("materialized_views") // tableValued
    })

    it("VACUUM TABLE suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions("VACUUM TABLE ", 13)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(tables.map((s) => s.label)).toContain("trades")
      expect(columns).toHaveLength(0)
    })

    it("COPY TO table position suggests tables, not columns", () => {
      const suggestions = provider.getSuggestions("COPY ", 5)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      expect(tables.map((s) => s.label)).toContain("trades")
    })

    it("ALTER TABLE trades ALTER COLUMN suggests columns", () => {
      const sql = "ALTER TABLE trades ALTER COLUMN "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.map((s) => s.label)).toContain("symbol")
      expect(columns.map((s) => s.label)).toContain("price")
    })

    it("ALTER TABLE trades DROP COLUMN suggests columns", () => {
      const sql = "ALTER TABLE trades DROP COLUMN "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.map((s) => s.label)).toContain("symbol")
    })

    it("ALTER TABLE trades RENAME COLUMN suggests columns for old name", () => {
      const sql = "ALTER TABLE trades RENAME COLUMN "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.map((s) => s.label)).toContain("symbol")
    })
  })

  // ===========================================================================
  // Column-based table ranking
  // ===========================================================================
  describe("column-based table ranking", () => {
    it("boosts tables that contain all referenced columns", () => {
      // "symbol" and "price" both exist in trades but not in orders or users
      const sql = "SELECT symbol, price FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const trades = tables.find((s) => s.label === "trades")
      const orders = tables.find((s) => s.label === "orders")
      const users = tables.find((s) => s.label === "users")
      expect(trades?.priority).toBe(SuggestionPriority.Medium)
      expect(orders?.priority).toBe(SuggestionPriority.MediumLow)
      expect(users?.priority).toBe(SuggestionPriority.MediumLow)
    })

    it("partial column match does not boost tables", () => {
      // "symbol" is in trades; "id" is in orders — neither has all columns
      const sql = "SELECT symbol, id FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      // No table contains both columns → no boost, all stay at default
      for (const t of tables) {
        expect(t.priority).toBe(SuggestionPriority.MediumLow)
      }
    })

    it("graceful fallback: no boost when no table has any referenced column", () => {
      // "nonexistent_col" doesn't exist in any table
      const sql = "SELECT nonexistent_col FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      for (const t of tables) {
        expect(t.priority).toBe(SuggestionPriority.MediumLow)
      }
    })

    it("qualified references: the alias/qualifier is excluded but the column name is used", () => {
      // "t1.symbol" → "symbol" is extracted; "t1" (alias qualifier) is not
      const sql = "SELECT t1.symbol FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const trades = tables.find((s) => s.label === "trades")
      const orders = tables.find((s) => s.label === "orders")
      // trades has "symbol" → boosted; orders does not
      expect(trades?.priority).toBe(SuggestionPriority.Medium)
      expect(orders?.priority).toBe(SuggestionPriority.MediumLow)
    })

    it("qualified references with partial match do not boost tables", () => {
      // c.symbol → symbol in trades; o.id → id in orders
      // Neither table has both columns → no boost
      const sql = "SELECT c.symbol, o.id FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      for (const t of tables) {
        expect(t.priority).toBe(SuggestionPriority.MediumLow)
      }
    })

    it("function calls are excluded from column inference", () => {
      // "count()" is a function call — should not influence ranking
      const sql = "SELECT count() FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      for (const t of tables) {
        expect(t.priority).toBe(SuggestionPriority.MediumLow)
      }
    })

    it("all tables remain in the suggestion list even when some are boosted", () => {
      const sql = "SELECT symbol, price FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tableLabels = suggestions
        .filter((s) => s.kind === SuggestionKind.Table)
        .map((s) => s.label)
      expect(tableLabels).toContain("trades")
      expect(tableLabels).toContain("orders")
      expect(tableLabels).toContain("users")
    })

    it("boosts a single-column match correctly", () => {
      // "status" only exists in orders
      const sql = "SELECT status FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      const orders = tables.find((s) => s.label === "orders")
      const trades = tables.find((s) => s.label === "trades")
      expect(orders?.priority).toBe(SuggestionPriority.Medium)
      expect(trades?.priority).toBe(SuggestionPriority.MediumLow)
    })

    it("SELECT * FROM does not boost any table (no referenced columns)", () => {
      const sql = "SELECT * FROM "
      const suggestions = provider.getSuggestions(sql, sql.length)
      const tables = suggestions.filter((s) => s.kind === SuggestionKind.Table)
      for (const t of tables) {
        expect(t.priority).toBe(SuggestionPriority.MediumLow)
      }
    })
  })
})

describe("condition-aware operator priority", () => {
  function getPriority(
    sql: string,
    label: string,
    offset?: number,
  ): SuggestionPriority | undefined {
    const suggestions = provider.getSuggestions(sql, offset ?? sql.length)
    return suggestions.find((s) => s.label === label)?.priority
  }

  describe("WHERE column | (condition context, column detected)", () => {
    const sql = "SELECT * FROM trades WHERE amount "

    it("boosts IN to High priority", () => {
      expect(getPriority(sql, "IN")).toBe(SuggestionPriority.High)
    })

    it("keeps other expression operators at Medium", () => {
      expect(getPriority(sql, "AND")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "BETWEEN")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "IS")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "NOT")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "OR")).toBe(SuggestionPriority.Medium)
    })

    it("demotes clause keywords to MediumLow", () => {
      expect(getPriority(sql, "GROUP")).toBe(SuggestionPriority.MediumLow)
      expect(getPriority(sql, "ORDER")).toBe(SuggestionPriority.MediumLow)
      expect(getPriority(sql, "LIMIT")).toBe(SuggestionPriority.MediumLow)
    })
  })

  describe("SELECT column | (not a condition context)", () => {
    const sql = "SELECT amount  FROM trades"

    it("does not adjust priorities outside WHERE", () => {
      // cursor at position 14 (after "amount ")
      expect(getPriority(sql, "AND", 14)).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "IN", 14)).toBe(SuggestionPriority.Medium)
    })
  })

  describe("WHERE | (no column before cursor)", () => {
    const sql = "SELECT * FROM trades WHERE "

    it("does not adjust priorities when no column precedes cursor", () => {
      // After WHERE, parser expects an expression to start — operators
      // like IN are not among suggestions at this position.
      // Columns should be at their default High priority.
      const suggestions = provider.getSuggestions(sql, sql.length)
      const columns = suggestions.filter(
        (s) => s.kind === SuggestionKind.Column,
      )
      expect(columns.length).toBeGreaterThan(0)
      for (const c of columns) {
        expect(c.priority).toBe(SuggestionPriority.High)
      }
    })
  })

  describe("WHERE col > 5 | (last token is literal, not column)", () => {
    const sql = "SELECT * FROM trades WHERE amount > 5 "

    it("does not adjust priorities when last token is a literal", () => {
      expect(getPriority(sql, "AND")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "GROUP")).toBe(SuggestionPriority.Medium)
    })
  })

  describe("WHERE col > 5 AND col2 | (second condition column)", () => {
    const sql = "SELECT * FROM trades WHERE amount > 5 AND price "

    it("boosts IN for the second condition column", () => {
      expect(getPriority(sql, "IN")).toBe(SuggestionPriority.High)
    })

    it("demotes clause keywords for the second condition column", () => {
      expect(getPriority(sql, "GROUP")).toBe(SuggestionPriority.MediumLow)
      expect(getPriority(sql, "ORDER")).toBe(SuggestionPriority.MediumLow)
    })
  })

  describe("WHERE col OR col2 | (OR continuation)", () => {
    const sql = "SELECT * FROM trades WHERE amount > 5 OR price "

    it("boosts IN after OR", () => {
      expect(getPriority(sql, "IN")).toBe(SuggestionPriority.High)
    })

    it("keeps expression operators at Medium after OR", () => {
      expect(getPriority(sql, "AND")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "BETWEEN")).toBe(SuggestionPriority.Medium)
    })

    it("demotes clause keywords after OR", () => {
      expect(getPriority(sql, "GROUP")).toBe(SuggestionPriority.MediumLow)
      expect(getPriority(sql, "ORDER")).toBe(SuggestionPriority.MediumLow)
    })
  })

  describe("WHERE (col) | (parenthesized expression)", () => {
    const sql = "SELECT * FROM trades WHERE (amount "

    it("boosts IN inside parenthesized condition", () => {
      expect(getPriority(sql, "IN")).toBe(SuggestionPriority.High)
    })

    it("keeps expression operators at Medium", () => {
      expect(getPriority(sql, "AND")).toBe(SuggestionPriority.Medium)
    })
  })

  describe("WHERE col = 'x' | (last token is string literal)", () => {
    const sql = "SELECT * FROM trades WHERE symbol = 'BTC' "

    it("does not adjust priorities when last token is a string literal", () => {
      expect(getPriority(sql, "AND")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "GROUP")).toBe(SuggestionPriority.Medium)
    })
  })

  describe("WHERE NOT col | (NOT before column)", () => {
    const sql = "SELECT * FROM trades WHERE NOT amount "

    it("boosts IN after NOT column", () => {
      expect(getPriority(sql, "IN")).toBe(SuggestionPriority.High)
    })

    it("demotes clause keywords after NOT column", () => {
      expect(getPriority(sql, "GROUP")).toBe(SuggestionPriority.MediumLow)
    })
  })

  describe("set operations are not treated as expression operators", () => {
    const sql = "SELECT * FROM trades WHERE amount "

    it("demotes UNION as clause keyword in condition context", () => {
      const priority = getPriority(sql, "UNION")
      if (priority !== undefined) {
        expect(priority).toBe(SuggestionPriority.MediumLow)
      }
    })

    it("demotes EXCEPT as clause keyword in condition context", () => {
      const priority = getPriority(sql, "EXCEPT")
      if (priority !== undefined) {
        expect(priority).toBe(SuggestionPriority.MediumLow)
      }
    })

    it("demotes INTERSECT as clause keyword in condition context", () => {
      const priority = getPriority(sql, "INTERSECT")
      if (priority !== undefined) {
        expect(priority).toBe(SuggestionPriority.MediumLow)
      }
    })
  })

  describe("mid-word typing in WHERE context", () => {
    it("adjusts priorities when typing operator prefix after column", () => {
      const sql = "SELECT * FROM trades WHERE amount b"
      // mid-word "b" could match BETWEEN — still in condition context
      expect(getPriority(sql, "BETWEEN")).toBe(SuggestionPriority.Medium)
    })

    it("adjusts priorities when typing 'i' after column (matches IN)", () => {
      const sql = "SELECT * FROM trades WHERE amount i"
      const priority = getPriority(sql, "IN")
      if (priority !== undefined) {
        expect(priority).toBe(SuggestionPriority.High)
      }
    })
  })

  describe("ORDER BY col | (not a condition context)", () => {
    const sql = "SELECT * FROM trades WHERE amount > 5 ORDER BY price "

    it("does not adjust priorities in ORDER BY", () => {
      // After ORDER BY column, no condition-aware adjustment
      const andPriority = getPriority(sql, "AND")
      const limitPriority = getPriority(sql, "LIMIT")
      if (andPriority !== undefined && limitPriority !== undefined) {
        // Both should be at default Medium (no condition boost)
        expect(andPriority).toBe(SuggestionPriority.Medium)
        expect(limitPriority).toBe(SuggestionPriority.Medium)
      }
    })
  })

  describe("UPDATE WHERE col | (condition context in UPDATE)", () => {
    const sql = "UPDATE trades SET amount = 1 WHERE symbol "

    it("boosts IN in UPDATE WHERE clause", () => {
      expect(getPriority(sql, "IN")).toBe(SuggestionPriority.High)
    })

    it("keeps expression operators at Medium", () => {
      expect(getPriority(sql, "AND")).toBe(SuggestionPriority.Medium)
      expect(getPriority(sql, "LIKE")).toBe(SuggestionPriority.Medium)
    })
  })
})

// =============================================================================
// Position-typed suggestions — by statement type
// =============================================================================
// Walks every statement type the parser supports, asserting that the right
// function categories (scalar / aggregate / window / tableValued) and schema
// buckets (columns / tables) appear at each cursor position — and that the
// wrong ones do NOT leak in. Driven by PositionKind classification in
// content-assist.ts and category dispatch in suggestion-builder.ts.
//
// Each `it` title encodes:
//   "<typed sql with | for cursor> — <position kind> — <one-line rule>"
// =============================================================================

/**
 * Assert which suggestion categories appear / do not appear at a given cursor
 * position. Distinguishes by SuggestionKind so we check that "max" arrives as
 * a function (not as a matching keyword), etc.
 */
function assertAtPosition(
  sql: string,
  expects: {
    hasFunction?: string[]
    hasTable?: string[]
    hasColumn?: string[]
    hasKeyword?: string[]
    noFunction?: string[]
    noTable?: string[]
    noColumn?: string[]
  },
) {
  const sugs = provider.getSuggestions(sql, sql.length)
  const byKind = (k: SuggestionKind) =>
    new Set(sugs.filter((s) => s.kind === k).map((s) => s.label))
  const fns = byKind(SuggestionKind.Function)
  const tables = byKind(SuggestionKind.Table)
  const cols = byKind(SuggestionKind.Column)
  const kws = byKind(SuggestionKind.Keyword)

  const at = `at "${sql}"`
  for (const x of expects.hasFunction ?? [])
    expect(fns, `${at} expected function "${x}"`).toContain(x)
  for (const x of expects.hasTable ?? [])
    expect(tables, `${at} expected table "${x}"`).toContain(x)
  for (const x of expects.hasColumn ?? [])
    expect(cols, `${at} expected column "${x}"`).toContain(x)
  for (const x of expects.hasKeyword ?? [])
    expect(kws, `${at} expected keyword "${x}"`).toContain(x)
  for (const x of expects.noFunction ?? [])
    expect(fns, `${at} function "${x}" should NOT appear`).not.toContain(x)
  for (const x of expects.noTable ?? [])
    expect(tables, `${at} table "${x}" should NOT appear`).not.toContain(x)
  for (const x of expects.noColumn ?? [])
    expect(cols, `${at} column "${x}" should NOT appear`).not.toContain(x)
}

describe("Position-typed suggestions — by statement type", () => {
  // ---------------------------------------------------------------------------
  // Read statements (SELECT family)
  // ---------------------------------------------------------------------------

  describe("SELECT — selectItem positions (expression)", () => {
    it("SELECT m| — scalar + aggregate + window allowed; tableValued is NOT", () => {
      assertAtPosition("SELECT m", {
        hasFunction: ["max", "min", "millis"],
        noFunction: ["materialized_views"],
      })
    })

    it("SELECT col, m| — same expression rules after a comma", () => {
      assertAtPosition("SELECT symbol, m", {
        hasFunction: ["max", "min"],
        noFunction: ["materialized_views"],
      })
    })
  })

  describe("SELECT — clause positions", () => {
    it("SELECT * FROM trades WHERE c| — restrictedExpression — scalar only, no aggregates", () => {
      assertAtPosition("SELECT * FROM trades WHERE c", {
        hasFunction: ["coalesce", "concat", "ceil"],
        noFunction: [
          "count",
          "count_distinct",
          "covar_pop",
          "materialized_views",
        ],
      })
    })

    it("SELECT * FROM trades GROUP BY c| — restrictedExpression — scalar only, no aggregates", () => {
      assertAtPosition("SELECT * FROM trades GROUP BY c", {
        hasFunction: ["coalesce", "ceil"],
        noFunction: ["count", "count_distinct", "materialized_views"],
      })
    })

    it("SELECT * FROM trades ORDER BY c| — expression — aggregates ALLOWED", () => {
      assertAtPosition("SELECT * FROM trades ORDER BY c", {
        hasFunction: ["coalesce", "count", "ceil"],
        noFunction: ["materialized_views"],
      })
    })

    it("SELECT * FROM trades LIMIT | — numeric — no function/column/table", () => {
      assertAtPosition("SELECT * FROM trades LIMIT ", {
        noFunction: ["max", "count", "materialized_views"],
        noTable: ["trades"],
        noColumn: ["price", "symbol"],
      })
    })
  })

  describe("SELECT — table source positions", () => {
    it("SELECT * FROM m| — tableSource — tableValued meta fns + tables; NO scalars", () => {
      assertAtPosition("SELECT * FROM m", {
        hasFunction: ["materialized_views"],
        noFunction: ["max", "min", "median"],
      })
    })
  })

  describe("Implicit SELECT (bare table shorthand)", () => {
    it("empty buffer — statement-level keywords + tables (tra → TRUNCATE + trades)", () => {
      assertAtPosition("", {
        hasKeyword: ["SELECT", "INSERT", "CREATE", "WITH", "DROP"],
        hasTable: ["trades", "orders", "users"],
        noFunction: ["max", "materialized_views"],
      })
    })

    it("tra| at empty buffer — keyword AND table both match the prefix", () => {
      assertAtPosition("tra", {
        hasKeyword: ["TRUNCATE"],
        hasTable: ["trades"],
      })
    })

    it("trades w| — clause keywords after bare table (WHERE/etc.)", () => {
      assertAtPosition("trades w", { hasKeyword: ["WHERE"] })
    })
  })

  // ---------------------------------------------------------------------------
  // Write statements (DML)
  // ---------------------------------------------------------------------------

  describe("INSERT", () => {
    it("INSERT | — only INTO is valid here", () => {
      assertAtPosition("INSERT ", { hasKeyword: ["INTO"] })
    })

    it("INSERT INTO m| — tableName — no functions of any kind", () => {
      assertAtPosition("INSERT INTO m", {
        noFunction: ["materialized_views", "max", "min"],
      })
    })

    it("INSERT INTO trades VALUES (m| — restrictedExpression — scalar fns allowed, no aggregates", () => {
      assertAtPosition("INSERT INTO trades VALUES (m", {
        // Scalar functions like materialize-able timestamp/random — actually
        // the prefix `m` matches `make_geohash`, `md5`, `micros`, `millis`, etc.
        hasFunction: ["md5", "millis"],
        // No aggregates (can't collapse rows in VALUES) and no tableValued
        // meta fns (don't return scalars).
        noFunction: ["max", "materialized_views"],
      })
    })
  })

  describe("UPDATE", () => {
    it("UPDATE m| — tableName — no functions", () => {
      assertAtPosition("UPDATE m", {
        noFunction: ["max", "min", "materialized_views"],
      })
    })

    it("UPDATE trades SET amount = c| — restrictedExpression — scalar only, no aggregates", () => {
      assertAtPosition("UPDATE trades SET amount = c", {
        hasFunction: ["coalesce", "concat", "ceil"],
        noFunction: ["count", "count_distinct"],
      })
    })
  })

  // ---------------------------------------------------------------------------
  // DDL statements
  // ---------------------------------------------------------------------------

  describe("CREATE TABLE / VIEW / MATERIALIZED VIEW", () => {
    it("CREATE | — DDL keywords (TABLE/VIEW/INDEX/...)", () => {
      assertAtPosition("CREATE ", { hasKeyword: ["TABLE"] })
    })

    it("CREATE TABLE x (id i| — data type keywords, no scalar functions", () => {
      assertAtPosition("CREATE TABLE x (id i", {
        hasKeyword: ["INT"],
        noFunction: ["isOrdered"],
      })
    })

    it("CREATE TABLE x (...) PARTITION B| — BY", () => {
      assertAtPosition("CREATE TABLE x (id INT) PARTITION B", {
        hasKeyword: ["BY"],
      })
    })

    it("CREATE OR | — REPLACE", () => {
      assertAtPosition("CREATE OR ", { hasKeyword: ["REPLACE"] })
    })
  })

  describe("ALTER TABLE", () => {
    it("ALTER | — TABLE / MATERIALIZED / USER / GROUP / ...", () => {
      assertAtPosition("ALTER ", { hasKeyword: ["TABLE"] })
    })

    it("ALTER TABLE m| — tableName — no functions", () => {
      assertAtPosition("ALTER TABLE m", {
        noFunction: ["max", "materialized_views"],
      })
    })

    it("ALTER TABLE trades A| — sub-action keywords (ADD/ATTACH/...)", () => {
      assertAtPosition("ALTER TABLE trades A", { hasKeyword: ["ADD"] })
    })

    it("ALTER TABLE trades DROP COLUMN p| — columnReference — columns only, no functions", () => {
      assertAtPosition("ALTER TABLE trades DROP COLUMN p", {
        hasColumn: ["price"],
        noFunction: ["max", "materialized_views"],
      })
    })
  })

  describe("DROP / TRUNCATE", () => {
    it("DROP T| — TABLE", () => {
      assertAtPosition("DROP T", { hasKeyword: ["TABLE"] })
    })

    it("DROP TABLE m| — tableName — no functions, not even tableValued meta fns", () => {
      assertAtPosition("DROP TABLE m", {
        noFunction: ["materialized_views", "max"],
      })
    })

    it("TRUNCATE TABLE m| — tableName — no functions", () => {
      assertAtPosition("TRUNCATE TABLE m", {
        noFunction: ["materialized_views", "max"],
      })
    })
  })

  // ---------------------------------------------------------------------------
  // Compound / wrapped statements
  // ---------------------------------------------------------------------------

  describe("WITH (CTE)", () => {
    it("WITH cte AS (S| — SELECT keyword inside CTE body", () => {
      assertAtPosition("WITH cte AS (S", { hasKeyword: ["SELECT"] })
    })

    it("WITH cte AS (...) SELECT * FROM c| — CTE name shows up alongside tables", () => {
      const sql = "WITH cte AS (SELECT * FROM trades) SELECT * FROM c"
      const labels = provider
        .getSuggestions(sql, sql.length)
        .map((s) => s.label)
      expect(labels).toContain("cte")
    })
  })

  describe("PIVOT", () => {
    it("trades PIVOT (s| — aggregation slot — aggregates allowed", () => {
      assertAtPosition("trades PIVOT (s", { hasFunction: ["sum", "stddev"] })
    })
  })

  describe("JOIN flavors — all classify as tableSource", () => {
    for (const form of [
      "JOIN",
      "LEFT JOIN",
      "INNER JOIN",
      "CROSS JOIN",
      "ASOF JOIN",
      "LT JOIN",
      "SPLICE JOIN",
    ]) {
      it(`SELECT * FROM trades ${form} m| — tables + tableValued; no scalars`, () => {
        assertAtPosition(`SELECT * FROM trades ${form} m`, {
          hasFunction: ["materialized_views", "memory_metrics"],
          noFunction: ["max", "min", "mode"],
        })
      })
    }

    it("SELECT * FROM trades JOIN orders ON p| — expression — columns + scalars", () => {
      assertAtPosition("SELECT * FROM trades JOIN orders ON p", {
        hasColumn: ["price"],
        hasFunction: ["power", "position"],
        noFunction: ["materialized_views"],
      })
    })
  })

  describe("EXPLAIN", () => {
    it("EXPLAIN S| — wrapped statement keywords", () => {
      assertAtPosition("EXPLAIN S", { hasKeyword: ["SELECT"] })
    })

    it("EXPLAIN SELECT * FROM m| — wrapped FROM is still tableSource", () => {
      assertAtPosition("EXPLAIN SELECT * FROM m", {
        hasFunction: ["materialized_views"],
        noFunction: ["max", "min"],
      })
    })
  })

  describe("SHOW", () => {
    it("SHOW T| — sub-keywords (TABLES/...)", () => {
      assertAtPosition("SHOW T", { hasKeyword: ["TABLES"] })
    })

    it("SHOW CREATE T| — TABLE/VIEW/MATERIALIZED", () => {
      assertAtPosition("SHOW CREATE T", { hasKeyword: ["TABLE"] })
    })
  })

  // ---------------------------------------------------------------------------
  // Regression scenarios — the exact bugs that motivated this plan
  // ---------------------------------------------------------------------------

  describe("Regression scenarios (bugs that motivated this plan)", () => {
    it("trades ASOF JOIN m| — was leaking max/min/maxUncommittedRows", () => {
      assertAtPosition("trades ASOF JOIN m", {
        hasFunction: ["materialized_views"],
        noFunction: ["max", "median"],
      })
    })

    it("WHERE price = c| — was mixing aggregates (count) with scalars", () => {
      assertAtPosition("SELECT * FROM trades WHERE price = c", {
        hasFunction: ["coalesce"],
        noFunction: ["count", "count_distinct", "materialized_views"],
      })
    })

    it("LIMIT | — was suggesting every function", () => {
      const sugs = provider.getSuggestions(
        "SELECT * FROM trades LIMIT ",
        "SELECT * FROM trades LIMIT ".length,
      )
      const fns = sugs.filter((s) => s.kind === SuggestionKind.Function)
      expect(fns).toHaveLength(0)
    })

    it("WHERE id IN (SELECT c| — nested subquery restores aggregates", () => {
      // Inner SELECT inside WHERE IN should NOT inherit predicate restriction;
      // aggregates are valid for the inner aggregation.
      assertAtPosition("SELECT * FROM trades WHERE id IN (SELECT c", {
        hasFunction: ["count", "coalesce"],
      })
    })

    it("UPDATE x SET y = (SELECT c| — nested subquery restores aggregates", () => {
      assertAtPosition("UPDATE trades SET price = (SELECT c", {
        hasFunction: ["count", "coalesce"],
      })
    })

    it("JOIN orders ON c| — predicate context, no aggregates", () => {
      assertAtPosition("SELECT * FROM trades JOIN orders ON c", {
        hasFunction: ["coalesce", "concat"],
        noFunction: ["count", "count_distinct"],
      })
    })

    it("DECLARE @x := c| — assignment is restricted, no aggregates", () => {
      assertAtPosition("DECLARE @x := c", {
        hasFunction: ["coalesce"],
        noFunction: ["count", "count_distinct"],
      })
    })

    it("FROM gen| — generate_series suggested as table-valued", () => {
      assertAtPosition("SELECT * FROM gen", {
        hasFunction: ["generate_series"],
      })
    })

    it("FROM long| — long_sequence suggested as table-valued", () => {
      assertAtPosition("SELECT * FROM long", {
        hasFunction: ["long_sequence"],
      })
    })

    it("SELECT b| — bar (scalar) suggested in expression context", () => {
      assertAtPosition("SELECT b", { hasFunction: ["bar"] })
    })

    it("SELECT s| — sparkline (aggregate) suggested in expression context", () => {
      assertAtPosition("SELECT s", { hasFunction: ["sparkline"] })
    })

    it("SELECT * FROM trades WHERE col = s| — sparkline NOT suggested (aggregate)", () => {
      assertAtPosition("SELECT * FROM trades WHERE price = s", {
        noFunction: ["sparkline"],
      })
    })
  })
})
