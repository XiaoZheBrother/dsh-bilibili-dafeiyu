"""Loopback viewer and narrow settings adapter; no model or scheduler execution."""
import argparse
import json
import re
import sqlite3
import os
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from pond import Pond, PondError
import media_actions as media

HERE = Path(__file__).resolve().parent
DEFAULT_HOME = Path(os.environ.get('DSH_HOME', str(Path.home()/'.dsh')))
STATIC = {'/media.js': ('media.js','text/javascript; charset=utf-8'), '/': ('index.html','text/html; charset=utf-8'), '/app.js': ('app.js','text/javascript; charset=utf-8'),
          '/style.css': ('style.css','text/css; charset=utf-8'),
          '/settings.js': ('settings.js','text/javascript; charset=utf-8'),
          '/assets/moonlit-whale-v1.png': ('assets/moonlit-whale-v1.png','image/png'),
          '/assets/feiyu-avatar-v1.png': ('assets/feiyu-avatar-v1.png','image/png')}

def character_snapshot(home):
    result={'experiences':[],'relationships':[],'creations':[],'decisions':[],'operations':[],'warnings':[]}
    file=home/'feiyu-runtime/character.sqlite3'
    if not file.exists():return result
    try:
        with closing(sqlite3.connect(file.resolve().as_uri()+'?mode=ro',uri=True,timeout=3)) as db:
            db.row_factory=sqlite3.Row;db.execute('PRAGMA query_only=ON')
            result['experiences']=[dict(r) for r in db.execute("SELECT * FROM experiences WHERE NOT (kind='interaction' AND CASE WHEN json_valid(body) THEN COALESCE(json_extract(body,'$.type'),'') ELSE '' END='scan') ORDER BY rowid DESC LIMIT 2000")]
            for r in result['experiences']:
                if r['occurred']:continue
                try:
                    raw=json.loads(r['body']);value=next((raw[k] for k in ('ts','at','d','date') if raw.get(k) is not None),None)
                    if isinstance(value,(int,float)):r['occurred']=datetime.fromtimestamp(value/(1000 if value>=1e12 else 1),timezone.utc).isoformat()
                    elif isinstance(value,str) and re.match(r'^\d{4}-\d{2}-\d{2}',value):
                        parsed=datetime.fromisoformat(value.replace('Z','+00:00'));r['occurred']=value if len(value)==10 else parsed.astimezone(timezone.utc).isoformat()
                except (ValueError,TypeError,AttributeError,OverflowError,OSError):pass
            def event_time(row):
                try:return datetime.fromisoformat((row['occurred'] or row['captured']).replace('Z','+00:00')).timestamp()
                except (TypeError,ValueError,OSError):return 0
            result['experiences'].sort(key=event_time,reverse=True)
            result['experiences']=result['experiences'][:100]
            for r in result['experiences']:
                r['truncated']=len(r['body'])>12000;r['body']=r['body'][:12000]
            for kind,key in [('relationship','relationships'),('creation','creations'),('decision','decisions')]:
                result[key]=[dict(r,payload=json.loads(r['payload'])) for r in db.execute('SELECT * FROM authored WHERE kind=? ORDER BY rowid DESC LIMIT 100',(kind,))]
            result['operations']=[dict(r) for r in db.execute('SELECT * FROM operations ORDER BY started DESC LIMIT 50')]
    except (sqlite3.Error,ValueError):result['warnings'].append('经历账本暂时不可读，旧手记仍保留。')
    return result

def writing_creations(home):
    """Project existing author drafts; never import checks, prompts or partner feedback."""
    root=home/'feiyu-runtime/writing'
    rows=[]
    for pattern in ('drafts/*/original.json','drafts/*/revise-*.json',
                    'experiments/*/script.json','experiments/*/revision-*.json','experiments/*/naming-script-*.json'):
        for path in root.glob(pattern):
            try:
                if path.is_symlink() or not path.resolve().is_relative_to(root.resolve()) or path.stat().st_size>500000:continue
                doc=json.loads(path.read_text(encoding='utf8'))
                if not isinstance(doc,dict):continue
                if 'author' not in doc and path.name.startswith('revise-'):
                    origin=json.loads((path.parent/'original.json').read_text(encoding='utf8'))
                    author=origin.get('author')
                else:author=doc.get('author')
                body=doc.get('text')
                if not author or not isinstance(body,str) or not body.strip():continue
                heading=re.search(r'《([^》\n]{1,100})》',body)
                title=heading.group(1) if heading else body.strip().splitlines()[0].strip('*')[:60]
                revision=path.name.startswith(('revise-','revision-'))
                rows.append({'id':path.relative_to(root).as_posix(),'subject':path.parent.name,
                             'at':datetime.fromtimestamp(path.stat().st_mtime,timezone.utc).isoformat(),
                             'payload':{'title':title,'body':body,'state':'draft','author':author,
                                        'label':'写作台 · 修订稿' if revision else '写作台 · 原稿'}})
            except (ValueError,OSError,TypeError,AttributeError):continue
    return rows

