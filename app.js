// app.js - local Learning Space: serves the redesigned UI over the ripped data.
//   node app.js            -> http://127.0.0.1:8790
//   POST /api/sync         -> re-rips dashboard + every course from the open browser
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const RIP = path.join(ROOT, 'ripped');
const DATA = path.join(RIP, 'data');
const SITE = path.join(RIP, 'site');
const PORT = Number(process.env.PORT || 8790);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.eot': 'application/vnd.ms-fontobject',
};

function send(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}


// Moodle renders "Course is starred Course name X ... X" for screen readers, and the
// theme repeats the title. Collapse that to one clean title.
function cleanTitle(raw, detailTitle) {
  const strip = (t) => String(t || '')
    .replace(/^\s*Course is starred\s*/i, '')
    .replace(/^\s*Course name\s*/i, '')
    .replace(/^\s*Module:\s*/i, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  let t = strip(detailTitle);
  if (!t || /Course is starred/i.test(detailTitle || '')) t = strip(raw);
  const codes = [...t.matchAll(/(?:COMP|GAM)\d{3}/g)];
  if (codes.length > 1) t = t.slice(0, codes[1].index).trim();
  // no code to key on: the same title printed twice, back to back
  const half = Math.floor(t.length / 2);
  if (t.length > 12 && t.slice(0, half).trim() === t.slice(half).trim()) t = t.slice(0, half).trim();
  return t.replace(/[,\s]+$/, '');
}

// one payload the front end can route on
function buildModel() {
  const dashboard = readJson(path.join(DATA, 'dashboard.json'));
  if (!dashboard) return { courses: [], resources: [], syncedAt: null };
  const courses = [];
  const resources = [];
  for (const c of dashboard.courses) {
    const detail = readJson(path.join(DATA, `course-${c.id}.json`));
    const name = cleanTitle(c.name, detail ? detail.title : '');
    const code = (name.match(/\b(?:COMP|GAM)\d{3}\b/) || [null])[0];
    const item = {
      id: c.id,
      name,
      code,
      kind: code ? 'module' : 'resource',
      category: c.category,
      progress: Number(((c.progress || '').match(/(\d+)%/) || [])[1] || 0),
      progressText: (c.progress || '').replace(/^Course progress:\s*/, '').trim(),
      url: c.url,
      image: c.image || '',
      sections: (detail ? detail.sections : []).map((sec) => ({
        ...sec,
        week: Number((String(sec.title || '').match(/week\s*(\d+)/i) || [])[1] || 0),
      })),
      syncedAt: detail ? fs.statSync(path.join(DATA, `course-${c.id}.json`)).mtime.toISOString() : null,
    };
    (code ? courses : resources).push(item);
  }
  courses.sort((a, b) => a.name.localeCompare(b.name));
  const files = fs.readdirSync(DATA).filter((f) => f.endsWith('.json'));
  const syncedAt = files.length
    ? files.map((f) => fs.statSync(path.join(DATA, f)).mtimeMs).sort((a, b) => b - a)[0]
    : null;
  return { courses, resources, syncedAt: syncedAt ? new Date(syncedAt).toISOString() : null };
}

let syncing = null;function runSync() {
  if (syncing) return syncing;
  syncing = new Promise((resolve) => {
    const log = [];
    // dashboard needs a real browser (the course list is JS-rendered); sections are
    // server-rendered so plain HTTP + the debug-port cookie jar is enough and far faster.
    const steps = [['dashboard', 'rip.js', {}], ['sections', 'rip-sections.js', { FORCE: '1' }]];
    const next = (i) => {
      if (i >= steps.length) { syncing = null; return resolve({ ok: true, log }); }
      const [name, script, env] = steps[i];
      const p = spawn(process.execPath, [path.join(ROOT, script)], { cwd: ROOT, env: { ...process.env, ...env } });
      p.stdout.on('data', (d) => log.push(String(d).trim()));
      p.stderr.on('data', (d) => log.push('ERR ' + String(d).trim()));
      p.on('close', (code) => {
        log.push(`${name} exit ${code}`);
        if (code !== 0) { syncing = null; return resolve({ ok: false, log }); }
        next(i + 1);
      });
    };
    next(0);
  });
  return syncing;
}

function serveFile(res, base, rel) {
  const file = path.normalize(path.join(base, decodeURIComponent(rel)));
  if (!file.startsWith(base)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const p = url.pathname;

  if (p === '/api/data') return send(res, 200, JSON.stringify(buildModel()));
  if (p === '/api/ics') {
    try {
      const r = await fetch(url.searchParams.get('url'), { signal: AbortSignal.timeout(9000), headers: { 'user-agent': 'Mozilla/5.0' } });
      const t = await r.text();
      return send(res, 200, t, 'text/calendar; charset=utf-8');
    } catch (e) { return send(res, 502, 'upstream failed', 'text/plain'); }
  }
  if (p === '/api/sync' && req.method === 'POST') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    const r = await runSync();
    return res.end(JSON.stringify({ ...r, model: buildModel() }));
  }
  if (p.startsWith('/api/')) return send(res, 404, '{}');
  if (p.startsWith('/site/')) return serveFile(res, SITE, p.slice(6));
  if (p === '/' || p === '') return serveFile(res, PUBLIC, 'index.html');
  return serveFile(res, PUBLIC, p.slice(1));
});

server.listen(PORT, '127.0.0.1', () => console.log(`Learning Space local: http://127.0.0.1:${PORT}`));
