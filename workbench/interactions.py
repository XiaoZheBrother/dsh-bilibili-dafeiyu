"""Read confirmed Bilibili interactions without exposing raw receipts or account details."""
import json
import math
import re
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

BV = re.compile(r"BV[A-Za-z0-9]{10}")


def comment_row(bv, rid, parent, body, at):
    if not BV.fullmatch(bv) or not re.fullmatch(r"[1-9][0-9]*", str(rid)) or not isinstance(body,str):
        return None
    url = f"https://www.bilibili.com/video/{bv}/?jump_rpid={rid}#reply{rid}"
    return dict(kind="comment" if str(parent) == "0" else "reply", text=body, bvid=bv, at=at, url=url)


def read_interactions(home):
    items = {}
    warnings = []
    try:
        uid = str(json.loads((home/"bili-duty/feiyu-policy.json").read_text(encoding="utf-8-sig"))["accountUid"])
        if not uid.isdigit(): raise ValueError()
    except (OSError, ValueError, KeyError, TypeError):
        return {"items": [], "warnings": ["请先绑定账号，再读取互动记录。"]}

    def read_rows(path, sql, parameters=()):
        if not path.is_file():
            return []
        try:
            with closing(sqlite3.connect(path.resolve().as_uri()+"?mode=ro", uri=True, timeout=2)) as db:
                return db.execute(sql,parameters).fetchall()
        except sqlite3.Error:
            warnings.append("部分发送记录暂时不可读，请稍后刷新。")
            return []

    duty = home/"bili-duty"
    runtime = home/"feiyu-runtime"
    for target, ts, raw in read_rows(duty/"feiyu-sends.sqlite3","SELECT target,ts,receipt FROM sends WHERE state='sent'"):
        try:
            result = json.loads(raw)
            reply = result["reply"]
            if str(reply.get("mid_str") or reply.get("mid")) != uid:
                continue
            bv, parent = target.split(":")
            rid = result.get("rpid_str") or reply.get("rpid_str") or result.get("rpid")
            at = datetime.fromtimestamp(reply.get("ctime") or ts,timezone.utc).isoformat()
            row = comment_row(bv,rid,parent,reply["content"]["message"],at)
            if row: items[row["url"]] = row
        except (TypeError, KeyError, ValueError, AttributeError, OSError, OverflowError):
            warnings.append("有评论回执缺少正文或定位信息。")

    archive = runtime/"publication-comments.jsonl"
    if archive.is_file():
        try:
            for line in archive.read_text(encoding="utf8").splitlines():
                if not line.strip(): continue
                record = json.loads(line)
                if str(record["uid"]) == uid:
                    row = comment_row(record["bvid"],record["rpid"],record["parent"],record["text"],record["at"])
                    if row: items.setdefault(row["url"],row)
        except (OSError, TypeError, KeyError, ValueError):
            warnings.append("部分投稿附带评论暂时不可读。")

    for bv, day, title, raw in read_rows(runtime/"media.sqlite3",
            "SELECT target,day,title,receipt FROM sends WHERE uid=? AND kind='弹幕' AND receipt IS NOT NULL",(uid,)):
        try:
            mid = str(json.loads(raw)["dmid"])
            if not BV.fullmatch(bv) or not re.fullmatch(r"[1-9][0-9]*",mid):continue
            match = re.fullmatch(re.escape(bv)+r" P([1-9]\d*) ([0-9.eE+-]+)s · (.+)",title,re.S)
            if not match: raise ValueError()
            page, sec, body = match.groups()
            seconds = float(sec)
            if not math.isfinite(seconds) or seconds < 0:raise ValueError()
            url = f"https://www.bilibili.com/video/{bv}/?p={page}&t={seconds:g}&dmid={mid}"
            items[url] = dict(kind="danmaku",text=body,bvid=bv,at=day,url=url,page=int(page),seconds=seconds)
        except (ValueError,TypeError,KeyError):
            warnings.append("有弹幕回执缺少时间点或分 P。")
    def sort_key(row):
        date=row["at"]
        if len(date)==10:return date
        return datetime.fromisoformat(date).astimezone().isoformat()
    return {"items": sorted(items.values(),key=sort_key,reverse=True),"warnings":list(dict.fromkeys(warnings))}
