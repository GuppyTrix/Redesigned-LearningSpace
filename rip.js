// rip.js - capture the authenticated Learning Space as rendered, with its assets.
// Uses the already-open Opera GX debug port (9222) so cookies/JS are the real ones.
//   node rip.js dashboard
//   node rip.js courses        (every course link found on the dashboard)
//   node rip.js <url> [slug]
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const RIP = path.join(ROOT, 'ripped');
const RAW = path.join(RIP, 'raw');
const SITE = path.join(RIP, 'site');
const DATA = path.join(RIP, 'data');
for (const d of [RAW, SITE, DATA]) fs.mkdirSync(d, { recursive: true });

const ORIGIN = 'https://learningspace.falmouth.ac.uk';
const CDP = 'http://127.0.0.1:9222';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.handlers = []; }
  static async browser() {
    const v = await (await fetch(`${CDP}/json/version`)).json();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new Cdp(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pending.has(m.id)) {
        const { res, rej } = c.pending.get(m.id); c.pending.delete(m.id);
        m.error ? rej(new Error(`${m.error.message} ${m.error.data || ''}`)) : res(m.result);
      } else if (m.method) for (const h of c.handlers) h(m);
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
  on(fn) { this.handlers.push(fn); }
}

async function openTab(browser, url) {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
  const s = {
    id: targetId,
    send: (m, p) => browser.send(m, p, sessionId),
    close: () => browser.send('Target.closeTarget', { targetId }).catch(() => {}),
  };
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  await s.send('Network.enable');
  s.goto = async (u) => {
    await s.send('Page.navigate', { url: u });
    await s.waitLoaded();
  };
  s.waitLoaded = async () => {
    // wait for load, but tolerate SPA-ish pages that never fire it
    await Promise.race([
      new Promise((res) => {
        const h = (m) => { if (m.method === 'Page.loadEventFired' && m.sessionId === sessionId) { browser.handlers = browser.handlers.filter((x) => x !== h); res(); } };
        browser.on(h);
      }),
      sleep(20000),
    ]);
    await sleep(2500); // let Moodle's JS paint the course list
  };
  s.eval = async (expression) => {
    const r = await Promise.race([
      s.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }),
      sleep(30000).then(() => { throw new Error('evaluate timed out'); }),
    ]);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result.value;
  };
  return s;
}

function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

const DASH_JS = `(() => {
  const rows = [...document.querySelectorAll('li.course-listitem, [data-region="course-content"]')];
  const seen = new Set();
  const courses = [];
  for (const li of rows) {
    const a = li.querySelector('a[href*="course/view.php"]');
    if (!a) continue;
    const id = (li.getAttribute('data-course-id') || (a.href.match(/id=(\\d+)/) || [])[1] || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const img = li.querySelector('.list-image');
    const bg = img ? getComputedStyle(img).backgroundImage : '';
    courses.push({
      id,
      url: a.href.split('&')[0],
      name: (li.querySelector('.coursename') || a).textContent.trim().replace(/\\s+/g, ' '),
      category: (li.querySelector('.categoryname') || {}).textContent?.trim() || '',
      progress: (li.querySelector('.progress-text') || {}).textContent?.trim().replace(/\\s+/g, ' ') || '',
      image: (bg.match(/url\\("?(.*?)"?\\)/) || [])[1] || '',
    });
  }
  return { title: document.title, count: courses.length, courses };
})()`;

const COURSE_JS = `(() => {
  const h1 = document.querySelector('#page-header h1, h1');
  const secs = [...document.querySelectorAll('[id^="section-"]')].filter(el => /^section-\\d+$/.test(el.id));
  const out = secs.map(s => {
    const head = s.querySelector('[data-for="section_title"]');
    const num = head ? Number(head.getAttribute('data-number')) : NaN;
    let title = (head ? head.textContent : '').replace(/\\s+/g, ' ').trim();
    title = title.replace(/^Section\\s*\\d+\\s*/i, '').trim();
    const items = [...s.querySelectorAll('.activity-item, li.activity')].map(a => {
      const link = a.querySelector('a.aalink, a[href*="/mod/"]');
      const nameEl = a.querySelector('.activityname, .instancename');
      const cls = a.className || '';
      const mod = (cls.match(/modtype_([a-z0-9]+)/) || [])[1] || (a.querySelector('[class*="modtype_"]')?.className.match(/modtype_([a-z0-9]+)/) || [])[1] || '';
      return {
        name: (nameEl ? nameEl.textContent : (link ? link.textContent : '')).replace(/\\s+/g, ' ').trim(),
        url: link ? link.href : '',
        type: mod,
        completion: (a.querySelector('.completion-dropdown button, [data-region="completion-info"] .badge') || {}).textContent?.trim() || '',
      };
    }).filter(x => x.name);
    return { id: 'section-' + (isNaN(num) ? '' : num), num: isNaN(num) ? null : num, title, items };
  }).filter(s => s.title || s.items.length);
  return {
    title: (h1 || {}).textContent?.trim().replace(/\\s+/g, ' ') || document.title,
    courseIndex: [...document.querySelectorAll('nav#courseindex a, #course-index a')].map(a => ({ text: a.textContent.trim().replace(/\\s+/g,' '), href: a.getAttribute('href') })),
    sections: out,
  };
})()`;

