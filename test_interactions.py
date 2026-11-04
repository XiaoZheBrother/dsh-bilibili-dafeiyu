import json,sqlite3,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/"workbench"))
from interactions import read_interactions

class InteractionsTest(unittest.TestCase):
    def test_only_confirmed_own_receipts_and_exact_destinations(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp);duty=home/"bili-duty";runtime=home/"feiyu-runtime"
            duty.mkdir();runtime.mkdir()
            (duty/"feiyu-policy.json").write_text('{"accountUid":"1"}')
            bv="BV1234567890";rid="1234567890123456789"
            db=sqlite3.connect(duty/"feiyu-sends.sqlite3")
            db.execute("CREATE TABLE sends(target,ts,receipt,state)")
            for uid,state in [("1","sent"),("2","sent"),("1","reserved")]:
                receipt={"rpid_str":rid,"reply":{"mid":uid,"content":{"message":"original "+uid}}}
                db.execute("INSERT INTO sends VALUES(?,?,?,?)",(bv+":12",1,json.dumps(receipt),state))
            db.commit();db.close()
            db=sqlite3.connect(runtime/"media.sqlite3")
            db.execute("CREATE TABLE sends(uid,kind,target,day,title,receipt)")
            db.execute("INSERT INTO sends VALUES(?,?,?,?,?,?)",("1","弹幕",bv,"2026-11-04",bv+" P2 32.5s · line · two",'{"dmid":"987"}'))
            db.commit();db.close()
            items=read_interactions(home)["items"]
            self.assertEqual(len(items),2)
            self.assertEqual(items[1]["kind"],"reply")
            self.assertEqual(items[1]["text"],"original 1")
            self.assertIn("jump_rpid="+rid,items[1]["url"])
            self.assertIn("p=2&t=32.5",items[0]["url"])
            self.assertEqual(items[0]["text"],"line · two")
