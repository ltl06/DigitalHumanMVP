"""
CMS 内容管理 API - 展品/内容/版本/发布端点
"""

from __future__ import annotations

import os
import sys
import uuid
import shutil
import traceback
import json
import time
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Request
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).parent))

from cms_db import (
    create_exhibit, get_exhibit, list_exhibits, update_exhibit, delete_exhibit,
    create_content, get_content, list_contents, update_content,
    publish_content, archive_content, delete_content,
    save_content_version, get_content_versions, restore_content_version,
    track_interaction, batch_track_interactions, get_analytics_summary, get_updates_since,
    get_live_visitors, get_daily_trends, get_hourly_distribution,
)

_logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cms", tags=["cms"])


# ─────────────────────────────────────────────────────────────────
# Pydantic 模型
# ─────────────────────────────────────────────────────────────────

class ExhibitCreate(BaseModel):
    name: str
    code: str = ""
    description: str = ""
    category: str = ""
    digital_human_model: str = ""
    default_language: str = "zh-CN"
    exhibit_video_filename: str = ""


class ExhibitUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    category: str | None = None
    digital_human_model: str | None = None
    default_language: str | None = None
    exhibit_video_filename: str | None = None


class ContentCreate(BaseModel):
    title: str
    body: str
    exhibit_id: str = ""
    language: str = "zh-CN"
    category: str = "exhibit"
    tags: list[str] = []
    duration_sec: int = 0
    status: str = "draft"
    video_filename: str = ""


class ContentUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    language: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    duration_sec: int | None = None
    status: str | None = None
    video_filename: str | None = None


class ContentPublishRequest(BaseModel):
    change_summary: str = ""


class InteractionTrack(BaseModel):
    session_id: str = ""
    exhibit_id: str = ""
    content_id: str = ""
    event_type: str
    duration_ms: int = 0
    metadata: dict = {}
    device_id: str = ""


# ─────────────────────────────────────────────────────────────────
# 展品 API
# ─────────────────────────────────────────────────────────────────

@router.get("/exhibits")
def api_list_exhibits(category: str = Query("")):
    """展品列表。"""
    items = list_exhibits(category=category)
    return {"exhibits": items, "total": len(items)}


@router.post("/exhibits")
def api_create_exhibit(req: ExhibitCreate):
    """创建展品。"""
    exhibit = create_exhibit(
        name=req.name,
        code=req.code,
        description=req.description,
        category=req.category,
        digital_human_model=req.digital_human_model,
        default_language=req.default_language,
        exhibit_video_filename=req.exhibit_video_filename,
    )
    return {"ok": True, "exhibit": exhibit}


@router.get("/exhibits/{exhibit_id}")
def api_get_exhibit(exhibit_id: str):
    """获取展品详情。"""
    exhibit = get_exhibit(exhibit_id)
    if not exhibit:
        raise HTTPException(404, "展品不存在")
    return exhibit


@router.put("/exhibits/{exhibit_id}")
def api_update_exhibit(exhibit_id: str, req: ExhibitUpdate):
    """更新展品。"""
    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "没有需要更新的字段")
    ok = update_exhibit(exhibit_id, **fields)
    if not ok:
        raise HTTPException(404, "展品不存在")
    return {"ok": True}


@router.delete("/exhibits/{exhibit_id}")
def api_delete_exhibit(exhibit_id: str):
    """删除展品。"""
    ok = delete_exhibit(exhibit_id)
    if not ok:
        raise HTTPException(404, "展品不存在")
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────
# 示例数据 API（开箱即用）
# ─────────────────────────────────────────────────────────────────

