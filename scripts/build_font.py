"""Builds plugins/quran/fonts/VazirCodeQuran.ttf, the font terminals draw Arabic in.

    python3 -m pip install fonttools
    python3 scripts/build_font.py [--cache DIR]

Starts from Vazir Code and changes what a terminal draws badly:

- A terminal clips each glyph to its row, about 0.93 em above the baseline and
  0.24 below, so a kasra under a deep letter (سَبِيلٍ) or a mark above a tall one
  was cut off. Arabic is drawn a little shorter and higher, and the few marks
  still past the row's edge are moved in to it.
- Its tanween looked like single marks at terminal sizes: fathatan and kasratan
  are drawn as two well-apart strokes, and dammatan as two dammas, one turned,
  as the Mushaf draws it. Shadda and tanween stack as two marks, so the new
  tanween shows there too.
- Its letters are 0.5 em wide, but most terminal cells are wider (0.5 to 0.62 em),
  and a terminal centres a narrow letter in its cell, so joined letters showed a
  gap. The baseline stroke on each joining side reaches past the letter's edge,
  under the stroke of the letter it joins, so they meet in any of those cells.

The font is renamed, as its license asks of a changed font.
"""

import argparse
import io
import urllib.request
import zipfile
from pathlib import Path

from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import flagOverlapSimple

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'plugins' / 'quran' / 'fonts' / 'VazirCodeQuran.ttf'
SOURCE = 'https://github.com/rastikerdar/vazir-code-font/releases/download/v1.1.2/vazir-code-font-v1.1.2.zip'
FAMILY = 'Vazir Code Quran'

# The row a terminal draws in, in font units (1000 to the em), with a little to
# spare: common monospace fonts reach 0.93 to 0.94 em up and 0.24 to 0.26 down.
LOW, HIGH = -230, 925
# Arabic is drawn this much shorter and this much higher, to make room for marks.
HEIGHT, RISE = 0.88, 90
# How far a stroke reaches past the letter's edge: enough to meet the next
# letter's stroke in a cell up to 0.5 + 2 * 0.08 em wide.
REACH = 80
# Fathatan and kasratan: each stroke this much flatter than the single mark, the
# second this far from the first.
FLAT, STEP = 0.7, 125
# Dammatan: each damma this much smaller than the single one, this far apart.
DAMMA_SCALE, DAMMA_GAP = 0.72, 20

# Lookups of the font: GSUB fina, medi, init and the mark ligatures; GPOS marks
# below and above a letter.
FINA, MEDI, INIT = 0, 1, 2
MARK_LIGATURES = (3, 4)
BELOW, ABOVE = 4, 7
FATHA, DAMMA, KASRA, SHADDA = 'uni064E', 'uni064F', 'uni0650', 'uni0651'
FATHATAN, DAMMATAN, KASRATAN = 'uni064B', 'uni064C', 'uni064D'
# The marks the Quran text puts on a letter: each must fit in the row on every letter.
MARKS_BELOW = [KASRA, KASRATAN, 'uni0655']
MARKS_ABOVE = [FATHA, DAMMA, SHADDA, 'uni0652', 'uni0653', 'uni0670', FATHATAN, DAMMATAN]
ARABIC = [(0x0600, 0x06FF), (0x0750, 0x077F), (0x08A0, 0x08FF), (0xFB50, 0xFDFF), (0xFE70, 0xFEFF)]


def source(cache):
    path = cache / 'Vazir-Code.ttf'
    if not path.exists():
        request = urllib.request.Request(SOURCE, headers={'User-Agent': 'claude-quran-build'})
        with urllib.request.urlopen(request, timeout=60) as response:
            archive = zipfile.ZipFile(io.BytesIO(response.read()))
        name = next(name for name in archive.namelist() if name.endswith('Vazir-Code.ttf'))
        path.write_bytes(archive.read(name))
    return path


def outline(font, name):
    pen = DecomposingRecordingPen(font.getGlyphSet())
    font.getGlyphSet()[name].draw(pen)
    return pen.value


def mapped(value, fx=lambda x: x, fy=lambda y: y):
    # A quadratic contour with no on-curve point ends in None.
    return [(operator, [point and (fx(point[0]), fy(point[1])) for point in points]) for operator, points in value]


