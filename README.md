# Learning Space — local redesign

A local, read-only copy of Falmouth University's Moodle "Learning Space" with a redesigned
interface: dark theme, code-tile modules, week-first navigation and no Moodle chrome.

Nothing here writes to the university site. It only reads pages with your own session.

## Run it

```bash
cd D:\Codebase\Personal\learningspace-tweak
node app.js            # http://127.0.0.1:8790
```

The rip needs a browser with the debug port open (the Opera GX (Debug) Start Menu shortcut
does that). Cookies are read from that browser; if the browser is closed, syncing fails but the
already-ripped copy still works.

## Refresh the content

Press **Sync now** in the app (it calls `POST /api/sync`), or run:

```bash
node rip.js dashboard        # course list + progress (needs a real browser)
node rip-sections.js         # every section of every course (plain HTTP, resumable)
FORCE=1 node rip-sections.js # re-rip files that already exist
```

`rip-sections.js` skips any `course-<id>.json` that already exists unless `FORCE=1`, so an
interrupted run resumes instead of starting over.

## Why ripping is not "save the page"

Moodle serves the dashboard's course list from JavaScript, and every course page is split
into **one section per page** (`course/view.php?id=10428&section=7`). Section pages are fully
server-rendered, so the ripper only needs the cookie header — no headless browser, no DOM
automation. Saving `Ctrl+U` output gives skeletons and a splash screen instead.

## Layout

```
app.js                 local server: static files, /api/data, /api/sync, /api/ics proxy
public/index.html      shell (rail + main)
public/app.css         the whole visual system
public/app.js          hash router + views (overview, modules, resources, calendar, course)
rip.js                 browser-driven ripper for the dashboard
rip-sections.js        HTTP ripper for every section of every course
ripped/data/*.json     the saved model (dashboard.json + course-<id>.json)
ripped/site/           theme assets and course banners, served at /site/
shots/                 screenshots used while designing and reviewing
.superdesign/init/     design context (components, layouts, routes, theme, pages)
```

## Data model

- course: `{ id, name, code, kind: "module"|"resource", progress, sections[] }`
- section: `{ id, num, title, week, items[] }`
- item: `{ name, type, url, completion }`

A space is a module when its code starts with `COMP` or `GAM`; everything else is a resource
space. Sections whose title contains "Week N" get `week: N` and drive the week bar.

## Known limits

- Calendar is UI only until you paste a real `.ics` feed; events are parsed in the browser.
- The dashboard rip still needs the debug browser; only section ripping is pure HTTP.
- Course content files (PDFs, submissions) are deliberately not downloaded — only theme
  assets and course banners, so the copy stays a few hundred MB at most.
- No login, no writes, no submission of anything.

## UI features added after the first rip

- **Week context bar** — sticky, shows the week you are in, `W1…Wn` jump chips (they scroll rather than wrap), an activity filter when a page has more than 40 items, and one `Collapse all / Expand all` control.
- **Calendar** — month grid with today ring and up to three event chips per day, a `Next up` list, and `‹ ›` month paging. Feed URL is stored in `localStorage` (`ls.calUrl`); events are cached in `ls.calendar`.
- **Rail** — `aria-current` on the active route, two-line module names, chips colour-coded (COMP amber, GAM blue, RES neutral).

## Verification scripts

| script | what it checks |
| --- | --- |
| `node .agent-work/qa/check-routes.js` | every hash route renders, no console errors, no horizontal overflow |
| `node .agent-work/qa/check-filter.js` | the activity filter narrows a large page and re-opens matching sections |
| `node .agent-work/qa/check-cal.js` | seeds a sample timetable and screenshots `#/calendar` |

## Open it

1. Double-click `start.cmd` (or run `node app.js`) — the app opens at http://127.0.0.1:8790.
2. `Sync now` in the page header re-rips everything; it needs Opera GX running with the debug port open (`--remote-debugging-port=9222`), because the course list only exists after Moodle's own JavaScript runs.

## What is in the folder

| path | purpose |
| --- | --- |
| `app.js` | local server: static files, `/api/data`, `/api/sync`, `/api/ics` proxy |
| `public/` | the redesigned UI (index.html, app.css, app.js) |
| `rip.js` | browser ripper: dashboard JSON + page dumps + assets |
| `rip-sections.js` | HTTP ripper for every `section=<n>` page (the real content source) |
| `ripped/data/` | one JSON per space, plus `dashboard.json` |
| `ripped/site/` | theme CSS, images and course banners |
| `.agent-work/qa/shots/` | screenshots used for design review |
| `start.cmd` | convenience launcher |

