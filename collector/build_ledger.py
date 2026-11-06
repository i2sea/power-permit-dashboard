"""Turn extracted ledger rows into the dashboard's offshore-wind project table and per-source counts."""
import json, os, re, sys, collections, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

ROWS = [json.loads(l) for l in open('raw/ledger_rows.jsonl', encoding='utf-8')]
REF_DATE = sys.argv[1] if len(sys.argv) > 1 else dt.date.today().isoformat()
OPERATING = {'2015-151', '2015-31', '2020-46'}
# 착공 여부는 허가대장에 적히지 않음: 공사계획인가·착공이 확인된 허가(참고 사이트 정리, 2026-11 기준)는 따로 표시
STARTED = {'2021-15', '2022-104', '2019-33', '2020-56', '2021-108', '2018-81', '2020-55', '2022-106', '2018-18'}  # KOREC-permitted farms in commercial operation (Jeju ones are not in this ledger)


def clean(s):
    return re.sub(r'\s+', '', s or '')


def key(r):
    n = clean(str(r['no']))
    m = re.match(r'^(\d{4})-(\d+)', n)
    if m:
        return f'{m.group(1)}-{int(m.group(2))}'
    n = re.sub(r'[^\d]', '', n.split('(')[0]) or n
    return f"{clean(str(r['year']))}-{int(n) if n.isdigit() else n}"


def date(s):
    s = clean(s).replace('`', "'").replace('‘', "'").replace('’', "'")
    m = re.search(r'(20\d{2}|19\d{2})[-.](\d{1,2})[-.](\d{1,2})', s)
    if m:
        return f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}'
    m = re.search(r"'(\d{2})\.(\d{1,2})\.?(\d{1,2})?", s)
    if m:
        return f'20{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3) or 1):02d}'
    m = re.search(r'(20\d{2})\.(\d{1,2})\.(\d{1,2})', s)
    return f'{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}' if m else ''


def mw(s):
    """Capacity in MW. The ledger mixes MW (usually no unit), kW, 만kW, "a→b" changes and "13,900×2 2,500×1기" lists."""
    raw = s or ''
    s = clean(raw).replace(',', '')
    s = s.split('→')[-1]
    m = re.search(r'(\d+(?:\.\d+)?)만(?:(\d+)천)?kw', s, re.I)
    if m:
        return round(float(m.group(1)) * 10 + float(m.group(2) or 0), 3)
    parts = re.findall(r'(\d+(?:\.\d+)?)\s*×\s*(\d+)', raw.split('→')[-1].replace(',', ''))
    if parts and re.match(r'^\d+(?:\.\d+)?×', s):
        v = sum(float(a) * int(b) for a, b in parts)
    else:
        m = re.search(r'(\d+(?:\.\d+)?)', s)
        if not m:
            return 0.0
        v = float(m.group(1))
        if v > 6000 and not re.search(r'kw', s, re.I):  # "822\n19.2": the next line is another figure, not more digits
            first = re.search(r'(\d+(?:\.\d+)?)', raw.split('→')[-1].strip().split('\n')[0].replace(',', ''))
            v = float(first.group(1)) if first else v
    if (re.search(r'kw', s, re.I) and not re.search(r'mw', s, re.I)) or v > 6000:  # no plant here is over 6 GW: such a number is kW
        v /= 1000
    return round(v, 3)


METRO = [('전라남도|전남', '전남'), ('전라북도|전북', '전북'), ('경상남도|경남', '경남'), ('경상북도|경북', '경북'), ('충청남도|충남', '충남'),
         ('충청북도|충북', '충북'), ('울산', '울산'), ('인천', '인천'), ('부산', '부산'), ('제주', '제주'), ('강원', '강원'), ('경기', '경기'),
         ('서울', '서울'), ('대구', '대구'), ('대전', '대전'), ('광주', '광주'), ('세종', '세종')]


def region(loc):
    t = clean(loc)
    for pat, name in METRO:
        if re.match(r'^(' + pat + ')', t):
            m = re.match(r'^(?:' + pat + r')(?:광역시|특별시|특별자치도|특별자치시|도|시)?(?:광주통합특별시)?([가-힣]{1,4}?(?:군|시|구))', t)
            return name, (m.group(1) if m else '')
    return '기타', ''


def source_group(src):
    s = clean(src)
    if '풍' in s:
        return '풍력'
    if '태양' in s:
        return '태양광'
    if '연료전지' in s:
        return '연료전지'
    if re.search(r'LNG|복합|가스|열병합|집단', s, re.I):
        return 'LNG/집단에너지'
    if re.search(r'석탄|원자력|기력|유연탄|중유', s):
        return '기력/원자력'
    return '기타(ESS·수력·바이오 등)'


def offshore(rs):
    txt = ' '.join(clean(r['source']) + clean(r['location']) + clean(r['company']) for r in rs)
    if not any('풍' in clean(r['source']) for r in rs):
        return False
    if any('육상' in clean(r['source']) for r in rs):
        return False
    return bool(re.search(r'해상|공유수면|앞바다|해역|방조제', txt))