@router.post("/demo")
def api_create_demo():
    """
    创建示例展品和内容（开箱即用）。
    新用户点击"体验示例"后，系统自动创建几个演示用的展品和内容。
    """
    demo_exhibits = [
        {
            "name": "青铜鼎",
            "code": "DEMO001",
            "description": "商代青铜礼器，代表古代青铜文明的最高成就",
            "category": "青铜器",
            "digital_human_model": "",
            "default_language": "zh-CN",
        },
        {
            "name": "唐代三彩马",
            "code": "DEMO002",
            "description": "盛唐时期陶瓷艺术的杰出代表，色彩绚丽，造型生动",
            "category": "陶瓷",
            "digital_human_model": "",
            "default_language": "zh-CN",
        },
        {
            "name": "敦煌飞天壁画",
            "code": "DEMO003",
            "description": "敦煌莫高窟艺术珍品，展现盛唐时期佛教艺术的辉煌",
            "category": "壁画",
            "digital_human_model": "",
            "default_language": "zh-CN",
        },
    ]

    demo_contents = [
        {
            "title": "青铜鼎 · 讲解",
            "body": "各位观众好，欢迎来到博物馆青铜器展厅。我是今天的讲解员。\n\n眼前这尊青铜鼎，是商代晚期的代表性礼器，高约60厘米，重达100多公斤。鼎身以云雷纹为地，上面装饰着神秘的兽面纹，这种纹饰在古代青铜器中极为常见，被认为具有驱邪避灾的神秘力量。\n\n青铜鼎在商周时期不仅是烹饪用具，更是等级制度和王权的象征。只有天子才能使用九鼎，诸侯用七鼎，大夫用五鼎，所谓'一言九鼎'正是源于此。\n\n这尊鼎的铸造工艺极为精湛，充分展示了三千年前中国古代工匠的智慧与技艺。",
            "language": "zh-CN",
            "category": "exhibit",
            "tags": ["青铜器", "商代", "礼器"],
            "duration_sec": 120,
            "status": "published",
        },
        {
            "title": "青铜鼎 · 讲解（少儿版）",
            "body": "小朋友们大家好！\n\n看，这口大锅一样的东西叫'鼎'，是古代人做饭用的！不过这个鼎不是普通的锅，它是国王和贵族才能用的，非常非常厉害！\n\n这个鼎有三只脚，可以稳稳地站在地上。你们看，鼎上面有很多奇怪的花纹，这些花纹叫'兽面纹'，古人觉得这些花纹可以赶走妖怪，保护大家。\n\n这口鼎已经有三千多岁了，比爷爷奶奶的爷爷奶奶还要老很多很多哦！",
            "language": "child",
            "category": "exhibit",
            "tags": ["少儿", "青铜器", "趣味"],
            "duration_sec": 60,
            "status": "published",
        },
        {
            "title": "唐代三彩马 · 讲解",
            "body": "这匹色彩斑斓的三彩马，是盛唐时期的艺术珍品。\n\n唐三彩是一种低温釉陶器，以黄、绿、白三种颜色为主，因此得名'三彩'。这匹马的造型生动传神，鬃毛飘逸，四蹄腾空，仿佛正在奔跑之中。\n\n在唐代，马是重要的交通工具和战争工具，因此马的形象在唐代艺术品中非常常见。这匹三彩马不仅展示了唐代卓越的制陶工艺，更反映了那个盛世时代的繁荣与自信。\n\n值得注意的是，这匹马的马鞍上绑着一个驮囊，这说明它是一匹经过长途跋涉的旅行马，很可能来自丝绸之路。",
            "language": "zh-CN",
            "category": "exhibit",
            "tags": ["陶瓷", "唐代", "马"],
            "duration_sec": 90,
            "status": "published",
        },
        {
            "title": "敦煌飞天 · 讲解",
            "body": "这幅精美的壁画出自敦煌莫高窟，展现了令人叹为观止的'飞天'形象。\n\n飞天是佛教艺术中的人物，她们没有翅膀，却能在天空中自由飞翔，全靠衣裙和飘带在风中飞舞来表现飞行的姿态。\n\n这幅壁画中的飞天身着华丽的服装，色彩以青绿色为主，配以金粉点缀，在灯光的照耀下熠熠生辉。她们的身姿轻盈优美，有的散花，有的手持乐器，仿佛正在为佛祖献上最美的歌舞。\n\n敦煌壁画历经千年不褪色，主要是因为使用了天然矿物颜料，这些颜料稳定性极强，这也是中国古代绘画技艺的精妙之处。",
            "language": "zh-CN",
            "category": "exhibit",
            "tags": ["壁画", "敦煌", "佛教艺术"],
            "duration_sec": 100,
            "status": "published",
        },
    ]

    # Create exhibits and contents
    exhibit_map = {}  # index -> id
    for i, ex in enumerate(demo_exhibits):
        created = create_exhibit(**ex)
        exhibit_map[i] = created["id"]

    # Link contents to exhibits
    for i, ct in enumerate(demo_contents):
        ex_idx = i % len(demo_exhibits)
        ct["exhibit_id"] = exhibit_map[ex_idx]
        create_content(**ct)

    return {
        "ok": True,
        "message": f"已创建 {len(demo_exhibits)} 个展品和 {len(demo_contents)} 条讲解内容",
        "exhibit_count": len(demo_exhibits),
        "content_count": len(demo_contents),
    }


