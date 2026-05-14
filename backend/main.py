from __future__ import annotations

"""
DigitalHuman MVP - FastAPI 主应用
"""

import os
import sys
import uuid
import shutil
import traceback
import threading
import json
import asyncio
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Callable

# 确保路径正确（支持 python backend/main.py 方式启动）
_backend_dir = Path(__file__).parent.resolve()
_parent_dir = _backend_dir.parent
for p in [str(_backend_dir), str(_parent_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks, Query, Path as PathParam, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse
import time

from core.config import configure, get_config
from db import (
    init_db,
    create_job,
    update_job as db_update_job,
    get_job as db_get_job,
    list_jobs,
    delete_job as db_delete_job,
    clear_jobs as db_clear_jobs,
    get_stats,
)
from ws_manager import connect, disconnect, broadcast, get_subscriber_count
from cms import router as cms_router
from sync import router as sync_router
from network import start_network_monitor, get_network_status, force_check

_logger = logging.getLogger(__name__)

# ── 速率限制（简单内存实现，生产环境建议 Redis）─────────────
class RateLimitMiddleware(BaseHTTPMiddleware):
    # 高频/轻量级端点 → 豁免限速，避免仪表盘/终端页面触发 429
    EXEMPT_PATHS = {
        "/api/health",
        "/api/cms/analytics/live-visitors",
        "/api/cms/analytics/track",
        "/api/cms/analytics/trends",
        "/api/cms/analytics/hourly",
        "/api/cms/exhibits",
    }

    def __init__(self, app, calls: int = 600, period: float = 60.0):
        super().__init__(app)
        self.calls = calls
        self.period = period
        self._requests: dict[str, list[float]] = {}

    def _clean(self, key: str):
        now = time.time()
        self._requests[key] = [t for t in self._requests.get(key, []) if now - t < self.period]

    async def dispatch(self, request: Request, call_next: Callable):
        # 豁免高频/轻量端点
        path = request.url.path
        if any(path.startswith(p) for p in self.EXEMPT_PATHS):
            return await call_next(request)

        key = request.client.host if request.client else "unknown"
        self._clean(key)
        if len(self._requests.get(key, [])) >= self.calls:
            return JSONResponse({"detail": "请求过于频繁，请稍后再试"}, status_code=429)
        self._requests.setdefault(key, []).append(time.time())
        return await call_next(request)

_config: dict = {}

# 异步推送队列（用于从同步线程向事件循环传递推送任务）
_notification_queue: asyncio.Queue | None = None
_loop: asyncio.AbstractEventLoop | None = None


def _enqueue_notification(jid: str, payload: dict):
    """从同步线程安全地将推送任务加入队列"""
    if _notification_queue is not None and _loop is not None:
        def _do_enqueue():
            asyncio.create_task(_notification_queue.put({"job_id": jid, "payload": payload}))
        _loop.call_soon_threadsafe(_do_enqueue)


# ── 全局任务状态（线程安全，内存缓存 + 数据库持久化）──────────────
JOBS_LOCK = threading.Lock()
JOBS: dict = {}


def job_status(jid: str):
    with JOBS_LOCK:
        if jid in JOBS:
            return JOBS.get(jid, {"status": "not_found", "message": "任务不存在"})
    # 内存未命中，查数据库
    record = db_get_job(jid)
    if record:
        return {
            "id": record["id"],
            "status": record["status"],
            "step": record["step"],
            "progress": record["progress"],
            "message": record["message"],
            "name": record["name"],
            "audio_filename": record["audio_filename"],
            "video_filename": record["video_filename"],
        }
    return {"status": "not_found", "message": "任务不存在"}


def update_job(jid: str, status: str, **kwargs):
    with JOBS_LOCK:
        JOBS[jid] = {"id": jid, "status": status, **kwargs}
    # 同步写数据库
    db_update_job(jid, status=status, **kwargs)
    # 异步推送 WebSocket + SSE 通知（线程安全）
    payload = {"type": "job_update", "job_id": jid, "status": status, **kwargs}
    _enqueue_notification(jid, payload)


# ── 上传配置 ─────────────────────────────────────────────────
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB

ALLOWED_FACE_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"}
ALLOWED_AUDIO_TYPES = {"audio/wav", "audio/mpeg", "audio/mp3", "audio/flac", "audio/ogg"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime"}

# ── 音色预览预生成 ─────────────────────────────────────────────
_SPEAKER_PREVIEW_TEXT = {
    "Vivian": "您好，很高兴为您服务。",
    "Serena": "欢迎了解我们的产品。",
    "Uncle_Fu": "老少爷们儿，今儿给您说段儿。",
    "Dylan": "嘿，哥们儿，这事儿真逗。",
    "Eric": "安逸得很，巴适得板。",
    "Ryan": "Hello, welcome to our platform.",
    "Aiden": "Welcome to the digital world.",
    "Ono_Anna": "こんにちは、ようこそ。",
    "Sohee": "안녕하세요, 환영합니다.",
}


def _generate_speaker_previews(config: dict):
    """在后端启动时预生成所有音色预览音频文件（异步后台运行，不阻塞启动）。"""
    import os, asyncio as _asyncio
    output_dir = config.get("output_dir")
    if not output_dir:
        _logger.warning("[启动] 输出目录未配置，跳过预览音频生成")
        return
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    async def _bg_gen():
        for speaker_id, text in _SPEAKER_PREVIEW_TEXT.items():
            dest = output_dir / f"preview_{speaker_id}.wav"
            if dest.exists():
                _logger.debug(f"[预览] 音频已存在，跳过: {dest.name}")
                continue
            _logger.info(f"[预览] 生成中: {speaker_id}")
            try:
                from engines.tts import generate_custom_voice
                generate_custom_voice(
                    text=text,
                    output_path=str(dest),
                    speaker=speaker_id,
                    language="Auto",
                    instruct="",
                    speed=1.0, pitch=0.0, volume=1.0,
                )
                _logger.info(f"[预览] 生成成功: {dest.name}")
            except Exception as e:
                _logger.warning(f"[预览] 生成失败 ({speaker_id}): {e}")
            await _asyncio.sleep(1)

    try:
        loop = asyncio.get_running_loop()
        loop.create_task(_bg_gen())
    except RuntimeError:
        import threading
        def _run():
            loop = _asyncio.new_event_loop()
            _asyncio.set_event_loop(loop)
            loop.run_until_complete(_bg_gen())
            loop.close()
        threading.Thread(target=_run, daemon=True).start()


# ── 生命周期 ────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _config, _loop, _notification_queue
    _logger.info("[启动] 初始化数据库...")
    init_db()
    _logger.info("[启动] 加载配置...")
    configure()
    _config = get_config()
    _logger.info(f"[启动] 上传目录: {_config['upload_dir']}")
    _logger.info(f"[启动] 输出目录: {_config['output_dir']}")

    _init_allowed_dirs()

    # Initialize expression engine
    if _config.get("wav2lip_root"):
        try:
            from engines.expression import configure as configure_expr
            configure_expr(_config["wav2lip_root"])
        except Exception as e:
            _logger.warning(f"[启动] Expression engine init failed: {e}")

    # 预生成音色预览音频
    _generate_speaker_previews(_config)

    # 初始化事件循环引用和通知队列
    _loop = asyncio.get_running_loop()
    _notification_queue = asyncio.Queue()

    # 启动网络监控线程
    start_network_monitor(interval=30.0)

    async def _process_notifications():
        while True:
            try:
                item = await _notification_queue.get()
                job_id = item["job_id"]
                payload = item["payload"]
                await broadcast(job_id, payload)
                await sse_broadcast(job_id, payload)
            except asyncio.CancelledError:
                break
            except Exception as e:
                _logger.error(f"通知推送失败: {e}")

    _notify_task = asyncio.create_task(_process_notifications())

    yield

    _notify_task.cancel()
    try:
        await _notify_task
    except asyncio.CancelledError:
        pass
    _notification_queue = None
    _loop = None
    _logger.info("[关闭] 释放模型...")
    try:
        from engines.tts import tts_unload
        from engines.wav2lip import wav2lip_unload
        from engines.expression import unload_model
        tts_unload()
        wav2lip_unload()
        unload_model()
    except Exception as e:
        _logger.error(f"[关闭] 释放模型出错: {e}")


app = FastAPI(
    title="DigitalHuman MVP API",
    description="数字人合成 API - Qwen3-TTS + Easy-Wav2Lip",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(RateLimitMiddleware, calls=600, period=60.0)

# CMS 内容管理路由
app.include_router(cms_router)
# 离线同步路由
app.include_router(sync_router)


# ══════════════════════════════════════════════════════════════
# WebSocket / SSE 实时推送端点
# ══════════════════════════════════════════════════════════════

@app.websocket("/api/ws/{job_id}")
async def websocket_endpoint(websocket: WebSocket, job_id: str):
    await websocket.accept()
    await connect(job_id, websocket)
    try:
        # 发送当前状态
        status = job_status(job_id)
        await websocket.send_json({"type": "job_update", "job_id": job_id, **status})
        # 保持连接直到客户端断开
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                # 客户端可发送 ping，保持心跳
                if data == "ping":
                    await websocket.send_text("pong")
            except asyncio.TimeoutError:
                # 发送心跳
                try:
                    await websocket.send_json({"type": "heartbeat"})
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    finally:
        await disconnect(job_id, websocket)


# SSE 端点（WebSocket 的 fallback，适合跨域场景）
@app.get("/api/sse/{job_id}")
async def sse_endpoint(job_id: str, request: Request):
    async def event_generator():
        queue: asyncio.Queue = asyncio.Queue()
        subscribers[job_id].append(queue.put_nowait)

        async def broadcast_wrapper(data):
            await queue.put(data)

        # 发送当前状态
        status = job_status(job_id)
        yield f"data: {json.dumps({'type': 'job_update', 'job_id': job_id, **status})}\n\n"

        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield f": heartbeat\n\n"
        except GeneratorExit:
            pass
        finally:
            if job_id in subscribers:
                subscribers[job_id].remove(queue.put_nowait)

    request.app.state.sse_broadcasts[job_id] = broadcast_wrapper
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# 全局订阅表（SSE 用）
subscribers: dict[str, list] = {}


async def sse_broadcast(job_id: str, data: dict):
    if job_id in subscribers:
        for notify in subscribers[job_id]:
            try:
                await notify(data)
            except Exception as e:
                _logger.warning(f"SSE broadcast failed for job {job_id}: {e}")

# ── Pydantic 模型 (with field constraints) ──────────────────────
class HistoryRenameRequest(BaseModel):
    name: str = ""


class TTSCustomVoiceRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    speaker: str = Field("Vivian", min_length=1, max_length=50)
    language: str = Field("Auto", min_length=1, max_length=20)
    instruct: str = Field("", max_length=1000)
    speed: float = Field(1.0, ge=0.5, le=2.0)
    pitch: float = Field(0.0, ge=-12.0, le=12.0)
    volume: float = Field(1.0, ge=0.0, le=2.0)


class TTSVoiceCloneRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    ref_audio_filename: str = Field(..., min_length=1, max_length=255)
    ref_text: str = Field("", max_length=1000)
    language: str = Field("Auto", min_length=1, max_length=20)
    speed: float = Field(1.0, ge=0.5, le=2.0)
    pitch: float = Field(0.0, ge=-12.0, le=12.0)
    volume: float = Field(1.0, ge=0.0, le=2.0)


class TTSVoiceDesignRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    language: str = Field("Auto", min_length=1, max_length=20)
    instruct: str = Field("", max_length=1000)
    speed: float = Field(1.0, ge=0.5, le=2.0)
    pitch: float = Field(0.0, ge=-12.0, le=12.0)
    volume: float = Field(1.0, ge=0.0, le=2.0)


class LipSyncRequest(BaseModel):
    face_filename: str = Field(..., min_length=1, max_length=255)
    audio_filename: str = Field(..., min_length=1, max_length=255)
    quality: str = Field("Enhanced", pattern="^(Fast|Improved|Enhanced)$")
    out_height: int = Field(480, ge=240, le=3840)
    pads_top: int = Field(0, ge=0, le=500)
    pads_bottom: int = Field(10, ge=0, le=500)
    pads_left: int = Field(0, ge=0, le=500)
    pads_right: int = Field(0, ge=0, le=500)
    mask_dilation: float = Field(2.5, ge=0.0, le=20.0)
    mask_feathering: float = Field(2.0, ge=0.0, le=20.0)
    nosmooth: bool = True
    wav2lip_version: str = Field("Wav2Lip_GAN", pattern="^(Wav2Lip|Wav2Lip_GAN)$")
    # View/expression parameters
    enable_view: bool = Field(False)
    head_rotation_x: float = Field(0.0, ge=-1.0, le=1.0)
    head_rotation_y: float = Field(0.0, ge=-1.0, le=1.0)
    head_rotation_z: float = Field(0.0, ge=-1.0, le=1.0)
    blink_frequency: float = Field(0.5, ge=0.0, le=1.0)
    expression_strength: float = Field(0.5, ge=0.0, le=1.0)
    view_animation: str = Field("static", pattern="^(static|gentle_sway|nodding|look_around)$")


# ── 工具函数 ───────────────────────────────────────────────────

# 允许访问的基准目录集合
_ALLOWED_BASE_DIRS: list[Path] = []


def _init_allowed_dirs():
    """初始化允许访问的基准目录列表（在 lifespan 中调用）。"""
    global _ALLOWED_BASE_DIRS
    _ALLOWED_BASE_DIRS = []
    for d in [_config.get("output_dir"), _config.get("upload_dir")]:
        if d:
            resolved = Path(d).resolve()
            _ALLOWED_BASE_DIRS.append(resolved)


def _validate_path(path: Path) -> bool:
    """检查 resolved 路径是否在允许的基准目录内，防止路径穿越。"""
    try:
        resolved = path.resolve()
        for base in _ALLOWED_BASE_DIRS:
            try:
                resolved.relative_to(base)
                return True
            except ValueError:
                continue
        return False
    except (OSError, RuntimeError):
        return False


def _safe_filename(name: str) -> str:
    import re
    safe = re.sub(r"[^\w\-.\s]", "", os.path.basename(name))
    safe = "".join(c for c in safe if c.isalnum() or c in "._- ")
    return safe.strip() or "upload"

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "upload_dir": str(_config.get("upload_dir", "")),
        "output_dir": str(_config.get("output_dir", "")),
        "tts_ready": bool(_config.get("tts_root")),
        "wav2lip_ready": bool(_config.get("wav2lip_root")),
    }


@app.get("/api/system/network-status")
async def system_network_status():
    """网络状态检测"""
    status = get_network_status()
    is_online = force_check() if status["consecutive_failures"] >= 1 else status["online"]
    return {
        "online": is_online,
        "mode": "offline" if not is_online else "online",
        "last_check": status["last_check"],
        "last_online": status["last_online"],
    }


@app.get("/api/system/resources")
async def system_resources():
    """返回系统资源使用情况：CPU、内存、GPU"""
    import psutil

    cpu_percent = psutil.cpu_percent(interval=0.5)
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage('/')

    gpu_info: list[dict] = []
    try:
        import subprocess
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=index,name,memory.used,memory.total,utilization.gpu,temperature.gpu",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
        if result.returncode == 0:
            for line in result.stdout.strip().split("\n"):
                if line.strip():
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 6:
                        gpu_info.append({
                            "index": int(parts[0]),
                            "name": parts[1],
                            "memory_used_mb": int(parts[2]),
                            "memory_total_mb": int(parts[3]),
                            "utilization_pct": int(parts[4]),
                            "temperature_c": int(parts[5]),
                        })
    except Exception:
        pass

    return {
        "cpu": {
            "percent": cpu_percent,
            "count": psutil.cpu_count(),
            "count_logical": psutil.cpu_count(logical=True),
        },
        "memory": {
            "total_gb": round(mem.total / (1024 ** 3), 1),
            "used_gb": round(mem.used / (1024 ** 3), 1),
            "percent": mem.percent,
        },
        "disk": {
            "total_gb": round(disk.total / (1024 ** 3), 0),
            "used_gb": round(disk.used / (1024 ** 3), 0),
            "percent": round(disk.percent, 1),
        },
        "gpu": gpu_info,
    }


# ══════════════════════════════════════════════════════════════
# 文件上传
# ══════════════════════════════════════════════════════════════

def _safe_filename(name: str) -> str:
    safe = "".join(c for c in os.path.basename(name) if c.isalnum() or c in "._- ")
    return safe or "upload"


async def _save_upload_file(file: UploadFile, allowed_types: set) -> dict:
    upload_dir = _config.get("upload_dir")
    if not upload_dir:
        raise HTTPException(500, "upload_dir not configured")
    upload_path = Path(upload_dir)
    try:
        upload_path.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        raise HTTPException(500, f"Cannot create upload directory: {e}")

    content_type = file.content_type or ""
    if content_type and allowed_types and content_type not in allowed_types:
        raise HTTPException(415, f"Unsupported file type: {content_type}")

    fname = f"{uuid.uuid4().hex[:8]}_{_safe_filename(file.filename)}"
    path = upload_path / fname

    size = 0
    try:
        with open(path, "wb") as f:
            while chunk := file.file.read(8192):
                size += len(chunk)
                if size > MAX_FILE_SIZE:
                    try: os.unlink(path)
                    except: pass
                    raise HTTPException(413, "File too large (max 500MB)")
                f.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Failed to save file: {e}")

    return {"filename": fname, "size": size}


@app.post("/api/files/upload/face")
async def upload_face(file: UploadFile = File(...)):
    return await _save_upload_file(file, ALLOWED_FACE_TYPES)


@app.post("/api/files/upload/audio")
async def upload_audio(file: UploadFile = File(...)):
    return await _save_upload_file(file, ALLOWED_AUDIO_TYPES)


@app.post("/api/files/upload/clone-ref")
async def upload_clone_ref(file: UploadFile = File(...)):
    return await _save_upload_file(file, ALLOWED_AUDIO_TYPES)


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


@app.post("/api/cms/upload/exhibit-image")
async def upload_exhibit_image(file: UploadFile = File(...)):
    """上传展品缩略图（支持 jpg/png/webp/gif）。"""
    return await _save_upload_file(file, ALLOWED_IMAGE_TYPES)


@app.post("/api/cms/upload/digital-human")
async def upload_digital_human(file: UploadFile = File(...)):
    """上传数字人模型文件（支持常见图片和视频格式）。"""
    return await _save_upload_file(file, ALLOWED_FACE_TYPES | ALLOWED_IMAGE_TYPES)


@app.post("/api/cms/upload/content-video")
async def upload_content_video(file: UploadFile = File(...)):
    """上传讲解视频（支持 mp4/webm/mov）。"""
    return await _save_upload_file(file, ALLOWED_VIDEO_TYPES)


@app.post("/api/cms/upload/exhibit-video")
async def upload_exhibit_video(file: UploadFile = File(...)):
    """上传展品讲解视频（支持 mp4/webm/mov）。"""
    return await _save_upload_file(file, ALLOWED_VIDEO_TYPES)


@app.get("/api/files/{filename}")
async def serve_file(filename: str):
    for d in [_config.get("output_dir"), _config.get("upload_dir")]:
        if d:
            p = Path(d) / filename
            if p.exists() and p.is_file() and _validate_path(p):
                _logger.info(f"[serve_file] 200 {p} ({p.stat().st_size} bytes)")
                return FileResponse(p)
    _logger.warning(f"[serve_file] 404 filename={filename!r}")
    raise HTTPException(404, "文件不存在")


@app.get("/api/files")
async def list_files():
    output_files = sorted([
        {"name": f.name, "size": f.stat().st_size, "type": "output"}
        for f in (_config.get("output_dir") or Path()).iterdir() if f.is_file()
    ], key=lambda x: x["name"])
    upload_files = sorted([
        {"name": f.name, "size": f.stat().st_size, "type": "upload"}
        for f in (_config.get("upload_dir") or Path()).iterdir() if f.is_file()
    ], key=lambda x: x["name"])
    return {"output": output_files, "upload": upload_files}


@app.delete("/api/files/{filename}")
async def delete_file(filename: str):
    """删除指定的输出或上传文件。"""
    if not _validate_path(Path(filename)):
        raise HTTPException(400, "无效的文件名")
    for d in [_config.get("output_dir"), _config.get("upload_dir")]:
        if d:
            p = Path(d) / filename
            if p.exists() and p.is_file() and _validate_path(p):
                p.unlink()
                return {"ok": True, "deleted": filename}
    raise HTTPException(404, "文件不存在")


@app.get("/api/files/preview/{filename}")
async def preview_file(filename: str):
    """预览图片/音频文件（流式响应）。"""
    import mimetypes
    if not _validate_path(Path(filename)):
        raise HTTPException(400, "无效的文件名")
    for d in [_config.get("output_dir"), _config.get("upload_dir")]:
        if d:
            p = Path(d) / filename
            if p.exists() and p.is_file() and _validate_path(p):
                mime, _ = mimetypes.guess_type(str(p))
                return FileResponse(p, media_type=mime or "application/octet-stream")
    raise HTTPException(404, "文件不存在")


@app.get("/api/cms/exhibits/{exhibit_id}/qr-url")
async def get_exhibit_qr_url(exhibit_id: str, request: Request):
    """
    返回展品二维码的完整 URL（供前端直接使用 qrcode 库渲染）。
    """
    from cms_db import get_exhibit
    ex = get_exhibit(exhibit_id)
    if not ex:
        raise HTTPException(404, "展品不存在")
    forwarded = request.headers.get("x-forwarded-proto", "http")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost:8000")
    base_url = f"{forwarded}://{host}"
    qr_url = f"{base_url}/terminal?exhibit={exhibit_id}"
    return {"qr_url": qr_url, "terminal_url": qr_url, "exhibit_name": ex["name"], "exhibit_id": exhibit_id}


# ══════════════════════════════════════════════════════════════
# TTS 接口
# ══════════════════════════════════════════════════════════════

@app.get("/api/tts/speakers")
async def list_speakers():
    return {
        "speakers": [
            {"id": "Vivian", "name": "Vivian", "desc": "甜美女声"},
            {"id": "Serena", "name": "Serena", "desc": "知性女声"},
            {"id": "Uncle_Fu", "name": "Uncle_Fu", "desc": "福叔声线"},
            {"id": "Dylan", "name": "Dylan", "desc": "京片子男生"},
            {"id": "Eric", "name": "Eric", "desc": "四川方言"},
            {"id": "Ryan", "name": "Ryan", "desc": "磁性男声"},
            {"id": "Aiden", "name": "Aiden", "desc": "英文男声"},
            {"id": "Ono_Anna", "name": "Ono_Anna", "desc": "日文女声"},
            {"id": "Sohee", "name": "Sohee", "desc": "韩文女声"},
        ]
    }


@app.get("/api/tts/preview/{speaker_id}")
async def tts_preview(speaker_id: str, background_tasks: BackgroundTasks):
    """
    快速生成指定音色的预览音频（5字短句）。
    返回临时音频文件路径，保留 10 分钟后自动清理。
    """
    import uuid as _uuid
    preview_text_map = {
        "Vivian": "您好，很高兴为您服务。",
        "Serena": "欢迎了解我们的产品。",
        "Uncle_Fu": "老少爷们儿，今儿给您说段儿。",
        "Dylan": "嘿，哥们儿，这事儿真逗。",
        "Eric": "安逸得很，巴适得板。",
        "Ryan": "Hello, welcome to our platform.",
        "Aiden": "Welcome to the digital world.",
        "Ono_Anna": "こんにちは、ようこそ。",
        "Sohee": "안녕하세요, 환영합니다.",
    }
    text = preview_text_map.get(speaker_id, "欢迎使用境语智导数字人平台。")
    job_id = _uuid.uuid4().hex
    output_filename = f"preview_{speaker_id}_{job_id[:8]}.wav"
    output_path = Path(_config["output_dir"]) / output_filename

    create_job(
        job_id=job_id,
        job_type="tts",
        params={"speaker": speaker_id, "preview": True},
        name=f"音色预览 {speaker_id}",
    )

    def _run():
        try:
            from engines.tts import generate_custom_voice
            result = generate_custom_voice(
                text=text,
                output_path=str(output_path),
                speaker=speaker_id,
                language="Auto",
                instruct="",
                speed=1.0, pitch=0.0, volume=1.0,
            )
            update_job(job_id, "completed", filename=output_filename, result=result)
        except Exception as e:
            update_job(job_id, "failed", message=str(e), trace=traceback.format_exc())

    update_job(job_id, "processing", filename=output_filename)
    background_tasks.add_task(_run)
    return {"job_id": job_id, "status": "processing", "filename": output_filename}


@app.get("/api/tts/languages")
async def list_languages():
    return {
        "languages": [
            {"id": "Auto", "name": "自动检测"},
            {"id": "Chinese", "name": "中文"},
            {"id": "English", "name": "英文"},
            {"id": "Japanese", "name": "日文"},
            {"id": "Korean", "name": "韩文"},
            {"id": "German", "name": "德文"},
            {"id": "French", "name": "法文"},
            {"id": "Russian", "name": "俄文"},
            {"id": "Portuguese", "name": "葡萄牙文"},
            {"id": "Spanish", "name": "西班牙文"},
            {"id": "Italian", "name": "意大利文"},
        ]
    }


@app.post("/api/tts/custom-voice")
async def tts_custom_voice(req: TTSCustomVoiceRequest, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex
    output_filename = f"tts_cv_{job_id}.wav"

    create_job(
        job_id=job_id,
        job_type="tts",
        params=req.model_dump(),
        name=req.text[:30] + ("..." if len(req.text) > 30 else ""),
    )

    def _run():
        try:
            from engines.tts import generate_custom_voice
            result = generate_custom_voice(
                text=req.text,
                output_path=str(Path(_config["output_dir"]) / output_filename),
                speaker=req.speaker,
                language=req.language,
                instruct=req.instruct,
                speed=req.speed,
                pitch=req.pitch,
                volume=req.volume,
            )
            update_job(job_id, "completed", filename=output_filename, result=result)
        except Exception as e:
            update_job(job_id, "failed", message=str(e), trace=traceback.format_exc())

    update_job(job_id, "processing", filename=output_filename)
    background_tasks.add_task(_run)
    return {"job_id": job_id, "status": "processing", "filename": output_filename}


@app.post("/api/tts/voice-clone")
async def tts_voice_clone(req: TTSVoiceCloneRequest, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex
    output_filename = f"tts_clone_{job_id}.wav"
    ref_path = Path(_config["upload_dir"]) / req.ref_audio_filename
    if not ref_path.exists():
        raise HTTPException(400, "参考音频不存在")

    create_job(
        job_id=job_id,
        job_type="tts",
        params=req.model_dump(),
        name=f"语音克隆 {job_id[:8]}",
    )

    def _run():
        try:
            from engines.tts import generate_voice_clone
            result = generate_voice_clone(
                text=req.text,
                output_path=str(Path(_config["output_dir"]) / output_filename),
                ref_audio_path=str(ref_path),
                ref_text=req.ref_text,
                language=req.language,
                speed=req.speed,
                pitch=req.pitch,
                volume=req.volume,
            )
            update_job(job_id, "completed", filename=output_filename, result=result)
        except Exception as e:
            update_job(job_id, "failed", message=str(e), trace=traceback.format_exc())

    update_job(job_id, "processing", filename=output_filename)
    background_tasks.add_task(_run)
    return {"job_id": job_id, "status": "processing", "filename": output_filename}


@app.post("/api/tts/voice-design")
async def tts_voice_design(req: TTSVoiceDesignRequest, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex
    output_filename = f"tts_vd_{job_id}.wav"

    create_job(
        job_id=job_id,
        job_type="tts",
        params=req.model_dump(),
        name=req.instruct[:30] or f"声音设计 {job_id[:8]}",
    )

    def _run():
        try:
            from engines.tts import generate_voice_design
            result = generate_voice_design(
                text=req.text,
                output_path=str(Path(_config["output_dir"]) / output_filename),
                language=req.language,
                instruct=req.instruct,
                speed=req.speed,
                pitch=req.pitch,
                volume=req.volume,
            )
            update_job(job_id, "completed", filename=output_filename, result=result)
        except Exception as e:
            update_job(job_id, "failed", message=str(e), trace=traceback.format_exc())

    update_job(job_id, "processing", filename=output_filename)
    background_tasks.add_task(_run)
    return {"job_id": job_id, "status": "processing", "filename": output_filename}


@app.get("/api/tts/status/{job_id}")
async def tts_status(job_id: str):
    return job_status(job_id)


# ══════════════════════════════════════════════════════════════
# 多机位视角切换
# ══════════════════════════════════════════════════════════════

def split_by_sentences(text: str) -> list[dict]:
    """
    按句子边界拆分文本，估算每句的重要性。
    长句（>15字）标记为重要，用于语义感知机位分配。
    """
    import re
    sentences = re.split(r'([。！？；\n])', text)
    chunks = []
    for i in range(0, len(sentences) - 1, 2):
        sent = sentences[i] + sentences[i + 1]
        if not sent.strip():
            continue
        importance = "high" if len(sent) > 15 else "normal"
        chunks.append({"text": sent, "importance": importance})
    if not chunks:
        chunks.append({"text": text, "importance": "normal"})
    return chunks


def assign_cameras(chunks: list[dict], camera_ids: list[str], strategy: str = "semantic") -> list[dict]:
    """
    语义感知或轮询分配机位。
    - semantic: 长句 → 特写机位（cam_1/2...），短句 → 全景机位（cam_0）
    - round_robin: 均匀轮换所有机位
    """
    if not camera_ids or len(camera_ids) == 0:
        return []
    if len(camera_ids) == 1:
        return [{"camera_id": camera_ids[0], "importance": c["importance"]} for c in chunks]

    result = []
    close_idx = 0
    for chunk in chunks:
        if strategy == "round_robin":
            camera_id = camera_ids[len(result) % len(camera_ids)]
        else:  # semantic
            if chunk["importance"] == "high":
                camera_id = camera_ids[1 + (close_idx % (len(camera_ids) - 1))]
                close_idx += 1
            else:
                camera_id = camera_ids[0]
        result.append({"camera_id": camera_id, "importance": chunk["importance"]})
    return result


def compose_multi_camera(segments: list[dict], output_dir: Path, job_id: str, transition: str = "crossfade", xfade_duration: float = 0.5) -> str:
    """
    使用 ffmpeg xfade 交叉淡化将多段视频合成单一 mp4，
    使机位切换时自然过渡，避免跳变。
    
    segments: [{"chunk_video": "...", "chunk_audio": "...", "duration": float, "cam_id": str}, ...]
    transition: "crossfade" | "none"
        - crossfade: 相邻片段使用 0.5s 淡入淡出交叉淡化
        - none: 原始无过渡 concat
    """
    import subprocess, os

    output_file = output_dir / f"pipeline_video_{job_id}.mp4"

    if len(segments) == 0:
        raise ValueError("No segments to compose")

    if len(segments) == 1:
        # 单段直接复制，避免无意义的重新编码
        single = segments[0]
        subprocess.run([
            "ffmpeg", "-y",
            "-i", single["chunk_video"],
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            str(output_file)
        ], capture_output=True)
        return str(output_file)

    if transition == "none":
        # 回退到原有 concat 逻辑
        video_concat_list = output_dir / f"video_concat_{job_id}.txt"
        audio_concat_list = output_dir / f"audio_concat_{job_id}.txt"
        video_only = output_dir / f"video_only_{job_id}.mp4"
        audio_concat = output_dir / f"audio_concat_{job_id}.wav"

        with open(video_concat_list, "w", encoding="utf-8") as f:
            for seg in segments:
                f.write(f"file '{seg['chunk_video'].replace(chr(92), '/')}'\n")
        with open(audio_concat_list, "w", encoding="utf-8") as f:
            for seg in segments:
                f.write(f"file '{seg['chunk_audio'].replace(chr(92), '/')}'\n")

        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(video_concat_list), "-c", "copy", str(video_only)
        ], capture_output=True, text=True)
        subprocess.run([
            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
            "-i", str(audio_concat_list), "-c", "copy", str(audio_concat)
        ], capture_output=True, text=True)
        subprocess.run([
            "ffmpeg", "-y",
            "-i", str(video_only), "-i", str(audio_concat),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k", "-shortest",
            str(output_file)
        ], capture_output=True, text=True)

        for f in [video_concat_list, audio_concat_list, video_only, audio_concat]:
            try:
                os.unlink(f)
            except OSError:
                pass
        return str(output_file)

    # ── Crossfade 模式 ─────────────────────────────────────────────────────────
    # 策略：每个相邻片段对之间做 xfade，淡入淡出时长 0.5s。
    # 如果片段时长 < 1.2s，降低过渡时长为 min(0.3s, duration/4)。
    # 整体流水线：两两累积交叉淡化。
    #
    # FFmpeg xfade 语法：
    # ffmpeg -i a.mp4 -i b.mp4 -filter_complex "[0:v][1:v]xfade=transition=fade:duration=0.5:offset=Ta[out]"
    #   offset = b_start_time = a_duration - xfade_duration

    # 交叉淡化时长（秒），由调用方通过参数传入
    fade_duration = 0.3    # 首尾淡入淡出时长（保留）

    # 先计算每段精确时长（重新探测，防止与 duration 字段不一致）
    def probe_duration(path: str) -> float:
        result = subprocess.run([
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            path
        ], capture_output=True, text=True)
        try:
            return float(result.stdout.strip())
        except (ValueError, AttributeError):
            return segments[segments.index(next(s for s in segments if s["chunk_video"] == path))]["duration"]

    durations = [probe_duration(s["chunk_video"]) for s in segments]

    # 如果总片段数 == 2，直接两段 xfade 即可
    def build_xfade_chain(seg_list: list[dict], dur_list: list[float]) -> tuple[str, list[subprocess.Popen], list[str]]:
        """返回 (output_path, processes_to_wait, temp_files_to_clean)。"""
        if len(seg_list) == 1:
            return seg_list[0]["chunk_video"], [], []

        temps = []
        pipes = []
        offset = dur_list[0] - xfade_duration

        # 如果第一段太短，减小 xfade
        actual_xfade = xfade_duration if dur_list[0] >= xfade_duration * 2 else min(0.3, dur_list[0] / 3)
        actual_xfade = max(0.1, actual_xfade)
        actual_offset = dur_list[0] - actual_xfade

        output_temp = output_dir / f"xfade_temp_{job_id}_{seg_list[0]['cam_id']}_{int(time.time_ns())}.mp4"
        temps.append(str(output_temp))

        cmd = ["ffmpeg", "-y"]
        inputs = []
        for i, seg in enumerate(seg_list[:2]):
            cmd += ["-i", seg["chunk_video"]]
        cmd += [
            "-filter_complex",
            f"[0:v][1:v]xfade=transition=fade:duration={actual_xfade:.2f}:offset={actual_offset:.2f}[v];"
            f"[0:a][1:a]acrossfade=d={actual_xfade:.2f}[a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            str(output_temp)
        ]

        pipe = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        pipes.append(pipe)

        # 递归处理剩余片段
        merged = output_temp
        remaining = seg_list[1:]
        rem_dur = dur_list[1:]

        while len(remaining) > 1:
            seg_a = merged
            seg_b = remaining[1]
            dur_a = sum(rem_dur[:len(remaining)])
            dur_b = rem_dur[1]

            act_xfade = xfade_duration if dur_a >= xfade_duration * 2 else min(0.3, dur_a / 3)
            act_xfade = max(0.1, act_xfade)
            act_offset = dur_a - act_xfade

            out_temp = output_dir / f"xfade_temp_{job_id}_{seg_b['cam_id']}_{int(time.time_ns())}.mp4"
            temps.append(str(out_temp))

            cmd2 = ["ffmpeg", "-y",
                    "-i", str(seg_a), "-i", seg_b["chunk_video"],
                    "-filter_complex",
                    f"[0:v][1:v]xfade=transition=fade:duration={act_xfade:.2f}:offset={act_offset:.2f}[v];"
                    f"[0:a][1:a]acrossfade=d={act_xfade:.2f}[a]",
                    "-map", "[v]", "-map", "[a]",
                    "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                    "-c:a", "aac", "-b:a", "192k",
                    str(out_temp)]

            seg_a_p = subprocess.Popen(cmd2, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            pipes.append(seg_a_p)

            merged = out_temp
            remaining = remaining[1:]
            rem_dur = rem_dur[1:]

        return merged, pipes, temps

    # 第一段 + 第二段做 xfade
    result_path = output_dir / f"xfade_step1_{job_id}.mp4"
    temps_to_clean = []
    pipes_to_wait = []

    a, b = segments[0], segments[1]
    dur_a, dur_b = durations[0], durations[1]
    act_xfade1 = xfade_duration if dur_a >= xfade_duration * 2 else min(0.3, dur_a / 3)
    act_xfade1 = max(0.1, act_xfade1)
    act_offset1 = dur_a - act_xfade1

    cmd1 = ["ffmpeg", "-y",
            "-i", a["chunk_video"], "-i", b["chunk_video"],
            "-filter_complex",
            f"[0:v][1:v]xfade=transition=fade:duration={act_xfade1:.2f}:offset={act_offset1:.2f}[v];"
            f"[0:a][1:a]acrossfade=d={act_xfade1:.2f}[a]",
            "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            str(result_path)]
    p1 = subprocess.Popen(cmd1, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    pipes_to_wait.append(p1)

    merged_seg = {"chunk_video": str(result_path), "cam_id": f"{a['cam_id']}+{b['cam_id']}"}
    merged_duration = dur_a - act_xfade1 + dur_b
    merged_segs = [merged_seg] + segments[2:]
    merged_durations = [merged_duration] + durations[2:]
    temps_to_clean.append(str(result_path))

    # 逐个累积合并剩余片段
    current_merged = result_path
    current_duration = merged_duration

    for i in range(2, len(segments)):
        seg = segments[i]
        dur = durations[i]

        act_xfade = xfade_duration if current_duration >= xfade_duration * 2 else min(0.3, current_duration / 3)
        act_xfade = max(0.1, act_xfade)
        act_offset = current_duration - act_xfade

        next_temp = output_dir / f"xfade_step{i}_{job_id}.mp4"
        temps_to_clean.append(str(next_temp))

        cmd = ["ffmpeg", "-y",
                "-i", str(current_merged), "-i", seg["chunk_video"],
                "-filter_complex",
                f"[0:v][1:v]xfade=transition=fade:duration={act_xfade:.2f}:offset={act_offset:.2f}[v];"
                f"[0:a][1:a]acrossfade=d={act_xfade:.2f}[a]",
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                str(next_temp)]

        p = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        pipes_to_wait.append(p)

        current_merged = next_temp
        current_duration = current_duration - act_xfade + dur

    # 等待最后一个进程完成，然后重命名
    for p in pipes_to_wait:
        stdout, stderr = p.communicate()
        if p.returncode != 0:
            _logger.warning(f"[Compose xfade] stderr: {stderr[-500:]}")

    # 复制最终结果（保持文件名一致）
    subprocess.run([
        "ffmpeg", "-y", "-i", str(current_merged),
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "192k",
        str(output_file)
    ], capture_output=True)

    # 清理所有临时 xfade 文件
    for f in temps_to_clean:
        try:
            os.unlink(f)
        except OSError:
            pass

    return str(output_file)


# ══════════════════════════════════════════════════════════════
# 一键合成 Pipeline
# ══════════════════════════════════════════════════════════════

class PipelineRequest(BaseModel):
    name: str = Field("", max_length=200)
    text: str = Field(..., min_length=1, max_length=10000)
    tts_mode: str = Field("custom_voice", pattern="^(custom_voice|voice_clone|voice_design)$")
    speaker: str = Field("Vivian", min_length=1, max_length=50)
    language: str = Field("Auto", min_length=1, max_length=20)
    instruct: str = Field("", max_length=1000)
    ref_audio_filename: str = Field("", max_length=255)
    ref_text: str = Field("", max_length=1000)
    face_filename: str = Field("", max_length=255)
    quality: str = Field("Enhanced", pattern="^(Fast|Improved|Enhanced)$")
    out_height: int = Field(480, ge=240, le=3840)
    pads_top: int = Field(0, ge=0, le=500)
    pads_bottom: int = Field(10, ge=0, le=500)
    pads_left: int = Field(0, ge=0, le=500)
    pads_right: int = Field(0, ge=0, le=500)
    mask_dilation: float = Field(2.5, ge=0.0, le=20.0)
    mask_feathering: float = Field(2.0, ge=0.0, le=20.0)
    nosmooth: bool = True
    wav2lip_version: str = Field("Wav2Lip_GAN", pattern="^(Wav2Lip|Wav2Lip_GAN)$")
    speed: float = Field(1.0, ge=0.5, le=2.0)
    pitch: float = Field(0.0, ge=-12.0, le=12.0)
    volume: float = Field(1.0, ge=0.0, le=2.0)
    exhibit_id: str = Field("", max_length=100)
    content_id: str = Field("", max_length=100)
    enable_view: bool = Field(False)
    view_head_rotation_x: float = Field(0.0, ge=-1.0, le=1.0)
    view_head_rotation_y: float = Field(0.0, ge=-1.0, le=1.0)
    view_head_rotation_z: float = Field(0.0, ge=-1.0, le=1.0)
    view_blink_frequency: float = Field(0.5, ge=0.0, le=1.0)
    view_expression_strength: float = Field(0.5, ge=0.0, le=1.0)
    view_animation: str = Field("static", pattern="^(static|gentle_sway|nodding|look_around)$")
    use_multi_camera: bool = Field(False)
    camera_angles: list[dict] = Field(default_factory=list)
    camera_strategy: str = Field("semantic", pattern="^(semantic|round_robin)$")
    camera_transition: str = Field("crossfade", pattern="^(crossfade|none)$")
    xfade_duration: float = Field(0.5, ge=0.0, le=2.0)


@app.post("/api/pipeline/run")
async def pipeline_run(req: PipelineRequest, background_tasks: BackgroundTasks):
    _logger.info(f"[Pipeline] Valid request received: {list(req.model_dump().keys())}")
    job_id = uuid.uuid4().hex
    audio_filename = f"pipeline_audio_{job_id}.wav"
    video_filename = f"pipeline_video_{job_id}.mp4"

    # 验证所有机位视频存在
    for cam in (req.camera_angles or []):
        cam_path = Path(_config["upload_dir"]) / cam.get("filename", "")
        if not cam_path.exists():
            raise HTTPException(400, f"机位视频不存在: {cam.get('filename')}")

    # 保存到数据库
    create_job(
        job_id=job_id,
        job_type="pipeline",
        params=req.model_dump(),
        name=req.name or f"数字人合成 {job_id[:8]}",
    )

    def _run():
        try:
            # ── 多机位分支 ──────────────────────────────────────
            if req.use_multi_camera and req.camera_angles:
                _run_multi_camera(req, job_id)
                return

            # ── 单机位分支（流水线并行优化）──────────────────────────────
            if not req.use_multi_camera:
                face_path = Path(_config["upload_dir"]) / req.face_filename
                if not face_path.exists():
                    raise FileNotFoundError("人脸视频不存在")

            from engines.tts import generate_custom_voice, generate_voice_clone, generate_voice_design
            from concurrent.futures import ThreadPoolExecutor
            import threading

            audio_path = str(Path(_config["output_dir"]) / audio_filename)
            video_path = str(Path(_config["output_dir"]) / video_filename)

            # Phase 1: TTS 和 View（如果有）并行执行
            update_job(job_id, "processing", step="tts", progress=5,
                       message="[并行] 正在合成语音 + 处理视角...")

            tts_result = {"ok": False, "error": None}
            view_result = {"ok": False, "output": None, "error": None}
            phase_done = [0]
            phase_lock = threading.Lock()

            def _do_tts():
                try:
                    if req.tts_mode == "voice_clone":
                        ref_path = Path(_config["upload_dir"]) / req.ref_audio_filename
                        if not ref_path.exists():
                            raise FileNotFoundError("参考音频不存在")
                        generate_voice_clone(
                            text=req.text, output_path=audio_path,
                            ref_audio_path=str(ref_path), ref_text=req.ref_text, language=req.language,
                            speed=req.speed, pitch=req.pitch, volume=req.volume,
                        )
                    elif req.tts_mode == "voice_design":
                        generate_voice_design(
                            text=req.text, output_path=audio_path,
                            language=req.language, instruct=req.instruct,
                            speed=req.speed, pitch=req.pitch, volume=req.volume,
                        )
                    else:
                        generate_custom_voice(
                            text=req.text, output_path=audio_path,
                            speaker=req.speaker, language=req.language, instruct=req.instruct,
                            speed=req.speed, pitch=req.pitch, volume=req.volume,
                        )
                    tts_result["ok"] = True
                except Exception as e:
                    tts_result["error"] = str(e)
                    _logger.warning(f"[Pipeline] TTS failed: {e}")

                with phase_lock:
                    phase_done[0] += 1
                    if phase_done[0] == 1:
                        update_job(job_id, "processing", step="tts", progress=25,
                                   message="[并行] TTS 完成，等待视角处理...")
                    elif phase_done[0] == 2:
                        update_job(job_id, "processing", step="lipsync", progress=50,
                                   message="[并行] TTS + 视角完成，开始唇形同步...")

            def _do_view():
                if not req.enable_view:
                    view_result["ok"] = True
                    view_result["output"] = str(face_path)
                    with phase_lock:
                        phase_done[0] += 1
                        if phase_done[0] == 1:
                            update_job(job_id, "processing", step="tts", progress=25,
                                       message="[并行] 视角跳过，TTS 进行中...")
                        elif phase_done[0] == 2:
                            update_job(job_id, "processing", step="lipsync", progress=50,
                                       message="[并行] TTS + 视角完成，开始唇形同步...")
                    return

                try:
                    from engines.expression import process_video as process_view
                    view_output = str(Path(_config["output_dir"]) / f"pipeline_view_{job_id}.mp4")
                    process_view(
                        face_path=str(face_path),
                        output_path=view_output,
                        head_rotation_x=req.view_head_rotation_x,
                        head_rotation_y=req.view_head_rotation_y,
                        head_rotation_z=req.view_head_rotation_z,
                        blink_frequency=req.view_blink_frequency,
                        expression_strength=req.view_expression_strength,
                        view_animation=req.view_animation,
                        progress_callback=lambda p, m: update_job(
                            job_id, "processing", step="tts",
                            progress=15 + int(p * 0.15),
                            message=f"视角处理: {m}"
                    ) if p > 0 else None,
                    )
                    view_result["ok"] = True
                    view_result["output"] = view_output
                except Exception as e:
                    view_result["error"] = str(e)
                    view_result["output"] = str(face_path)  # 回退到原始人脸
                    _logger.warning(f"[Pipeline] View processing failed: {e}")

                with phase_lock:
                    phase_done[0] += 1
                    if phase_done[0] == 1:
                        update_job(job_id, "processing", step="tts", progress=25,
                                   message="[并行] TTS 完成，等待视角处理...")
                    elif phase_done[0] == 2:
                        update_job(job_id, "processing", step="lipsync", progress=50,
                                   message="[并行] TTS + 视角完成，开始唇形同步...")

            # 启动并行任务：TTS 和 View 同时运行
            with ThreadPoolExecutor(max_workers=2) as executor:
                tts_future = executor.submit(_do_tts)
                view_future = executor.submit(_do_view)
                tts_future.result()  # 等待 TTS 完成
                view_future.result()  # 等待 View 完成（如果启用）

            # 检查 TTS 结果
            if not tts_result["ok"]:
                raise RuntimeError(f"TTS 失败: {tts_result['error']}")

            # 确定用于唇形同步的人脸视频
            face_for_lipsync = view_result["output"] or str(face_path)

            # Phase 2: Wav2Lip（等待 Phase 1 完成）
            update_job(job_id, "processing", step="lipsync", progress=50,
                       message="正在进行唇形同步...")

            from engines.wav2lip import process_video
            process_video(
                face_path=face_for_lipsync, audio_path=audio_path, output_path=video_path,
                quality=req.quality, out_height=req.out_height,
                pads=(req.pads_top, req.pads_bottom, req.pads_left, req.pads_right),
                mask_dilation=req.mask_dilation, mask_feathering=req.mask_feathering,
                nosmooth=req.nosmooth, wav2lip_version=req.wav2lip_version,
            )

            # 清理中间文件
            if view_result["ok"] and view_result["output"] != str(face_path):
                try:
                    os.unlink(view_result["output"])
                except OSError:
                    pass

            update_job(job_id, "completed", step="done", progress=100,
                       message="合成完成！",
                       audio_filename=audio_filename, video_filename=video_filename)

            if req.content_id:
                try:
                    from cms_db import update_content
                    update_content(req.content_id, video_filename=video_filename)
                    _logger.info(f"[Pipeline] 已关联视频 {video_filename} 到内容 {req.content_id}")
                except Exception as ex:
                    _logger.warning(f"[Pipeline] 关联视频失败: {ex}")
        except Exception as e:
            update_job(job_id, "failed", message=str(e), trace=traceback.format_exc())

    update_job(job_id, "processing", step="tts", progress=0)
    background_tasks.add_task(_run)
    return {"job_id": job_id, "status": "processing"}


def _run_multi_camera(req: PipelineRequest, job_id: str):
    """
    多机位 pipeline 优化版（真正并行）：
    1. 分句 + 语义分配机位
    2. 所有片段的 TTS 并行生成
    3. 所有片段的 Wav2Lip 并行生成（TTS 全部完成后才开始）
    4. ffmpeg xfade 合成
    
    优化效果：原本 N 个片段串行 TTS+Wav2Lip，
    现在变为 TTS 全部并行 + Wav2Lip 全部并行，总耗时约 2×max_chunk_time 而非 N×chunk_time。
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    from engines.tts import generate_custom_voice, generate_voice_clone, generate_voice_design
    from engines.wav2lip import process_video
    import soundfile as _sf

    output_dir = Path(_config["output_dir"])
    upload_dir = Path(_config["upload_dir"])

    # Step 1: 分句 + 语义分配机位
    update_job(job_id, "processing", step="planning", progress=2,
               message="分析文本结构与机位分配...")
    chunks = split_by_sentences(req.text)
    camera_ids = [cam["id"] for cam in (req.camera_angles or [])]
    assignments = assign_cameras(chunks, camera_ids, strategy=req.camera_strategy or "semantic")

    total_chunks = len(chunks)
    if total_chunks == 0:
        raise ValueError("文本分句结果为空")

    # ── Step 2a: 并行 TTS（所有片段同时生成音频）────────────────────────
    update_job(job_id, "processing", step="tts_lipsync", progress=5,
               message=f"[阶段1/2] 正在并行生成 {total_chunks} 个音频片段...")

    chunk_audio_paths: dict[int, str] = {}
    chunk_audio_durations: dict[int, float] = {}
    failed_tts: list[int] = []

    def run_tts(idx: int):
        chunk = chunks[idx]
        audio_path = str(output_dir / f"chunk_audio_{job_id}_{idx}.wav")
        try:
            if req.tts_mode == "voice_clone":
                ref_path = str(upload_dir / req.ref_audio_filename)
                generate_voice_clone(
                    text=chunk["text"], output_path=audio_path,
                    ref_audio_path=ref_path, ref_text=req.ref_text,
                    language=req.language,
                    speed=req.speed, pitch=req.pitch, volume=req.volume,
                )
            elif req.tts_mode == "voice_design":
                generate_voice_design(
                    text=chunk["text"], output_path=audio_path,
                    language=req.language, instruct=req.instruct,
                    speed=req.speed, pitch=req.pitch, volume=req.volume,
                )
            else:
                generate_custom_voice(
                    text=chunk["text"], output_path=audio_path,
                    speaker=req.speaker, language=req.language, instruct=req.instruct,
                    speed=req.speed, pitch=req.pitch, volume=req.volume,
                )
            # 获取时长
            try:
                info = _sf.info(audio_path)
                dur = info.duration
            except Exception:
                dur = 5.0
            return idx, audio_path, dur, None
        except Exception as e:
            _logger.warning(f"[MC] TTS chunk {idx} failed: {e}")
            return idx, audio_path, 5.0, str(e)

    with ThreadPoolExecutor(max_workers=min(total_chunks, 4)) as executor:
        futures = {executor.submit(run_tts, i): i for i in range(total_chunks)}
        done = 0
        for future in as_completed(futures):
            idx, audio_path, dur, err = future.result()
            done += 1
            progress = int(5 + (done / total_chunks) * 35)
            update_job(job_id, "processing", step="tts_lipsync", progress=progress,
                       message=f"[TTS] {done}/{total_chunks} 音频生成完成...")
            if err is None:
                chunk_audio_paths[idx] = audio_path
                chunk_audio_durations[idx] = dur
            else:
                failed_tts.append(idx)

    if len(chunk_audio_paths) == 0:
        raise RuntimeError(f"所有 {total_chunks} 个 TTS 片段均失败")

    if failed_tts:
        _logger.warning(f"[MC] {len(failed_tts)} 个 TTS 片段失败: {failed_tts}")

    # ── Step 2b: 并行 Wav2Lip（所有音频已就绪后同时处理）────────────────
    update_job(job_id, "processing", step="tts_lipsync", progress=42,
               message=f"[阶段2/2] 正在并行处理 {len(chunk_audio_paths)} 个唇形同步...")

    chunk_results: list[dict] = []

    def run_wav2lip(idx: int):
        chunk = chunks[idx]
        if idx not in chunk_audio_paths:
            return None
        cam_id = assignments[idx]["camera_id"]
        cam_file = next(
            (c["filename"] for c in (req.camera_angles or []) if c["id"] == cam_id),
            req.face_filename
        )
        chunk_face = str(upload_dir / cam_file)
        chunk_audio = chunk_audio_paths[idx]
        chunk_video = str(output_dir / f"chunk_video_{job_id}_{idx}.mp4")

        try:
            process_video(
                face_path=chunk_face, audio_path=chunk_audio,
                output_path=chunk_video,
                quality=req.quality, out_height=req.out_height,
                pads=(req.pads_top, req.pads_bottom, req.pads_left, req.pads_right),
                mask_dilation=req.mask_dilation,
                mask_feathering=req.mask_feathering,
                nosmooth=req.nosmooth,
                wav2lip_version=req.wav2lip_version,
            )
            return {
                "chunk_video": chunk_video,
                "chunk_audio": chunk_audio,
                "duration": chunk_audio_durations[idx],
                "cam_id": cam_id,
                "text": chunk["text"],
            }
        except Exception as e:
            _logger.warning(f"[MC] Wav2Lip chunk {idx} failed: {e}")
            return None

    with ThreadPoolExecutor(max_workers=min(len(chunk_audio_paths), 4)) as executor:
        futures2 = {executor.submit(run_wav2lip, i): i for i in chunk_audio_paths.keys()}
        done2 = 0
        for future in as_completed(futures2):
            result = future.result()
            done2 += 1
            progress = int(42 + (done2 / len(chunk_audio_paths)) * 45)
            update_job(job_id, "processing", step="tts_lipsync", progress=progress,
                       message=f"[Wav2Lip] {done2}/{len(chunk_audio_paths)} 片段处理完成...")
            if result is not None:
                chunk_results.append(result)

    if not chunk_results:
        raise RuntimeError("所有 Wav2Lip 片段均失败")

    # 按原始顺序排序
    def find_chunk_index(x: dict) -> int:
        for i, c in enumerate(chunks):
            if c["text"] == x["text"]:
                return i
        return len(chunks)
    chunk_results.sort(key=find_chunk_index)

    # Step 3: 计算累积时间轴
    timeline: list[dict] = []
    t = 0.0
    for seg in chunk_results:
        timeline.append({
            "cam_id": seg["cam_id"],
            "start_sec": round(t, 2),
            "end_sec": round(t + seg["duration"], 2),
            "text": seg["text"],
        })
        t += seg["duration"]

    # Step 4: ffmpeg xfade 合成
    update_job(job_id, "processing", step="compose", progress=90,
               message="正在合成多机位视频...")
    compose_multi_camera(chunk_results, output_dir, job_id, transition=req.camera_transition, xfade_duration=req.xfade_duration)

    # 清理中间片段文件
    for seg in chunk_results:
        try:
            os.unlink(seg["chunk_video"])
            os.unlink(seg["chunk_audio"])
        except OSError:
            pass

    audio_filename = f"pipeline_audio_{job_id}.wav"
    video_filename = f"pipeline_video_{job_id}.mp4"
    update_job(job_id, "completed", step="done", progress=100,
               message="合成完成！",
               audio_filename=audio_filename, video_filename=video_filename,
               multi_camera=True,
               timeline=timeline,
               result={
                   "segments": len(chunk_results),
                   "cameras": list({s["cam_id"] for s in chunk_results}),
               })

    if req.content_id:
        try:
            from cms_db import update_content
            update_content(req.content_id, video_filename=video_filename)
        except Exception as ex:
            _logger.warning(f"[Pipeline] 关联视频失败: {ex}")


@app.get("/api/pipeline/status/{job_id}")
async def pipeline_status(job_id: str):
    return job_status(job_id)


# ══════════════════════════════════════════════════════════════
# 唇形同步接口
# ══════════════════════════════════════════════════════════════

@app.post("/api/lipsync/process")
async def lipsync_process(req: LipSyncRequest, background_tasks: BackgroundTasks):
    job_id = uuid.uuid4().hex
    output_filename = f"lipsync_{job_id}.mp4"
    face_path = Path(_config["upload_dir"]) / req.face_filename
    audio_path = Path(_config["upload_dir"]) / req.audio_filename

    if not face_path.exists():
        raise HTTPException(400, "人脸视频不存在")
    if not audio_path.exists():
        raise HTTPException(400, "音频文件不存在")

    create_job(
        job_id=job_id,
        job_type="lipsync",
        params=req.model_dump(),
        name=f"唇形同步 {job_id[:8]}",
    )

    def _run():
        try:
            # Step 1: Expression / View processing (if enabled)
            if req.enable_view:
                update_job(job_id, "processing", step="view", progress=10,
                           message="正在处理视角与表情...")
                from engines.expression import process_video as process_view
                view_output = str(Path(_config["output_dir"]) / f"lipsync_view_{job_id}.mp4")
                process_view(
                    face_path=str(face_path),
                    output_path=view_output,
                    head_rotation_x=req.head_rotation_x,
                    head_rotation_y=req.head_rotation_y,
                    head_rotation_z=req.head_rotation_z,
                    blink_frequency=req.blink_frequency,
                    expression_strength=req.expression_strength,
                    view_animation=req.view_animation,
                    progress_callback=lambda p, m: update_job(
                        job_id, "processing", step="view",
                        progress=10 + int(p * 0.3), message=f"视角处理: {m}"
                    ) if p > 0 else None,
                )
                face_for_lipsync = view_output
            else:
                face_for_lipsync = str(face_path)

            update_job(job_id, "processing", step="lipsync", progress=50, message="正在进行唇形同步...")
            from engines.wav2lip import process_video
            result = process_video(
                face_path=face_for_lipsync, audio_path=str(audio_path),
                output_path=str(Path(_config["output_dir"]) / output_filename),
                quality=req.quality, out_height=req.out_height,
                pads=(req.pads_top, req.pads_bottom, req.pads_left, req.pads_right),
                mask_dilation=req.mask_dilation, mask_feathering=req.mask_feathering,
                nosmooth=req.nosmooth, wav2lip_version=req.wav2lip_version,
            )
            update_job(job_id, "completed", filename=output_filename, result=result)
        except Exception as e:
            update_job(job_id, "failed", message=str(e), trace=traceback.format_exc())

    update_job(job_id, "processing", filename=output_filename)
    background_tasks.add_task(_run)
    return {"job_id": job_id, "status": "processing", "filename": output_filename}


@app.get("/api/lipsync/status/{job_id}")
async def lipsync_status(job_id: str):
    return job_status(job_id)


# ══════════════════════════════════════════════════════════════
# 历史记录接口
# ══════════════════════════════════════════════════════════════

@app.get("/api/history")
async def history_list(
    page: int = Query(1, ge=1),
    size: int = Query(12, ge=1, le=100),
    status: str = Query("", description="过滤状态: processing/completed/failed"),
    search: str = Query("", description="搜索名称/内容"),
    job_type: str = Query("", description="过滤类型: pipeline/tts/lipsync"),
):
    records, total = list_jobs(page=page, size=size, status=status, search=search, job_type=job_type)
    for r in records:
        r["params"] = json.loads(r.get("params", "{}"))
    return {
        "records": records,
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size if total else 0,
    }


@app.get("/api/history/stats")
async def history_stats():
    return get_stats()


@app.get("/api/history/{job_id}")
async def history_detail(job_id: str):
    record = db_get_job(job_id)
    if not record:
        raise HTTPException(404, "记录不存在")
    record["params"] = json.loads(record.get("params", "{}"))
    return record


@app.patch("/api/history/{job_id}")
async def history_rename(job_id: str, req: HistoryRenameRequest):
    record = db_get_job(job_id)
    if not record:
        raise HTTPException(404, "记录不存在")
    db_update_job(job_id, name=req.name)
    return {"ok": True}


@app.delete("/api/history/{job_id}")
async def history_delete(job_id: str):
    deleted = db_delete_job(job_id)
    if not deleted:
        raise HTTPException(404, "记录不存在")
    return {"ok": True}


@app.delete("/api/history")
async def history_clear(job_type: str = Query("", description="仅清空指定类型: pipeline/tts/lipsync")):
    count = db_clear_jobs(job_type=job_type if job_type else "")
    return {"ok": True, "deleted": count}


# ══════════════════════════════════════════════════════════════
# 模型与系统信息
# ══════════════════════════════════════════════════════════════

@app.get("/api/system/models")
async def system_models():
    """返回已配置模型的真实存在性状态"""
    config = _config
    tts_root = config.get("tts_root", "")
    wav2lip_root = config.get("wav2lip_root", "")

    models = [
        {
            "name": "Qwen3-TTS",
            "path": tts_root,
            "exists": bool(tts_root and Path(tts_root).exists()),
            "required": True,
        },
        {
            "name": "Wav2Lip_GAN",
            "path": os.path.join(wav2lip_root, "checkpoints", "Wav2Lip_GAN.pth") if wav2lip_root else "",
            "exists": bool(wav2lip_root and Path(wav2lip_root, "checkpoints", "Wav2Lip_GAN.pth").exists()),
            "required": True,
        },
        {
            "name": "RetinaFace",
            "path": os.path.join(wav2lip_root, "checkpoints", "mobilenet.pth") if wav2lip_root else "",
            "exists": bool(wav2lip_root and Path(wav2lip_root, "checkpoints", "mobilenet.pth").exists()),
            "required": True,
        },
        {
            "name": "dlib 68-landmark",
            "path": os.path.join(wav2lip_root, "checkpoints", "shape_predictor_68_face_landmarks.dat") if wav2lip_root else "",
            "exists": bool(wav2lip_root and Path(wav2lip_root, "checkpoints", "shape_predictor_68_face_landmarks.dat").exists()),
            "required": True,
        },
        {
            "name": "GFPGAN",
            "path": os.path.join(wav2lip_root, "checkpoints", "GFPGANv1.4.pth") if wav2lip_root else "",
            "exists": bool(wav2lip_root and Path(wav2lip_root, "checkpoints", "GFPGANv1.4.pth").exists()),
            "required": False,
        },
        {
            "name": "ExpressionEngine",
            "path": wav2lip_root,
            "exists": bool(wav2lip_root),
            "required": False,
        },
    ]

    return {
        "tts_root": tts_root,
        "wav2lip_root": wav2lip_root,
        "models": models,
        "upload_dir": str(config.get("upload_dir", "")),
        "output_dir": str(config.get("output_dir", "")),
    }

