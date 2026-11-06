// ---- watchlist: next deadline within 18 months (548 days) or already past ----
const WATCH_DAYS = 548;
OW.watchRows = () => {
  const prm = dash.params();
  return OW.rows('proj_status')
    .filter((p) => p.active === 1 && p.days_left != null && p.days_left <= WATCH_DAYS && OW.passes(p, { ...prm, stage: '', dl: '' }))
    .sort((a, b) => a.days_left - b.days_left);
};
dash.draw('watch', (tb) => {
  const prm = dash.params();
  const rows = OW.watchRows();
  OW.tbody(tb, rows, 'permit_no', OW.projCols(), OW.LIMIT);
  tb.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('is-picked', tr.dataset.key === prm.pick));
});

// ---- construction-stage pipeline ----
dash.draw('btable', (tb) => {
  const prm = dash.params();
  const rows = OW.rows('proj_status').filter((p) => p.stage === '착공/공사계획인가' && OW.passes(p, { ...prm, stage: '', dl: '', chg: '' }));
  const max = d3.max(rows, (r) => r.capacity_mw) || 1;
  OW.tbody(tb, rows, 'permit_no', [
    { f: 'permit_no', cls: 'ow-mono' },
    { f: 'stage', badge: (r) => OW.stageColor(r.stage) },
    { f: 'project_name', cls: 'ow-wrap ow-strong' },
    { f: 'operator', cls: 'ow-hide-s' },
    { f: 'region', pill: true },
    { f: 'capacity_mw', fmt: (r) => OW.mw(r.capacity_mw), bar: (r) => r.capacity_mw / max, cls: 'ow-num', color: () => OW.css('--ow-blue') },
    { f: 'const_deadline', color: () => OW.css('--ow-blue') },
    { f: 'prep_deadline' },
    { f: 'history', fmt: (r) => String(r.history || '').split(' / ').filter(Boolean).pop() || '', cls: 'ow-hide-s ow-wrap ow-small' },
  ]);
});

// ---- revocation agendas ----
dash.draw('ratable', (tb) => {
  const src = dash.params().src;
  OW.tbody(tb, OW.rows('rev_agendas').filter((r) => (!src || OW.agTab(r.title) === src) && OW.qhit(r, ['title', 'session', 'date', 'result', 'detail'])), 'id', [
    { f: 'date' },
    { f: 'session' },
    { f: 'title', cls: 'ow-wrap' },
    { f: 'result', badge: () => OW.css('--cds-chart-status-critical') },
    { f: 'detail', cls: 'ow-wrap ow-small' },
  ]);
});

// ---- whole ledger by source ----
dash.draw('ledger', (el) => {
  if (OW.pending(el, 'ledger_sources')) return;
  const rows = OW.rows('ledger_sources').slice().sort((a, b) => b.count - a.count);
  OW.hbars(el, rows, {
    label: (d) => d.source, value: (d) => d.count,
    color: (d) => (d.source === '해상풍력' ? OW.css('--ow-blue') : d.source === '육상풍력' ? OW.css('--ow-green') : d.source === '태양광' ? OW.css('--ow-amber') : d.source === '연료전지' ? OW.css('--ow-violet') : /LNG/.test(d.source) ? OW.css('--ow-orange') : /기력/.test(d.source) ? OW.css('--ow-slate') : OW.css('--ow-teal')),
    fmt: (d) => `${OW.fi(d.count)}건`,
  });
});
dash.calc('ledger_total', {
  inputs: ['ledger_sources'],
  title: '허가대장 전체 허가 수',
  description: '발전원별 허가 수를 더합니다.',
  fn: (ledger_sources) => [{ total: ledger_sources.reduce((s, r) => s + Number(r.count), 0) }],
});

