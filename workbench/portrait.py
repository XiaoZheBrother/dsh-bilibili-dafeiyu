"""Read-only portrait projection. Authorship follows explicit source contracts.

No LLM, timers, migrations, preference inference or writes to the agent home.
"""
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path

MAX_FILES = 300
MAX_BYTES = 200000


def portrait_snapshot(home):
    home = Path(home).resolve()
    entries, sources, warnings = [], {}, []
    root = home / 'feiyu-runtime/writing'
    specs = [('self/*.json', 'self', '她自己的偏好'),
             ('partner/*.json', 'partner', '搭档的反馈'),
             ('drafts/*/partner-*.json', 'partner', '搭档的反馈'),
             ('analysis/*/self-analysis.txt', 'self', '她的自我观察')]
    seen = set()

    def source(path, label, body, kind, author='', raw=None):
        relative = path.relative_to(home).as_posix()
        digest = hashlib.sha256(path.read_bytes() if raw is None else raw).hexdigest()
        sid = hashlib.sha256((relative + ':' + digest).encode()).hexdigest()[:32]
        at = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
        sources[sid] = {'id': sid, 'path': relative, 'hash': digest, 'body': body,
                       'label': label, 'kind': kind, 'author': author,
                       'at': at, 'timeLabel': '文件更新时间'}
        return sid, at

    def safe(path):
        return (path.is_file() and not path.is_symlink() and
                path.resolve().is_relative_to(home) and path.stat().st_size <= MAX_BYTES)

    for pattern, kind, label in specs:
        paths = sorted(root.glob(pattern))
        if len(paths) > MAX_FILES:
            warnings.append('写作记录仅展示每类最近 300 份。')
        for path in paths[-MAX_FILES:]:
            if path in seen:
                continue
            seen.add(path)
            try:
                if not safe(path):
                    warnings.append('有超大或外部链接记录未读取。')
                    continue
                raw = path.read_bytes()
                doc = json.loads(raw.decode('utf-8-sig')) if path.suffix == '.json' else None
                body = doc.get('text') if isinstance(doc, dict) else raw.decode('utf-8-sig') if path.suffix == '.txt' else None
                if not isinstance(body, str) or not body.strip():
                    warnings.append('有记录缺少正文，未归入画像。')
                    continue
                author = doc.get('author', '') if isinstance(doc, dict) else ''
                # Historical self-analysis has its own source contract; it is an
                # observation, not an adopted preference or system inference.
                category = kind if author or path.name == 'self-analysis.txt' else 'unknown'
                title = label if category != 'unknown' else '归属待确认'
                sid, at = source(path, title, body, category, author, raw)
                chunks = [(0, body)]
                if pattern.startswith('self/'):
                    matches = list(re.finditer(r'(?m)^-\s+', body))
                    if matches:
                        chunks = [(m.start(), body[m.start():matches[i+1].start() if i+1 < len(matches) else len(body)].strip()) for i, m in enumerate(matches)]
                for n, (offset, chunk) in enumerate(chunks):
                    heading = re.search(r'\*\*(.+?)\*\*', chunk)
                    entries.append({'id': sid + ':' + str(n), 'category': category,
                                    'label': title, 'title': heading.group(1).strip('。') if heading else title,
                                    'text': chunk, 'at': at, 'timeLabel': '文件更新时间',
                                    'sourceIds': [sid], 'offset': offset,
                                    'status': 'self_observation' if path.suffix == '.txt' else 'recorded',
                                    'note': '历史原话，不代表今天仍未改变。' if kind == 'self' else '搭档的反馈，不自动变成她的偏好。'})
            except (OSError, ValueError, UnicodeError, TypeError):
                warnings.append('有写作记录暂时不可读，已跳过。')

    # General memories often mix actor and partner speech. Keep them unclassified.
    try:
        config = home / 'feiyu-runtime/config.json'
        name = json.loads(config.read_text('utf-8-sig')).get('memoryName', '')
        if isinstance(name, str) and re.fullmatch(r'[\w-]{1,60}', name):
            for path in sorted((home / 'soul-md/memory' / name / 'topics').glob('*.md'))[:MAX_FILES]:
                if not safe(path):
                    warnings.append('有记忆文件未读取。')
                    continue
                raw = path.read_bytes(); body = raw.decode('utf-8-sig')
                title = next((s.lstrip('# ').strip() for s in body.splitlines() if s.strip()), path.stem)
                sid, at = source(path, '原始记忆 · 未拆分归属', body, 'unknown', raw=raw)
                entries.append({'id': sid, 'category': 'unknown', 'label': '原始记忆', 'title': title,
                                'text': body, 'at': at, 'timeLabel': '文件更新时间', 'sourceIds': [sid],
                                'status': 'unclassified', 'note': '可能混合多方表述，不按第一人称猜测归属。'})
        else:
            warnings.append('未配置角色记忆目录；未混读其他角色。')
    except (OSError, ValueError, TypeError, UnicodeError):
        warnings.append('角色记忆目录暂时不可读。')
    entries.sort(key=lambda row: row['at'], reverse=True)
    return {'readOnly': True, 'entries': entries, 'sources': sources,
            'warnings': list(dict.fromkeys(warnings)),
            'coverage': '读取写作台自述、搭档反馈、自我观察和角色主题记忆；不是全部会话的自动画像。',
            'inferenceNote': '尚未接入有独立来源的系统推测；没有生成或确认新偏好。'}
