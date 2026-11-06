// ---- calculations (readers see each fn in Sources) ----
dash.calc('proj_status', {
  inputs: ['projects', 'snapshot', 'auctions', 'eia'],
  title: '사업별 다음 기한·상태',
  description: '기준일과 공사계획인가 기한·준비기간(준공기한)으로 다음 기한, 남은 일수, 기한 상태를 구하고, 경쟁입찰 선정 이력을 붙입니다.',
  fn: (projects, snapshot, auctions, eia) => {
    const env = {};
    for (const e of eia) env[e.permit_no] = e;
    const won = {};
    for (const a of auctions) (won[a.permit_no] ||= []).push(`${a.round} 입찰 선정`);
    const ref = (snapshot.find((r) => r.item === '기준일') || {}).value;
    const t0 = Date.parse(ref + 'T00:00:00Z');
    return projects.map((p) => {
      const ended = p.stage === '허가반납/종결' || p.stage === '허가취소 확정' || String(p.stage).startsWith('기한 만료');
      const done = p.stage === '준공/상업운전';
      const unsure = String(p.stage).startsWith('준비기간 경과');
      const main = ['해상풍력', '육상풍력', '태양광', '연료전지'];
      const useConst = p.stage === '공사계획인가 진행' && p.const_deadline;
      const next = ended || done || unsure ? '' : useConst ? p.const_deadline : p.prep_deadline;
      const days = next ? Math.round((Date.parse(next + 'T00:00:00Z') - t0) / 86400000) : null;
      const status = ended ? '종결' : done ? '준공' : unsure ? '확인 필요' : days == null ? '기한 미확인'
        : days < 0 ? '기한 경과' : days <= 365 ? '1년 이내' : '정상';
      return { ...p, next_deadline: next, next_type: next ? (useConst ? '공사계획인가' : '준비기간(준공)') : '',
        days_left: days, deadline_status: status, active: ended ? 0 : 1, tab: main.includes(p.source) ? p.source : '기타',
        auction: (won[p.permit_no] || []).join(' · '),
        eia_stage: env[p.permit_no] ? env[p.permit_no].eia_stage : '',
        eia_group: env[p.permit_no] ? env[p.permit_no].eia_group : '',
        eia_date: env[p.permit_no] ? env[p.permit_no].eia_date : '',
        eia_name: env[p.permit_no] ? env[p.permit_no].eia_name : '',
        const_days: p.const_deadline ? Math.round((Date.parse(p.const_deadline + 'T00:00:00Z') - t0) / 86400000) : null,
        prep_days: p.prep_deadline ? Math.round((Date.parse(p.prep_deadline + 'T00:00:00Z') - t0) / 86400000) : null };
    });
  },
});

dash.calc('kpi', {
  inputs: ['proj_status', 'operating'],
  title: '핵심 지표',
  description: '발전원마다 유효 허가(반납·취소 제외) 건수와 용량, 상업운전 확인 단지, 기한 상태별 건수를 셉니다.',
  fn: (proj_status, operating) => {
    const sum = (rows, f) => rows.reduce((s, r) => s + (Number(r[f]) || 0), 0);
    const r1 = (x) => Math.round(x * 10) / 10;
    return ['전체', '해상풍력', '육상풍력', '태양광', '연료전지', '기타'].map((src) => {
      const rows = src === '전체' ? proj_status : proj_status.filter((p) => p.tab === src);
      const act = rows.filter((p) => p.active === 1);
      const end = rows.filter((p) => p.active === 0);
      const farms = src === '전체' || src === '해상풍력' ? operating : [];
      const built = rows.filter((p) => p.stage === '준공/상업운전' && p.source !== '해상풍력');
      return {
        src,
        total: rows.length,
        active_count: act.length,
        active_gw: r1(sum(act, 'capacity_mw') / 1000),
        operating_count: farms.length + built.length,
        operating_mw: r1(sum(farms, 'capacity_mw') + sum(built, 'capacity_mw')),
        overdue: act.filter((p) => p.deadline_status === '기한 경과').length,
        due_1y: act.filter((p) => p.deadline_status === '1년 이내').length,
        unsure: act.filter((p) => p.deadline_status === '확인 필요').length,
        changed: rows.filter((p) => p.operator_changed === '예').length,
        ended_count: end.length,
        ended_gw: r1(sum(end, 'capacity_mw') / 1000),
        ended_surrendered: end.filter((p) => p.stage === '허가반납/종결').length,
        ended_revoked: end.filter((p) => p.stage === '허가취소 확정').length,
        ended_expired: end.filter((p) => String(p.stage).startsWith('기한 만료')).length,
        turbines: sum(farms, 'turbines'),
      };
    });
  },
});