async function downloadAssets(html, cookies, pageUrl) {
  const urls = new Set();
  const abs = (u) => { try { return new URL(u, pageUrl).href; } catch { return ''; } };
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = abs(m[1]);
    if (u.startsWith(ORIGIN) && !u.includes('logout') && !/\.js($|\?)/.test(u)) urls.add(u);
  }
  for (const m of html.matchAll(/url\((?:&quot;|"|')?(https?:[^)"'&]+)/g)) urls.add(m[1]);
  let ok = 0, bytes = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const rel = new URL(u).pathname + (new URL(u).search || '');
      const dest = path.join(SITE, decodeURIComponent(rel).replace(/^\//, ''));
      if (fs.existsSync(dest)) continue;
      try {
        const r = await fetch(u, {
          headers: { cookie: cookies, 'user-agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(20000),
        });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        ok++; bytes += buf.length;
      } catch { /* asset optional */ }
    }
  };
  await Promise.all([0, 1, 2, 3, 4, 5].map(worker));
  return { files: ok, bytes };
}

function rewrite(html) {
  // absolute site URLs -> local /site paths so the snapshot works from disk
  return html
    .replaceAll(`${ORIGIN}/`, '/site/')
    .replaceAll(ORIGIN, '');
}

(async () => {
  const mode = process.argv[2] || 'dashboard';
  const browser = await Cdp.browser();
  const tab = await openTab(browser, 'about:blank');
  try {
    await tab.goto(`${ORIGIN}/my/courses.php`);
    const cookies = (await tab.send('Network.getCookies', { urls: [ORIGIN] })).cookies
      .map((c) => `${c.name}=${c.value}`).join('; ');
    const dash = await tab.eval(DASH_JS);
    fs.writeFileSync(path.join(DATA, 'dashboard.json'), JSON.stringify(dash, null, 2));
    console.log(`dashboard: ${dash.count} courses`);

    let pages = [];
    if (mode === 'dashboard') pages = [{ url: `${ORIGIN}/my/courses.php`, slug: 'my-courses' }];
    else if (mode === 'courses') pages = dash.courses.map((c) => ({ url: c.url, slug: `course-${c.id}`, course: c.id }));
    else pages = [{ url: mode.startsWith('http') ? mode : `${ORIGIN}${mode}`, slug: process.argv[3] || slugify(mode) }];

    if (process.env.FORCE !== '1') {
      pages = pages.filter((p) => !(p.course && fs.existsSync(path.join(DATA, `${p.slug}.json`))));
      if (pages.length) console.log(`${pages.length} course page(s) left to rip`);
    }

    for (const p of pages) {
      await tab.goto(p.url);
      const data = p.course ? await tab.eval(COURSE_JS) : null;
      const html = await tab.eval('document.documentElement.outerHTML');
      fs.writeFileSync(path.join(RAW, `${p.slug}.html`), html);
      if (data) fs.writeFileSync(path.join(DATA, `${p.slug}.json`), JSON.stringify({ url: p.url, ...data }, null, 2));
      const assets = await downloadAssets(html, cookies, p.url);
      const local = rewrite(html);
      fs.writeFileSync(path.join(RIP, `${p.slug}.local.html`), local);
      console.log(`${p.slug}: ${(html.length / 1024).toFixed(0)}KB html, ${data ? data.sections.length + ' sections, ' : ''}${assets.files} assets (${(assets.bytes / 1024).toFixed(0)}KB)`);
    }
  } finally {
    await tab.close();
    browser.ws.close();
  }
})().catch((e) => { console.error('RIP FAILED:', e.message); process.exit(1); });