from prep_coords import coords  # noqa: E402  (DMS / decimal parser shared with the first build)

groups = collections.OrderedDict()
for r in ROWS:
    groups.setdefault(key(r), []).append(r)
# one number sometimes holds rows of different sites (re-used numbers, or change rows printed without a number):
# split by the start of the location text
split = collections.OrderedDict()
for k, rs in groups.items():
    sub = collections.OrderedDict()
    for r in rs:
        sub.setdefault(clean(r['location'])[:9], []).append(r)
    caps = [mw(v[0]['capacity']) for v in sub.values()]
    notes_txt = ' '.join(clean(r['note']) for r in rs)
    numbered = not re.search(r'-(0)?$', k)
    firms = {clean(v[0]['company'])[:4] for v in sub.values()}
    differs = max(caps) > 1.5 * max(min(caps), 0.001) and (len(firms) > 1 or not re.search(r'용량|장소|위치|부지|소재지', notes_txt))
    if len(sub) == 1 or (numbered and not differs):
        split[k] = rs
    else:
        for i, (_, srs) in enumerate(sorted(sub.items(), key=lambda kv: kv[1][0]['page'])):
            split[k if i == 0 else f'{k}#{i}'] = srs
groups = split

# per-source counts of distinct permits (whole ledger)
src_counts = collections.Counter()
for k, rs in groups.items():
    g = source_group(rs[-1]['source'])
    if g == '풍력':
        g = '해상풍력' if offshore(rs) else '육상풍력'
    src_counts[g] += 1

def src_of(rs):
    g = source_group(rs[-1]['source'])
    return ('해상풍력' if offshore(rs) else '육상풍력') if g == '풍력' else g


# every permit in the ledger; the re-numbering merge below stays offshore-only
proj = {}
others = {}
for k, rs in groups.items():
    if 'ㅇ' in k:
        continue  # a heading line of the PDF, not a permit
    is_off = offshore(rs)
    # rows without a date (허가반납 notes) go last, so the first row is the original permit
    rs = sorted(rs, key=lambda r: (date(r['date']) or '9999', r['page']))
    first, last = rs[0], rs[-1]
    notes = [(date(r['date']), re.sub(r'\s+', ' ', r['note']).strip()) for r in rs]
    alltxt = ' '.join(n for _, n in notes)
    loc = re.sub(r'\s+', ' ', ' '.join(r['location'] for r in rs[-1:])).strip()
    pts = coords({'location_coords': ' '.join(r['location'] for r in rs[::-1])}) if is_off else []
    reg, local = region(first['location'])
    const = max((date(r['const']) for r in rs if date(r['const'])), default='')
    prep = max((date(r['prep']) for r in rs if date(r['prep'])), default='')
    if '반납' in alltxt:
        stage = '허가반납/종결'
    elif '허가취소' in alltxt and '철회' not in notes[-1][1]:
        stage = '허가취소 확정'
    elif k in OPERATING:
        stage = '준공/상업운전'
    elif k in STARTED:
        stage = '착공/공사계획인가'
    elif re.search(r'공사계획\s*인가(?!\s*기간)', alltxt):
        stage = '착공/공사계획인가'
    else:
        stage = '공사계획인가 진행'
    (proj if is_off else others)[k] = {
        'source': src_of(rs), 'permit_no': k, 'prev_permit_no': '',
        'project_name': f"{clean(last['company'])} ({re.sub(r'[(（].*$', '', clean(first['location']))[:24]})",
        'operator': clean(last['company']), 'initial_operator': clean(first['company']),
        'region': reg, 'region_local': local, 'location': loc[:160],
        'capacity_mw': mw(last['capacity']), 'initial_capacity_mw': mw(first['capacity']),
        'permit_date': date(first['date']), 'permit_year': int(k[:4]) if k[:4].isdigit() else 0,
        'latest_change_date': max((date(r['date']) for r in rs if date(r['date'])), default=''),
        'const_deadline': const, 'prep_deadline': prep, 'stage': stage,
        'tags': sorted({t for t in ('양수인가', '주식취득', '사업장소', '용량', '연장', '반납', '취소') if t in alltxt}),
        'notes': notes, 'pts': pts, 'first_loc': clean(first['location']), 'last_date': max((date(r['date']) for r in rs if date(r['date'])), default=''),
    }

# re-numbered permits (양수 등으로 새 번호를 받거나, 번호 없이 적힌 변경 행): same site text, the old one ends before the new starts
def real(k):
    return '#' not in k and not re.search(r'-(0)?$', k)


