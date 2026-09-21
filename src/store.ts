import { DatabaseSync } from 'node:sqlite';
import type { Domain, Event } from './protocol.js';

/** One durable state row + ordered append-only audit journal, committed together. */
export class Store {
  private db:DatabaseSync;
  constructor(path:string) {
    this.db=new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS checkpoints (name TEXT PRIMARY KEY, data TEXT NOT NULL, sha256 TEXT NOT NULL);`);
  }
  read():Domain|undefined {
    const r=this.db.prepare('SELECT data FROM state WHERE id=1').get();
    return r ? JSON.parse(String(r.data)) as Domain : undefined;
  }
  commit(state:Domain,event:Event) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('INSERT INTO state VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data').run(JSON.stringify(state));
      this.db.prepare('INSERT INTO events(data) VALUES(?)').run(JSON.stringify(event));
      this.db.exec('COMMIT');
    } catch(e) { this.db.exec('ROLLBACK'); throw e; }
  }
  checkpoint(name:string,state:Domain,hash:string) {
    this.db.prepare('INSERT INTO checkpoints VALUES(?,?,?)').run(name,JSON.stringify(state),hash);
  }
  saved(name:string):{state:Domain;sha256:string} {
    const r=this.db.prepare('SELECT data,sha256 FROM checkpoints WHERE name=?').get(name);
    if(!r) throw Error('Unknown paired checkpoint');
    return {state:JSON.parse(String(r.data)) as Domain,sha256:String(r.sha256)};
  }
  events():Array<{seq:number;event:Event}> {
    return this.db.prepare('SELECT seq,data FROM events ORDER BY seq').all().map(r=>({seq:Number(r.seq),event:JSON.parse(String(r.data)) as Event}));
  }
  close() { this.db.close(); }
}