def read_snapshot(home):
    warnings=[];artifacts=[];memories=[];publications=[];queue=[]
    database=home/'agent-growth/growth.sqlite3'
    if database.exists():
        try:
            with closing(sqlite3.connect(database.resolve().as_uri()+'?mode=ro',uri=True,timeout=3)) as db:
                db.execute('PRAGMA query_only=ON')
                rows=db.execute("SELECT id,kind,state,due,result FROM jobs ORDER BY due DESC LIMIT 100").fetchall()
                for key,kind,state,due,raw in rows:
                    queue.append({'id':key,'kind':kind,'state':state})
                    if state!='done' or not raw:continue
                    try:r=json.loads(raw)
                    except ValueError:
                        warnings.append('一份成长记录无法解析，已跳过。');continue
                    if not isinstance(r,dict):
                        warnings.append('一份成长记录格式异常，已跳过。');continue
                    citations=r.get('citations',[])
                    if not isinstance(citations,list):
                        warnings.append('一份来源列表格式异常，正文仍保留。');citations=[]
                    exploration=r.get('exploration')
                    if exploration is not None:
                        if (not isinstance(exploration,dict) or not isinstance(exploration.get('interests'),list)
                            or any(not isinstance(i,dict) or not all(isinstance(i.get(k),str) for k in ('id','question','why','status')) for i in exploration['interests'])
                            or not all(isinstance(exploration.get(k),str) for k in ('surprise','nextExperiment'))
                            or not isinstance(exploration.get('share'),dict)
                            or exploration['share'].get('decision') not in ('hold','candidate')
                            or not isinstance(exploration['share'].get('reason'),str)):
                            warnings.append('一份探索结构异常，保留原稿供查看。');exploration=None
                    artifacts.append({'id':key,'kind':kind,'title':str(r.get('title','未命名记录'))[:200],
                        'body':str(r.get('body',''))[:16000],'at':r.get('at'),
                        'citations':[{'id':str(c.get('id',''))[:240],'complete':c.get('complete') is True} for c in citations if isinstance(c,dict)],
                        'exploration':exploration})
        except sqlite3.Error:warnings.append('成长库暂时不可读；请稍后刷新。')
    else:warnings.append('尚未找到成长库；没有创建或初始化数据。')
    latest=next((a for a in artifacts if a['exploration']),None)
    memory_name=''
    try:
        memory_name=json.loads((home/'feiyu-runtime/config.json').read_text(encoding='utf-8')).get('memoryName','')
        if not isinstance(memory_name,str) or not re.fullmatch(r'[\w-]{1,60}',memory_name):memory_name=''
    except (OSError,ValueError,AttributeError):pass
    topics=home/'soul-md/memory'/memory_name/'topics'
    if not memory_name:warnings.append('尚未指定角色记忆目录；不会混读其他角色记忆。')
    for p in (sorted(topics.glob('*.md'))[:40] if memory_name else []):
        if p.is_symlink():continue
        try:
            body=p.read_text(encoding='utf-8')
            memories.append({'id':p.stem,'title':next((l.lstrip('# ').strip() for l in body.splitlines() if l.strip()),p.stem),
                             'body':body[:12000],'truncated':len(body)>12000})
        except (OSError,UnicodeError):warnings.append('一份记忆暂时不可读。')
    catalog=home/'bili-duty/guard-catalog.json';catalog_at=None
    if catalog.exists():
        try:
            raw=json.loads(catalog.read_text(encoding='utf-8'))
            if not isinstance(raw,dict) or not isinstance(raw.get('videos'),list):raise ValueError('Invalid catalog')
            catalog_at=raw.get('at')
            for v in raw.get('videos',[])[:50]:
                if not isinstance(v,dict):
                    warnings.append('一条投稿记录格式异常，已跳过。');continue
                if not re.fullmatch(r'BV[0-9A-Za-z]{10}',str(v.get('bvid',''))):continue
                publications.append({k:v.get(k) for k in ('bvid','title','description','created','length','play','comment')})
        except (OSError,ValueError):warnings.append('投稿快照暂时不可读。')
    character=character_snapshot(home)
    character['creations']=sorted(character['creations']+writing_creations(home),key=lambda r:r['at'],reverse=True)[:100]
    return {'readOnly':True,'character':character,'capturedAt':datetime.now(timezone.utc).isoformat(),'warnings':list(dict.fromkeys(warnings+character['warnings'])),
            'artifacts':artifacts,'latest':latest,'memories':memories,'publications':publications,'catalogAt':catalog_at,
            'pending':sum(r['state'] in ('pending','running','saved') for r in queue),
            'limits':{'artifactWindow':100,'memoryWindow':40,'publicationWindow':50}}

