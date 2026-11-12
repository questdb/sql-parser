/**
 * Window frame GROUPS mode and EXCLUDE GROUP / EXCLUDE TIES (reports §3.2).
 *
 * Server: ExpressionParser.parseWindowSpec accepts the frame modes
 * ROWS | RANGE | GROUPS | CUMULATIVE, and parseWindowFrameClause accepts
 * EXCLUDE CURRENT ROW | GROUP | TIES | NO OTHERS (#6626). The same spec parser
 * is used for inline OVER (...) and named WINDOW w AS (...).
 *
 * Statement-level server queries live in tests/fixtures/server-queries.json
 * (feature "window-frames").
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const ok = (sql: string): AST.Statement[] => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast
}

const roundTrip = (sql: string) => toSql(ok(sql))

const fails = (sql: string) => {
  expect(parseToAst(sql).errors.length).toBeGreaterThan(0)
}

const overSpec = (sql: string): AST.WindowSpecification => {
  const select = ok(sql)[0] as AST.SelectStatement
  const item = select.columns[0] as AST.ExpressionSelectItem
  return (item.expression as AST.FunctionCall).over!
}

describe("GROUPS frame mode", () => {
  it("builds a windowFrame with mode groups", () => {
    const spec = overSpec(
      "SELECT sum(x) OVER (ORDER BY ts GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW) FROM t",
    )
    expect(spec.frame).toEqual({
      type: "windowFrame",
      mode: "groups",
      start: {
        type: "windowFrameBound",
        kind: "preceding",
        value: { type: "literal", value: 1, literalType: "number", raw: "1" },
      },
      end: { type: "windowFrameBound", kind: "currentRow" },
    })
  })

  it("round-trips single-bound and BETWEEN forms", () => {
    expect(
      roundTrip(
        "select sum(x) over (order by ts groups unbounded preceding) from t",
      ),
    ).toBe("SELECT sum(x) OVER (ORDER BY ts GROUPS UNBOUNDED PRECEDING) FROM t")
    expect(
      roundTrip(
        "select sum(x) over (partition by s order by ts groups between 2 preceding and 1 following) from t",
      ),
    ).toBe(
      "SELECT sum(x) OVER (PARTITION BY s ORDER BY ts GROUPS BETWEEN 2 PRECEDING AND 1 FOLLOWING) FROM t",
    )
  })

  it("works in a named WINDOW definition", () => {
    expect(
      roundTrip(
        "SELECT sum(x) OVER w FROM t WINDOW w AS (ORDER BY ts GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE TIES)",
      ),
    ).toBe(
      "SELECT sum(x) OVER w FROM t WINDOW w AS (ORDER BY ts GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE TIES)",
    )
    const select = ok(
      "SELECT sum(x) OVER w FROM t WINDOW w AS (ORDER BY ts GROUPS 1 PRECEDING)",
    )[0] as AST.SelectStatement
    expect(select.namedWindows?.[0].frame?.mode).toBe("groups")
  })

  it("works after an inherited base window", () => {
    expect(
      roundTrip(
        "SELECT sum(x) OVER w2 FROM t WINDOW w1 AS (PARTITION BY s), w2 AS (w1 ORDER BY ts GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE GROUP)",
      ),
    ).toBe(
      "SELECT sum(x) OVER w2 FROM t WINDOW w1 AS (PARTITION BY s), w2 AS (w1 ORDER BY ts GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE GROUP)",
    )
  })
})

describe("EXCLUDE GROUP / EXCLUDE TIES", () => {
  it("sets exclude on the frame", () => {
    expect(
      overSpec(
        "SELECT sum(x) OVER (ORDER BY ts ROWS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE GROUP) FROM t",
      ).frame?.exclude,
    ).toBe("group")
    expect(
      overSpec(
        "SELECT sum(x) OVER (ORDER BY ts RANGE BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE TIES) FROM t",
      ).frame?.exclude,
    ).toBe("ties")
    expect(
      overSpec(
        "SELECT sum(x) OVER (ORDER BY ts ROWS 1 PRECEDING EXCLUDE CURRENT ROW) FROM t",
      ).frame?.exclude,
    ).toBe("currentRow")
    expect(
      overSpec(
        "SELECT sum(x) OVER (ORDER BY ts ROWS 1 PRECEDING EXCLUDE NO OTHERS) FROM t",
      ).frame?.exclude,
    ).toBe("noOthers")
  })

  it("round-trips every EXCLUDE form in every frame mode", () => {
    for (const mode of ["ROWS", "RANGE", "GROUPS"]) {
      for (const ex of ["CURRENT ROW", "GROUP", "TIES", "NO OTHERS"]) {
        const sql = `SELECT sum(x) OVER (ORDER BY ts ${mode} BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW EXCLUDE ${ex}) FROM t`
        expect(roundTrip(sql.toLowerCase())).toBe(sql)
      }
    }
  })

  it("rejects unknown exclusion forms", () => {
    fails("SELECT sum(x) OVER (ORDER BY ts ROWS 1 PRECEDING EXCLUDE) FROM t")
    fails(
      "SELECT sum(x) OVER (ORDER BY ts ROWS 1 PRECEDING EXCLUDE GROUPS) FROM t",
    )
    fails(
      "SELECT sum(x) OVER (ORDER BY ts ROWS 1 PRECEDING EXCLUDE NO TIES) FROM t",
    )
    fails(
      "SELECT sum(x) OVER (ORDER BY ts ROWS 1 PRECEDING EXCLUDE TIES OTHERS) FROM t",
    )
  })
})

describe("groups / ties stay identifiers", () => {
  it("as column, table and alias names", () => {
    expect(roundTrip("SELECT ties, groups FROM t")).toBe(
      "SELECT ties, groups FROM t",
    )
    expect(roundTrip("SELECT x AS ties FROM ties")).toBe(
      "SELECT x AS ties FROM ties",
    )
    expect(roundTrip("CREATE TABLE ties (ties INT, groups INT)")).toBe(
      "CREATE TABLE ties (ties INT, groups INT)",
    )
    expect(
      roundTrip(
        "SELECT sum(ties) OVER (ORDER BY groups ROWS 1 PRECEDING) FROM t",
      ),
    ).toBe("SELECT sum(ties) OVER (ORDER BY groups ROWS 1 PRECEDING) FROM t")
  })
})

describe("autocomplete", () => {
  it("suggests GROUPS as a frame mode after ORDER BY in OVER and WINDOW", () => {
    expect(getNextValidTokens("SELECT sum(x) OVER (ORDER BY ts ")).toContain(
      "Groups",
    )
    expect(
      getNextValidTokens(
        "SELECT sum(x) OVER w FROM t WINDOW w AS (ORDER BY ts ",
      ),
    ).toContain("Groups")
  })

  it("suggests GROUP and TIES after EXCLUDE", () => {
    const tokens = getNextValidTokens(
      "SELECT sum(x) OVER (ORDER BY ts ROWS BETWEEN 1 PRECEDING AND CURRENT ROW EXCLUDE ",
    )
    expect(tokens).toEqual(
      expect.arrayContaining(["Current", "Group", "Ties", "No"]),
    )
  })

  it("does not suggest TIES outside EXCLUDE", () => {
    expect(
      getNextValidTokens("SELECT sum(x) OVER (ORDER BY ts "),
    ).not.toContain("Ties")
    expect(getNextValidTokens("SELECT * FROM t ")).not.toContain("Ties")
  })
})
