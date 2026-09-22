#!/usr/bin/env python3
"""Operator-only disposable COPY: anesthetized colonist and two medical sleeping spots.
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
uid=r.find('.//uniqueIDsManager')
if uid is not None:
    for key in ['nextThingID','nextHediffID']:
        n=uid.find(key)
        if n is not None:n.text=str(max(int(n.text),990010))
with open(dst,'xb') as f:r.write(f,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'operator-authored anesthesia and medical sleeping spots','target':config['target'],'beds':config['beds']}))
