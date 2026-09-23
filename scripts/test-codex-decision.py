import importlib.util,pathlib,unittest,queue,time,json,tempfile
spec=importlib.util.spec_from_file_location('helper',pathlib.Path(__file__).with_name('run-codex-decision.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Transport(unittest.TestCase):
 def client(self,events):
  c=object.__new__(m.Client);c.q=queue.Queue()
  for e in events:c.q.put(e)
  return c
 def test_server_requests_and_executable_items_rejected(self):
  for e in [{'id':1,'method':'item/tool/call'},{'method':'item/completed','params':{'item':{'type':'commandExecution'}}}]:
   with self.assertRaises(Exception):self.client([e]).receive(time.monotonic()+1)
 def test_zero_tool_request_enforced(self):
  for r in [{'model':m.MODEL,'tools':[{'type':'shell'}]},{'model':m.MODEL,'input':[{'type':'additional_tools','tools':[{}]}]},{'model':'other'}]:
   with self.assertRaises(AssertionError):m.assert_no_tools(r)
  m.assert_no_tools({'model':m.MODEL,'tools':[]})
 def test_provider_is_native_no_api_fallback_or_retry(self):
  c=m.config(pathlib.Path('/frozen/catalog.json'));p=c['model_providers.'+m.NATIVE_PROVIDER]
  self.assertTrue(p['requires_openai_auth']);self.assertEqual(p['base_url'],m.NATIVE_URL);self.assertEqual(p['request_max_retries'],0);self.assertEqual(p['stream_max_retries'],0)
  self.assertFalse(c['features.shell_tool']);self.assertFalse(c['features.apps']);self.assertFalse(c['orchestrator.mcp.enabled'])
 def test_fast_completion_correlated_to_exact_turn(self):
  c=self.client([]);c.cwd=pathlib.Path('/empty');c.events=[];c.provider=m.NATIVE_PROVIDER
  def rpc(method,params,deadline):
   if method=='thread/start':return {'model':m.MODEL,'modelProvider':m.NATIVE_PROVIDER,'approvalPolicy':'never','thread':{'id':'t','ephemeral':True}}
   c.events=[{'method':'item/completed','params':{'threadId':'t','turnId':'old','item':{'type':'agentMessage','text':'WRONG'}}},{'method':'item/completed','params':{'threadId':'t','turnId':'v','item':{'type':'agentMessage','text':'RIGHT'}}},{'method':'turn/completed','params':{'threadId':'t','turn':{'id':'v','status':'completed'}}}]
   return {'turn':{'id':'v'}}
  c.rpc=rpc;r=c.run({'id':'case','instructions':'x','prompt':'x','schema':{}});self.assertEqual(r['rawText'],'RIGHT');self.assertIsNone(r['usage'])
if __name__=='__main__':unittest.main()
