export type Doc =
  | { type: "text"; text: string }
  | { type: "gap"; text: string }
  | { type: "line"; flat: string }
  | { type: "hardline" }
  | { type: "concat"; parts: Doc[] }
  | { type: "group"; doc: Doc }
  | { type: "indent"; doc: Doc }
  | { type: "verbatim"; text: string }

export const text = (value: string): Doc => ({ type: "text", text: value })
export const gap = (value: string): Doc => ({ type: "gap", text: value })
export const line = (flat: string): Doc => ({ type: "line", flat })
export const hardline: Doc = { type: "hardline" }
export const concat = (parts: Doc[]): Doc => ({ type: "concat", parts })
export const group = (doc: Doc): Doc => ({ type: "group", doc })
export const indent = (doc: Doc): Doc => ({ type: "indent", doc })
export const verbatim = (value: string): Doc => ({
  type: "verbatim",
  text: value,
})

export const asLine = (leading: Doc): Doc =>
  leading.type === "gap" ? line(leading.text) : leading

export type PrintOptions = {
  indent: string
  maxLineWidth: number
}

type Mode = "flat" | "break"

type Command = { level: number; mode: Mode; doc: Doc }

const firstLineLength = (value: string) => {
  const newline = value.indexOf("\n")
  return newline === -1 ? value.length : newline
}

const fits = (next: Command, rest: Command[], width: number): boolean => {
  let remaining = width
  let restIndex = rest.length - 1
  const stack: Command[] = [next]

  while (remaining >= 0) {
    const command = stack.pop()
    if (command === undefined) {
      if (restIndex < 0) return true
      stack.push(rest[restIndex--])
      continue
    }
    const { level, mode, doc } = command
    switch (doc.type) {
      case "text":
      case "gap":
        remaining -= doc.text.length
        break
      case "line":
        if (mode === "break") return true
        remaining -= doc.flat.length
        break
      case "hardline":
        return mode === "break"
      case "verbatim":
        remaining -= firstLineLength(doc.text)
        if (doc.text.includes("\n")) return remaining >= 0
        break
      case "concat":
        for (let i = doc.parts.length - 1; i >= 0; i--) {
          stack.push({ level, mode, doc: doc.parts[i] })
        }
        break
      case "group":
      case "indent":
        stack.push({ level, mode, doc: doc.doc })
        break
    }
  }
  return false
}

export const printDoc = (doc: Doc, options: PrintOptions): string => {
  const out: string[] = []
  let column = 0
  let pendingGap = ""
  let lineHasContent = false
  let indentIndex = -1
  const commands: Command[] = [{ level: 0, mode: "break", doc }]

  const emit = (value: string) => {
    if (pendingGap !== "") {
      out.push(pendingGap)
      column += pendingGap.length
      pendingGap = ""
    }
    out.push(value)
    lineHasContent = true
  }

  const newline = (level: number) => {
    const indentation = options.indent.repeat(level)
    pendingGap = ""
    if (!lineHasContent) {
      if (indentIndex >= 0) out[indentIndex] = indentation
      column = indentation.length
      return
    }
    out.push("\n")
    indentIndex = out.push(indentation) - 1
    column = indentation.length
    lineHasContent = false
  }

  while (commands.length > 0) {
    const command = commands.pop()!
    const { level, mode, doc: current } = command
    switch (current.type) {
      case "text":
        emit(current.text)
        column += current.text.length
        break
      case "gap":
        pendingGap = current.text
        break
      case "line":
        if (mode === "flat") pendingGap = current.flat
        else newline(level)
        break
      case "hardline":
        newline(level)
        break
      case "verbatim": {
        emit(current.text)
        const lastNewline = current.text.lastIndexOf("\n")
        column =
          lastNewline === -1
            ? column + current.text.length
            : current.text.length - lastNewline - 1
        break
      }
      case "concat":
        for (let i = current.parts.length - 1; i >= 0; i--) {
          commands.push({ level, mode, doc: current.parts[i] })
        }
        break
      case "indent":
        commands.push({ level: level + 1, mode, doc: current.doc })
        break
      case "group": {
        if (mode === "flat") {
          commands.push({ level, mode: "flat", doc: current.doc })
          break
        }
        const flat: Command = { level, mode: "flat", doc: current.doc }
        const width = options.maxLineWidth - column - pendingGap.length
        commands.push(
          fits(flat, commands, width)
            ? flat
            : { level, mode: "break", doc: current.doc },
        )
        break
      }
    }
  }

  if (!lineHasContent && indentIndex >= 0) out.length = indentIndex - 1
  return out.join("")
}