## Working files

Everything used to design and review the page — screenshots, superdesign drafts and prompts,
DOM snapshots, CDP probes, review scripts, logs, and the earlier userscript attempt — lives in
`.agent-work/` and is ignored by git:

| path | contents |
| --- | --- |
| `.agent-work/design/` | superdesign project files, prompts, drafts, `ref/` Moodle templates, mirror experiment |
| `.agent-work/qa/` | screenshots (`qa/shots/`) and the check scripts used to verify routes, filter, calendar |
| `.agent-work/logs/` | rip and server logs |
| `.agent-work/archive/userscript-phase/` | the first attempt: `learningspace.css`, `build.js`, `serve.js`, `learningspace-tweak.user.js` |

## HTML standards

The page is plain HTML5 with no framework and no invented attributes. The pieces that
matter, and the checks that keep them honest:

- Document: `<!DOCTYPE html>`, `<html lang="en">`, single `<h1>` per view, no heading-level
  skips, `<main id="main">`, two named `<nav>` landmarks, and a skip link as the first focusable
  element. `<title>` and `<meta name="description">` are set per route.
- Semantics over spans: course progress is a real `<progress max="100" value="76">` (no inline
  width), calendar days that hold events are real `<button type="button">` elements, every
  activity type icon and chevron is `aria-hidden`, and the week accordions are buttons with
  `aria-expanded` + `aria-controls`.
- Nothing is styled with inline `style=` and no attribute is written without a value; the only
  generated attributes are `data-*` hooks for the router.

Two checks, both runnable any time (they exit non-zero on findings):

```bash
node .agent-work/qa/check-html.js          # per-route DOM audit over CDP
node .agent-work/qa/dump-dom.js c/10428 d.html   # dump a rendered route for a validator
npx -y html-validate@8 d.html              # rules in .htmlvalidate.json
```

`check-html.js` covers duplicate ids, missing `lang`/viewport/description/title, missing
`<main>`, unnamed navs, h1 count, heading jumps, unlabelled controls, links/buttons without
accessible text, `img` without `alt`, nested interactive content, `aria-expanded` on plain
divs, empty `href`s, and the skip link being first. All seven routes currently report
`no findings`; the three rendered dumps (`overview`, `course`, `calendar`) pass
`html-validate`'s recommended rule set with only stylistic rules disabled in
`.htmlvalidate.json` (`no-inline-style`, `no-trailing-whitespace`, `attribute-boolean-style`).

## Lighthouse

Four runs, saved in `reports/lighthouse/` as both JSON and a self-contained HTML report:

| view | performance | accessibility | best practices | SEO | LCP | CLS |
| --- | --- | --- | --- | --- | --- | --- |
| [Overview · desktop](<reports/lighthouse/overview-desktop.report.html>) | 100 | 100 | 100 | 100 | 0.4 s | 0 |
| [Overview · mobile](<reports/lighthouse/overview-mobile.report.html>) | 85 | 100 | 100 | 100 | 1.8 s | 0.28 |
| [Module · desktop](<reports/lighthouse/course-desktop.report.html>) | 100 | 100 | 100 | 100 | 0.4 s | 0 |
| [Calendar · desktop](<reports/lighthouse/calendar-desktop.report.html>) | 100 | 100 | 100 | 100 | 0.4 s | 0 |

How to read this: the app is served off localhost, so **performance is not meaningful** — there
is no network, no TLS and no cache to warm. Accessibility, best practices and SEO are the honest
numbers, and they are 100 across the board. The only real defect is mobile CLS 0.28, which comes
from the rail re-laying itself out on first paint (the desktop rail is a fixed 272 px column; at
412 px it becomes a wrapping header). Remaining sub-1.0 audits in the JSON are dev-server
artefacts: unminified CSS/JS, no compression, and `bf-cache` refusing to store a page that
re-renders on `hashchange`.

Regenerate:

```bash
npx -y lighthouse@12 "http://127.0.0.1:8790/" --preset=desktop   --only-categories=performance,accessibility,best-practices,seo   --output=html --output=json --output-path=./reports/lighthouse/overview-desktop   --chrome-flags="--headless=new"
```

Drop `--preset=desktop` for the mobile run, and swap the URL for `#/c/10428` or `#/calendar`.
