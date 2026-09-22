#!/usr/bin/env python3
"""Operator-only disposable save COPY. No generation/fixture control is given to pawns.
Uses existing wood stacks, removes their forbidden flag, and adds local wood-only stockpiles.
Input coordinates come from the running game's movement observations. Never overwrites a save.
"""
import json,sys,xml.etree.ElementTree as E
src,dst,positions=sys.argv[1:]
r=E.parse(src);m=r.find('.//maps/li');assert m is not None
stacks=[t for t in m.findall('things/thing') if t.findtext('def')=='WoodLog']
positions=json.loads(positions);assert len(stacks)>=len(positions)
zones=m.find('zoneManager/allZones');assert zones is not None
for i,(stack,pos) in enumerate(zip(stacks,positions)):
    occupied={t.findtext('pos') for t in m.findall('things/thing')}
    dest=next((c for c in pos.get('candidates',[pos]) if f"({c['x']}, 0, {c['z']})" not in occupied),pos)
    pos={**pos,**dest}
    stack.find('pos').text=f"({pos['sourceX']}, 0, {pos['sourceZ']})"
    stack.find('stackCount').text='30'
    flag=stack.find('forbidden')
    if flag is not None:flag.text='False'
    zone=E.SubElement(zones,'li',{'Class':'Zone_Stockpile'})
    for key,value in [('ID',str(900+i)),('label',f'Concord fixture {i}'),('baseLabel','Stockpile'),('color','(0.5, 0.5, 0.5, 1)')]:E.SubElement(zone,key).text=value
    cells=E.SubElement(zone,'cells');E.SubElement(cells,'li').text=f"({pos['x']}, 0, {pos['z']})"
    settings=E.SubElement(zone,'settings');E.SubElement(settings,'priority').text='Normal'
    filt=E.SubElement(settings,'filter');E.SubElement(filt,'allowedHitPointsPercents').text='0~1';E.SubElement(filt,'allowedQualityLevels').text='Awful~Legendary';E.SubElement(filt,'disallowedSpecialFilters');defs=E.SubElement(filt,'allowedDefs');E.SubElement(defs,'li').text='WoodLog'
# Keep autonomous native haulers from moving trial supplies before a tested offer.
for pawn in m.findall('things/thing'):
    if pawn.findtext('def')=='Human':
        for node in pawn.findall('workSettings/priorities/vals/li'):node.text='0'
# Set own needs on disposable copy; no casualty is introduced. Clear old jobs/paths.
actors=[]
for i,pos in enumerate(positions):
    pawn=next(p for p in m.findall('things/thing') if 'Thing_'+p.findtext('id')==pos['id'])
    for need in pawn.findall('needs/needs/li'):
        if need.findtext('def') in ['Food','Rest']:
            need.find('curLevel').text=str(.4 if i==0 and need.findtext('def')=='Food' else .9)
    actors.append({'id':pos['id'],'condition':'hungry' if i==0 else 'full'})
for pawn in m.findall('things/thing'):
    if pawn.findtext('def')!='Human':continue
    for tag in ['jobs','pather']:
        old=pawn.find(tag)
        if old is not None:pawn.remove(old)
    jobs=E.SubElement(pawn,'jobs');E.SubElement(jobs,'curJob',{'IsNull':'True'});E.SubElement(jobs,'curDriver',{'IsNull':'True'})
    E.SubElement(E.SubElement(jobs,'jobQueue'),'jobs')
    E.SubElement(E.SubElement(pawn,'pather'),'moving').text='False'
# Native food seeking remains available, with an existing meal stack at each actor.
meals=[t for t in m.findall('things/thing') if t.findtext('def')=='MealSurvivalPack']
assert len(meals)>=len(positions)
for meal,pos in zip(meals,positions):
    occupied={t.findtext('pos') for t in m.findall('things/thing')}
    storage={cell.text for cell in zones.findall('li/cells/li')}
    cell=next(c for c in pos['candidates'] if f"({c['x']}, 0, {c['z']})" not in occupied|storage)
    meal.find('pos').text=f"({cell['x']}, 0, {cell['z']})"
    flag=meal.find('forbidden')
    if flag is not None:flag.text='False'
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'operator-authored stockpiles and relocated wood','sources':[s.findtext('id') for s in stacks[:len(positions)]]}))
