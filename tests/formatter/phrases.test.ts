import { describe, expect, it } from "vitest"
import { scan, StreamToken } from "../../src/formatter/lexer"
import { clausePhrases, matchPhrase } from "../../src/formatter/phrases"

const indexOfImage = (tokens: StreamToken[], image: string) =>
  tokens.findIndex((token) => token.image.toUpperCase() === image)

const matchAt = (
  sql: string,
  image: string,
  kind: keyof typeof clausePhrases = "select",
) => {
  const tokens = scan(sql)
  const match = matchPhrase(
    tokens,
    indexOfImage(tokens, image),
    clausePhrases[kind],
  )
  return match === null ? null : match.phrase.names.join(" ")
}

describe("matchPhrase", () => {
  it("matches a two-word phrase across one space", () => {
    expect(matchAt("SELECT * FROM t LATEST ON ts", "LATEST")).toBe("Latest On")
  })

  it("matches across several spaces and a newline", () => {
    expect(matchAt("SELECT * FROM t LATEST  \n  ON ts", "LATEST")).toBe(
      "Latest On",
    )
  })

  it("matches regardless of keyword case", () => {
    expect(matchAt("select * from t latest on ts", "LATEST")).toBe("Latest On")
  })

  it("prefers the longest phrase", () => {
    expect(matchAt("SELECT 1 UNION ALL SELECT 2", "UNION")).toBe("Union All")
    expect(matchAt("SELECT 1 UNION SELECT 2", "UNION")).toBe("Union")
    expect(matchAt("SELECT * FROM a LEFT OUTER JOIN b ON x", "LEFT")).toBe(
      "Left Outer Join",
    )
  })

  it("stops at a comment between phrase words", () => {
    expect(matchAt("SELECT * FROM t LATEST /* x */ ON ts", "LATEST")).toBeNull()
    expect(matchAt("SELECT * FROM t LATEST -- x\n ON ts", "LATEST")).toBeNull()
  })

  it("stops at an opaque token between phrase words", () => {
    expect(matchAt("SELECT * FROM t LATEST $ ON ts", "LATEST")).toBeNull()
  })

  it("does not match a keyword-shaped identifier as a clause", () => {
    // Given
    const tokens = scan("SELECT status, type FROM t")

    // When / Then
    expect(
      matchPhrase(tokens, indexOfImage(tokens, "STATUS"), clausePhrases.select),
    ).toBeNull()
    expect(
      matchPhrase(tokens, indexOfImage(tokens, "TYPE"), clausePhrases.select),
    ).toBeNull()
  })

  it("keeps table options inline and matches DEDUP only for CREATE kinds", () => {
    // Given
    const sql =
      "CREATE TABLE t (a INT) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts)"

    // When / Then
    expect(matchAt(sql, "TIMESTAMP", "createTable")).toBeNull()
    expect(matchAt(sql, "PARTITION", "createTable")).toBeNull()
    expect(matchAt(sql, "WAL", "createTable")).toBeNull()
    expect(matchAt(sql, "DEDUP", "createTable")).toBe("Dedup")
    expect(matchAt(sql, "DEDUP", "select")).toBeNull()
  })

  it("matches alter actions after the table name", () => {
    expect(
      matchAt("ALTER TABLE t ADD COLUMN v SYMBOL", "ADD", "alterTable"),
    ).toBe("Add Column")
    expect(
      matchAt("ALTER TABLE t ALTER COLUMN v ADD INDEX", "ALTER", "alterTable"),
    ).toBe("Alter Table")
  })

  it("has no phrases for other statements", () => {
    expect(matchAt("DROP TABLE t", "DROP", "other")).toBeNull()
  })

  it("returns the index after the last matched token", () => {
    // Given
    const tokens = scan("SELECT * FROM t SAMPLE BY 1h")

    // When
    const match = matchPhrase(
      tokens,
      indexOfImage(tokens, "SAMPLE"),
      clausePhrases.select,
    )

    // Then
    expect(tokens[match!.endIndex].kind).toBe("whitespace")
    expect(tokens[match!.endIndex + 1].image).toBe("1h")
  })
})
