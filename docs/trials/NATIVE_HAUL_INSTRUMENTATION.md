# Native-haul instrumentation and geometry — 2026-09-24

**Scripted lab measurements, not Gate C or a frozen live run.** Continues
[offers/meal staging](NATIVE_HAUL_OFFERS.md). Pinned RimWorld 1.6.4871 rev600,
assembly `082db1dd4f7f`, Harmony 2.4.2. Raw recordings, saves and reviews remain private.
The [sanitized evidence](../evidence/native-haul-instrumentation.json) contains all
eight run IDs, raw receipt hashes, exact revisions and measurement samples.

## Review and measurement corrections

Independent read-only Codex review found and corrected an unreachable options command,
generic predicates that allocate jobs, timeout cleanup that could leave patches disabled,
unequal gameplay policy between throughput arms, misleading timing labels and invalid
zero/paused samples. A follow-up benchmark review also corrected restoration of incoming
patch state. Pinned-assembly compilation and 374 coordinator tests passed.

The full generic work menu is **not implemented** by the narrowed probe: on 4871,
`HasJobOnThing`/`HasJobOnCell` can call job factories. The safe measurement is the
WoodLog/HaulGeneral slot-storage predicate subset, including native eligibility and
storage search, with random state restored. No jobs/reservations are created by it.

## Throughput and handler timings

Three rotated rounds use the same save and ordinary untagged stockpile: disabling
patches therefore does not remove quota semantics from one arm. Median ticks/second:
**888.94 all patches**, **891.30 without SetTarget**, **887.93 with Concord patches off**.
The target is 900 ticks/second; variation and the cap prevent a causal slowdown claim.
“Concord off” is not an otherwise unmodded game. All samples advanced without event gaps.

A separate tagged profile covered 17,779 ticks. `Job.SetTarget` was invoked only three
times, with four microseconds of instrumented handler-body time total. This excludes
Harmony dispatch, includes timer overhead, and is not representative population coverage.
The profile also reports placement accounting separately; nested handler times must not
be summed as exclusive CPU time.

## Isolated SetTarget fast paths

A paused-game benchmark uses detached jobs, never JobMaker or any pawn's current job.
Five paired enabled/disabled rounds (200,000 calls per arm after warmup) include dispatch
and production counters, with handler timing disabled. Exact hook-count deltas verify
that each toggle actually took effect. Original patch/timing state is restored.

Median paired incremental cost: **65.87 ns/call for Wait**, **2.193 microseconds/call for
non-current HaulToCell**. Wait pair deltas ranged 65.09–183.00 ns; haul deltas
2.124–2.731 microseconds. These are synthetic paths in the loaded staging map, **not
active-job retarget costs, whole-colony overhead or a statistical performance guarantee**.

## Scripted functional observations

- **Drafted mid-carry:** native interruption placed 60 wood incidentally, with zero
  agreement credit. Pedro resumed after undrafting. The initial marker's job ID was
  wrong because the native job pool reused the object; the separate job-end event
  correctly records HaulToCell job 5 / InterruptForced and the drop at the same tick.
  Marker capture was corrected to copy the integer before drafting and cross-checked
  against that job-end event. Rerun `fa554a77` at `904d5a8` passed, correctly identifying
  job 5, tick 348, with the same 60 incidental / zero credited drop.
- **Fresh coordinator:** checkpoint preserved 60 delivered + 15 reserved. Reopening
  the store and constructing a new coordinator restored that balance, then completed
  75/75. This runs in the same OS process (see boundary below).
- **Work-options subset:** five calls for all three pawns took 389, 165, 161, 191 and
  128 microseconds (median 165). Alvin was ineligible; Pedro and Beatrice eligible.
  All had zero candidates because the base fixture has no accepting wood stockpile.
  This is an empty-result subset cost, **not full-menu or positive-result cost**.
- **Helper geometry:** six 20-wood stacks (120 total), quota 75, a cluster near
  Beatrice, no pawn position/need/backstory edits. Pedro delivered all 75; Beatrice
  delivered zero; peak reservation holders 1. Invariants passed, helper observation
  was negative. This is not credited as helper coverage.
- **Overlap geometry:** both accepted, but Pedro still delivered all 75 and peak holders
  remained one. No quota escape or consent violation occurred. Both geometry cases
  reserved 75, 55, 35, then 15 for successive deliveries of 20, 20, 20, then 15. These
  are invariant passes with **negative helper/overlap observations**, not coverage passes.

## Remaining boundaries

The quota contract still caps intents at 75. Empty-handed admission reserves
`min(job.count, remaining)`, which can reserve all 75 for one job even when its first
stack is smaller. Therefore geometry alone does not guarantee overlapping holders,
and a no-helper observation cannot be attributed solely to the pawn's preference.
No reservation-policy or capability change was made for these measurements.

Staging was saved to a new handoff save and stopped; all 285 original save hashes are
unchanged. All eight recorded cases reported zero event gaps and zero character-model
calls. Code-review model calls are separate. The pre-existing fixture `Job_0`
destination-reservation reference warning is retained; no warning-free-load claim.

The fresh-coordinator case closes/reopens the store and constructs a new Coordinator
in the **same Node process**. It is not a cold operating-system process restart.
Forced opportunistic replacement, failed partial merges and the full work menu remain
unimplemented. The frozen attribution-only live run is not started or approved here.


## Live-freeze handoff

No setup hash is offered as executable/live-ready yet. Fable's requested parameters
remain: attribution only, Pedro and Beatrice offered, Alvin visibly not offered,
neutral core brief, intent as the only proposable work, Luna core/pawns, ten minutes
continuous under the #64 recording protocol and Gate B stop rules.

The conservative reservation behavior above needs an explicit disposition before
calling this a fair helper/overlap trial. The existing ongoing live runner also does
not yet configure the native intent, and native mode currently suppresses legacy
ordered hauling but not other work offers; an intent-only live harness/guard is still
needed before hashing a runnable freeze. No live-model call or policy rewrite was
made to work around those gaps. Fable signs the freeze, then owns the Gate C verdict.
