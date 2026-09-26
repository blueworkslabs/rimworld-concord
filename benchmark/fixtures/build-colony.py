#!/usr/bin/env python3
"""Build private T2/T3 fixtures; never commit inputs/outputs (licensed game saves).
Room template is native-authored; copy only its walls/door and local roof cells.
All other original world/pawn state is preserved except disclosed time/need/resource edits.
"""
import argparse,base64,copy,hashlib,json,re,struct,zlib
from pathlib import Path
import xml.etree.ElementTree as E
p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--room',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
sha=lambda b:hashlib.sha256(b).hexdigest()
source=a.source.read_bytes();room=a.room.read_bytes()
assert sha(source)=='f59c261f0737c999a6923dde87d01ce565d4b61083f41566a3b2af79feb86f0c'
assert sha(room)=='a922576a841fd1847838806009e007ace9c15de54e82ace6469089e47c598611'
base=E.fromstring(source);template=E.fromstring(room);a.out.mkdir(parents=True,exist_ok=True)
def pos(t):
 v=re.fullmatch(r'\((\d+), 0, (\d+)\)',t.findtext('pos',''));return (int(v[1]),int(v[2])) if v else (-1,-1)
def inside(t):
 x,z=pos(t);return 76<=x<=80 and 80<=z<=84
manifest={'sourceSha256':sha(source),'roomTemplateSha256':sha(room),'fixtures':{}}
for name in ['T2','T3']:
 r=copy.deepcopy(base);m=r.find('game/maps/li');things=m.find('things');crew=[t for t in things if t.findtext('id') in ['Human405','Human408','Human411']];assert len(crew)==3
 # Shift local time from 6h to 18h without simulating jobs or needs.
 clock=r.find('game/tickManager/gameStartAbsTick');assert clock is not None and clock.text=='17500';clock.text='47500'
 assert r.findtext('game/tickManager/ticksGame')=='1'
 if name=='T2':
  for pawn in crew:
   for n in pawn.findall('needs/needs/li'):
    if n.findtext('def') in ['Food','Rest']:n.find('curLevel').text={'Food':'0.1','Rest':'0.4'}[n.findtext('def')]
  wood=[t for t in things if t.findtext('def')=='WoodLog'];assert len(wood)==6
  for t in wood[:3]:t.find('stackCount').text='75'
  for t in wood[3:]:things.remove(t)
 else:
  tm=template.find('game/maps/li');walls=[t for t in tm.find('things') if inside(t) and t.findtext('def') in ['Wall','Door'] and t.findtext('faction')=='Faction_13'];assert len(walls)==16
  assert sum(t.findtext('def')=='Door' for t in walls)==1
  for t in list(things):
   if inside(t):assert t not in crew;things.remove(t)
  for t in walls:things.append(copy.deepcopy(t))
  def roofs(map):return list(struct.unpack('<22500H',zlib.decompress(base64.b64decode(map.findtext('roofGrid/roofsDeflate')),-15)))
  grid,other=roofs(m),roofs(tm)
  assert all(other[z*150+x]!=0 for x in range(77,80) for z in range(81,84))
  for x in range(76,81):
   for z in range(80,85):grid[z*150+x]=other[z*150+x]
  c=zlib.compressobj(wbits=-15);packed=struct.pack('<22500H',*grid);m.find('roofGrid/roofsDeflate').text=base64.b64encode(c.compress(packed)+c.flush()).decode()
  ident=r.find('game/uniqueIDsManager/nextThingID');ident.text=str(max(int(re.search(r'\d+$',t.findtext('id'))[0])+1 for t in things))
 data=E.tostring(r,encoding='utf-8',xml_declaration=True);file=a.out/('lab-concord-'+name.lower()+'-20260926.rws')
 with file.open('xb') as f:f.write(data)
 manifest['fixtures'][name]={'name':file.stem,'sha256':sha(data),'startLocalHour':18,'deadlineTick':10000,'deadlineLocalHour':22,'pawnIds':[405,408,411]}
with (a.out/'fixture-manifest.json').open('x') as f:json.dump(manifest,f,indent=2)
print(json.dumps(manifest,indent=2))
