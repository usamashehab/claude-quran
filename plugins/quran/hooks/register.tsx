import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Bookmark, Theme } from '../types'
import { CONF_NAME, FAMILIES, FONT_FILES, FONTCONFIG, OTHER_SYSTEMS } from './font'
import { cells, GUARD, inline, justify, layout, naturalWidth, spaceOut } from './layout'
import type { Piece, Token } from './layout'

const PANE = 'quran'
const PAGES = 604
// Wide enough for the longest Mushaf line (81 cells) inside the frame.
const PANE_COLUMNS = 88
const BASMALA = 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ'

const page = atom({ plugin: 'quran', key: 'page' } as const, 1)
const cursor = atom({ plugin: 'quran', key: 'cursor' } as const, 0)
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
    const to = index === 0 || line === undefined ? 'start' : { key: `l${line}` }
    void $.ui.scroll({ in: PANE, to, block: 'center' }).catch(() => {})
  })
}

async function goTo($: EngineInterface, target: number, at: number | 'last' = 0) {
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
  const index = (await read($, cursor)) + step
  if (index < 0) {
    return current > 1 ? goTo($, current - 1, 'last') : undefined
  }
  if (index >= ayahsOf(q, current).length) {
    return current < PAGES ? goTo($, current + 1) : undefined
  }

  return goTo($, current, index)
}

