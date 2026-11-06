// ---- deadline timeline ----
dash.draw('gantt', (el) => {
  if (OW.pending(el, 'proj_status', 'snapshot')) return;
  el.replaceChildren();
  const prm = dash.params();
  const ref = OW.day((OW.rows('snapshot').find((r) => r.item === '기준일') || {}).value);
  const rank = { '기한 경과': 0, '1년 이내': 1, '정상': 2, '기한 미확인': 3, '준공': 4 };
  const D = OW.rows('proj_status').filter((p) => p.active === 1 && p.deadline_status !== '확인 필요' && OW.passes(p, { ...prm, stage: '' }))
    .sort((a, b) => (rank[a.deadline_status] - rank[b.deadline_status]) || ((a.days_left ?? 1e9) - (b.days_left ?? 1e9)))
    .slice(0, 200);
  const box = el.closest('.ow-card');
  if (box) box.querySelectorAll('[data-empty]').forEach((n) => { n.hidden = D.length > 0; });
  if (!D.length) return;
  const W = Math.max(320, el.clientWidth), rh = 20, top = 42;
  const H = top + D.length * rh + 6;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const lw = Math.min(Math.max(140, W * 0.34), 300);
  const dates = D.flatMap((p) => [p.permit_date, p.const_deadline, p.prep_deadline]).filter(Boolean).map(OW.day);
  const x = d3.scaleUtc([d3.min(dates), d3.max(dates)], [lw + 8, W - 16]).nice();
  const ticks = x.ticks(Math.max(3, Math.floor((W - lw) / 70)));
  svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'ow-grid').attr('x1', x).attr('x2', x).attr('y1', top - 6).attr('y2', H);
  svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'ow-tick').attr('x', x).attr('y', 12).attr('text-anchor', 'middle').text(d3.utcFormat('%Y'));
  const rows = svg.append('g').selectAll('g').data(D).join('g').attr('class', (p) => 'ow-grow' + (p.permit_no === prm.pick ? ' is-picked' : ''))
    .attr('transform', (p, i) => `translate(0,${top + i * rh})`);
  rows.append('rect').attr('class', 'ow-rowbg').attr('x', 0).attr('width', W).attr('height', rh);
  const maxc = Math.floor((lw - 8) / 7.2);
  rows.append('text').attr('class', 'ow-tick ow-glabel').attr('x', lw - 6).attr('y', rh / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
    .text((p) => { const s = `${p.permit_no} ${OW.short(p.project_name)}`; return s.length > maxc ? s.slice(0, maxc - 1) + '…' : s; });
  rows.append('line').attr('class', 'ow-span').attr('x1', (p) => x(OW.day(p.permit_date))).attr('x2', (p) => x(OW.day(p.prep_deadline || p.permit_date)))
    .attr('y1', rh / 2).attr('y2', rh / 2);
  rows.filter((p) => p.const_deadline).append('line').attr('class', 'ow-span2')
    .attr('x1', (p) => x(OW.day(p.permit_date))).attr('x2', (p) => x(OW.day(p.const_deadline))).attr('y1', rh / 2).attr('y2', rh / 2)
    .style('stroke', (p) => OW.statusColor(p.deadline_status));
  rows.filter((p) => p.const_deadline).append('path').attr('class', 'ow-mk')
    .attr('d', (p) => { const cx = x(OW.day(p.const_deadline)), cy = rh / 2; return `M${cx},${cy - 5}L${cx + 5},${cy}L${cx},${cy + 5}L${cx - 5},${cy}Z`; })
    .style('fill', (p) => (p.next_type === '공사계획인가' ? OW.statusColor(p.deadline_status) : OW.css('--color-panel')))
    .style('stroke', (p) => OW.statusColor(p.deadline_status));
  rows.filter((p) => p.prep_deadline).append('circle').attr('class', 'ow-mk').attr('r', 4.5)
    .attr('cx', (p) => x(OW.day(p.prep_deadline))).attr('cy', rh / 2)
    .style('fill', (p) => (p.next_type === '준비기간(준공)' ? OW.statusColor(p.deadline_status) : OW.css('--color-panel')))
    .style('stroke', (p) => OW.statusColor(p.deadline_status));
  svg.append('line').attr('class', 'ow-today').attr('x1', x(ref)).attr('x2', x(ref)).attr('y1', top - 8).attr('y2', H);
  svg.append('text').attr('class', 'ow-tick ow-today-t').attr('x', x(ref) + 4).attr('y', top - 10).text('기준일');
  const t = OW.tip(el);
  rows.on('mousemove', (ev, p) => t.show(`${p.permit_no} · ${OW.short(p.project_name)}`, [
    { label: '사업자', value: p.operator },
    { label: '용량', value: `${OW.mw(p.capacity_mw)} MW` },
    { label: '최초 허가', value: p.permit_date },
    { label: '공사계획인가 기한', value: p.const_deadline || '–' },
    { label: '준비기간(준공)', value: p.prep_deadline || '–' },
    { label: '다음 기한', value: p.next_deadline ? `${p.next_type} ${OW.dday(p.days_left)}` : '–', color: OW.statusColor(p.deadline_status) }], ev))
    .on('mouseleave', () => t.hide())
    .on('click', (ev, p) => dash.setParams({ pick: p.permit_no === prm.pick ? null : p.permit_no }));
});

