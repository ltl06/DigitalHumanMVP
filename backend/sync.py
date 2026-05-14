"""
离线同步服务
管理离线终端数据回传和增量内容同步
"""

from __future__ import annotations

import time
import json
import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from cms_db import (
    batch_track_interactions,
    get_updates_since,
)
from network import get_network_status, is_online

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/sync", tags=["sync"])

# 本地待同步队列文件（用于持久化离线数据）
_SYNC_QUEUE_PATH = Path(__file__).parent / "sync_queue.json"


def _load_queue() -> list[dict]:
    if not _SYNC_QUEUE_PATH.exists():
        return []
    try:
        with open(_SYNC_QUEUE_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_queue(items: list[dict]):
    with open(_SYNC_QUEUE_PATH, "w", encoding="utf-8") as f:
        json.dump(items, f, ensure_ascii=False, indent=2)


# ─────────────────────────────────────────────────────────────────
# 数据模型
# ─────────────────────────────────────────────────────────────────

class InteractionRecord(BaseModel):
    id: str | None = None
    session_id: str | None = None
    exhibit_id: str | None = None
    content_id: str | None = None
    event_type: str
    duration_ms: int = 0
    metadata: dict = {}
    device_id: str | None = None
    created_at: float | None = None


class InteractionUploadRequest(BaseModel):
    interactions: list[InteractionRecord]


# ─────────────────────────────────────────────────────────────────
# 离线数据上传
# ─────────────────────────────────────────────────────────────────

@router.post("/upload-interactions")
def upload_interactions(req: InteractionUploadRequest):
    """
    离线终端批量上传互动数据。
    在线时直接写入数据库；离线时持久化到本地队列待下次同步。
    """
    online = is_online()
    records = [r.model_dump() for r in req.interactions]

    if online:
        count = batch_track_interactions(records)
        return {"ok": True, "synced": count, "mode": "online"}
    else:
        # 离线：追加到本地队列
        queue = _load_queue()
        for rec in records:
            rec["id"] = rec.get("id") or ""
            rec["synced_at"] = time.time()
        queue.extend(records)
        _save_queue(queue)
        return {"ok": True, "queued": len(records), "mode": "offline"}


@router.get("/flush-queue")
def flush_queue():
    """
    网络恢复后，尝试将本地离线队列中的数据同步到数据库。
    由定时任务或网络恢复触发。
    """
    online = is_online()
    if not online:
        return {"ok": False, "reason": "still_offline", "queue_size": len(_load_queue())}

    queue = _load_queue()
    if not queue:
        return {"ok": True, "synced": 0, "reason": "empty_queue"}

    synced = batch_track_interactions(queue)
    _save_queue([])  # 清空队列
    return {"ok": True, "synced": synced, "reason": "flush_success"}


@router.get("/queue-status")
def queue_status():
    """查询离线队列状态。"""
    queue = _load_queue()
    return {
        "queue_size": len(queue),
        "oldest_timestamp": queue[0].get("created_at") if queue else None,
        "newest_timestamp": queue[-1].get("created_at") if queue else None,
    }


# ─────────────────────────────────────────────────────────────────
# 增量内容同步
# ─────────────────────────────────────────────────────────────────

@router.get("/check-updates")
def sync_check_updates(since: float = Query(0)):
    """
    检查自指定时间戳以来的内容更新（增量同步）。
    用于离线终端联网后拉取最新内容。
    """
    data = get_updates_since(since)
    return {
        "exhibits": data["exhibits"],
        "contents": data["contents"],
        "sync_timestamp": data["sync_timestamp"],
    }


# ─────────────────────────────────────────────────────────────────
# 网络状态 + 同步状态
# ─────────────────────────────────────────────────────────────────

@router.get("/status")
def sync_status():
    """返回完整的同步状态（网络状态 + 队列状态）。"""
    net = get_network_status()
    queue = _load_queue()
    return {
        "network": net,
        "queue_size": len(queue),
        "can_sync": is_online(),
    }
