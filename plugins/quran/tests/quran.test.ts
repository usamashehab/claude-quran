import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { cells, fitHeight, kashida, layout, spaceOut } from '../hooks/layout'

// A small stand-in for data/quran.json: the tests cannot read files.
// Pages hold Mushaf lines; every page but the few the test visits holds one ayah of surah 114.
function fixture() {
  const s = Array.from({ length: 114 }, (_, i) => [`سورة${i + 1}`, `Surah ${i + 1}`, 7])
  const p: { j: number; q: [number, number] | null; l: unknown[] }[] = Array.from({ length: 604 }, (_, i) => ({ j: Math.floor(i / 20) + 1, q: null, l: [[[114, 1, 'قُلْ', 1]]] }))
  p[0] = { j: 1, q: [0, 1], l: [{ h: 1 }, ...[1, 2, 3].map(a => [[1, a, `آية ${a}`, 1]])] }
  p[1] = {
    j: 1,
    q: null,
    l: [{ h: 2 }, { b: 2 }, [[2, 1, 'الٓمٓ', 1], [2, 2, 'ذَٰلِكَ ٱلْكِتَٰبُ', 0]], [[2, 2, 'لَا رَيْبَ', 1], [2, 3, 'ٱلَّذِينَ', 1]]],
  }
  p[41] = { j: 3, q: [1, 5], l: [[[2, 255, 'ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ', 1]]] }

  return JSON.stringify({ s, p })
}

// An in-memory store the test can read back, and the fixture as the data file.
function world(on: On) {
  const saved = new Map<string, unknown>()
  const data = fixture()
  on('fs.read', () => ({ value: data }))
  on('store.get', (_$, e) => ({ value: saved.get(e.key) }))
  on('store.set', (_$, e) => {
    saved.set(e.key, e.value)

    return { value: undefined }
  })
  on('store.delete', (_$, e) => {
    saved.delete(e.key)

    return { value: undefined }
  })
  on('store.keys', () => ({ value: [...saved.keys()] }))

  return saved
}