dash.calc('ops_all', {
  inputs: ['operating', 'proj_status'],
  title: '상업운전 확인 단지',
  description: '해상풍력 가동 단지 표에, 허가대장 비고로 상업운전이 확인된 다른 발전원 허가를 더합니다.',
  fn: (operating, proj_status) => [
    ...operating.map((r) => ({ ...r, tab: '해상풍력' })),
    ...proj_status.filter((p) => p.stage === '준공/상업운전' && p.source !== '해상풍력').map((p) => ({
      name: p.project_name, region: p.region, capacity_mw: p.capacity_mw, permit: p.permit_date, spc: p.operator,
      authority: '전기위원회', tab: p.tab,
    })),
  ],
});

dash.calc('by_stage', {
  inputs: ['proj_status'],
  title: '진행 단계별 건수·용량',
  description: '허가대장 기준 진행 단계마다 사업 수와 설비용량(MW)을 합칩니다.',
  fn: (proj_status) => {
    const order = ['준공/상업운전', '착공/공사계획인가', '착공/준비기간 진행', '공사계획인가 진행', '준비기간 경과(준공 여부 미확인)', '기한 만료(허가대장 미갱신)', '허가취소 확정', '허가반납/종결'];
    return ['전체', '해상풍력', '육상풍력', '태양광', '연료전지', '기타'].flatMap((src) => order.map((stage) => {
      const r = proj_status.filter((p) => p.stage === stage && (src === '전체' || p.tab === src));
      return { src, stage, count: r.length, mw: Math.round(r.reduce((s, p) => s + p.capacity_mw, 0) * 10) / 10 };
    }).filter((r) => r.count > 0));
  },
});

dash.calc('by_region', {
  inputs: ['proj_status'],
  title: '광역지역별 용량',
  description: '광역지역마다 유효 허가 용량과 종결(반납·취소) 용량을 합칩니다.',
  fn: (proj_status) => {
    return ['전체', '해상풍력', '육상풍력', '태양광', '연료전지', '기타'].flatMap((src) => {
      const g = {};
      for (const p of proj_status) {
        if (src !== '전체' && p.tab !== src) continue;
        const r = (g[p.region] ||= { src, region: p.region, active_count: 0, active_mw: 0, ended_mw: 0 });
        if (p.active === 1) { r.active_count += 1; r.active_mw += p.capacity_mw; } else r.ended_mw += p.capacity_mw;
      }
      return Object.values(g).map((r) => ({ ...r, active_mw: Math.round(r.active_mw * 10) / 10, ended_mw: Math.round(r.ended_mw * 10) / 10 }))
        .sort((a, b) => b.active_mw - a.active_mw);
    });
  },
});

