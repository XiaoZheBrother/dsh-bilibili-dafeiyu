import hashlib
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer
from portrait import portrait_snapshot
from server import handler_for


class PortraitTests(unittest.TestCase):
    def test_sources_preserve_authorship_and_original_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp)
            records={'self/a.json':{'author':'鱼','text':'- **我的偏好。** 喜欢直接说。\n- **另一条。** 保留疑问。'},
                     'partner/a.json':{'author':'搭档','text':'我希望她说短点'},
                     'self/b.json':{'text':'我喜欢这个，但未署名'}}
            for name,value in records.items():
                p=home/'feiyu-runtime/writing'/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(value,ensure_ascii=False),encoding='utf8')
            config=home/'feiyu-runtime/config.json';config.write_text('{"memoryName":"fish"}')
            p=home/'soul-md/memory/fish/topics/mixed.md';p.parent.mkdir(parents=True);p.write_text('我喜欢玩游戏\n搭档说我应该学习',encoding='utf8')
            before={str(p):p.read_bytes() for p in home.rglob('*') if p.is_file()}
            result=portrait_snapshot(home)
            self.assertEqual({str(p):p.read_bytes() for p in home.rglob('*') if p.is_file()},before)
            self.assertEqual(len([e for e in result['entries'] if e['category']=='self']),2)
            self.assertEqual(len([e for e in result['entries'] if e['category']=='partner']),1)
            self.assertEqual(len([e for e in result['entries'] if e['category']=='unknown']),2)
            self.assertFalse(any(e['category']=='system' for e in result['entries']))
            for entry in result['entries']:
                source=result['sources'][entry['sourceIds'][0]]
                self.assertIn(entry['text'],source['body'])
                self.assertEqual(source['hash'],hashlib.sha256((home/source['path']).read_bytes()).hexdigest())

    def test_bad_documents_do_not_become_preferences(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);root=home/'feiyu-runtime/writing/self';root.mkdir(parents=True)
            for name,raw in [('a','null'),('b','[]'),('c','{'),('d','{"author":"fish","text":4}')]:
                (root/(name+'.json')).write_text(raw)
            (home/'feiyu-runtime/config.json').write_text('{"memoryName":"../../other"}')
            result=portrait_snapshot(home)
            self.assertEqual(result['entries'],[]);self.assertTrue(result['warnings'])

    def test_non_object_config_returns_warning(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);root=home/'feiyu-runtime';root.mkdir()
            for raw in ['null', '[]', '42']:
                (root/'config.json').write_text(raw)
                result=portrait_snapshot(home)
                self.assertEqual(result['entries'], [])
                self.assertTrue(result['warnings'])

    def test_read_only_preview_blocks_all_writes_and_foreign_reads(self):
        with tempfile.TemporaryDirectory() as temp:
            home=Path(temp);http=ThreadingHTTPServer(('127.0.0.1',0),handler_for(home,0,read_only=True))
            port=http.server_port;http.RequestHandlerClass=handler_for(home,port,read_only=True)
            worker=threading.Thread(target=http.serve_forever,daemon=True);worker.start()
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            try:
                base=f'http://127.0.0.1:{port}'
                with opener.open(base+'/api/portrait') as response:self.assertTrue(json.load(response)['readOnly'])
                for path in ['/api/settings','/api/media/submit','/api/login/start']:
                    with self.assertRaises(urllib.error.HTTPError) as e:
                        opener.open(urllib.request.Request(base+path,data=b'{}',headers={'Content-Type':'application/json'}))
                    self.assertEqual(e.exception.code,403)
                with self.assertRaises(urllib.error.HTTPError) as e:
                    opener.open(urllib.request.Request(base+'/api/portrait',headers={'Origin':'https://outside.example'}))
                self.assertEqual(e.exception.code,403)
                self.assertEqual(list(home.iterdir()),[])
            finally:http.shutdown();http.server_close();worker.join()


if __name__=='__main__':unittest.main()
