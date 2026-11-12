/**
 * Single-quoted values in statement positions (passwords, aliases, partition
 * names, COPY options, time zones, ...) must round-trip unchanged: the visitor
 * turns `''` into `'` and toSql re-escapes it (reports §2 X4).
 *
 * The QuestDB server never unescapes `''` in these positions
 * (GenericLexer.unquote only strips the outer quotes), so the SQL text has to
 * survive exactly. Before this fix 'it''s' was printed as 'it''''s'.
 *
 * Single-quoted NAMES that toSql prints as "..." identifiers (FROM 'x',
 * INSERT INTO 'x', OWNED BY 'x', ...) keep the inner text verbatim: the server
 * reads FROM 'it''s' as table it''s (see questdb-ent EntShowCreateSupportTest:
 * CREATE USER 'o''brien' stores principal o''brien), which is exactly what
 * "it''s" means, so they must not be unescaped.
 */

import { describe, it, expect } from "vitest"
import { parseToAst } from "../src/index"
import { toSql } from "../src/parser/toSql"
import type * as AST from "../src/parser/ast"

const parseOne = <T extends AST.Statement>(sql: string): T => {
  const result = parseToAst(sql)
  expect(result.errors).toEqual([])
  expect(result.ast).toHaveLength(1)
  return result.ast[0] as T
}

const roundTrip = (sql: string) => toSql([parseOne(sql)])

describe("single-quoted values round-trip with '' escapes", () => {
  const sameText = [
    "CREATE USER bob WITH PASSWORD 'it''s'",
    "ALTER USER bob WITH PASSWORD 'it''s'",
    "CREATE SERVICE ACCOUNT svc WITH PASSWORD 'it''s'",
    "ALTER SERVICE ACCOUNT svc WITH PASSWORD 'it''s'",
    "CREATE GROUP g WITH EXTERNAL ALIAS 'cn=o''brien'",
    "ALTER GROUP g WITH EXTERNAL ALIAS 'cn=o''brien'",
    "ALTER GROUP g DROP EXTERNAL ALIAS 'cn=o''brien'",
    "ALTER USER bob CREATE TOKEN TYPE REST WITH TTL '1''d'",
    "ALTER USER bob CREATE TOKEN TYPE JWK WITH PUBLIC KEY X 'a''b' Y 'c''d'",
    "ALTER USER bob DROP TOKEN TYPE REST 'tok''en'",
    "COPY t FROM 'it''s.csv' WITH DELIMITER ''''",
    "COPY t TO 'it''s' WITH FORMAT parquet",
    "COPY 'it''s' CANCEL",
    "CANCEL QUERY 'it''s'",
    "CREATE TABLE t (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY IN VOLUME 'v''1'",
    "ALTER TABLE t DROP PARTITION LIST '2024''01'",
    "ALTER TABLE t DETACH PARTITION LIST '2024''01'",
    "ALTER TABLE t ATTACH PARTITION LIST '2024''01'",
    "ALTER TABLE t FORCE DROP PARTITION LIST '2024''01'",
    "ALTER TABLE t CONVERT PARTITION LIST '2024''01' TO PARQUET",
    "ALTER TABLE t SUSPEND WAL WITH 'c''1', 'm''sg'",
    "ALTER TABLE t REBASE WAL INTO 'd''ir'",
    "ALTER MATERIALIZED VIEW v REBASE WAL INTO 'd''ir'",
    "ALTER LIVE VIEW lv SUSPEND WAL WITH 'c''1', 'm''sg'",
    "REINDEX TABLE t PARTITION '2024''01' LOCK EXCLUSIVE",
    "REFRESH MATERIALIZED VIEW v RANGE FROM '2024''01' TO '2025''01'",
    "SELECT * FROM t SAMPLE BY 1h ALIGN TO CALENDAR TIME ZONE 'Europe/it''s' WITH OFFSET '00''15'",
    "CREATE MATERIALIZED VIEW v REFRESH EVERY 1h START '2024''01' TIME ZONE 'it''s' AS (SELECT ts, count() FROM t SAMPLE BY 1h)",
    "CREATE LIVE VIEW lv FLUSH EVERY 1s START FROM 'it''s' AS SELECT ts, x FROM base",
    "SELECT avg(x) OVER w FROM t WINDOW w AS (ORDER BY ts ANCHOR DAILY '09''30' 'Europe/it''s')",
  ]
  it.each(sameText)("%s", (sql) => {
    const out = roundTrip(sql)
    expect(out).toBe(sql)
    expect(roundTrip(out)).toBe(sql)
  })
})