dash.calc('by_year', {
  inputs: ['proj_status'],
  title: '허가 연도별 용량',
  description: '최초 허가 연도마다 지금도 유효한 용량과 이후 종결된 용량을 나눠 합칩니다.',
  fn: (proj_status) => {
    return ['전체', '해상풍력', '육상풍력', '태양광', '연료전지', '기타'].flatMap((src) => {
      const g = {};
      for (const p of proj_status) {
        if ((src !== '전체' && p.tab !== src) || !p.permit_year) continue;
        const r = (g[p.permit_year] ||= { src, year: p.permit_year, active_count: 0, active_mw: 0, ended_count: 0, ended_mw: 0 });
        if (p.active === 1) { r.active_count += 1; r.active_mw += p.capacity_mw; } else { r.ended_count += 1; r.ended_mw += p.capacity_mw; }
      }
      return Object.values(g).map((r) => ({ ...r, active_mw: Math.round(r.active_mw * 10) / 10, ended_mw: Math.round(r.ended_mw * 10) / 10 }))
        .sort((a, b) => a.year - b.year);
    });
  },
});

dash.calc('top_ops', {
  inputs: ['proj_status'],
  title: '사업자별 유효 허가 용량',
  description: '현재 사업자마다 유효 허가 용량을 합쳐 상위 12곳을 고릅니다.',
  fn: (proj_status) => {
    return ['전체', '해상풍력', '육상풍력', '태양광', '연료전지', '기타'].flatMap((src) => {
      const g = {};
      for (const p of proj_status.filter((x) => x.active === 1 && (src === '전체' || x.tab === src))) {
        const r = (g[p.operator] ||= { src, operator: p.operator, count: 0, mw: 0 });
        r.count += 1; r.mw += p.capacity_mw;
      }
      return Object.values(g).map((r) => ({ ...r, mw: Math.round(r.mw * 10) / 10 })).sort((a, b) => b.mw - a.mw).slice(0, 12);
    });
  },
});

dash.calc('rev_by_permit', {
  inputs: ['revocations'],
  title: '취소·청문 허가별 최종 단계',
  description: '같은 허가가 청문 공고와 취소 공고에 함께 실린 경우를 하나로 묶고, 가장 나중 단계를 남깁니다.',
  fn: (revocations) => {
    const rank = { hearing: 1, revoked: 2, surrendered: 2 };
    const g = {};
    for (const r of revocations) {
      const cur = g[r.permit_no];
      const notices = (cur ? cur.notices : 0) + 1;
      if (!cur || rank[r.stage_code] > rank[cur.stage_code] || (rank[r.stage_code] === rank[cur.stage_code] && r.notice_date > cur.last_notice))
        g[r.permit_no] = { permit_no: r.permit_no, project_name: r.project_name, company: r.company, source: r.source,
          region: r.region, capacity_mw: r.capacity_mw, stage: r.stage, stage_code: r.stage_code, reason: r.reason,
          permit_date: r.permit_date, last_notice: r.notice_date, hearing: r.hearing, notices };
      else cur.notices = notices;
    }
    return Object.values(g).sort((a, b) => String(b.last_notice).localeCompare(String(a.last_notice)));
  },
});

dash.calc('rev_kpi', {
  inputs: ['rev_by_permit'],
  title: '취소·청문 요약',
  description: '허가 단위(중복 제거)로 최종 취소·청문 진행·반납 건수를 셉니다.',
  fn: (rev_by_permit) => {
    const c = (f) => rev_by_permit.filter(f).length;
    return [{
      permits: rev_by_permit.length,
      revoked: c((r) => r.stage_code === 'revoked'),
      hearing: c((r) => r.stage_code === 'hearing'),
      surrendered: c((r) => r.stage_code === 'surrendered'),
      offshore: c((r) => r.source === '해상풍력'),
      offshore_surrendered: c((r) => r.source === '해상풍력' && r.stage_code === 'surrendered'),
      offshore_revoked: c((r) => r.source === '해상풍력' && r.stage_code === 'revoked'),
      onshore: c((r) => r.source === '육상풍력'),
      offshore_mw: Math.round(rev_by_permit.filter((r) => r.source === '해상풍력').reduce((s, r) => s + r.capacity_mw, 0) * 10) / 10,
    }];
  },
});