// ---- selects whose choices are data ----
const fillSelect = (sel, values, param) => {
  const cur = dash.params()[param] ?? '';
  const keep = new Option(sel.dataset.all || '전체', '');
  sel.replaceChildren(keep, ...values.map((v) => new Option(v, v)));
  sel.value = cur;
  sel.onchange = () => dash.setParams({ [param]: sel.value || null });
};
dash.draw('sel-region', (sel) => {
  const v = [...new Set(OW.rows('proj_status').map((p) => p.region))].sort();
  fillSelect(sel, v, 'region');
});
dash.draw('sel-stage', (sel) => {
  const v = OW.rows('by_stage').map((r) => r.stage);
  fillSelect(sel, v, 'stage');
});

// ---- table helper: tbody drawing with sorting from th buttons ----
window.OWsort = window.OWsort || {};
OW.sorted = (tableId, rows) => {
  const s = OWsort[tableId];
  if (!s) return rows;
  const cmp = (a, b) => { const x = a[s.f], y = b[s.f]; if (x == null || x === '') return 1; if (y == null || y === '') return -1; return typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'ko'); };
  return rows.slice().sort((a, b) => cmp(a, b) * (s.dir === 'ascending' ? 1 : -1));
};
// paging: one page of `limit` rows; the page resets when the filters or the row count change
OW.pages = {};
OW.pager = (table, total, limit) => {
  const box = table.closest('.ow-tbox');
  let bar = box && box.nextElementSibling && box.nextElementSibling.classList.contains('ow-pager') ? box.nextElementSibling : null;
  if (!box) return;
  if (!bar) { bar = OW.el('div', 'ow-pager'); box.after(bar); }
  const st = OW.pages[table.id];
  const n = Math.max(1, Math.ceil(total / limit));
  bar.replaceChildren();
  bar.hidden = n <= 1;
  if (n <= 1) return;
  const go = (i) => { st.page = Math.min(n - 1, Math.max(0, i)); const tb = table.querySelector('tbody[data-draw]'); if (tb) dash.draw(tb.dataset.draw); box.scrollTop = 0; };
  const btn = (t, i, dis) => { const b = OW.el('button', 'ow-btn', t); b.type = 'button'; b.disabled = dis; b.onclick = () => go(i); return b; };
  bar.append(btn('‹ 이전', st.page - 1, st.page === 0),
    OW.el('span', 'ow-count', `${OW.fi(st.page * limit + 1)}–${OW.fi(Math.min(total, (st.page + 1) * limit))} / ${OW.fi(total)}건 (${st.page + 1}/${n}쪽)`),
    btn('다음 ›', st.page + 1, st.page >= n - 1));
};
OW.tbody = (tb, rows, key, cols, limit) => {
  tb.replaceChildren();
  const table = tb.closest('table');
  rows = OW.sorted(table.id, rows);
  if (limit) {
    const { pick, ...rest } = dash.params();
    const sig = `${rows.length}|${JSON.stringify(rest)}`;
    const st = OW.pages[table.id] || (OW.pages[table.id] = { page: 0, sig });
    if (st.sig !== sig) { st.sig = sig; st.page = 0; }
    OW.pager(table, rows.length, limit);
    rows = rows.slice(st.page * limit, (st.page + 1) * limit);
    limit = 0;
  }
  if (!rows.length && dash.params().q) {
    const tr = document.createElement('tr'), td = OW.el('td', 'ow-lite', '검색 결과가 없습니다.');
    td.colSpan = cols.length;
    tr.append(td);
    tb.append(tr);
  }
  for (const r of limit ? rows.slice(0, limit) : rows) {
    const tr = document.createElement('tr');
    tr.dataset.key = r[key];
    for (const c of cols) {
      const td = document.createElement('td');
      if (c.cls) td.className = typeof c.cls === 'function' ? c.cls(r) : c.cls;
      if (c.color) { const k = c.color(r); if (k) { td.style.color = OW.ink(k); td.style.fontWeight = '500'; } }
      const v = c.fmt ? c.fmt(r) : r[c.f];
      if (c.badge) { const b = OW.el('span', 'ow-badge', v); const col = c.badge(r); b.style.color = OW.ink(col); b.style.borderColor = col; b.style.background = OW.tint(col); td.append(b); }
      else if (c.render) c.render(td, r);
      else if (c.pill) td.append(OW.el('span', 'ow-pill', v == null || v === '' ? '–' : String(v)));
      else if (c.bar) { const w = OW.el('div', 'ow-cbar'); const i = OW.el('i'); i.style.width = `${Math.max(1, c.bar(r) * 100)}%`; w.append(i, OW.el('span', null, v)); td.append(w); }
      else td.textContent = v == null || v === '' ? '–' : String(v);
      tr.append(td);
    }
    tb.append(tr);
  }
};
document.querySelectorAll('table.ow-table').forEach((table) => {
  table.querySelectorAll('th[data-field] button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const th = btn.closest('th'), f = th.dataset.sortField || th.dataset.field;
      const cur = OWsort[table.id];
      const dir = cur && cur.f === f && cur.dir === 'descending' ? 'ascending' : 'descending';
      OWsort[table.id] = { f, dir };
      table.querySelectorAll('th').forEach((h) => h.removeAttribute('aria-sort'));
      th.setAttribute('aria-sort', dir);
      const tb = table.querySelector('tbody[data-draw]');
      if (tb) dash.draw(tb.dataset.draw);
    });
  });
  table.addEventListener('click', (ev) => {
    if (!table.classList.contains('is-pick')) return;
    const tr = ev.target.closest('tbody tr[data-key]');
    if (tr && !tr.classList.contains('no-pick')) dash.setParams({ pick: tr.dataset.key === dash.params().pick ? null : tr.dataset.key });
  });
});