# ─────────────────────────────────────────────────────────────────
# 内容 API
# ─────────────────────────────────────────────────────────────────

@router.get("/contents")
def api_list_contents(
    exhibit_id: str = Query(""),
    language: str = Query(""),
    status: str = Query(""),
    category: str = Query(""),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
):
    """内容列表（支持多条件过滤）。"""
    items, total = list_contents(
        exhibit_id=exhibit_id,
        language=language,
        status=status,
        category=category,
        page=page,
        size=size,
    )
    return {
        "contents": items,
        "total": total,
        "page": page,
        "size": size,
        "pages": (total + size - 1) // size if total else 0,
    }


@router.post("/contents")
def api_create_content(req: ContentCreate):
    """创建讲解内容。"""
    content = create_content(
        title=req.title,
        body=req.body,
        exhibit_id=req.exhibit_id,
        language=req.language,
        category=req.category,
        tags=req.tags,
        duration_sec=req.duration_sec,
        status=req.status,
        video_filename=req.video_filename,
    )
    return {"ok": True, "content": content}


# ─────────────────────────────────────────────────────────────────
# 内容包导出（必须在 /contents/{content_id} 之前定义）
# ─────────────────────────────────────────────────────────────────

@router.get("/contents/export")
def api_export_content_package(exhibit_ids: str = Query("", description="逗号分隔的展品ID列表")):
    """
    导出内容包：包含所有讲解内容JSON + 预生成的音频/视频文件列表。
    供离线终端使用。
    """
    from cms_db import list_exhibits as _le, list_contents as _lc

    target_ids: list[str] = []
    if exhibit_ids:
        target_ids = [x.strip() for x in exhibit_ids.split(",") if x.strip()]

    if target_ids:
        all_exhibits = _le()
        exhibits = [e for e in all_exhibits if e["id"] in target_ids]
        all_contents, _ = _lc(page=1, size=9999)
        contents = [c for c in all_contents if c.get("exhibit_id") in target_ids]
    else:
        exhibits = _le()
        all_contents, _ = _lc(page=1, size=9999)
        contents = all_contents

    import json as _json
    from db import _conn as _db_conn
    audio_files: list[str] = []
    video_files: list[str] = []
    for ct in contents:
        with _db_conn() as c:
            rows = c.execute(
                """SELECT audio_filename, video_filename FROM jobs
                   WHERE params LIKE ? AND status = 'completed'""",
                (f"%{ct['id']}%",)
            ).fetchall()
        for r in rows:
            if r[0]:
                audio_files.append(r[0])
            if r[1]:
                video_files.append(r[1])

    return {
        "manifest": {
            "version": "1.0",
            "exported_at": time.time(),
            "exhibit_count": len(exhibits),
            "content_count": len(contents),
        },
        "exhibits": exhibits,
        "contents": contents,
        "audio_files": list(dict.fromkeys(audio_files)),
        "video_files": list(dict.fromkeys(video_files)),
    }


@router.get("/contents/{content_id}")
def api_get_content(content_id: str):
    """获取内容详情。"""
    content = get_content(content_id)
    if not content:
        raise HTTPException(404, "内容不存在")
    return content


@router.put("/contents/{content_id}")
def api_update_content(content_id: str, req: ContentUpdate):
    """更新内容（自动保存版本快照）。"""
    existing = get_content(content_id)
    if not existing:
        raise HTTPException(404, "内容不存在")

    fields = {k: v for k, v in req.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "没有需要更新的字段")

    if "body" in fields and fields["body"] != existing.get("body"):
        save_content_version(content_id, existing.get("body", ""), change_summary="Auto snapshot before edit")

    ok = update_content(content_id, **fields)
    if not ok:
        raise HTTPException(500, "更新失败")
    return {"ok": True}