dash.calc('rev_by_source', {
  inputs: ['rev_by_permit'],
  title: '발전원별 취소·청문',
  description: '발전원마다 최종 단계(청문 진행·취소·반납)별 허가 수를 셉니다.',
  fn: (rev_by_permit) => {
    const g = {};
    for (const r of rev_by_permit) {
      const x = (g[r.source] ||= { source: r.source, hearing: 0, revoked: 0, surrendered: 0, total: 0 });
      x[r.stage_code] += 1; x.total += 1;
    }
    return Object.values(g).sort((a, b) => b.total - a.total);
  },
});

dash.calc('rev_by_reason', {
  inputs: ['rev_by_permit'],
  title: '처분 사유별 건수',
  description: '허가 단위로 처분 사유마다 건수를 셉니다.',
  fn: (rev_by_permit) => {
    const g = {};
    for (const r of rev_by_permit) { const x = (g[r.reason] ||= { reason: r.reason, count: 0 }); x.count += 1; }
    return Object.values(g).sort((a, b) => b.count - a.count);
  },
});

// ---- shared helpers ----
window.OW = (() => {
  const css = (v) => `var(${v})`;
  const statusColor = (s) => ({
    '기한 경과': css('--ow-orange'),
    '1년 이내': css('--ow-amber'),
    '정상': css('--ow-green'),
    '준공': css('--ow-blue'),
    '최종 취소': css('--ow-red'),
    '청문 진행': css('--ow-amber'),
  }[s] || css('--cds-chart-muted'));
  const stageColor = (s) => (/반납|종결|미확인/.test(s) ? css('--cds-chart-muted') : /취소/.test(s) ? css('--ow-red') : /만료/.test(s) ? css('--ow-orange') : /^준공/.test(s) ? css('--ow-green') : /^착공/.test(s) ? css('--ow-teal') : css('--ow-blue'));
  const ink = (c) => `color-mix(in srgb, ${c} 72%, var(--color-fg))`;
  const tint = (c) => `color-mix(in srgb, ${c} 12%, transparent)`;
  const srcColor = (s) => ({ '해상풍력': css('--ow-blue'), '육상풍력': css('--ow-green'), '연료전지': css('--ow-violet'), '태양광': css('--ow-amber'), '바이오매스': css('--ow-teal') }[s] || css('--cds-chart-muted'));
  const f1 = d3.format(',.1f');
  const fi = d3.format(',');
  const mw = (x) => f1(Number(x) || 0);
  const day = (s) => (s ? new Date(s + 'T00:00:00Z') : null);
  const dday = (n) => (n == null ? '–' : n < 0 ? `D+${fi(-n)}` : `D-${fi(n)}`);
  const short = (name) => String(name || '').replace(/\s*\(.*$/, '').trim() || String(name || '');
  const ok = (...ids) => ids.every((id) => dash.data(id).status === 'ok');
  const failed = (...ids) => ids.some((id) => ['error', 'connect', 'declined', 'missing'].includes(dash.data(id).status));
  const rows = (id) => (dash.data(id).status === 'ok' ? dash.data(id).data : []);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fail = (box) => { box.replaceChildren(); const m = el('div', 'ow-fail'); m.append(el('span', 'ow-dot'), el('span', null, 'Failed to load')); box.append(m); };
  const pending = (box, ...ids) => {
    if (failed(...ids)) { fail(box); box.classList.remove('dash-skeleton'); return true; }
    if (!ok(...ids)) { box.replaceChildren(); box.textContent = ''; box.classList.add('dash-skeleton'); return true; }
    box.classList.remove('dash-skeleton');
    return false;
  };
  const tip = (box) => {
    let t = box.querySelector(':scope > .ow-tip');
    if (!t) { t = el('div', 'ow-tip'); box.append(t); }
    return {
      show(head, lines, ev) {
        t.replaceChildren(el('div', 'ow-tip-h', head), ...lines.map((l) => {
          const r = el('div', 'ow-tip-r');
          if (l.color) { const s = el('span', 'ow-sw'); s.style.background = l.color; r.append(s); }
          r.append(el('span', null, l.label), el('b', null, l.value));
          return r;
        }));
        t.style.display = 'block';
        const b = box.getBoundingClientRect();
        let x = ev.clientX - b.left + 12, y = ev.clientY - b.top + 12;
        const w = t.offsetWidth, h = t.offsetHeight;
        if (x + w > b.width) x = Math.max(0, ev.clientX - b.left - w - 12);
        if (y + h > b.height) y = Math.max(0, ev.clientY - b.top - h - 12);
        t.style.left = x + 'px'; t.style.top = y + 'px';
      },
      hide() { t.style.display = 'none'; },
    };
  };
  const qhit = (r, fields) => {
    const q = String(dash.params().q || '').toLowerCase();
    return !q || fields.map((f) => r[f] ?? '').join(' ').toLowerCase().includes(q);
  };
  const src = () => dash.params().src || '전체';
  const tabOf = (s) => (['해상풍력', '육상풍력', '태양광', '연료전지'].includes(s) ? s : '기타');
  const agTab = (t) => { const s = String(t || ''); return /해상/.test(s) ? '해상풍력' : /풍력/.test(s) ? '육상풍력' : /태양/.test(s) ? '태양광' : /연료전지/.test(s) ? '연료전지' : '기타'; };
  const bySrc = (id) => rows(id).filter((r) => r.src === src());
  const passes = (p, prm) => {
    if (prm.src && p.tab !== prm.src) return false;
    if (prm.region && p.region !== prm.region) return false;
    if (prm.stage && p.stage !== prm.stage) return false;
    if (prm.dl && p.deadline_status !== prm.dl) return false;
    if (prm.chg && p.operator_changed !== prm.chg) return false;
    if (prm.q) {
      const hay = `${p.permit_no} ${p.project_name} ${p.operator} ${p.initial_operator} ${p.region} ${p.region_local} ${p.location}`.toLowerCase();
      if (!hay.includes(String(prm.q).toLowerCase())) return false;
    }
    return true;
  };
  const measure = (svg, text, cls) => {
    const t = svg.append('text').attr('class', cls || 'ow-tick').text(text);
    const w = t.node().getComputedTextLength(); t.remove(); return w;
  };
  return { agTab, qhit, src, tabOf, bySrc, statusColor, stageColor, ink, tint, srcColor, mw, fi, f1, day, dday, short, ok, rows, el, pending, tip, passes, measure, css };
})();

// generic number / text drawings
dash.draw('kv', (el) => {
  const src = el.dataset.source, d = dash.data(src);
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  let row = d.data[Number(el.dataset.row || 0)] || {};
  if (row.src) {
    row = d.data.find((r) => r.src === OW.src()) || {};
    delete el.dataset.row;
    el.dataset.where = `src=${encodeURIComponent(OW.src())}`;
  }
  const v = row[el.dataset.field];
  el.textContent = v == null ? '—' : el.dataset.fmt === 'mw' ? OW.mw(v) : el.dataset.fmt === 'f1' ? OW.f1(v) : OW.fi(v);
});
dash.draw('srcn', (el) => {
  const d = dash.data('kpi');
  const key = decodeURIComponent((el.dataset.where || '').split('=')[1] || '');
  const r = d.status === 'ok' ? d.data.find((x) => x.src === key) : null;
  el.textContent = r ? `${OW.fi(r.total)}건` : '—';
});
dash.draw('srcname', (el) => { const s = OW.src(); el.textContent = s === '전체' ? '전체 발전원' : s; });
dash.draw('snap', (el) => {
  const d = dash.data('snapshot');
  if (d.status !== 'ok') { el.textContent = '—'; return; }
  const key = decodeURIComponent((el.dataset.where || '').split('=')[1] || '');
  const r = d.data.find((x) => x.item === key);
  el.textContent = r ? r.value : '—';
});
