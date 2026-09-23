# Concord ship log (dev diary)

A static development diary for RimWorld Concord, styled as the gravship's log.
No framework, no npm dependencies: one Node script turns JSON entries into HTML.

## Build

```sh
node diary/build.mjs            # diary/entries/*.json -> diary/dist/
node diary/build.mjs --check    # validate entries, write nothing
node diary/build.mjs --fixtures # include diary/fixtures/ (labelled dummy content) for template work
```

Requires Node 22 or newer (the repo already needs 22.13). `diary/dist/` is
generated and git-ignored.

Cloudflare Pages: build command `node diary/build.mjs`, output directory
`diary/dist`. Set `DIARY_BASE` (for example `/diary`) only when the site is
served below a path. Set `DIARY_ORIGIN=https://your-site.example` for canonical RSS links; Pages supplies `CF_PAGES_URL` as a fallback. Keep the Pages root directory at the repository root and production branch at `main`. The build command must run on a commit containing `diary/build.mjs`, not the pre-diary commit.

## Writing an entry

Add one file per entry to `diary/entries/`, named `YYYY-MM-DD-slug.json`:

```json
{
  "slug": "pawn-awareness",
  "title": "Pawns learn what they can know",
  "date": "2026-09-21",
  "summary": "One or two sentences shown on the index and as the entry lede.",
  "sections": [
    {"heading": "What changed", "paragraphs": ["Plain text.", "One paragraph per string."]}
  ],
  "evidence": [
    {"label": "Pull request #1", "url": "https://github.com/blueworkslabs/rimworld-concord/pull/1"}
  ],
  "images": [
    {"src": "images/2026-09-21-badge.png", "alt": "Describe the picture.", "caption": "Optional."}
  ],
  "author": {"model": "Kimi K2", "reviewer": "Astra"}
}
```

Rules the build enforces:

- `slug` is lowercase letters, digits and dashes, unique across entries.
- `date` is `YYYY-MM-DD`. Entries are listed newest first; the ship-day
  counter starts at the earliest entry and the quadrum date follows RimWorld's
  60-day year (Aprimay, Jugust, Septober, Decembary; 15 days each).
- `sections` needs at least one section with at least one paragraph.
- `evidence` may be empty but must be an array of `http(s)` links.
- `images[].src` is a relative path under `diary/` (put files in `diary/images/`);
  `alt` is required.
- All text is plain. It is HTML-escaped on output; markup in JSON is shown literally.
- Fixture entries set `"fixture": true`, live in `diary/fixtures/`, and are only
  built with `--fixtures`. They render with a visible "Development fixture" flag.

## Output

- `index.html`, `architecture/index.html`: the project pages, copied from `site/`.
  The landing page gets the three newest entries at its `<!--LATEST-->` marker.
- `log/index.html`: the log, newest first.
- `entries/<slug>/index.html`: one page per entry with earlier/later links (URLs unchanged).
- `feed.xml`: RSS of the latest 20 entries. `entries.json`: machine-readable index.
- `media/`: explainer animations (MP4 + poster), rendered from `site/animations/`.
- `_headers`: Cloudflare Pages headers (same-origin only, no third-party requests).

The only JavaScript is `site/assets/site.js`, a same-origin file that plays the
explainer loops while they are visible and honours reduced-motion. The site loads
no third-party resources, so no model or API keys can end up in the browser.
Model calls happen in the drafting workflow, not here.

## Project pages and animations

`site/` holds hand-written HTML. Keep claims there in step with `docs/ROADMAP.md`
and link evidence for quoted model output. Animations use Manim Community:

```sh
cd site/animations
manim render -qm --format mp4 concord_scenes.py ConsentLoop WhoKnowsWhat TimelineGuard CoreWakes
./export.sh   # H.264 + poster frames into site/media/
```
