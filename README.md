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
| `node check-routes.js` | every hash route renders, no console errors, no horizontal overflow |
| `node check-filter.js` | the activity filter narrows a large page and re-opens matching sections |
| `node check-cal.js` | seeds a sample timetable and screenshots `#/calendar` |

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
| `shots/` | screenshots used for design review |
| `start.cmd` | convenience launcher |
