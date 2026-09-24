# Native-haul reservation and contention reruns — 2026-09-24

**Scripted staging, not Gate C or a live freeze.** Continues the
[instrumentation report](NATIVE_HAUL_INSTRUMENTATION.md) after Fable's reservation-policy
correction. RimWorld 1.6.4871 rev600, assembly `082db1dd4f7f`, Harmony 2.4.2.
The [sanitized evidence](../evidence/native-haul-contention.json) records all nine run
IDs, receipt hashes and reviewed binary/source identifiers. Raw recordings, saves,
database files and independent reviews remain private.

## Reviewed policy

Empty-handed admission reserves the minimum of requested count, remaining quota,
source-stack count and native carry capacity. Pickup can shrink the reservation but
never grow it. Whole pre-carried loads must fit; delivery quantities are never clamped.
As explicitly documented by Clawd, tagged trips no longer collect additional nearby
stacks after the initial pickup. Ordinary hauling is unchanged. This tradeoff implements
Fable's shrink-only policy; it is not a claim of complete native hauling parity.

Author revision `b19085f` and the final corrections at `6d3ccbb` received separate,
completed read-only Codex reviews. Parent review additionally corrected an own-carried
job target reserving a phantom extra pickup: native code skips that pickup, so only the
actual carried load is now reserved. The native core's limits prose now matches its
intent-only proposal guard. 374 coordinator tests and the pinned-assembly mod build pass.

## Geometry and capability

The unchanged helper fixture contains six 20-wood stacks, 120 total, including a cluster
near Beatrice. Pawn positions, needs, backstories and baseline work priorities are
unchanged. Pedro and Beatrice can haul; Alvin cannot. No third capable actor was invented.
The main quota-30 fixture and the helper quota-30 variant are recorded separately from
the quota-75 helper/overlap runs, not mislabelled as three-hauler tests.

## Observations

- Attribution helper, quota 75: **Pedro 55, unaccepted Beatrice 20**, peak holders 2.
- Both accepting, quota 75: **Pedro 55, Beatrice 20**, peak holders 2.
- Helper layout with quota 30: Pedro delivered 30 through reservations 20 then 10;
  peak holders 1. This is a bounded-quota pass, **not an overlap observation**.
- Main quota-30 fixture: exactly 30 delivered, but only one holder; not overlap evidence.
- Own-carried target: a queued haul carrying 10 reserved exactly 10 at admission.
- Other pre-carried admission: 10 into quota 30 completed; 20 into quota 5 was rejected
  without intentional credit.
- Core offers: Alvin not offered, Beatrice refused, Pedro countered to 20 then accepted.
  Paired restore preserved 0 delivered + 20 reserved, then completed 20.
- Meal regression: **75/75**, first work after one tick, meal at tick 1699 with 15
  delivered and 60 unfinished, resumed at tick 1702 (**3 ticks**). Quota completed
  within 171.548 seconds of observation. This is a new native regression; the older
  matched ordered half was not rerun or represented as a new matched pair.

Both 75-unit runs admitted 20, 20, 20 and 15 across their trips. They exposed actual
simultaneous reservation holders without changing pawn behaviour. No `intent-trued-up`
shrink event occurred in those runs: actual pickups matched reservations. The shrinking
branch is reviewed but not empirically exercised by those observations.

All nine recorded cases passed their assertions with zero quota escapes, consent
violations and event gaps, and zero character-model calls. This is partial scripted
coverage, not a full matrix. Staging and display are stopped after saving to a new
handoff file; all 285 original saves are unchanged. The pre-existing fixture `Job_0`
reference warning and startup audio-device errors remain; no warning-free-load claim.

## Remaining boundary and freeze work

The core now exposes and admits only the configured stockpile intent. The existing
ongoing live runner still does not configure that intent; guard support alone is not
an executable frozen live harness. The exact setup hash and Fable's sign-off remain
pending. Attribution only, Pedro/Beatrice offered, Alvin visibly not offered, a neutral
brief, Luna core/pawns, ten minutes continuous and the #64 recording protocol remain
Fable's fixed parameters.

Full OS-process cold restore remains a Gate C requirement; Fable permits it at the
end of the live run, rather than requiring it before freeze. Rare failed-partial-merge
and opportunistic replacement checks remain unobserved. Prior SetTarget measurements
and the WoodLog-only options subset retain their explicit limits. No live-model calls
or Gate C approval are claimed here.
