import { describe, expect, it } from "vitest"
import { format, parseToAst, toSql } from "../../src/index"
import { assertPreserved } from "./oracles"

describe.each([false, true])(
  "password formatting (capitalize=%s)",
  (capitalize) => {
    const options = { capitalize }

    it.each(["pass@2026", "@123", "abc@", "@", "case@123", "P@ssw0rd", "$1"])(
      "preserves the password %s in user and service-account statements",
      (password) => {
        for (const statement of [
          `create user u with password ${password}`,
          `alter user u with password ${password}`,
          `create service account sa with password ${password} owned by g`,
          `alter service account sa with password ${password}`,
        ]) {
          const before = parseToAst(statement)
          expect(before.errors).toEqual([])
          const output = format(statement, options)
          const after = parseToAst(output)
          expect(output).toContain(password)
          expect(after.errors).toEqual([])
          expect(after.ast).toEqual(before.ast)
          expect(format(output, options)).toBe(output)
          if (!capitalize) assertPreserved(statement)
        }
      },
    )

    it("preserves password boundaries across comments, quoted values and statements", () => {
      const sql =
        "create user u with password /* explanation */ pass@2026; " +
        "create service account sa with password 'P@123'owned by g; " +
        "alter user u with password @456"
      const output = format(sql, options)
      expect(parseToAst(output).errors).toEqual([])
      expect(parseToAst(output).ast).toEqual(parseToAst(sql).ast)
      expect(format(output, options)).toBe(output)
      if (!capitalize) assertPreserved(sql)
    })

    it("protects a password even when another statement has unsupported syntax", () => {
      const output = format(
        "select 1 between(0, 2); create user u with password pass@2026",
        options,
      )
      const user = output.slice(output.indexOf(";") + 1)
      expect(parseToAst(user).errors).toEqual([])
      expect(toSql(parseToAst(user).ast)).toBe(
        "CREATE USER u WITH PASSWORD 'pass@2026'",
      )
    })

    it("keeps ordinary variable expressions and password-named columns formatted", () => {
      const sql = "declare @amount := 1 select password, @amount+1 from t"
      expect(format(sql, options)).toBe(
        capitalize
          ? "DECLARE @amount := 1\nSELECT password, @amount + 1\nFROM t"
          : "declare @amount := 1\nselect password, @amount + 1\nfrom t",
      )
    })
  },
)
