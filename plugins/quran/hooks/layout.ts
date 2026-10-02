// Lays a page's ayahs out as justified Mushaf lines of a fixed cell width.
// `space` is the cells between two words: 2 when letters are spaced out, so a
// word break stays wider than the gap inside a word.

const LETTER = /[\u0620-\u064A\u0671-\u06D3]/

export type Tone = 'text' | 'marker' | 'symbol'
// `ayah` is the ayah's index on the page; null for a gap between two ayahs.
export type Piece = { text: string; ayah: number | null; tone: Tone }
export type Token = { text: string; ayah: number; tone: Tone }
// A terminal page as the page Client (page.tsx) draws it: rows of runs, each
// [text, colour, background, bold].
export type Span = [string, string, string, boolean]
export type PageRows = Span[][]

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

// Letters that join the letter after them, so a kashida (ـ) may follow them; a
// kashida itself, so a word can take more than one.
const DUAL_JOINING = /[بتثجحخسشصضطظعغفقكلمنهيىئـ]/
const ALEF = /[اأإآٱ]/

// The word with one kashida before its last letter, where print stretches a
// word (قُلُوبِهِـمْ); undefined when its last two letters do not join (عَذَابٌ),
// as a kashida early in a word, after its first letter, reads wrong.
export function kashida(word: string): string | undefined {
  const chars = Array.from(word)
  const letters = chars.flatMap((char, at) => (/\p{M}/u.test(char) ? [] : [at]))
  const last = letters.at(-1)
  const before = letters.at(-2)
  if (letters.length < 3 || last === undefined || before === undefined) {
    return undefined
  }
  const joins = chars[before] ?? ''
  const final = chars[last] ?? ''
  // Lam then alef is one ligature; a kashida would split it.
  const isLamAlef = joins === 'ل' && ALEF.test(final)
  if (!DUAL_JOINING.test(joins) || !LETTER.test(final) || final === 'ء' || isLamAlef) {
    return undefined
  }

  return [...chars.slice(0, last), 'ـ', ...chars.slice(last)].join('')
}

// Most kashidas one word takes.
const KASHIDAS = 3

// Takes up to half of `free` with kashidas, longest words first, a round at a
// time, so the stretch spreads over the line before any word takes a second.
function stretch(line: Token[], free: number): Token[] {
  const stretched = [...line]
  let budget = Math.floor(free / 2)
  const longestFirst = line
    .map((token, index) => ({ index, size: cells(token.text), isWord: token.tone === 'text' }))
    .filter(one => one.isWord && one.size >= 3)
    .sort((a, b) => b.size - a.size)
  for (let round = 0; round < KASHIDAS && budget > 0; round++) {
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

// What a page drops to fit a pane `bodyRows` high: the blank rows between its
// lines first, then the Go to field and the space above the buttons, then the
// buttons' long labels. `rows` is the rows its lines take, `gaps` the blank rows
// between them, `frame` the rows round them (border, header, rules, footer), and
// `labels` each button's long and short label.
export type Fit = { isSpaced: boolean; hasInput: boolean; hasMargin: boolean; isShort: boolean }
export function fitHeight(page: {
  bodyRows: number
  bodyColumns: number
  rows: number
  gaps: number
  frame: number
  hasInput: boolean
  labels: [string, string][]
}): Fit {
  // A plain button draws as `n: label`, two columns from the next, wrapping.
  const buttonRows = (isShort: boolean) => {
    let rows = 1
    let used = 0
    for (const [long, short] of page.labels) {
      const size = 3 + (isShort ? short : long).length
      if (used > 0 && used + 2 + size > page.bodyColumns) {
        rows++
        used = 0
      }
      used += (used > 0 ? 2 : 0) + size
    }

    return rows
  }
  const ways: Fit[] = [
    { isSpaced: true, hasInput: page.hasInput, hasMargin: true, isShort: false },
    { isSpaced: false, hasInput: page.hasInput, hasMargin: true, isShort: false },
    { isSpaced: false, hasInput: false, hasMargin: false, isShort: false },
    { isSpaced: false, hasInput: false, hasMargin: false, isShort: true },
  ]
  const height = (way: Fit) =>
    page.frame +
    page.rows +
    (way.isSpaced ? page.gaps : 0) +
    (way.hasMargin ? 1 : 0) +
    buttonRows(way.isShort) +
    (way.hasInput ? 1 : 0)

  return ways.find(way => height(way) <= page.bodyRows) ?? ways[ways.length - 1]!
}
