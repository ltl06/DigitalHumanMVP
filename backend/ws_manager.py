"""
WebSocket 连接管理器。
提供任务状态实时推送能力，支持 SSE 作为 fallback。
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

# 简单的内存连接管理器（生产环境建议用 Redis pub/sub）
_connection_lock = asyncio.Lock()
_connections: dict[str, set[Any]] = {}  # job_id -> set of websockets


def _connection_key(websocket: Any) -> int:
    return id(websocket)


async def connect(job_id: str, websocket: Any) -> None:
    async with _connection_lock:
        if job_id not in _connections:
            _connections[job_id] = set()
        _connections[job_id].add(_connection_key(websocket))


async def disconnect(job_id: str, websocket: Any) -> None:
    async with _connection_lock:
        if job_id in _connections:
            _connections[job_id].discard(_connection_key(websocket))
            if not _connections[job_id]:
                del _connections[job_id]


async def broadcast(job_id: str, data: dict) -> None:
    """向所有订阅该任务 ID 的 WebSocket 推送消息"""
    payload = json.dumps(data, ensure_ascii=False)
    dead = []

    async with _connection_lock:
        if job_id not in _connections:
            return
        connections = list(_connections[job_id])

    for ws in connections:
        try:
            await ws.send_text(payload)
        except Exception as e:
            logger.warning(f"WebSocket send failed: {e}")
            dead.append(ws)

    if dead:
        async with _connection_lock:
            for ws in dead:
                _connections[job_id].discard(_connection_key(ws))


def get_subscriber_count(job_id: str) -> int:
    return len(_connections.get(job_id, set()))
