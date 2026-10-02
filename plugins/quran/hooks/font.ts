// `/quran font`: makes terminals draw Arabic in Amiri Quran, a Uthmani-style
// font, while Latin text keeps the terminal's own font. Linux is set up here;
// other systems get the steps, since their terminals pick fonts themselves.
// The steps that run commands live in register.tsx, beside `$`.

export const CONF_NAME = '60-quran-arabic.conf'
export const FONT_FILE = 'AmiriQuran.ttf'

const ARABIC_RANGES = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff],
]

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, '0')}`

// Monospace fonts give up their Arabic glyphs, and Amiri Quran is the first
// font they fall back to, so only Arabic changes.
export const FONTCONFIG = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<!-- Written by the Claude Code quran mod (/quran font). Remove with /quran font off. -->
<fontconfig>
  <match target="scan">
    <test name="spacing" compare="eq"><const>mono</const></test>
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
    <edit name="family" mode="append_last" binding="weak"><string>Amiri Quran</string></edit>
  </match>
</fontconfig>
`

export const OTHER_SYSTEMS = [
  'Arabic font setup for the quran mod:',
  `1. Install Amiri Quran: the file is in this mod at fonts/${FONT_FILE} (or https://github.com/aliftype/amiri/releases).`,
  '2. Point your terminal at it for non-Latin text:',
  '   - iTerm2: Settings > Profiles > Text > "Use a different font for non-ASCII text" > Amiri Quran',
  '   - WezTerm: font = wezterm.font_with_fallback({ "<your font>", "Amiri Quran" })',
  '   - Windows Terminal: "font": { "face": "<your font>, Amiri Quran" }',
  '   - Others: put Amiri Quran after your usual font in the font fallback list, if the terminal has one.',
].join('\n')
