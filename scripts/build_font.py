"""Builds plugins/quran/fonts/VazirCodeQuran.ttf, the font terminals draw Arabic in.

    python3 -m pip install fonttools numpy pillow
    python3 scripts/build_font.py [--cache DIR]

Starts from Vazir Code and changes what a terminal draws badly:

- A terminal clips each glyph to its row, about 0.24 em below the baseline, so
  a kasra or kasratan under a deep letter (سَبِيلٍ) was cut off, as were the dots
  of final ي. Each letter's kasra is placed in the row clear of the letter, the
  dots moving up where that makes room (ب) or brings them into the row (ي).
- Its marks were a hairline at terminal sizes, the dagger alef (ـٰ) least of all:
  marks are drawn bolder, those over a letter larger, the dagger alef taller.
- Its tanween looked like single marks at terminal sizes: fathatan and kasratan
  are drawn as two staggered strokes side by side, and dammatan as two dammas,
  one turned, as the Mushaf draws them. Shadda and tanween stack as two marks, so the new
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

import numpy
from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import flagOverlapSimple
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'plugins' / 'quran' / 'fonts' / 'VazirCodeQuran.ttf'
SOURCE = 'https://github.com/rastikerdar/vazir-code-font/releases/download/v1.1.2/vazir-code-font-v1.1.2.zip'
FAMILY = 'Vazir Code Quran'

# The bottom of the row a terminal draws in, in font units (1000 to the em):
# common monospace fonts reach 0.24 to 0.26 em below the baseline.
LOW = -255
# Placing marks under letters: the grid ink is compared on, the clear margin
# kept round a mark (in grid steps), how close under the baseline a mark may
# come, and the step a mark or dot moves up by.
GRID, MARGIN, GAP, STEP_UP = 10, 2, 20, 10
# How far a mark may move to the side of a letter when nothing under it fits.
SIDE = 120
# The kasra's height against the font's, so it fits under a dot in the row.
KASRA_HEIGHT = 0.58
# Marks are drawn this many units bolder (shadda, with its fine curls, less), those
# above a letter this much larger, and the dagger alef bolder and taller still,
# so a terminal's few pixels show them.
MARK_BOLD, SHADDA_BOLD, DAGGER_BOLD = 26, 8, 40
MARK_SCALE, DAGGER_TALL = 1.15, 1.45
LEFT, RIGHT, BOTTOM, TOP = -400, 1000, -700, 1300
# How far a stroke reaches past the letter's edge: enough to meet the next
# letter's stroke in a cell up to 0.5 + 2 * 0.08 em wide.
REACH = 80
# Fathatan and kasratan: two strokes side by side, each this much narrower than
# the single mark and this far apart, the left one lower, as the Mushaf staggers
# them; kasratan less, to fit under a dot in the row. They stay about as tall as
# the single mark, so they fit where it does.
NARROW, APART = 0.62, 150
STAGGER = {'uni064B': 25, 'uni064D': 0}
# Dammatan: each damma this much smaller than the single one, this far apart.
DAMMA_SCALE, DAMMA_GAP = 0.72, 20

# Lookups of the font: GSUB fina, medi, init and the mark ligatures; GPOS marks
# below and above a letter.
FINA, MEDI, INIT = 0, 1, 2
MARK_LIGATURES = (3, 4)
BELOW = 4
FATHA, DAMMA, KASRA, SHADDA = 'uni064E', 'uni064F', 'uni0650', 'uni0651'
FATHATAN, DAMMATAN, KASRATAN = 'uni064B', 'uni064C', 'uni064D'
DAGGER = 'uni0670'
SHADDAS = [SHADDA, 'uni0651064E', 'uni0651064F', 'uni064E0651']
# The marks over a letter drawn larger.
MARKS_OVER = [FATHA, DAMMA, SHADDA, 'uni0652', 'uni0653', 'uni0654', DAGGER, 'uni0651064E', 'uni0651064F', 'uni064E0651']
# The marks the Quran text puts under a letter: each must fit in the row.
MARKS_BELOW = [KASRA, KASRATAN]
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


def flatten_kasra(font):
    """A flatter kasra, kept to the font's top edge (the one under the letter)."""
    top = bounds(font, KASRA)[3]
    save(font, KASRA, mapped(outline(font, KASRA), fy=lambda y: top + (y - top) * KASRA_HEIGHT))


def bolder(value, by):
    """The outline drawn bolder by `by` units, about its own centre: copies of it
    moved across a square `by` wide, overlapping."""
    half = by / 2
    return [op for dx, dy in ((-half, -half), (half, -half), (-half, half), (half, half))
            for op in mapped(value, fx=lambda x, dx=dx: x + dx, fy=lambda y, dy=dy: y + dy)]