def bounds(font, name):
    glyph = font['glyf'][name]
    glyph.recalcBounds(font['glyf'])
    return (glyph.xMin, glyph.yMin, glyph.xMax, glyph.yMax) if glyph.numberOfContours else None


def save(font, name, *outlines, reversed_outlines=(), bars=()):
    """Sets a glyph to outlines, mirrored outlines (drawn the other way round, as
    a filled shape must be) and rectangles."""
    pen = TTGlyphPen(None)
    for value in outlines:
        for operator, points in value:
            getattr(pen, operator)(*points)
    reverse = ReverseContourPen(pen)
    for value in reversed_outlines:
        for operator, points in value:
            getattr(reverse, operator)(*points)
    # Clockwise, as TrueType draws filled shapes.
    for x0, y0, x1, y1 in bars:
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    glyph = pen.glyph()
    if glyph.numberOfContours > 0:
        # The contours may overlap.
        glyph.flags[0] |= flagOverlapSimple
    font['glyf'][name] = glyph
    glyph.recalcBounds(font['glyf'])
    font['hmtx'][name] = (font['hmtx'][name][0], getattr(glyph, 'xMin', 0))


def single(font, lookup):
    mapping = {}
    for table in font['GSUB'].table.LookupList.Lookup[lookup].SubTable:
        mapping.update(table.mapping)
    return mapping


def letters(font):
    """Glyphs of Arabic letters: the encoded ones and their contextual forms."""
    names = {name for code, name in font.getBestCmap().items() if any(lo <= code <= hi for lo, hi in ARABIC)}
    for lookup in (FINA, MEDI, INIT):
        names |= set(single(font, lookup).values())
    classes = font['GDEF'].table.GlyphClassDef.classDefs
    return {name for name in names if classes.get(name) != 3 and bounds(font, name)}


def tanween(font):
    """Each new tanween keeps the old one's edge nearest the letter, so it sits
    where the font placed the old one."""
    for double, mark, away in ((FATHATAN, FATHA, 1), (KASRATAN, KASRA, -1)):
        _, y0, _, y1 = bounds(font, mark)
        near = y0 if away > 0 else y1
        stroke = mapped(outline(font, mark), fy=lambda y, near=near: near + (y - near) * FLAT)
        _, old0, _, old1 = bounds(font, double)
        to = (old0 if away > 0 else old1) - near
        first = mapped(stroke, fy=lambda y, to=to: y + to)
        second = mapped(first, fy=lambda y, away=away: y + away * STEP)
        save(font, double, first, second)

    x0, y0, x1, _ = bounds(font, DAMMA)
    old_x0, old_y0, old_x1, _ = bounds(font, DAMMATAN)
    centre = (old_x0 + old_x1) / 2
    # The right damma as it is, the left one turned, both on the old bottom edge.
    right = mapped(outline(font, DAMMA),
                   fx=lambda x: centre + DAMMA_GAP / 2 + (x - x0) * DAMMA_SCALE,
                   fy=lambda y: old_y0 + (y - y0) * DAMMA_SCALE)
    left = mapped(right, fx=lambda x: 2 * centre - x)
    save(font, DAMMATAN, right, reversed_outlines=[left])


def unligate_tanween(font):
    """Shadda with a tanween was one glyph drawn with the old tanween; as two
    marks, the font's mark-on-mark positioning stacks them."""
    drop = {'uni0651064B', 'uni0651064C', 'uni064B0651'}
    for lookup in MARK_LIGATURES:
        for table in font['GSUB'].table.LookupList.Lookup[lookup].SubTable:
            for first in list(table.ligatures):
                kept = [ligature for ligature in table.ligatures[first] if ligature.LigGlyph not in drop]
                if kept:
                    table.ligatures[first] = kept
                else:
                    del table.ligatures[first]


def arabic_marks(font):
    classes = font['GDEF'].table.GlyphClassDef.classDefs
    return {name for name, kind in classes.items() if kind == 3 and name.startswith('uni06')}