// ---- one row per project: columns shared by the list and the watchlist ----
OW.LIMIT = 100;
OW.projCols = () => {
  const E = OW.el;
  const live = (p) => p.active === 1 && p.stage !== '준공/상업운전' && p.deadline_status !== '확인 필요';
  const dline = (td, p, date, days, main) => {
    td.append(E('div', main, date || '–'));
    if (date && live(p) && days != null) {
      const cls = days < 0 ? 'ow-d-over' : days <= 365 ? 'ow-d-soon' : 'ow-d-ok';
      td.append(E('div', cls, OW.dday(days) + (days < 0 ? ' (경과)' : days <= 365 ? ' (임박)' : '')));
    }
  };
  const chip = (cls, text, col) => { const c = E('span', cls, text); if (col) { c.style.color = OW.ink(col); c.style.borderColor = col; c.style.background = OW.tint(col); } return c; };
  return [
    { f: 'permit_no', render: (td, p) => {
      const line = E('div', 'ow-pnline');
      line.append(OW.starBtn(p.permit_no), E('span', 'ow-pn', p.permit_no));
      td.append(line);
      if (p.prev_permit_no) td.append(E('div', 'ow-pn-s', `구 ${p.prev_permit_no} 승계`));
    } },
    { f: 'project_name', cls: 'ow-wrap ow-c-name', render: (td, p) => {
      td.append(E('div', 'ow-name', p.project_name));
      td.append(p.operator !== p.initial_operator
        ? E('div', 'ow-chg', `사업자: ${p.initial_operator} → ${p.operator}`)
        : E('div', 'ow-lite', `사업자: ${p.operator}`));
    } },
    { f: 'capacity_mw', render: (td, p) => {
      td.append(E('div', null, `${p.region} ${p.region_local}`.trim()), E('div', 'ow-mw', `${OW.mw(p.capacity_mw)} MW`));
      if (p.source !== '해상풍력' || OW.src() === '전체') td.append(chip('ow-tag', p.source, p.tab === '기타' ? OW.css('--ow-slate') : OW.srcColor(p.source)));
    } },
    { f: 'permit_date', cls: 'ow-hide-s', render: (td, p) => {
      td.append(E('div', null, p.permit_date || '–'));
      if (p.latest_change_date && p.latest_change_date !== p.permit_date) td.append(E('div', 'ow-lite', `변경: ${p.latest_change_date}`));
    } },
    { f: 'const_deadline', render: (td, p) => dline(td, p, p.const_deadline, p.const_days, 'ow-date-c') },
    { f: 'prep_deadline', cls: 'ow-hide-s', render: (td, p) => dline(td, p, p.prep_deadline, p.prep_days, 'ow-date-p') },
    { f: 'days_left', render: (td, p) => {
      const col = OW.statusColor(p.deadline_status);
      td.append(chip('ow-badge', p.days_left == null ? p.deadline_status : `${p.deadline_status} (${OW.dday(p.days_left)})`, col));
      if (p.next_type) td.append(E('div', 'ow-lite', `[${p.next_type} 기준]`));
    } },
    { f: 'stage', cls: 'ow-c-stage', render: (td, p) => {
      td.append(chip('ow-badge', p.stage, OW.stageColor(p.stage)));
      const started = /^(착공|준공)/.test(p.stage);
      const steps = [['①허가', true], ['②환경', p.eia_group === 'done' ? 'on' : p.eia_group === 'na' ? 'na' : ''], ['③입찰', !!p.auction], ['④인가·착공', started], ['⑤준공', p.stage === '준공/상업운전']];
      const box = E('div', 'ow-steps');
      steps.forEach(([t, on]) => {
        const s = E('span', 'ow-step' + (on === 'na' ? ' na' : on ? ' on' : ''), on === 'na' ? `${t} 해당없음` : t);
        if (on === 'na') s.title = '100 MW 미만이라 환경영향평가 대상이 아닙니다.';
        box.append(s);
      });
      td.append(box);
    } },
    { f: 'history', cls: 'ow-wrap ow-c-detail ow-hide-s', render: (td, p) => {
      const tags = E('div', 'ow-tags');
      if (p.eia_stage) tags.append(chip('ow-tag', `환경영향평가: ${p.eia_stage}${p.eia_date ? ` (${p.eia_date})` : ''}`, p.eia_group === 'done' ? OW.css('--ow-green') : p.eia_group === 'draft' ? OW.css('--ow-sky') : p.eia_group === 'need' ? OW.css('--ow-orange') : OW.css('--ow-slate')));
      if (p.auction) p.auction.split(' · ').forEach((a) => tags.append(chip('ow-tag', a, OW.css('--ow-amber'))));
      String(p.change_tags || '').split(', ').filter(Boolean).forEach((t) => tags.append(chip('ow-tag', t, /반납|취소/.test(t) ? OW.css('--ow-red') : /양수|주식/.test(t) ? OW.css('--ow-violet') : OW.css('--ow-slate'))));
      if (tags.childElementCount) td.append(tags);
      const recent = String(p.history || '').split(' / ').filter(Boolean).slice(-2).reverse().join(' / ');
      td.append(E('div', 'ow-hist', recent || '최초 허가'));
    } },
  ];
};

