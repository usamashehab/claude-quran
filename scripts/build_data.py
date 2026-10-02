"""Builds plugins/quran/data/quran.json, the Mushaf pages the plugin draws.

    python3 scripts/build_data.py [--cache DIR]

Downloads each of the 604 Madinah Mushaf pages from the Quran.com API (word by
word, with the line each word sits on) and the surah names from AlQuran Cloud,
keeping the downloads in DIR (default .cache/) so a rebuild reads them again.

The text is the King Fahd Complex (KFGQPC) Hafs text, changed only where a
monospace terminal cannot draw it: see `terminal`.
"""

import argparse
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'plugins' / 'quran' / 'data' / 'quran.json'
PAGES = 604
LINES = 15
PAGE_URL = (
    'https://api.quran.com/api/v4/verses/by_page/{}?words=true'
    '&word_fields=text_qpc_hafs,line_number&per_page=50&mushaf=1'
)
SURAHS_URL = 'https://api.alquran.cloud/v1/surah'

# The Mushaf's own codepoints for open tanween and its sukun become the standard
# marks a monospace font has.
MAP = {
    'ٗ': 'ً', 'ٞ': 'ٌ', 'ٖ': 'ٍ',
    'ۡ': 'ْ', '۠': 'ْ', 'ۤ': 'ٓ',
}
# Iqlab: the Mushaf writes a tanween as one vowel and a small meem (أَلِيمُۢ),
# which no monospace font draws, so the pair becomes the tanween (أَلِيمٌ). A small
# meem on a letter with no vowel (مِنۢ) goes on its own.
IQLAB = re.compile('([َُِ])?[ۭۢ]')
TANWEEN = {'َ': 'ً', 'ُ': 'ٌ', 'ِ': 'ٍ'}
JOINS_NEXT = set('بتثجحخسشصضطظعغ'
                 'فقكلمنهيىئ')
MARK = re.compile('[ؐ-ًؚ-ٟۖ-ۭ]')
FATHA, DAGGER, TATWEEL = 'َ', 'ٰ', 'ـ'


def dagger(word):
    """A dagger alef (U+0670) right after a fatha drops out of a terminal cell.

    After a letter that joins the next one it goes on a tatweel, as the Uthmani
    text writes it (جَنَّـٰت); elsewhere the fatha goes, so the alef stays.
    """
    out = []
    chars = list(word)
    for i, char in enumerate(chars):
        if char == DAGGER and out and out[-1] == FATHA:
            base = next((c for c in reversed(out) if not MARK.match(c)), '')
            is_followed = any(not MARK.match(c) and c != DAGGER for c in chars[i + 1:])
            if base in JOINS_NEXT and is_followed:
                out.append(TATWEEL)
            else:
                out.pop()
        out.append(char)
    return ''.join(out)


def terminal(word):
    word = IQLAB.sub(lambda match: TANWEEN.get(match.group(1) or '', ''), word)
    return dagger(''.join(MAP.get(char, char) for char in word))


def fetch(url, path):
    if path.exists():
        return json.loads(path.read_text())
    request = urllib.request.Request(url, headers={'User-Agent': 'claude-quran-build'})
    for attempt in range(6):
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                data = json.load(response)
            path.write_text(json.dumps(data, ensure_ascii=False))
            return data
        except OSError:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'could not fetch {url}')


def page_lines(verses):
    """A page's 15 lines: None where empty, else [surah, ayah, words, ends] segments."""
    lines = [None] * LINES
    for verse in verses:
        surah, ayah = map(int, verse['verse_key'].split(':'))
        for word in verse['words']:
            line = lines[word['line_number'] - 1]
            if line is None:
                line = lines[word['line_number'] - 1] = []
            if not line or line[-1][:2] != [surah, ayah]:
                line.append([surah, ayah, '', 0])
            if word['char_type_name'] == 'end':
                line[-1][3] = 1
            else:
                line[-1][2] = f"{line[-1][2]} {terminal(word['text_qpc_hafs'])}".strip()
    return lines


def quarter_start(verses, before):
    """[quarter, hizb] of a hizb quarter that begins on the page, else None.

    quarter is 0 at the hizb's start, then 1, 2 and 3 at its ¼, ½ and ¾.
    """
    previous = before['rub_el_hizb_number'] if before else 0
    for verse in verses:
        rub = verse['rub_el_hizb_number']
        if rub != previous:
            return [(rub - 1) % 4, (rub - 1) // 4 + 1]
        previous = rub
    return None


def place_headers(pages):
    """Surah headers and basmalas sit on the empty lines just above a first ayah.

    When the surah starts at the top of a page, its header is the last line of the
    page before, as the printed Mushaf has it.
    """
    for i, page in enumerate(pages):
        for at, line in enumerate(page['l']):
            if not line or line[0][1] != 1 or (at > 0 and page['l'][at - 1]):
                continue
            surah = line[0][0]
            above = [{'h': surah}] if surah in (1, 9) else [{'h': surah}, {'b': surah}]
            for k, item in enumerate(reversed(above)):
                spot = at - 1 - k
                lines = page['l'] if spot >= 0 else pages[i - 1]['l']
                assert lines[spot] is None, (i + 1, spot)
                lines[spot] = item
    empty = [(i + 1, at + 1) for i, page in enumerate(pages[2:], 2) for at, line in enumerate(page['l']) if line is None]
    assert not empty, f'empty lines no header explains: {empty[:5]}'


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--cache', type=Path, default=ROOT / '.cache')
    cache = parser.parse_args().cache
    cache.mkdir(parents=True, exist_ok=True)

    names = fetch(SURAHS_URL, cache / 'surahs.json')['data']
    surahs = [[s['name'].replace('سُورَةُ ', '').strip(), s['englishName'], s['numberOfAyahs']] for s in names]

    with ThreadPoolExecutor(6) as pool:
        verses = list(pool.map(lambda n: fetch(PAGE_URL.format(n), cache / f'page-{n:03}.json')['verses'], range(1, PAGES + 1)))
    pages = [{'j': v[0]['juz_number'], 'q': quarter_start(v, verses[n - 1][-1] if n else None), 'l': page_lines(v)}
             for n, v in enumerate(verses)]
    place_headers(pages)
    # Pages 1 and 2 hold fewer lines.
    for page in pages[:2]:
        while page['l'][-1] is None:
            page['l'].pop()

    OUT.write_text(json.dumps({'s': surahs, 'p': pages}, ensure_ascii=False, separators=(',', ':')))
    print(f'wrote {OUT.relative_to(ROOT)}: {OUT.stat().st_size} bytes, {PAGES} pages')


if __name__ == '__main__':
    main()