def handler_for(home,port,pond=None):
    pond=pond or Pond(home)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def respond(self,status,body,content_type='application/json; charset=utf-8'):
            # Drain a bounded rejected body before closing HTTP/1.0 on Windows;
            # unread inbound bytes can otherwise reset the connection and hide 4xx.
            if self.command in ('POST','PUT','PATCH','DELETE') and not getattr(self,'body_consumed',False):
                self.body_consumed=True
                try:
                    length=int(self.headers.get('Content-Length','0'))
                    if 0<length<=16384 and not self.headers.get('Transfer-Encoding'):
                        self.connection.settimeout(1)
                        self.rfile.read(length)
                except (ValueError,OSError):pass
            self.send_response(status);self.send_header('Content-Type',content_type)
            self.send_header('Cache-Control','no-store' if content_type!='image/png' else 'private, max-age=3600')
            self.send_header('X-Content-Type-Options','nosniff')
            self.send_header('Referrer-Policy','no-referrer')
            self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
            self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_GET(self):
            if self.headers.get('Host') not in (f'127.0.0.1:{port}',f'localhost:{port}'):
                return self.respond(403,b'{"error":"local host required"}')
            origin=self.headers.get('Origin')
            if origin and origin not in (f'http://127.0.0.1:{port}',f'http://localhost:{port}'):
                return self.respond(403,b'{"error":"same origin required"}')
            if self.headers.get('Sec-Fetch-Site')=='cross-site':
                return self.respond(403,b'{"error":"cross site denied"}')
            path=urlsplit(self.path).path
            if path=='/api/media':
                try:
                    value=media.dashboard(home)
                    return self.respond(200,json.dumps(value,ensure_ascii=False).encode())
                except (OSError,ValueError,sqlite3.Error,KeyError):
                    return self.respond(503,b'{"error":"Media workspace unavailable"}')
            if path=='/api/settings':
                try:return self.respond(200,json.dumps(pond.settings(),ensure_ascii=False).encode())
                except PondError as e:return self.respond(e.status,json.dumps({'error':str(e)},ensure_ascii=False).encode())
            if path=='/api/snapshot':
                return self.respond(200,json.dumps(read_snapshot(home),ensure_ascii=False).encode())
            if path not in STATIC:return self.respond(404,b'{"error":"not found"}')
            filename,content_type=STATIC[path]
            self.respond(200,(HERE/'static'/filename).read_bytes(),content_type)
        def do_POST(self):
            path=self.path
            if path not in ('/api/media/config','/api/media/preview','/api/media/submit','/api/media/status','/api/settings','/api/external-mentions','/api/comment-prefill','/api/login/start','/api/login/poll'):
                return self.respond(405,b'{"error":"unsupported operation"}')
            if (self.headers.get('Host') not in (f'127.0.0.1:{port}',f'localhost:{port}')
                or self.headers.get('Origin')!='http://'+self.headers.get('Host','')
                or self.headers.get('Sec-Fetch-Site') not in (None,'same-origin')
                or self.headers.get('X-Studio-CSRF')!=pond.token):
                return self.respond(403,b'{"error":"same origin token required"}')
            try:
                if self.headers.get('Content-Type')!='application/json' or self.headers.get('Transfer-Encoding'):
                    raise PondError(400,'只接受 JSON 请求')
                try:length=int(self.headers.get('Content-Length','0'))
                except ValueError:raise PondError(400,'请求长度错误')
                if not 1<=length<=16384:raise PondError(413,'请求大小超限')
                self.connection.settimeout(5)
                self.body_consumed=True
                try:body=json.loads(self.rfile.read(length))
                except (ValueError,OSError):raise PondError(400,'请求不完整或格式错误')
                if path.startswith('/api/media/'):
                    if not isinstance(body,dict):raise PondError(400,'请求格式错误')
                    try:
                        if path.endswith('/config'):result=media.configure(home,body)
                        elif path.endswith('/status'):
                            bv=body.get('bvid','')
                            if not isinstance(bv,str) or not media.BV.fullmatch(bv):raise PondError(400,'无效的 BV 号')
                            result=media.cli(home,['upload','status',bv])
                        else:result=media.submission(home,body,path.endswith('/submit'))
                    except media.MediaError as exc:raise PondError(409,str(exc))
                    except Exception:raise PondError(503,'操作未完成，请查看记录并核对创作中心')
                elif path=='/api/settings':result=pond.save(body)
                elif path=='/api/external-mentions':result=pond.save_mentions(body)
                elif path=='/api/comment-prefill':result=pond.save_prefill(body)
                else:
                    if body!={}:raise PondError(400,'登录请求不接受额外参数')
                    result=pond.start_login() if path.endswith('/start') else pond.poll_login()
                self.respond(200,json.dumps(result,ensure_ascii=False).encode())
            except PondError as e:self.respond(e.status,json.dumps({'error':str(e)},ensure_ascii=False).encode())
        def reject_write(self):self.respond(405,b'{"error":"unsupported operation"}')
        do_PUT=do_DELETE=do_PATCH=reject_write
    return Handler

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--home',type=Path,default=DEFAULT_HOME);parser.add_argument('--port',type=int,default=3087)
    args=parser.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),handler_for(args.home,args.port))
    print(f'Feiyu Studio: http://127.0.0.1:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
