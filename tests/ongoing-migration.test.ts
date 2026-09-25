import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MigrationLiveSetup,migrationCoverage,assertMigrationMenu} from '../trials/ongoing-migration.js';
const entry={intentId:'12345678-1234-4234-8234-123456789abc',thing:'WoodLog',label:'wood pile',zoneId:-1,siteId:'wood',x:76,z:84,w:4,h:4,quota:75,maxTicks:30000,variant:'attribution',hold:'strict'};
test('live migration cannot silently enable growing, exclusivity, unknown options or an empty list',()=>{
 assert.equal(MigrationLiveSetup.parse({save:'lab-frozen',entries:[entry]}).entries[0]!.hold,'strict');
 for(const e of [{...entry,hold:'growing'},{...entry,variant:'exclusive'}])assert.throws(()=>MigrationLiveSetup.parse({save:'lab-frozen',entries:[e]}));
 assert.throws(()=>MigrationLiveSetup.parse({save:'lab-frozen',entries:[]}));
 assert.throws(()=>MigrationLiveSetup.parse({save:'lab-frozen',entries:[entry],experimentalGrowing:true}));
});
test('ordinary menu and coverage allow other work but reject ordered hauling and preserve missing offers',()=>{
 const entries=MigrationLiveSetup.parse({save:'lab-frozen',entries:[entry]}).entries;
 const haul=(pawn:string)=>({pawn,id:pawn,action:{kind:'haul-zone',intentId:entry.intentId},status:'accepted'});
 const v:any={opportunities:[haul('P'),haul('B'),{pawn:'A',action:{kind:'build'}}]};
 assert.doesNotThrow(()=>assertMigrationMenu(v,entries,['P','B']));
 assert.throws(()=>assertMigrationMenu({...v,opportunities:v.opportunities.slice(0,2)},entries,['P','B']),/other work/);
 const d:any={nativeIntentOnly:false,proposals:{p:haul('P'),other:{pawn:'A',action:{kind:'build'}}}};
 assert.deepEqual(migrationCoverage(d,entries,['P','B']).missing,[{intentId:entry.intentId,pawn:'B'}]);
 d.proposals.b=haul('B');assert.equal(migrationCoverage(d,entries,['P','B']).complete,true);
 d.proposals.other.action.kind='haul';assert.throws(()=>migrationCoverage(d,entries,['P','B']),/Ordered hauling/);
});
