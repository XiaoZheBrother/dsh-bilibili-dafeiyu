import ast,sqlite3,tempfile,unittest
from pathlib import Path
from datetime import datetime,timezone,timedelta

source=Path(__file__).parent/'vendor/bilibili-mcp/mcp_server.py'
tree=ast.parse(source.read_text(encoding='utf-8'))
scope={'sqlite3':sqlite3,'datetime':datetime,'timezone':timezone,'timedelta':timedelta}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('feiyu_reserve','feiyu_receipt','external_match')],type_ignores=[]),str(source),'exec'),scope)

class GateTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.db=Path(self.tmp.name)/'send.sqlite3';self.policy={'enabled':True,'accountUid':'42','accountName':'测试鱼'};self.now=datetime(2026,11,4,tzinfo=timezone.utc)
 def reserve(self,bv='BV1234567890',rpid=0,owner='17',account='42',policy=None,now=None):return scope['feiyu_reserve'](self.db,policy or self.policy,bv,rpid,owner,account,'普通评论',now or self.now)
 def test_account_binding_required_and_preserved(self):
  for policy,account in [({'enabled':True},'42'),(self.policy,'43')]:
   with self.assertRaises(ValueError):self.reserve(policy=policy,account=account)
  self.reserve()
 def test_uncertain_reservation_never_replays(self):
  self.reserve()
  with self.assertRaises(ValueError):self.reserve(now=self.now+timedelta(days=1))
 def test_twenty_attempt_cap_and_spacing(self):
  self.reserve()
  with self.assertRaises(ValueError):self.reserve(bv='BV1234567891',now=self.now+timedelta(seconds=299))
  for i in range(1,20):self.reserve(bv=f'BV{i:010d}',now=self.now+timedelta(seconds=i*300))
  with self.assertRaises(ValueError):self.reserve(bv='BV9999999999',now=self.now+timedelta(seconds=6000))
 def test_only_own_video_replies(self):
  with self.assertRaises(ValueError):self.reserve(rpid=123,owner='17')
  self.reserve(rpid=123,owner='42')

class InvitationTests(unittest.TestCase):
 def test_platform_proof(self):
  match=scope["external_match"]
  reply=dict(mid=17,ctime=90,oid=456,type=1,rpid=123,root=111,content={"members":[{"mid":42}]})
  args=dict(aid=456,rpid=123,root=111,account="42",invitations={"17":89})
  self.assertTrue(match(reply,**args))
  self.assertTrue(match(dict(reply,root=0),**dict(args,root=0)))
  for field,value in dict(mid=18,ctime=80,oid=455,type=12,rpid=111,root=0,invisible=True,content={"members":[]}).items():
   with self.subTest(field=field):self.assertFalse(match(dict(reply,**{field:value}),**args))
  self.assertFalse(match(reply,**dict(args,invitations={})))
 def test_invitation_uses_same_reservation(self):
  with tempfile.TemporaryDirectory() as tmp:
   reserve=scope["feiyu_reserve"];args=(Path(tmp)/"s.db",{"enabled":True,"accountUid":"42"},"BVtest",123,"17","42","你好")
   reserve(*args,invited=True)
   with self.assertRaises(ValueError):reserve(*args,invited=True)

if __name__=='__main__':unittest.main()
