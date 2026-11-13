// app.js - local Learning Space front end (no framework)
const $ = (s, r = document) => r.querySelector(s);
const unent = (s) => String(s == null ? '' : s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TYPE_ICON = {
  assign: 'AS', quiz: 'QZ', forum: 'FO', resource: 'FL', url: 'LN', page: 'PG', book: 'BK',
  folder: 'DR', label: 'LB', h5pactivity: 'H5', panopto: 'VD', attendance: 'AT', choice: 'CH',
  feedback: 'FB', lesson: 'LS', workshop: 'WS', glossary: 'GL', wiki: 'WK', chat: 'CT',
};

let MODEL = null;
let CAL = JSON.parse(localStorage.getItem('ls.calendar') || '[]');

async function load() {
  const r = await fetch('/api/data');
  MODEL = await r.json();
  document.getElementById('sync-note').textContent = MODEL.syncedAt
    ? 'synced ' + new Date(MODEL.syncedAt).toLocaleString()
    : 'not synced yet';
  renderRail();
  route();
}

function renderRail() {
  const list = $('#rail-list');
  if (!MODEL) return;
  list.innerHTML = MODEL.courses.map((c) => `
    <a class="rail-item" href="#/c/${c.id}" data-id="${c.id}" title="${esc(displayName(c))}">
      <span class="chip ${c.code && c.code.startsWith('GAM') ? 'gam' : ''}">${esc(c.code || 'RES')}</span>
      <span class="rail-name">${esc(shortName(c))}</span>
    </a>`).join('');
}

// One name everywhere: the chip carries the code, the year is noise in a list.
function displayName(c) {
  return unent(String(c.name || ''))
    .replace(/\s*\(\d{2}\/\d{2}\)\s*$/g, '')
    .replace(/^(?:COMP|GAM)\d{3}\s*/, '')
    .trim();
}

function shortName(c) { return displayName(c); }

// ---------- views ----------
function viewOverview() {
  const courses = MODEL.courses;
  const avg = courses.length ? Math.round(courses.reduce((a, c) => a + c.progress, 0) / courses.length) : 0;
  return `
  <div class="page-head">
    <div>
      <div class="eyebrow">Learning Space · local</div>
      <h1>My modules</h1>
      <div class="sub">${courses.length} modules · ${MODEL.resources.length} resource spaces · ${avg}% average progress</div>
    </div>
    <div class="head-actions">
      <button type="button" class="btn primary" data-sync>Sync now</button>
      <div class="sync-status" id="sync-status" role="status"></div>
    </div>
  </div>
  ${courses.length ? `<div class="modules">${courses.map(moduleRow).join('')}</div>` : empty('No modules synced yet — press Sync now.')}
  ${MODEL.resources.length ? `<h2 class="section-title">Resource spaces</h2><div class="modules">${MODEL.resources.map(moduleRow).join('')}</div>` : ''}`;
}

function empty(msg) { return `<div class="empty">${esc(msg)}</div>`; }

function moduleRow(c) {
  const code = c.code || 'RES';
  return `
  <a class="module-row" href="#/c/${c.id}">
    <span class="chip ${code.startsWith('GAM') ? 'gam' : ''}">${esc(code)}</span>
    <div class="module-main">
      <div class="module-name" title="${esc(displayName(c))}">${esc(displayName(c))}</div>
      <div class="module-sub">${c.kind === 'resource' ? 'Resource space' : 'Module'}${c.sections.length ? ` · ${c.sections.length} section${c.sections.length === 1 ? '' : 's'}` : ''}${totalItems(c) ? ` · ${totalItems(c)} item${totalItems(c) === 1 ? '' : 's'}` : ''}</div>
    </div>
    ${c.kind === 'resource' ? '' : `<span class="progress">
      <progress class="progress-track" max="100" value="${Math.min(100, Math.max(0, c.progress))}" aria-label="Course progress">${c.progress}%</progress>
      <span class="progress-txt">${c.progress}%</span>
    </span>`}
    <span class="row-go">›</span>
  </a>`;
}

function viewCourse(id) {
  const c = MODEL.courses.concat(MODEL.resources).find((x) => x.id === id);
  if (!c) return empty('Module not found.');
  const weeks = c.sections.filter((s) => s.week);
  const firstWeek = weeks[0];
  const currentWeek = firstWeek ? firstWeek.week : null;
  return `
  <div class="page-head">
    <div class="course-head">
      <span class="chip ${(c.code || '').startsWith('GAM') ? 'gam' : ''}">${esc(c.code || 'RES')}</span>
      <div class="course-title">
        <h1>${esc(displayName(c))}</h1>
        <div class="meta">${c.kind === 'resource' ? 'Resource space' : c.progress + '% complete'} · ${c.sections.length} sections · ${totalItems(c)} items${c.syncedAt ? ' · synced ' + new Date(c.syncedAt).toLocaleDateString() : ''}</div>
      </div>
    </div>
    ${c.kind === 'resource' ? '' : `<div class="progress progress-wide">
      <progress class="progress-track progress-track-lg" max="100" value="${Math.min(100, Math.max(0, c.progress))}" aria-label="Course progress">${c.progress}%</progress>
      <span class="progress-txt">${c.progress}%</span>
    </div>`}
  </div>
  <div class="weekbar">
    <div class="weekbar-now"><span class="wk-eyebrow">${weeks.length ? 'Week' : 'Section'}</span><b id="wk-now">${esc(unent(firstWeek ? firstWeek.title : (c.sections[0] ? c.sections[0].title : '')))}</b></div>
    ${(() => {
      const chips = weeks.length
        ? weeks.map((w, i) => `<button type="button" class="wj${i === 0 ? ' on' : ''}" data-jump="${esc(w.id)}" title="${esc(unent(w.title))}">W${w.week}</button>`)
        : c.sections.map((x, i) => `<button type="button" class="wj${i === 0 ? ' on' : ''}" data-jump="${esc(x.id)}" title="${esc(unent(x.title))}">${esc(unent(stripNum(x.title)) || x.id)}</button>`);
      if (chips.length < 2) return '';
      // A picker is always available (it is the only navigation on phones and on
      // very long spaces); the chip strip covers 2..18 sections on desktop.
      const select = `<label class="week-select-wrap${chips.length > 18 ? ' is-only' : ''}"><span class="sr-label">Jump to section</span>
        <select class="week-select" id="week-select">${c.sections.map((x) => `<option value="${esc(x.id)}"${x.id === (firstWeek ? firstWeek.id : c.sections[0] && c.sections[0].id) ? ' selected' : ''}>${esc(unent(stripNum(x.title)) || x.id)}</option>`).join('')}</select></label>`;
      const strip = `<div class="week-jump${chips.length > 18 ? ' wide-hide' : ''}">${chips.join('')}</div>`;
      return select + strip;
    })()}
    ${totalItems(c) > 40 ? `<input class="week-filter" id="act-filter" type="search" placeholder="Filter ${totalItems(c)} items…" aria-label="Filter activities">
    <div class="filter-status" id="filter-status" role="status" aria-live="polite"></div>` : ''}
    <div class="week-actions"><button type="button" class="btn ghost sm" data-fold="all">Collapse all</button></div>
  </div>
  <div class="weeks">${c.sections.map((x) => sectionBlock(x, currentWeek)).join('') || empty('This space has no captured sections yet.')}</div>`;
}

function totalItems(c) { return c.sections.reduce((a, s) => a + (s.items ? s.items.length : 0), 0); }

function sectionBlock(s, currentWeek) {
  const has = s.items && s.items.length;
  const open = !!(s.week && s.week === currentWeek && has);
  const label = esc(unent(stripNum(s.title)) || 'Section');
  const count = `<span class="count">${has} item${has === 1 ? '' : 's'}</span>`;
  if (!has) {
    // an empty section is a label, not a control: nothing to open, nothing to tab to
    return `
  <section class="week is-empty" id="${esc(s.id)}" data-week="${s.week || ''}" data-title="${esc(s.title || 'Section')}" data-open="false">
    <div class="week-toggle"><span class="caret" aria-hidden="true"></span><span class="week-title">${label}</span>${count}</div>
  </section>`;
  }
  return `
  <section class="week" id="${esc(s.id)}" data-week="${s.week || ''}" data-title="${esc(s.title || 'Section')}" data-open="${open}">
    <button type="button" class="week-toggle" aria-expanded="${open}" aria-controls="${esc(s.id)}-body">
      <span class="caret" aria-hidden="true">▾</span>
      <span class="week-title">${label}</span>
      ${count}
    </button>
    <div class="week-body" id="${esc(s.id)}-body">${s.items.map(activityRow).join('')}</div>
  </section>`;
}

// Moodle prints "0.1 ", "1.2.3 " indexes in front of items; the list already shows the week.
function stripNum(s) {
  return String(s || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*\d+(?:\.\d+)*\s+/, '')
    .trim();
}

function activityRow(a) {
  const type = (a.type || '').replace('modtype_', '');
  const icon = TYPE_ICON[type] || (type ? type.slice(0, 2).toUpperCase() : '•');
  const done = /complete|done|✓/i.test(a.completion || '');
  const url = a.url || '';
  const inner = `<span class="act-ico" aria-hidden="true">${esc(icon)}</span>
    <span class="act-name">${esc(unent(stripNum(a.name)))}</span>
    <span class="act-tags">${done ? '<span class="tag ok">done</span>' : ''}${url ? '<span class="act-open" aria-hidden="true">↗</span>' : ''}</span>`;
  return url
    ? `<a class="activity" href="${esc(url)}" target="_blank" rel="noreferrer">${inner}</a>`
    : `<div class="activity is-static">${inner}</div>`;
}

function viewResources() {
  return `
  <div class="page-head">
    <div>
      <div class="eyebrow">Not a module</div>
      <h1>Resources</h1>
      <div class="sub">Course and resource pages that are not COMP/GAM modules</div>
    </div>
  </div>
  ${MODEL.resources.length ? `<div class="modules">${MODEL.resources.map(moduleRow).join('')}</div>` : empty('Nothing here yet.')}`;
}

function viewModules() {
  return `
  <div class="page-head">
    <div><div class="eyebrow">Everything</div><h1>Modules</h1>
    <div class="sub">${MODEL.courses.length} modules and ${MODEL.resources.length} resource spaces</div></div>
  </div>
  <div class="modules">${MODEL.courses.concat(MODEL.resources).map(moduleRow).join('')}</div>`;
}

function todayIso() {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}
function sortCal() { CAL = CAL.slice().sort((a, b) => (a.iso + (a.time || '')).localeCompare(b.iso + (b.time || ''))); }

function upcoming() {
  const t = todayIso();
  return CAL.filter((e) => e.iso && e.iso >= t);
}

let CAL_MONTH = null;
let CAL_DAY = null;

// the day sheet under the grid: what a tapped/clicked cell reveals
function dayPanel() {
  if (!CAL_DAY) return '<div class="cal-hint">Tap a highlighted day to see its sessions.</div>';
  const evs = CAL.filter((e) => e.iso === CAL_DAY);
  const label = new Date(CAL_DAY + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  if (!evs.length) return `<div class="cal-hint">Nothing on ${esc(label)}.</div>`;
  return `<div class="cal-day-title">${esc(label)}</div>
    ${evs.map((e) => `<div class="next-row"><span class="next-when">${esc(e.time || 'all day')}</span><span class="next-what">${esc(e.summary)}</span></div>`).join('')}`;
}
function monthKey(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }

function monthGrid() {
  const base = CAL_MONTH ? new Date(CAL_MONTH) : new Date();
  const y = base.getFullYear(), mo = base.getMonth();
  const first = new Date(y, mo, 1);
  const startPad = (first.getDay() + 6) % 7;              // Monday-first
  const days = new Date(y, mo + 1, 0).getDate();
  const byDay = {};
  CAL.forEach((e) => { if (e.iso) (byDay[e.iso] = byDay[e.iso] || []).push(e); });
  const today = new Date(); const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const cells = [];
  for (let i = 0; i < startPad; i++) cells.push('<div class="cal-cell is-pad"></div>');
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const evs = byDay[iso] || [];
    const cls = `cal-cell${iso === todayIso ? ' is-today' : ''}${evs.length ? ' has-ev' : ''}${CAL_DAY === iso ? ' is-sel' : ''}`;
    const body = `<span class="cal-day">${d}</span>
      ${evs.slice(0, 3).map((e) => `<span class="cal-ev" title="${esc(e.summary)}">${e.time ? esc(e.time) + ' ' : ''}${esc(e.summary)}</span>`).join('')}
      ${evs.length > 3 ? `<span class="cal-more">+${evs.length - 3} more</span>` : ''}`;
    cells.push(evs.length
      ? `<button type="button" class="${cls}" data-day="${iso}" aria-label="${evs.length} event${evs.length === 1 ? '' : 's'} on ${iso}" aria-expanded="${CAL_DAY === iso}">${body}</button>`
      : `<div class="${cls}">${body}</div>`);
  }
  const label = base.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  return `<div class="cal-head">
      <button type="button" class="btn ghost sm" data-cal-prev aria-label="Previous month">‹</button>
      <b>${esc(label)}</b>
      <button type="button" class="btn ghost sm" data-cal-next aria-label="Next month">›</button>
    </div>
    <div class="cal-grid-head">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span>${d}</span>`).join('')}</div>
    <div class="cal-grid">${cells.join('')}</div>`;
}

function viewCalendar() {
  return `
  <div class="page-head">
    <div><div class="eyebrow">Timetable</div><h1>Calendar</h1>
    <div class="sub">Paste your Falmouth timetable .ics link and it is stored locally</div></div>
  </div>
  <div class="cards2">
    <div class="panel">
      <h2>Import .ics</h2>
      <p class="meta" style="margin:6px 0 12px">Find the feed URL in your timetable export, paste it here.</p>
      <label class="sr-label" for="cal-url">Timetable feed URL</label>
      <input type="url" id="cal-url" placeholder="https://…/timetable.ics" value="${esc(localStorage.getItem('ls.calUrl') || '')}">
      <div style="display:flex;gap:8px;margin-top:10px">
        <button type="button" class="btn primary" id="cal-save">Save feed</button>
        <button type="button" class="btn ghost" id="cal-refresh">Refresh</button>
      </div>
      <div class="meta" id="cal-status" style="margin-top:8px">${CAL.length ? CAL.length + ' events stored' : 'no events yet'}</div>
    </div>
    <div class="panel">
      <h2>Next up</h2>
      ${upcoming().slice(0, 5).map((e) => `<div class="next-row"><span class="next-when">${esc(e.start || '')}</span><span class="next-what">${esc(e.summary || '')}</span></div>`).join('') || '<div class="meta">Nothing scheduled from today onwards.</div>'}
    </div>
  </div>
  <section class="panel cal-panel" aria-label="Month view">${monthGrid()}<div class="cal-day-panel" id="cal-day-panel">${dayPanel()}</div></section>`;
}

// ---------- routing ----------
function route() {
  if (!MODEL) return;
  const hash = location.hash.replace(/^#/, '') || '/';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.remove('on'));
  document.querySelectorAll('.rail-item').forEach((a) => { a.classList.remove('on'); a.removeAttribute('aria-current'); });
  let html = '';
  let nav = 'overview';
  let viewTitle = '';
  if (hash.startsWith('/c/')) {
    const id = hash.slice(3);
    const found = MODEL.courses.concat(MODEL.resources).find((x) => x.id === id);
    viewTitle = found ? displayName(found) : 'Module';
    html = viewCourse(id);
    const rail = document.querySelector(`.rail-item[data-id="${id}"]`);
    if (rail) { rail.classList.add('on'); rail.setAttribute('aria-current', 'page'); }
    nav = '';
  } else if (hash === '/modules') { html = viewModules(); nav = 'modules'; }
  else if (hash === '/resources') { html = viewResources(); nav = 'resources'; }
  else if (hash === '/calendar') { html = viewCalendar(); nav = 'calendar'; }
  else { html = viewOverview(); nav = 'overview'; }
  document.querySelectorAll('#nav a').forEach((a) => {
    const on = nav && a.dataset.nav === nav;
    a.classList.toggle('on', !!on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = hash.startsWith('/c/')
    ? `${(viewTitle || 'Module')} · Learning Space`
    : `${({ '/modules': 'Modules', '/resources': 'Resources', '/calendar': 'Calendar' }[hash] || 'Overview')} · Learning Space`;
  const view = $('#view');
  view.innerHTML = html;
  if (hash.startsWith('/c/')) markWeek();
  bindView();
}

function markWeek() {
  const secs = [...document.querySelectorAll('.week')];
  if (!secs.length) return;
  const now = document.getElementById('wk-now');
  const io = new IntersectionObserver((entries) => {
    const hasWeeks = !!document.querySelector('.week[data-week]:not([data-week=""])');
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const id = e.target.id;
      const isWeek = !!e.target.dataset.week;
      // The label follows the first *week* section; sections like Index/Assessment must not
      // rename it or clear the active week chip.
      if (now && (isWeek || !hasWeeks)) now.textContent = unent(e.target.dataset.title || '');
      const sel = document.getElementById('week-select');
      if (sel && (isWeek || !hasWeeks)) sel.value = id;
      if (isWeek || !hasWeeks) {
        document.querySelectorAll('.wj').forEach((b) => b.classList.toggle('on', b.dataset.jump === id));
      }
      secs.forEach((s) => s.classList.toggle('active', s === e.target));
    }
  }, { rootMargin: '-8% 0px -78% 0px', threshold: 0 });
  secs.forEach((h) => io.observe(h));
}

function syncFoldLabel() {
  const b = document.querySelector('[data-fold="all"]');
  if (!b) return;
  const anyOpen = [...document.querySelectorAll('.week')].some((s) => s.getAttribute('data-open') !== 'false');
  b.textContent = anyOpen ? 'Collapse all' : 'Expand all';
}

function bindView() {
  document.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.jump);
    if (!el) return;
    el.setAttribute('data-open', 'true');
    el.querySelector('.week-toggle')?.setAttribute('aria-expanded', 'true');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    syncFoldLabel();
  }));
  document.querySelectorAll('.week-toggle').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open));
    b.closest('.week').setAttribute('data-open', String(!open));
    syncFoldLabel();
  }));
  syncFoldLabel();
  const filter = document.getElementById('act-filter');
  if (filter) filter.addEventListener('input', () => {
    const q = filter.value.trim().toLowerCase();
    const status = document.getElementById('filter-status');
    let shown = 0;
    document.querySelectorAll('.week').forEach((sec) => {
      if (sec.classList.contains('is-empty')) return;
      const rows = [...sec.querySelectorAll('.activity')];
      let hits = 0;
      rows.forEach((a) => {
        const name = a.querySelector('.act-name').textContent.toLowerCase();
        const show = !q || name.includes(q);
        a.hidden = !show;
        if (show) hits++;
      });
      shown += hits;
      const count = sec.querySelector('.count');
      if (count) count.textContent = q ? `${hits} of ${rows.length}` : `${rows.length} item${rows.length === 1 ? '' : 's'}`;
      if (q) {
        sec.setAttribute('data-open', hits ? 'true' : 'false');
        sec.querySelector('.week-toggle')?.setAttribute('aria-expanded', String(!!hits));
      }
    });
    const total = [...document.querySelectorAll('.week:not(.is-empty)')]
      .reduce((n, sec) => n + sec.querySelectorAll('.activity').length, 0);
    if (status) status.textContent = q ? (shown ? `${shown} of ${total} items` : `No items match “${filter.value.trim()}”`) : '';
    filter.setAttribute('aria-invalid', q && !shown ? 'true' : 'false');
    syncFoldLabel();
  });
  const sel = document.getElementById('week-select');
  if (sel) sel.addEventListener('change', () => {
    const el = document.getElementById(sel.value);
    if (!el) return;
    el.setAttribute('data-open', 'true');
    el.querySelector('.week-toggle')?.setAttribute('aria-expanded', 'true');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const bar = document.querySelector('.weekbar');
  if (bar) document.documentElement.style.setProperty('--weekbar-h', bar.offsetHeight + 'px');
  document.querySelectorAll('[data-fold="all"]').forEach((b) => b.addEventListener('click', () => {
    const secs = [...document.querySelectorAll('.week')];
    const anyOpen = secs.some((s) => s.getAttribute('data-open') !== 'false');
    secs.forEach((s) => {
      s.setAttribute('data-open', String(!anyOpen));
      s.querySelector('.week-toggle')?.setAttribute('aria-expanded', String(!anyOpen));
    });
    b.textContent = anyOpen ? 'Expand all' : 'Collapse all';
  }));
  document.querySelectorAll('[data-sync]').forEach((b) => b.addEventListener('click', sync));
  const save = document.getElementById('cal-save');
  if (save) save.addEventListener('click', () => {
    const v = document.getElementById('cal-url').value.trim();
    localStorage.setItem('ls.calUrl', v);
    document.getElementById('cal-status').textContent = v ? 'feed saved — refresh to pull events' : 'feed cleared';
  });
  document.querySelectorAll('.cal-cell[data-day]').forEach((cell) => {
    const toggle = () => {
      CAL_DAY = cell.dataset.day;
      route();
      const panel = document.getElementById('cal-day-panel');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };
    cell.addEventListener('click', toggle);
    cell.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });
  document.querySelectorAll('[data-cal-prev]').forEach((b) => b.addEventListener('click', () => { CAL_DAY = null; }));
  document.querySelectorAll('[data-cal-next]').forEach((b) => b.addEventListener('click', () => { CAL_DAY = null; }));
  const prev = document.querySelector('[data-cal-prev]');
  const next = document.querySelector('[data-cal-next]');
  if (prev) prev.addEventListener('click', () => {
    const b = CAL_MONTH ? new Date(CAL_MONTH) : new Date();
    CAL_MONTH = new Date(b.getFullYear(), b.getMonth() - 1, 1); route();
  });
  if (next) next.addEventListener('click', () => {
    const b = CAL_MONTH ? new Date(CAL_MONTH) : new Date();
    CAL_MONTH = new Date(b.getFullYear(), b.getMonth() + 1, 1); route();
  });
  const ref = document.getElementById('cal-refresh');
  if (ref) ref.addEventListener('click', refreshCalendar);
}

async function refreshCalendar() {
  const url = localStorage.getItem('ls.calUrl');
  const status = document.getElementById('cal-status');
  if (!url) { status.textContent = 'no feed saved'; return; }
  status.textContent = 'fetching…';
  try {
    const r = await fetch('/api/ics?url=' + encodeURIComponent(url));
    if (!r.ok) { status.textContent = 'feed could not be read (' + r.status + ') — keeping saved events'; return; }
    const text = await r.text();
    if (!/BEGIN:VCALENDAR/i.test(text)) { status.textContent = 'that URL did not return a calendar — keeping saved events'; return; }
    CAL = parseIcs(text);
    sortCal();
    localStorage.setItem('ls.calendar', JSON.stringify(CAL));
    status.textContent = CAL.length + ' events stored';
    route();
  } catch (e) { status.textContent = 'could not read that feed — keeping saved events'; }
}

function parseIcs(text) {
  const out = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const b of blocks) {
    const get = (k) => (b.match(new RegExp('^' + k + '[^:]*:(.*)$', 'm')) || [])[1] || '';
    const dt = get('DTSTART').trim();
    const summary = get('SUMMARY').trim();
    if (!summary) continue;
    const m = dt.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/);
    const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
    out.push({
      summary, iso,
      time: m && m[4] ? `${m[4]}:${m[5] || '00'}` : '',
      start: dt.replace(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?Z?$/, (x, y, mo, d, h, mi) => `${d}/${mo}/${y}${h ? ' ' + h + ':' + (mi || '00') : ''}`),
    });
  }
  return out.sort((a, b) => (a.iso + (a.time || '')).localeCompare(b.iso + (b.time || '')));
}

async function sync() {
  const btns = [...document.querySelectorAll('[data-sync]')];
  const say = (msg) => {
    const note = document.getElementById('sync-note');
    const status = document.getElementById('sync-status');
    if (note) note.textContent = msg;
    if (status) status.textContent = msg;
  };
  btns.forEach((b) => { b.disabled = true; b.dataset.busy = '1'; });
  say('Syncing from Learning Space…');
  try {
    const r = await fetch('/api/sync', { method: 'POST' });
    const j = await r.json();
    MODEL = j.model;
    say(j.ok ? 'Synced just now' : 'Sync failed — is the debug browser open?');
    renderRail();
    route();
  } catch (e) {
    say('Sync failed — is the debug browser open?');
  } finally {
    btns.forEach((b) => { b.disabled = false; delete b.dataset.busy; });
  }
}

window.addEventListener('hashchange', route);
document.querySelectorAll('[data-sync]').forEach((b) => b.addEventListener('click', sync));
load();