@router.delete("/contents/{content_id}")
def api_delete_content(content_id: str):
    """删除内容。"""
    ok = delete_content(content_id)
    if not ok:
        raise HTTPException(404, "内容不存在")
    return {"ok": True}


@router.post("/contents/{content_id}/publish")
def api_publish_content(content_id: str, req: ContentPublishRequest):
    """发布内容（draft→published，自动快照）。"""
    existing = get_content(content_id)
    if not existing:
        raise HTTPException(404, "内容不存在")

    save_content_version(content_id, existing.get("body", ""), change_summary=req.change_summary or "Pre-publish snapshot")
    ok = publish_content(content_id)
    if not ok:
        raise HTTPException(500, "发布失败")
    return {"ok": True}


@router.post("/contents/{content_id}/archive")
def api_archive_content(content_id: str):
    """归档内容（published→archived）。"""
    ok = archive_content(content_id)
    if not ok:
        raise HTTPException(404, "内容不存在")
    return {"ok": True}


@router.get("/contents/{content_id}/versions")
def api_content_versions(content_id: str):
    """获取版本历史。"""
    existing = get_content(content_id)
    if not existing:
        raise HTTPException(404, "内容不存在")
    versions = get_content_versions(content_id)
    return {"versions": versions}


@router.post("/contents/{content_id}/restore/{version}")
def api_restore_version(content_id: str, version: int):
    """恢复历史版本（创建快照后覆盖正文）。"""
    ok = restore_content_version(content_id, version)
    if not ok:
        raise HTTPException(404, "内容或版本不存在")
    return {"ok": True}


# ─────────────────────────────────────────────────────────────────
# 批量操作
# ─────────────────────────────────────────────────────────────────

class BatchImportRequest(BaseModel):
    exhibits: list[ExhibitCreate] = []
    contents: list[ContentCreate] = []


@router.post("/contents/batch-import")
def api_batch_import(req: BatchImportRequest):
    """批量导入展品和内容（JSON格式）。"""
    imported_exhibits = 0
    imported_contents = 0

    for ex in req.exhibits:
        create_exhibit(
            name=ex.name, code=ex.code, description=ex.description,
            category=ex.category, digital_human_model=ex.digital_human_model,
            default_language=ex.default_language,
        )
        imported_exhibits += 1

    for ct in req.contents:
        create_content(
            title=ct.title, body=ct.body, exhibit_id=ct.exhibit_id,
            language=ct.language, category=ct.category,
            tags=ct.tags, duration_sec=ct.duration_sec, status=ct.status,
        )
        imported_contents += 1

    return {
        "ok": True,
        "imported_exhibits": imported_exhibits,
        "imported_contents": imported_contents,
    }


class BatchPublishRequest(BaseModel):
    content_ids: list[str]


@router.post("/contents/batch-publish")
def api_batch_publish(req: BatchPublishRequest):
    """批量发布内容。"""
    published = 0
    for cid in req.content_ids:
        if publish_content(cid):
            published += 1
    return {"ok": True, "published": published}


# ─────────────────────────────────────────────────────────────────
# 访客互动数据收集
# ─────────────────────────────────────────────────────────────────

@router.post("/analytics/track")
def api_track_interaction(req: InteractionTrack):
    """记录访客互动（埋点）。"""
    track_interaction(
        session_id=req.session_id,
        event_type=req.event_type,
        exhibit_id=req.exhibit_id,
        content_id=req.content_id,
        duration_ms=req.duration_ms,
        metadata=req.metadata,
        device_id=req.device_id,
    )
    return {"ok": True}


@router.post("/analytics/track/batch")
def api_track_batch(records: list[InteractionTrack]):
    """批量记录互动（离线模式下传）。"""
    count = batch_track_interactions([r.model_dump() for r in records])
    return {"ok": True, "count": count}


