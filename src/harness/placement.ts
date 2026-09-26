import {z} from 'zod';

/** Read-only placement query (docs/HARNESS.md): can this def go at this cell, and the nearest cells
 * where it can. The game answers with the build designator's own check, the one the UI runs under
 * the mouse; nothing is placed. Offered through `look` as {"by":"placement",...}. */
export const PlacementQuery=z.object({by:z.literal('placement'),def:z.string().regex(/^[A-Za-z0-9_]{1,80}$/),x:z.number().int().nonnegative(),z:z.number().int().nonnegative(),
  rot:z.number().int().min(0).max(3).optional(),stuff:z.string().regex(/^[A-Za-z0-9_]{1,80}$/).optional(),
  radius:z.number().int().min(1).max(30).optional(),count:z.number().int().min(1).max(20).optional()}).strict();
export type PlacementQuery=z.infer<typeof PlacementQuery>;
export const PlacementResult=z.object({def:z.string().nullable(),stuff:z.string().nullable(),x:z.number().int(),z:z.number().int(),
  rot:z.number().int().min(0).max(3).optional(),size_x:z.number().int().optional(),size_z:z.number().int().optional(),
  ok:z.boolean(),reason:z.string().nullable().optional(),source:z.enum(['game','harness']).nullable().optional(),
  searchedRadius:z.number().int().optional(),nearest:z.array(z.object({x:z.number().int(),z:z.number().int(),distance:z.number().int()}).strict())}).strict();
export type PlacementResult=z.infer<typeof PlacementResult>;
export function placementWire(q:PlacementQuery,epoch?:string):Record<string,unknown>{
  return {op:'placement',def:q.def,x:q.x,z:q.z,rot:q.rot??-1,radius:q.radius??-1,count:q.count??-1,...(q.stuff?{stuff:q.stuff}:{}),...(epoch?{epoch}:{})};
}
