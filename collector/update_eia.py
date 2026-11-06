"""Refresh data/offshore_eia.json from the public-data API. The key comes only from the DATA_GO_KR_KEY environment variable.

Permit numbers for each assessment are in eia_map.json (matched by hand: add a line there for a new project).
"""
import json, os, sys, time, urllib.error, urllib.parse, urllib.request
import xml.etree.ElementTree as T

KEY = os.environ.get('DATA_GO_KR_KEY', '').strip()
HERE = os.path.dirname(os.path.abspath(__file__))
URL = 'https://apis.data.go.kr/1480523/EnvrnAffcEvlDscssSttusInfoInqireService/getDscssBsnsListInfoInqire'
if not KEY:
    print('DATA_GO_KR_KEY 없음: 환경영향평가 갱신을 건너뜁니다.')
    raise SystemExit(0)


def stage(code):
    if not code:
        return '단계 미표기', 'unknown'
    if '협의완료' in code or '협의내용통보' in code:
        return ('변경협의 완료' if '변경' in code else '협의 완료'), 'done'
    if '초안' in code:
        return '초안 접수', 'draft'
    return code, 'ing'


ROWS = 500


def reason(e):
    """A short cause for the log. Never include the request URL: it holds the key."""
    if isinstance(e, urllib.error.HTTPError):
        return f'HTTP {e.code}'
    if isinstance(e, urllib.error.URLError):
        return f'URLError: {e.reason}'
    return type(e).__name__


def get(page):
    q = urllib.parse.urlencode({'serviceKey': KEY, 'pageNo': page, 'numOfRows': ROWS})
    last = None
    for base in (URL, URL.replace('https://', 'http://', 1)):
        for attempt in range(3):
            try:
                req = urllib.request.Request(f'{base}?{q}', headers={'User-Agent': 'power-permit-dashboard/1.0'})
                x = T.fromstring(urllib.request.urlopen(req, timeout=60).read())
                code = x.findtext('.//resultCode')
                if code and code not in ('00', '0', 'NORMAL_CODE'):
                    raise RuntimeError(f'API 응답 {code} {x.findtext(".//resultMsg") or ""}'.strip())
                return x
            except RuntimeError:
                raise
            except Exception as e:
                last = e
                print(f'  {base.split(":")[0]} {page}쪽 {attempt + 1}회 실패({reason(e)})')
                time.sleep(5 * (attempt + 1))
    raise last


rows, page = {}, 1
try:
    while True:
        x = get(page)
        items = x.findall('.//item')
        for i in items:
            d = {c.tag: c.text for c in i}
            rows[d.get('eiaCd')] = d
        if not items or page * ROWS >= int(x.findtext('.//totalCount') or 0):
            break
        page += 1
        time.sleep(1)
    print(f'환경영향평가 목록 {len(rows)}건 조회')
except Exception as e:
    msg = str(e) if isinstance(e, RuntimeError) else reason(e)
    print(f'환경영향평가 조회 실패({msg}): 기존 자료를 유지합니다.')
    raise SystemExit(0)

out = []
for code, permits in json.load(open(os.path.join(HERE, 'eia_map.json'))).items():
    a = rows.get(code)
    if not a:
        continue
    name, group = stage(a.get('firstCtgCd'))
    out += [{'permit_no': p, 'eia_name': a.get('bizNm'), 'eia_cd': code, 'eia_stage_raw': a.get('firstCtgCd') or '', 'eia_stage': name,
             'eia_group': group, 'eia_date': (a.get('stepChangeDt') or '').replace('.', '-')} for p in permits]
if len(out) < 20:
    print(f'환경영향평가 {len(out)}건으로 너무 적어 기존 자료를 유지합니다.')
    raise SystemExit(0)
json.dump(out, open(os.path.join(HERE, '..', 'data', 'offshore_eia.json'), 'w', encoding='utf-8'), ensure_ascii=False)
print(f'환경영향평가 {len(out)}건 갱신')
