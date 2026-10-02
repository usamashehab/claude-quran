// Lays a page's ayahs out as justified Mushaf lines of a fixed cell width.
// `space` is the cells between two words: 2 when letters are spaced out, so a
// word break stays wider than the gap inside a word.

const LETTER = /[\u0620-\u064A\u0671-\u06D3]/

export type Tone = 'text' | 'marker' | 'symbol'
// `ayah` is the ayah's index on the page; null for a gap between two ayahs.
export type Piece = { text: string; ayah: number | null; tone: Tone }
export type Token = { text: string; ayah: number; tone: Tone }

// Terminal cells a string takes: combining marks (tashkeel) and format
// characters (direction marks, joiners) take none.
export const cells = (text: string) => {
  let count = 0
  for (const char of text) {
    if (!/[\p{M}\p{Cf}]/u.test(char)) {
      count++
    }
  }

  return count
}

// Signs and brackets have no direction of their own, so at the edge of a line a
// terminal moves them to the wrong side, and Claude Code drops direction marks.
// A tatweel, an Arabic letter, beside a sign there pins it; the sign's piece draws
// it in the background colour, so it is not seen.
export const GUARD = '\u0640'

function guard(line: Token[]): Token[] {
  return line.map((token, at) => {
    if (token.tone === 'text') {
      return token
    }
    const before = at === 0 ? GUARD : ''
    const after = at === line.length - 1 ? GUARD : ''

    return { ...token, text: before + token.text + after }
  })
}

function fill(tokens: Token[], width: number, space: number): Token[][] {
  const lines: Token[][] = []
  let line: Token[] = []
  let used = 0
  for (const token of tokens) {
    // A sign may land at the edge of the line and take a guard.
    const size = cells(token.text) + (token.tone === 'text' ? 0 : 1)
    if (line.length > 0 && used + space + size > width) {
      lines.push(line)
      line = []
      used = 0
    }
    used += (line.length > 0 ? space : 0) + size
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

// Letters that never join the letter after them.
const RIGHT_JOINING = /[اأإآٱدذرزوؤةء]/
const MARKS = /\p{M}/u

// The word with one cell after each letter that does not join the next one, as
// print leaves a small gap there (أَ حْمِلُكُمْ); a cell is the least a terminal can leave.
export function spaceOut(word: string): string {
  const chars = Array.from(word)
  let out = ''
  chars.forEach((char, i) => {
    out += char
    if (MARKS.test(char)) {
      return
    }
    let next = i + 1
    while (next < chars.length && MARKS.test(chars[next] ?? '')) {
      next++
    }
    const following = chars[next]
    if (RIGHT_JOINING.test(char) && following && LETTER.test(following)) {
      // The gap goes after the letter's own marks, which come next in the string.
      out += '\u0000'
    }
  })

  // Marks of a letter follow it, so move each gap past them.
  return out.replace(/\u0000(\p{M}*)/gu, '$1 ')
}

// Letters that join the letter after them, so a kashida (ـ) may follow them.
const DUAL_JOINING = /[بتثجحخسشصضطظعغفقكلمنهيىئ]/
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
export function justify(words: Token[], width: number, isCentred: boolean, space = 1): Piece[] {
  const gaps = words.length - 1
  // A line of one word cannot stretch.
  const centre = isCentred || gaps === 0
  const guarded = guard(words)
  const line = centre ? guarded : stretch(guarded, width - widthOf(guarded) - gaps * space)
  const used = widthOf(line)
  const free = Math.max(0, width - used - gaps * space)
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
      pieces.push({ text: ' '.repeat(space + extra), ayah, tone: 'text' })
    }
    pieces.push({ text: token.text, ayah: token.ayah, tone: token.tone })
  })
  const right = width - left - used - gaps * space - (centre ? 0 : free)
  if (right > 0) {
    pieces.push({ text: ' '.repeat(right), ayah: null, tone: 'text' })
  }

  return merge(pieces)
}

// A line's tokens with single spaces, for a surface that sets text in its own
// font and so needs no padding, kashida or guards.
export function inline(line: Token[]): Piece[] {
  const pieces: Piece[] = []
  line.forEach((token, at) => {
    const before = line[at - 1]
    if (before) {
      pieces.push({ text: ' ', ayah: before.ayah === token.ayah ? token.ayah : null, tone: 'text' })
    }
    pieces.push({ ...token })
  })

  return merge(pieces)
}

// The cells a line takes with `space` cells between its tokens.
export const naturalWidth = (line: Token[], space = 1) => widthOf(guard(line)) + Math.max(0, line.length - 1) * space

// Reflows tokens into lines of `width`: each justified, the last centred.
export function layout(tokens: Token[], width: number, space = 1): Piece[][] {
  const lines = fill(tokens, width, space)

  return lines.map((line, index) => justify(line, width, index === lines.length - 1, space))
}
