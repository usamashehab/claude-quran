"""Builds plugins/quran/fonts/VazirCodeQuran.ttf, the font terminals draw Arabic in.

    python3 -m pip install fonttools
    python3 scripts/build_font.py [--cache DIR]

Vazir Code's letters are 0.5 em wide, but most terminal cells are wider (0.5 to
0.62 em), and a terminal centres a narrow letter in its cell, so a joined word
shows a thin gap between every two letters. This extends the baseline stroke on
each joining side of a letter past its edge, under the stroke of the letter it
joins, so the strokes meet in any of those cells. The font is renamed, as its
license asks of a changed font.
"""

import argparse
import io
import urllib.request
import zipfile
from pathlib import Path

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import flagOverlapSimple

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'plugins' / 'quran' / 'fonts' / 'VazirCodeQuran.ttf'
SOURCE = 'https://github.com/rastikerdar/vazir-code-font/releases/download/v1.1.2/vazir-code-font-v1.1.2.zip'
FAMILY = 'Vazir Code Quran'

# How far a stroke reaches past the letter's edge: enough to meet the next
# letter's stroke in a cell up to 0.5 + 2 * 0.08 em wide.
REACH = 80
# Lookups of the font's fina, medi and init features.
FINA, MEDI, INIT = 0, 1, 2


def source(cache):
    path = cache / 'Vazir-Code.ttf'
    if not path.exists():
        request = urllib.request.Request(SOURCE, headers={'User-Agent': 'claude-quran-build'})
        with urllib.request.urlopen(request, timeout=60) as response:
            archive = zipfile.ZipFile(io.BytesIO(response.read()))
        name = next(name for name in archive.namelist() if name.endswith('Vazir-Code.ttf'))
        path.write_bytes(archive.read(name))
    return path


def forms(font, lookup):
    mapping = {}
    for table in font['GSUB'].table.LookupList.Lookup[lookup].SubTable:
        mapping.update(table.mapping)
    return set(mapping.values())


def extend(font, name, stroke, left, right):
    """Adds the stroke past the left (next letter) and right (previous letter) edges."""
    glyf = font['glyf']
    glyph = glyf[name]
    pen = TTGlyphPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    bottom, top = stroke
    advance = font['hmtx'][name][0]
    # Clockwise, as TrueType draws filled shapes.
    for x0, x1 in ([(-REACH, 20)] if left else []) + ([(advance - 20, advance + REACH)] if right else []):
        pen.moveTo((x0, bottom))
        pen.lineTo((x0, top))
        pen.lineTo((x1, top))
        pen.lineTo((x1, bottom))
        pen.closePath()
    glyph = pen.glyph()
    # The added contours overlap the letter's own.
    glyph.flags[0] |= flagOverlapSimple
    glyf[name] = glyph
    glyph.recalcBounds(glyf)
    font['hmtx'][name] = (advance, glyph.xMin)


def rename(font):
    names = font['name']
    for record in names.names:
        text = record.toUnicode()
        if 'Vazir Code' in text and record.nameID in (1, 3, 4, 6, 16):
            new = text.replace('Vazir Code', FAMILY)
            names.setName(new.replace(' ', '') if record.nameID == 6 else new, record.nameID, record.platformID, record.platEncID, record.langID)


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache')
    cache = parser.parse_args().cache
    cache.mkdir(parents=True, exist_ok=True)

    font = TTFont(source(cache))
    cmap = font.getBestCmap()
    tatweel = cmap[0x0640]
    # The tatweel is the bare baseline stroke: its height is the stroke's.
    font['glyf'][tatweel].recalcBounds(font['glyf'])
    stroke = (font['glyf'][tatweel].yMin, font['glyf'][tatweel].yMax)

    # A letter's left side joins the next letter (initial and medial forms), its
    # right side the previous one (medial and final forms).
    fina, medi, init = forms(font, FINA), forms(font, MEDI), forms(font, INIT)
    for name in sorted(fina | medi | init | {tatweel}):
        extend(font, name, stroke, left=name in init | medi or name == tatweel, right=name in fina | medi or name == tatweel)

    rename(font)
    font.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}: {len(fina | medi | init) + 1} glyphs extended')


if __name__ == '__main__':
    main()
