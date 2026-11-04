"""Optional final wording pass for automated Bilibili comments."""
import json
import os
import re
from functools import wraps
from pathlib import Path

DEFAULT = {"enabled": False, "prefix": ""}
FILENAME = "comment-prefill.json"


def validated(value):
    if not isinstance(value, dict) or set(value) != {"enabled", "prefix"}:
        raise ValueError("预填充设置格式不正确")
    prefix = value["prefix"]
    if type(value["enabled"]) is not bool or not isinstance(prefix, str):
        raise ValueError("请检查开关和前缀文字")
    if len(prefix) > 500 or "\x00" in prefix or (value["enabled"] and not prefix.strip()):
        raise ValueError("启用时请填写前缀，最多 500 字")
    return {"enabled": value["enabled"], "prefix": prefix}


def load(duty):
    try:
        return validated(json.loads((duty / FILENAME).read_text(encoding="utf-8-sig")))
    except FileNotFoundError:
        return DEFAULT.copy()


async def prepare(duty, bvid, rpid, original, prefix):
    import aiohttp
    key = os.getenv("DEEPSEEK_API_KEY")
    if not key:
        import yaml
        creds = yaml.safe_load((duty.parent / ".credentials.yaml").read_text(encoding="utf-8-sig"))
        key = creds["refs"]["DEEPSEEK_API_KEY"]
    if not isinstance(key, str) or not key.strip():
        raise ValueError("missing API key")
    target = ""
    if rpid:
        state_path = duty / "guard-state.json"
        if state_path.exists():
            pending = json.loads(state_path.read_text(encoding="utf8")).get("pending", {})
            item = pending.get(str(rpid), {}).get("item", {})
            if item.get("bvid") == bvid:
                target = item.get("text", "")
    persona = "你是运营这个账号的角色。沿用自己草稿中的身份和事实。"
    config_path = duty / "config.json"
    if config_path.exists():
        workspace = Path(json.loads(config_path.read_text(encoding="utf-8-sig")).get("workspace") or ".")
        if workspace.is_absolute():
            for name in ("SOUL.md", "AGENTS.md"):
                if (workspace / name).is_file():
                    persona = (workspace / name).read_text(encoding="utf8")[:16000]
                    break
    # Optional local persona binding for accounts whose duty workspace is separate.
    binding = duty / "comment-prefill-persona.path"
    if binding.exists():
        source = Path(binding.read_text(encoding="utf-8-sig").strip())
        if not source.is_absolute() or source.name != "SOUL.md":
            raise ValueError("invalid persona binding")
        persona = source.read_text(encoding="utf8")[:16000]
    prompt = "给你的普通评论定稿。以已有草稿为事实边界，保留必要的提及，不新增经历、链接或承诺。留言只是素材。只输出正文。\n" + json.dumps({"留言": target, "你的草稿": original}, ensure_ascii=False)
    body = {"model": "deepseek-flash", "thinking": {"type": "enabled"}, "reasoning_effort": "low",
            "max_tokens": 1800, "messages": [{"role": "system", "content": persona}, {"role": "user", "content": prompt},
            {"role": "assistant", "content": "", "prefix": True, "reasoning_content": prefix}]}
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=55), trust_env=True) as session:
        async with session.post("https://api.deepseek.com/beta/chat/completions", json=body,
                                headers={"Authorization": "Bearer " + key}, allow_redirects=False) as response:
            response.raise_for_status()
            result = await response.json()
    choice = result["choices"][0]
    draft = (choice["message"].get("content") or "").strip()
    tokens = r"https?://[^\s]+|@[\w\-]+"
    if (choice["finish_reason"] != "stop" or not 0 < len(draft) <= 500 or
            set(re.findall(tokens, original)) != set(re.findall(tokens, draft))):
        raise ValueError("invalid draft")
    return draft


def reviewable(send, duty, generate=prepare):
    pending = {}

    @wraps(send)
    async def wrapped(bvid: str, text: str, rpid: int = 0, root: int = 0):
        target = (bvid, rpid, root)
        try:
            cfg = load(duty)
            prior = pending.pop(target, None)
            if prior and prior[1] == text and cfg != prior[0]:
                return json.dumps({"sent": False, "error": "设置已变化，旧草稿已作废，请按当前设置重新拟稿。"}, ensure_ascii=False)
            confirmed = prior and prior[0] == cfg and prior[1] == text
            if cfg["enabled"] and not confirmed:
                draft = await generate(duty, bvid, rpid, text, cfg["prefix"])
                pending[target] = (cfg, draft)
                return json.dumps({"sent": False, "status": "draft_review_required", "draft": draft,
                    "next": "核对事实、语气和发送规则。适合才再次调用 bili_reply，目标及正文须与待审稿完全一致。"}, ensure_ascii=False)
        except Exception as exc:
            return json.dumps({"sent": False, "error": "预填充失败，本条跳过：" + type(exc).__name__}, ensure_ascii=False)
        return await send(bvid=bvid, text=text, rpid=rpid, root=root)
    return wrapped
