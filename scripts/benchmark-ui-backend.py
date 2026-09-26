#!/usr/bin/env python3
"""UI-only transport, derived from the frozen 2026-09-25 corrected adapter.
No bridge, save, repository or checker reads. One JSON argument, one JSON reply.
DISPLAY/XAUTHORITY are supplied by the trusted staging wrapper, never by the model.
"""
import base64,json,os,subprocess,sys

def run(args):
 return subprocess.run(args,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8).stdout

def main(a):
 op=a['op']
 if op=='screenshot':
  png=run(['ffmpeg','-v','error','-f','x11grab','-video_size','1280x800','-i',os.environ['DISPLAY'],'-frames:v','1','-f','image2pipe','-vcodec','png','-'])
  return {'image':base64.b64encode(png).decode(),'mimeType':'image/png'}
 if op=='click':
  x,y,button=a['x'],a['y'],a.get('button',1)
  if any(type(v)!=int for v in (x,y,button)) or not(0<=x<1280 and 0<=y<800 and 1<=button<=5):raise ValueError('Invalid click')
  run(['xdotool','mousemove',str(x),str(y),'click',str(button)])
 elif op=='key':
  key=a['key']
  if key not in ['Escape','space','1','2','3','Return','Tab','BackSpace','Delete','Up','Down','Left','Right','Home','End','plus','minus']+list('abcdefghijklmnopqrstuvwxyz'):raise ValueError('Unsupported key')
  run(['xdotool','key','--clearmodifiers',key])
 elif op=='type':
  text=a['text']
  if not isinstance(text,str) or len(text)>120 or not text.isprintable():raise ValueError('Printable text, at most 120 characters required')
  run(['xdotool','type','--clearmodifiers','--delay','70','--',text])
 else:raise ValueError('Unknown UI operation')
 return {'ok':True,'gameAcceptance':'not inferred; inspect the next screenshot'}

try:print(json.dumps(main(json.loads(sys.argv[1]))))
except Exception as e:
 print(json.dumps({'error':str(e)}));sys.exit(1)
