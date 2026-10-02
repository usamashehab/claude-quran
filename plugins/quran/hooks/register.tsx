import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bookmark, Theme } from '../types'
import { CONF_NAME, FAMILIES, FONT_FILES, FONTCONFIG, OTHER_SYSTEMS } from './font'
import { cells, fitHeight, GUARD, inline, justify, layout, naturalWidth, spaceOut } from './layout'
import type { PageRows, Piece, Span, Token } from './layout'
import { GNOME_PROFILES, gnomeProfile, LINE_HEIGHT, OTHER_TERMINALS_SPACING } from './terminal'

const PANE = 'quran'
const PAGES = 604
// Wide enough for the longest Mushaf line (81 cells) inside the frame.
const PANE_COLUMNS = 88
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'

const page = atom({ plugin: 'quran', key: 'page' } as const, 1)
// The highlighted ayah's index on the page; NONE until j or k picks one.
const NONE = -1
const cursor = atom({ plugin: 'quran', key: 'cursor' } as const, NONE)
const bookmark = atom({ plugin: 'quran', key: 'bookmark' } as const, null)
const isPlain = atom({ plugin: 'quran', key: 'isPlain' } as const, false)
const isSpaced = atom({ plugin: 'quran', key: 'isSpaced' } as const, false)
const theme = atom({ plugin: 'quran', key: 'theme' } as const, 'day')

const PALETTES = {
  day: {
    page: '#FBF5E6',
    text: '#1E1A14',
    gold: '#A67C1A',
    frame: '#C9A227',
    banner: '#F3E7C4',
    dim: '#8C7A5B',
    cursor: '#DCE9F5',
    mark: '#F2DC9B',
  },
  night: {
    page: '#14120E',
    text: '#EDE6D6',
    gold: '#D4AF37',
    frame: '#B8962E',
    banner: '#221D12',
    dim: '#8F8572',
    cursor: '#23364A',
    mark: '#4A3C14',
  },
} as const

// [surah, ayah, words on this line, 1 when the ayah ends on this line]
type Segment = [number, number, string, number]
// A Mushaf line: empty, a surah's header, its basmala, or words.
type Line = null | { h: number } | { b: number } | Segment[]
// j: the juz the page starts in; q: [quarter, hizb] of a hizb quarter that starts on
// it (quarter 0 to 3 for its start, ¼, ½, ¾); l: its lines, 15 but for pages 1 and 2.
type Page = { j: number; q: [number, number] | null; l: Line[] }
// [arabic name, english name, ayah count]
type Surah = [string, string, number]
type Quran = { s: Surah[]; p: Page[] }
type AyahRef = { surah: number; ayah: number }

let quran: Quran | undefined
// The line each ayah of the drawn page starts on, for scrolling the cursor into view.
let lineOfAyah = new Map<number, number>()

async function load($: EngineInterface): Promise<Quran> {
  quran ??= JSON.parse(await $.fs.read(`${$.plugin.root}/data/quran.json`)) as Quran

  return quran
}

const pageOf = (q: Quran, n: number): Page => q.p[n - 1] ?? { j: 1, q: null, l: [] }
const surahOf = (q: Quran, s: number): Surah => q.s[s - 1] ?? ['', '', 0]
const isWords = (line: Line): line is Segment[] => Array.isArray(line)

// The ayahs on a page in reading order, one that runs over from the page before included.
function ayahsOf(q: Quran, n: number): AyahRef[] {
  const seen = new Set<string>()
  const ayahs: AyahRef[] = []
  for (const line of pageOf(q, n).l) {
    if (!isWords(line)) {
      continue
    }
    for (const [surah, ayah] of line) {
      const id = `${surah}:${ayah}`
      if (!seen.has(id)) {
        seen.add(id)
        ayahs.push({ surah, ayah })
      }
    }
  }

  return ayahs
}

const toArabicDigits = (n: number) =>
  String(n).replace(/\d/g, d => '٠١٢٣٤٥٦٧٨٩'[Number(d)] ?? d)

// Plain mode drops diacritics, which many terminals draw badly.
const plain = (text: string) =>
  text.replace(/[ؐ-ًؚ-ٰٟۖ-ۭ]/g, '').replace(/ٱ/g, 'ا')

