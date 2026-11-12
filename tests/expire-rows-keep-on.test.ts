/**
 * EXPIRE ROWS KEEP [N] HIGHEST|LOWEST ON <col> and the WHEN ... IN VOLUME
 * boundary (questdb/questdb#7263, reports §1.3).
 *
 * Server grammar (SqlParser.parseExpireRowsClause, expireRowsClauseBoundary):
 *   EXPIRE ROWS WHEN <predicate> [CLEANUP EVERY <duration>]
 *   EXPIRE ROWS KEEP LATEST [ON <ts>] PARTITION BY <cols> [CLEANUP EVERY ...]
 *   EXPIRE ROWS KEEP [<N>] HIGHEST|LOWEST ON <col> [PARTITION BY <cols>]
 *     [CLEANUP EVERY ...]
 * `ON` is required in the HIGHEST/LOWEST form (expectTok "on"). In CREATE
 * MATERIALIZED VIEW the WHEN predicate ends at `IN VOLUME` (the tail clause).
 *
 * Server queries for this feature live in tests/fixtures/server-queries.json.
 */

import { describe, it, expect } from "vitest"
import { parseToAst, getNextValidTokens } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const parseOne = (sql: string): AST.Statement => {
  const result = parseToAst(sql)
  expect(result.errors.map((e) => e.message)).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0]
}

/** true when sql is rejected or does not read as a single statement */
const rejected = (sql: string) => {
  const result = parseToAst(sql)
  return result.errors.length > 0 || result.ast.length !== 1
}

const MV = "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM base)"
const ALTER = "ALTER MATERIALIZED VIEW mv SET"

const createExpire = (sql: string): AST.ExpireRowsClause => {
  const stmt = parseOne(sql) as AST.CreateMaterializedViewStatement
  expect(stmt.type).toBe("createMaterializedView")
  return stmt.expireRows!
}

describe("KEEP HIGHEST|LOWEST ON <col>", () => {
  it("parses KEEP HIGHEST ON col PARTITION BY keys", () => {
    expect(
      createExpire(`${MV} EXPIRE ROWS KEEP HIGHEST ON v PARTITION BY k, j`),
    ).toEqual({
      mode: "keepExtremum",
      extremum: "highest",
      column: "v",
      partitionBy: ["k", "j"],
    })
  })

  it("parses KEEP N LOWEST ON col without PARTITION BY", () => {
    expect(createExpire(`${MV} EXPIRE ROWS KEEP 3 LOWEST ON v`)).toEqual({
      mode: "keepExtremum",
      extremum: "lowest",
      column: "v",
      keepCount: 3,
    })
  })

  it("parses a quoted column and CLEANUP EVERY", () => {
    expect(
      createExpire(
        `${MV} EXPIRE ROWS KEEP HIGHEST ON "my val" PARTITION BY k CLEANUP EVERY 30m`,
      ),
    ).toEqual({
      mode: "keepExtremum",
      extremum: "highest",
      column: "my val",
      partitionBy: ["k"],
      cleanupEvery: "30m",
    })
  })

  it("parses ALTER MATERIALIZED VIEW ... SET EXPIRE ROWS KEEP ... ON", () => {
    const stmt = parseOne(
      `${ALTER} EXPIRE ROWS KEEP 2 LOWEST ON v PARTITION BY k`,
    ) as AST.AlterMaterializedViewStatement
    expect(stmt.action).toEqual({
      actionType: "setExpireRows",
      expireRows: {
        mode: "keepExtremum",
        extremum: "lowest",
        column: "v",
        keepCount: 2,
        partitionBy: ["k"],
      },
    })
  })

  it.each([
    [
      `${MV} EXPIRE ROWS KEEP HIGHEST ON v PARTITION BY k`,
      `${MV} EXPIRE ROWS KEEP HIGHEST ON v PARTITION BY k`,
    ],
    [
      `${MV} expire rows keep 1 lowest on v cleanup every 1h`,
      `${MV} EXPIRE ROWS KEEP 1 LOWEST ON v CLEANUP EVERY 1h`,
    ],
    [
      `${ALTER} EXPIRE ROWS KEEP HIGHEST ON "a b" PARTITION BY k`,
      `${ALTER} EXPIRE ROWS KEEP HIGHEST ON "a b" PARTITION BY k`,
    ],
  ])("toSql prints ON: %s", (sql, expected) => {
    const out = toSql(parseOne(sql))
    expect(out).toBe(expected)
    expect(toSql(parseOne(out))).toBe(out)
  })

  it.each([
    `${MV} EXPIRE ROWS KEEP HIGHEST v PARTITION BY k`,
    `${MV} EXPIRE ROWS KEEP 2 LOWEST v`,
    `${MV} EXPIRE ROWS KEEP HIGHEST ON PARTITION BY k`,
    `${ALTER} EXPIRE ROWS KEEP HIGHEST v PARTITION BY k`,
    `${ALTER} EXPIRE ROWS KEEP LOWEST v`,
  ])("rejects the form without a column after ON: %s", (sql) => {
    expect(rejected(sql)).toBe(true)
  })

  it("keeps KEEP LATEST [ON ts] working", () => {
    expect(
      createExpire(`${MV} EXPIRE ROWS KEEP LATEST ON ts PARTITION BY k`),
    ).toEqual({ mode: "keepLatest", on: "ts", partitionBy: ["k"] })
    expect(
      createExpire(`${MV} EXPIRE ROWS KEEP LATEST PARTITION BY k, j`),
    ).toEqual({ mode: "keepLatest", partitionBy: ["k", "j"] })
  })
})

