import {z} from 'zod';
export const TaskId=z.enum(['T1','T2','T3']);
const base=z.object({title:z.string().min(1),prompt:z.string().min(1),timeoutSeconds:z.number().int().min(1).max(1200),saveSha256:z.string().regex(/^[a-f0-9]{64}$/)});
const pawnIds=z.array(z.number().int().nonnegative()).length(3).refine(a=>new Set(a).size===a.length,'pawn IDs must be unique');
export const T2Rules=z.object({pawnIds,deadlineTick:z.number().int().positive(),foodMinimum:z.number().min(0).max(1)}).strict();
export const T3Rules=z.object({pawnIds,deadlineTick:z.number().int().positive(),woodRequired:z.number().int().positive(),initialWood:z.number().int().positive(),cells:z.array(z.object({x:z.number().int().nonnegative(),z:z.number().int().nonnegative()}).strict()).min(1).max(400).refine(a=>new Set(a.map(c=>`${c.x},${c.z}`)).size===a.length,'cells must be unique')}).strict();
export const BenchmarkTask=z.discriminatedUnion('id',[
 base.extend({id:z.literal('T1'),checker:z.literal('T1')}).strict(),
 base.extend({id:z.literal('T2'),checker:z.literal('T2'),rules:T2Rules}).strict(),
 base.extend({id:z.literal('T3'),checker:z.literal('T3'),rules:T3Rules}).strict(),
]);
export type BenchmarkTask=z.infer<typeof BenchmarkTask>;