describe("AST holds the unescaped value", () => {
  it("password", () => {
    const stmt = parseOne<AST.CreateUserStatement>(
      "CREATE USER bob WITH PASSWORD 'it''s'",
    )
    expect(stmt.password).toBe("it's")
  })

  it("COPY file and DELIMITER", () => {
    const stmt = parseOne<AST.CopyFromStatement>(
      "COPY t FROM 'it''s.csv' WITH DELIMITER ''''",
    )
    expect(stmt.file).toBe("it's.csv")
    expect(stmt.options).toEqual([
      { type: "copyOption", key: "DELIMITER", value: "'", quoted: true },
    ])
  })

  it("partition list", () => {
    const stmt = parseOne<AST.AlterTableStatement>(
      "ALTER TABLE t DROP PARTITION LIST '2024''01', 'b'",
    )
    expect((stmt.action as AST.DropPartitionAction).partitions).toEqual([
      "2024'01",
      "b",
    ])
  })

  it("external alias", () => {
    const stmt = parseOne<AST.CreateGroupStatement>(
      "CREATE GROUP g WITH EXTERNAL ALIAS 'cn=o''brien'",
    )
    expect(stmt.externalAlias).toBe("cn=o'brien")
  })

  it("strings without doubled quotes are unchanged", () => {
    const stmt = parseOne<AST.CreateUserStatement>(
      "CREATE USER bob WITH PASSWORD 'secret'",
    )
    expect(stmt.password).toBe("secret")
    expect(
      parseOne<AST.CreateUserStatement>("CREATE USER bob WITH PASSWORD ''")
        .password,
    ).toBe("")
  })
})

describe("single-quoted names keep the server's verbatim text", () => {
  it("FROM 'it''s' stays table it''s", () => {
    const stmt = parseOne<AST.SelectStatement>("SELECT * FROM 'it''s'")
    const from = stmt.from![0]
    expect((from.table as AST.QualifiedName).parts).toEqual(["it''s"])
    expect(roundTrip("SELECT * FROM 'it''s'")).toBe("SELECT * FROM \"it''s\"")
  })

  it("INSERT INTO 'it''s' stays table it''s", () => {
    expect(roundTrip("INSERT INTO 'it''s' VALUES (1)")).toBe(
      "INSERT INTO \"it''s\" VALUES (1)",
    )
  })

  it("OWNED BY 'o''brien' stays principal o''brien", () => {
    const stmt = parseOne<AST.CreateTableStatement>(
      "CREATE TABLE t (a INT) OWNED BY 'o''brien'",
    )
    expect(stmt.ownedBy).toBe("o''brien")
    expect(roundTrip("CREATE TABLE t (a INT) OWNED BY 'o''brien'")).toBe(
      "CREATE TABLE t (a INT) OWNED BY \"o''brien\"",
    )
  })

  it("string literals in expressions are still unescaped", () => {
    const stmt = parseOne<AST.SelectStatement>("SELECT 'it''s'")
    const item = stmt.columns[0] as { expression: AST.Literal }
    expect(item.expression.value).toBe("it's")
    expect(roundTrip("SELECT 'it''s'")).toBe("SELECT 'it''s'")
  })
})
