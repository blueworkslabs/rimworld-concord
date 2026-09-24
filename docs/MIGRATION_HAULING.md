# Hauling migration: native intents by default (Gates A–C)

**Status: Gate A draft.** Written by Clawd. Astra checks the internals claims against the
pinned build; Fable signs off the architecture, then the Gate B freeze. Nothing is built
before Gate B. The pinned build is RimWorld 1.6.4871 rev600, `Assembly-CSharp` prefix
`082db1dd4f7f`. The spike and its verdict are in [SPIKE_NATIVE_HAUL](SPIKE_NATIVE_HAUL.md)
and [Gate C](trials/NATIVE_HAUL_GATE_C.md).

## Goal

Hauling agreements become native intents in ordinary play, not only in the frozen
spike. The core offers a shared stockpile haul, pawns fill it through their own work
givers, and the ordered-job haul is retired once this path has matched it. The spike
answered "can it work"; this migration answers "can it be the default, and can a
viewer follow it".

## Carried over (decided, not reopened)

- **Attribution-only** is the default. Refusal, defer and withdrawal bind; helpers are
  credited as helpers. The exclusive variant stays scripted-only.
- **The wait action is silent.** A core turn with nothing new produces a "waiting on…"
  status line, never a crew-log entry.
- **The tag is on the zone, not on the wood.** Hauling that wood elsewhere is not a
  violation. There is no needs stop for native intents. The quota is per intent and
  credit is per pawn. After retirement the zone is an ordinary stockpile.
