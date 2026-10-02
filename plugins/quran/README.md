# quran: the Mushaf in a Claude Code pane

Read the whole Quran inside Claude Code, page by page, laid out like the Madinah Mushaf: the same 604 pages, the same 15 lines per page and the same words on each line, with surah headers and the basmala where the printed Mushaf puts them.

## Use

| Command | Does |
| --- | --- |
| `/quran` | Opens the Mushaf where you stopped |
| `/quran 50` | Opens page 50 |
| `/quran 2:255` | Opens the page of Surah 2, ayah 255, with that ayah selected |
| `/quran b` | Opens your bookmark |
| `/quran font` | Makes your terminal draw Arabic in a Uthmani-style font (see below) |
| `/quran font off` | Undoes `/quran font` |

Keys inside the pane:

| Key | Does |
| --- | --- |
| `n` / `p` | Next / previous page |
| `j` / `k` | Next / previous ayah (highlighted) |
| `m` | Bookmark the highlighted ayah |
| `b` | Go to the bookmark |
| `d` | Day / night page |
| `t` | Tashkeel on / off |
| `Esc` | Close |

Your page, the highlighted ayah, the bookmark and the day/night choice are kept between sessions.

The page keeps the Mushaf's own lines when the pane has room for its longest line (usually 65 to 80 columns, plus 6 for the frame). In a narrower pane the text reflows to fit, with the same highlights and bookmarks.

## The Arabic font

Terminals draw text in their own monospace font, and most monospace fonts draw Arabic poorly. `/quran font` fixes that:

- **Linux** (fontconfig): installs Kawkab Mono for you if it is missing, and adds one file, `~/.config/fontconfig/conf.d/60-quran-arabic.conf`. With it, monospace fonts give their Arabic over to Kawkab Mono, a monospace Arabic font whose letters join across cells. Latin text keeps your font. Restart the terminal after running it. `/quran font off` removes the file.
- **macOS, Windows, others**: the command prints the setting to change in iTerm2, WezTerm, Windows Terminal and others. Kawkab Mono is in this mod's `fonts/` folder.

A terminal still puts every letter in a fixed-width cell, so the page reads like the Mushaf in a plainer hand: the same lines and words, without the calligraphy's stretched letters and stacked words.

## Credits

- Mushaf text and line layout: [Quran.com API](https://api.quran.com) (Quran Foundation), Madinah Mushaf, 15-line layout.
- Surah names: [AlQuran Cloud](https://alquran.cloud) (Tanzil Uthmani text).
- Font: [Kawkab Mono](https://github.com/aiaf/kawkab-mono) by Abdullah Arif, SIL Open Font License 1.1 (`fonts/OFL.txt`).
