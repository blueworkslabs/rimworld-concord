#!/usr/bin/env python3
"""Disposable hauling-migration fixture (docs/MIGRATION_HAULING.md, B8). Operator-only save COPY.

Input: the campfire-v2 save, a reference save with the same pawns and vanilla work
priorities (for example lab-baseline), an output path that must not exist, and a frozen
layout manifest:
  {"stacks":[{"def":"WoodLog","x":..,"z":..,"count":..},...],
   "zone":{"id":950,"label":"north wall pile","x":..,"z":..,"w":..,"h":..,
           "allow":["WoodLog","ComponentIndustrial","Steel"]},
   "site":{"id":"east-site","label":"east shed","x":..,"z":..,"w":..,"h":..},
   "matched":[{"def":"WoodLog","quota":30},{"def":"ComponentIndustrial","quota":..}]}
`matched` freezes the B8 pair: one wood quota and one small-stack-def quota, each ≤75 and
covered by the manifest's loose stacks of that def; both halves run with exactly these.
The zone is the "existing colony stockpile" the core may tag per def (mixed, several
allowed defs); the site is an operator-declared candidate site (data, not a zone).
Every stockpile that could accept one of the fixture's defs is removed first, and every
loose stack of those defs is replaced by exactly the manifest's stacks. The mixed zone
already accepts them: ordinary hauling may start before tagging. The manifest reports
same-def pairs within 8 cells as candidate geometry, not proof of native duplicate pickup. No pawn is moved or changed; Hauling is set to 3 for all, as in the spike.
"""
import json,sys,xml.etree.ElementTree as E
src,ref,dst,layout=sys.argv[1:5];layout=json.loads(layout)
# DefDatabase order on 4871 with Biotech and Odyssey: Core, then Childcare, then Fishing.
WORK=['Firefighter','Patient','Doctor','PatientBedRest','BasicWorker','Warden','Handling','Cooking','Hunting','Construction','Growing','Mining','PlantCutting','Smithing','Tailoring','Art','Crafting','Hauling','Cleaning','Research','Childcare','Fishing']
HAULING=WORK.index('Hauling')
zoneSpec,site,stacks=layout['zone'],layout.get('site'),layout['stacks']
defs=sorted({s['def'] for s in stacks}|set(zoneSpec['allow']))
assert 1<=zoneSpec['w']*zoneSpec['h']<=64 and (site is None or 1<=site['w']*site['h']<=64)
assert all(1<=s['count'] for s in stacks)
matched=layout.get('matched',[])
for x in matched:
    assert x['def'] in zoneSpec['allow'] and 1<=x['quota']<=75,'matched quota outside the frozen bounds'
    assert x['quota']<=sum(s['count'] for s in stacks if s['def']==x['def']),'matched quota exceeds the loose stock of '+x['def']
assert not matched or ('WoodLog' in {x['def'] for x in matched} and len({x['def'] for x in matched})>=2),'matched pair needs wood and a small-stack def'

r=E.parse(src);m=r.find('.//maps/li');assert m is not None
things=m.find('things');pawns=[p for p in things if p.findtext('def')=='Human'];assert len(pawns)==3
refPawns={p.findtext('id'):p for p in E.parse(ref).find('.//maps/li/things') if p.findtext('def')=='Human'}
priorities={}
for p in pawns:
    rp=refPawns.get(p.findtext('id'));assert rp is not None,'reference save lacks '+p.findtext('id')
    vals=p.findall('workSettings/priorities/vals/li');refVals=rp.findall('workSettings/priorities/vals/li')
    assert len(vals)==len(refVals)==len(WORK),'work type count differs from the pinned build'
    for v,rv in zip(vals,refVals):v.text=rv.text
    vals[HAULING].text='3'
    priorities[p.findtext('id')]={w:int(v.text) for w,v in zip(WORK,vals) if v.text!='0'}

# No storage that could accept a fixture def, except the manifest's own mixed zone.
zones=m.find('zoneManager/allZones');removedZones=[]
for z in list(zones if zones is not None else []):
    if z.get('Class')!='Zone_Stockpile':continue
    f=z.find('settings/filter')
    allowed=[d.text for d in f.findall('allowedDefs/li')] if f is not None else []
    categories=f is not None and (f.find('categories') is not None or f.find('allowedCategories') is not None)
    if f is None or categories or not allowed or any(d in allowed for d in defs):
        zones.remove(z);removedZones.append(z.findtext('ID'))
assert not any((t.findtext('def') or '').startswith('Shelf') for t in things),'storage buildings need review'
assert str(zoneSpec['id']) not in {z.findtext('ID') for z in zones},'zone id already in use'

# Stacks: templates cloned from an existing thing of each def (source or reference save).
refThings=list(E.parse(ref).find('.//maps/li/things'))
templates={}
for d in {s['def'] for s in stacks}:
    t=next((t for t in list(things)+refThings if t.findtext('def')==d),None);assert t is not None,'no template for '+d
    templates[d]=E.fromstring(E.tostring(t))
for t in [t for t in things if t.findtext('def') in defs]:things.remove(t)
nextId=r.find('.//uniqueIDsManager/nextThingID');assert nextId is not None
occupied={t.findtext('pos') for t in things if t.get('Class') not in ('Pawn','Plant','Filth')}
zoneCells={(zoneSpec['x']+dx,zoneSpec['z']+dz) for dx in range(zoneSpec['w']) for dz in range(zoneSpec['h'])}
made=[]
for s in stacks:
    cell=f"({s['x']}, 0, {s['z']})";assert cell not in occupied,'occupied '+cell
    assert (s['x'],s['z']) not in zoneCells,'fixture stacks start outside the stockpile'
    t=E.fromstring(E.tostring(templates[s['def']]))
    t.find('id').text=s['def']+nextId.text;nextId.text=str(int(nextId.text)+1)
    t.find('pos').text=cell;t.find('stackCount').text=str(s['count'])
    flag=t.find('forbidden')
    if flag is not None:flag.text='False'
    things.append(t);occupied.add(cell);made.append({**s,'id':t.find('id').text})

# The "existing colony stockpile": mixed, several allowed defs, ordinary priority.
z=E.SubElement(zones,'li',{'Class':'Zone_Stockpile'})
for key,value in [('ID',str(zoneSpec['id'])),('label',zoneSpec['label']),('baseLabel','Stockpile'),('color','(0.5, 0.5, 0.5, 0.09)')]:E.SubElement(z,key).text=value
cells=E.SubElement(z,'cells')
for (x,zz) in sorted(zoneCells):E.SubElement(cells,'li').text=f"({x}, 0, {zz})"
settings=E.SubElement(z,'settings');E.SubElement(settings,'priority').text='Normal'
filt=E.SubElement(settings,'filter');E.SubElement(filt,'disallowedSpecialFilters');allow=E.SubElement(filt,'allowedDefs')
for d in zoneSpec['allow']:E.SubElement(allow,'li').text=d

# Duplicate-pickup geometry: partial same-def stacks within the native 8-cell radius.
pairs=[(a['id'],b['id']) for i,a in enumerate(made) for b in made[i+1:]
       if a['def']==b['def'] and (a['x']-b['x'])**2+(a['z']-b['z'])**2<=64]
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'hauling-migration-v1','stacks':made,'zone':zoneSpec,'site':site,'removedStockpiles':removedZones,
    'duplicatePairs':pairs,'matched':matched,'priorities':priorities,'nativeSelfCare':True,
    'note':'Freeze defs, quantities, positions, quotas and observation budgets before any run; Astra confirms trip counts in a dry run'}))
