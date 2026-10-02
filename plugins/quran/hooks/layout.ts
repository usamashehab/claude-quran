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

// Letters that join the letter after them, so a kashida (ـ) may follow them.
const DUAL_JOINING = /[بتثجحخسشصضطظعغفقكلمنهيىئ]/
const LETTER = /[\u0620-\u064A\u0671-\u06D3]/
const ALEF = /[اأإآٱ]/

// The word with one kashida at its last joint, as the Mushaf stretches a line;
// undefined when no joint takes one.
export function kashida(word: string): string | undefined {
  const chars = Array.from(word)
  let at = -1
  chars.forEach((char, i) => {
    if (!DUAL_JOINING.test(char)) {
      return
    }
    let next = i + 1
    while (next < chars.length && /\p{M}/u.test(chars[next] ?? '')) {
      next++
    }
    const following = chars[next]
    // Lam then alef is one ligature; a kashida would split it.
    if (following && LETTER.test(following) && following !== 'ء' && !(char === 'ل' && ALEF.test(following))) {
      at = next
    }
  })

  return at === -1 ? undefined : [...chars.slice(0, at), 'ـ', ...chars.slice(at)].join('')
}

// Takes up to half of `free` with kashidas, one per word, longest words first.
function stretch(line: Token[], free: number): Token[] {
  const stretched = [...line]
  let budget = Math.floor(free / 2)
  const longestFirst = line
    .map((token, index) => ({ index, size: cells(token.text), isWord: token.tone === 'text' }))
    .filter(one => one.isWord && one.size >= 3)
    .sort((a, b) => b.size - a.size)
  for (const { index } of longestFirst) {
    if (budget === 0) {
      break
    }
    const token = stretched[index]
    const longer = token && kashida(token.text)
    if (token && longer) {
      stretched[index] = { ...token, text: longer }
      budget--
    }
  }

  return stretched
}

const widthOf = (line: Token[]) => line.reduce((sum, token) => sum + cells(token.text), 0)

// One line stretched to `width`, first by kashida and then by widening the gaps
// between words, or centred.
export function justify(words: Token[], width: number, isCentred: boolean): Piece[] {
  const gaps = words.length - 1
  // A line of one word cannot stretch.
  const centre = isCentred || gaps === 0
  const line = centre ? words : stretch(words, width - widthOf(words) - gaps)
  const used = widthOf(line)
  const free = Math.max(0, width - used - gaps)
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

// The cells a line takes with single spaces between its tokens.
export const naturalWidth = (line: Token[]) => widthOf(line) + Math.max(0, line.length - 1)

// Reflows tokens into lines of `width`: each justified, the last centred.
export function layout(tokens: Token[], width: number): Piece[][] {
  const lines = fill(tokens, width)

  return lines.map((line, index) => justify(line, width, index === lines.length - 1))
}
