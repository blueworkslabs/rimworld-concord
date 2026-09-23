"""One native Codex character inference with real zero-tool mock preflight.
No game handles, API credentials, native-login extraction or retry. The parent owns
its process group; cancellation terminates this helper and app-server together.
"""
import argparse,hashlib,http.server,json,os,pathlib,queue,signal,subprocess,threading,time,re
if not __debug__:raise RuntimeError('Runtime validation requires normal Python mode')
MODEL='gpt-5.6-luna'
NATIVE_PROVIDER='concord_native'
NATIVE_URL='https://chatgpt.com/backend-api/codex'
EXTRA_INSTRUCTIONS='Return only the requested structured response. No tools or external context.'
def authored_size(case):
 size={k:len(v.encode('utf-8')) for k,v in {'instructionsBytes':case['instructions'],'promptBytes':case['prompt'],'schemaBytes':json.dumps(case['schema'],separators=(',',':'),ensure_ascii=False),'extraInstructionsBytes':EXTRA_INSTRUCTIONS}.items()};size['totalAuthoredBytes']=sum(size.values())
 return size
def digest(data):return hashlib.sha256(data).hexdigest()
def toml(value):
 if isinstance(value,dict):return '{'+','.join(k+'='+toml(v) for k,v in value.items())+'}'
 return json.dumps(value)
def config(catalog,provider=NATIVE_PROVIDER,url=None):
 c={'model':MODEL,'model_provider':provider,'approval_policy':'never','sandbox_mode':'read-only','project_doc_max_bytes':0,'include_environment_context':False,'web_search':'disabled','tools.experimental_request_user_input.enabled':False,'tools.update_plan.enabled':False,'tools.view_image':False,'orchestrator.skills.enabled':False,'orchestrator.mcp.enabled':False,'model_catalog_json':str(catalog),'model_reasoning_effort':'low','notify':[]}
 for f in ['shell_tool','apps','plugins','hooks','multi_agent','multi_agent_v2','memories','skill_search','image_generation','browser_use','browser_use_external','computer_use','in_app_browser','code_mode','code_mode_host','tool_suggest','view_image','sleep_tool','current_time_reminder','token_budget','deferred_executor','enable_request_compression','unbounded_connection_retries']:c['features.'+f]=False
 c['features.skip_host_skill_discovery']=True
 if provider==NATIVE_PROVIDER:c['model_providers.'+provider]={'name':'Concord native ChatGPT','base_url':NATIVE_URL,'wire_api':'responses','requires_openai_auth':True,'request_max_retries':0,'stream_max_retries':0}
 if provider=='probe':c['model_providers.probe']={'name':'local offline check','base_url':url,'wire_api':'responses','requires_openai_auth':False,'request_max_retries':0,'stream_max_retries':0}
 return c
def assert_no_tools(request):
 assert not request.get('tools'),'Top-level tool exposure'
 for item in request.get('input',[]):
  if item.get('type')=='additional_tools':assert not item.get('tools'),'Additional tool exposure'
 assert request['model']==MODEL,'Model changed'
def validate_catalog(catalog):
 d=json.loads(catalog.read_text());assert len(d['models'])==1
 m=d['models'][0];assert m['slug']==MODEL and m['tool_mode']=='direct' and m['multi_agent_version']=='disabled' and m['supports_search_tool'] is False
 return digest(catalog.read_bytes())
def error_diagnostics(error):
 # Never retain provider prose, headers, endpoints, account IDs or reasoning.
 text=json.dumps(error).lower() if error else ''
 criteria={'schema':['schema','oneof','anyof','additionalproperties','response_format'],
 'model':['model'],'authentication':['unauthorized','authentication','401'],
 'quota':['quota','usage limit','rate limit','429'],'transport':['connection','timeout','tls'],
 'unsupported':['unsupported','not supported','not available'],
 'reasoning':['reasoning','effort'],'tier':['service_tier','service tier']}
 return {'present':bool(error),'categories':[k for k,words in criteria.items() if any(w in text for w in words)],
  'httpStatuses':sorted(set(int(n) for n in re.findall(r'\b(400|401|403|404|408|413|422|429|500|502|503|504)\b',text)))}
