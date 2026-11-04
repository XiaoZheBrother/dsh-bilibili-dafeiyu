import concurrent.futures
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent / "lib"))
import media_actions as m


class MediaTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        (self.home/"bili-duty").mkdir()
        (self.home/"feiyu-runtime").mkdir()
        (self.home/"bili-duty/feiyu-policy.json").write_text('{"accountUid":"123","enabled":true}')

    def send(self, number):
        return m.danmaku(self.home, f"BV{number:010d}", 1, 3.5, "鱼")

    def test_parallel_caps_and_replay(self):
        with patch.object(m,"cli",return_value={"dmid":"789"}) as cli:
            with self.assertRaises(m.MediaError):
                self.send(1)
            m.configure(self.home, {"enabled":True,"cap":3})
            with concurrent.futures.ThreadPoolExecutor(8) as pool:
                calls=[pool.submit(self.send,n) for n in [1,1,1,2,2,3,4,5]]
            self.assertEqual(sum(f.exception() is None for f in calls),3)
            self.assertEqual(cli.call_count,3)
            with m.transaction(self.home) as db:
                key=db.execute("SELECT target FROM sends LIMIT 1").fetchone()[0]
                db.execute("UPDATE sends SET day='yesterday'")
            with self.assertRaises(m.MediaError):
                self.send(int(key[2:]))

    def test_uncertain_is_not_replayed(self):
        m.configure(self.home,{"enabled":True,"cap":1})
        with patch.object(m,"cli",side_effect=TimeoutError):
            with self.assertRaises(TimeoutError): self.send(1)
        with self.assertRaises(m.MediaError): self.send(2)

    def test_preview_binds_media_and_zone(self):
        folder=Path(m.dashboard(self.home)["inbox"])
        (folder/"v.mp4").write_bytes(b"video")
        (folder/"c.png").write_bytes(b"cover")
        body=dict(video="v.mp4",cover="c.png",title="title",description="desc",tags=["tag"])
        zone={"tid":17,"zone":12}
        def fake(home,args,uid):
            if args[0]=="--dry-run": return {"params":{"zone":zone}}
            self.assertNotEqual(Path(args[2]),folder/"v.mp4")
            self.assertEqual(Path(args[2]).read_bytes(),b"video")
            return {"bvid":"BV1234567890"}
        with patch.object(m,"cli",side_effect=fake):
            body.update(m.submission(self.home,body))
            with self.assertRaises(m.MediaError):m.submission(self.home,dict(body,zone={"tid":1,"zone":2}),True)
            (folder/"c.png").write_bytes(b"changed")
            with self.assertRaises(m.MediaError):m.submission(self.home,body,True)
            body.update(m.submission(self.home,body))
            self.assertEqual(m.submission(self.home,body,True)["bvid"],"BV1234567890")
            with self.assertRaises(m.MediaError):m.submission(self.home,body,True)
