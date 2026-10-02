// `/quran font`: makes terminals draw Arabic in Vazir Code Quran (Vazir Code,
// a monospace font whose alef stands apart from the next letter, with its joining
// strokes lengthened to meet across any cell width; see scripts/build_font.py),
// with Kawkab Mono for the marks it lacks (the alef wasla ٱ), while
// Latin text keeps the terminal's own font. Linux is set up here; other systems
// get the steps, since their terminals pick fonts themselves.
// The steps that run commands live in register.tsx, beside `$`.

export const CONF_NAME = '60-quran-arabic.conf'
// The fonts, in the order a terminal falls back to them for Arabic.
export const FAMILIES = ['Vazir Code Quran', 'Kawkab Mono']
export const FONT_FILES = ['VazirCodeQuran.ttf', 'KawkabMono-Regular.ttf', 'KawkabMono-Bold.ttf']

const ARABIC_RANGES = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, '0')}`

// Other monospace fonts give up their Arabic glyphs, and ours go right after the
// monospace font asked for, ahead of the system's own fallbacks (Ubuntu puts
// proportional Noto fonts there), so only Arabic changes.
export const FONTCONFIG = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<!-- Written by the Claude Code quran mod (/quran font). Remove with /quran font off. -->
<fontconfig>
  <match target="scan">
    <test name="spacing" compare="eq"><const>mono</const></test>
${FAMILIES.map(family => `    <test name="family" compare="not_eq"><string>${family}</string></test>`).join('\n')}
    <edit name="charset" mode="assign">
      <minus>
        <name>charset</name>
        <charset>
${ARABIC_RANGES.map(([from, to]) => `          <range><int>${hex(from ?? 0)}</int><int>${hex(to ?? 0)}</int></range>`).join('\n')}
        </charset>
      </minus>
    </edit>
  </match>
  <match target="pattern">
    <test name="family" compare="contains" ignore-blanks="true"><string>mono</string></test>
    <edit name="family" mode="append" binding="weak">${FAMILIES.map(family => `<string>${family}</string>`).join('')}</edit>
  </match>
</fontconfig>
`

export const OTHER_SYSTEMS = [
  'Arabic font setup for the quran mod:',
  "1. Install Vazir Code Quran and Kawkab Mono: the files are in this mod's fonts/ folder.",
  '2. Point your terminal at them for non-Latin text:',
  '   - iTerm2: Settings > Profiles > Text > "Use a different font for non-ASCII text" > Vazir Code Quran',
  '   - WezTerm: font = wezterm.font_with_fallback({ "<your font>", "Vazir Code Quran", "Kawkab Mono" })',
  '   - Windows Terminal: "font": { "face": "<your font>, Vazir Code Quran, Kawkab Mono" }',
  '   - Others: put Vazir Code Quran, then Kawkab Mono, after your usual font in the fallback list, if the terminal has one.',
].join('\n')
