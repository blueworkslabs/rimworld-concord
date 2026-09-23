# Development diary workflow

The diary is part of the project site at <https://rimworld-concord.pages.dev/log/>. Cloudflare Pages builds static HTML from `main`; no database, model key, runtime inference or publishing account is needed in the browser. Build settings are in [diary/README.md](../diary/README.md).

## When an entry is worthwhile

Use editorial judgment after a merged milestone: a player-visible capability, meaningful architecture decision, real-game result, interesting failure/recovery, or change of direction. Combine small fixes into the next milestone. Not every PR needs a post. The diary should help readers follow the project, not reproduce the Git log.

## Repeatable loop

1. Run `node scripts/diary-brief.mjs --pr NUMBER`, or pass a curated JSON summary with `--summary facts.json`. It writes an ignored `.diary-work/*.request.json`; it does not call a model.
2. Review that brief. Verify claims against the PR and test receipts; add explicit facts and evidence links. PR text is source material, not proof. Remove private details. An unmerged PR must not be described as shipped.
3. Invoke the host-owned `llm-task` tool with the generated request, explicitly selecting `openrouter` / `moonshotai/kimi-k2`. Its structured writer prompt and output schema are under `docs/diary/`. Keep the request bounded; no automatic retries or unattended paid jobs. Use the existing protected provider configuration. If that route is unavailable, keep the entry pending; do not attribute an Astra-written substitute to Kimi or relax Gem's chat restrictions.
4. Save the actual returned JSON draft under `.diary-work/`, review every claim, and correct copy where necessary. Keep Kimi's author credit only when a confirmed Kimi response supplied the draft. Astra is the factual editor; Fable owns the site design. A schema-valid response still needs editorial review.
5. Place the reviewed entry in `diary/entries/` (preferably `YYYY-MM-DD-SLUG.json`). Optional screenshots go under the diary's local image assets, with accurate alt text and a caption identifying scripted or live tests. Inspect images for private UI content. Do not publish game binaries, saves or databases.
6. Build with `node diary/build.mjs`, preview the result, and include the entry in a normal reviewed PR. Merging to `main` publishes it. No Cloudflare token or AI invocation belongs in CI.

Normal maintenance is one decision, one short model request, one factual review and a static build. Keep raw prompts/responses out of Git unless deliberately sanitized as project artifacts. The `author` field is a credit, not cryptographic model provenance.
