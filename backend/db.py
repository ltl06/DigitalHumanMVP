"""
历史记录数据库模块。
使用 SQLite 持久化存储所有任务记录，重启后数据不丢失。
"""

import sqlite3
import json
import time
import threading
from pathlib import Path
from contextlib import contextmanager

_lock = threading.Lock()


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


def init_db():
    """初始化数据库表（幂等操作）。"""
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id              TEXT PRIMARY KEY,
                name            TEXT DEFAULT '',
                job_type        TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'processing',
                step            TEXT DEFAULT '',
                progress        INTEGER DEFAULT 0,
                message         TEXT DEFAULT '',
                audio_filename  TEXT DEFAULT '',
                video_filename  TEXT DEFAULT '',
                params          TEXT DEFAULT '{}',
                trace           TEXT DEFAULT '',
                created_at      REAL NOT NULL,
                updated_at      REAL NOT NULL,
                completed_at    REAL
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC)
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)
        """)

        # 迁移：逐列检查，不存在的列用 ALTER TABLE 添加
        existing_cols = {r[1] for r in c.execute("PRAGMA table_info(jobs)").fetchall()}
        for col, dtype in [
            ("multi_camera", "INTEGER DEFAULT 0"),
            ("filename",      "TEXT DEFAULT ''"),
            ("result",        "TEXT DEFAULT '{}'"),
            ("timeline",      "TEXT DEFAULT '[]'"),
        ]:
            if col not in existing_cols:
                c.execute(f"ALTER TABLE jobs ADD COLUMN {col} {dtype}")

        # ── 展品表 ────────────────────────────────────────────────
        c.execute("""
            CREATE TABLE IF NOT EXISTS exhibits (
                id              TEXT PRIMARY KEY,
                name            TEXT NOT NULL,
                code            TEXT UNIQUE,
                description     TEXT DEFAULT '',
                category        TEXT DEFAULT '',
                digital_human_model TEXT DEFAULT '',
                default_language TEXT DEFAULT 'zh-CN',
                exhibit_video_filename TEXT DEFAULT '',
                created_at      REAL NOT NULL,
                updated_at      REAL NOT NULL
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_exhibits_code ON exhibits(code)
        """)

        # ── 讲解内容表 ──────────────────────────────────────────────
        c.execute("""
            CREATE TABLE IF NOT EXISTS contents (
                id              TEXT PRIMARY KEY,
                title           TEXT NOT NULL,
                body            TEXT NOT NULL,
                language        TEXT DEFAULT 'zh-CN',
                version         INTEGER DEFAULT 1,
                parent_id       TEXT,
                exhibit_id      TEXT,
                category        TEXT DEFAULT 'exhibit',
                tags            TEXT DEFAULT '[]',
                duration_sec    INTEGER,
                status          TEXT DEFAULT 'draft',
                video_filename  TEXT DEFAULT '',
                created_at      REAL NOT NULL,
                updated_at      REAL NOT NULL,
                published_at    REAL,
                FOREIGN KEY (exhibit_id) REFERENCES exhibits(id)
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_contents_exhibit ON contents(exhibit_id)
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_contents_status ON contents(status)
        """)

        # Migration: add video_filename to contents if not exists
        try:
            c.execute("ALTER TABLE contents ADD COLUMN video_filename TEXT DEFAULT ''")
        except Exception:
            pass  # column already exists

        # Migration: add exhibit_video_filename to exhibits if not exists
        try:
            c.execute("ALTER TABLE exhibits ADD COLUMN exhibit_video_filename TEXT DEFAULT ''")
        except Exception:
            pass  # column already exists

        # ── 内容版本历史表 ──────────────────────────────────────────
        c.execute("""
            CREATE TABLE IF NOT EXISTS content_versions (
                id              TEXT PRIMARY KEY,
                content_id      TEXT NOT NULL,
                version         INTEGER NOT NULL,
                body            TEXT NOT NULL,
                change_summary  TEXT DEFAULT '',
                created_at      REAL NOT NULL,
                FOREIGN KEY (content_id) REFERENCES contents(id)
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_cv_content ON content_versions(content_id)
        """)

        # ── 访客互动记录表 ──────────────────────────────────────────
        c.execute("""
            CREATE TABLE IF NOT EXISTS interactions (
                id              TEXT PRIMARY KEY,
                session_id      TEXT,
                exhibit_id      TEXT,
                content_id      TEXT,
                event_type      TEXT NOT NULL,
                duration_ms     INTEGER DEFAULT 0,
                metadata        TEXT DEFAULT '{}',
                device_id       TEXT,
                created_at      REAL NOT NULL
            )
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_interactions_session ON interactions(session_id)
        """)
        c.execute("""
            CREATE INDEX IF NOT EXISTS idx_interactions_exhibit ON interactions(exhibit_id)
        """)


# ── CRUD ──────────────────────────────────────────────────────────────────────

def create_job(job_id: str, job_type: str, params: dict, name: str = "") -> dict:
    """创建一条新任务记录。"""
    now = time.time()
    row = {
        "id": job_id,
        "name": name,
        "job_type": job_type,
        "status": "processing",
        "step": "",
        "progress": 0,
        "message": "",
        "audio_filename": "",
        "video_filename": "",
        "params": json.dumps(params, ensure_ascii=False),
        "trace": "",
        "created_at": now,
        "updated_at": now,
        "completed_at": None,
    }
    with _conn() as c:
        c.execute("""
            INSERT INTO jobs (id, name, job_type, status, step, progress, message,
                             audio_filename, video_filename, params, trace,
                             created_at, updated_at, completed_at)
            VALUES (:id, :name, :job_type, :status, :step, :progress, :message,
                    :audio_filename, :video_filename, :params, :trace,
                    :created_at, :updated_at, :completed_at)
        """, row)
    return row


def update_job(job_id: str, **fields) -> bool:
    """更新任务字段（只更新提供的字段）。"""
    if not fields:
        return False
    fields["updated_at"] = time.time()
    if fields.get("status") in ("completed", "failed"):
        fields["completed_at"] = time.time()
    set_clause = ", ".join(f"{k} = :{k}" for k in fields)
    fields["id"] = job_id
    # Serialize list/dict values to JSON strings for SQLite compatibility
    serialized_fields = {}
    for k, v in fields.items():
        if isinstance(v, (list, dict)):
            serialized_fields[k] = json.dumps(v, ensure_ascii=False)
        else:
            serialized_fields[k] = v
    with _conn() as c:
        cur = c.execute(
            f"UPDATE jobs SET {set_clause} WHERE id = :id",
            serialized_fields
        )
        return cur.rowcount > 0


def get_job(job_id: str) -> dict | None:
    """根据 ID 获取单条任务。"""
    with _conn() as c:
        row = c.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if row:
            return dict(row)
    return None


def list_jobs(
    page: int = 1,
    size: int = 12,
    status: str = "",
    search: str = "",
    job_type: str = "",
) -> tuple[list[dict], int]:
    """
    分页查询任务列表。
    返回 (records, total_count)。
    """
    conditions = []
    args: list = []

    if status:
        conditions.append("status = ?")
        args.append(status)
    if job_type:
        conditions.append("job_type = ?")
        args.append(job_type)
    if search:
        conditions.append("(name LIKE ? OR params LIKE ?)")
        like = f"%{search}%"
        args.extend([like, like])

    where = " AND ".join(conditions) if conditions else "1=1"

    with _conn() as c:
        total = c.execute(
            f"SELECT COUNT(*) FROM jobs WHERE {where}", args
        ).fetchone()[0]

        offset = (page - 1) * size
        rows = c.execute(
            f"""
            SELECT * FROM jobs
            WHERE {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            [*args, size, offset]
        ).fetchall()

    return [dict(r) for r in rows], total


def delete_job(job_id: str) -> bool:
    """删除单条任务记录。"""
    with _conn() as c:
        cur = c.execute("DELETE FROM jobs WHERE id = ?", (job_id,))
        return cur.rowcount > 0


def clear_jobs(job_type: str = "") -> int:
    """清空所有（或指定类型）任务记录，返回删除数量。"""
    with _conn() as c:
        if job_type:
            cur = c.execute("DELETE FROM jobs WHERE job_type = ?", (job_type,))
        else:
            cur = c.execute("DELETE FROM jobs")
        return cur.rowcount


def get_stats() -> dict:
    """获取统计数据。"""
    with _conn() as c:
        total = c.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
        completed = c.execute(
            "SELECT COUNT(*) FROM jobs WHERE status = 'completed'"
        ).fetchone()[0]
        failed = c.execute(
            "SELECT COUNT(*) FROM jobs WHERE status = 'failed'"
        ).fetchone()[0]
        processing = c.execute(
            "SELECT COUNT(*) FROM jobs WHERE status = 'processing'"
        ).fetchone()[0]
        week_ago = time.time() - 7 * 86400
        week_count = c.execute(
            "SELECT COUNT(*) FROM jobs WHERE created_at > ?", (week_ago,)
        ).fetchone()[0]
    return {
        "total": total,
        "completed": completed,
        "failed": failed,
        "processing": processing,
        "week_count": week_count,
    }
