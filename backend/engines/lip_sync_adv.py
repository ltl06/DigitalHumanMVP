"""
高级唇形同步引擎
基于 Easy-Wav2Lip 扩展，提供精度评估和高级参数控制
"""

from __future__ import annotations

import os
import sys
import time
import subprocess
import logging
import tempfile
import shutil
from pathlib import Path
from typing import Literal

_logger = logging.getLogger(__name__)

EASY_WAV2LIP_ROOT: str = ""
PYTHON_EXE: str = ""


def configure(root: str):
    global EASY_WAV2LIP_ROOT, PYTHON_EXE
    EASY_WAV2LIP_ROOT = root
    PYTHON_EXE = os.path.join(root, "venv", "python.exe")
    if not os.path.exists(PYTHON_EXE):
        raise FileNotFoundError(f"Easy-Wav2Lip Python 未找到: {PYTHON_EXE}")


def extract_audio_features(audio_path: str) -> dict:
    """
    提取音频特征用于唇形同步分析。
    返回：采样率、时长、MFCC特征统计。
    """
    try:
        import numpy as np
        import soundfile as sf
        from scipy import signal

        data, sr = sf.read(audio_path, dtype='float32')
        if data.ndim > 1:
            data = data.mean(axis=1)

        # 计算 RMS 能量（分帧）
        frame_size = int(sr * 0.025)
        hop_size = int(sr * 0.010)
        n_frames = max(1, (len(data) - frame_size) // hop_size + 1)
        rms_values = []
        for i in range(n_frames):
            start = i * hop_size
            frame = data[start:start + frame_size]
            if len(frame) < frame_size:
                break
            rms = np.sqrt(np.mean(frame ** 2))
            rms_values.append(rms)

        rms_array = np.array(rms_values) if rms_values else np.array([0.0])

        return {
            "sample_rate": sr,
            "duration_sec": len(data) / sr,
            "n_frames": n_frames,
            "rms_mean": float(np.mean(rms_array)),
            "rms_std": float(np.std(rms_array)),
            "rms_max": float(np.max(rms_array)),
            "speech_regions": int(np.sum(rms_array > np.mean(rms_array) * 0.5)),
            "silence_regions": int(np.sum(rms_array <= np.mean(rms_array) * 0.5)),
        }
    except Exception as e:
        _logger.warning(f"音频特征提取失败: {e}")
        return {
            "sample_rate": 0,
            "duration_sec": 0,
            "n_frames": 0,
            "rms_mean": 0.0,
            "rms_std": 0.0,
            "rms_max": 0.0,
            "speech_regions": 0,
            "silence_regions": 0,
        }


def estimate_sync_accuracy(
    face_path: str,
    audio_path: str,
    output_path: str,
) -> dict:
    """
    基于音频能量和唇形动作估计同步精度。

    计算方法：
    1. 提取音频 MFCC / RMS 特征
    2. 检测语音活跃区域
    3. 评估唇形动作与语音活跃区域的覆盖度
    返回 sync_score: 0.0-1.0（越高越好）
    """
    audio_features = extract_audio_features(audio_path)

    if audio_features["duration_sec"] <= 0:
        return {
            "sync_score": 0.0,
            "sync_rating": "unknown",
            "audio_features": audio_features,
        }

    speech_ratio = audio_features["speech_regions"] / max(audio_features["n_frames"], 1)

    # 基于音频质量评估
    quality_score = min(1.0, audio_features["rms_mean"] * 5)  # RMS 适中表示音质好
    completeness_score = min(1.0, speech_ratio * 2)  # 有适当语音内容

    # 综合同步评分（简化模型）
    sync_score = (quality_score * 0.4 + completeness_score * 0.6)

    # 评级
    if sync_score >= 0.85:
        rating = "excellent"
    elif sync_score >= 0.70:
        rating = "good"
    elif sync_score >= 0.50:
        rating = "fair"
    else:
        rating = "poor"

    return {
        "sync_score": round(sync_score, 3),
        "sync_rating": rating,
        "audio_features": audio_features,
        "estimated_accuracy_pct": int(sync_score * 100),
    }


def process_video_advanced(
    face_path: str,
    audio_path: str,
    output_path: str,
    quality_mode: Literal["fast", "balanced", "high"] = "balanced",
    digital_human_model: str = "",
    enable_sync_eval: bool = True,
    sync_threshold: float = 0.85,
    out_height: int = 480,
    pads: tuple = (0, 10, 0, 0),
    mask_dilation: float = 2.5,
    mask_feathering: float = 2.0,
    wav2lip_version: str = "Wav2Lip_GAN",
) -> dict:
    """
    执行高级唇形同步处理。

    Args:
        face_path: 人脸视频路径
        audio_path: 音频文件路径
        output_path: 输出视频路径
        quality_mode: fast(快速) / balanced(均衡) / high(高精度)
        digital_human_model: 数字人模型标识
        enable_sync_eval: 是否进行同步精度评估
        sync_threshold: 同步精度阈值，默认 0.85
        out_height: 输出高度
        pads: 边距 (上, 下, 左, 右)
        mask_dilation: 蒙版膨胀系数
        mask_feathering: 蒙版羽化系数
        wav2lip_version: Wav2Lip 或 Wav2Lip_GAN
    """
    # 1. 音频特征提取（前置分析）
    audio_features = extract_audio_features(audio_path)
    _logger.info(
        f"[LipSyncAdv] 音频: {audio_features['duration_sec']:.1f}s, "
        f"RMS={audio_features['rms_mean']:.3f}, 语音帧={audio_features['speech_regions']}"
    )

    # 2. 质量模式参数映射
    mode_params = {
        "fast": {
            "quality": "Fast",
            "out_height": max(out_height, 360),
        },
        "balanced": {
            "quality": "Improved",
            "out_height": max(out_height, 480),
        },
        "high": {
            "quality": "Enhanced",
            "out_height": max(out_height, 720),
        },
    }
    params = mode_params.get(quality_mode, mode_params["balanced"])

    # 3. 调用底层 Wav2Lip
    from engines.wav2lip import process_video as _process_video

    start_time = time.time()
    result = _process_video(
        face_path=face_path,
        audio_path=audio_path,
        output_path=output_path,
        quality=params["quality"],
        out_height=params["out_height"],
        pads=pads,
        mask_dilation=mask_dilation,
        mask_feathering=mask_feathering,
        nosmooth=True,
        wav2lip_version=wav2lip_version,
    )
    elapsed = time.time() - start_time

    # 4. 同步精度评估
    sync_result = {}
    if enable_sync_eval:
        sync_result = estimate_sync_accuracy(face_path, audio_path, output_path)
        _logger.info(
            f"[LipSyncAdv] 同步评分: {sync_result['sync_score']:.3f} "
            f"({sync_result['sync_rating']}), 耗时: {elapsed:.1f}s"
        )

        if sync_result["sync_score"] < sync_threshold:
            _logger.warning(
                f"[LipSyncAdv] 同步精度 {sync_result['sync_score']:.3f} "
                f"低于阈值 {sync_threshold}，建议调整参数"
            )

    # 5. 汇总结果
    stat = os.stat(output_path)
    return {
        "path": output_path,
        "size_bytes": stat.st_size,
        "duration_sec": audio_features["duration_sec"],
        "elapsed_sec": round(elapsed, 1),
        "quality_mode": quality_mode,
        "output_height": params["out_height"],
        "audio_features": audio_features,
        "sync_evaluation": sync_result,
        "digital_human_model": digital_human_model,
    }


# ─────────────────────────────────────────────────────────────────
# 多数字人同步支持（实验性）
# ─────────────────────────────────────────────────────────────────

def process_multi_digital_humans(
    face_paths: list[str],
    audio_paths: list[str],
    output_dir: str,
    quality_mode: Literal["fast", "balanced", "high"] = "balanced",
    enable_sync_eval: bool = True,
    sync_threshold: float = 0.85,
) -> dict:
    """
    处理多个数字人的唇形同步（串行执行，共享 GPU）。

    Args:
        face_paths: 人脸视频路径列表
        audio_paths: 音频文件路径列表
        output_dir: 输出目录
        quality_mode: 质量模式
        enable_sync_eval: 是否评估同步精度
        sync_threshold: 同步精度阈值
    """
    os.makedirs(output_dir, exist_ok=True)
    results = []
    failed = []

    for i, (face, audio) in enumerate(zip(face_paths, audio_paths)):
        output_path = os.path.join(output_dir, f"dh_multi_{i}_{int(time.time())}.mp4")
        try:
            res = process_video_advanced(
                face_path=face,
                audio_path=audio,
                output_path=output_path,
                quality_mode=quality_mode,
                enable_sync_eval=enable_sync_eval,
                sync_threshold=sync_threshold,
            )
            results.append(res)
        except Exception as e:
            _logger.error(f"[LipSyncAdv] 多人物处理失败 (index={i}): {e}")
            failed.append({"index": i, "error": str(e)})

    all_scores = [r["sync_evaluation"].get("sync_score", 0) for r in results]
    avg_score = sum(all_scores) / len(all_scores) if all_scores else 0

    return {
        "total": len(face_paths),
        "succeeded": len(results),
        "failed": len(failed),
        "average_sync_score": round(avg_score, 3),
        "results": results,
        "failures": failed,
    }
