import importlib.util,pathlib,unittest
spec=importlib.util.spec_from_file_location('probe',pathlib.Path(__file__).with_name('run-codex-contract.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
class GuardTests(unittest.TestCase):
 def test_no_tool_check_covers_lite_and_regular_formats(self):
  p.assert_no_tools({'model':p.MODEL,'tools':[],'input':[{'type':'additional_tools','tools':[]}]})
  for request in [{'model':p.MODEL,'tools':[{'name':'shell'}]},{'model':p.MODEL,'input':[{'type':'additional_tools','tools':[{'type':'namespace','name':'functions','tools':[]}]}]},{'model':'wrong'}]:
   with self.assertRaises(AssertionError):p.assert_no_tools(request)
 def test_native_configuration_has_no_provider_or_auth_fallback(self):
  c=p.config(pathlib.Path('/tmp/frozen-catalog.json'));self.assertEqual(c['model_provider'],p.NATIVE_PROVIDER);self.assertNotIn('model_providers.openai',c)
  provider=c['model_providers.'+p.NATIVE_PROVIDER];self.assertEqual(provider['base_url'],p.NATIVE_URL);self.assertIs(provider['requires_openai_auth'],True);self.assertEqual(c['notify'],[])
  for name in ['shell_tool','apps','plugins','hooks','multi_agent','memories']:self.assertIs(c['features.'+name],False)
  self.assertIs(c['orchestrator.skills.enabled'],False);self.assertIs(c['orchestrator.mcp.enabled'],False)
  self.assertEqual(provider['request_max_retries'],0);self.assertEqual(provider['stream_max_retries'],0)
 def test_tool_items_and_server_requests_fail_before_consumption(self):
  import queue,time
  c=object.__new__(p.Client);c.q=queue.Queue()
  for x in [{'id':5,'method':'item/commandExecution/requestApproval'},{'method':'item/started','params':{'item':{'type':'commandExecution'}}}]:
   c.q.put(x)
   with self.assertRaises((RuntimeError,AssertionError)):c.receive(time.monotonic()+1)
 def test_expired_deadline_rejects_even_queued_events(self):
  import queue,time
  c=object.__new__(p.Client);c.q=queue.Queue();c.q.put({'method':'item/agentMessage/delta'})
  with self.assertRaises(TimeoutError):c.receive(time.monotonic()-1)
 def test_fast_completion_before_ack_is_not_lost(self):
  c=object.__new__(p.Client);c.cwd=pathlib.Path('/tmp/empty');c.provider='probe';c.events=[]
  def rpc(method,params,deadline):
   if method=='thread/start':return {'model':p.MODEL,'modelProvider':'probe','approvalPolicy':'never','instructionSources':[],'thread':{'id':'t','ephemeral':True}}
   c.events=[{'method':'item/completed','params':{'threadId':'t','item':{'type':'agentMessage','text':'{}'}}},{'method':'turn/completed','params':{'threadId':'t','turn':{'id':'turn','status':'completed'}}}]
   return {'turn':{'id':'turn'}}
  c.rpc=rpc;c.receive=lambda deadline:self.fail('Should consume buffered completion')
  r=c.run({'id':'quiet','instructions':'test','prompt':'test','schema':{}});self.assertEqual(r['status'],'completed');self.assertEqual(r['rawText'],'{}')
 def test_started_turn_is_retained_and_repeat_run_rejected(self):
  import tempfile,json,sys
  from unittest.mock import patch
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);catalog=root/'catalog.json';cases=root/'cases.json';out=root/'run'
   catalog.write_text(json.dumps({'models':[{'slug':p.MODEL,'tool_mode':'direct','multi_agent_version':'disabled','supports_search_tool':False}]}))
   cases.write_text(json.dumps({'version':'concord-contract-v1','authored':True,'cases':[{'id':id,'prompt':'{}'} for id in p.CASE_IDS]}))
   class Fake:
    def __init__(self,*a):pass
    def initialize(self):pass
    def account(self):pass
    def run(self,case):
     saved=json.loads((out/'receipt.json').read_text());assert saved['attempts']==1 and saved['results'][0]['status']=='started'
     raise TimeoutError('retained failure')
    def close(self):pass
   argv=['probe',str(cases),str(catalog),str(out),'--live']
   with patch.object(sys,'argv',argv),patch.object(p,'Client',Fake),patch.object(p,'preflight',return_value={'toolsExposed':0}),patch.object(p.subprocess,'check_output',return_value='test-version'):
    with self.assertRaises(TimeoutError):p.main()
    saved=json.loads((out/'receipt.json').read_text());self.assertEqual(saved['attempts'],1);self.assertEqual(saved['results'][0]['status'],'failed')
    with self.assertRaises(FileExistsError):p.main()
if __name__=='__main__':unittest.main()
