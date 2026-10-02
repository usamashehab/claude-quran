// Lays a page's ayahs out as justified Mushaf lines of a fixed cell width.

export type Tone = 'text' | 'marker' | 'symbol'
// `ayah` is the ayah's index on the page; null for a gap between two ayahs.
export type Piece = { text: string; ayah: number | null; tone: Tone }
export type Token = { text: string; ayah: number; tone: Tone }

// Terminal cells a string takes: combining marks (tashkeel) take none.
export const cells = (text: string) => {
  let count = 0
  for (const char of text) {
    if (!/[\p{M}‌‍]/u.test(char)) {
      count++
    }
  }

  return count
}

function fill(tokens: Token[], width: number): Token[][] {
  const lines: Token[][] = []
  let line: Token[] = []
  let used = 0
  for (const token of tokens) {
    const size = cells(token.text)
    if (line.length > 0 && used + 1 + size > width) {
      lines.push(line)
      line = []
      used = 0
    }
    used += (line.length > 0 ? 1 : 0) + size
    line.push(token)
  }
  if (line.length > 0) {
    lines.push(line)
  }

  return lines
}

function merge(pieces: Piece[]): Piece[] {
  const merged: Piece[] = []
  for (const piece of pieces) {
    const last = merged.at(-1)
    if (last && last.ayah === piece.ayah && last.tone === piece.tone) {
      last.text += piece.text
    } else {
      merged.push({ ...piece })
    }
  }

  return merged
}

// One line stretched to `width` by widening the gaps between words, or centred.
export function justify(line: Token[], width: number, isCentred: boolean): Piece[] {
  const used = line.reduce((sum, token) => sum + cells(token.text), 0)
  const gaps = line.length - 1
  const free = Math.max(0, width - used - gaps)
  // A line of one word cannot stretch.
  const centre = isCentred || gaps === 0
  const pieces: Piece[] = []
  const left = centre ? Math.floor(free / 2) : 0
  if (left > 0) {
    pieces.push({ text: ' '.repeat(left), ayah: null, tone: 'text' })
  }
  line.forEach((token, at) => {
    if (at > 0) {
      const extra = centre ? 0 : Math.floor(free / gaps) + (at <= free % gaps ? 1 : 0)
      const before = line[at - 1]
      const ayah = before && before.ayah === token.ayah ? token.ayah : null
      pieces.push({ text: ' '.repeat(1 + extra), ayah, tone: 'text' })
    }
    pieces.push({ text: token.text, ayah: token.ayah, tone: token.tone })
  })
  const right = width - left - used - gaps - (centre ? 0 : free)
  if (right > 0) {
    pieces.push({ text: ' '.repeat(right), ayah: null, tone: 'text' })
  }

  return merge(pieces)
}

// Reflows tokens into lines of `width`: each justified, the last centred.
export function layout(tokens: Token[], width: number): Piece[][] {
  const lines = fill(tokens, width)

  return lines.map((line, index) => justify(line, width, index === lines.length - 1))
}
