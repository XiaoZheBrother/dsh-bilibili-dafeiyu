import asyncio, importlib.util, json, os, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
import aiohttp

class PrefillTest(unittest.TestCase):
    def test_structured_controls_speech_usage_failure_and_hot_off(self):
        class Response:
            status=200
            def __init__(self,payload):self._body=json.dumps(payload).encode()
            async def json(self):return json.loads(self._body)
            def raise_for_status(self):
                if self.status>=400:raise RuntimeError('provider failed')
        def packet(value):return {'choices':[{'finish_reason':'stop','message':{'content':value}}],'usage':{'prompt_tokens':10,'completion_tokens':2}}
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder);(home/'bili-duty').mkdir();path=home/'bili-duty/comment-prefill.json'
            calls=[];reply={'kind':'chat'};fail=False;hot_off=False
            async def fake(self,method,url,**kw):
                calls.append(kw['json'])
                if kw['json'].get('response_format'):
                    if hot_off:path.write_text(json.dumps({'enabled':False,'prefix':'kept'}))
                    return Response(packet(json.dumps(reply)))
                response=Response(packet('新说法，尚未完成'))
                if fail:response.status=500
                return response
            with patch.dict(os.environ,{'DAFEIYU_PREFILL_HOME':folder}),patch.object(aiohttp.ClientSession,'_request',fake):
                spec=importlib.util.spec_from_file_location('structured_hook',Path(__file__).parent/'lib/prefill_python/sitecustomize.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
                body={'model':'deepseek-flash','messages':[{'role':'user','content':'JSON'}],'response_format':{'type':'json_object'}}
                path.write_text(json.dumps({'enabled':True,'prefix':'chosen'}))
                r=asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=body));self.assertEqual(len(calls),1);self.assertEqual(json.loads(asyncio.run(r.json())['choices'][0]['message']['content']),reply)
                reply={'text':'旧说法，尚未完成'};calls.clear()
                r=asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=body));p=asyncio.run(r.json());self.assertEqual(len(calls),2);self.assertNotIn('response_format',calls[1]);self.assertEqual(p['usage']['prompt_tokens'],20);self.assertEqual(json.loads(p['choices'][0]['message']['content'])['text'],'新说法，尚未完成')
                fail=True
                with self.assertRaises(RuntimeError):asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=body))
                fail=False;hot_off=True;calls.clear()
                asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=body));self.assertEqual(len(calls),1)

    def test_hot_switch_and_json_controls(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder);(home/'bili-duty').mkdir();path=home/'bili-duty/comment-prefill.json'
            calls=[]
            async def fake(self,method,url,**kw):
                calls.append((url,kw));return type('Response',(),{'status':200})()
            with patch.dict(os.environ,{'DAFEIYU_PREFILL_HOME':folder}),patch.object(aiohttp.ClientSession,'_request',fake):
                spec=importlib.util.spec_from_file_location('test_prefill_hook',Path(__file__).parent/'lib/prefill_python/sitecustomize.py');mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
                original={'model':'deepseek-flash','messages':[{'role':'user','content':'JSON'}],'max_tokens':900}
                for enabled,prefix in [(True,'first'),(True,'second'),(False,'kept')]:
                    path.write_text(json.dumps(dict(enabled=enabled,prefix=prefix)))
                    asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=original))
                    url,kw=calls[-1];body=kw['json'];self.assertEqual(body['max_tokens'],900)
                    if enabled:self.assertEqual(body['messages'][-1]['reasoning_content'],prefix)
                    else:self.assertEqual(body,original);self.assertEqual(url,'https://api.deepseek.com/chat/completions')
                self.assertEqual(len(original['messages']),1)
                path.write_text(json.dumps(dict(enabled=True,prefix='third')))
                body=dict(original,tools=[{'type':'function'}]);asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=body));self.assertEqual(calls[-1][1]['json'],body)
                asyncio.run(mod._prefilled_request(None,'POST','https://unrelated.example/chat/completions',json=original));self.assertEqual(calls[-1][1]['json'],original)
                path.write_text('{')
                with self.assertRaises(ValueError):asyncio.run(mod._prefilled_request(None,'POST','https://api.deepseek.com/chat/completions',json=original))

if __name__=='__main__':unittest.main()
