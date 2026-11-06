"""Quick check: has KOREC posted anything the dashboard does not have yet?

Usage: python3 -I check.py state_prev.json   (state from the dashboard's collector/state document; {} on first run)
Prints one JSON line: {"new": bool, "posts": [...], "ledger_new": bool, "state": {...}} and saves state_next.json.
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
sys.path.insert(0, HERE)
import fetch

prev = json.load(open(sys.argv[1])) if len(sys.argv) > 1 and os.path.exists(sys.argv[1]) else {}
os.makedirs('raw', exist_ok=True)
rows = {}
for name, se in (('notice', None), ('result', 2)):
    rs, _ = fetch.board(se)
    rows[name] = list({r['bbsSntncNo']: r for r in rs}.values())
relevant = [r for r in rows['notice'] if re.search(r'취소|청문|회의록|허가대장', r['bbsSj'])] + rows['result']
seen = set(prev.get('seen', []))
new = [f"{r['bbsSntncNo']} {r['bbsSj']}" for r in relevant if r['bbsSntncNo'] not in seen]
ledger = next((r['atchFileNm'] for r in rows['notice'] if '허가대장' in r['bbsSj']), '')
ledger_new = bool(prev) and ledger != prev.get('ledger_file')
# committee roster: the organisation chart has no board post, so compare it directly
def roster():
    import subprocess
    os.makedirs('out', exist_ok=True)
    r = subprocess.run(['curl', '-sS', '--max-time', '90', '-b', 'ck.txt', fetch.BASE + '/intrcn/selectOrgcht.do', '-o', 'raw/orgcht.json'], capture_output=True)
    if r.returncode:
        return None
    b = subprocess.run([sys.executable, '-I', 'build_committee.py'], capture_output=True)
    if b.returncode:
        return None
    rows = json.load(open('out/committee.json', encoding='utf-8'))
    sig = sorted('|'.join(str(x.get(k, '')) for k in ('group', 'committee', 'role', 'name', 'org')) for x in rows)
    return sig if len(sig) >= 20 else None  # a short answer is a failed fetch, not a change


sig = roster()
old_sig = prev.get('committee')
if sig is None:
    sig = old_sig  # could not read it this time: say nothing, keep what we had
elif old_sig is not None and sig != old_sig:
    new += [f"조직도 변경 - 추가: {x}" for x in sorted(set(sig) - set(old_sig))] + [f"조직도 변경 - 삭제: {x}" for x in sorted(set(old_sig) - set(sig))]
state = {'seen': sorted({r['bbsSntncNo'] for r in relevant}), 'ledger_file': ledger, 'committee': sig}
json.dump(state, open('state_next.json', 'w'))
print(json.dumps({'new': bool(new) or ledger_new or not prev, 'posts': new[:30], 'ledger_new': ledger_new, 'first_run': not prev}, ensure_ascii=False))