// The hizb quarter that starts on a page, as the Mushaf's margin marks it.
const QUARTERS = ['', 'ربع ', 'نصف ', 'ثلاثة أرباع ']
const quarterOf = ([part, hizb]: [number, number]) => `${QUARTERS[part] ?? ''}الحزب ${toArabicDigits(hizb)}`

const clampPage = (n: number) => Math.min(PAGES, Math.max(1, n))

const centred = (text: string, width: number) => {
  const free = Math.max(0, width - cells(text))
  const left = Math.floor(free / 2)

  return ' '.repeat(left) + text + ' '.repeat(free - left)
}

// The page an ayah starts on, and its place in that page's ayahs.
function locate(q: Quran, surah: number, ayah: number) {
  for (let p = 1; p <= PAGES; p++) {
    const index = ayahsOf(q, p).findIndex(one => one.surah === surah && one.ayah === ayah)
    if (index !== -1) {
      return { page: p, cursor: index }
    }
  }

  return undefined
}

async function persist($: EngineInterface) {
  await $.store.set('position', { page: await read($, page), cursor: await read($, cursor) })
}

// Scrolls once the new page or cursor has been drawn.
function reveal($: EngineInterface, index: number) {
  $.clock.after(80, () => {
    const line = lineOfAyah.get(index)
    const to = index <= 0 || line === undefined ? 'start' : { key: `l${line}` }
    void $.ui.scroll({ in: PANE, to, block: 'center' }).catch(() => {})
  })
}

// A page turn shows the page with no ayah highlighted; `at` picks one.
async function goTo($: EngineInterface, target: number, at: number | 'last' = NONE) {
  const q = await load($)
  const next = clampPage(target)
  const index = at === 'last' ? ayahsOf(q, next).length - 1 : at
  await update($, page, () => next)
  await update($, cursor, () => index)
  await persist($)
  reveal($, index)
}

async function moveCursor($: EngineInterface, step: 1 | -1) {
  const q = await load($)
  const current = await read($, page)
  const at = await read($, cursor)
  // With none highlighted, j picks the page's first ayah and k its last.
  const index = at === NONE ? (step === 1 ? 0 : ayahsOf(q, current).length - 1) : at + step
  if (index < 0) {
    return current > 1 ? goTo($, current - 1, 'last') : undefined
  }
  if (index >= ayahsOf(q, current).length) {
    return current < PAGES ? goTo($, current + 1, 0) : undefined
  }

  return goTo($, current, index)
}

async function markCursor($: EngineInterface) {
  const q = await load($)
  const current = await read($, page)
  const picked = ayahsOf(q, current)[await read($, cursor)]
  if (!picked) {
    $.ui.toast('Pick an ayah with j or k first, then press m')

    return
  }
  const mark: Bookmark = { page: current, ...picked }
  await update($, bookmark, () => mark)
  await $.store.set('bookmark', mark)
  $.ui.toast(`Bookmarked ${surahOf(q, mark.surah)[1]} ${mark.surah}:${mark.ayah}`)
}

async function goToBookmark($: EngineInterface) {
  const mark = await read($, bookmark)
  if (!mark) {
    $.ui.toast('No bookmark yet: press m on an ayah to set one')

    return
  }
  const found = locate(await load($), mark.surah, mark.ayah)
  if (found) {
    await goTo($, found.page, found.cursor)
  }
}

async function toggleTheme($: EngineInterface) {
  const next: Theme = (await read($, theme)) === 'day' ? 'night' : 'day'
  await update($, theme, () => next)
  await $.store.set('theme', next)
}

// "" keeps the place, "50" is a page, "2:255" a surah and ayah, "b" the bookmark.
async function jump($: EngineInterface, query: string): Promise<string | undefined> {
  const text = query.trim()
  if (text === '') {
    return undefined
  }
  if (text === 'b' || text === 'bookmark') {
    await goToBookmark($)

    return undefined
  }
  const verse = text.match(/^(\d+)\s*[:.]\s*(\d+)$/)
  if (verse) {
    const found = locate(await load($), Number(verse[1]), Number(verse[2]))
    if (!found) {
      return `No ayah ${text}`
    }
    await goTo($, found.page, found.cursor)

    return undefined
  }
  if (/^\d+$/.test(text)) {
    await goTo($, Number(text))

    return undefined
  }

  return `Not a page, surah:ayah, or "b": ${text}`
}

