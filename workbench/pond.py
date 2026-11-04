"""Narrow adapter to the existing local pond. Never starts a duty runner."""
import hashlib
import json
import secrets
import threading
import time
import urllib.request

BOOLS = 'autoRun peakValleyOnly autoComment circleMode replyToComments guardOn guardOwnAll guardEmoji preferSubtitle transcribe'.split()
NUMBERS = {'autoRunsPerDay': (0,24), 'autoGapMinutes': (15,240), 'perRoundMax': (0,20),
 'perDayMax': (0,120), 'transcribePerDay': (0,50), 'commentPerRound': (0,20), 'replyPerRound': (1,10),
 'guardDailyCap': (0,500), 'guardScope': (1,10), 'guardPerRound': (1,20), 'guardPollMinutes': (1,120),
 'minDurationMin': (0,600), 'maxDurationMin': (0,600), 'subtitleProbeMax': (1,10)}
TEXTS = {'guardWhitelist':1000, 'guardTone':1000, 'dutyProvider':120, 'dutyModel':200, 'asrModel':100}
FIELDS = set(BOOLS) | set(NUMBERS) | set(TEXTS) | {'keywords'}

class PondError(Exception):
    def __init__(self, status, message):
        self.status=status;super().__init__(message)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None

class Pond:
    def __init__(self,home):
        self.home=home;self.token=secrets.token_urlsafe(32);self.lock=threading.Lock();self.login=None
        self.http=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())

    def call(self,path,body=None):
        # No caller-controlled host, path, proxy, cookies or redirect forwarding.
        if path not in ('status','config','models','login/start','login/poll'):raise PondError(404,'不支持的操作')
        req=urllib.request.Request('http://127.0.0.1:3086/api/bili-pond/'+path,
             data=None if body is None else json.dumps(body).encode(),headers={'Content-Type':'application/json'})
        try:
            with self.http.open(req,timeout=20) as r:
                raw=r.read(2_000_001)
                if len(raw)>2_000_000:raise ValueError()
                value=json.loads(raw)
                if not isinstance(value,dict) or value.get('ok') is False:raise ValueError()
                return value
        except Exception as e:raise PondError(502,'原鱼塘服务未响应或拒绝请求；操作结果可能未确认，请重新读取状态，不要连续重试。') from e

    @staticmethod
    def public(config):return {k:config[k] for k in sorted(FIELDS) if k in config}

    @staticmethod
    def revision(config):return hashlib.sha256(json.dumps(config,sort_keys=True,ensure_ascii=False).encode()).hexdigest()

    def settings(self):
        raw=self.call('status');cfg=self.public(raw.get('config',{}))
        policies={}
        for filename,fields in [('feiyu-policy.json',('enabled','dailyAttempts','minimumIntervalSeconds')),
                                ('share-target.json',('uid','name','mode'))]:
            try:
                source=json.loads((self.home/'bili-duty'/filename).read_text(encoding='utf-8-sig'))
                policies[filename]={k:source[k] for k in fields if k in source}
            except (OSError,ValueError,TypeError):policies[filename]=None
        return {'config':cfg,'revision':self.revision(cfg),'csrf':self.token,'policies':policies,
                'status':{k:raw.get(k) for k in ('loggedIn','venvReady','running','finalizing','roundsToday','pickedToday','asrUsedToday','lastRunAt','version')},
                'notSynced':[k for k in raw.get('notSynced',[]) if k in FIELDS]}

    def save(self,body):
        if not isinstance(body,dict) or set(body)!={'revision','patch'} or not isinstance(body['patch'],dict):
            raise PondError(400,'保存格式不正确')
        patch=body['patch']
        if not patch or not set(patch)<=FIELDS:raise PondError(400,'只允许修改页面列出的设置')
        for k,v in patch.items():
            if k=='keywords' and (not isinstance(v,list) or len(v)>50 or any(not isinstance(x,str) or not x.strip() or len(x)>120 or '\x00' in x for x in v)):
                raise PondError(400,'关键词必须是最多 50 项的列表，每项 1–120 字')
            if k in BOOLS and type(v) is not bool:raise PondError(400,'开关必须是布尔值')
            if k in NUMBERS and (type(v) is not int or not NUMBERS[k][0]<=v<=NUMBERS[k][1]):raise PondError(400,'数字超出范围：'+k)
            if k in TEXTS and (not isinstance(v,str) or len(v)>TEXTS[k] or '\x00' in v):raise PondError(400,'文字格式不正确：'+k)
        with self.lock:
            before=self.settings()
            if body['revision']!=before['revision']:raise PondError(409,'设置已在其他页面变更。请重新读取后再修改；当前草稿仍保留。')
            merged=before['config']|patch
            if merged.get('commentPerRound',0)>merged.get('perRoundMax',0):raise PondError(400,'每轮评论上限不能超过每轮视频数，请一起调整。')
            if merged.get('circleMode') and (merged.get('autoComment') or merged.get('replyToComments')):raise PondError(400,'邀请模式与普通评论、楼中楼回复互斥。')
            lo,hi=merged.get('minDurationMin',0),merged.get('maxDurationMin',0)
            if lo and hi and lo>hi:raise PondError(400,'视频最短时长不能超过最长时长。')
            result=self.call('config',patch)
            after=self.settings()
            if any(after['config'].get(k)!=v for k,v in patch.items()):raise PondError(409,'保存后回读与预期不一致，请重新读取确认实际生效值。')
            after['saved']=True
            after['hostSynced']=result.get('host',{}).get('ok') is True
            return after

    def start_login(self):
        with self.lock:
            if self.login and time.monotonic()-self.login['at']<180:
                return {'qr':self.login['qr'],'state':'waiting'}
            r=self.call('login/start',{})
            qr=r.get('qr','')
            if not isinstance(qr,str) or not qr.startswith('data:image/png;base64,') or len(qr)>1_000_000 or not isinstance(r.get('key'),str):
                raise PondError(502,'原鱼塘未生成有效二维码，请在原工作台检查登录环境。')
            self.login={'key':r['key'],'qr':qr,'at':time.monotonic()}
            return {'qr':qr,'state':'waiting'}

    def poll_login(self):
        with self.lock:
            if not self.login or time.monotonic()-self.login['at']>180:
                self.login=None;return {'state':'expired'}
            r=self.call('login/poll',{'key':self.login['key']})
            state=r.get('state','unknown')
            if state in ('ok','expired'):self.login=None
            return {'state':state if state in ('ok','waiting','scanned','expired','unknown','pending') else 'waiting'}
