# Food before a cooking option

Food observations are independent of executable production choices. A linked pawn shares current local sightings (radius 12, unfogged line of sight), including forbidden stacks and stacks seen while work readiness is false. This is an explicit shared-link communication rule, not access to private thoughts or a global inventory.

Each observer supplies epoch, game tick, map, radius, up to eight nutrition-giving/recipe-compatible item stacks and four campfires, with a truncation flag. Items carry exact identity, location, observed quantity, forbidden state, native nutrition-giving property and ingredient units required by the simple-meal recipe (zero = not compatible). Campfires carry location, forbidden state and native bill-usability. Those properties do not guarantee edibility for a particular pawn, available fuel throughout a job, reachability, reservation, willingness or successful execution.

The core and the observer pawn receive an allowlisted projection; the crew panel's **Supplies** tab presents the same sightings and prerequisite explanation. Duplicate sightings of the same map/thing are not extra stock. No local sighting is not evidence of no food elsewhere. Missing, malformed, wrong-timeline/map, future or older-than-120-tick readings become unknown. Saved/stale UI reports are labelled; there is no omniscient fallback.

Building requires 20 wood and a legal site; cooking requires a usable campfire, the recipe's ingredients and an eligible consenting pawn. Existing exact-action validation, planning holds, fresh consent and native checks are unchanged. Observations do not add opportunities or wake the planner: they are refreshed on existing core turns. No promise that this information produces better planning is made.

## Provider diagnosis

The retained PR44 failure reported successful structured output with `num_turns: 3`, despite the CLI's `--max-turns 2`; the adapter rejected it. Its event stream was not retained, so that particular sequence cannot be reconstructed.

Read-only inspection of installed Claude Code 2.1.280 found distinct counters: the successful result path initializes a counter for the input and increments on engine user events (which include tool results), while the max-turn failure path reports a separate turn counter. This is evidence that the fields need not be interchangeable, not proof of exactly why the old attempt reported three, nor a portable provider guarantee.

The adapter now retains bounded counts of assistant events, distinct assistant message IDs (count only), user events, StructuredOutput calls, tool results/errors and result events. These are **event counts, not inferred API-round-trip counts**. No streamed text, IDs, tool inputs or tool-result content is retained. Repeated content events may repeat tool-use counts. The two-turn CLI setting, result guard, tool isolation, deadlines, trial caps and accounting remain unchanged. No diagnostic live calls or retries were used for this change.

## Verification

Automated checks cover explicit privacy projection, absence of jobs despite sightings, stale/invalid/duplicate observations, overlapping observers, unchanged scheduler admission, and metadata/usage retention when a synthetic third-turn result is rejected.

The locked scripted native runner is `RIMWORLD_LAB_ROOT=/absolute/lab bash scripts/run-food-observation-lab.sh game UUID`, then `cold UUID` after a full restart. It authors new paused fixtures from the existing disposable campfire-v2 save: Food 0.1, one forbidden 75-berry stack at the observer or 13 cells away. It also inspects the previously completed scripted campfire checkpoint, without replaying its work. It checks board/core parity, paired rewind and cold restore. No model backend or job dispatch is present. Final native and full-restart execution passed on `9a217bf`; [evidence](evidence/food-observations.json) retains the initial serialization failure and final successful checks. 299 Node and ten Python checks passed. Fog/occlusion were not separately induced; distance and same-cell visibility were checked natively. Independent review and focused re-review completed; staging was stopped.
