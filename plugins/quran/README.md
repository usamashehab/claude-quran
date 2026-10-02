# quran: the Mushaf in a Claude Code pane

Read the whole Quran inside Claude Code, page by page, laid out like the Madinah Mushaf: the same 604 pages, the same 15 lines per page and the same words on each line, with surah headers and the basmala where the printed Mushaf puts them.

## Commands

| Command | Does |
| --- | --- |
| `/quran` | Opens the Mushaf at the page where you stopped (page 1 the first time) |
| `/quran 50` | Opens page 50. A number past either end opens page 1 or page 604 |
| `/quran 2:255` | Opens the page of Surah 2, ayah 255, with that ayah highlighted. `2.255` works too. An ayah that does not exist (`/quran 2:999`) answers `No ayah 2:999` |
| `/quran b` | Opens the page of your bookmarked ayah, with it highlighted. `/quran bookmark` works too |
| `/quran font` | Sets up the terminal's Arabic font: on Linux it installs the fonts and a fontconfig rule, elsewhere it prints the steps (see [The Arabic font](#the-arabic-font)) |
| `/quran font off` | On Linux, removes the fontconfig rule `/quran font` added. The font files stay installed, unused |

Anything else answers `Not a page, surah:ayah, or "b"`.

## Keys inside the pane

| Key | Does |
| --- | --- |
| `n` | Next page |
| `p` | Previous page |
| `j` | Next ayah: highlights the page's first ayah, then moves on; past the page's last ayah it turns to the next page |
| `k` | Previous ayah: highlights the page's last ayah, then moves back; before the page's first ayah it turns back to the last ayah of the page before |
| `m` | Bookmarks the highlighted ayah (one bookmark; a new one replaces it); with none highlighted, it says to pick one with `j` or `k` |
| `b` | Goes to the bookmarked ayah (with none set, it says to press `m` first) |
| `t` | Tashkeel on / off |
| `d` | Day / night page |
| `g` | Letter gaps on / off (off at first): a cell after letters that do not join the next one (أَ حْمِلُكُمْ), and 2 between words. Terminal only |
| `Esc` | Closes the pane |

The keys are also buttons under the page, for a mouse or a touch screen. Below them, a **Go to** field takes the same page, `surah:ayah` or `b` as the command.

## What is kept

A page opens with no ayah highlighted; `j` or `k` picks one, and going to `surah:ayah` or the bookmark highlights that ayah. The bookmarked ayah shows by its number, shaded and bold. Your page, the bookmark and the day/night choice are kept between sessions. Tashkeel and letter gaps go back to their defaults (tashkeel on, gaps off) in each new session.

## The page

The top line names the surah and the juz; the bottom shows the page number and, on a page where a hizb quarter starts, which one (ربع الحزب ٥). Each ayah ends with its number in ﴾ ﴿.

In the terminal the whole page fits the pane's height, with no scrolling, down to a pane about as tall as its lines: when the pane is short, the page drops the blank rows between its lines, then the Go to field, then shortens the button labels. A terminal's text size is the terminal's own, so for larger text, zoom the terminal (ctrl and + in most).

Every page keeps the Mushaf's own 15 lines and ends where the Mushaf ends it, at the end of an ayah. A line takes one row when the pane has room for the page's longest line: 38 to 73 columns, 57 for most pages, plus 6 for the frame. In a narrower pane each line takes two rows or more, each justified to the full width like a Mushaf line. The pane opens 88 columns wide, but a width you dragged the pane to is kept instead: drag it wider to see each line on one row. When the surah and the juz do not fit on one line, they take a line each.

In the Claude desktop and mobile apps and in VS Code, the page is set in the app's own font, which joins the letters and orders the text itself. On a phone the page flows like a book, and on a wide screen it keeps the Mushaf's lines. The mobile app has no text field yet, so going to a page there is by the buttons or `/quran 50`.

## The Arabic font

Terminals draw text in their own monospace font, and most monospace fonts draw Arabic poorly. `/quran font` fixes that:

- **Linux** (fontconfig): installs Vazir Code Quran and Kawkab Mono to `~/.local/share/fonts`, and adds one file, `~/.config/fontconfig/conf.d/60-quran-arabic.conf`. With it, monospace fonts give their Arabic over to Vazir Code Quran, and to Kawkab Mono for the few marks it lacks, such as the alef wasla (ٱ). Vazir Code Quran is Vazir Code, a monospace font whose alef stands clear of the next letter, changed for terminals: joining strokes lengthened so joined letters meet whatever the cell width; kasra and kasratan placed inside the terminal's row, clear of the letter (a terminal cuts off anything below the row, so they used to vanish under letters like final ل and ي), with the dots of ب and final ي moved up where needed; letters drawn bolder, nearer the Mushaf's heavy script; marks drawn a little bolder, those over a letter larger, and the dagger alef (ـٰ) taller, so the tashkeel shows at terminal sizes; and tanween redrawn so it reads apart from a single mark (fathatan and kasratan as two staggered strokes side by side, dammatan as two dammas). Latin text keeps your font. Restart the terminal after running it. `/quran font off` removes the file.
- **macOS, Windows, others**: the command prints the setting to change in iTerm2, WezTerm, Windows Terminal and others. Both fonts are in this mod's `fonts/` folder.

What it changes on Linux: the rule is for your user only, and covers Arabic drawn in any monospace font, not only this pane. Every terminal, and any app set to a monospace font (a code editor, for one), draws Arabic in Vazir Code Quran from then on. Proportional text (browsers, the desktop, documents) keeps its own Arabic font.

A terminal still puts every letter in a fixed-width cell, so the page reads like the Mushaf in a plainer hand: the same lines and words, without the calligraphy's stretched letters and stacked words.

## Credits

- Mushaf text and line layout: [Quran.com API](https://api.quran.com) (Quran Foundation), Madinah Mushaf, 15-line layout. The text is the King Fahd Complex (KFGQPC) Hafs text, with its Mushaf-specific marks mapped to the standard ones a monospace font draws: open tanween to tanween, the Mushaf sukun to sukun, and the small iqlab meem left out.
- Surah names: [AlQuran Cloud](https://alquran.cloud) (Tanzil Uthmani text).
- Fonts: [Vazir Code](https://github.com/rastikerdar/vazir-code-font) by Saber Rastikerdar, Bitstream Vera license (`fonts/Vazir-Code-LICENSE.txt`), changed for terminals as above and renamed Vazir Code Quran; [Kawkab Mono](https://github.com/aiaf/kawkab-mono) by Abdullah Arif, SIL Open Font License 1.1 (`fonts/KawkabMono-OFL.txt`).
