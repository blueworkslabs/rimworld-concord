#!/usr/bin/env python3
"""Disposable authored scenario. Existing characters unchanged; no ready meals.
Input is a prior disposable needs fixture, output must be a new file.
Native self-care remains enabled; raw berries are a real alternative to cooking.
"""
import json,sys,xml.etree.ElementTree as E
src,dst=sys.argv[1:]
r=E.parse(src);m=r.find('.//maps/li');assert m is not None
things=m.find('things');assert things is not None
pawns=[p for p in things if p.findtext('def')=='Human'];assert len(pawns)==3
assert not any(t.findtext('def') in ['Campfire','ElectricStove','FueledStove'] for t in things)
meals=[t for t in things if (t.findtext('def') or '').startswith('Meal')];assert len(meals)>=3
for t in meals:things.remove(t)
for i,(pawn,meal) in enumerate(zip(pawns,meals)):
 for n in pawn.findall('needs/needs/li'):
  if n.findtext('def')=='Food':n.find('curLevel').text=str([.4,.65,.55][i])
  if n.findtext('def')=='Rest':n.find('curLevel').text='.9'
 for n in pawn.findall('workSettings/priorities/vals/li'):n.text='0'
 raw=E.SubElement(things,'thing',{'Class':'ThingWithComps'})
 for key,value in [('def','RawBerries'),('id',meal.findtext('id').replace('MealSurvivalPack','RawBerries')),('pos',meal.findtext('pos')),('stackCount','75'),('forbidden','False')]:E.SubElement(raw,key).text=value
with open(dst,'xb') as out:r.write(out,encoding='utf-8',xml_declaration=True)
print(json.dumps({'fixture':'campfire-v1','removedReadyMealStacks':len(meals),'rawBerries':225,'pawns':[p.findtext('id') for p in pawns],'skillsAndTraits':'unchanged','nativeSelfCare':True,'ordinaryWorkPriorities':'disabled; agreement jobs only'}))
