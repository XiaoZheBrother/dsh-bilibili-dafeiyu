"""Narrow publication and timed-comment adapter for the character's existing account."""
import hashlib
import hmac
import secrets
import shutil
import tempfile
import json
import math
import os
import re
import sqlite3
import subprocess
import sys
from contextlib import closing, contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path


class MediaError(ValueError):
    pass


class BeforeSend(MediaError):
    pass


BV = re.compile(r"BV[0-9A-Za-z]{10}")
PREVIEW_KEY = secrets.token_bytes(32)
BEIJING = timezone(timedelta(hours=8))


def runtime(home):
    return home / "feiyu-runtime"


@contextmanager
def transaction(home):
    with closing(sqlite3.connect(runtime(home) / "media.sqlite3", timeout=8)) as db:
        db.row_factory = sqlite3.Row
        with db:
            db.execute("BEGIN IMMEDIATE")
            db.execute("CREATE TABLE IF NOT EXISTS settings(uid TEXT PRIMARY KEY, enabled INTEGER, cap INTEGER)")
            db.execute("""CREATE TABLE IF NOT EXISTS sends(
                uid TEXT, kind TEXT, target TEXT, day TEXT, title TEXT, receipt TEXT,
                PRIMARY KEY(uid,kind,target))""")
            yield db


def account(home):
    policy = json.loads((home / "bili-duty/feiyu-policy.json").read_text(encoding="utf-8-sig"))
    uid = str(policy["accountUid"])
    if not uid.isdigit():
        raise MediaError("请先绑定大肥鱼的 B 站账号")
    return uid, policy.get("enabled") is True


def settings(db, uid):
    row = db.execute("SELECT enabled,cap FROM settings WHERE uid=?", (uid,)).fetchone()
    return {"enabled": bool(row and row["enabled"]), "cap": row["cap"] if row else 3}


def configure(home, body):
    if type(body.get("enabled")) is not bool or type(body.get("cap")) is not int or not 1 <= body["cap"] <= 3:
        raise MediaError("每日额度须为 1 至 3 条")
    with transaction(home) as db:
        uid, _ = account(home)
        db.execute("INSERT OR REPLACE INTO settings VALUES(?,?,?)", (uid, body["enabled"], body["cap"]))
        return settings(db, uid)


def dashboard(home):
    (runtime(home) / "media-inbox").mkdir(parents=True,exist_ok=True)
    uid, _ = account(home)
    with transaction(home) as db:
        rows = db.execute("SELECT kind,title,receipt FROM sends WHERE uid=? ORDER BY rowid DESC LIMIT 30", (uid,))
        return {"settings": settings(db, uid), "inbox": str(runtime(home) / "media-inbox"),
                "history": [{"kind": r["kind"], "title": r["title"], "receipt": json.loads(r["receipt"] or "null")} for r in rows]}


def cli(home, args, uid=None):
    python = runtime(home) / "media-venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file():
        raise BeforeSend("请先安装投稿工具 bili-agent 到 media-venv")
    env = dict(os.environ, BILI_CLI_HOME=str(runtime(home) / "media-cli"),
               BILI_CLI_STATE_DIR=str(runtime(home) / "media-cli"), PYTHONUTF8="1")
    proc = subprocess.run([str(python), str(Path(__file__).resolve()), str(home), uid or account(home)[0], *args],
                          env=env, capture_output=True, timeout=3600 if args[:2] == ["upload","video"] else 90)
    try:
        result = json.loads(proc.stdout)
    except ValueError:
        raise MediaError("投稿工具未返回可核对的结果")
    if proc.returncode or not result.get("ok"):
        error = result.get("error", {})
        category = BeforeSend if error.get("code") in {"local_account", "invalid_argument", "captcha_required", "not_logged_in"} else MediaError
        raise category(str(error.get("message", "B 站请求未完成"))[:240])
    return result["data"]


def deliver(home, kind, target, title, args, expected_uid):
    uid, active = account(home)
    if uid != expected_uid:
        raise MediaError("绑定账号已变化，请重新预览")
    day = datetime.now(BEIJING).date().isoformat()
    with transaction(home) as db:
        if kind == "弹幕":
            prefs = settings(db, uid)
            total = db.execute("SELECT count(*) FROM sends WHERE uid=? AND kind=? AND day=?", (uid,kind,day)).fetchone()[0]
            if not active or not prefs["enabled"] or total >= prefs["cap"]:
                raise MediaError("自动弹幕已关闭或今天的额度已用完")
        try:
            db.execute("INSERT INTO sends VALUES(?,?,?,?,?,NULL)", (uid,kind,target,day,title))
        except sqlite3.IntegrityError:
            raise MediaError("已提交或结果待核实，请先查看记录")
    # Reserve before the network call. A timeout or process crash must never replay a public write.
    try:
        result = cli(home, args, uid)
    except BeforeSend:
        with transaction(home) as db:
            db.execute("DELETE FROM sends WHERE uid=? AND kind=? AND target=? AND receipt IS NULL", (uid,kind,target))
        raise
    if kind == "投稿":
        if not BV.fullmatch(str(result.get("bvid", ""))):
            raise MediaError("缺少投稿回执，请在创作中心核对")
        receipt = {"bvid": result["bvid"]}
    else:
        if not result.get("dmid"):
            raise MediaError("缺少弹幕回执，请核对发送记录")
        receipt = {"dmid": str(result["dmid"])}
    with transaction(home) as db:
        db.execute("UPDATE sends SET receipt=? WHERE uid=? AND kind=? AND target=?",
                   (json.dumps(receipt),uid,kind,target))
    return receipt


