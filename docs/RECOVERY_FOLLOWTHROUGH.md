# Follow-through after bounded formatting recovery

## Frozen protocol

One new `recovery-followup-v1` native trial after PR48. This does not replace,
rerun or relabel the earlier failed trials.

- Six core attempts and six pawn attempts maximum, zero Jev, no operator rerolls.
  Separate fresh native-Claude-Max ledgers reserve 0.60 USD API-equivalent each;
  historical policy identities and caps stay unchanged. Unused slots stay unused.
- Two minutes of native activity, explicit inference pauses, 45s decision limit,
  15-minute game deadline plus bounded cleanup. Same campfire-v2 save and open
  coordination brief as the food-followup trial; no forced recipient or outcome.
- Food starts .40/.65/.55, Rest .90; 225 raw berries, no ready meals or stove,
  unchanged traits/skills, native self-care, ordinary work priorities disabled.
- Attributed local food/campfire sightings remain separate from available jobs.
  Questions, silence, raw eating, refusal, deferral, work offers and waiting are
  valid branches. Speech and visibility never grant consent.
- PR48's core-only formatting recovery requires the complete bounded trace.
  Native max-turns remains two; other modes keep their prior result guard.
  Preserve raw structured outputs and typed text-free diagnostics, including
  explicit recovery receipts. Do not inject an error to force a repair.
- Scripted question/reply/wait rehearsal and paired/full restart before live.
  Live end: pause, stop owned work/retire unanswered offers, preserve outcomes,
  paired restore, full restart without inference, then stop staging.

Reuse the locked `scripts/run-core-followup.mjs` host launcher with an absolute
private configuration whose `policy` is `recovery-followup-v1`. Scripted and live
configurations must have separate output and ledger paths. Deployment digest,
exclusive coordinator lock, direct-entry guards and cold protocol checks remain.

```
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted
# Following a full restart:
node scripts/run-core-followup.mjs /absolute/private/config.json --scripted --cold
# Separate fresh live configuration: omit --scripted, then verify --cold.
```

This is not a controlled estimate of the adapter's effect on planning. Earlier
API errors may recur; a repair may never be needed. Report transport/validation,
core follow-up, pawn consent, actual work and persistence separately. A clean
inference run alone cannot establish useful colony coordination.
