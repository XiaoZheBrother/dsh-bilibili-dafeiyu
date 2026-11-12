"""Local derived vector index. Source DB read-only; no timers, LLM or remote embeddings."""
import hashlib
import json
import os
import sqlite3
import sys
from pathlib import Path

MODEL = 'BAAI/bge-small-zh-v1.5'

def model(root):
    from fastembed import TextEmbedding
    cfg=json.loads((root/'memory-retrieval.json').read_text(encoding='utf8')) if (root/'memory-retrieval.json').exists() else {}
    return TextEmbedding(model_name=MODEL, cache_dir=cfg.get('modelCache',str(root/'embedding-model')), threads=2)

def index_db(root):
    db=sqlite3.connect(root/'memory-vectors.sqlite3',timeout=10)
    db.execute('PRAGMA journal_mode=WAL')
    db.execute('CREATE TABLE IF NOT EXISTS chunks (id TEXT, hash TEXT, model TEXT, offset INTEGER, text TEXT, vector BLOB, PRIMARY KEY(id,hash,model,offset))')
    return db

def build(root, encoder=None, max_records=None):
    import numpy as np
    encoder=encoder or model(root)
    source=sqlite3.connect((root/'character.sqlite3').as_uri()+'?mode=ro',uri=True)
    db=index_db(root); count=0; records=0
    for ident,digest,body in source.execute("SELECT id,hash,body FROM experiences WHERE NOT (kind='interaction' AND CASE WHEN json_valid(body) THEN COALESCE(json_extract(body,'$.type'),'') ELSE '' END='scan') ORDER BY rowid DESC"):
        if db.execute('SELECT 1 FROM chunks WHERE id=? AND hash=? AND model=? LIMIT 1',(ident,digest,MODEL)).fetchone():continue
        if max_records is not None and records>=max_records:break
        if max_records is not None and len(body)>9600:continue
        # Overlapping excerpts preserve exact source offsets. Never index a summary as full evidence.
        pieces=[(offset,body[offset:offset+480]) for offset in range(0,len(body),400)]
        for (offset,text),vector in zip(pieces,encoder.passage_embed([p[1] for p in pieces],batch_size=16)):
            db.execute('INSERT OR REPLACE INTO chunks VALUES(?,?,?,?,?,?)',(ident,digest,MODEL,offset,text,np.asarray(vector,dtype=np.float32).tobytes()))
            count+=1
        db.commit();records+=1
    source.close();db.close()
    return {'indexedChunks':count,'model':MODEL,'originalsModified':False}

def query(root,text):
    import numpy as np
    if not (root/'memory-vectors.sqlite3').exists():return {'hits':[],'status':'index_missing'}
    encoder=model(root)
    refresh=build(root,encoder,max_records=4)
    vector=np.asarray(next(encoder.query_embed(text)),dtype=np.float32)
    norm=np.linalg.norm(vector)
    db=sqlite3.connect((root/'memory-vectors.sqlite3').as_uri()+'?mode=ro',uri=True)
    best={}
    for ident,digest,offset,raw in db.execute('SELECT id,hash,offset,vector FROM chunks WHERE model=?',(MODEL,)):
        v=np.frombuffer(raw,dtype=np.float32);denom=np.linalg.norm(v)*norm
        if v.shape!=vector.shape or not denom:continue
        score=float(v@vector/denom)
        if score>=0.5 and score>best.get(ident,{}).get('score',-1):best[ident]={'id':ident,'hash':digest,'offset':offset,'score':score}
    db.close()
    return {'hits':sorted(best.values(),key=lambda x:x['score'],reverse=True)[:30],'status':'ready','model':MODEL,'refreshedChunks':refresh['indexedChunks']}

if __name__=='__main__':
    sys.stdin.reconfigure(encoding='utf-8');sys.stdout.reconfigure(encoding='utf-8')
    root=Path(sys.argv[2]).resolve()
    if sys.argv[1]=='build':result=build(root)
    elif sys.argv[1]=='query':result=query(root,json.load(sys.stdin)['query'][:500])
    else:raise ValueError('Unknown action')
    print(json.dumps(result,ensure_ascii=False))
