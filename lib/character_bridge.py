"""Bounded local bridge; no network or arbitrary command/path supplied by models."""
import json, os, subprocess, hashlib, re, shutil
from pathlib import Path
from datetime import datetime, timezone
from functools import wraps

def invoke(request):
    cli=os.environ.get('FEIYU_RUNTIME_CLI')
    node=os.environ.get('FEIYU_NODE')
    if not cli or not node:
        # Old read-only MCP clients do not receive our new environment fields.
        # Discover only the fixed package in their explicitly configured home.
        if request.get('action')!='recall':raise RuntimeError('Character runtime bridge not configured')
        home=os.environ.get('DSH_HOME')
        profile=os.environ.get('DSH_PROFILE') or 'web'
        if not home or not Path(home).is_absolute() or not re.fullmatch(r'[A-Za-z0-9_-]+',profile):
            raise RuntimeError('Explicit DSH home/profile required')
        cli=str(Path(home)/'profiles'/profile/'node_modules/dsh-feiyu-runtime/character-cli.mjs')
        node=shutil.which('node')
        if not Path(cli).is_file() or not node:raise RuntimeError('Read-only character bridge unavailable')
    raw=json.dumps(request,ensure_ascii=False)
    if len(raw)>240000:raise ValueError('Input exceeds bound')
    result=subprocess.run([node,cli],input=raw,text=True,encoding='utf-8',capture_output=True,timeout=30,
                          creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    if result.returncode:raise RuntimeError('Character runtime rejected operation')
    return json.loads(result.stdout)

def observe(fn):
    if fn.__name__ not in {'bili_search','bili_subtitle','bili_comments','bili_reply'}:return fn
    @wraps(fn)
    async def wrapped(*args,**kwargs):
        result=await fn(*args,**kwargs)
        # The existing send gate remains authoritative even if this projection fails.
        try:
            body=json.dumps({'tool':fn.__name__,'arguments':kwargs,'result':result},ensure_ascii=False)
            truncated=len(body)>180000
            if truncated:body=json.dumps({'tool':fn.__name__,'excerpt':body[:170000],'truncated':True},ensure_ascii=False)
            stamp=datetime.now(timezone.utc).isoformat()
            key=hashlib.sha256((stamp+body).encode()).hexdigest()
            invoke({'action':'observe','event':{'id':'tool:'+key,'kind':'tool','source':fn.__name__,
                'occurred':stamp,'coverage':'partial','body':body}})
        except Exception:
            try:
                value=json.loads(result)
                if isinstance(value,dict):
                    value['_experience_warning']='工具已返回，但经历归档未确认；不要据此重复发送。'
                    result=json.dumps(value,ensure_ascii=False)
            except (TypeError,ValueError):pass
        return result
    return wrapped
