"""Extract every row of the 3MW+ permit ledger PDF (전기위원회 허가대장) into JSON lines.

Three layouts appear in the PDF:
  8 columns  (Type A, to 2019): NO | 상호 | 위치 | 원동력 | 용량 | 허가및변경일 | 준비기간 | 기타   -- year from 'ㅇ YYYY - NO' headers
  9 columns  (Type B):          연도 | NO | 상호 | 위치 | 원동력 | 용량 | 허가/변경일 | 준비기간 | 기타
  10 columns (Type B + 인가):    연도 | NO | 상호 | 위치 | 원동력 | 용량 | 허가/변경일 | 공사계획인가기간 | 준비기간 | 기타
Rows whose number cells are empty continue the row above (text spilled onto the next line or page).
"""
import json, re, sys
import pdfplumber

src, out = sys.argv[1], sys.argv[2]
YEAR = re.compile(r'ㅇ\s*(\d{4})\s*-\s*NO')
rows, cur, year = [], None, None


def flush():
    global cur
    if cur:
        rows.append(cur)
    cur = None


with pdfplumber.open(src) as pdf:
    for pn, page in enumerate(pdf.pages):
        marks = []  # (top, year)
        for ln in page.extract_text_lines():
            m = YEAR.search(ln['text'])
            if m:
                marks.append((ln['top'], int(m.group(1))))
        tables = sorted(page.find_tables(), key=lambda t: t.bbox[1])
        for t in tables:
            data = t.extract()
            for ri, r in enumerate(data):
                top = t.rows[ri].bbox[1] if ri < len(t.rows) else t.bbox[1]
                for mt, y in marks:
                    if mt <= top:
                        year = y if (year is None or y >= year) else year
                cells = [(c or '').strip() for c in r]
                if not any(cells):
                    continue
                first = re.sub(r'\s', '', cells[0])
                if first.startswith('NO') or first.startswith('N0'):
                    continue
                n = len(cells)
                if n == 8:
                    is_new = bool(cells[0]) and bool(re.search(r'\d', cells[0]))
                    norm = {'year': year, 'no': cells[0], 'company': cells[1], 'location': cells[2], 'source': cells[3],
                            'capacity': cells[4], 'date': cells[5], 'const': '', 'prep': cells[6], 'note': cells[7]}
                elif n in (9, 10):
                    is_new = bool(cells[0] or cells[1])
                    c = cells if n == 10 else cells[:7] + [''] + cells[7:]
                    norm = {'year': c[0], 'no': c[1], 'company': c[2], 'location': c[3], 'source': c[4],
                            'capacity': c[5], 'date': c[6], 'const': c[7], 'prep': c[8], 'note': c[9]}
                else:
                    continue
                if is_new:
                    flush()
                    cur = {'page': pn + 1, 'layout': n, **norm}
                elif cur is not None:
                    for k, v in norm.items():
                        if k in ('year',) or not v:
                            continue
                        cur[k] = (cur[k] + '\n' + v).strip() if cur.get(k) else v
        if pn % 100 == 0:
            sys.stderr.write(f'page {pn + 1}, rows {len(rows)}\n')
flush()
with open(out, 'w', encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')
print('rows', len(rows))