class Client:
 def __init__(self,root,catalog,provider=NATIVE_PROVIDER,url=None):
  self.q=queue.Queue();self.events=[];self.n=0;self.provider=provider;self.total=0
  cwd=root/'empty';cwd.mkdir(exist_ok=True);self.cwd=cwd
  args=['codex','app-server']
  for k,v in config(catalog,provider,url).items():args+=['-c',k+'='+toml(v)]
  env={k:os.environ[k] for k in ('PATH','HOME','LANG') if k in os.environ}
  self.p=subprocess.Popen(args,cwd=cwd,env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,start_new_session=False)
  threading.Thread(target=self.read,daemon=True).start();threading.Thread(target=self.read_errors,daemon=True).start()
 def read_errors(self):
  total=0
  while True:
   data=self.p.stderr.read(4096)
   if not data:return
   total+=len(data)
   if total>262144:self.q.put(RuntimeError('App server diagnostic limit'));return
 def read(self):
  try:
   for line in iter(lambda:self.p.stdout.readline(1048577),''):
    self.total+=len(line)
    if self.total>1048576:raise RuntimeError('RPC output limit')
    self.q.put(json.loads(line))
  except Exception as e:self.q.put(e)
  finally:self.q.put(RuntimeError('App server closed'))
 def receive(self,deadline):
  remaining=deadline-time.monotonic()
  if remaining<=0:raise TimeoutError('Case deadline expired')
  x=self.q.get(timeout=remaining)
  if isinstance(x,Exception):raise x
  if 'id' in x and 'method' in x:raise RuntimeError('Unexpected server tool/approval request')
  if x.get('method') in ('item/started','item/completed'):
   assert x['params']['item']['type'] in ('userMessage','agentMessage','reasoning'),'Unexpected executable item'
  return x
 def rpc(self,method,params,deadline):
  self.n+=1;n=self.n;self.p.stdin.write(json.dumps({'id':n,'method':method,'params':params})+'\n');self.p.stdin.flush()
  while True:
   x=self.receive(deadline)
   if x.get('id')==n:
    if 'error' in x:raise RuntimeError('App server RPC rejected')
    return x['result']
   self.events.append(x)
 def initialize(self):
  self.rpc('initialize',{'clientInfo':{'name':'concord_native','version':'1'},'capabilities':{'experimentalApi':True}},time.monotonic()+15)
  self.p.stdin.write(json.dumps({'method':'initialized','params':{}})+'\n');self.p.stdin.flush()
 def account(self):
  # Do not retain account identifiers or credentials, only enforce sign-in route.
  a=self.rpc('account/read',{'refreshToken':False},time.monotonic()+15)
  assert a.get('account',{}).get('type')=='chatgpt','Native ChatGPT login required; no API fallback'
 def run(self,case):
  self.events=[];began=time.monotonic();deadline=began+60
  t=self.rpc('thread/start',{'model':MODEL,'modelProvider':self.provider,'environments':[],'dynamicTools':[],'ephemeral':True,'approvalPolicy':'never','sandbox':'read-only','baseInstructions':case['instructions'],'developerInstructions':EXTRA_INSTRUCTIONS,'cwd':str(self.cwd),'allowProviderModelFallback':False},deadline)
  assert t['model']==MODEL and t['modelProvider']==self.provider and t['approvalPolicy']=='never' and not t.get('instructionSources'),'Unexpected model, provider or instructions'
  tid=t['thread']['id'];assert t['thread']['ephemeral'] is True
  turn=self.rpc('turn/start',{'threadId':tid,'environments':[],'input':[{'type':'text','text':case['prompt']}],'effort':'low','serviceTierForTurn':'default','outputSchema':case['schema']},deadline)
  turnid=turn['turn']['id'];text=None;usage=None
  # Fast responses can emit completion before the turn/start RPC acknowledgement.
  backlog=list(self.events);self.events=[]
  while True:
   if time.monotonic()>=deadline:raise TimeoutError('Case deadline expired')
   x=backlog.pop(0) if backlog else self.receive(deadline);self.events.append(x);p=x.get('params',{})
   if p.get('threadId')!=tid:continue
   if x.get('method')=='item/completed' and p.get('turnId')==turnid and p['item']['type']=='agentMessage':text=p['item']['text']
   if x.get('method')=='thread/tokenUsage/updated':usage=p['tokenUsage']['total']
   if x.get('method')=='turn/completed' and p['turn']['id']==turnid:
    status=p['turn']['status'];diagnostic=error_diagnostics(p['turn'].get('error'));error=diagnostic['present'];break

  return {'authoredSize':authored_size(case),'id':case['id'],'model':t['model'],'status':status,'error':error,'diagnostic':diagnostic,'elapsedMs':round((time.monotonic()-began)*1000),'usage':usage,'rawText':text}
 def close(self):
  try:self.p.terminate()
  except ProcessLookupError:pass
  try:self.p.wait(timeout=2)
  except subprocess.TimeoutExpired:self.p.kill();self.p.wait(timeout=2)
  self.p.stdin.close();self.p.stdout.close();self.p.stderr.close()