- **Late answers lapse, observation age is shown, and failures are counted per lane**
  (#71). These are prerequisites for the next live run and are already merged.
- **Capability comes from the game.** A pawn whose work type is disabled is never
  offered that work, and the reason is visible.

## Open decisions (recommendation first)

### 1. Strict hold, or a hold that grows

Gate A finding (below, Q2): a growing hold does **not** have to give up the zero-overshoot
guarantee. The game decides whether to grab a nearby duplicate stack in one toil
(`Toils_Haul.CheckForGetOpportunityDuplicate`), before the pawn walks to it. A
wrapper around that toil can cap the extra pickup to the free quota and reserve it at
that moment, with no race window. That gives three options:

- **(a) Strict hold (spike):** at most the source stack per trip, with no duplicate
  pickups into a tagged zone. Zero overshoot.
- **(b) Growing hold within quota (recommended):** the game's own duplicate pickups come
  back. Each extra stack is reserved when the game chooses it, bounded by what's left of
  the quota. Zero overshoot. The pawn may take part of a nearby stack to finish exactly
  on the number.
- **(c) Growing hold with reported overshoot (Fable's leaning):** the pawn brings the
  whole adjacent stack, and the log says "delivered 35 of 30". "Up to 30" becomes a
  target, not a limit.

(b) removes the spike's efficiency cost and keeps the measure. (c) is truer to "the game
being the game", but it turns "up to" into "about". Either can ship; **(b) is my
recommendation, and Fable decides.** If (c) is chosen, the offer text must say "about 30"
and the crew log must report the overshoot as an ordinary outcome, not an escape.

### 2. Where stockpiles come from

- **(a) Recommended:** the core may tag an **existing colony stockpile** (colony-public
  knowledge, per the internals note) for one thing def, or one of the operator-declared
  **candidate sites** that the fixture or scene setup lists. The mod creates the zone on
  first acceptance, as in the spike.
- **(b) Deferred:** the core proposes new zone rectangles itself. That needs
  placement validation and a view of the map that the core doesn't have. It stays with
  the open decision on untagged designations.

With (a), a tag covers a (zone, def) pair, so admission and the quota apply only to that
def (Q1). Other items keep flowing into a shared zone as before.

### 3. Several intents at once

**Recommended:** yes, at most one open intent per (zone, def). Each has its own quota,
standing and topic. The core view lists them separately. The spike's single frozen
intent generalizes without changes to the ledger.

## Scope

**In:**
- any haulable thing def;
- tagging existing stockpiles or candidate sites;
- several intents;
- the hold decision;
- retirement of ordered hauling;
- rescue replacement for native agreements (Q6);
- the legibility items below.

**Out:**
- construction, cooking and rescue as native intents (the next migrations);
- the core creating zones;
- priorities or the standing-commitment `ThinkNode`;
- the options menu for the core.

## Legibility (ships with the migration, from Gate C)

- **The offer says what is offered:** "Haul up to 30 wood into the stockpile at the
  north wall (76, 84); others may help". It is not an eligibility notice.
- **Helpers are labelled** in the crew log: "Pedro is helping (not asked)" on a
  helper's first credited placement.
- **Retirement writes one record:** "Agreement complete: 75 of 75 (Pedro 40, Beatrice
  35). Further hauling here is ordinary work." Placements into a retired zone keep being
  counted per pawn as ordinary work (Q3), so the 75 → 120 gap is explained.
- **The stockpile is findable:** the zone gets a readable label ("Shared: wood for
  Beatrice, Pedro") and a distinct colour for as long as the intent is open. The crew
  log entry has a "show" button that jumps the camera to it (Q4).
- **Clock, not ticks:** the crew log and core-facing times show in-game date and hour
  next to the tick (Q5).
- **The silent wait** replaces repeated "nothing to propose" entries with one status
  line.

## Retiring the ordered haul

1. The migration's Gate C runs a matched pair: the ordered model against native intents
   on the same fixture.
2. Once that passes, the core no longer lists ordered haul options in any mode.
   `Concord_Haul`, `Hauling.cs` and haul planning stay only for the baseline runner.
3. They are deleted in a follow-up after the verdict, together with the 35 % needs stop
   for hauling, which then has no remaining user.

## Gate A: internals questions

Answered on the pinned build, from decompiled names only. Astra checks each one.

- **Q1. Can a tag cover one def inside an existing, mixed stockpile?** Yes, if admission
  checks the def. Today's admission (patch 1) and pre-toil veto (3b) key on the zone
  alone. They must also require `t.def == intent def`, or a tagged mixed zone would
  block excluded pawns from storing *other* items there. `Placed` already counts only
  the intent's def toward the quota, and reconciliation already counts by def.
- **Q2. Can duplicate pickups respect the quota without a race?** Yes.
  `CheckForGetOpportunityDuplicate` chooses a same-def stack within 8 cells in its
  `initAction`, and only while `curJob.count > 0`. It then retargets A and jumps back to
  reserve and walk. The spike's strict hold works because it leaves `job.count` at 0
  after pickup. For option (b), a postfix on the toil factory wraps that `initAction`:
  - before it runs, cap `job.count` to the free quota;
  - after it runs, if the target changed, reserve `min(stack, job.count, available
    stack space)` for this job at once, before any walking;
  - the pickup true-up then shrinks to the carried count as today.
  The pickup patch (4b) stops clamping `job.count` to what was picked up.
- **Q3. Can placements after retirement be counted?** Yes. Patch 4 already sees every
  carry-tracker placement. A retired intent keeps its zone id and records later
  placements of its def as `ordinary` per pawn, without changing credit or quota. This
  continues until the zone is deleted or re-tagged. Fresh spawns and merges follow the
  existing hook 5 and reconciliation rules.
- **Q4. Can the zone be found on the map?** `Zone.label` and `Zone.color` are plain
  fields, and stockpile overlays draw with the zone colour.
  `CameraJumper.TryJump(IntVec3, Map)` and `TryJumpAndSelect(GlobalTargetInfo)` exist
  for a crew-log "show" button. The label and colour are restored at retirement.
- **Q5. Can ticks become a clock?** `GenDate.TickGameToAbs(int)` plus
  `GenDate.DateFullStringWithHourAt(long, Vector2)` and `HourOfDay(long, float)` take the
  map tile's longitude. The crew-log tab renders in the mod, so it can format times
  there. The state JSON also carries the clock for the current tick, so the core sees
  the same hour a viewer does.
- **Q6. Rescue replacement:** the replacement check (`replacementActive`) and the
  withdraw-and-replace path accept only an ordered `haul` as the agreement being
  replaced. A native agreement needs the same path: withdrawal is an `intent-exclude`
  where a carried trip finishes and is flagged, then the rescue offer follows. This is a
  coordinator change only; the game side is unchanged.
- **Q7. Are there def limits?** `EverHaulable` defs only. The quota stays 1–75 per intent
  for now. A larger quota is an open question for items whose stack limit is under 75.

## Gate B will freeze

- the hold option;
- the stockpile source;
- the admission-by-def change;
- the duplicate-pickup patch (if option (b));
- post-retirement counting;
- the legibility items and their exact texts;
- the rescue replacement path;
- the matched-pair fixture and its measures.

## Gate C will measure

- **Consent violations:** must stay at zero.
- **Credit beyond the quota:** zero under (a) or (b); under (c), reported as an outcome.
- **Legibility:** a cold read from the recording alone must name who was asked, who
  helped unasked, when the agreement ended and what happened afterwards. Fable's
  four-sentence test.
- **Matched pair:** trips and ticks per delivered unit, compared with the ordered model.
- **Simulation cost:** measured with any new patch included.
