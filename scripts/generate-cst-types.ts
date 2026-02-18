import { generateCstDts } from "@chevrotain/cst-dts-gen"
import { parser } from "../src/parser/parser.ts"
import { writeFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(__dirname, "../src/parser/cst-types.d.ts")

const dts = generateCstDts(parser.getGAstProductions())
writeFileSync(outPath, dts)

console.log(`Written ${outPath}`)