// ---- committee organisation chart: drawn from the roster, so it changes with the data ----
dash.draw('orgchart', (el) => {
  if (OW.pending(el, 'committee')) return;
  el.replaceChildren();
  const E = OW.el, R = OW.rows('committee');
  const who = (m) => (m.name && m.name !== '-' ? m.name : '공석');
  const node = (m, cls) => {
    const n = E('div', 'ow-onode' + (cls ? ` ${cls}` : ''));
    n.append(E('span', 'ow-orole', m.role), E('span', 'ow-oname', who(m)));
    if (m.org && m.org !== '공석' && m.org !== '사무국' && m.org !== '전기위원회') n.append(E('span', 'ow-oorg', m.org));
    return n;
  };
  const main = R.filter((m) => m.group === '본위원회');
  const head = main.find((m) => m.role === '위원장');
  if (head) el.append(node(head, 'ow-otop'));
  const rest = main.filter((m) => m !== head);
  if (rest.length) {
    el.append(E('div', 'ow-oline'));
    const box = E('div', 'ow-osec');
    box.append(E('div', 'ow-otitle', `본위원회 위원 ${OW.fi(rest.length)}명`));
    const g = E('div', 'ow-ogrid');
    rest.forEach((m) => g.append(node(m)));
    box.append(g);
    el.append(box);
  }
  const groups = [...new Set(R.filter((m) => m.group !== '본위원회').map((m) => m.committee))];
  if (groups.length) {
    el.append(E('div', 'ow-oline'));
    const row = E('div', 'ow-obranches');
    groups.forEach((name) => {
      const ms = R.filter((m) => m.committee === name && m.group !== '본위원회');
      const lead = ms.find((m) => m.role === '위원장' || m.role === '사무국장') || ms[0];
      const others = ms.filter((m) => m !== lead);
      const col = E('div', 'ow-obranch' + (lead.group === '사무국' ? ' is-sec' : ''));
      col.append(E('div', 'ow-otitle', name), node(lead, 'ow-olead'));
      const open = others.filter((m) => m.name && m.name !== '-');
      if (open.length) {
        const d = E('details', 'ow-odet');
        d.append(E('summary', null, `구성원 ${OW.fi(open.length)}명 보기`));
        const list = E('div', 'ow-olist');
        open.forEach((m) => list.append(node(m)));
        d.append(list);
        col.append(d);
      } else if (others.length) col.append(E('div', 'ow-oorg', '위원 공석'));
      row.append(col);
    });
    el.append(row);
  }
});

// ---- committee roster ----
dash.draw('ctable', (tb) => {
  const prm = dash.params();
  const q = String(prm.cq || '').toLowerCase();
  const rows = OW.rows('committee').filter((m) => (!prm.cg || m.group === prm.cg)
    && (!q || `${m.group} ${m.committee} ${m.role} ${m.name} ${m.org}`.toLowerCase().includes(q)));
  OW.tbody(tb, rows, 'id', [
    { f: 'group' },
    { f: 'committee', cls: 'ow-wrap' },
    { f: 'role' },
    { f: 'name' },
    { f: 'org', cls: 'ow-wrap' },
  ]);
});

