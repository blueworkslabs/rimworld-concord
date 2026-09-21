#!/usr/bin/env python3
"""Operator-only disposable save COPY. No generation/fixture control is given to pawns.
Uses existing steel stacks, removes their forbidden flag, and adds local steel-only stockpiles.
Input coordinates come from the running game's movement observations. Never overwrites a save.
"""
import json,sys,xml.etree.ElementTree as E
src,dst,positions=sys.argv[1:]
r=E.parse(src);m=r.find('.//maps/li');assert m is not None
stacks=[t for t in m.findall('things/thing') if t.findtext('def')=='Steel']
positions=json.loads(positions);assert len(stacks)>=len(positions)
zones=m.find('zoneManager/allZones');assert zones is not None
for i,(stack,pos) in enumerate(zip(stacks,positions)):
    occupied={t.findtext('pos') for t in m.findall('things/thing')}
    dest=next((c for c in pos.get('candidates',[pos]) if f"({c['x']}, 0, {c['z']})" not in occupied),pos)
    pos={**pos,**dest}
    stack.find('pos').text=f"({pos['sourceX']}, 0, {pos['sourceZ']})"
    stack.find('stackCount').text='75'
    flag=stack.find('forbidden')
    if flag is not None:flag.text='False'
    zone=E.SubElement(zones,'li',{'Class':'Zone_Stockpile'})
    for key,value in [('ID',str(900+i)),('label',f'Concord fixture {i}'),('baseLabel','Stockpile'),('color','(0.5, 0.5, 0.5, 1)')]:E.SubElement(zone,key).text=value
    cells=E.SubElement(zone,'cells');E.SubElement(cells,'li').text=f"({pos['x']}, 0, {pos['z']})"
    settings=E.SubElement(zone,'settings');E.SubElement(settings,'priority').text='Normal'
    filt=E.SubElement(settings,'filter');E.SubElement(filt,'disallowedSpecialFilters');defs=E.SubElement(filt,'allowedDefs');E.SubElement(defs,'li').text='Steel'
# Keep autonomous native haulers from moving trial supplies before a tested offer.
for pawn in m.findall('things/thing'):
    if pawn.findtext('def')=='Human':
        for node in pawn.findall('workSettings/priorities/vals/li'):node.text='0'
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'operator-authored stockpiles and relocated steel','sources':[s.findtext('id') for s in stacks[:len(positions)]]}))