def preflight(root,catalog,cases):
 requests=[]
 class Handler(http.server.BaseHTTPRequestHandler):
  def log_message(self,*args):pass
  def do_POST(self):
   assert not self.headers.get('Authorization'),'Mock must never receive authentication'
   request=json.loads(self.rfile.read(int(self.headers['Content-Length'])));assert_no_tools(request);requests.append(request)
   self.send_response(200);self.send_header('Content-Type','text/event-stream');self.end_headers()
   msg={'id':'msg_mock','type':'message','role':'assistant','content':[{'type':'output_text','text':'{"reflection":{"choice":"keep_current_activity","reason":"Mock only"}}'}]}
   for typ,data in [('response.created',{'response':{'id':'resp_mock'}}),('response.output_item.done',{'output_index':0,'item':msg}),('response.completed',{'response':{'id':'resp_mock','status':'completed','output':[msg],'usage':{'input_tokens':1,'output_tokens':1,'total_tokens':2}}})]:self.wfile.write(('event: '+typ+'\ndata: '+json.dumps({'type':typ,**data})+'\n\n').encode())
   self.wfile.flush()
 server=http.server.HTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=server.serve_forever,daemon=True).start();client=Client(root,catalog,'probe',f'http://127.0.0.1:{server.server_port}/v1')
 try:
  client.initialize()
  for case in cases:assert client.run(case)['status']=='completed'
  assert len(requests)==len(cases)
  (root/'preflight.json').write_text(json.dumps({'requests':len(requests),'toolsExposed':0}))
  return {'requests':len(requests),'toolsExposed':0,'modelInference':False}
 finally:client.close();server.shutdown();server.server_close()

def main():
 parser=argparse.ArgumentParser();parser.add_argument('request',type=pathlib.Path);parser.add_argument('catalog',type=pathlib.Path);parser.add_argument('output',type=pathlib.Path);parser.add_argument('--preflight-only',action='store_true');args=parser.parse_args()
 os.umask(0o077);root=args.output.resolve();root.mkdir() # exclusive attempt, no replay
 receipt={'status':'started','stage':'setup','model':MODEL,'usage':None,'rawText':None};client=None
 def save():
  tmp=root/'result.tmp';tmp.write_text(json.dumps(receipt));tmp.replace(root/'result.json')
 def interrupted(*_):raise KeyboardInterrupt()
 signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
 try:
  data=args.request.read_bytes()
  if len(data)>64000:raise ValueError('Request too large')
  case=json.loads(data)
  if set(case)!={'id','instructions','prompt','schema'} or len(case['prompt'].encode())>24000:raise ValueError('Invalid request')
  catalog=args.catalog.resolve();catalogHash=validate_catalog(catalog)
  receipt.update({'catalogHash':catalogHash,'requestHash':digest(data),'stage':'isolation'});save()
  receipt['preflight']=preflight(root,catalog,[case]);save()
  if args.preflight_only:receipt['status']='preflight-completed';return
  if validate_catalog(catalog)!=catalogHash:raise RuntimeError('Catalog changed')
  receipt['stage']='authentication';save();client=Client(root,catalog);client.initialize();client.account()
  receipt['stage']='inference';save();answer=client.run(case)
  receipt.update(answer);receipt['stage']='completed'
 except (Exception,KeyboardInterrupt):
  receipt['status']='failed'
 finally:
  if client:client.close()
  save()
if __name__=='__main__':main()
