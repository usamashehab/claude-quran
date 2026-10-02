# claude-quran

A Claude Code plugin marketplace with one plugin, **quran**: the Quran in a Claude Code pane, laid out like the Madinah Mushaf (604 pages, 15 lines per page), with your place saved and a bookmarked ayah.

## Install

In Claude Code:

```
/plugin marketplace add usamashehab/claude-quran
/plugin install quran@claude-quran
```

Then run `/quran`. For better Arabic in the terminal, run `/quran font` once and restart the terminal.

| Command | Does |
| --- | --- |
| `/quran` | Opens the Mushaf where you stopped |
| `/quran 50` | Opens page 50 |
| `/quran 2:255` | Opens the page of Surah 2, ayah 255, with that ayah highlighted |
| `/quran b` | Opens your bookmarked ayah |
| `/quran font` | Sets up the terminal's Arabic font (Linux; prints the steps elsewhere) |
| `/quran font off` | Removes that font setup |

Inside the pane: `n`/`p` page, `j`/`k` ayah, `m` bookmark, `b` go to bookmark, `t` tashkeel, `d` day/night, `g` letter gaps, `Esc` close.

See [plugins/quran/README.md](plugins/quran/README.md) for what each does, what the font setup changes, and the credits.

## Develop

Load the plugin from a checkout:

```
claude --plugin-dir ./plugins/quran
```

Check it with `claude plugin validate ./plugins/quran` and `claude plugin test ./plugins/quran`.

Rebuild the page data (`plugins/quran/data/quran.json`) from the Quran.com and AlQuran Cloud APIs with `python3 scripts/build_data.py`; downloads are kept in `.cache/`. Rebuild the terminal font (`plugins/quran/fonts/VazirCodeQuran.ttf`) from Vazir Code with `python3 scripts/build_font.py` (needs `pip install fonttools`).

## License

The code is MIT licensed (see [LICENSE](LICENSE)). The bundled fonts keep their own licenses: Vazir Code Quran (a changed Vazir Code) under the Bitstream Vera license (`plugins/quran/fonts/Vazir-Code-LICENSE.txt`) and Kawkab Mono under the SIL Open Font License 1.1 (`plugins/quran/fonts/KawkabMono-OFL.txt`), and the Quran text and page layout come from the sources credited in [plugins/quran/README.md](plugins/quran/README.md).