def strengthen_marks(font):
    """Bolder marks, and larger ones over a letter, each kept to its edge nearest
    the letter so it sits where the font placed it."""
    for mark in MARKS_OVER + [KASRA]:
        x0, y0, x1, y1 = bounds(font, mark)
        centre = (x0 + x1) / 2
        is_over = mark in MARKS_OVER
        near = y0 if is_over else y1
        tall = MARK_SCALE * (DAGGER_TALL if mark == DAGGER else 1) if is_over else 1
        wide = MARK_SCALE if is_over else 1
        value = mapped(outline(font, mark), fx=lambda x: centre + (x - centre) * wide, fy=lambda y: near + (y - near) * tall)
        bold = DAGGER_BOLD if mark == DAGGER else SHADDA_BOLD if mark in SHADDAS else MARK_BOLD
        # Bolder about the near edge too: the outline grows away from the letter.
        shift = bold / 2 if is_over else -bold / 2
        save(font, mark, mapped(bolder(value, bold), fy=lambda y: y + shift))


def tanween(font):
    """Each new tanween keeps the old one's centre and its edge nearest the
    letter, so it sits where the font placed the old one."""
    for double, mark, is_above in ((FATHATAN, FATHA, True), (KASRATAN, KASRA, False)):
        stagger = STAGGER[double]
        x0, y0, x1, y1 = bounds(font, mark)
        old_x0, old_y0, old_x1, old_y1 = bounds(font, double)
        centre, old_centre = (x0 + x1) / 2, (old_x0 + old_x1) / 2
        # Away from the letter, the lower stroke is the one nearer it for kasratan.
        near = old_y0 - y0 if is_above else old_y1 - y1
        drop = stagger if is_above else 0
        right = mapped(outline(font, mark),
                       fx=lambda x: old_centre + APART / 2 + (x - centre) * NARROW,
                       fy=lambda y: y + near + drop)
        left = mapped(right, fx=lambda x: x - APART, fy=lambda y: y - stagger)
        save(font, double, right, left)

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


