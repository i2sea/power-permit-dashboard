"""Committee roster from the KOREC organisation chart (위원회 소개 > 조직도)."""
import json, datetime as dt
d = json.load(open('raw/orgcht.json', encoding='utf-8'))
rows = []
def s(x): return (x or '').strip()
def add(group, committee, role, name, org, position, detail, contact, key):
    rows.append({'id': key, 'group': group, 'committee': committee, 'role': role, 'name': name, 'org': org, 'position': position,
                 'detail': detail, 'term': '', 'contact': contact})
c = d.get('mfcmmIpla')
if c:
    add('본위원회', '전기위원회', s(c.get('useOfcpsNm')) or '위원장', s(c.get('userNm')), s(c.get('deptNm')), s(c.get('jobCn')), s(c.get('mainCareer')),
        ' · '.join(x for x in (s(c.get('deptTelno')), s(c.get('email'))) if x), f"main-{c.get('userNo')}")
for c in ([d['prmpstMfcmm']] if isinstance(d.get('prmpstMfcmm'), dict) else (d.get('prmpstMfcmm') or [])):
    add('본위원회', '전기위원회', '상임위원', s(c.get('userNm')), s(c.get('deptNm')), s(c.get('jobCn')), s(c.get('mainCareer')), '', f"main-{c.get('userNo')}")
for c in d.get('nonPrmpstMfcmmList') or []:
    add('본위원회', '전기위원회', s(c.get('useOfcpsNm')) or '비상임위원', s(c.get('userNm')), s(c.get('deptNm')) or s(c.get('insttNm')), s(c.get('jobCn')), s(c.get('mainCareer')), '', f"main-{c.get('userNo')}")
for cm in d.get('spcltyCmitList') or []:
    name = s(cm.get('cmitNm')) + ' 전문위원회'
    if s(cm.get('charmnNm')):
        add('전문위원회', name, '위원장', s(cm.get('charmnNm')), s(cm.get('mfcmmDc')).strip('()'), '', '', '', f"sub-{cm.get('cmitNo')}-chair")
    for i, m in enumerate(cm.get('cmitList') or []):
        add('전문위원회', name, s(m.get('cmitOfcpsNm') or m.get('ofcpsNm') or m.get('useOfcpsNm')) or '위원', s(m.get('userNm') or m.get('mfcmmNm')),
            s(m.get('deptNm') or m.get('mfcmmDc') or m.get('insttNm')), '', '', '', f"sub-{cm.get('cmitNo')}-{i}")
for c in d.get('ofcrkYeastList') or []:
    add('사무국', s(c.get('deptNm')) or '사무국', s(c.get('useOfcpsNm')), s(c.get('userNm')), s(c.get('deptNm')), '', s(c.get('jobCn')),
        ' · '.join(x for x in (s(c.get('deptTelno')), s(c.get('email'))) if x), f"sec-{c.get('userNo')}")
# 게시 항목: 구분·위원회·직책·성명·소속만 (연락처·경력 등은 전기위원회 조직도 원문에서 확인)
rows = [{k: r[k] for k in ('id', 'group', 'committee', 'role', 'name', 'org')} for r in rows]
json.dump(rows, open('out/committee.json', 'w', encoding='utf-8'), ensure_ascii=False)
print(len(rows), [ (r['group'], r['role'], r['name']) for r in rows][:12])
