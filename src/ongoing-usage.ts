import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
/** Non-rewindable attempt accounting, not an allowance or a paid API budget.
 * Native subscription usage is tokens, not invented cash charges. Unfinished
 * attempts remain unknown after process loss and block further admission. */
export class OngoingUsage {
 private db:DatabaseSync;
 constructor(path:string){
  this.db=new DatabaseSync(path);
  const tables=this.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r=>r.name);
  if(tables.some(n=>!['ongoing_policy','ongoing_attempts'].includes(String(n)))){this.db.close();throw Error('Not an ongoing usage ledger');}
  this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
   CREATE TABLE IF NOT EXISTS ongoing_policy(id INTEGER PRIMARY KEY CHECK(id=1),name TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ongoing_attempts(id TEXT PRIMARY KEY,started INTEGER NOT NULL,mode TEXT NOT NULL,model TEXT NOT NULL,status TEXT NOT NULL,elapsed INTEGER,usage TEXT);`);
  const policy=this.db.prepare('SELECT name FROM ongoing_policy WHERE id=1').get();
  if(policy&&policy.name!=='luna-ongoing-v1'){this.db.close();throw Error('Usage policy mismatch');}
  this.db.prepare("INSERT OR IGNORE INTO ongoing_policy VALUES(1,'luna-ongoing-v1')").run();
 }
 reserve(mode:string,model:string){
  this.db.exec('BEGIN IMMEDIATE');
  try{
   if(this.db.prepare("SELECT id FROM ongoing_attempts WHERE status='started'").get())throw Error('Unresolved attempt; operator diagnosis required');
   const recent=this.db.prepare('SELECT status FROM ongoing_attempts ORDER BY rowid DESC LIMIT 3').all();
   if(recent.length===3&&recent.every(x=>x.status!=='ok'))throw Error('Repeated failures; operator diagnosis required');
   const id=randomUUID();this.db.prepare("INSERT INTO ongoing_attempts(id,started,mode,model,status) VALUES(?,?,?,?,'started')").run(id,Date.now(),mode,model);
   this.db.exec('COMMIT');return id;
  }catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 settle(id:string,status:'ok'|'failed'|'cancelled',elapsedMs:number,usage:unknown){
  const result=this.db.prepare("UPDATE ongoing_attempts SET status=?,elapsed=?,usage=? WHERE id=? AND status='started'").run(status,elapsedMs,JSON.stringify(usage??null),id);
  if(result.changes!==1)throw Error('Attempt already settled or unknown');
 }
 summary(){return this.db.prepare('SELECT id,started,mode,model,status,elapsed,usage FROM ongoing_attempts ORDER BY rowid').all().map(r=>({id:String(r.id),started:Number(r.started),mode:String(r.mode),model:String(r.model),status:String(r.status),elapsed:r.elapsed===null?null:Number(r.elapsed),usage:r.usage?JSON.parse(String(r.usage)):null}));}
 close(){this.db.close();}
}