class Polygons(BasePen):
    """Outlines as polygons, curves cut into short lines."""

    def __init__(self):
        super().__init__(None)
        self.polygons, self.current = [], []

    def _moveTo(self, point):
        self.current = [point]

    def _lineTo(self, point):
        self.current.append(point)

    def _curveToOne(self, one, two, three):
        start = self.current[-1]
        for step in range(1, 9):
            t = step / 8
            self.current.append(tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
                                      for a, b, c, d in zip(start, one, two, three)))

    def _qCurveToOne(self, one, two):
        start = self.current[-1]
        for step in range(1, 9):
            t = step / 8
            self.current.append(tuple((1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c for a, b, c in zip(start, one, two)))

    def _closePath(self):
        self.polygons.append(self.current)
        self.current = []


def contours(value):
    """An outline split into its closed contours."""
    out, current = [], []
    for operator, points in value:
        current.append((operator, points))
        if operator in ('closePath', 'endPath'):
            out.append(current)
            current = []
    return out


def ink(*values):
    """Where outlines put ink, on a grid of GRID font units: a boolean array
    indexed [row from TOP down, column from LEFT]."""
    image = Image.new('1', ((RIGHT - LEFT) // GRID, (TOP - BOTTOM) // GRID), 0)
    draw = ImageDraw.Draw(image)
    for value in values:
        pen = Polygons()
        for operator, points in value:
            getattr(pen, operator)(*points)
        for polygon in pen.polygons:
            if len(polygon) > 2:
                draw.polygon([((x - LEFT) / GRID, (TOP - y) / GRID) for x, y in polygon], fill=1)
    return numpy.array(image, dtype=bool)


def is_dot(contour):
    pen = BoundsPen(None)
    for operator, points in contour:
        getattr(pen, operator)(*points)
    x0, y0, x1, y1 = pen.bounds
    return x1 - x0 <= 140 and y1 - y0 <= 140 and y1 < 0, y0, y1


def place_below(font, names):
    """Puts the kasra and kasratan under each letter inside the row, clear of the
    letter: as near the font's own place as it can, moving dots under the letter
    up when that makes room (ب), and to the side only when nothing else fits.
    Dots out of the row (final ي) come up into it, clear of the letter. Returns
    the letters changed."""
    table = font['GPOS'].table.LookupList.Lookup[BELOW].SubTable[0]
    marks = table.MarkCoverage.glyphs
    records = [table.MarkArray.MarkRecord[marks.index(mark)] for mark in MARKS_BELOW]
    klass = records[0].Class
    # The marks drawn as one shape, with their anchor at (0, 0).
    shapes = [mapped(outline(font, mark), fx=lambda x, r=r: x - r.MarkAnchor.XCoordinate,
                     fy=lambda y, r=r: y - r.MarkAnchor.YCoordinate) for mark, r in zip(MARKS_BELOW, records)]
    mark_bottom = min(bounds(font, mark)[1] - r.MarkAnchor.YCoordinate for mark, r in zip(MARKS_BELOW, records))
    mark_top = max(bounds(font, mark)[3] - r.MarkAnchor.YCoordinate for mark, r in zip(MARKS_BELOW, records))
    originals = {name: outline(font, name) for name in names}

    def clear(shape, letter):
        """No ink of the shape within MARGIN of the letter's."""
        grown = shape.copy()
        for dy in range(-MARGIN, MARGIN + 1):
            for dx in range(-MARGIN, MARGIN + 1):
                grown |= numpy.roll(numpy.roll(shape, dy, 0), dx, 1)
        return not (grown & letter).any()

    def mark_fits(letter, x, y):
        if y + mark_bottom < LOW or y + mark_top > -GAP:
            return False
        return clear(ink(*[mapped(value, fx=lambda v: v + x, fy=lambda v: v + y) for value in shapes]), letter)

    def first_place(letter, x, y):
        """The place in the row nearest y that fits, else None."""
        places = sorted(range(round(LOW - mark_bottom), round(-GAP - mark_top) + 1, STEP_UP), key=lambda place: abs(place - y))
        return next((place for place in places if mark_fits(letter, x, place)), None)

    changed = []
    for base, record in zip(table.BaseCoverage.glyphs, table.BaseArray.BaseRecord):
        anchor = record.BaseAnchor[klass] if base in names else None
        if anchor is None:
            continue
        parts = contours(originals[base])
        dots = [i for i, part in enumerate(parts) if is_dot(part)[0]]
        body = ink(*[part for i, part in enumerate(parts) if i not in dots])
        lowest = min([0] + [is_dot(parts[i])[1] for i in dots])
        highest = max([LOW] + [is_dot(parts[i])[2] for i in dots])

        # Each way the dots may sit: from where the row needs them, up while
        # they stay clear of the letter.
        lifts = []
        for lift in range(max(0, round(LOW - lowest)), max(0, round(-highest)) + 1, STEP_UP):
            moved = [mapped(parts[i], fy=lambda v: v + lift) for i in dots]
            if lift == 0 or clear(ink(*moved), body):
                lifts.append((lift, ink(*moved) | body))
        if not lifts:
            lifts = [(max(0, round(LOW - lowest)), body)]

        x, y = anchor.XCoordinate, anchor.YCoordinate
        found = None
        for shift in (0, SIDE, -SIDE):
            for lift, letter in lifts:
                place = first_place(letter, x + shift, y)
                if place is not None:
                    found = (lift, x + shift, place)
                    break
            if found:
                break
        if found is None:
            # No room clear of the letter: the row's bottom edge, so it shows.
            found = (lifts[0][0], x, max(y, LOW - mark_bottom))
        lift, new_x, new_y = found
        if lift:
            save(font, base, [op for i, part in enumerate(parts)
                              for op in (mapped(part, fy=lambda v: v + lift) if i in dots else part)])
        if lift or (new_x, new_y) != (x, y):
            anchor.XCoordinate, anchor.YCoordinate = round(new_x), round(new_y)
            changed.append(base)
    return changed


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
    # Outlines before any change: a glyph drawn from another must not take its strokes.
    names = sorted(fina | medi | init | {tatweel})
    originals = {name: outline(font, name) for name in names}
    for name in names:
        advance = font['hmtx'][name][0]
        bars = []
        if name in init | medi or name == tatweel:
            bars.append((-REACH, bottom, 20, top))
        if name in fina | medi or name == tatweel:
            bars.append((advance - 20, bottom, advance + REACH, top))
        save(font, name, originals[name], bars=bars)
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
    flatten_kasra(font)
    strengthen_marks(font)
    tanween(font)
    unligate_tanween(font)
    placed = place_below(font, letters(font))
    joined = join(font)
    rename(font)
    font.save(OUT)
    print(f'wrote {OUT.relative_to(ROOT)}: marks or dots moved into the row on {len(placed)} letters, {joined} glyphs joined')


if __name__ == '__main__':
    main()
