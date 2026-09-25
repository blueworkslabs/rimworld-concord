import {z} from 'zod';

/** Construction as a native intent (docs/MIGRATION_PRODUCTION.md): the mod's BuildView, parsed
 * strictly enough that a receipt line always names its role. Roles: accepted, helper, pretag
 * (uncredited ordinary work begun before the tag), forced ("forced by an order (had refused)",
 * uncredited, not a violation) and violation (an excluded pawn's own scan let it through). */
export const BuildRole=z.enum(['accepted','helper','pretag','forced','violation']);
const Share=z.object({pawn:z.string(),role:BuildRole,def:z.string().optional().default(''),count:z.number().int().optional().default(0),work:z.number().optional().default(0)});
const BuildRecord=z.object({seq:z.number().int(),tick:z.number().int(),generation:z.number().int(),kind:z.string(),pawn:z.string().optional().default(''),
  role:z.string().optional().default(''),def:z.string().optional().default(''),count:z.number().int().optional().default(0),work:z.number().optional().default(0),
  occurrence:z.string().optional().default(''),text:z.string().optional().default('')});
export const BuildView=z.object({
  intentId:z.string().min(1),status:z.enum(['pending','open','built','failed','stopped','expired']),stage:z.enum(['blueprint','frame','built']),
  def:z.string().optional().default(''),label:z.string().optional().default(''),siteId:z.string().nullable().optional(),
  stopReason:z.string().nullable().optional(),finisher:z.string().nullable().optional(),note:z.string().nullable().optional(),
  fate:z.string().nullable().optional(),held:z.string().nullable().optional(),
  mapId:z.number().int(),x:z.number().int(),z:z.number().int(),rot:z.number().int(),generation:z.number().int(),thingId:z.number().int(),
  createdTick:z.number().int(),untilTick:z.number().int(),fateTick:z.number().int(),violations:z.number().int(),rejectedStarts:z.number().int(),
  /** Native frame workDone at completion or failure (-1 before either); settled shares sum to it. */
  finalWork:z.number().optional().default(-1),
  accepted:z.array(z.string()),excluded:z.array(z.string()),delivered:z.array(Share),work:z.array(Share),records:z.array(BuildRecord)});
export type BuildView=z.infer<typeof BuildView>;

/** Credited contribution only: accepted pawns and helpers. Pre-tag and forced work stay listed but
 * uncredited; violations are counted, never credited. */
export function buildCredit(v:BuildView){
  const credited=(r:{role:string})=>r.role==='accepted'||r.role==='helper';
  return {
    delivered:v.delivered.filter(credited),work:v.work.filter(credited),
    uncredited:[...v.delivered,...v.work].filter(r=>!credited(r)),
    helpers:[...new Set([...v.delivered,...v.work].filter(r=>r.role==='helper').map(r=>r.pawn))],
  };
}
