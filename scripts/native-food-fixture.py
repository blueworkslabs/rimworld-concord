#!/usr/bin/env python3
"""Matched disposable native-food probes; only Alvin's Food differs between cases."""
import json,sys,xml.etree.ElementTree as E
src,dst,variant=sys.argv[1:]
assert variant in ('hungry','urgent')
r=E.parse(src);pawns=[p for p in r.findall('.//maps/li/things/thing') if p.findtext('def')=='Human']
assert len(pawns)==3
for p in pawns:
 level=(.20 if variant=='hungry' else .10) if p.findtext('id')=='Human405' else .90
 for n in p.findall('needs/needs/li'):
  if n.findtext('def')=='Food':n.find('curLevel').text=str(level)
assert sum(p.findtext('id')=='Human405' for p in pawns)==1
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'variant':variant,'actor':'Thing_Human405','food':.20 if variant=='hungry' else .10,'otherFood':.90,'otherState':'unchanged campfire-v2; no issued jobs'}))
