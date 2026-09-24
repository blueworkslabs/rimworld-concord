#!/usr/bin/env python3
"""Disposable negative fixtures; uses a previously generated hungry fixture."""
import json,re,sys,xml.etree.ElementTree as E
src,dst,variant=sys.argv[1:]
assert variant in ('forbidden','far')
r=E.parse(src);things=r.find('.//maps/li/things')
p=next(t for t in things if t.findtext('id')=='Human405')
x,y,z=map(int,re.findall(r'-?\d+',p.findtext('pos')))
berries=[t for t in things if t.findtext('def')=='RawBerries'];assert len(berries)==3
for t in berries[1:]:things.remove(t)
t=berries[0];t.find('pos').text=f'({x+(13 if variant=="far" else 0)}, {y}, {z})';t.find('forbidden').text='True' if variant=='forbidden' else 'False'
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'actor':'Thing_Human405','thing':'Thing_'+t.findtext('id'),'x':x+(13 if variant=='far' else 0),'z':z,'variant':variant}))
