#!/usr/bin/env python3
"""Operator-only disposable COPY: anesthetized colonist and medical sleeping spots plus fixed hauling supplies.
No fixture editing interface is exposed to a character. Never overwrites a save.
"""
import json,sys,xml.etree.ElementTree as E
src,dst,config=sys.argv[1:];config=json.loads(config)
r=E.parse(src);m=r.find('.//maps/li');things=m.find('things')
pawns=[p for p in things if p.findtext('def')=='Human']
target=next(p for p in pawns if 'Thing_'+p.findtext('id')==config['target'])
def setval(parent,key,value):
    node=parent.find(key)
    if node is None:node=E.SubElement(parent,key)
    node.attrib.pop('IsNull',None);node.text=str(value);return node
health=target.find('healthTracker');setval(health,'healthState','Down')
h=E.SubElement(health.find('hediffSet/hediffs'),'li',{'Class':'HediffWithComps'})
for k,v in [('loadID','990001'),('def','Anesthetic'),('severity','1'),('ageTicks','0'),('ticksToDisappear','90000'),('disappearsAfterTicks','90000')]:setval(h,k,v)
pos=config['patientCell'];setval(target,'pos',f"({pos['x']}, 0, {pos['z']})")
# No unrelated native rescue or treatment before the scripted agreement.
for pawn in pawns:
    for node in pawn.findall('workSettings/priorities/vals/li'):node.text='0'
    for need in pawn.findall('needs/needs/li'):
        if need.findtext('def') in ['Food','Rest']:setval(need,'curLevel','0.95')
for i,pos in enumerate(config['beds']):
    b=E.SubElement(things,'thing',{'Class':'Building_Bed'})
    for k,v in [('def','SleepingSpot'),('id',f'SleepingSpot{990001+i}'),('map','0'),('pos',f"({pos['x']}, 0, {pos['z']})"),('rot','0'),('faction',target.findtext('faction')),('medical','True'),('alreadySetDefaultMed','True')]:setval(b,k,v)
# This is an explicitly authored geometric fixture, validated in the running game.
actor=next(p for p in pawns if 'Thing_'+p.findtext('id')==config['actor'])
setval(actor,'pos',f"({config['origin']['x']}, 0, {config['origin']['z']})")
stack=next(t for t in things if t.findtext('def')=='Steel')
source=config['source'];dest=config['destination']
setval(stack,'pos',f"({source['x']}, 0, {source['z']})");setval(stack,'stackCount','75');setval(stack,'forbidden','False')
zones=m.find('zoneManager/allZones')
zone=E.SubElement(zones,'li',{'Class':'Zone_Stockpile'})
for k,v in [('ID','990'),('label','Reconsideration fixture'),('baseLabel','Stockpile'),('color','(0.5, 0.5, 0.5, 1)')]:setval(zone,k,v)
cells=E.SubElement(zone,'cells');setval(cells,'li',f"({dest['x']}, 0, {dest['z']})")
settings=E.SubElement(zone,'settings');setval(settings,'priority','Normal')
filt=E.SubElement(settings,'filter');E.SubElement(filt,'disallowedSpecialFilters');setval(E.SubElement(filt,'allowedDefs'),'li','Steel')
uid=r.find('.//uniqueIDsManager')
if uid is not None:
    for key in ['nextThingID','nextHediffID']:
        n=uid.find(key)
        if n is not None:n.text=str(max(int(n.text),990010))
with open(dst,'xb') as f:r.write(f,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'operator-authored anesthesia and medical sleeping spots','target':config['target'],'beds':config['beds']}))
