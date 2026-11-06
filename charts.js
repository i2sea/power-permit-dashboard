// ---- map of permit areas ----
dash.draw('map', {
  mount: (el) => ({ zt: d3.zoomIdentity }),
  update: (el, st) => {
    if (OW.pending(el, 'proj_status', 'coast')) return;
    el.replaceChildren();
    const P = OW.rows('proj_status'), C = OW.rows('coast'), prm = dash.params();
    const W = Math.max(280, el.clientWidth), H = Math.round(Math.min(640, Math.max(360, W * 0.92)));
    const lon0 = 124.3, lon1 = 130.9, lat0 = 33.0, lat1 = 38.75;
    const my = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    const rad = (d) => (d * Math.PI) / 180;
    const k = Math.min(W / rad(lon1 - lon0), H / (my(lat1) - my(lat0)));
    const ox = (W - k * rad(lon1 - lon0)) / 2, oy = (H - k * (my(lat1) - my(lat0))) / 2;
    const proj = ([lon, lat]) => [ox + k * rad(lon - lon0), oy + k * (my(lat1) - my(lat))];
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'ow-map');
    const g = svg.append('g');
    g.append('g').selectAll('path').data(C).join('path').attr('class', 'ow-land')
      .attr('d', (r) => 'M' + JSON.parse(r.ring).map(proj).map((q) => q.map((v) => v.toFixed(1)).join(',')).join('L') + 'Z');
    const pts = P.filter((p) => p.lon != null).sort((a, b) => b.capacity_mw - a.capacity_mw);
    const rS = d3.scaleSqrt([0, d3.max(pts, (p) => p.capacity_mw) || 1], [2, Math.max(8, W / 55)]);
    const dim = (p) => !OW.passes(p, prm);
    g.append('g').selectAll('path').data(pts.filter((p) => p.polygon)).join('path').attr('class', 'ow-area')
      .attr('d', (p) => { const q = JSON.parse(p.polygon).map(proj); const h = d3.polygonHull ? d3.polygonHull(q) || q : q; return 'M' + h.join('L') + 'Z'; })
      .style('fill', (p) => OW.statusColor(p.deadline_status)).style('stroke', (p) => OW.statusColor(p.deadline_status))
      .style('opacity', (p) => (dim(p) ? 0.08 : 0.35));
    const dots = g.append('g').selectAll('circle').data(pts).join('circle').attr('class', 'ow-pt')
      .attr('cx', (p) => proj([p.lon, p.lat])[0]).attr('cy', (p) => proj([p.lon, p.lat])[1])
      .style('fill', (p) => OW.statusColor(p.deadline_status))
      .style('opacity', (p) => (dim(p) ? 0.15 : 0.85))
      .classed('is-picked', (p) => p.permit_no === prm.pick);
    const tip = OW.tip(el);
    dots.on('mousemove', (ev, p) => tip.show(`${p.permit_no} · ${OW.short(p.project_name)}`, [
      { label: '사업자', value: p.operator },
      { label: '용량', value: `${OW.mw(p.capacity_mw)} MW` },
      { label: '단계', value: p.stage },
      { label: p.next_type || '기한', value: p.next_deadline ? `${p.next_deadline} (${OW.dday(p.days_left)})` : p.deadline_status, color: OW.statusColor(p.deadline_status) },
    ], ev)).on('mouseleave', () => tip.hide())
      .on('click', (ev, p) => dash.setParams({ pick: p.permit_no === prm.pick ? null : p.permit_no }));
    const apply = (t) => {
      st.zt = t; g.attr('transform', t);
      dots.attr('r', (p) => rS(p.capacity_mw) / Math.sqrt(t.k)).attr('stroke-width', 1 / t.k);
      g.selectAll('.ow-land').attr('stroke-width', 0.6 / t.k);
      g.selectAll('.ow-area').attr('stroke-width', 1 / t.k);
    };
    if (d3.zoom) {
      const z = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [W, H]]).on('zoom', (ev) => apply(ev.transform));
      svg.call(z).on('dblclick.zoom', null);
      svg.call(z.transform, st.zt);
      el.querySelectorAll('.ow-zoom').forEach((b) => b.remove());
      const bar = OW.el('div', 'ow-zoom');
      const mk = (label, fn) => { const b = OW.el('button', 'ow-zbtn', label); b.type = 'button'; b.onclick = fn; bar.append(b); };
      mk('+', () => svg.transition().call(z.scaleBy, 1.8));
      mk('−', () => svg.transition().call(z.scaleBy, 1 / 1.8));
      mk('⟲', () => svg.transition().call(z.transform, d3.zoomIdentity));
      el.append(bar);
    } else apply(d3.zoomIdentity);
    const S = svg.append('g').attr('class', 'ow-scale');
    const [ax] = proj([125, 34]), [bx] = proj([125 + 100 / (111.32 * Math.cos(rad(34))), 34]);
    S.append('line').attr('x1', 12).attr('x2', 12 + (bx - ax)).attr('y1', H - 14).attr('y2', H - 14);
    S.append('text').attr('x', 12).attr('y', H - 20).attr('class', 'ow-tick').text('100 km (확대 전)');
  },
});