OW.listRows = () => {
  const d = dash.data('proj_status');
  const prm = dash.params();
  return d.status === 'ok' ? d.data.filter((p) => OW.passes(p, prm)) : [];
};
dash.draw('ptable', (tb) => {
  const prm = dash.params();
  const rows = OW.listRows();
  OW.tbody(tb, rows, 'permit_no', OW.projCols(), OW.LIMIT);
  tb.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('is-picked', tr.dataset.key === prm.pick));
});
dash.draw('pcount', (n) => {
  const d = dash.data('proj_status');
  if (d.status !== 'ok') { n.textContent = '—'; return; }
  const rows = d.data.filter((p) => OW.passes(p, dash.params()));
  n.textContent = `${OW.fi(rows.length)}건 · ${OW.mw(d3.sum(rows, (p) => p.capacity_mw))} MW${rows.length > OW.LIMIT ? ` (${OW.fi(OW.LIMIT)}건씩 나눠 표시)` : ''}`;
});

// ---- revocations ----
dash.draw('revsrc', (el) => {
  if (OW.pending(el, 'rev_by_source')) return;
  el.replaceChildren();
  const D = OW.rows('rev_by_source');
  const keys = [['revoked', '최종 취소', OW.css('--ow-red')], ['hearing', '청문 진행', OW.css('--ow-amber')], ['surrendered', '자진 반납', OW.css('--cds-chart-muted')]];
  const W = Math.max(260, el.clientWidth), bh = 24, gap = 10, H = D.length * (bh + gap);
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const lw = d3.max(D, (d) => OW.measure(svg, d.source)) + 12;
  const x = d3.scaleLinear([0, d3.max(D, (d) => d.total) || 1], [0, W - lw - 40]);
  const g = svg.selectAll('g').data(D).join('g').attr('class', 'ow-bar is-click').attr('transform', (d, i) => `translate(0,${i * (bh + gap)})`);
  g.append('text').attr('class', 'ow-tick').attr('x', lw - 8).attr('y', bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end').text((d) => d.source);
  keys.forEach(([k, , c], i) => {
    g.append('rect').attr('height', bh).attr('rx', 2).style('fill', c)
      .attr('x', (d) => lw + x(keys.slice(0, i).reduce((s, [kk]) => s + d[kk], 0))).attr('width', (d) => x(d[k]));
  });
  g.append('text').attr('class', 'ow-tick ow-bval').attr('x', (d) => lw + x(d.total) + 6).attr('y', bh / 2).attr('dy', '0.35em').text((d) => `${OW.fi(d.total)}건`);
  const t = OW.tip(el);
  g.on('mousemove', (ev, d) => t.show(d.source, keys.map(([k, l, c]) => ({ label: l, value: `${OW.fi(d[k])}건`, color: c })), ev)).on('mouseleave', () => t.hide())
    .on('click', (ev, d) => { const t = OW.tabOf(d.source); dash.setParams({ src: dash.params().src === t ? null : t }); });
});
dash.draw('revreason', (el) => {
  if (OW.pending(el, 'rev_by_reason')) return;
  OW.hbars(el, OW.rows('rev_by_reason'), { label: (d) => d.reason, value: (d) => d.count, color: () => OW.css('--ow-red'), fmt: (d) => `${OW.fi(d.count)}건` });
});
dash.draw('rtable', (tb) => {
  const prm = dash.params();
  const rows = OW.rows('rev_by_permit').filter((r) => (!prm.src || OW.tabOf(r.source) === prm.src) && OW.qhit(r, ['permit_no', 'project_name', 'company', 'region', 'source', 'reason']));
  const col = (r) => (r.stage_code === 'revoked' ? OW.css('--ow-red') : r.stage_code === 'hearing' ? OW.css('--ow-amber') : OW.css('--cds-chart-muted'));
  OW.tbody(tb, rows, 'permit_no', [
    { f: 'permit_no', cls: 'ow-mono' },
    { f: 'stage', badge: col },
    { f: 'source', badge: (r) => OW.srcColor(r.source) },
    { f: 'project_name', cls: 'ow-wrap ow-strong' },
    { f: 'company', cls: 'ow-hide-s' },
    { f: 'region', pill: true },
    { f: 'capacity_mw', fmt: (r) => OW.mw(r.capacity_mw), cls: 'ow-num ow-strong' },
    { f: 'reason', cls: 'ow-hide-s' },
    { f: 'last_notice' },
    { f: 'hearing', cls: 'ow-hide-s ow-wrap' },
  ]);
  const known = new Set(OW.rows('proj_status').map((p) => p.permit_no));
  tb.querySelectorAll('tr').forEach((tr) => tr.classList.toggle('no-pick', !known.has(tr.dataset.key)));
});

// ---- operating farms, agendas, snapshot ----
dash.draw('otable', (tb) => {
  const prm = dash.params();
  const rows = OW.rows('ops_all').filter((r) => (!prm.src || r.tab === prm.src) && OW.qhit(r, ['name', 'region', 'turbine', 'spc', 'authority']));
  const max = d3.max(rows, (r) => r.capacity_mw) || 1;
  OW.tbody(tb, rows, 'name', [
    { f: 'name', cls: 'ow-wrap' },
    { f: 'region', pill: true },
    { f: 'capacity_mw', fmt: (r) => OW.mw(r.capacity_mw), bar: (r) => r.capacity_mw / max, cls: 'ow-num', color: () => OW.css('--ow-teal') },
    { f: 'turbine', cls: 'ow-wrap' },
    { f: 'turbines', cls: 'ow-num' },
    { f: 'turbine_origin', badge: (r) => (/국산/.test(r.turbine_origin) ? OW.css('--ow-blue') : OW.css('--ow-orange')) },
    { f: 'permit' },
    { f: 'cod', badge: () => OW.css('--ow-green') },
    { f: 'dev_years', fmt: (r) => (r.dev_years == null ? null : OW.f1(r.dev_years)), cls: 'ow-num', badge: () => '#4338ca' },
    { f: 'authority', cls: 'ow-hide-s' },
    { f: 'spc', cls: 'ow-hide-s ow-wrap' },
  ]);
});
dash.draw('atable', (tb) => {
  const prm = dash.params();
  const rows = OW.rows('agendas').filter((a) => (!prm.src || OW.agTab(a.title) === prm.src) && OW.qhit(a, ['title', 'session', 'date', 'result', 'summary']));
  OW.tbody(tb, rows, 'id', [
    { f: 'date' },
    { f: 'session' },
    { f: 'type', cls: 'ow-hide-s' },
    { f: 'title', cls: 'ow-wrap' },
    { f: 'result', badge: (a) => (/취소/.test(a.result) ? OW.css('--ow-red') : /보류|조건부/.test(a.result) ? OW.css('--ow-amber') : /보고/.test(a.result) ? OW.css('--ow-slate') : OW.css('--ow-green')) },
    { f: 'summary', cls: 'ow-hide-s ow-wrap ow-small' },
  ]);
});
dash.draw('stable', (tb) => { OW.tbody(tb, OW.rows('snapshot'), 'item', [{ f: 'item' }, { f: 'value' }]); });
