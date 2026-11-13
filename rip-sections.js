// rip-sections.js - rip every section of every course, server-side (cookies from the open browser).
// Moodle here is "one section per page", so the main course page only has headers.
//   node rip-sections.js            (all courses in ripped/data/dashboard.json)
//   node rip-sections.js 10428      (one course)
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

const decode = (s) => String(s || '')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&nbsp;/g, ' ');

const tidy = (s) => decode(s).replace(/\s+/g, ' ').trim();

async function cookies() {
  const list = await (await fetch(`${CDP}/json/list`)).json();
  const tab = list.find((t) => t.type === 'page' && t.url.includes('learningspace'));
  if (!tab) throw new Error('no Learning Space tab open in the debug browser');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  const call = (method, params) => new Promise((resolve) => {
    const id = Math.floor(Math.random() * 1e6);
    const h = (e) => { const m = JSON.parse(e.data); if (m.id === id) { ws.removeEventListener('message', h); resolve(m.result); } };
    ws.addEventListener('message', h);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const { cookies: c } = await call('Network.getCookies', { urls: [ORIGIN] });
  ws.close();
  return c.map((x) => `${x.name}=${x.value}`).join('; ');
}

async function get(url, cookie) {
  const r = await fetch(url, {
    headers: { cookie, 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    redirect: 'follow',
    signal: AbortSignal.timeout(45000),
  });
  return { status: r.status, url: r.url, html: await r.text() };
}

function parseSections(mainHtml) {
  const out = [];
  const re = /<li id="section-(\d+)"[^>]*?data-sectionname="([^"]*)"[^>]*>/g;
  let m;
  while ((m = re.exec(mainHtml))) {
    out.push({ num: Number(m[1]), name: tidy(m[2]) });
  }
  return out.sort((a, b) => a.num - b.num);
}


// Slice out one section's markup so a page that renders several sections cannot
// leak another section's activities into this one.
function sectionHtml(html, num) {
  const start = new RegExp(`<li[^>]*id="section-${num}"[^>]*>`).exec(html);
  if (!start) return '';
  const rest = html.slice(start.index + start[0].length);
  const next = /<li[^>]*id="section-\d+"/.exec(rest);
  return next ? rest.slice(0, next.index) : rest;
}

function parseActivities(html) {
  // every activity row starts with data-activityname and carries a modtype_ class
  const items = [];
  const re = /<li[^>]*class="[^"]*activity[^"]*"[^>]*data-for="cmitem"[^>]*>([\s\S]*?)(?=<li[^>]*class="[^"]*activity[^"]*"[^>]*data-for="cmitem"|<\/ul>)/g;
  let m;
  while ((m = re.exec(html))) {
    const block = m[1];
    const nameM = block.match(/data-activityname="([^"]*)"/);
    const typeM = block.match(/modtype_([a-z0-9]+)/);
    const hrefM = block.match(/href="(https:\/\/learningspace[^"]*\/mod\/[^"]*)"/);
    if (!nameM) continue;
    const name = tidy(nameM[1]);
    if (!name) continue;
    const done = /data-completionstate="1"|completion-complete/

.test(block);
    items.push({ name, type: typeM ? typeM[1] : '', url: decode(hrefM ? hrefM[1] : ''), completion: done ? 'done' : '' });
  }
  // de-duplicate (index + row sometimes both carry the name)
  const seen = new Set();
  return items.filter((i) => { const k = i.name + '|' + i.url; if (seen.has(k)) return false; seen.add(k); return true; });
}

async function downloadAssets(html, cookie, pageUrl) {
  const urls = new Set();
  const abs = (u) => { try { return new URL(u, pageUrl).href; } catch { return ''; } };
  // UI chrome only: theme/lib/pix assets and course banners. Course content files
  // (pluginfile mod_*) and backups are skipped so a resource dump cannot swallow gigabytes.
  const skip = (u) => /\/mod_|\/backup\/|\/question\/|\/admin\/|\/report\//.test(u)
    || (/pluginfile\.php/.test(u) && !/overviewfiles/.test(u));
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const u = abs(m[1]);
    if (u.startsWith(ORIGIN) && !u.includes('logout') && !/\.js($|\?)/.test(u) && !skip(u)) urls.add(u);
  }
  for (const m of html.matchAll(/url\((?:&quot;|"|')?(https?:[^)"'&]+)/g)) urls.add(m[1]);
  let ok = 0;
  const queue = [...urls];
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const rel = new URL(u).pathname + (new URL(u).search || '');
      const dest = path.join(SITE, decodeURIComponent(rel).replace(/^\//, ''));
      if (fs.existsSync(dest)) continue;
      try {
        const r = await fetch(u, { headers: { cookie, 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(25000) });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, buf);
        ok++;
      } catch { /* optional */ }
    }
  };
  await Promise.all([0, 1, 2, 3, 4, 5, 6, 7].map(worker));
  return ok;
}

(async () => {
  const cookie = await cookies();
  const dash = JSON.parse(fs.readFileSync(path.join(DATA, 'dashboard.json'), 'utf8'));
  const only = process.argv[2];
  let courses = only ? dash.courses.filter((c) => c.id === only) : dash.courses;
  if (process.env.FORCE !== '1') {
    courses = courses.filter((c) => !fs.existsSync(path.join(DATA, `course-${c.id}.json`)));
    if (courses.length) console.log(`${courses.length} course(s) left`);
  }

  for (const c of courses) {
    const mainUrl = `${ORIGIN}/course/view.php?id=${c.id}`;
    const main = await get(mainUrl, cookie);
    if (main.html.includes('login/index.php')) throw new Error('session expired — reopen the port and log in');
    const secs = parseSections(main.html);
    fs.writeFileSync(path.join(RAW, `course-${c.id}-main.html`), main.html);
    await downloadAssets(main.html, cookie, mainUrl);

    const out = { url: mainUrl, id: c.id, title: '', sections: [] };
    const titleM = main.html.match(/<title>Module: ([^,<]*),/);
    out.title = titleM ? tidy(titleM[1]) : tidy(c.name);

    for (const s of secs) {
      const url = `${ORIGIN}/course/view.php?id=${c.id}&section=${s.num}`;
      const page = await get(url, cookie);
      if (page.html.includes('login/index.php')) throw new Error('session expired mid-run');
      fs.writeFileSync(path.join(RAW, `course-${c.id}-s${s.num}.html`), page.html);
      // A section page can contain more than one section (Moodle renders the whole
      // course when the section param is out of range or the format is "show all").
      // Only parse activities that sit inside the requested <li id="section-N"> block.
      const block = sectionHtml(page.html, s.num);
      const items = parseActivities(block || page.html);
      const intro = (page.html.match(/<div class="summary">([\s\S]*?)<\/div>/) || [])
        .map((x) => tidy(x.replace(/<[^>]+>/g, ' ')).slice(0, 280))[0] || '';
      out.sections.push({ id: `section-${s.num}`, num: s.num, title: s.name, intro, items });
      await downloadAssets(page.html, cookie, url);
      process.stdout.write(`\r  ${c.id}: section ${s.num}/${secs.length} (${items.length} items)   `);
    }
    fs.writeFileSync(path.join(DATA, `course-${c.id}.json`), JSON.stringify(out, null, 2));
    const total = out.sections.reduce((a, s) => a + s.items.length, 0);
    console.log(`\ncourse-${c.id}: ${out.sections.length} sections, ${total} items — ${out.title}`);
  }
  console.log('done');
})().catch((e) => { console.error('\nRIP FAILED:', e.message); process.exit(1); });