// `/quran font` and `/quran font off`: see font.ts.
async function runQuietly($: EngineInterface, argv: string[]) {
  return $.process.run(argv, { timeoutMs: 120_000 }).catch(() => undefined)
}

async function fontPaths($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  const config = (await $.env.get('XDG_CONFIG_HOME')) || `${home}/.config`
  const data = (await $.env.get('XDG_DATA_HOME')) || `${home}/.local/share`

  return {
    conf: `${config}/fontconfig/conf.d/${CONF_NAME}`,
    fonts: `${data}/fonts`,
  }
}

async function isLinux($: EngineInterface) {
  const uname = await runQuietly($, ['uname', '-s'])

  return uname?.stdout.trim() === 'Linux'
}

async function fontOn($: EngineInterface): Promise<string> {
  if (!(await isLinux($))) {
    return OTHER_SYSTEMS
  }
  const { conf, fonts } = await fontPaths($)
  if (!(await runQuietly($, ['fc-list', '--version']))) {
    return 'fontconfig was not found (fc-list). ' + OTHER_SYSTEMS
  }
  await runQuietly($, ['mkdir', '-p', fonts])
  for (const file of FONT_FILES) {
    await runQuietly($, ['cp', `${$.plugin.root}/fonts/${file}`, `${fonts}/${file}`])
  }
  await $.fs.write(conf, FONTCONFIG)
  await runQuietly($, ['fc-cache', '-f'])
  const listed = await runQuietly($, ['fc-list', ':spacing=mono:charset=0627', 'family'])
  const others = (listed?.stdout ?? '')
    .split('\n')
    .map(family => family.trim())
    .filter(family => family !== '' && !FAMILIES.includes(family))
  if (others.length > 0) {
    return [
      `Wrote ${conf}, but these monospace fonts still draw Arabic: ${others.join(', ')}.`,
      'Run `fc-cache -f` again, or log out and in, then restart your terminal.',
    ].join(' ')
  }

  return `Arabic now uses ${FAMILIES.join(', then ')} (${conf}). Restart your terminal to see it; /quran font off undoes it.`
}

async function fontOff($: EngineInterface): Promise<string> {
  if (!(await isLinux($))) {
    return 'Nothing to undo here: remove Vazir Code Quran and Kawkab Mono from your terminal font settings.'
  }
  const { conf } = await fontPaths($)
  await runQuietly($, ['rm', '-f', conf])
  await runQuietly($, ['fc-cache', '-f'])

  return `Removed ${conf}. Restart your terminal to go back to its own Arabic font.`
}

