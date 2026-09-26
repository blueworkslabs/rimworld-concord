# Actions v1: recorded scripted T1 — 2026-09-26

**Passed on reviewed `7397872`, first recorded attempt.** Fixed script, zero character-model calls; **not** the benchmark harness arm or a UI speed/cost comparison.

## Task evidence

The unchanged T1 starting save had no bills or completed campfire. Native construction produced player Campfire **5672**. The configured checkpoint at tick **1568** contains new `Bill_CookMealSimple_0` at **3**; the completion observation at tick **7950** contains the same bill at **0**. Native MealsCooked records rose by **3** (Alvin 2, Pedro 1). No bill edit/delete or unrelated successful cooking bill was issued before that end observation. No drafting or forced pawn job was used; native workers executed construction/cooking.

The checker combines these observations with the fixed-script input audit. Native RimWorld has no per-bill completed-iteration counter: this is **not an edit-proof universal checker**. Both future benchmark arms require the same hidden configuration checkpoint and audit; ambiguous progress stays unverified.

## Additional checks, after T1 and while paused

- Stale load identity refused with sequence zero; occupied placement returned the native game refusal.
- Blueprint retry with the same ID and changed payload returned the original receipt, without another blueprint.
- Distinct stockpile/growing zones created through native validation. Invalid compound settings left zone state unchanged; empty allowed list meant Disallow all.
- Count-only bill edit applied; unsupported Forever/count edit refused; test bill deleted.
- Schedule/allowed-area commands accepted (existing setting/unrestricted: not proof of a changed restriction). Forbid toggled and restored with state checks.
- A new save/load changed epoch and preserved bills and the receipt window. Retrying the deleted test bill's original creation ID returned its saved receipt **without recreating it**. Same game process, not an OS-process cold restore.

## Measurements and coverage limits

Whole script: **157.154 s**, including setup, T1, post-task probes and save/load; **83 issued commands / 83 receipts / 80 perception reads / 60 refusals**. No transport failures. These are test totals, **not benchmark task metrics**. Of the commands, 14 precede the T1 end observation (three refusals, one duplicate-placement probe); 69 are post-task checks. Refusals include 53 unsuccessful zone-cell search attempts, two invalid-filter probes, the disabled Hauling capability, occupied placement, unknown recipe, stale identity and invalid Forever/count edit. They are retained, not discarded as retries.

The script does not exercise every designation, selected-zone interaction, research/pollution restriction, disconnected expansion, the 15-bill limit or deduplication beyond 512 requests. Those source-reviewed paths are not claimed game-tested. Snapshot receipt history is the last 64 entries; durable retry history is separate.

[Summary and hashes](summary.json) · [Incremental issued/receipt journal](actions.jsonl). Full raw observations are retained privately; [uncut **158.4-second** recording](https://discord.com/channels/1083662512806965308/1467116597645676546/1553294612125188098) is attached in the project channel. Recording bytes match staging and local copies; recording includes load, task and post-task checks, not shutdown. No runtime changes after capture. Independent source re-review clear; 467 tests, pinned assembly compilation and launcher guards passed.

Staging stopped, previous mod restored, **439 pre-existing saves unchanged**; one new `lab-concord-harness-1790404452816` checkpoint retained. No scored comparison or harness advantage claimed.
