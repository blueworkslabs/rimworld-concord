#!/usr/bin/env python3
"""New disposable visibility fixtures from campfire-v2; never alter the input save."""
import json,sys,re,xml.etree.ElementTree as E
src,dst,variant=sys.argv[1:]
assert variant in ('near','far')
r=E.parse(src);things=r.find('.//maps/li/things');pawns=[p for p in things if p.findtext('def')=='Human'];assert len(pawns)==3
assert not any(t.findtext('def') in ['Campfire','ElectricStove','FueledStove'] for t in things)
berries=[t for t in things if t.findtext('def')=='RawBerries'];assert len(berries)==3
for t in berries[1:]:things.remove(t)
p=pawns[0];x,y,z=map(int,re.findall(r'-?\d+',p.findtext('pos')))
t=berries[0];t.find('pos').text=f'({x+(13 if variant=="far" else 0)}, {y}, {z})';t.find('forbidden').text='True'
for p in pawns:
 for need in p.findall('needs/needs/li'):
  if need.findtext('def')=='Food':need.find('curLevel').text='.1'
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'observer':'Thing_'+pawns[0].findtext('id'),'thing':'Thing_'+t.findtext('id'),'variant':variant,'authoredFood':.1,'forbidden':True,'quantity':75}))