// `/quran spacing` and `/quran spacing off`: GNOME Terminal's row height, for its
// default profile. The height it had before is kept, to put back.
async function terminalProfile($: EngineInterface) {
  if (!(await $.env.get('GNOME_TERMINAL_SCREEN'))) {
    return undefined
  }
  const listed = await runQuietly($, ['gsettings', 'get', GNOME_PROFILES, 'default'])
  const id = listed?.exitCode === 0 ? listed.stdout.trim().replace(/'/g, '') : ''

  return id === '' ? undefined : gnomeProfile(id)
}

async function spacingOn($: EngineInterface): Promise<string> {
  const profile = await terminalProfile($)
  if (!profile) {
    return OTHER_TERMINALS_SPACING
  }
  const before = await runQuietly($, ['gsettings', 'get', profile, 'cell-height-scale'])
  if (before?.exitCode !== 0) {
    return `Could not read GNOME Terminal's row height (gsettings). ${OTHER_TERMINALS_SPACING}`
  }
  if ((await $.store.get('lineHeight')) === undefined) {
    await $.store.set('lineHeight', Number(before.stdout.trim()) || 1)
  }
  await runQuietly($, ['gsettings', 'set', profile, 'cell-height-scale', String(LINE_HEIGHT)])

  return `GNOME Terminal's rows are now ${LINE_HEIGHT} times as tall, in every window of its default profile; /quran spacing off puts them back.`
}

async function spacingOff($: EngineInterface): Promise<string> {
  const profile = await terminalProfile($)
  if (!profile) {
    return 'Nothing to undo here: /quran spacing changes GNOME Terminal only.'
  }
  const before = Number(await $.store.get('lineHeight')) || 1
  await runQuietly($, ['gsettings', 'set', profile, 'cell-height-scale', String(before)])
  await $.store.delete('lineHeight')

  return `GNOME Terminal's row height is back to ${before}.`
}

// The page's buttons, by the key a press names; `isCells`, the terminal's only.
const CONTROLS = [
  { key: 'next', hotkey: 'n', label: 'Next page', short: 'page', isCells: false },
  { key: 'prev', hotkey: 'p', label: 'Prev page', short: 'back', isCells: false },
  { key: 'down', hotkey: 'j', label: 'Next ayah', short: 'ayah', isCells: false },
  { key: 'up', hotkey: 'k', label: 'Prev ayah', short: 'up', isCells: false },
  { key: 'mark', hotkey: 'm', label: 'Bookmark', short: 'mark', isCells: false },
  { key: 'bookmark', hotkey: 'b', label: 'Go to bookmark', short: 'go', isCells: false },
  { key: 'plain', hotkey: 't', label: 'Tashkeel', short: 'tashkeel', isCells: false },
  { key: 'theme', hotkey: 'd', label: 'Day/Night', short: 'night', isCells: false },
  { key: 'spacing', hotkey: 'g', label: 'Letter gaps', short: 'gaps', isCells: true },
]

// Keys the clicked page (page.tsx) hands on: the buttons' hotkeys, and the arrows,
// which turn pages the way a Mushaf does, leftward: left is the next page.
const PAGE_KEYS: Record<string, string> = {
  ...Object.fromEntries(CONTROLS.map(control => [control.hotkey, control.key])),
  left: 'next',
  right: 'prev',
  pagedown: 'next',
  pageup: 'prev',
  down: 'down',
  up: 'up',
}

async function act($: EngineInterface, key: string) {
  switch (key) {
    case 'next':
      return goTo($, (await read($, page)) + 1)
    case 'prev':
      return goTo($, (await read($, page)) - 1)
    case 'down':
      return moveCursor($, 1)
    case 'up':
      return moveCursor($, -1)
    case 'mark':
      return markCursor($)
    case 'bookmark':
      return goToBookmark($)
    case 'plain':
      return update($, isPlain, (value: boolean) => !value)
    case 'theme':
      return toggleTheme($)
    case 'spacing':
      return update($, isSpaced, (value: boolean) => !value)
  }

  return undefined
}

// A line's words as tokens, each knowing its ayah's place on the page.
function tokensOf(
  line: Segment[],
  indexOf: (s: number, a: number) => number,
  show: (t: string) => string,
  isSpacedOut: boolean,
) {
  const tokens: Token[] = []
  for (const [surah, ayah, words, ends] of line) {
    const index = indexOf(surah, ayah)
    for (const word of show(words).split(/\s+/).filter(Boolean)) {
      const isSymbol = /^[۞۩]$/.test(word)
      tokens.push({
        text: isSymbol || !isSpacedOut ? word : spaceOut(word),
        ayah: index,
        tone: isSymbol ? 'symbol' : 'text',
      })
    }
    if (ends) {
      // U+FD3F then U+FD3E: a bidi terminal draws them as ﴾n﴿ around the number.
      tokens.push({ text: `\uFD3F${toArabicDigits(ayah)}\uFD3E`, ayah: index, tone: 'marker' })
    }
  }

  return tokens
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'quran',
      description: 'Open the Quran: /quran [page | surah:ayah | b | font | font off | spacing | spacing off]',
      argumentHint: '[page | surah:ayah | b | font | font off | spacing | spacing off]',
    })
    // A session opens at the page where the last stopped, no ayah highlighted:
    // the bookmark is what keeps an ayah.
    const position = (await $.store.get('position')) as { page: number } | undefined
    if (position) {
      await update($, page, () => clampPage(position.page))
    }
    const mark = (await $.store.get('bookmark')) as Bookmark | undefined
    if (mark) {
      await update($, bookmark, () => mark)
    }
    const saved = (await $.store.get('theme')) as Theme | undefined
    if (saved) {
      await update($, theme, () => saved)
    }

    return next(e)
  })

  on('command.run', { command: 'quran' }, async ($, e) => {
    const args = e.args.trim()
    if (args === 'font') {
      return { text: await fontOn($) }
    }
    if (args === 'font off') {
      return { text: await fontOff($) }
    }
    if (args === 'spacing') {
      return { text: await spacingOn($) }
    }
    if (args === 'spacing off') {
      return { text: await spacingOff($) }
    }
    // Opened as it is, the page shows no ayah highlighted.
    if (args === '') {
      await update($, cursor, () => NONE)
    }
    const opened = await $.ui.open({
      id: PANE,
      title: 'القرآن الكريم',
      focus: true,
      closeOnEscape: true,
      columns: PANE_COLUMNS,
    })
    const problem = await jump($, args)
    if (problem) {
      return { text: problem }
    }
    if (!opened.isPlaced) {
      return { text: 'Could not place the Quran pane here.' }
    }
    const current = await read($, page)

    return { text: `Quran opened at page ${current}. In a terminal, click the page once, then ← and → turn it.` }
  })

  on('ui.message', { requestId: PANE }, async ($, e) => {
    const action = typeof e.data === 'string' ? PAGE_KEYS[e.data] : undefined
    if (action) {
      await act($, action)
    }

    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // Mobile has no Input; the buttons still work there.
    const Input = 'Input' in elements ? elements.Input : undefined
    const Client = 'Client' in elements ? elements.Client : undefined
    const q = await load($)
    const current = await read($, page)
    const at = await read($, cursor)
    const mark = await read($, bookmark)
    const colors = PALETTES[await read($, theme)]
    const spaced = await read($, isSpaced)
    const unmarked = (await read($, isPlain)) ? plain : (text: string) => text
    const show = unmarked
    // Spaced out, words open a cell after each non-joining letter and stand 2 cells apart.
    const space = e.surface === 'terminal' && spaced ? 2 : 1
    const spaceLine = (text: string) =>
      e.surface === 'terminal' && spaced ? text.split(' ').map(spaceOut).join('  ') : text
    const sheet = pageOf(q, current)
    const ayahs = ayahsOf(q, current)
    const indexOf = (s: number, a: number) => ayahs.findIndex(one => one.surah === s && one.ayah === a)
    const markIndex = mark === null ? -1 : indexOf(mark.surah, mark.ayah)

    // The terminal sets text in cells, so the page pads, stretches and guards its
    // lines itself, and draws them in the page Client (page.tsx), which takes the
    // arrows once clicked; the apps (desktop, mobile, VS Code) set the text in
    // their own fonts, which join letters and order right-to-left text, so they
    // get plain runs.
    const isCells = e.surface === 'terminal' && Client !== undefined
    const lettersApart = isCells && spaced
    // A phone-width pane keeps less padding inside the frame.
    const padding = e.props.bodyColumns < 56 ? 1 : 2
    const room = e.props.bodyColumns - 2 - padding * 2

    // The page is as wide as its longest Mushaf line. Where the pane has room for
    // that, the page keeps the Mushaf's own lines; narrower, its text reflows.
    const lineTokens = new Map(sheet.l.filter(isWords).map(line => [line, tokensOf(line, indexOf, unmarked, lettersApart)]))
    const pageWidth = Math.max(30, ...[...lineTokens.values()].map(tokens => naturalWidth(tokens, space)))
    const isMushaf = room >= pageWidth
    const width = isMushaf ? pageWidth : Math.max(10, room)

    // Only the ayah picked with j or k is shaded; the bookmarked one shows by its
    // number alone, shaded and bold, so no ayah is shaded by default.
    const background = (ayah: number | null, tone: Piece['tone']) => {
      if (ayah !== null && ayah === at) {
        return colors.cursor
      }
      if (ayah !== null && ayah === markIndex && tone === 'marker') {
        return colors.mark
      }

      return colors.page
    }
    const isBold = ({ ayah, tone }: Piece) => tone === 'marker' && ayah === markIndex

    // The page's lines in reading order, then drawn for the surface.
    type Row = { words: Piece[] } | { plain: string } | { banner: number }
    const lines: Row[] = []
    let run: Token[] = []
    const flush = () => {
      if (run.length > 0) {
        // An app wraps the run itself, as a paragraph.
        for (const words of isCells ? layout(run, width, space) : [inline(run)]) {
          lines.push({ words })
        }
      }
      run = []
    }
    for (const line of sheet.l) {
      if (isWords(line)) {
        const tokens = lineTokens.get(line) ?? []
        if (!isMushaf) {
          run.push(...tokens)
          continue
        }
        // Pages 1 and 2 are set centred in the Mushaf; a very short line would stretch too far.
        const isCentred = current <= 2 || naturalWidth(tokens, space) < width * 0.4
        lines.push({ words: isCells ? justify(tokens, width, isCentred, space) : inline(tokens) })
        continue
      }
      flush()
      if (line === null) {
        lines.push({ plain: '' })
      } else if ('h' in line) {
        lines.push({ banner: line.h })
      } else {
        lines.push({ plain: spaceLine(show(BASMALA)) })
      }
    }
    flush()

    const surahNames = [...new Set(ayahs.map(one => one.surah))]
      .map(s => `سورة ${show(surahOf(q, s)[0])}`)
      .join(' · ')
    const where = `الجزء ${toArabicDigits(sheet.j)}`
    const footer = `❁  ${toArabicDigits(current)}  ❁`
    const surahName = (surah: number) => ` ${spaceLine(`سُورَةُ ${show(surahOf(q, surah)[0])}`)} `
    // Too narrow for both, the surah and the juz take a line each.
    const isHeaderOneLine = cells(surahNames) + cells(where) + 1 <= width

    // The page fits the pane's height, no scrolling: the blank rows between lines
    // go first, then the Go to field, then the buttons' long labels.
    const controls = CONTROLS.filter(control => isCells || !control.isCells)
    const fit = fitHeight({
      bodyRows: isCells ? e.props.scroll.bodyRows : Infinity,
      bodyColumns: e.props.bodyColumns,
      rows: lines.length,
      gaps: lines.length - 1,
      frame: 2 + (isHeaderOneLine ? 1 : 2) + 2 + 1 + (sheet.q ? 1 : 0),
      hasInput: Input !== undefined,
      labels: controls.map(control => [control.label, control.short]),
    })

    const buttons = (
      <Box flexWrap="wrap" columnGap={2} justifyContent="center" marginTop={fit.hasMargin ? 1 : 0}>
        {controls.map(control => (
          <Button
            plain
            key={control.key}
            hotkey={control.hotkey}
            label={fit.isShort ? control.short : control.label}
            onPress={() => act($, control.key)}
          />
        ))}
      </Box>
    )
    const goToField = Input && fit.hasInput && (
      <Box width={width + 2 + padding * 2}>
        <Input
          key="goto"
          placeholder="Go to: page, surah:ayah, or b"
          submitLabel="Go"
          onSubmit={async value => {
            const problem = await jump($, value)
            if (problem) {
              $.ui.toast(problem)
            }
          }}
        />
      </Box>
    )

    if (isCells) {
      // Each row as runs of cells, `width` wide.
      const span = (text: string, color: string, backgroundColor: string = colors.page, bold = false): Span => [text, color, backgroundColor, bold]
      const centredRow = (text: string, color: string = colors.text) => [span(centred(text, width), color)]
      const pieceSpans = (one: Piece): Span[] => {
        const color = one.tone === 'text' ? colors.text : colors.gold
        const shade = background(one.ayah, one.tone)
        // A sign's guards take the background colour; see GUARD.
        const parts = one.tone === 'text' ? [one.text] : one.text.split(/(ـ)/).filter(Boolean)

        return parts.map(part => span(part, part === GUARD ? shade : color, shade, isBold(one)))
      }
      const bannerRow = (surah: number) => {
        const name = surahName(surah)
        const side = Math.max(1, Math.floor((width - cells(name) - 2) / 2))
        const rest = Math.max(0, width - cells(name) - 2 - side * 2)

        return [
          span('۞' + '─'.repeat(side), colors.gold, colors.banner),
          span(name, colors.text, colors.banner, true),
          span('─'.repeat(side + rest) + '۞', colors.gold, colors.banner),
        ]
      }
      const rule = [span('─'.repeat(width), colors.frame)]
      // On the terminal a blank row between lines keeps the tashkeel of one line
      // clear of the next; an app's line height does that itself.
      const body = lines.flatMap((line, i) => {
        const row = 'words' in line ? line.words.flatMap(pieceSpans) : 'banner' in line ? bannerRow(line.banner) : centredRow(line.plain)

        return i > 0 && fit.isSpaced ? [centredRow(''), row] : [row]
      })
      const rows: PageRows = [
        ...(isHeaderOneLine
          ? [[span(surahNames + ' '.repeat(width - cells(surahNames) - cells(where)) + where, colors.dim)]]
          : [centredRow(surahNames, colors.dim), centredRow(where, colors.dim)]),
        rule,
        ...body,
        rule,
        centredRow(footer, colors.gold),
        // On a line of its own: beside the ornaments, the terminal would reorder them.
        ...(sheet.q ? [centredRow(quarterOf(sheet.q), colors.dim)] : []),
      ]
      lineOfAyah = new Map()

      return (
        <Box flexDirection="column" alignItems="center">
          <Box borderStyle="double" borderColor={colors.frame} backgroundColor={colors.page} paddingX={padding}>
            <Client key="page" module="./page.tsx" props={rows} />
          </Box>
          {buttons}
          {goToField}
        </Box>
      )
    }

    const piece = (one: Piece) => (
      <Text color={one.tone === 'text' ? colors.text : colors.gold} backgroundColor={background(one.ayah, one.tone)} bold={isBold(one)}>
        {one.text}
      </Text>
    )
    const plainLine = (text: string, color: string = colors.text) => (
      <Box justifyContent="center">
        <Text color={color} backgroundColor={colors.page}>
          {text}
        </Text>
      </Box>
    )
    const banner = (surah: number) => (
      <Box justifyContent="center" backgroundColor={colors.banner}>
        <Text color={colors.gold} backgroundColor={colors.banner}>
          ۞ <Text color={colors.text} backgroundColor={colors.banner} bold>{surahName(surah)}</Text> ۞
        </Text>
      </Box>
    )
    lineOfAyah = new Map()
    const rows = lines.map((line, n) => {
      if ('words' in line) {
        for (const { ayah } of line.words) {
          if (ayah !== null && !lineOfAyah.has(ayah)) {
            lineOfAyah.set(ayah, n)
          }
        }
      }

      return (
        <Box key={`l${n}`} justifyContent="center">
          {'words' in line ? (
            <Text color={colors.text} backgroundColor={colors.page}>
              {line.words.map(piece)}
            </Text>
          ) : 'banner' in line ? (
            banner(line.banner)
          ) : (
            plainLine(line.plain)
          )}
        </Box>
      )
    })

    return (
      <Box flexDirection="column" alignItems="center">
        <Box flexDirection="column" borderStyle="double" borderColor={colors.frame} backgroundColor={colors.page} paddingX={padding}>
          <Box justifyContent="space-between" flexDirection="row-reverse">
            <Text color={colors.dim} backgroundColor={colors.page}>{surahNames}</Text>
            <Text color={colors.dim} backgroundColor={colors.page}>{where}</Text>
          </Box>
          {plainLine('─'.repeat(24), colors.frame)}
          {rows}
          {plainLine('─'.repeat(24), colors.frame)}
          <Box key="footer">{plainLine(footer, colors.gold)}</Box>
          {sheet.q && <Box key="quarter">{plainLine(quarterOf(sheet.q), colors.dim)}</Box>}
        </Box>
        {buttons}
        {goToField}
      </Box>
    )
  })
}
