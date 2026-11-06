"""One refresh of the offshore-wind permit dashboard data, straight from the KOREC site (www.korec.go.kr).

Run from the collector folder:  python3 -I refresh.py
Writes out/*.json (the dashboard's data files) and out/changes.json (what is new since the last run).
"""
import json, os, re, subprocess, sys, time, datetime as dt
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, HERE)
import fetch

KST = dt.timezone(dt.timedelta(hours=9))
now = dt.datetime.now(KST)
today = now.date().isoformat()
os.makedirs('raw', exist_ok=True)
os.makedirs('out', exist_ok=True)
state = json.load(open('state.json')) if os.path.exists('state.json') else {}
prev_out = {f: json.load(open(f'out/{f}.json', encoding='utf-8')) for f in ('projects', 'revocations') if os.path.exists(f'out/{f}.json')}


def run(*args):
    r = subprocess.run([sys.executable, '-I', *args], capture_output=True, text=True)
    sys.stderr.write(r.stderr[-2000:])
    if r.returncode:
        raise SystemExit(f'step failed: {args}')
    return r.stdout


# 1. board lists
run('fetch.py', 'boards')
notices = json.load(open('raw/notice_all.json', encoding='utf-8'))
ledger_post = next(p for p in notices if '허가대장' in p['bbsSj'])
ledger_name = ledger_post['atchFileNm']
ledger_date = dt.datetime.fromtimestamp(ledger_post['writngDe'] / 1000, KST).date().isoformat()

# 2. permit ledger (only when a new file is posted)
ledger_new = ledger_name != state.get('ledger_file') or not os.path.exists('raw/ledger_rows.jsonl')
if ledger_new:
    fetch.download(ledger_post['flpth'], ledger_name, 'raw/ledger.pdf')
    run('ledger_extract.py', 'raw/ledger.pdf', 'raw/ledger_rows.jsonl')
    state['ledger_file'] = ledger_name

# 3. notices, meeting results (new posts only) and the organisation chart
print(run('collect_notices.py', '2023-01-01').strip())
for i in range(4):
    r = subprocess.run(['curl', '-sS', '--max-time', '60', '-b', 'ck.txt', fetch.BASE + '/intrcn/selectOrgcht.do', '-o', 'raw/orgcht.json'])
    if r.returncode == 0:
        break
    time.sleep(5 * (i + 1))

# 4. build the dashboard files
print(run('build_ledger.py', today).strip())
print(run('build_notices.py').strip())
print(run('build_committee.py').strip()[:200])

P = json.load(open('out/projects.json', encoding='utf-8'))
json.dump([{'permit_no': p['permit_no'], 'stage': p['stage'], 'name': p['project_name'], 'operator': p['operator'], 'region': f"{p['region']} {p['region_local']}".strip(),
            'capacity_mw': p['capacity_mw'], 'permit_date': p['permit_date'], 'const_deadline': p['const_deadline'], 'prep_deadline': p['prep_deadline'],
            'note': p['history'].split(' / ')[-1] if p['history'] else ''}
           for p in P if p['stage'] == '착공/공사계획인가' and p.get('source') == '해상풍력'], open('out/pipeline.json', 'w', encoding='utf-8'), ensure_ascii=False)

AG = json.load(open('out/agendas_all.json', encoding='utf-8'))
AG.sort(key=lambda a: (a['date'], a['session']), reverse=True)
json.dump(AG, open('out/agendas.json', 'w', encoding='utf-8'), ensure_ascii=False)
json.dump([{'id': a['id'], 'session': a['session'], 'date': a['date'], 'no': a['no'], 'title': a['title'], 'result': a['result'], 'detail': a['summary']}
           for a in AG if '취소' in a['title'] or '취소' in a['result']], open('out/rev_agendas.json', 'w', encoding='utf-8'), ensure_ascii=False)

info = json.load(open('out/meeting_info.json', encoding='utf-8'))
snap = [{'item': '데이터 수집 시각', 'value': now.strftime('%Y-%m-%d %H:%M')},
        {'item': '기준일', 'value': today},
        {'item': '허가대장 공개일', 'value': ledger_date},
        {'item': '허가대장 파일', 'value': re.sub(r'_w\d+', '', ledger_name)},
        {'item': '최근 개최결과', 'value': info.get('latest_result', '')},
        {'item': '다음 전기위원회', 'value': info.get('next_meeting', '') or '개최결과 공지에 없음'},
        {'item': '최근 회의록', 'value': info.get('latest_minutes', '')},
        {'item': '위원회 명단 수집 시각', 'value': now.strftime('%Y-%m-%d %H:%M')},
        {'item': '수집 경로', 'value': '전기위원회 누리집(www.korec.go.kr) 직접 수집 — 허가대장 PDF, 공지사항·위원회 개최결과 게시판, 조직도'}]
json.dump(snap, open('out/snapshot.json', 'w', encoding='utf-8'), ensure_ascii=False)

# 5. what changed since the last run
C = json.load(open('raw/notices_collected.json', encoding='utf-8'))
changes = {'run_at': now.isoformat(timespec='minutes'), 'ledger_new': ledger_new, 'ledger_file': ledger_name, 'new_posts': C.get('new_posts', [])}
if 'projects' in prev_out:
    old = {p['permit_no']: p for p in prev_out['projects']}
    new = {p['permit_no']: p for p in P}
    changes['new_permits'] = [f"{k} {new[k]['project_name']}" for k in new if k not in old]
    changes['changed_permits'] = [f"{k} {new[k]['project_name']}: {old[k]['stage']}→{new[k]['stage']}, 준비기간 {old[k]['prep_deadline']}→{new[k]['prep_deadline']}"
                                  for k in new if k in old and (old[k]['stage'], old[k]['prep_deadline'], old[k]['const_deadline']) !=
                                  (new[k]['stage'], new[k]['prep_deadline'], new[k]['const_deadline'])]
if 'revocations' in prev_out:
    oldr = {r['id'] for r in prev_out['revocations']}
    R = json.load(open('out/revocations.json', encoding='utf-8'))
    changes['new_revocation_rows'] = [f"{r['stage']} {r['permit_no']} {r['project_name']} ({r['source']})" for r in R if r['id'] not in oldr]
json.dump(changes, open('out/changes.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
json.dump(state, open('state.json', 'w'))
print(json.dumps(changes, ensure_ascii=False)[:1500])
