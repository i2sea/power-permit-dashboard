"""Build revocation/hearing rows, meeting agendas and minutes lists from collected KOREC posts."""
import json, os, re, subprocess, zipfile, html, collections

C = json.load(open('raw/notices_collected.json', encoding='utf-8'))
PROJ = {p['permit_no']: p for p in json.load(open('out/projects.json', encoding='utf-8')) if p.get('source') == '해상풍력'}
LEDGER = {}
for l in open('raw/ledger_rows.jsonl', encoding='utf-8'):
    r = json.loads(l)
    n = re.sub(r'\s', '', str(r['no']))
    k = n if re.match(r'^\d{4}-\d+$', n) else f"{re.sub(chr(92) + 's', '', str(r['year']))}-{n}"
    LEDGER[k] = r  # last row wins (most recent state)


def local(name):
    return os.path.join('raw/files', re.sub(r'[\\/:*?"<>|]', '_', name))


def text_of(name):
    p = local(name)
    if not os.path.exists(p):
        return ''
    if p.lower().endswith('.hwpx'):
        with zipfile.ZipFile(p) as z:
            parts = []
            for n in sorted(x for x in z.namelist() if re.match(r'Contents/section\d+\.xml', x)):
                s = z.read(n).decode('utf-8')
                s = re.sub(r'</hp:p>', '\n', s)
                parts.append(re.sub(r'<[^>]+>', ' ', s))
            return html.unescape(re.sub(r'[ \t]+', ' ', '\n'.join(parts)))
    if p.lower().endswith('.pdf'):
        return subprocess.run(['pdftotext', '-layout', p, '-'], capture_output=True).stdout.decode('utf-8', 'replace')
    return ''


def clean(s):
    return re.sub(r'\s+', '', s or '')


def group(src):
    s = clean(src)
    if '풍' in s:
        return '풍력'
    if '연료전지' in s:
        return '연료전지'
    if '태양' in s:
        return '태양광'
    return '기타'


PERMIT = re.compile(r'^\s*제?\s*(20[012]\d|19\d\d)\s*-\s*(\d{1,3})\s*호?\s*$')
PERMIT_IN = re.compile(r'(20[012]\d)\s*-\s*(\d{1,3})(?!\d)')


