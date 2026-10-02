# claude-quran

A Claude Code plugin marketplace with one plugin, **quran**: the Quran in a Claude Code pane, laid out like the Madinah Mushaf (604 pages, 15 lines per page), with your place saved and a bookmarked ayah.

## Install

In Claude Code:

```
/plugin marketplace add usamashehab/claude-quran
/plugin install quran@claude-quran
```

Then run `/quran`. For better Arabic in the terminal, run `/quran font` once and restart the terminal.

See [plugins/quran/README.md](plugins/quran/README.md) for the commands, keys and credits.

## Develop

Load the plugin from a checkout:

```
claude --plugin-dir ./plugins/quran
```

Check it with `claude plugin validate ./plugins/quran` and `claude plugin test ./plugins/quran`.

Rebuild the page data (`plugins/quran/data/quran.json`) from the Quran.com and AlQuran Cloud APIs with `python3 scripts/build_data.py`; downloads are kept in `.cache/`.

## License

The code is MIT licensed (see [LICENSE](LICENSE)). The bundled Kawkab Mono font is under the SIL Open Font License 1.1 (`plugins/quran/fonts/OFL.txt`), and the Quran text and page layout come from the sources credited in [plugins/quran/README.md](plugins/quran/README.md).