// ---- 허가 보류·불허가 안건 (아직 허가받지 못한 신청) ----
dash.calc('holds', {
  inputs: ['agendas', 'agendas_old'],
  title: '허가 보류·불허가 안건',
  description: '위원회 개최결과에서 발전사업 허가·변경허가 안건 중 심의보류·불허가된 것을 모읍니다. 「상기 N건」 사유는 같은 회차의 해당 번호 안건에 나눠 붙이고, 같은 사업명이 이후 회차에서 허가되었는지 찾아 붙입니다.',
  fn: (agendas0, agendas_old) => {
    const agendas = [...agendas0, ...(agendas_old || [])];
    const agTab = (t) => (/해상/.test(t) ? '해상풍력' : /풍력/.test(t) ? '육상풍력' : /태양/.test(t) ? '태양광' : /연료전지/.test(t) ? '연료전지' : '기타');
    const isPermit = (t) => /발전사업\s*(변경)?\s*허가/.test(t) && !/취소/.test(t);
    const head = (t) => String(t || '').split('※')[0].trim();
    const nameOf = (t) => head(t).replace(/\s*발전사업.*$/, '').trim();
    const keyOf = (t) => nameOf(t).replace(/\(주\)|주식회사|\s+/g, '') + (/변경허가/.test(head(t)) ? '|변경' : '');
    const reasonOf = (t) => { const m = String(t || '').match(/※\s*\(사유\)\s*([\s\S]*)$/); return m ? m[1].trim() : ''; };
    const PASS = /^(허가|조건부허가|허가기준충족)$/;
    const list = agendas.filter((a) => isPermit(a.title));
    const reason = {};
    for (const a of list) { const r = reasonOf(a.title); if (r) reason[a.id] = r; }
    for (const a of list) {
      const r = reason[a.id];
      if (!r || !/^상기/.test(r)) continue;
      const m = r.match(/(\d+)\s*[호번]?\s*~\s*(\d+)/);
      if (!m) continue;
      for (const b of list) {
        const n = Number(b.no);
        if (b.session === a.session && n >= Number(m[1]) && n <= Number(m[2]) && !reason[b.id]) reason[b.id] = r;
      }
    }
    const out = [];
    for (const a of list) {
      if (!/심의보류|불허가/.test(a.result || '')) continue;
      const k = keyOf(a.title);
      const later = list.filter((b) => b.date > a.date && keyOf(b.title) === k).sort((x, y) => (x.date < y.date ? -1 : 1));
      const pass = later.find((b) => PASS.test(b.result || ''));
      const last = later[later.length - 1];
      const after = pass ? `이후 ${pass.result} (${pass.date} ${pass.session})` : last ? `이후 ${last.result} (${last.date} ${last.session})` : (a.note || '');
      out.push({ id: a.id, date: a.date, session: a.session, no: a.no, result: a.result,
        kind: /변경\s*허가/.test(head(a.title)) ? '변경허가' : '신규 허가', tab: agTab(a.title), name: nameOf(a.title),
        reason: String(reason[a.id] || '').replace(/^상기\s*[^은는]*[은는]\s*/, ''),
        status: pass ? '이후 허가됨' : a.result === '불허가' ? '불허가' : last ? '재심의 후 미허가' : '재심의 기록 없음', after });
    }
    return out.sort((x, y) => (x.date < y.date ? 1 : x.date > y.date ? -1 : Number(x.no) - Number(y.no)));
  },
});
OW.holdRows = () => {
  const prm = dash.params();
  return OW.rows('holds').filter((r) => (!prm.src || r.tab === prm.src) && (!prm.hs || r.status === prm.hs)
    && OW.qhit(r, ['name', 'session', 'date', 'result', 'reason', 'after']));
};
document.querySelectorAll('[data-hs]').forEach((b) => b.addEventListener('click', () => dash.setParams({ hs: b.dataset.hs || null })));
dash.onData(() => {
  const hs = dash.params().hs || '';
  document.querySelectorAll('[data-hs]').forEach((b) => b.setAttribute('aria-pressed', String(hs === b.dataset.hs)));
});
dash.draw('htable', (tb) => {
  const rows = OW.holdRows();
  const sc = (r) => (r.status === '이후 허가됨' ? OW.css('--ow-green') : r.status === '불허가' ? OW.css('--ow-red') : OW.css('--ow-amber'));
  OW.tbody(tb, rows, 'id', [
    { f: 'date', cls: 'ow-mono' },
    { f: 'session' },
    { f: 'result', badge: (r) => (r.result === '불허가' ? OW.css('--ow-red') : OW.css('--ow-amber')) },
    { f: 'name', cls: 'ow-wrap ow-strong', render: (td, r) => {
      td.append(OW.el('div', 'ow-name', r.name || '–'));
      td.append(OW.el('div', 'ow-pn-s', `${r.tab} · ${r.kind}`));
    } },
    { f: 'reason', cls: 'ow-wrap ow-small' },
    { f: 'status', badge: sc, render: (td, r) => { if (r.after) td.append(OW.el('div', 'ow-pn-s', r.after)); } },
  ], 50);
});
dash.draw('hcount', (n) => {
  if (dash.data('holds').status !== 'ok') { n.textContent = '—'; return; }
  const all = OW.rows('holds').filter((r) => !dash.params().src || r.tab === dash.params().src);
  const c = (s) => all.filter((r) => r.status === s).length;
  n.textContent = `${OW.fi(OW.holdRows().length)}건 표시 · 전체 ${OW.fi(all.length)}건(이후 허가됨 ${c('이후 허가됨')} · 불허가 ${c('불허가')} · 재심의 후 미허가 ${c('재심의 후 미허가')} · 재심의 기록 없음 ${c('재심의 기록 없음')})`;
});
document.querySelectorAll('[data-csv="holds"]').forEach((b) => b.addEventListener('click', () => {
  OW.csv('발전사업허가_보류·불허가', OW.holdRows(), [['심의일', 'date'], ['차수', 'session'], ['안건번호', 'no'], ['결과', 'result'], ['발전원', 'tab'], ['구분', 'kind'], ['사업명', 'name'], ['사유', 'reason'], ['이후 상태', 'status'], ['이후 결과', 'after']]);
}));