// ---- legend swatches take the series colors ----
dash.onData(() => {
  document.querySelectorAll('[data-sw]').forEach((s) => { s.style.background = OW.statusColor(s.dataset.sw); });
});

// ---- horizontal bar helper ----
OW.hbars = (el, data, { label, value, value2, color, color2, fmt, onClick, picked, tipFn }) => {
  el.replaceChildren();
  const W = Math.max(260, el.clientWidth), bh = 22, gap = 8;
  const H = data.length * (bh + gap) + 4;
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const lw = Math.min(W * 0.42, d3.max(data, (d) => OW.measure(svg, label(d))) + 10);
  const vw = d3.max(data, (d) => OW.measure(svg, fmt(d))) + 10;
  const x = d3.scaleLinear([0, d3.max(data, (d) => value(d) + (value2 ? value2(d) : 0)) || 1], [0, Math.max(40, W - lw - vw)]);
  const row = svg.selectAll('g').data(data).join('g').attr('transform', (d, i) => `translate(0,${i * (bh + gap)})`)
    .attr('class', (d) => 'ow-bar' + (onClick ? ' is-click' : '') + (picked && picked(d) ? ' is-picked' : ''));
  row.append('text').attr('class', 'ow-tick ow-blabel').attr('x', lw - 8).attr('y', bh / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
    .text((d) => { let s = label(d); const max = Math.floor((lw - 10) / 7.5); return s.length > max ? s.slice(0, max - 1) + '…' : s; });
  row.append('rect').attr('x', lw).attr('height', bh).attr('rx', 3).attr('width', (d) => Math.max(1, x(value(d)))).style('fill', color);
  if (value2) row.append('rect').attr('x', (d) => lw + x(value(d))).attr('height', bh).attr('rx', 3).attr('width', (d) => x(value2(d))).style('fill', color2);
  row.append('text').attr('class', 'ow-tick ow-bval').attr('x', (d) => lw + x(value(d) + (value2 ? value2(d) : 0)) + 6).attr('y', bh / 2).attr('dy', '0.35em').text(fmt);
  if (tipFn) { const t = OW.tip(el); row.on('mousemove', (ev, d) => t.show(...tipFn(d), ev)).on('mouseleave', () => t.hide()); }
  if (onClick) row.on('click', (ev, d) => onClick(d));
};

dash.draw('stages', (el) => {
  if (OW.pending(el, 'by_stage')) return;
  const muted = OW.css('--cds-chart-muted');
  OW.hbars(el, OW.bySrc('by_stage'), {
    label: (d) => d.stage, value: (d) => d.mw,
    color: (d) => (/반납|종결|미확인/.test(d.stage) ? muted : /취소/.test(d.stage) ? OW.css('--ow-red') : /만료/.test(d.stage) ? OW.css('--ow-orange') : d.stage.startsWith('준공') ? OW.css('--ow-blue') : d.stage.startsWith('착공') ? OW.css('--ow-teal') : OW.css('--ow-green')),
    fmt: (d) => `${OW.fi(d.count)}건 · ${OW.mw(d.mw)} MW`,
    onClick: (d) => dash.setParams({ stage: dash.params().stage === d.stage ? null : d.stage }),
    picked: (d) => dash.params().stage === d.stage,
  });
});

dash.draw('regions', (el) => {
  if (OW.pending(el, 'by_region')) return;
  OW.hbars(el, OW.bySrc('by_region'), {
    label: (d) => d.region, value: (d) => d.active_mw, value2: (d) => d.ended_mw,
    color: () => OW.css('--ow-blue'), color2: () => OW.css('--cds-chart-muted'),
    fmt: (d) => `${OW.mw(d.active_mw)} MW`,
    tipFn: (d) => [d.region, [
      { label: '유효 허가', value: `${OW.fi(d.active_count)}건 · ${OW.mw(d.active_mw)} MW`, color: OW.css('--ow-blue') },
      { label: '종결(반납·취소)', value: `${OW.mw(d.ended_mw)} MW`, color: OW.css('--cds-chart-muted') }]],
    onClick: (d) => dash.setParams({ region: dash.params().region === d.region ? null : d.region }),
    picked: (d) => dash.params().region === d.region,
  });
});

dash.draw('operators', (el) => {
  if (OW.pending(el, 'top_ops')) return;
  OW.hbars(el, OW.bySrc('top_ops'), {
    label: (d) => d.operator, value: (d) => d.mw, color: () => OW.css('--ow-teal'),
    fmt: (d) => `${OW.mw(d.mw)} MW · ${OW.fi(d.count)}건`,
  });
});

dash.draw('years', (el) => {
  if (OW.pending(el, 'by_year')) return;
  el.replaceChildren();
  const D = OW.bySrc('by_year');
  const W = Math.max(280, el.clientWidth), H = 240, m = { t: 12, r: 8, b: 24, l: 8 };
  const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`);
  const ymax = d3.max(D, (d) => d.active_mw + d.ended_mw) || 1;
  const y = d3.scaleLinear([0, ymax], [H - m.b, m.t]).nice();
  const lab = (v) => (v >= 1000 ? `${OW.f1(v / 1000)} GW` : `${OW.fi(v)} MW`);
  m.l = d3.max(y.ticks(4), (v) => OW.measure(svg, lab(v))) + 8;
  const x = d3.scaleBand(D.map((d) => d.year), [m.l, W - m.r]).padding(0.25);
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('class', 'ow-grid').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y);
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('class', 'ow-tick').attr('x', m.l - 6).attr('y', y).attr('dy', '0.35em').attr('text-anchor', 'end').text(lab);
  const step = Math.ceil(D.length / Math.max(1, Math.floor((W - m.l) / 38)));
  svg.append('g').selectAll('text').data(D.filter((d, i) => i % step === 0)).join('text').attr('class', 'ow-tick')
    .attr('x', (d) => x(d.year) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((d) => `'${String(d.year).slice(2)}`);
  const bw = Math.min(32, x.bandwidth()), off = (x.bandwidth() - bw) / 2;
  const gb = svg.append('g').selectAll('g').data(D).join('g').attr('class', 'ow-bar');
  gb.append('rect').attr('x', (d) => x(d.year) + off).attr('width', bw).attr('rx', 2).attr('y', (d) => y(d.active_mw)).attr('height', (d) => y(0) - y(d.active_mw)).style('fill', OW.css('--ow-blue'));
  gb.append('rect').attr('x', (d) => x(d.year) + off).attr('width', bw).attr('rx', 2).attr('y', (d) => y(d.active_mw + d.ended_mw)).attr('height', (d) => y(d.active_mw) - y(d.active_mw + d.ended_mw)).style('fill', OW.css('--cds-chart-muted'));
  gb.append('rect').attr('x', (d) => x(d.year)).attr('width', x.bandwidth()).attr('y', m.t).attr('height', H - m.b - m.t).attr('fill', 'transparent');
  const t = OW.tip(el);
  gb.on('mousemove', (ev, d) => t.show(`${d.year}년 허가`, [
    { label: '지금도 유효', value: `${OW.fi(d.active_count)}건 · ${OW.mw(d.active_mw)} MW`, color: OW.css('--ow-blue') },
    { label: '이후 종결', value: `${OW.fi(d.ended_count)}건 · ${OW.mw(d.ended_mw)} MW`, color: OW.css('--cds-chart-muted') }], ev))
    .on('mouseleave', () => t.hide());
});

// ---- selected project detail ----
dash.draw('detail', (el) => {
  const card = el.closest('.ow-detail-card');
  const hints = card ? card.querySelectorAll('[data-hint]') : [];
  const pick = dash.params().pick;
  const d = dash.data('proj_status');
  const p = d.status === 'ok' && pick ? d.data.find((x) => x.permit_no === pick) : null;
  hints.forEach((h) => { h.hidden = !!p; });
  el.replaceChildren();
  if (!p) { el.textContent = ''; return; }
  const E = OW.el;
  const cite = (node, field) => { node.dataset.source = 'proj_status'; node.dataset.field = field; node.dataset.where = 'permit_no=' + encodeURIComponent(p.permit_no); return node; };
  const head = E('div', 'ow-dhead');
  const st = E('span', 'ow-badge', p.deadline_status); st.style.borderColor = OW.statusColor(p.deadline_status); st.style.color = OW.ink(OW.statusColor(p.deadline_status)); st.style.background = OW.tint(OW.statusColor(p.deadline_status));
  head.append(OW.starBtn(p.permit_no), cite(E('div', 'ow-dtitle', p.project_name), 'project_name'), st);
  const close = E('button', 'ow-x', '닫기'); close.type = 'button'; close.onclick = () => dash.setParams({ pick: null });
  head.append(close);
  const dl = E('dl', 'ow-dl');
  const add = (k, v, field) => { dl.append(E('dt', null, k)); const dd = E('dd', null, v == null || v === '' ? '–' : String(v)); dl.append(field ? cite(dd, field) : dd); };
  add('허가번호', p.permit_no, 'permit_no');
  add('발전원', p.source, 'source');
  if (p.prev_permit_no) add('이전 허가번호', p.prev_permit_no, 'prev_permit_no');
  add('현재 사업자', p.operator, 'operator');
  add('최초 사업자', p.initial_operator, 'initial_operator');
  add('위치', `${p.region} ${p.region_local} · ${p.location}`);
  add('설비용량 (MW)', OW.mw(p.capacity_mw), 'capacity_mw');
  add('진행 단계', p.stage, 'stage');
  add('최초 허가일', p.permit_date, 'permit_date');
  add('공사계획인가 기한', p.const_deadline, 'const_deadline');
  add('준비기간(준공기한)', p.prep_deadline, 'prep_deadline');
  add('다음 기한까지', p.next_deadline ? `${OW.dday(p.days_left)} (${p.next_type})` : '–');
  if (p.auction) add('경쟁입찰', p.auction, 'auction');
  if (p.eia_stage) {
    add('환경영향평가', `${p.eia_stage}${p.eia_date ? ` (${p.eia_date})` : ''}`, 'eia_stage');
    if (p.eia_name) add('평가 사업명', p.eia_name, 'eia_name');
    if (p.eia_note) add('평가 구분', p.eia_note, 'eia_note');
  }
  el.append(head, dl);
  let tl = [];
  try { tl = JSON.parse(p.timeline || '[]'); } catch (e) { tl = []; }
  if (tl.length) {
    el.append(E('div', 'ow-sub', '허가대장 변동 이력'));
    const ol = E('ol', 'ow-tl');
    tl.forEach((t) => {
      const li = E('li');
      li.append(E('span', 'ow-tl-d', t.date || ''), E('b', null, t.remarks || t.step || ''));
      const meta = [t.operator, t.capacity_mw, t.const_plan_period && t.const_plan_period !== '-' ? `인가 ${t.const_plan_period}` : '', t.prep_period ? `준비 ${t.prep_period}` : ''].filter(Boolean).join(' · ');
      li.append(E('span', 'ow-tl-m', meta));
      ol.append(li);
    });
    el.append(ol);
  }
});

// ---- search results on the overview: open a project from here ----
dash.draw('qres', (el) => {
  el.replaceChildren();
  const prm = dash.params();
  if (!prm.q) return;
  const hits = OW.rows('proj_status').filter((p) => OW.passes(p, prm));
  el.append(OW.el('div', 'ow-qres-h', `검색 결과 ${OW.fi(hits.length)}건${hits.length > 30 ? ' (앞의 30건 표시)' : ''}`));
  const box = OW.el('div', 'ow-qres-list');
  hits.slice(0, 30).forEach((p) => {
    const b = OW.el('button', 'ow-qres-i');
    b.type = 'button';
    b.append(OW.el('span', 'ow-pn', p.permit_no), OW.el('span', 'ow-name', p.project_name), OW.el('span', 'ow-lite', `${p.source} · ${OW.mw(p.capacity_mw)} MW · ${p.stage}`));
    b.onclick = () => dash.setParams({ pick: p.permit_no });
    box.append(b);
  });
  el.append(box);
});

dash.draw('nocoord', (el) => {
  const d = dash.data('proj_status');
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  const miss = d.data.filter((p) => p.lon == null && p.source === '해상풍력');
  el.textContent = miss.map((p) => p.permit_no).join(', ') || '없음';
});
