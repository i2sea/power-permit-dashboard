// ---- starred projects: kept in this browser only ----
(() => {
  const KEY = 'ow-stars';
  let saved = [];
  try { saved = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { saved = []; }
  OW.stars = new Set(Array.isArray(saved) ? saved : []);
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...OW.stars])); } catch (e) { /* storage blocked: keep for this visit */ } };
  OW.starBtn = (id) => {
    const on = OW.stars.has(id);
    const b = OW.el('button', 'ow-star' + (on ? ' on' : ''), on ? '★' : '☆');
    b.type = 'button';
    b.title = on ? '관심 사업에서 빼기' : '관심 사업으로 표시';
    b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (OW.stars.has(id)) OW.stars.delete(id); else OW.stars.add(id);
      save();
      dash.setParams({});
    });
    return b;
  };
  document.querySelectorAll('[data-starfilter]').forEach((b) => b.addEventListener('click', () => dash.setParams({ star: dash.params().star ? null : '1' })));
  dash.onData(() => {
    const on = !!dash.params().star;
    document.querySelectorAll('[data-starfilter]').forEach((b) => b.setAttribute('aria-pressed', String(on)));
  });
  dash.draw('starn', (el) => { el.textContent = OW.stars.size ? ` (${OW.fi(OW.stars.size)})` : ''; });
})();

