#!/usr/bin/env node
// Concord dev diary: static site generator. No dependencies beyond Node >= 22.
//
//   node diary/build.mjs              build diary/entries/*.json -> diary/dist/
//   node diary/build.mjs --fixtures   also include diary/fixtures/*.json (labelled dummy content)
//   node diary/build.mjs --check      validate entries only, write nothing
//
// Every string from an entry is HTML-escaped. Entries cannot inject markup.
import {readdir, readFile, mkdir, writeFile, cp, rm, stat} from 'node:fs/promises';
import {dirname, join, resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const args = new Set(process.argv.slice(2));
const OUT = join(root, 'dist');
const SITE_SRC = join(root, '..', 'site');
const SITE = {
  title: 'Concord ship log',
  tagline: 'Development diary for RimWorld Concord',
  repo: 'https://github.com/blueworkslabs/rimworld-concord',
  origin: process.env.DIARY_ORIGIN ?? process.env.CF_PAGES_URL ?? '',
  base: process.env.DIARY_BASE ?? '', // e.g. '/diary' when served below a path
};
const QUADRUMS = ['Aprimay', 'Jugust', 'Septober', 'Decembary'];

// ---------- validation ----------
class EntryError extends Error {}
const isStr = v => typeof v === 'string' && v.trim().length > 0;
const need = (ok, file, msg) => { if (!ok) throw new EntryError(`${file}: ${msg}`); };
function validate(raw, file) {
  need(raw && typeof raw === 'object' && !Array.isArray(raw), file, 'entry must be an object');
  need(isStr(raw.slug) && /^[a-z0-9][a-z0-9-]{0,79}$/.test(raw.slug), file, 'slug must be lowercase letters, digits and dashes');
  need(isStr(raw.title) && raw.title.length <= 140, file, 'title required (max 140 chars)');
  need(isStr(raw.date) && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && !Number.isNaN(Date.parse(raw.date + 'T00:00:00Z')), file, 'date must be YYYY-MM-DD');
  need(isStr(raw.summary) && raw.summary.length <= 600, file, 'summary required (max 600 chars)');
  need(Array.isArray(raw.sections) && raw.sections.length > 0, file, 'sections must be a non-empty array');
  for (const s of raw.sections) {
    need(s && isStr(s.heading), file, 'each section needs a heading');
    need(Array.isArray(s.paragraphs) && s.paragraphs.length > 0 && s.paragraphs.every(isStr), file, `section "${s.heading}" needs paragraphs (strings)`);
  }
  need(Array.isArray(raw.evidence), file, 'evidence must be an array (may be empty)');
  for (const e of raw.evidence) {
    need(e && isStr(e.label) && isStr(e.url), file, 'each evidence item needs label and url');
    need(/^https?:\/\//.test(e.url), file, `evidence url must be http(s): ${e.url}`);
  }
  if (raw.images !== undefined) {
    need(Array.isArray(raw.images), file, 'images must be an array');
    for (const im of raw.images) {
      need(im && isStr(im.src) && isStr(im.alt), file, 'each image needs src and alt');
      need(!im.src.includes('..') && !/^[a-z]+:/i.test(im.src) && !im.src.startsWith('/'), file, `image src must be a relative path under diary/: ${im.src}`);
      if (im.caption !== undefined) need(isStr(im.caption), file, 'image caption must be a string');
    }
  }
  need(raw.author && isStr(raw.author.model) && isStr(raw.author.reviewer), file, 'author needs model and reviewer');
  if (raw.fixture !== undefined) need(typeof raw.fixture === 'boolean', file, 'fixture must be boolean');
  return {
    slug: raw.slug, title: raw.title.trim(), date: raw.date, summary: raw.summary.trim(),
    sections: raw.sections.map(s => ({heading: s.heading.trim(), paragraphs: s.paragraphs.map(p => p.trim())})),
    evidence: raw.evidence.map(e => ({label: e.label.trim(), url: e.url.trim()})),
    images: (raw.images ?? []).map(im => ({src: im.src, alt: im.alt.trim(), caption: im.caption?.trim()})),
    author: {model: raw.author.model.trim(), reviewer: raw.author.reviewer.trim()},
    fixture: raw.fixture === true,
  };
}

// ---------- helpers ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const attr = esc;
const href = p => `${SITE.origin.replace(/\/$/, '')}${SITE.base}${p}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function longDate(iso) { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
const dayNumber = iso => Math.round(Date.parse(iso + 'T00:00:00Z') / 86_400_000);
// Ship time: day 1 is the first entry. RimWorld years run 60 days in four 15-day quadrums.
function shipTime(iso, epochIso) {
  const day = dayNumber(iso) - dayNumber(epochIso) + 1;
  const q = QUADRUMS[Math.floor(((day - 1) % 60) / 15)];
  const qDay = ((day - 1) % 15) + 1;
  const year = 5500 + Math.floor((day - 1) / 60);
  return {day, label: `${ordinal(qDay)} of ${q}, ${year}`};
}
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][Math.min(n % 10, 4)] ?? 'th');
const pad = (n, w = 3) => String(n).padStart(w, '0');

// ---------- templates ----------
function layout({title, description, body, depth, kind}) {
  const up = depth ? '../'.repeat(depth) : './';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
<meta name="color-scheme" content="dark">
<meta property="og:title" content="${attr(title)}">
<meta property="og:description" content="${attr(description)}">
<link rel="stylesheet" href="${up}assets/log.css">
<link rel="stylesheet" href="${up}assets/site.css">
<link rel="alternate" type="application/rss+xml" title="${attr(SITE.title)}" href="${up}feed.xml">
<link rel="icon" href="${up}assets/mark.svg" type="image/svg+xml">
</head>
<body class="${kind}">
<a class="skip" href="#main">Skip to content</a>
<header class="mast">
  <a class="mast-home" href="${up}index.html">
    <svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false"><use href="${up}assets/mark.svg#mark"/></svg>
    <span class="mast-title">RimWorld Concord</span>
  </a>
  <nav class="mast-nav" aria-label="Site">
    <a href="${up}index.html">Vision</a>
    <a href="${up}architecture/index.html">Architecture</a>
    <a href="${up}log/index.html"${kind === 'index' ? ' aria-current="page"' : ''}>Ship log</a>
    <a href="${SITE.repo}" rel="noopener">Source</a>
  </nav>
</header>
<main id="main" class="page">
${body}
</main>
<footer class="foot">
  <p>Unofficial, non-commercial fan project. RimWorld is a trademark of Ludeon Studios; this diary is not affiliated with or endorsed by Ludeon. Entries are drafted by a language model and reviewed by a project maintainer before publication.</p>
  <p><a href="${SITE.repo}" rel="noopener">rimworld-concord on GitHub</a> · <a href="${up}feed.xml">Feed</a></p>
</footer>
</body>
</html>
`;
}

function stamp(entry, epoch, {link = false} = {}) {
  const t = shipTime(entry.date, epoch);
  const inner = `<span class="stamp-day"><span class="stamp-k">Ship day</span><span class="stamp-v">${pad(t.day)}</span></span>
      <span class="stamp-q">${esc(t.label)}</span>
      <time class="stamp-real" datetime="${attr(entry.date)}">${esc(longDate(entry.date))}</time>`;
  return link ? `<a class="stamp" href="../entries/${attr(entry.slug)}/index.html" aria-label="Ship day ${t.day}, ${esc(longDate(entry.date))}">${inner}</a>` : `<div class="stamp">${inner}</div>`;
}

function indexPage(entries, epoch) {
  const items = entries.map(e => `
  <li class="log-item${e.fixture ? ' is-fixture' : ''}">
    ${stamp(e, epoch, {link: true})}
    <div class="log-body">
      ${e.fixture ? '<p class="fixture-flag">Development fixture, not a real entry</p>' : ''}
      <h2 class="log-title"><a href="../entries/${attr(e.slug)}/index.html">${esc(e.title)}</a></h2>
      <p class="log-summary">${esc(e.summary)}</p>
      <p class="log-meta">${e.sections.length} ${e.sections.length === 1 ? 'section' : 'sections'}${e.evidence.length ? ` · ${e.evidence.length} ${e.evidence.length === 1 ? 'record' : 'records'}` : ''}${e.images.length ? ` · ${e.images.length} ${e.images.length === 1 ? 'image' : 'images'}` : ''}</p>
    </div>
  </li>`).join('\n');
  const body = `
<section class="hero">
  <p class="hero-kicker">Shared fate, not shared will.</p>
  <h1 class="hero-title">Log of the gravship <em>Concord</em></h1>
  <p class="hero-lede">Field notes from building an experimental RimWorld coordinator: an ancient AI core that proposes, three colonists who decide for themselves, and the machinery that keeps their choices honest across saves, reloads and slow-thinking models.</p>
  <p class="hero-count">${entries.length === 0 ? 'No entries logged yet.' : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}, newest first.`}</p>
</section>
${entries.length ? `<ol class="log" reversed aria-label="Diary entries">${items}\n</ol>` : `<p class="empty">The log is empty. Add an entry to <code>diary/entries/</code> and run the build.</p>`}`;
  return layout({title: SITE.title, description: SITE.tagline, body, depth: 1, kind: 'index'});
}

function entryPage(entry, epoch, neighbours) {
  const {prev, next} = neighbours;
  const sections = entry.sections.map((s, i) => `
  <section class="sec" aria-labelledby="sec-${i}">
    <h2 id="sec-${i}">${esc(s.heading)}</h2>
    ${s.paragraphs.map(p => `<p>${esc(p)}</p>`).join('\n    ')}
  </section>`).join('\n');
  const images = entry.images.length ? `
  <div class="figures">
  ${entry.images.map(im => `<figure class="fig">
      <img src="../../${attr(im.src)}" alt="${attr(im.alt)}" loading="lazy">
      ${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}
    </figure>`).join('\n  ')}
  </div>` : '';
  const evidence = entry.evidence.length ? `
  <section class="records" aria-labelledby="records-h">
    <h2 id="records-h">Records</h2>
    <p class="records-lede">Where this entry comes from. Follow these before trusting the prose.</p>
    <ul>
      ${entry.evidence.map(e => `<li><a href="${attr(e.url)}" rel="noopener">${esc(e.label)}</a><span class="records-host">${esc(safeHost(e.url))}</span></li>`).join('\n      ')}
    </ul>
  </section>` : '';
  const nav = `
  <nav class="entry-nav" aria-label="Neighbouring entries">
    ${prev ? `<a class="nav-prev" href="../${attr(prev.slug)}/index.html"><span class="nav-k">Earlier</span><span class="nav-t">${esc(prev.title)}</span></a>` : '<span></span>'}
    ${next ? `<a class="nav-next" href="../${attr(next.slug)}/index.html"><span class="nav-k">Later</span><span class="nav-t">${esc(next.title)}</span></a>` : '<span></span>'}
  </nav>`;
  const body = `
<article class="entry${entry.fixture ? ' is-fixture' : ''}">
  <header class="entry-head">
    ${stamp(entry, epoch)}
    ${entry.fixture ? '<p class="fixture-flag">Development fixture, not a real entry</p>' : ''}
    <h1 class="entry-title">${esc(entry.title)}</h1>
    <p class="entry-lede">${esc(entry.summary)}</p>
    <p class="entry-author">Written by ${esc(entry.author.model)}. Reviewed by ${esc(entry.author.reviewer)}.</p>
  </header>
  ${sections}
  ${images}
  ${evidence}
  ${nav}
</article>`;
  return layout({title: `${entry.title} · ${SITE.title}`, description: entry.summary, body, depth: 2, kind: 'entry'});
}
// Landing-page teaser: the three newest entries, injected at <!--LATEST--> in site/index.html.
function latestList(entries) {
  const items = entries.slice(0, 3).map(e => `
    <li><time datetime="${attr(e.date)}">${esc(longDate(e.date))}</time><a href="entries/${attr(e.slug)}/index.html">${esc(e.title)}</a><p>${esc(e.summary)}</p></li>`).join('');
  return entries.length ? `  <ul class="latest">${items}\n  </ul>` : '  <p class="empty">No entries logged yet.</p>';
}
function safeHost(url) { try { return new URL(url).host; } catch { return ''; } }

function feed(entries) {
  const items = entries.slice(0, 20).map(e => `  <item>
    <title>${esc(e.title)}</title>
    <link>${esc(href(`/entries/${e.slug}/index.html`))}</link>
    <guid isPermaLink="false">concord-diary:${esc(e.slug)}</guid>
    <pubDate>${new Date(e.date + 'T00:00:00Z').toUTCString()}</pubDate>
    <description>${esc(e.summary)}</description>
  </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>${esc(SITE.title)}</title>
  <link>${esc(SITE.repo)}</link>
  <description>${esc(SITE.tagline)}</description>
${items}
</channel></rss>
`;
}

// ---------- main ----------
async function loadDir(dir, fixture) {
  let names = [];
  try { names = (await readdir(dir)).filter(n => extname(n) === '.json').sort(); } catch { return []; }
  const out = [];
  for (const n of names) {
    const file = join(dir, n);
    let raw;
    try { raw = JSON.parse(await readFile(file, 'utf8')); } catch (e) { throw new EntryError(`${file}: invalid JSON (${e.message})`); }
    const entry = validate(raw, file);
    if (fixture) { need(entry.fixture, file, 'fixtures must set "fixture": true'); }
    else need(!entry.fixture, file, 'fixture entries belong in diary/fixtures/, not diary/entries/');
    out.push(entry);
  }
  return out;
}

async function main() {
  const entries = [...await loadDir(join(root, 'entries'), false)];
  if (args.has('--fixtures')) entries.push(...await loadDir(join(root, 'fixtures'), true));
  const slugs = new Set();
  for (const e of entries) { need(!slugs.has(e.slug), e.slug, 'duplicate slug'); slugs.add(e.slug); }
  for (const e of entries) for (const im of e.images) {
    try { await stat(join(root, im.src)); } catch { throw new EntryError(`${e.slug}: image not found: diary/${im.src}`); }
  }
  entries.sort((a, b) => a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1); // newest first
  const epoch = entries.length ? entries[entries.length - 1].date : new Date().toISOString().slice(0, 10);
  if (args.has('--check')) { console.log(`ok: ${entries.length} entries valid`); return; }

  await rm(OUT, {recursive: true, force: true});
  await mkdir(join(OUT, 'entries'), {recursive: true});
  await cp(join(root, 'assets'), join(OUT, 'assets'), {recursive: true});
  // Byte-identical transport parts keep individual browser downloads small.
  // The human-download original is retained, not transcoded or edited.
  const recordingName = 'luna-continuous-2026-09-24.mp4';
  const recording = await readFile(join(root, 'assets', 'recordings', recordingName));
  const partBytes = 3 * 1024 * 1024;
  for (let offset = 0, part = 0; offset < recording.length; offset += partBytes, part++) {
    await writeFile(join(OUT, 'assets', 'recordings', `${recordingName}.part${part}.bin`), recording.subarray(offset, offset + partBytes));
  }

  try { await cp(join(root, 'images'), join(OUT, 'images'), {recursive: true}); } catch { /* no images yet */ }
  if (args.has('--fixtures')) await cp(join(root, 'fixtures'), join(OUT, 'fixtures'), {recursive: true, filter: p => !p.endsWith('.json')});
  // Project pages (site/) sit at the root; the diary index lives at /log/. Entry URLs are unchanged.
  await cp(SITE_SRC, OUT, {recursive: true, filter: p => !p.startsWith(join(SITE_SRC, 'animations'))});
  const home = await readFile(join(SITE_SRC, 'index.html'), 'utf8');
  need(home.includes('<!--LATEST-->'), 'site/index.html', 'missing <!--LATEST--> marker');
  await writeFile(join(OUT, 'index.html'), home.replace('<!--LATEST-->', () => latestList(entries)));
  await mkdir(join(OUT, 'log'), {recursive: true});
  await writeFile(join(OUT, 'log', 'index.html'), indexPage(entries, epoch));
  await writeFile(join(OUT, 'feed.xml'), feed(entries));
  await writeFile(join(OUT, 'entries.json'), JSON.stringify(entries.map(({slug, title, date, summary}) => ({slug, title, date, summary})), null, 2) + '\n');
  await writeFile(join(OUT, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  Content-Security-Policy: default-src \'none\'; img-src \'self\'; media-src \'self\' blob:; connect-src \'self\'; script-src \'self\'; style-src \'self\'; font-src \'self\'; base-uri \'none\'; form-action \'none\'\n');
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const dir = join(OUT, 'entries', e.slug);
    await mkdir(dir, {recursive: true});
    await writeFile(join(dir, 'index.html'), entryPage(e, epoch, {prev: entries[i + 1], next: entries[i - 1]}));
  }
  console.log(`built ${entries.length} entries -> ${resolve(OUT)}`);
}

main().catch(e => { console.error(e instanceof EntryError ? `error: ${e.message}` : e); process.exit(1); });
