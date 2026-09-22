# Bounded rescue

`rescue` names one downed free colonist (`target`), one single medical bed (`bed`),
the bed's exact `x`/`z` and a 60–3600 tick deadline. It is one carry, not a work
priority, capture, treatment plan or promise of recovery. Both patient and bed
must belong to the rescuer's faction. Prisoners, slaves, naturally always-downed
infants and non-colonists are outside this increment.

## Knowledge and consent

The native shortlist scans a visible radius-twelve square, collects at most eight
patients and twelve beds, and returns at most six valid pairs. Its epoch, tick
and map identify an observation, not a reservation or guarantee. Names and bed
labels are physical observations; no patient's private memories or character
state are shared. An empty shortlist is not proof that no rescue is possible
elsewhere. The core has a physical-only `rescueOptions(pawn)` query.

Offer creation requires a fresh mapped pair with matching identities and bed
coordinates. Pending offers and accepted work conservatively hold the whole
patient and bed inside the coordinator. These planning holds create no native
reservations. Refusal, a counter, withdrawn pending offer or settled work frees
the hold; uncertain cancellation retains it. Pending holds require explicit
withdrawal, as with hauling. One pawn cannot accumulate competing rescue/haul
offers. A counter executes nothing: adopting a different bed or patient creates
a new offer requiring fresh consent. The core cannot cancel accepted work.

## Native execution and outcome

Acceptance durably records one pawn-owned intention, absolute deadline and action
ID before dispatch. Native validation checks the mapped identities, downed
patient, usable unoccupied medical bed, voluntary availability, caring capability,
manipulation, food/rest at least 35%, reservations and Danger.None reachability.
Rescue does not require hauling work capability. The exact bed is revalidated
during carrying and immediately before placement; no substitute is chosen.

Native reservation, walking and carrying toils move the patient. The final step
uses RimWorld's tuck-into-bed behavior (including native rescued-by notification),
then verifies that this living patient occupies this exact bed and is no longer
carried. Only that step can record completion and `delivered: 1`. The rescuer's
coordinates do not prove delivery. Native social effects are not evidence that
an agent has developed a personality or independently chosen a relationship.

Unavailability, changed native job, invalid patient/bed, needs, expiry or pawn
withdrawal stop this one attempt. Reflection may withdraw an active rescue.
Interruption while carrying drops the casualty into the world at the carrier's
position; it does not teleport them back or guarantee their safety. A dropped
casualty is not a completed rescue. Failure is terminal, not an automatic retry.
The native guards operate without coordinator polling. Scoped cancellation
cannot end an unrelated job, and a cancellation tombstone blocks late dispatch.

## Persistence and verification

Quiescent paired saves retain pending plans, decisions and completed outcomes.
Active rescue checkpointing remains unsupported. Provider budgets never rewind.
Use the locked launcher on staging after building and starting the lab:

```bash
bash scripts/run-rescue-lab.sh fixture
bash scripts/run-rescue-lab.sh game
# Stop and restart the game before the cold check.
bash scripts/run-rescue-lab.sh cold
```

Set `RIMWORLD_LAB_ROOT` to the isolated absolute lab directory. The launcher holds
the existing exclusive coordinator lock for the entire process, including fixture
loads and saves. It fails immediately if staging is already owned; direct Node
invocation without its launcher marker fails before game access. The marker is
an operator-use guard, not a security boundary against arbitrary shell access.
These entry points use no inference backend or live allowance.
Fixture preparation creates a new save copy with an anesthetized
colonist, medical sleeping spots and disabled native work priorities. It is not
a naturally occurring injury or a player save. `--cold` verifies the saved result
after a full game restart without new decisions. See acceptance evidence for
what actually passed; implementation is not itself gameplay proof.
