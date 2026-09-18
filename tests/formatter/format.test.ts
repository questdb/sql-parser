import { describe, expect, it } from "vitest"
import { format } from "../../src/formatter/index"
import { fixtures } from "./fixtures"
import { assertPreserved } from "./oracles"

describe("format fixtures", () => {
  it.each(fixtures.map((fixture) => [fixture.name, fixture] as const))(
    "%s",
    (_name, fixture) => {
      // When
      const output = format(fixture.input, fixture.options)

      // Then
      expect(output).toBe(fixture.expected)
      assertPreserved(fixture.input, fixture.options)
    },
  )
})

describe("format options", () => {
  it("rejects an indent that is not whitespace", () => {
    expect(() => format("SELECT 1", { indent: "--" })).toThrow(TypeError)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects maxLineWidth %s",
    (maxLineWidth) => {
      expect(() => format("SELECT 1", { maxLineWidth })).toThrow(TypeError)
    },
  )

  it("returns an empty string for whitespace input", () => {
    expect(format("  \n ")).toBe("")
  })
})