@router.get("/analytics/dashboard")
def api_analytics_dashboard(
    since: float = Query(0),
    until: float = Query(0),
):
    """分析数据看板。"""
    data = get_analytics_summary(since=since, until=until)
    return data


@router.get("/analytics/export")
def api_analytics_export(
    since: float = Query(0),
    until: float = Query(0),
    fmt: str = Query("json"),
):
    """导出数据报表。"""
    data = get_analytics_summary(since=since, until=until)
    if fmt == "csv":
        rows = [
            f"total_visits,{data['total_visits']}",
            f"avg_watch_duration_ms,{data['avg_watch_duration_ms']}",
        ]
        for ex in data.get("popular_exhibits", []):
            rows.append(f"exhibit,{ex['exhibit_id']},{ex['count']}")
        content = "\n".join(rows)
        return {
            "format": "csv",
            "data": content,
        }
    return {"format": "json", "data": data}


# ─────────────────────────────────────────────────────────────────
# 离线同步
# ─────────────────────────────────────────────────────────────────

@router.get("/sync/check-updates")
def api_check_updates(since: float = Query(0)):
    """检查内容增量更新（离线同步用）。"""
    return get_updates_since(since)


# ─────────────────────────────────────────────────────────────────
# 实时访客
# ─────────────────────────────────────────────────────────────────

@router.get("/analytics/live-visitors")
def api_live_visitors(minutes: int = Query(5, ge=1, le=60)):
    """返回最近 N 分钟内的独立访客数。"""
    return {"live_visitors": get_live_visitors(minutes)}


@router.get("/analytics/trends")
def api_daily_trends(days: int = Query(7, ge=1, le=90)):
    """返回每日访问量趋势。"""
    return {"trends": get_daily_trends(days)}


@router.get("/analytics/hourly")
def api_hourly_distribution(since: float = Query(0)):
    """返回按小时分布的访问量（0-23小时）。"""
    return {"hourly": get_hourly_distribution(since)}


# ─────────────────────────────────────────────────────────────────
# 二维码生成
# ─────────────────────────────────────────────────────────────────

@router.get("/analytics/interactions")
def api_list_interactions(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    exhibit_id: str = Query(""),
    event_type: str = Query(""),
    since: int = Query(0),
    until: int = Query(0),
):
    """分页查询访客互动记录。"""
    from cms_db import list_interactions as _li
    records, total = _li(page=page, size=size, exhibit_id=exhibit_id, event_type=event_type, since=since, until=until)
    return {
        "interactions": records,
        "total": total,
        "total_pages": (total + size - 1) // size if total else 0,
        "page": page,
        "size": size,
    }


@router.get("/exhibits/{exhibit_id}/qrcode")
def api_exhibit_qrcode(exhibit_id: str, request: Request = None):
    """
    返回展品的二维码 PNG 图片。
    格式：base64-encoded PNG，内嵌在 JSON 中返回。
    前端可解码后渲染。
    """
    import base64

    ex = get_exhibit(exhibit_id)
    if not ex:
        raise HTTPException(404, "展品不存在")

    # Dynamically determine base URL from request headers or fall back to localhost
    if request:
        forwarded = request.headers.get("x-forwarded-proto", "http")
        host = request.headers.get("x-forwarded-host") or request.headers.get("host", "localhost:8000")
        base_url = f"{forwarded}://{host}"
    else:
        base_url = "http://localhost:8000"
    params = f"exhibit={exhibit_id}"
    qr_url = f"{base_url}/terminal?{params}"

    try:
        import qrcode
        import io as _io
        img = qrcode.make(qr_url)
        buf = _io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        b64 = base64.b64encode(buf.read()).decode()
        return {
            "exhibit_id": exhibit_id,
            "exhibit_name": ex["name"],
            "qr_url": qr_url,
            "image": f"data:image/png;base64,{b64}",
        }
    except ImportError:
        # fallback: 返回 URL，前端通过外部 API 生成
        return {
            "exhibit_id": exhibit_id,
            "exhibit_name": ex["name"],
            "qr_url": qr_url,
            "image": None,
            "fallback": f"https://api.qrserver.com/v1/create-qr-code/?size=200x200&data={qr_url}",
        }