def danmaku(home, bvid, page, seconds, text):
    if not BV.fullmatch(bvid) or type(page) is not int or page < 1 or not math.isfinite(seconds) or seconds < 0:
        raise MediaError("视频、分 P 或秒数无效")
    if not text.strip() or len(text) > 100:
        raise MediaError("弹幕需要 1 至 100 个字")
    uid, _ = account(home)
    return deliver(home, "弹幕", bvid, f"{bvid} P{page} {seconds:g}s · {text}",
                   ["danmaku","send","--time",str(seconds),"--page",str(page),"--",bvid,text], uid)


def submission(home, body, confirm=False):
    folder = (runtime(home) / "media-inbox").resolve()
    def asset(name, extensions):
        filename = body.get(name, "")
        if not isinstance(filename,str) or Path(filename).name != filename or ":" in filename:
            raise MediaError("请输入素材目录里的文件名")
        path = (folder / filename).resolve()
        if path.parent != folder or path.suffix.lower() not in extensions or not path.is_file():
            raise MediaError("素材不存在或类型不匹配")
        with path.open("rb") as stream:
            return str(path), hashlib.file_digest(stream,"sha256").hexdigest()
    video, digest = asset("video",{".mp4",".mov",".mkv"})
    cover, cover_digest = asset("cover",{".jpg",".jpeg",".png",".webp"})
    title, desc, tags = (body.get(k) for k in ("title","description","tags"))
    if not isinstance(title,str) or not 1 <= len(title.strip()) <= 80 or not isinstance(desc,str) or len(desc)>2000:
        raise MediaError("请检查标题和简介的长度")
    if not isinstance(tags,list) or not 1 <= len(tags) <= 10 or not all(isinstance(t,str) and t.strip() for t in tags):
        raise MediaError("请填写 1 至 10 个标签")
    uid, _ = account(home)
    args = ["upload","video",video,"--cover",cover,"--title",title,"--desc",desc,"--ai-declare"]
    for tag in tags:
        args.extend(["--tag",tag])
    if confirm:
        zone = body.get("zone")
    else:
        preview = cli(home, ["--dry-run", *args], uid)
        zone = preview["params"]["zone"]
    if not isinstance(zone,dict) or not all(type(zone.get(k)) is int and zone[k]>0 for k in ("zone","tid")):
        raise MediaError("分区预测未成功，请调整标题后预览")
    args.extend(["--tid",str(zone["tid"]),"--zone",str(zone["zone"])])
    stamp = hmac.new(PREVIEW_KEY,json.dumps([uid,args,digest,cover_digest]).encode(),"sha256").hexdigest()
    if not confirm:
        return {"preview":stamp,"uid":uid,"zone":zone}
    if not isinstance(body.get("preview"),str) or not hmac.compare_digest(body["preview"], stamp):
        raise MediaError("稿件或素材已变动，请重新预览")
    with tempfile.TemporaryDirectory(dir=runtime(home),prefix="upload-") as temporary:
        # Keep immutable copies for the uploader, even if the editor rewrites its export.
        for name, original, expected in (("video",video,digest),("cover",cover,cover_digest)):
            frozen = Path(temporary) / (name + Path(original).suffix)
            shutil.copyfile(original,frozen)
            with frozen.open("rb") as stream:
                if hashlib.file_digest(stream,"sha256").hexdigest() != expected:
                    raise MediaError("素材在确认时发生变化，请重新预览")
            args[2 if name == "video" else 4] = str(frozen)
        return deliver(home,"投稿",digest,title,args,uid)


if __name__ == "__main__":
    # Only the fixed CLI commands above reach this child. Reuse the duty login without copying its secret.
    from bili_cli import config
    from bili_cli.main import main
    home = Path(sys.argv.pop(1))
    config.credential_path = lambda: home / "bili-duty/bili_credential.json"
    credential = config.load_credential()
    if not credential or str(credential.dedeuserid) != sys.argv.pop(1):
        print(json.dumps({"ok":False,"error":{"code":"local_account","message":"登录账号与绑定 UID 不符"}}))
        sys.exit(1)
    config.load_credential = lambda: credential
    main()