def tables_of(name):
    p = local(name)
    if not os.path.exists(p) and name.lower().endswith('.hwp'):
        import sys as _s; _s.path.insert(0, os.path.dirname(os.path.abspath(__file__))); import fetch
        try:
            fetch.download('/notice', name, p)
        except Exception:
            return []
    if not os.path.exists(p):
        return []
    try:
        if p.lower().endswith('.hwp'):
            outdir = p + '.html'
            if not os.path.exists(os.path.join(outdir, 'index.xhtml')):
                subprocess.run(['hwp5html', '--output', outdir, p], capture_output=True, timeout=300)
            sx = open(os.path.join(outdir, 'index.xhtml'), encoding='utf-8').read()
            return [[[html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', td))).strip() for td in re.findall(r'<td\b.*?</td>', tr, re.S)]
                     for tr in re.findall(r'<tr\b.*?</tr>', tb, re.S)] for tb in re.findall(r'<table\b.*?</table>', sx, re.S)]
        if p.lower().endswith('.hwpx'):
            out = []
            with zipfile.ZipFile(p) as z:
                for n in sorted(x for x in z.namelist() if re.match(r'Contents/section\d+\.xml', x)):
                    sx = z.read(n).decode('utf-8')
                    for tb in re.findall(r'<hp:tbl\b.*?</hp:tbl>', sx, re.S):
                        # nested tables: keep only the innermost text per cell
                        rows = []
                        for tr in re.findall(r'<hp:tr\b.*?</hp:tr>', tb, re.S):
                            rows.append([html.unescape(re.sub(r'\s+', ' ', ' '.join(re.findall(r'<hp:t>([^<]*)</hp:t>', tc)))).strip()
                                         for tc in re.findall(r'<hp:tc\b.*?</hp:tc>', tr, re.S)])
                        out.append(rows)
            return out
        if p.lower().endswith('.pdf'):
            import pdfplumber
            with pdfplumber.open(p) as pdf:
                return [[[re.sub(r'\s+', ' ', c or '').strip() for c in r] for r in t] for pg in pdf.pages for t in pg.extract_tables()]
    except Exception:
        return []
    return []


def kind_of(name):
    n = clean(name)
    if '풍력' in n:
        return '풍력'
    if '연료전지' in n:
        return '연료전지'
    if '태양' in n:
        return '태양광'
    if '바이오' in n:
        return '바이오매스'
    return '기타'


def from_row(cells):
    """A table row that holds one permit: pick the permit number, name, company, place and capacity by their look."""
    k = next((f'{m.group(1)}-{int(m.group(2))}' for c in cells for m in [PERMIT.match(c)] if m), None)
    if not k:
        return None
    rest = [c for c in cells if c and not PERMIT.match(c)]
    name = next((c for c in rest if re.search(r'발전\s*사업$|발전사업\s*$|풍력|연료전지|태양광|바이오', c) and len(c) < 40), '')
    loc = next((c for c in rest if re.search(r'(시|군|구|도|읍|면|리|동)\s', c + ' ') and re.search(r'\d|산|일원|일대', c) and c != name), '')
    cap = next((c for c in rest if re.fullmatch(r'\d+(?:\.\d+)?\s*(MW)?', c)), '')
    comp = next((c for c in rest if c not in (name, loc, cap) and not re.search(r'상동|조|호|일시|장소|^\d{4}\.', c) and len(c) < 30
                 and re.search(r'㈜|\(주\)|주식회사|[가-힣A-Za-z]', c)), '')
    return {'permit_no': k, 'project_name': name, 'company': comp, 'location': loc, 'capacity_mw': float(re.sub(r'[^\d.]', '', cap)) if cap else 0.0}


def from_kv(rows):
    d = {}
    for r in rows:
        cells = [c for c in r if c]
        for i in range(0, len(cells) - 1, 2):
            d[clean(cells[i])] = cells[i + 1]
    k = next((d[x] for x in d if re.search(r'허가(증)?번호', x)), '')
    m = PERMIT_IN.search(k or '')
    if not m:
        return None
    capm = re.search(r'([\d.]+)\s*MW', next((d[x] for x in d if '용량' in x), '') or '')
    return {'permit_no': f'{m.group(1)}-{int(m.group(2))}', 'project_name': next((d[x] for x in d if x in ('사업의내용', '발전사업명', '사업명')), ''),
            'company': next((d[x] for x in d if x in ('상호', '발전사업자', '사업자')), ''), 'location': next((d[x] for x in d if x in ('사업장소', '지역', '발전소위치')), ''),
            'capacity_mw': float(capm.group(1)) if capm else 0.0}


rev = []
for post in C['revocation_posts']:
    kind = 'hearing' if '청문' in post['title'] else 'revoked'
    alltext = re.sub(r'\s+', ' ', post.get('body', '') + ' ' + ' '.join(text_of(f) for f in post['files']))
    m = re.search(r'(20\d{2}년\s*\d{1,2}월\s*\d{1,2}일\s*\([월화수목금토일]\)\s*\d{1,2}:\d{2})', alltext)
    hearing_when = m.group(1) if (kind == 'hearing' and m) else ''
    got = {}
    for f in post['files']:
        for t in tables_of(f):
            kv = from_kv(t) if t and max(len(r) for r in t) <= 4 else None
            if kv:
                got.setdefault(kv['permit_no'], kv)
                continue
            # vertical party tables: a header row followed by a value row
            for r in t:
                x = from_row(r)
                if x:
                    old = got.get(x['permit_no'])
                    if not old or sum(bool(v) for v in x.values()) > sum(bool(v) for v in old.values()):
                        got[x['permit_no']] = x
    for k, x in got.items():
        L = LEDGER.get(k)
        nm = x['project_name'] or (PROJ[k]['project_name'] if k in PROJ else '')
        kd = kind_of(nm) if nm else kind_of(L['source'] if L else '')
        if kd == '풍력':
            off = k in PROJ or '해상' in clean(nm)
            src = '해상풍력' if off else '육상풍력'
        else:
            src = kd
        cap = x['capacity_mw'] or (float(re.sub(r'[^\d.]', '', L['capacity'].split()[0]) or 0) if L and re.search(r'\d', L['capacity']) else 0.0)
        rev.append({
            'id': f"{post['no']}-{k}", 'notice_no': post['no'], 'notice_date': post['date'], 'notice_title': post['title'],
            'stage_code': kind, 'stage': '청문실시공고 (사전통지)' if kind == 'hearing' else '최종 허가취소 처분',
            'permit_no': k, 'project_name': nm, 'company': x['company'] or (clean(L['company']) if L else ''),
            'location': x['location'] or (re.sub(r'\s+', ' ', L['location']).strip()[:80] if L else ''),
            'region': PROJ[k]['region'] if k in PROJ and src == '해상풍력' else '', 'source': src, 'capacity_mw': round(cap, 2),
            'reason': '사업준비기간 만료' if re.search(r'제2호', alltext) and not re.search(r'4의2', alltext) else '공사계획인가기간 미충족',
            'hearing': hearing_when, 'permit_date': '', 'prev_deadline': '',
        })

# surrendered (반납) permits come from the ledger itself
have = {r['permit_no'] for r in rev}
for k, p in PROJ.items():
    if p['stage'] == '허가취소 확정' and k not in have:
        rev.append({'id': f'ledger-{k}', 'notice_no': '허가대장', 'notice_date': p['latest_change_date'], 'notice_title': '발전사업 허가대장 - 허가취소',
                    'stage_code': 'revoked', 'stage': '최종 허가취소 처분', 'permit_no': k, 'project_name': p['project_name'],
                    'company': p['operator'], 'location': p['location'][:80], 'region': p['region'], 'source': '해상풍력',
                    'capacity_mw': p['capacity_mw'], 'reason': '허가대장 기재(처분 공고는 이전 게시물)', 'hearing': '', 'permit_date': p['permit_date'],
                    'prev_deadline': p['prep_deadline']})
    if p['stage'] == '허가반납/종결':
        rev.append({'id': f'ledger-{k}', 'notice_no': '허가대장', 'notice_date': p['latest_change_date'], 'notice_title': '발전사업 허가대장 - 허가반납',
                    'stage_code': 'surrendered', 'stage': '허가반납 (종결)', 'permit_no': k, 'project_name': p['project_name'],
                    'company': p['operator'], 'location': p['location'][:80], 'region': p['region'], 'source': '해상풍력',
                    'capacity_mw': p['capacity_mw'], 'reason': '사업자 자진 허가반납', 'hearing': '', 'permit_date': p['permit_date'],
                    'prev_deadline': p['prep_deadline']})

# region for non-offshore rows from the ledger location
METRO = ['전남', '전북', '경남', '경북', '충남', '충북', '울산', '인천', '부산', '제주', '강원', '경기', '서울', '대구', '대전', '광주', '세종']
LONG = {'전라남도': '전남', '전라북도': '전북', '경상남도': '경남', '경상북도': '경북', '충청남도': '충남', '충청북도': '충북', '강원도': '강원', '강원특별자치도': '강원', '전북특별자치도': '전북', '경기도': '경기'}
for r in rev:
    if not r['region']:
        loc = clean(r['location'])
        for l, s in LONG.items():
            if loc.startswith(l):
                r['region'] = s
        if not r['region']:
            r['region'] = next((m for m in METRO if loc.startswith(m)), '기타')

json.dump(rev, open('out/revocations.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('revocation rows', len(rev), collections.Counter((r['source'], r['stage_code']) for r in rev))

# --- meeting results: agenda lines from each result PDF ---
ag = []
for post in C['result_posts']:
    t = post['text']
    sess = re.search(r'제\s*(\d{3})\s*차', post['title'])
    session = f'제{sess.group(1)}차' if sess else post['title']
    cur = ''
    for line in t.splitlines():
        s = line.strip()
        h = re.match(r'^[□■▣◇◆]?\s*([가-힣·\s]{2,14})\s*\(\s*\d+\s*건\s*\)\s*$', s)
        if h:
            cur = re.sub(r'\s+', '', h.group(1))
            continue
        m = re.match(r'^(\d{1,2})\.\s*(.+)$', s)
        if m and cur:
            title = m.group(2).strip()
            ag.append({'id': f"{session}-{len(ag)}", 'session': session, 'date': post['date'], 'type': '보고안건' if '보고' in cur else '심의안건',
                       'no': m.group(1), 'title': title, 'result': cur, 'summary': '',
                       'offshore': '해상' if '해상' in title else '', 'wind': '풍력' if '풍력' in title else ''})
        elif ag and cur and s and not re.match(r'^[□■○ㅇ\-–]', s) and ag[-1]['session'] == session and len(s) < 80 and not ag[-1]['summary']:
            # wrapped second line of the same agenda title
            if not re.search(r'차기|일정|장소|끝\.', s):
                ag[-1]['title'] += ' ' + s
json.dump(ag, open('out/agendas_all.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('agenda rows', len(ag), collections.Counter(a['result'] for a in ag).most_common(12))

# --- next meeting and minutes ---
nxt = ''
for post in sorted(C['result_posts'], key=lambda p: p['date'])[-1:]:
    m = re.search(r'차기\s*\(?\s*제?\s*(\d{3})\s*차\s*\)?.*?일\s*정\s*[:：]\s*[`\'‘]?\s*(\d{2})\.\s*(\d{1,2})\.\s*(\d{1,2})\.?\s*\(([월화수목금토일])\)', re.sub(r'\s+', ' ', post['text']))
    if m:
        nxt = f'제{m.group(1)}차 20{m.group(2)}-{int(m.group(3)):02d}-{int(m.group(4)):02d}({m.group(5)}) — 제{re.search(chr(92) + "d{3}", post["title"]).group(0)}차 개최결과 공지'
mins = sorted(C['minutes_posts'], key=lambda p: p['date'], reverse=True)
json.dump({'next_meeting': nxt, 'latest_result': (sorted(C['result_posts'], key=lambda p: p['date'])[-1]['title'] + ' (' + sorted(C['result_posts'], key=lambda p: p['date'])[-1]['date'] + ')') if C['result_posts'] else '',
           'latest_minutes': (mins[0]['title'] + ' (' + mins[0]['date'] + ')') if mins else ''},
          open('out/meeting_info.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('next', nxt, '| latest minutes', mins[0]['title'] if mins else '')
