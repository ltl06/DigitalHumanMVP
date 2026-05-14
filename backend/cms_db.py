"""
CMS 数据库操作层 - 展品/内容/版本/互动记录 CRUD
"""

from __future__ import annotations

import json
import sqlite3
import time
import uuid
import threading
import logging
from pathlib import Path
from contextlib import contextmanager

_lock = threading.RLock()


def _db_path() -> Path:
    base = Path(__file__).parent.resolve()
    return base / "history.db"


@contextmanager
def _conn():
    """线程安全的数据库连接上下文管理器。"""
    with _lock:
        conn = sqlite3.connect(str(_db_path()), timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()


# ─────────────────────────────────────────────────────────────────
# 展品 (Exhibits)
# ─────────────────────────────────────────────────────────────────

def create_exhibit(
    name: str,
    code: str = "",
    description: str = "",
    category: str = "",
    digital_human_model: str = "",
    default_language: str = "zh-CN",
    exhibit_video_filename: str = "",
) -> dict:
    """创建展品。"""
    now = time.time()
    row = {
        "id": uuid.uuid4().hex,
        "name": name,
        "code": code or "",
        "description": description or "",
        "category": category or "",
        "digital_human_model": digital_human_model or "",
        "default_language": default_language,
        "exhibit_video_filename": exhibit_video_filename,
        "created_at": now,
        "updated_at": now,
    }
    with _conn() as c:
        c.execute("""
            INSERT INTO exhibits (id, name, code, description, category,
                digital_human_model, default_language, exhibit_video_filename, created_at, updated_at)
            VALUES (:id, :name, :code, :description, :category,
                :digital_human_model, :default_language, :exhibit_video_filename, :created_at, :updated_at)
        """, row)
    return row


def get_exhibit(exhibit_id: str) -> dict | None:
    """获取单个展品。"""
    with _conn() as c:
        row = c.execute("SELECT * FROM exhibits WHERE id = ?", (exhibit_id,)).fetchone()
        return dict(row) if row else None


def list_exhibits(category: str = "") -> list[dict]:
    """展品列表，可按分类过滤。"""
    with _conn() as c:
        if category:
            rows = c.execute(
                "SELECT * FROM exhibits WHERE category = ? ORDER BY created_at DESC",
                (category,)
            ).fetchall()
        else:
            rows = c.execute(
                "SELECT * FROM exhibits ORDER BY created_at DESC"
            ).fetchall()
        return [dict(r) for r in rows]


def update_exhibit(exhibit_id: str, **fields) -> bool:
    """更新展品字段。"""
    if not fields:
        return False
    fields["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = exhibit_id
    with _conn() as c:
        cur = c.execute(f"UPDATE exhibits SET {set_clause} WHERE id = :id", fields)
        return cur.rowcount > 0


def delete_exhibit(exhibit_id: str) -> bool:
    """删除展品。"""
    with _conn() as c:
        cur = c.execute("DELETE FROM exhibits WHERE id = ?", (exhibit_id,))
        return cur.rowcount > 0


# ─────────────────────────────────────────────────────────────────
# 讲解内容 (Contents)
# ─────────────────────────────────────────────────────────────────

def create_content(
    title: str,
    body: str,
    exhibit_id: str = "",
    language: str = "zh-CN",
    category: str = "exhibit",
    tags: list[str] | None = None,
    duration_sec: int = 0,
    status: str = "draft",
    video_filename: str = "",
) -> dict:
    """创建讲解内容。"""
    now = time.time()
    row = {
        "id": uuid.uuid4().hex,
        "title": title,
        "body": body,
        "language": language,
        "version": 1,
        "parent_id": "",
        "exhibit_id": exhibit_id or "",
        "category": category,
        "tags": json.dumps(tags or [], ensure_ascii=False),
        "duration_sec": duration_sec,
        "status": status,
        "video_filename": video_filename,
        "created_at": now,
        "updated_at": now,
        "published_at": None,
    }
    with _conn() as c:
        c.execute("""
            INSERT INTO contents (id, title, body, language, version, parent_id,
                exhibit_id, category, tags, duration_sec, status, video_filename,
                created_at, updated_at, published_at)
            VALUES (:id, :title, :body, :language, :version, :parent_id,
                :exhibit_id, :category, :tags, :duration_sec, :status, :video_filename,
                :created_at, :updated_at, :published_at)
        """, row)
    return row


def get_content(content_id: str) -> dict | None:
    """获取单条内容。"""
    with _conn() as c:
        row = c.execute("SELECT * FROM contents WHERE id = ?", (content_id,)).fetchone()
        if row:
            r = dict(row)
            r["tags"] = json.loads(r.get("tags", "[]"))
            return r
        return None


def list_contents(
    exhibit_id: str = "",
    language: str = "",
    status: str = "",
    category: str = "",
    page: int = 1,
    size: int = 20,
) -> tuple[list[dict], int]:
    """分页查询内容列表。"""
    conditions = []
    args: list = []
    if exhibit_id:
        conditions.append("exhibit_id = ?")
        args.append(exhibit_id)
    if language:
        conditions.append("language = ?")
        args.append(language)
    if status:
        conditions.append("status = ?")
        args.append(status)
    if category:
        conditions.append("category = ?")
        args.append(category)
    where = " AND ".join(conditions) if conditions else "1=1"

    with _conn() as c:
        total = c.execute(
            f"SELECT COUNT(*) FROM contents WHERE {where}", args
        ).fetchone()[0]
        offset = (page - 1) * size
        rows = c.execute(
            f"SELECT * FROM contents WHERE {where} ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            [*args, size, offset]
        ).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        d["tags"] = json.loads(d.get("tags", "[]"))
        results.append(d)
    return results, total


def update_content(content_id: str, **fields) -> bool:
    """更新内容字段（自动更新 updated_at）。"""
    if not fields:
        return False
    fields["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = content_id
    with _conn() as c:
        cur = c.execute(f"UPDATE contents SET {set_clause} WHERE id = :id", fields)
        return cur.rowcount > 0


def publish_content(content_id: str) -> bool:
    """发布内容（设置 status=draft→published 并记录 published_at）。"""
    now = time.time()
    with _conn() as c:
        cur = c.execute(
            "UPDATE contents SET status = 'published', published_at = ?, updated_at = ? WHERE id = ?",
            (now, now, content_id)
        )
        return cur.rowcount > 0


def archive_content(content_id: str) -> bool:
    """归档内容。"""
    now = time.time()
    with _conn() as c:
        cur = c.execute(
            "UPDATE contents SET status = 'archived', updated_at = ? WHERE id = ?",
            (now, content_id)
        )
        return cur.rowcount > 0


def delete_content(content_id: str) -> bool:
    """删除内容。"""
    with _conn() as c:
        c.execute("DELETE FROM content_versions WHERE content_id = ?", (content_id,))
        cur = c.execute("DELETE FROM contents WHERE id = ?", (content_id,))
        return cur.rowcount > 0


def save_content_version(
    content_id: str,
    body: str,
    change_summary: str = "",
) -> dict:
    """保存内容快照到版本历史。"""
    now = time.time()
    row = {
        "id": uuid.uuid4().hex,
        "content_id": content_id,
        "version": 1,
        "body": body,
        "change_summary": change_summary or "",
        "created_at": now,
    }
    with _conn() as c:
        max_v = c.execute(
            "SELECT MAX(version) FROM content_versions WHERE content_id = ?",
            (content_id,)
        ).fetchone()[0] or 0
        row["version"] = max_v + 1
        c.execute("""
            INSERT INTO content_versions (id, content_id, version, body, change_summary, created_at)
            VALUES (:id, :content_id, :version, :body, :change_summary, :created_at)
        """, row)
    return row


def get_content_versions(content_id: str) -> list[dict]:
    """获取内容的版本历史。"""
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM content_versions WHERE content_id = ? ORDER BY version DESC",
            (content_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def restore_content_version(content_id: str, version: int) -> bool:
    """从历史版本恢复内容（创建新版本快照后覆盖正文）。"""
    with _conn() as c:
        current = c.execute(
            "SELECT * FROM contents WHERE id = ?", (content_id,)
        ).fetchone()
        if not current:
            return False
        current = dict(current)

        snapshot_row = {
            "id": uuid.uuid4().hex,
            "content_id": content_id,
            "version": current.get("version", 1),
            "body": current.get("body", ""),
            "change_summary": f"Restore from v{version}",
            "created_at": time.time(),
        }
        max_v = c.execute(
            "SELECT MAX(version) FROM content_versions WHERE content_id = ?",
            (content_id,)
        ).fetchone()[0] or 0
        snapshot_row["version"] = max_v + 1
        c.execute("""
            INSERT INTO content_versions (id, content_id, version, body, change_summary, created_at)
            VALUES (:id, :content_id, :version, :body, :change_summary, :created_at)
        """, snapshot_row)

        old = c.execute(
            "SELECT body FROM content_versions WHERE content_id = ? AND version = ?",
            (content_id, version)
        ).fetchone()
        if not old:
            return False

        now = time.time()
        c.execute(
            "UPDATE contents SET body = ?, version = ?, updated_at = ? WHERE id = ?",
            (old[0], current.get("version", 1) + 1, now, content_id)
        )
        return True


# ─────────────────────────────────────────────────────────────────
# 访客互动记录 (Interactions)
# ─────────────────────────────────────────────────────────────────

def track_interaction(
    session_id: str,
    event_type: str,
    exhibit_id: str = "",
    content_id: str = "",
    duration_ms: int = 0,
    metadata: dict | None = None,
    device_id: str = "",
) -> dict:
    """记录一条访客互动。"""
    now = time.time()
    row = {
        "id": uuid.uuid4().hex,
        "session_id": session_id or "",
        "exhibit_id": exhibit_id or "",
        "content_id": content_id or "",
        "event_type": event_type,
        "duration_ms": duration_ms,
        "metadata": json.dumps(metadata or {}, ensure_ascii=False),
        "device_id": device_id or "",
        "created_at": now,
    }
    with _conn() as c:
        c.execute("""
            INSERT INTO interactions (id, session_id, exhibit_id, content_id,
                event_type, duration_ms, metadata, device_id, created_at)
            VALUES (:id, :session_id, :exhibit_id, :content_id,
                :event_type, :duration_ms, :metadata, :device_id, :created_at)
        """, row)
    return row


def batch_track_interactions(records: list[dict]) -> int:
    """批量插入互动记录（离线模式收集后批量上传）。"""
    now = time.time()
    count = 0
    with _conn() as c:
        for rec in records:
            row = {
                "id": rec.get("id") or uuid.uuid4().hex,
                "session_id": rec.get("session_id") or "",
                "exhibit_id": rec.get("exhibit_id") or "",
                "content_id": rec.get("content_id") or "",
                "event_type": rec.get("event_type", ""),
                "duration_ms": rec.get("duration_ms", 0),
                "metadata": json.dumps(rec.get("metadata") or {}, ensure_ascii=False),
                "device_id": rec.get("device_id") or "",
                "created_at": rec.get("created_at") or now,
            }
            c.execute("""
                INSERT INTO interactions (id, session_id, exhibit_id, content_id,
                    event_type, duration_ms, metadata, device_id, created_at)
                VALUES (:id, :session_id, :exhibit_id, :content_id,
                    :event_type, :duration_ms, :metadata, :device_id, :created_at)
            """, row)
            count += 1
    return count


def get_analytics_summary(
    since: float = 0,
    until: float = 0,
) -> dict:
    """获取分析汇总数据。"""
    with _conn() as c:
        conditions = []
        args: list = []
        if since > 0:
            conditions.append("created_at >= ?")
            args.append(since)
        if until > 0:
            conditions.append("created_at <= ?")
            args.append(until)
        where_clause = (" WHERE " + " AND ".join(conditions)) if conditions else ""
        where_and = (" AND " + " AND ".join(conditions)) if conditions else ""

        # 用于带表别名的 JOIN 查询（exhibits 也有 created_at，需要明确用 i. 前缀）
        conditions_i = [c.replace("created_at ", "i.created_at ") for c in conditions]
        where_clause_i = (" WHERE " + " AND ".join(conditions_i)) if conditions_i else ""
        where_and_i = (" AND " + " AND ".join(conditions_i)) if conditions_i else ""

        total_visits = c.execute(
            f"SELECT COUNT(*) FROM interactions{where_clause}", args
        ).fetchone()[0]

        # 热门展品（JOIN exhibits 表获取可读名称）
        if where_clause_i:
            popular_rows = c.execute(
                f"""SELECT i.exhibit_id, COUNT(*) as cnt,
                          COALESCE(e.name, e.code, i.exhibit_id) as exhibit_name
                   FROM interactions i
                   LEFT JOIN exhibits e ON e.id = i.exhibit_id
                   {where_clause_i} AND i.event_type = 'view'
                   GROUP BY i.exhibit_id ORDER BY cnt DESC LIMIT 10""",
                args
            ).fetchall()
        else:
            popular_rows = c.execute(
                """SELECT i.exhibit_id, COUNT(*) as cnt,
                          COALESCE(e.name, e.code, i.exhibit_id) as exhibit_name
                   FROM interactions i
                   LEFT JOIN exhibits e ON e.id = i.exhibit_id
                   WHERE i.event_type = 'view'
                   GROUP BY i.exhibit_id ORDER BY cnt DESC LIMIT 10"""
            ).fetchall()
        popular_exhibits = [
            {"exhibit_id": r[0], "count": r[1], "name": r[2]}
            for r in popular_rows
        ]

        # 语言分布：从 metadata JSON 中解析 language 字段
        def _extract_lang(meta_str: str) -> str:
            try:
                m = json.loads(meta_str)
                return str(m.get("language", "unknown")) if m else "unknown"
            except Exception:
                return "unknown"

        # 直接用外层连接获取所有 metadata（无需嵌套连接）
        if where_clause:
            meta_rows = c.execute(
                f"SELECT metadata FROM interactions{where_clause}", args
            ).fetchall()
        else:
            meta_rows = c.execute(
                "SELECT metadata FROM interactions"
            ).fetchall()
        lang_map: dict[str, int] = {}
        for r in meta_rows:
            lang = _extract_lang(r[0] or "{}")
            lang_map[lang] = lang_map.get(lang, 0) + 1
        lang_rows = sorted(lang_map.items(), key=lambda x: -x[1])[:20]

        # 平均时长
        if where_clause:
            avg_duration = c.execute(
                f"SELECT AVG(duration_ms) FROM interactions WHERE duration_ms > 0{where_and}", args
            ).fetchone()[0] or 0
        else:
            avg_duration = c.execute(
                "SELECT AVG(duration_ms) FROM interactions WHERE duration_ms > 0"
            ).fetchone()[0] or 0

    return {
        "total_visits": total_visits,
        "popular_exhibits": popular_exhibits,
        "language_distribution": [(lang, cnt) for lang, cnt in lang_rows],
        "avg_watch_duration_ms": int(avg_duration),
    }


def get_live_visitors(minutes: int = 5) -> int:
    """获取最近 N 分钟内的独立访客数（用于实时指标）。"""
    since = time.time() - minutes * 60
    with _conn() as c:
        count = c.execute(
            "SELECT COUNT(DISTINCT session_id) FROM interactions WHERE created_at >= ?",
            (since,)
        ).fetchone()[0]
    return count


def get_daily_trends(days: int = 7) -> list[dict]:
    """获取最近 N 天的每日访问量趋势。"""
    since = time.time() - days * 86400
    with _conn() as c:
        rows = c.execute(
            """SELECT date(created_at, 'unixepoch', 'localtime') as day,
                      COUNT(*) as cnt
               FROM interactions
               WHERE created_at >= ?
               GROUP BY day
               ORDER BY day ASC""",
            (since,)
        ).fetchall()
    return [{"date": r[0], "count": r[1]} for r in rows]


def get_hourly_distribution(since: float = 0) -> list[dict]:
    """获取按小时分布的访问量（0-23小时）。"""
    with _conn() as c:
        rows = c.execute(
            """SELECT CAST(strftime('%H', created_at, 'unixepoch', 'localtime') AS INTEGER) as hour,
                      COUNT(*) as cnt
               FROM interactions
               WHERE created_at >= ?
               GROUP BY hour
               ORDER BY hour ASC""",
            (since,)
        ).fetchall()
    hourly = {h: 0 for h in range(24)}
    for r in rows:
        hourly[r[0]] = r[1]
    return [{"hour": h, "count": cnt} for h, cnt in hourly.items()]


def list_interactions(
    page: int = 1,
    size: int = 20,
    exhibit_id: str = "",
    event_type: str = "",
    since: float = 0,
    until: float = 0,
) -> tuple[list[dict], int]:
    """分页查询互动记录。返回 (records, total_count)。"""
    conditions = []
    args: list = []
    if since > 0:
        conditions.append("created_at >= ?")
        args.append(since)
    if until > 0:
        conditions.append("created_at <= ?")
        args.append(until)
    if exhibit_id:
        conditions.append("exhibit_id = ?")
        args.append(exhibit_id)
    if event_type:
        conditions.append("event_type = ?")
        args.append(event_type)
    where = " AND ".join(conditions) if conditions else "1=1"
    with _conn() as c:
        total = c.execute(f"SELECT COUNT(*) FROM interactions WHERE {where}", args).fetchone()[0]
        offset = (page - 1) * size
        rows = c.execute(
            f"SELECT * FROM interactions WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            [*args, size, offset]
        ).fetchall()
    return [dict(r) for r in rows], total


def get_updates_since(timestamp: float) -> dict:
    """获取自指定时间戳以来的内容更新（增量同步）。"""
    with _conn() as c:
        exhibits = c.execute(
            "SELECT * FROM exhibits WHERE updated_at > ?", (timestamp,)
        ).fetchall()
        contents = c.execute(
            "SELECT * FROM contents WHERE updated_at > ?", (timestamp,)
        ).fetchall()
    return {
        "exhibits": [dict(r) for r in exhibits],
        "contents": [dict(r) for r in contents],
        "sync_timestamp": time.time(),
    }