changed = True
while changed:
    changed = False
    ks = sorted(proj, key=lambda k: proj[k]['permit_date'] or '9999')
    for a in ks:
        for b in ks:
            if a == b or a not in proj or b not in proj:
                continue
            A, B = proj[a], proj[b]
            same = A['first_loc'][:18] == B['first_loc'][:18] and len(A['first_loc']) >= 12
            if not same:
                continue
            if real(a) and real(b):
                b_first = next((n for _, n in sorted(B['notes'], key=lambda x: x[0] or '')), '')
                handover = bool(re.search(r'양수|합병|분할|승계', b_first)) or (A['prep_deadline'] and A['prep_deadline'] < B['permit_date'])
                if not (A['last_date'] < B['permit_date'] and handover):
                    continue  # two live permits at one site (phases): keep both
            keep, drop = (b, a) if (real(b) and (not real(a) or B['permit_date'] >= A['permit_date'])) else (a, b)
            K, D = proj[keep], proj[drop]
            if real(drop):
                K['prev_permit_no'] = ', '.join(x for x in (K['prev_permit_no'], drop) if x)
            if (D['permit_date'] or '9') < (K['permit_date'] or '9'):
                K['permit_date'], K['initial_operator'], K['initial_capacity_mw'] = D['permit_date'], D['initial_operator'], D['initial_capacity_mw']
            K['notes'] = sorted(D['notes'] + K['notes'], key=lambda x: x[0] or '')
            K['pts'] = K['pts'] or D['pts']
            for f in ('const_deadline', 'prep_deadline'):
                K[f] = max(K[f], D[f]) if not real(drop) else K[f]
            if D['last_date'] > K['last_date'] and not real(drop):
                K['operator'], K['last_date'] = D['operator'], D['last_date']
            for t in ('반납', '취소'):
                if t in ' '.join(n for _, n in D['notes']) and not real(drop):
                    K['stage'] = '허가반납/종결' if t == '반납' else '허가취소 확정'
            del proj[drop]
            changed = True

ref_d = dt.date.fromisoformat(REF_DATE)
for k, p in proj.items():
    last = max((d for d, _ in p['notes'] if d), default='')
    if p['stage'] == '공사계획인가 진행' and p['prep_deadline'] and (ref_d - dt.date.fromisoformat(p['prep_deadline'])).days > 365 \
            and last < p['prep_deadline']:
        p['stage'] = '기한 만료(허가대장 미갱신)'
    if not p['prep_deadline'] and p['stage'] == '공사계획인가 진행' and last and last < '2016-01-01':
        p['stage'] = '기한 만료(허가대장 미갱신)'

# outside offshore wind the ledger does not say whether a plant was built: an old deadline means "not confirmed", not "expired"
for k, p in others.items():
    last = max((d for d, _ in p['notes'] if d), default='')
    if p['stage'] in ('공사계획인가 진행', '착공/공사계획인가') and re.search(r'사업개시|상업운전\s*중', ' '.join(n for _, n in p['notes'])):
        p['stage'] = '준공/상업운전'
    if p['stage'] in ('공사계획인가 진행', '착공/공사계획인가'):
        old = (p['prep_deadline'] and p['prep_deadline'] < REF_DATE) or (not p['prep_deadline'] and last < '2016-01-01')
        if old:
            p['stage'] = '준비기간 경과(준공 여부 미확인)'
proj.update(others)

out = []
for k, p in proj.items():
    pts = p.pop('pts')
    notes = p.pop('notes')
    p.pop('first_loc'); p.pop('last_date')
    p['latest_change_date'] = max((d for d, _ in notes if d), default=p['latest_change_date'])
    lon = round(sum(x for x, _ in pts) / len(pts), 4) if pts else None
    lat = round(sum(y for _, y in pts) / len(pts), 4) if pts else None
    if lon is not None and not (124 <= lon <= 131.5 and 33 <= lat <= 38.8):
        lon = lat = None
        pts = []
    p['operator_changed'] = '예' if (p['operator'] != p['initial_operator'] or {'양수인가', '주식취득'} & set(p['tags'])) else '아니오'
    p['change_tags'] = ', '.join(p.pop('tags'))
    p['change_count'] = max(0, len(notes) - 1)
    p['lon'], p['lat'] = lon, lat
    p['polygon'] = json.dumps(pts, separators=(',', ':')) if len(pts) >= 3 else ''
    p['history'] = ' / '.join(f'{d}: {n}' if d else n for d, n in notes if n)
    p['timeline'] = json.dumps([{'step': '최초허가' if i == 0 else '변경허가', 'date': d, 'remarks': n or ('최초 허가' if i == 0 else '')}
                                for i, (d, n) in enumerate(notes)], ensure_ascii=False, separators=(',', ':'))
    p['auction'] = ''
    out.append(p)
out.sort(key=lambda p: (p['permit_year'], p['permit_no']), reverse=True)
json.dump(out, open('out/projects.json', 'w', encoding='utf-8'), ensure_ascii=False)
src_counts = collections.Counter(p['source'] for p in out)  # after the offshore merge, so it matches the page's counts
json.dump([{'source': s, 'count': c} for s, c in src_counts.most_common()], open('out/ledger_sources.json', 'w', encoding='utf-8'), ensure_ascii=False)
print('ledger permits', len(groups), 'all', len(out), collections.Counter((p['source'], p['stage']) for p in out))
print('sources', dict(src_counts))
print('no coords (offshore)', [p['permit_no'] for p in out if p['lon'] is None and p['source'] == '해상풍력'])
