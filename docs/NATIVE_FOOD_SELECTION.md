# Why visible berries did not become a meal

## Diagnosis, not a new planning trial

The identity-aware live run accepted six core choices and three pawn replies, but
no eating was observed. A statement such as “I'll eat” was only a message: Concord
has no typed eat action. Native self-care still chooses its own jobs. We inspected
the unchanged campfire-v2 save and the installed RimWorld 1.6.4871 assembly, then
ran a bounded no-model comparison. Previous runs and allowances are untouched.

The fixture did not disable self-care. Its diet permits berries; the pawns are
undrafted. The relevant distinction is native preference at different hunger
levels, not permission to access the item:

- These humans normally begin seeking food below 30% Food.
- Native `UrgentlyHungry` begins below 12% (40% of that 30% threshold).
- Without a raw-food-tolerance gene, the ordinary food search before urgent hunger
  uses `MealAwful` as its minimum preference. Berries are `RawTasty`, below that
  minimum. At urgent hunger the minimum becomes `RawBad`, which includes berries.
- Concord deliberately uses coarse link bands: low is 20–50%, urgent below 20%.
  Neither label is the native hunger category. No exact meter was added to core
  or peer perspectives.

Original fixture levels were roughly 40/65/55%; the preceding live run ended at
22.4/45.8/35.8%. None reached this native 12% threshold. Merely showing a nearby,
unforbidden, nutrition-giving stack was insufficient to predict native eating.

## Native comparison

A trusted, staging-only `food-diagnostics` command requires a paused game and
returns operator diagnostics, never character observations. It compares native
`BestFoodSourceOnMap` with an otherwise identical search overriding only its
minimum preference to `RawBad`. These searches return candidate references;
they neither dispatch jobs nor change diet/needs. It also reports native hunger,
food-job priority, raw-food gene status, and per-berry reachability, reservation,
forbidden, ingestibility and willingness checks. The normal selection itself is
not an assertion that an actual job has started.

Two new disposable saves derive from the preserved campfire-v2 fixture. Both set
the companions to 90% Food; the variants differ only in Alvin's Food (20% versus
10%). Traits, genes, items, positions, work settings and other fields stay fixed.
Each receives twenty seconds of native activity without model inference or an
operator-issued eating job. Loading may advance a few native ticks before pause.

At **20%**, Alvin was natively Hungry. Food-job priority was 9.5; all three berry
stacks were reachable, reservable, permitted, ingestible and acceptable to
`WillEat`. The normal search returned no source; the diagnostic minimum override
returned berries. No Ingest appeared in 62 samples; all **225 berries remained**,
and Food fell to **18.4%**.

At **10%**, Alvin was natively UrgentlyHungry. Normal selection found berries.
Native `Ingest` appeared, **18 berries were consumed** (225 to 207), and Food rose
to **98%**. No LLM chose this action, and no job was dispatched by the diagnostic
or coordinator. No agreements or agreement outcomes were created. This is native
self-care evidence, not a live-agent follow-through success.

## Correction and boundaries

Shared food guidance now explicitly says that there is no agent-directed eat
action, spoken intentions do not start jobs, raw-food selection may wait, and
link bands are not native hunger categories. The same guidance reaches the core,
relevant pawn perspectives and the Supplies panel. Native thresholds, diet,
consent enforcement and action vocabulary are unchanged. No claim is made that
this wording improves future model behavior; no character calls tested it.

The fixture's “raw berries are a real alternative” remains true, but was incomplete
about when native self-care would choose them. Neither the core nor an operator
should silently convert a conversational promise into a forced eating job.

## Verification and provenance

- 315 Node + eleven Python checks, including exclusive-lock/direct-entry guards,
  artifact overwrite rejection and matched-fixture preservation. Native harness
  compiled against the installed owned game assemblies.
- Independent final-behavior Codex review; private reports retain source inspection
  and actual denied-write evidence. No game/model calls by the reviewer.
- Paired restore and full restart preserved the eaten state; no model calls or
  agent-directed jobs. All 228 historical database-related files unchanged.
- Staging stopped. A host-start configuration error before the trial is retained;
  the required lab-root setting was restored before execution, not a game reroll.
- [Complete operator test evidence](evidence/native-food-selection.json).
- Public source cross-checks: [food search](https://github.com/Chillu1/RimWorldDecompiled/blob/master/RimWorld/FoodUtility.cs),
  [food job priority](https://github.com/Chillu1/RimWorldDecompiled/blob/master/RimWorld/JobGiver_GetFood.cs),
  [native hunger](https://github.com/Chillu1/RimWorldDecompiled/blob/master/RimWorld/Need_Food.cs).
  These are decompiled references, not the version authority: the installed
  assembly's corresponding rules and runtime results were checked separately.

Run the operator check with `RIMWORLD_LAB_ROOT` set and the exclusive launcher:
`bash scripts/run-native-food-lab.sh game UUID`; after a full restart, use `cold`
with the same UUID. Receipts use exclusive creation. No model backend is imported.
The paused diagnostic is `python3 scripts/lab/lab.py command food-diagnostics`
with the environment pointing to the private lab; it is not a character tool.

Next: decide whether deliberate pawn-owned self-care needs an explicit executable
choice, rather than relying on a spoken intention to change native preferences.
A bounded eat choice would need its own native checks, persistence and interruption
contract. That capability is not implemented or authorized by these diagnostics;
no further inference allowance is enabled here.
