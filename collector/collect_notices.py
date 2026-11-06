"""Collect revocation/hearing notices and meeting results (with attachments) from the KOREC site."""
import json, os, re, subprocess, sys, time, zipfile, html, datetime as dt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch

RAW = 'raw/files'
os.makedirs(RAW, exist_ok=True)
SINCE = sys.argv[1] if len(sys.argv) > 1 else '2023-01-01'


def day(ms):
    return dt.datetime.fromtimestamp(ms / 1000, dt.timezone(dt.timedelta(hours=9))).strftime('%Y-%m-%d')


def detail(no, se):
    for i in range(4):
        r = subprocess.run(['curl', '-sS', '--max-time', '60', '-b', 'ck.txt', '-X', 'POST', '-d', f'bbsSntncNo={no}&bbsSe={se}',
                            fetch.BASE + '/notice/moveNoticeDetail.do'], capture_output=True)
        if r.returncode == 0 and r.stdout.strip().startswith(b'{'):
            return json.loads(r.stdout)
        time.sleep(4 * (i + 1))
    raise RuntimeError(f'detail {no}')


def hwpx_tables(path):
    tables = []
    with zipfile.ZipFile(path) as z:
        for n in sorted(x for x in z.namelist() if re.match(r'Contents/section\d+\.xml', x)):
            s = z.read(n).decode('utf-8')
            for tb in re.findall(r'<hp:tbl\b.*?</hp:tbl>', s, re.S):
                rows = []
                for tr in re.findall(r'<hp:tr\b.*?</hp:tr>', tb, re.S):
                    rows.append([html.unescape(' '.join(re.findall(r'<hp:t>([^<]*)</hp:t>', tc))).strip()
                                 for tc in re.findall(r'<hp:tc\b.*?</hp:tc>', tr, re.S)])
                tables.append(rows)
    return tables


def pdf_tables(path):
    import pdfplumber
    out = []
    with pdfplumber.open(path) as pdf:
        for p in pdf.pages:
            for t in p.extract_tables():
                out.append([[(c or '').replace('\n', ' ').strip() for c in r] for r in t])
    return out


def pdf_text(path):
    return subprocess.run(['pdftotext', '-layout', path, '-'], capture_output=True).stdout.decode('utf-8', 'replace')


def get_file(f):
    name = f['atchFileNm']
    local = os.path.join(RAW, re.sub(r'[\\/:*?"<>|]', '_', name))
    if not os.path.exists(local) or os.path.getsize(local) == 0:
        fetch.download(f['flpth'], name, local)
        time.sleep(2)
    return local


def rows_from_tables(tables):
    """Keep rows of tables whose header names a permit number (허가번호)."""
    out = []
    for t in tables:
        hi = next((i for i, r in enumerate(t) if any('허가번호' in c for c in r)), None)
        if hi is None:
            continue
        head = [re.sub(r'\s+', '', c) for c in t[hi]]
        for r in t[hi + 1:]:
            if len(r) != len(head) or not any(r):
                continue
            out.append(dict(zip(head, r)))
    return out


notices = json.load(open('raw/notice_all.json', encoding='utf-8'))
results = json.load(open('raw/result_all.json', encoding='utf-8'))
PREV = json.load(open('raw/notices_collected.json', encoding='utf-8')) if os.path.exists('raw/notices_collected.json') else {}
log = {'revocation_posts': list(PREV.get('revocation_posts', [])), 'result_posts': list(PREV.get('result_posts', [])),
       'minutes_posts': [], 'skipped_files': list(PREV.get('skipped_files', []))}
seen = {p['no'] for p in log['revocation_posts']} | {p['no'] for p in log['result_posts']}
new_posts = []

# --- revocation / hearing notices ---
for p in sorted(notices, key=lambda r: r['writngDe']):
    title = p['bbsSj']
    if day(p['writngDe']) < SINCE or not re.search(r'취소|청문', title) or p['bbsSntncNo'] in seen:
        continue
    new_posts.append(title)
    d = detail(p['bbsSntncNo'], p['bbsSe'])
    kind = 'hearing' if '청문' in title else 'revoked'
    post = {'no': p['bbsSntncNo'], 'date': day(p['writngDe']), 'title': title, 'kind': kind, 'files': [], 'rows': [],
            'body': re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', d['noticeVO'].get('bbsCn') or ''))).strip()}
    for f in d.get('noticeFiles') or []:
        post['files'].append(f['atchFileNm'])
        if f['atchFileNm'].lower().endswith('.hwp'):
            log['skipped_files'].append(f['atchFileNm'])  # old binary HWP: not readable here
            continue
        try:
            local = get_file(f)
        except RuntimeError:
            log['skipped_files'].append(f['atchFileNm'])
            continue
        ext = local.lower().rsplit('.', 1)[-1]
        try:
            tables = hwpx_tables(local) if ext == 'hwpx' else pdf_tables(local) if ext == 'pdf' else None
        except Exception as e:  # noqa
            tables = None
        if tables is None:
            log['skipped_files'].append(f['atchFileNm'])
            continue
        post['rows'] += rows_from_tables(tables)
    log['revocation_posts'].append(post)
    sys.stderr.write(f"{post['date']} {title[:40]} rows={len(post['rows'])}\n")
    time.sleep(2)

# --- meeting results (PDF text kept whole) ---
for p in sorted(results, key=lambda r: r['writngDe']):
    if day(p['writngDe']) < SINCE or p['bbsSntncNo'] in seen:
        continue
    new_posts.append(p['bbsSj'])
    d = detail(p['bbsSntncNo'], p['bbsSe'])
    post = {'no': p['bbsSntncNo'], 'date': day(p['writngDe']), 'title': p['bbsSj'], 'files': [], 'text': ''}
    for f in d.get('noticeFiles') or []:
        post['files'].append(f['atchFileNm'])
        if not f['atchFileNm'].lower().endswith('.pdf'):
            log['skipped_files'].append(f['atchFileNm'])
            continue
        try:
            local = get_file(f)
        except RuntimeError:
            log['skipped_files'].append(f['atchFileNm'])
            continue
        if local.lower().endswith('.pdf'):
            post['text'] += pdf_text(local)
        else:
            log['skipped_files'].append(f['atchFileNm'])
    log['result_posts'].append(post)
    sys.stderr.write(f"{post['date']} {p['bbsSj'][:40]} chars={len(post['text'])}\n")
    time.sleep(2)

# --- minutes: list only (titles, dates, file names) ---
for p in notices:
    if '회의록' in p['bbsSj']:
        log['minutes_posts'].append({'no': p['bbsSntncNo'], 'date': day(p['writngDe']), 'title': p['bbsSj'], 'file': p.get('atchFileNm')})

log['new_posts'] = new_posts
json.dump(log, open('raw/notices_collected.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('revocation posts', len(log['revocation_posts']), 'rows', sum(len(p['rows']) for p in log['revocation_posts']),
      'results', len(log['result_posts']), 'minutes', len(log['minutes_posts']), 'skipped', log['skipped_files'])