// ---- CSV download (opens in Excel; UTF-8 with BOM so Korean shows correctly) ----
OW.csvCols = [
  ['허가번호', 'permit_no'], ['이전 허가번호', 'prev_permit_no'], ['발전원', 'source'], ['사업명', 'project_name'],
  ['현재 사업자', 'operator'], ['최초 사업자', 'initial_operator'], ['광역지역', 'region'], ['시군', 'region_local'], ['사업장소', 'location'],
  ['설비용량(MW)', 'capacity_mw'], ['최초 허가일', 'permit_date'], ['최근 변경일', 'latest_change_date'],
  ['공사계획인가 기한', 'const_deadline'], ['준비기간(준공기한)', 'prep_deadline'], ['다음 기한', 'next_deadline'], ['다음 기한 구분', 'next_type'],
  ['남은 일수', 'days_left'], ['기한 상태', 'deadline_status'], ['진행 단계', 'stage'], ['사업자 변경', 'operator_changed'],
  ['환경영향평가', 'eia_stage'], ['환경영향평가 일자', 'eia_date'], ['경쟁입찰', 'auction'], ['허가대장 변경 내역', 'history'],
];
OW.csv = (name, rows, cols) => {
  const esc = (v) => { const t = v == null ? '' : String(v).replace(/\r?\n|\r/g, ' '); return /[",]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const text = [cols.map((c) => esc(c[0])).join(','), ...rows.map((r) => cols.map((c) => esc(r[c[1]])).join(','))].join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  const a = OW.el('a');
  const ref = ((OW.rows('snapshot').find((r) => r.item === '기준일') || {}).value || '').replace(/-/g, '');
  a.href = url; a.download = `${name}_${ref}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
document.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', () => {
  const which = b.dataset.csv;
  if (which === 'list') OW.csv('발전사업허가_목록', OW.sorted('ptable', OW.listRows()), OW.csvCols);
  if (which === 'watch') OW.csv('발전사업허가_워치리스트', OW.sorted('wtable', OW.watchRows()), OW.csvCols);
  if (which === 'recent') OW.csv('발전사업허가_최근변경', OW.recentRows(), [['날짜', 'date'], ['구분', 'kind'], ['발전원', 'source'], ['허가번호', 'permit_no'], ['사업명', 'name'], ['내용', 'detail']]);
}));

// ---- recent changes: dated records from the ledger, notices, committee results and the collector's change log ----
OW.RECENT_DAYS = 90;
dash.calc('recent', {
  inputs: ['proj_status', 'revocations', 'agendas', 'changes_log', 'snapshot'],
  title: '최근 변경',
  description: '기준일부터 90일 안의 허가대장 변경·신규 허가, 허가취소·청문 공고, 위원회 심의 결과, 수집기가 기록한 위원 변경을 날짜순으로 모읍니다.',
  fn: (proj_status, revocations, agendas, changes_log, snapshot) => {
    const ref = (snapshot.find((r) => r.item === '기준일') || {}).value;
    const from = new Date(Date.parse(ref + 'T00:00:00Z') - 90 * 86400000).toISOString().slice(0, 10);
    const tabOf = (s) => (['해상풍력', '육상풍력', '태양광', '연료전지'].includes(s) ? s : '기타');
    const agTab = (t) => (/해상/.test(t) ? '해상풍력' : /풍력/.test(t) ? '육상풍력' : /태양/.test(t) ? '태양광' : /연료전지/.test(t) ? '연료전지' : '기타');
    const out = [];
    for (const p of proj_status) {
      let tl = [];
      try { tl = JSON.parse(p.timeline || '[]'); } catch (e) { tl = []; }
      for (const t of tl) {
        if (!t.date || t.date < from) continue;
        const first = t.step === '최초허가';
        const kind = first ? '신규 허가' : /양수|주식|합병|분할|승계/.test(t.remarks || '') ? '사업자 변경' : /연장/.test(t.remarks || '') ? '기한 연장' : /반납|취소/.test(t.remarks || '') ? '반납·취소' : '허가 변경';
        out.push({ id: `L-${p.permit_no}-${t.date}-${out.length}`, date: t.date, kind, group: '허가대장', tab: p.tab, source: p.source,
          permit_no: p.permit_no, name: p.project_name, detail: first ? `${p.capacity_mw} MW 최초 허가` : (t.remarks || t.step || '') });
      }
    }
    const seen = new Set();
    for (const r of revocations) {
      if (!r.notice_date || r.notice_date < from) continue;
      const k = `${r.permit_no}|${r.stage_code}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ id: `R-${r.id}`, date: r.notice_date, kind: r.stage_code === 'revoked' ? '허가취소' : r.stage_code === 'hearing' ? '청문 공고' : r.stage || '처분 공고',
        group: '취소·청문', tab: tabOf(r.source), source: r.source, permit_no: r.permit_no, name: String(r.project_name || '').replace(/\s+/g, ' '),
        detail: [r.reason, r.notice_title].filter(Boolean).join(' · ') });
    }
    for (const a of agendas) {
      if (!a.date || a.date < from) continue;
      out.push({ id: `A-${a.id}`, date: a.date, kind: `위원회 ${a.result || '심의'}`, group: '위원회', tab: agTab(a.title), source: '',
        permit_no: '', name: `${a.session} ${a.type || ''}`.trim(), detail: a.title });
    }
    for (const c of changes_log) {
      if (!c.date || c.date < from) continue;
      out.push({ id: `C-${c.date}-${out.length}`, date: c.date, kind: c.kind, group: c.kind === '위원 변경' ? '위원 변경' : '새 게시물', tab: '', source: '',
        permit_no: '', name: c.kind, detail: c.text });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  },
});
OW.recentRows = () => {
  const prm = dash.params();
  return OW.rows('recent').filter((r) => (!prm.src || !r.tab || r.tab === prm.src) && (!prm.rg || r.group === prm.rg)
    && (!prm.star || (r.permit_no && OW.stars.has(r.permit_no))));
};
document.querySelectorAll('[data-rg]').forEach((b) => b.addEventListener('click', () => dash.setParams({ rg: b.dataset.rg || null })));
dash.onData(() => {
  const rg = dash.params().rg || '';
  document.querySelectorAll('[data-rg]').forEach((b) => b.setAttribute('aria-pressed', String(rg === b.dataset.rg)));
});
dash.draw('recent', (tb) => {
  const rows = OW.recentRows();
  const known = new Set(OW.rows('proj_status').map((p) => p.permit_no));
  const col = (r) => (/취소|반납/.test(r.kind) ? OW.css('--ow-red') : /청문|보류/.test(r.kind) ? OW.css('--ow-amber') : /사업자/.test(r.kind) ? OW.css('--ow-violet')
    : /연장/.test(r.kind) ? OW.css('--ow-sky') : /신규/.test(r.kind) ? OW.css('--ow-green') : /위원/.test(r.kind) ? '#4338ca' : OW.css('--ow-slate'));
  OW.tbody(tb, rows, 'id', [
    { f: 'date', cls: 'ow-mono' },
    { f: 'kind', badge: col },
    { f: 'name', cls: 'ow-wrap ow-strong', render: (td, r) => {
      td.append(OW.el('div', 'ow-name', r.name || '–'));
      if (r.permit_no) td.append(OW.el('div', 'ow-pn-s', `${r.permit_no}${r.source ? ` · ${r.source}` : ''}`));
    } },
    { f: 'detail', cls: 'ow-wrap ow-small' },
  ], 50);
  tb.querySelectorAll('tr').forEach((tr) => {
    const r = rows.find((x) => x.id === tr.dataset.key);
    tr.classList.toggle('no-pick', !(r && known.has(r.permit_no)));
    if (r && r.permit_no) tr.dataset.pick = r.permit_no;
  });
});
dash.draw('rcount', (n) => {
  if (dash.data('recent').status !== 'ok') { n.textContent = '—'; return; }
  n.textContent = `${OW.fi(OW.recentRows().length)}건`;
});
document.querySelectorAll('#rctable').forEach((t) => t.addEventListener('click', (ev) => {
  const tr = ev.target.closest('tbody tr[data-pick]');
  if (tr && !tr.classList.contains('no-pick')) dash.setParams({ pick: tr.dataset.pick });
}));