async function markCursor($: EngineInterface) {
  const q = await load($)
  const current = await read($, page)
  const picked = ayahsOf(q, current)[await read($, cursor)]
  if (!picked) {
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
      description: 'Open the Quran: /quran [page | surah:ayah | b | font | font off]',
      argumentHint: '[page | surah:ayah | b | font | font off]',
    })
    const position = (await $.store.get('position')) as { page: number; cursor: number } | undefined
    if (position) {
      await update($, page, () => clampPage(position.page))
      await update($, cursor, () => position.cursor)
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

    return { text: `Quran opened at page ${current}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // Mobile has no Input; the buttons still work there.
    const Input = 'Input' in elements ? elements.Input : undefined
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
    // lines itself; the apps (desktop, mobile, VS Code) set it in their own fonts,
    // which join letters and order right-to-left text, so they get plain runs.
    const isCells = e.surface === 'terminal'
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

    const background = (ayah: number | null) => {
      if (ayah !== null && ayah === at) {
        return colors.cursor
      }
      if (ayah !== null && ayah === markIndex) {
        return colors.mark
      }

      return colors.page
    }
    const piece = ({ text, ayah, tone }: Piece) => {
      const color = tone === 'text' ? colors.text : colors.gold
      const style = { backgroundColor: background(ayah), bold: tone === 'marker' && ayah === markIndex }
      if (tone === 'text' || !isCells) {
        return (
          <Text color={color} {...style}>
            {text}
          </Text>
        )
      }

      // A sign's guards take the background colour; see GUARD.
      return text.split(/(ـ)/).filter(Boolean).map(part => (
        <Text color={part === GUARD ? style.backgroundColor : color} {...style}>
          {part}
        </Text>
      ))
    }
    // A run of words: cells laid out by the page on the terminal, one text the
    // app sets and wraps elsewhere.
    const words = (pieces: Piece[]) =>
      isCells ? (
        pieces.map(piece)
      ) : (
        <Text color={colors.text} backgroundColor={colors.page}>
          {pieces.map(piece)}
        </Text>
      )
    const plainLine = (text: string, color: string = colors.text) =>
      isCells ? (
        <Text color={color} backgroundColor={colors.page}>
          {centred(text, width)}
        </Text>
      ) : (
        <Box justifyContent="center">
          <Text color={color} backgroundColor={colors.page}>
            {text}
          </Text>
        </Box>
      )
    const banner = (surah: number) => {
      const name = ` ${spaceLine(`سُورَةُ ${show(surahOf(q, surah)[0])}`)} `
      if (!isCells) {
        return (
          <Box justifyContent="center" backgroundColor={colors.banner}>
            <Text color={colors.gold} backgroundColor={colors.banner}>
              ۞ <Text color={colors.text} backgroundColor={colors.banner} bold>{name}</Text> ۞
            </Text>
          </Box>
        )
      }
      const side = Math.max(1, Math.floor((width - cells(name) - 2) / 2))
      const rest = Math.max(0, width - cells(name) - 2 - side * 2)

      return (
        <Box>
          <Text color={colors.gold} backgroundColor={colors.banner}>
            {'۞' + '─'.repeat(side)}
          </Text>
          <Text color={colors.text} backgroundColor={colors.banner} bold>
            {name}
          </Text>
          <Text color={colors.gold} backgroundColor={colors.banner}>
            {'─'.repeat(side + rest) + '۞'}
          </Text>
        </Box>
      )
    }

    const rows: JSX.Element[] = []
    const addWords = (pieces: Piece[]) => {
      const n = rows.length
      for (const { ayah } of pieces) {
        if (ayah !== null && !lineOfAyah.has(ayah)) {
          lineOfAyah.set(ayah, n)
        }
      }
      rows.push(
        <Box key={`l${n}`} justifyContent="center">
          {words(pieces)}
        </Box>,
      )
    }
    const addRow = (row: JSX.Element) => rows.push(<Box key={`l${rows.length}`}>{row}</Box>)

    lineOfAyah = new Map()
    let run: Token[] = []
    const flush = () => {
      if (run.length > 0) {
        // An app wraps the run itself, as a paragraph.
        for (const pieces of isCells ? layout(run, width, space) : [inline(run)]) {
          addWords(pieces)
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
        addWords(isCells ? justify(tokens, width, isCentred, space) : inline(tokens))
        continue
      }
      flush()
      if (line === null) {
        addRow(plainLine(''))
      } else if ('h' in line) {
        addRow(banner(line.h))
      } else {
        addRow(plainLine(spaceLine(show(BASMALA))))
      }
    }
    flush()

    const surahNames = [...new Set(ayahs.map(one => one.surah))]
      .map(s => `سورة ${show(surahOf(q, s)[0])}`)
      .join(' · ')
    const where = `الجزء ${toArabicDigits(sheet.j)}`
    // Too narrow for both, the surah and the juz take a line each.
    const header =
      !isCells ? (
        <Box justifyContent="space-between" flexDirection="row-reverse">
          <Text color={colors.dim} backgroundColor={colors.page}>{surahNames}</Text>
          <Text color={colors.dim} backgroundColor={colors.page}>{where}</Text>
        </Box>
      ) : cells(surahNames) + cells(where) + 1 <= width ? (
        <Text color={colors.dim} backgroundColor={colors.page}>
          {surahNames}
          {' '.repeat(width - cells(surahNames) - cells(where))}
          {where}
        </Text>
      ) : (
        <Box flexDirection="column">
          {plainLine(surahNames, colors.dim)}
          {plainLine(where, colors.dim)}
        </Box>
      )
    const rule = isCells ? (
      <Text color={colors.frame} backgroundColor={colors.page}>
        {'─'.repeat(width)}
      </Text>
    ) : (
      plainLine('─'.repeat(24), colors.frame)
    )

    return (
      <Box flexDirection="column" alignItems="center">
        <Box
          flexDirection="column"
          borderStyle="double"
          borderColor={colors.frame}
          backgroundColor={colors.page}
          paddingX={padding}
        >
          {header}
          {rule}
          {rows.map((row, i) => (
            // On the terminal a blank row between lines keeps the tashkeel of one
            // line clear of the next; an app's line height does that itself.
            <Box key={`r${i}`} flexDirection="column">
              {i > 0 && isCells && plainLine('')}
              {row}
            </Box>
          ))}
          {rule}
          <Box key="footer">{plainLine(`❁  ${toArabicDigits(current)}  ❁`, colors.gold)}</Box>
          {/* On a line of its own: beside the ornaments, the terminal would reorder them. */}
          {sheet.q && <Box key="quarter">{plainLine(quarterOf(sheet.q), colors.dim)}</Box>}
        </Box>
        <Box flexWrap="wrap" columnGap={2} justifyContent="center" marginTop={1}>
          <Button plain key="next" hotkey="n" label="Next page" onPress={() => goTo($, current + 1)} />
          <Button plain key="prev" hotkey="p" label="Prev page" onPress={() => goTo($, current - 1)} />
          <Button plain key="down" hotkey="j" label="Next ayah" onPress={() => moveCursor($, 1)} />
          <Button plain key="up" hotkey="k" label="Prev ayah" onPress={() => moveCursor($, -1)} />
          <Button plain key="mark" hotkey="m" label="Bookmark" onPress={() => markCursor($)} />
          <Button plain key="bookmark" hotkey="b" label="Go to bookmark" onPress={() => goToBookmark($)} />
          <Button
            plain
            key="plain"
            hotkey="t"
            label="Tashkeel"
            onPress={() => update($, isPlain, (value: boolean) => !value)}
          />
          <Button plain key="theme" hotkey="d" label="Day/Night" onPress={() => toggleTheme($)} />
          <Button
            plain
            key="spacing"
            hotkey="g"
            label="Letter gaps"
            onPress={() => update($, isSpaced, (value: boolean) => !value)}
          />
        </Box>
        {Input && (
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
        )}
      </Box>
    )
  })
}
