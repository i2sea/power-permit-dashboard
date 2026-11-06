// ---- watchlist: next deadline within 18 months (548 days) or already past ----
const WATCH_DAYS = 548;
dash.draw('watch', (tb) => {
  const prm = dash.params();
  const rows = OW.rows('proj_status')
    .filter((p) => p.active === 1 && p.days_left != null && p.days_left <= WATCH_DAYS && OW.passes(p, { ...prm, stage: '', dl: '' }))
    .sort((a, b) => a.days_left - b.days_left);
  OW.tbody(tb, rows, 'permit_no', OW.projCols(), OW.LIMIT);
  tb.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('is-picked', tr.dataset.key === prm.pick));
});

// ---- construction-stage pipeline ----
dash.draw('btable', (tb) => {
  const prm = dash.params();
  const rows = OW.rows('proj_status').filter((p) => p.stage === '착공/공사계획인가' && OW.passes(p, { ...prm, stage: '', dl: '', chg: '', region: '' }));
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