// ---- refresh status: last automatic run, read from GitHub (public repositories need no sign-in).
// Shown only on the GitHub Pages copy; elsewhere the drawing stays empty.
(() => {
  let state = null;
  const host = location.hostname;
  const owner = host.split('.')[0], repo = location.pathname.split('/').filter(Boolean)[0];
  if (host.endsWith('.github.io') && repo) {
    fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows/update.yml/runs?per_page=20`, { headers: { Accept: 'application/vnd.github+json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j) => { state = { runs: (j.workflow_runs || []).filter((r) => r.status === 'completed'), link: `https://github.com/${owner}/${repo}/actions/workflows/update.yml` }; dash.draw('runstatus'); })
      .catch(() => {});
  }
  const fmt = (s) => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(s));
  dash.draw('runstatus', (el) => {
    el.replaceChildren();
    el.className = 'ow-runstatus';
    if (!state || !state.runs.length) return;
    const last = state.runs[0], good = state.runs.find((r) => r.conclusion === 'success');
    const link = OW.el('a', 'ow-link', '실행 기록');
    link.href = state.link; link.target = '_blank'; link.rel = 'noopener';
    const age = good ? (Date.now() - Date.parse(good.updated_at)) / 3600000 : Infinity;
    if (last.conclusion !== 'success') {
      el.className = 'ow-runstatus bad';
      el.append(`마지막 자동 갱신(${fmt(last.updated_at)})이 실패했습니다. 마지막 성공 ${good ? fmt(good.updated_at) : '없음'} · 자료가 최신이 아닐 수 있습니다 · `, link);
    } else if (age > 36) {
      el.className = 'ow-runstatus warn';
      el.append(`마지막 자동 갱신 확인 ${fmt(good.updated_at)} (${Math.round(age / 24)}일 전) · `, link);
    } else {
      el.append(`자동 갱신 확인 ${fmt(good.updated_at)} 정상 · 매일 08:44·17:44 · `, link);
    }
  });
})();