def lift(font, names):
    """Arabic letters and marks a little shorter and higher, so the marks under
    and over a letter fall in the row. Every glyph and anchor moves alike, so
    letters, dots and marks keep their places against each other."""
    move = lambda y: round(y * HEIGHT + RISE)
    for name in names:
        save(font, name, mapped(outline(font, name), fy=move))
    for lookup in font['GPOS'].table.LookupList.Lookup:
        for table in lookup.SubTable:
            anchors = []
            for coverage, array, records, field in (
                ('MarkCoverage', 'MarkArray', 'MarkRecord', 'MarkAnchor'),
                ('Mark1Coverage', 'Mark1Array', 'MarkRecord', 'MarkAnchor'),
            ):
                if hasattr(table, coverage):
                    for glyph, record in zip(getattr(table, coverage).glyphs, getattr(getattr(table, array), records)):
                        if glyph in names:
                            anchors.append(getattr(record, field))
            for coverage, array, records, field in (
                ('BaseCoverage', 'BaseArray', 'BaseRecord', 'BaseAnchor'),
                ('Mark2Coverage', 'Mark2Array', 'Mark2Record', 'Mark2Anchor'),
            ):
                if hasattr(table, coverage):
                    for glyph, record in zip(getattr(table, coverage).glyphs, getattr(getattr(table, array), records)):
                        if glyph in names:
                            anchors += [anchor for anchor in getattr(record, field) if anchor]
            for anchor in anchors:
                anchor.YCoordinate = move(anchor.YCoordinate)


def clamp(font, names):
    """The few marks still past the row, under a deep letter or over a hamza, move
    in to its edge."""
    moved_anchors = 0
    for lookup, marks in ((BELOW, MARKS_BELOW), (ABOVE, MARKS_ABOVE)):
        for table in font['GPOS'].table.LookupList.Lookup[lookup].SubTable:
            mark_glyphs = table.MarkCoverage.glyphs
            # How far each mark reaches from its anchor, down and up, by class.
            reach = {}
            for mark in marks:
                if mark in mark_glyphs:
                    record = table.MarkArray.MarkRecord[mark_glyphs.index(mark)]
                    _, y0, _, y1 = bounds(font, mark)
                    down, up = reach.get(record.Class, (0, 0))
                    anchor_y = record.MarkAnchor.YCoordinate
                    reach[record.Class] = (min(down, y0 - anchor_y), max(up, y1 - anchor_y))
            for base, record in zip(table.BaseCoverage.glyphs, table.BaseArray.BaseRecord):
                if base not in names:
                    continue
                for klass, (down, up) in reach.items():
                    anchor = record.BaseAnchor[klass]
                    if anchor is None:
                        continue
                    y = max(anchor.YCoordinate, LOW - down) if lookup == BELOW else min(anchor.YCoordinate, HIGH - up)
                    if y != anchor.YCoordinate:
                        anchor.YCoordinate = y
                        moved_anchors += 1
    return moved_anchors


def forms(font, lookup):
    return set(single(font, lookup).values())


def join(font):
    """Lengthens the baseline stroke on each joining side of a letter."""
    cmap = font.getBestCmap()
    tatweel = cmap[0x0640]
    # The tatweel is the bare baseline stroke: its height is the stroke's.
    _, bottom, _, top = bounds(font, tatweel)
    # A letter's left side joins the next letter (initial and medial forms), its
    # right side the previous one (medial and final forms).
    fina, medi, init = forms(font, FINA), forms(font, MEDI), forms(font, INIT)
    for name in sorted(fina | medi | init | {tatweel}):
        advance = font['hmtx'][name][0]
        bars = []
        if name in init | medi or name == tatweel:
            bars.append((-REACH, bottom, 20, top))
        if name in fina | medi or name == tatweel:
            bars.append((advance - 20, bottom, advance + REACH, top))
        save(font, name, outline(font, name), bars=bars)
    return len(fina | medi | init) + 1


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
    tanween(font)
    unligate_tanween(font)
    lift(font, letters(font) | arabic_marks(font))
    clamped = clamp(font, letters(font))
    joined = join(font)
    rename(font)
    font.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}: {clamped} mark places moved into the row, {joined} glyphs joined')


if __name__ == '__main__':
    main()
