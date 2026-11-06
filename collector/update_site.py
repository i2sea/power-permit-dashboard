"""GitHub Actions entry point: check the KOREC site and refresh data/ only when something changed.

Run from the repository root:  python collector/update_site.py [--force]
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
FORCE = '--force' in sys.argv
# collector output -> file the page reads
OUTPUT = {
    'projects.json': 'offshore_projects.json', 'revocations.json': 'revocations.json', 'agendas.json': 'agendas.json',
    'rev_agendas.json': 'revocation_agendas.json', 'pipeline.json': 'construction_pipeline.json',
    'committee.json': 'committee.json', 'ledger_sources.json': 'ledger_by_source.json', 'snapshot.json': 'snapshot.json',
}
MINIMUM = {'projects.json': 1000, 'revocations.json': 150, 'agendas.json': 400, 'committee.json': 20}


def run(*args):
    r = subprocess.run([sys.executable, '-I', *args], cwd=HERE, capture_output=True, text=True)
    sys.stderr.write(r.stderr[-3000:])
    if r.returncode:
        raise SystemExit(f'step failed: {args}')
    return r.stdout


state_file = os.path.join(DATA, 'state.json')
result = json.loads(run('check.py', state_file).strip().splitlines()[-1])
print(json.dumps(result, ensure_ascii=False))
if not (result['new'] or FORCE):
    print('변경 없음')
    raise SystemExit(0)

print(run('refresh.py')[-1500:])
for name, least in MINIMUM.items():
    rows = json.load(open(os.path.join(HERE, 'out', name), encoding='utf-8'))
    if len(rows) < least:
        raise SystemExit(f'{name}: {len(rows)}행으로 기준({least}행)보다 적어 데이터를 교체하지 않습니다.')
for source, target in OUTPUT.items():
    shutil.copy(os.path.join(HERE, 'out', source), os.path.join(DATA, target))
shutil.copy(os.path.join(HERE, 'state_next.json'), state_file)
changes = os.path.join(HERE, 'out', 'changes.json')
if os.path.exists(changes):
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with open(summary, 'a', encoding='utf-8') as f:
            f.write('## 전기위원회 갱신 결과\n\n```json\n' + json.dumps(result, ensure_ascii=False, indent=1) + '\n```\n')
print('데이터 교체 완료')
