import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import AsyncMock

sys.path.insert(0,str(Path(__file__).resolve().parent/"workbench"))
from pond import Pond,PondError
from comment_prefill import reviewable

class PrefillTests(unittest.IsolatedAsyncioTestCase):
    async def test_edits_review_and_disable(self):
        with tempfile.TemporaryDirectory() as folder:
            home=Path(folder)
            duty=home/"bili-duty"
            duty.mkdir()
            pond=Pond(home)
            def save(enabled,prefix):
                return pond.save_prefill(dict(enabled=enabled,prefix=prefix,revision=pond.prefill()["revision"]))
            send=AsyncMock(return_value="sent")
            model=AsyncMock(side_effect=["草稿一","草稿二"])
            reply=reviewable(send,duty,model)
            self.assertFalse(pond.prefill()["enabled"])
            self.assertEqual(await reply("bv","原评论"),"sent")
            original_rev=pond.prefill()["revision"]
            save(True,"第一个开头")
            with self.assertRaises(PondError):
                pond.save_prefill(dict(enabled=True,prefix="其他",revision=original_rev))
            with self.assertRaises(PondError):save(True," ")
            first=json.loads(await reply("bv","原评论",123))
            self.assertFalse(first["sent"])
            save(True,"第二个开头")
            self.assertIn("作废",await reply("bv",first["draft"],123))
            second=json.loads(await reply("bv","重新写",123))
            self.assertEqual(model.await_args.args[-1],"第二个开头")
            self.assertEqual(send.await_count,1)
            self.assertEqual(await reply("bv",second["draft"],123),"sent")
            save(False,"第二个开头")
            self.assertEqual(await reply("bv","另外一条",124),"sent")
            self.assertEqual(model.await_count,2)
            self.assertEqual(pond.prefill()["prefix"],"第二个开头")

    async def test_generation_failure_never_calls_send(self):
        with tempfile.TemporaryDirectory() as folder:
            duty=Path(folder)
            (duty/"comment-prefill.json").write_text('{"enabled":true,"prefix":"hello"}')
            send=AsyncMock()
            reply=reviewable(send,duty,AsyncMock(side_effect=TimeoutError))
            self.assertFalse(json.loads(await reply("bv","hello"))["sent"])
            send.assert_not_awaited()