const PANE = {
  component: 'Pane',
  requestId: 'quran',
  props: {
    title: 'القرآن الكريم',
    isFocused: true,
    bodyColumns: 90,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('pages turn, the cursor walks ayahs, and a bookmark is kept', async ($, on) => {
  const saved = world(on)
  for (const surface of ['terminal', 'desktop'] as const) {
    saved.clear()
    const ui = await $.ui.mount({ plugin: 'quran', surface, ...PANE })

    const goToPage = (ui: { input: (a: { key: string; text: string }) => Promise<unknown> }, text: string) =>
      ui.input({ key: 'goto', text })
    const pageNumber = async () => (await ui.find({ type: 'Text', text: /❁/ }))?.text.replace(/[\s❁]/g, '')

    expect(await pageNumber()).toBe('١')

    await ui.press({ key: 'next' })
    expect(await pageNumber()).toBe('٢')
    expect(saved.get('position')).toEqual({ page: 2, cursor: 0 })

    await ui.press({ key: 'down' })
    await ui.press({ key: 'mark' })
    expect(saved.get('bookmark')).toEqual({ page: 2, surah: 2, ayah: 2 })

    await ui.input({ key: 'goto', text: '2:255' })
    expect(await pageNumber()).toBe('٤٢')
    // A hizb quarter starts on page 42 of the fixture; none on page 2.
    expect((await ui.find({ type: 'Text', text: /الحزب/ }))?.text).toContain('ربع الحزب ٥')

    await ui.press({ key: 'bookmark' })
    expect(saved.get('position')).toEqual({ page: 2, cursor: 1 })

    // The ayah split across two Mushaf lines is one ayah: three ayahs on page 2.
    await ui.press({ key: 'down' })
    await ui.press({ key: 'down' })
    expect(saved.get('position')).toEqual({ page: 3, cursor: 0 })

    await goToPage(ui, '1')
    expect(await pageNumber()).toBe('١')
    await ui.unmount()
  }
})

test('justified lines fill the column exactly; the last line is centred', () => {
  const words = 'إِنَّ ٱللَّهَ لَا يَسْتَحْىِۦٓ أَن يَضْرِبَ مَثَلًا مَّا بَعُوضَةً فَمَا فَوْقَهَا'.split(' ')
  const tokens = words.map((text, i) => ({ text, ayah: i < 5 ? 0 : 1, tone: 'text' as const }))
  const lines = layout(tokens, 24)

  expect(lines.length).toBeGreaterThan(1)
  for (const line of lines) {
    expect(cells(line.map(piece => piece.text).join(''))).toBe(24)
  }
  const last = lines.at(-1)?.map(piece => piece.text).join('') ?? ''
  expect(last.length - last.trimStart().length).toBeGreaterThan(0)
})

test('kashida stretches a word before its last letter only', () => {
  expect(kashida('قُلُوبِهِمْ')).toBe('قُلُوبِهِـمْ')
  // Its only joint is after the first letter: print never stretches there.
  expect(kashida('عَذَابٌ')).toBeUndefined()
  expect(kashida('لَا')).toBeUndefined()
  expect(kashida('دَارُ')).toBeUndefined()
})

test('spacing opens a cell after letters that do not join the next one', () => {
  expect(spaceOut('أَحْمِلُكُمْ')).toBe('أَ حْمِلُكُمْ')
  expect(spaceOut('ٱلدَّمْعِ')).toBe('ٱ لدَّ مْعِ')
  // A letter at the end of the word needs no gap: the word break follows.
  expect(spaceOut('قَالُوا')).toBe('قَا لُو ا')
  expect(spaceOut('عَلَيْهِ')).toBe('عَلَيْهِ')
})

test('the apps, phones included, get each ayah as one run of text', async ($, on) => {
  const saved = world(on)
  for (const surface of ['mobile', 'vscode', 'desktop'] as const) {
    saved.clear()
    const ui = await $.ui.mount({ plugin: 'quran', surface, ...PANE, props: { ...PANE.props, bodyColumns: 40 } })
    // The page is the session's, so it carries over from the surface before: start at 1.
    await ui.press({ key: 'prev' })
    await ui.press({ key: 'next' })

    // The app sets and wraps the text in its own font: no padding, kashida or guards.
    expect(await ui.find({ type: 'Text', text: /ذَٰلِكَ ٱلْكِتَٰبُ/ })).toBeDefined()
    expect(await ui.findAll({ type: 'Text', text: /ـ/ })).toHaveLength(0)

    await ui.press({ key: 'down' })
    await ui.press({ key: 'mark' })
    expect(saved.get('bookmark')).toEqual({ page: 2, surah: 2, ayah: 2 })
    await ui.unmount()
  }
})

test('a phone-width terminal gives the surah and the juz a line each', async ($, on) => {
  world(on)
  const ui = await $.ui.mount({ plugin: 'quran', surface: 'terminal', ...PANE, props: { ...PANE.props, bodyColumns: 20 } })

  const juz = await ui.find({ type: 'Text', text: /^\s*الجزء/ })
  expect(juz?.text).not.toContain('سورة')
  await ui.unmount()
})

test('a short pane drops blank rows, then the Go to field, then long labels, to fit', () => {
  // 15 lines in a frame of 7 rows, one row of buttons at 200 columns.
  const page = { bodyColumns: 200, lines: 15, frame: 7, hasInput: true, labels: [['Next page', 'page'] as [string, string]] }

  expect(fitHeight({ ...page, bodyRows: 7 + 29 + 3 })).toEqual({ isSpaced: true, hasInput: true, hasMargin: true, isShort: false })
  expect(fitHeight({ ...page, bodyRows: 7 + 29 + 2 }).isSpaced).toBe(false)
  expect(fitHeight({ ...page, bodyRows: 7 + 15 + 1 })).toEqual({ isSpaced: false, hasInput: false, hasMargin: false, isShort: false })
})

test('a short terminal pane keeps the whole page in view: no Go to field, short labels', async ($, on) => {
  world(on)
  // Page 1 of the fixture: 4 lines in a 7-row frame, and one row of short labels.
  const short = { ...PANE.props, scroll: { offset: 0, bodyRows: 12 } }
  const ui = await $.ui.mount({ plugin: 'quran', surface: 'terminal', ...PANE, props: short })

  expect(await ui.find({ type: 'Input' })).toBeUndefined()
  expect(await ui.find({ type: 'Button', text: 'page' })).toBeDefined()
  await ui.unmount()
})
