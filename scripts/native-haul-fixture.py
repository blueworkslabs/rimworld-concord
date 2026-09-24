#!/usr/bin/env python3
"""Disposable native-haul fixture (docs/SPIKE_NATIVE_HAUL.md). Operator-only save COPY.

Input: the campfire-v2 save, a reference save with the same pawns and vanilla work
priorities (for example lab-baseline), an output path that must not exist, and JSON
with wood positions and the candidate area:
  {"wood":[{"x":..,"z":..},...],"area":{"x":..,"z":..,"w":..,"h":..}}
Main fixture: three stacks of 30. With --meal: 18 stacks of 5 (one per trip), and
Pedro's Food at a provisional 0.33; calibrate hunger timing in a dry run.
Removes every stockpile whose filter could accept WoodLog, so nobody hauls wood
before an agreement exists. The candidate area is data for the coordinator, not a zone.
"""
import json,sys,xml.etree.ElementTree as E
from pathlib import Path
roles=json.loads(Path(__file__).with_name("native-haul-roles.json").read_text())
args=[a for a in sys.argv[1:] if a!='--meal'];meal='--meal' in sys.argv
src,ref,dst,layout=args;layout=json.loads(layout)
# DefDatabase order on 4871 with Biotech and Odyssey: Core, then Childcare, then Fishing.
WORK=['Firefighter','Patient','Doctor','PatientBedRest','BasicWorker','Warden','Handling','Cooking','Hunting','Construction','Growing','Mining','PlantCutting','Smithing','Tailoring','Art','Crafting','Hauling','Cleaning','Research','Childcare','Fishing']
HAULING=WORK.index('Hauling')
count,stacks=(5,18) if meal else (30,3)
assert len(layout['wood'])==stacks,f'need {stacks} wood positions'
area=layout['area'];assert 1<=area['w']*area['h']<=64

r=E.parse(src);m=r.find('.//maps/li');assert m is not None
things=m.find('things');pawns=[p for p in things if p.findtext('def')=='Human'];assert len(pawns)==3
refPawns={p.findtext('id'):p for p in E.parse(ref).find('.//maps/li/things') if p.findtext('def')=='Human'}

# Work priorities: vanilla defaults from the reference save, Hauling at 3.
priorities={}
for p in pawns:
    rp=refPawns.get(p.findtext('id'));assert rp is not None,'reference save lacks '+p.findtext('id')
    vals=p.findall('workSettings/priorities/vals/li');refVals=rp.findall('workSettings/priorities/vals/li')
    assert len(vals)==len(refVals)==len(WORK),'work type count differs from the pinned build'
    for v,rv in zip(vals,refVals):v.text=rv.text
    vals[HAULING].text='3'
    priorities[p.findtext('id')]={w:int(v.text) for w,v in zip(WORK,vals) if v.text!='0'}

# Select by identity, never XML order; preserve every backstory/capability.
mealPawn=None
if meal:
    matching=[p for p in pawns if (p.findtext('name/nick') or p.findtext('name/first'))==roles['meal']['pawn']]
    assert len(matching)==1,'meal pawn missing or ambiguous'
    mealPawn=matching[0]
    food=[n for n in mealPawn.findall('needs/needs/li') if n.findtext('def')=='Food']
    assert len(food)==1 and food[0].find('curLevel') is not None,'meal pawn lacks Food'
    food[0].find('curLevel').text=str(roles['meal']['initialFood'])

# No storage that accepts wood: drop stockpiles unless their filter lists only other defs.
zones=m.find('zoneManager/allZones');removedZones=[]
for z in list(zones if zones is not None else []):
    if z.get('Class')!='Zone_Stockpile':continue
    f=z.find('settings/filter')
    defs=[d.text for d in f.findall('allowedDefs/li')] if f is not None else []
    categories=f is not None and (f.find('categories') is not None or f.find('allowedCategories') is not None)
    if f is None or categories or 'WoodLog' in defs or not defs:
        zones.remove(z);removedZones.append(z.findtext('ID'))
assert not any((t.findtext('def') or '').startswith('Shelf') for t in things),'storage buildings need review'

# Wood: exactly the fixture stacks, unforbidden, at the given positions.
wood=[t for t in things if t.findtext('def')=='WoodLog'];assert wood,'no wood stack to clone'
template=wood[0]
for t in wood:things.remove(t)
nextId=r.find('.//uniqueIDsManager/nextThingID');assert nextId is not None
# Items and buildings block a cell; pawns move, plants and filth don't hold items.
occupied={t.findtext('pos') for t in things if t.get('Class') not in ('Pawn','Plant','Filth')}
made=[]
for pos in layout['wood']:
    cell=f"({pos['x']}, 0, {pos['z']})";assert cell not in occupied,'occupied '+cell
    t=E.fromstring(E.tostring(template))
    t.find('id').text='WoodLog'+nextId.text;nextId.text=str(int(nextId.text)+1)
    t.find('pos').text=cell;t.find('stackCount').text=str(count)
    flag=t.find('forbidden')
    if flag is not None:flag.text='False'
    things.append(t);occupied.add(cell);made.append(t.find('id').text)

with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'native-haul-v1-meal' if meal else 'native-haul-v1','wood':{'stacks':stacks,'each':count,'total':stacks*count,'ids':made},
    'area':area,'removedStockpiles':removedZones,'priorities':priorities,'roleSheet':roles,'mealSetup':roles['meal'] if meal else None,
    'nativeSelfCare':True,'note':'Astra confirms the zone list and, for the meal case, the trip count in a dry run'}))
