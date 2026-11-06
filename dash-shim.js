// A small stand-in for the page runtime: loads data/*.json, runs the calculations and redraws the page.
(() => {
  const FILES = {
    projects: 'offshore_projects.json', revocations: 'revocations.json', agendas: 'agendas.json',
    rev_agendas: 'revocation_agendas.json', pipeline: 'construction_pipeline.json', committee: 'committee.json',
    ledger_sources: 'ledger_by_source.json', snapshot: 'snapshot.json', operating: 'operating_farms.json',
    coast: 'korea_coast.json', auctions: 'offshore_auctions.json', eia: 'offshore_eia.json',
  };
  const store = {}, calcs = {}, memo = {}, draws = {}, listeners = [], made = new WeakMap();
  let params = {}, ready = false, queued = false;

  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

  const result = (id) => {
    if (id in calcs) {
      if (!ready) return { status: 'loading', data: [] };
      if (!(id in memo)) {
        const args = calcs[id].inputs.map((x) => result(x));
        if (args.some((a) => a.status !== 'ok')) return { status: 'error', data: [] };
        memo[id] = calcs[id].fn(...args.map((a) => a.data));
      }
      return { status: 'ok', data: memo[id] };
    }
    return store[id] || { status: ready ? 'missing' : 'loading', data: [] };
  };

  const render = () => {
    queued = false;
    listeners.forEach((fn) => fn());
    document.querySelectorAll('[data-draw]').forEach((el) => {
      if (!el.closest('[hidden]')) run(el);
    });
  };
  const schedule = () => { if (!queued) { queued = true; requestAnimationFrame(render); } };

  const run = (el) => {
    const d = draws[el.dataset.draw];
    if (!d) return;
    if (typeof d === 'function') { d(el); return; }
    if (!made.has(el)) { el.replaceChildren(); made.set(el, d.mount ? d.mount(el) : undefined); }
    if (d.update) d.update(el, made.get(el));
  };

  window.dash = {
    colors: ['#2f6fed', '#0d9488', '#16a34a', '#ea580c', '#7c3aed', '#d99a06', '#dc2626', '#64748b'],
    data: (id) => result(id),
    onData: (fn) => { listeners.push(fn); if (ready) fn(); },
    calc: (id, def) => { calcs[id] = def; },
    draw: (name, fn) => {
      if (fn) { draws[name] = fn; return; }
      document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => { if (!el.closest('[hidden]')) run(el); });
    },
    params: () => params,
    setParams: (next) => {
      params = { ...params };
      Object.entries(next).forEach(([k, v]) => { if (v == null) delete params[k]; else params[k] = v; });
      schedule();
    },
    resetParams: () => { params = {}; schedule(); },
    setLink: (name) => { history.replaceState(null, '', `#${name}`); },
    refresh: () => {},
  };

  const load = async () => {
    await Promise.all(Object.entries(FILES).map(async ([id, file]) => {
      try {
        const res = await fetch(`data/${file}`, { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        store[id] = { status: 'ok', data: await res.json() };
      } catch (e) {
        store[id] = { status: 'error', data: [] };
      }
    }));
    // the day count always runs from the day the page is opened
    if (store.snapshot.status === 'ok') {
      store.snapshot.data = store.snapshot.data.map((r) => (r.item === '기준일' ? { ...r, value: today() } : r));
    }
    ready = true;
    render();
  };

  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver((records) => {
      if (records.some((r) => (r.oldValue === null) !== (r.target.getAttribute('hidden') === null))) schedule();
    }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true });
    let width = window.innerWidth, t;
    window.addEventListener('resize', () => {
      if (window.innerWidth === width) return;
      width = window.innerWidth;
      clearTimeout(t);
      t = setTimeout(schedule, 150);
    });
    schedule();
    load();
  });
})();