describe("WHEN predicate ends at IN VOLUME", () => {
  it("reads IN VOLUME as the mat view volume clause", () => {
    const stmt = parseOne(
      `${MV} EXPIRE ROWS WHEN v < 2.0 IN VOLUME 'v1'`,
    ) as AST.CreateMaterializedViewStatement
    expect(stmt.volume).toBe("v1")
    expect(stmt.expireRows?.mode).toBe("when")
    expect(toSql(stmt)).toBe(`${MV} EXPIRE ROWS WHEN v < 2.0 IN VOLUME v1`)
  })

  it("stops before IN VOLUME with OWNED BY after it", () => {
    const stmt = parseOne(
      `${MV} EXPIRE ROWS WHEN v < 2 IN VOLUME vol1 OWNED BY 'g'`,
    ) as AST.CreateMaterializedViewStatement
    expect(stmt.volume).toBe("vol1")
    expect(stmt.ownedBy).toBe("g")
    expect(toSql(stmt)).toBe(
      `${MV} EXPIRE ROWS WHEN v < 2 IN VOLUME vol1 OWNED BY g`,
    )
  })

  it("stops before IN VOLUME after CLEANUP EVERY and after KEEP", () => {
    expect(
      toSql(
        parseOne(
          `${MV} EXPIRE ROWS WHEN v < 2 CLEANUP EVERY 1h IN VOLUME vol1`,
        ),
      ),
    ).toBe(`${MV} EXPIRE ROWS WHEN v < 2 CLEANUP EVERY 1h IN VOLUME vol1`)
    expect(
      toSql(parseOne(`${MV} EXPIRE ROWS KEEP LOWEST ON v IN VOLUME 'vol1'`)),
    ).toBe(`${MV} EXPIRE ROWS KEEP LOWEST ON v IN VOLUME vol1`)
  })

  it("keeps the IN operator inside the predicate", () => {
    expect(
      toSql(
        parseOne(
          `${MV} EXPIRE ROWS WHEN k IN ('a', 'b') AND v IN (1, 2) IN VOLUME vol1`,
        ),
      ),
    ).toBe(
      `${MV} EXPIRE ROWS WHEN k IN ('a', 'b') AND v IN (1, 2) IN VOLUME vol1`,
    )
    expect(toSql(parseOne(`${MV} EXPIRE ROWS WHEN ts IN '2024-01-01'`))).toBe(
      `${MV} EXPIRE ROWS WHEN ts IN '2024-01-01'`,
    )
  })

  it("leaves `x IN volume` alone outside EXPIRE ROWS", () => {
    expect(toSql(parseOne("SELECT * FROM t WHERE x IN volume"))).toBe(
      "SELECT * FROM t WHERE x IN volume",
    )
  })

  it("does not read IN VOLUME as part of an ALTER predicate", () => {
    // ALTER ... SET EXPIRE ROWS has no IN VOLUME tail; the server keeps
    // IN VOLUME in the predicate text and fails, so this must not parse
    // as one clean statement.
    expect(rejected(`${ALTER} EXPIRE ROWS WHEN v < 2 IN VOLUME vol1`)).toBe(
      true,
    )
  })
})

describe("autocomplete", () => {
  it("suggests ON after KEEP HIGHEST|LOWEST", () => {
    expect(getNextValidTokens(`${MV} EXPIRE ROWS KEEP HIGHEST `)).toEqual([
      "On",
    ])
    expect(getNextValidTokens(`${ALTER} EXPIRE ROWS KEEP 2 LOWEST `)).toEqual([
      "On",
    ])
  })

  it("suggests HIGHEST, LOWEST after KEEP <N>", () => {
    expect([...getNextValidTokens(`${MV} EXPIRE ROWS KEEP 2 `)].sort()).toEqual(
      ["Highest", "Lowest"],
    )
  })

  it("suggests the clause tail after KEEP HIGHEST ON col", () => {
    const tokens = getNextValidTokens(`${MV} EXPIRE ROWS KEEP HIGHEST ON v `)
    expect(tokens).toEqual(
      expect.arrayContaining(["Partition", "Cleanup", "In", "Owned"]),
    )
  })
})
