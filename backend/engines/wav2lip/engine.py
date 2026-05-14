"""
Wav2Lip 引擎 - 通过子进程调用 Easy-Wav2Lip 的独立 venv 环境
避免包版本冲突，完全隔离运行环境
"""

from __future__ import annotations

import os
import sys
import json
import subprocess
import shutil
import time
import traceback
import logging
from pathlib import Path
from contextlib import contextmanager

_logger = logging.getLogger(__name__)

# 引擎默认配置
WAV2LIP_TIMEOUT = 600  # 秒
WAV2LIP_MAX_RETRIES = 3
WAV2LIP_RETRY_DELAY = 3.0  # 秒


# ══════════════════════════════════════════════════════════════
# 路径配置 (由 core/config.py 在启动时设置)
# ══════════════════════════════════════════════════════════════

EASY_WAV2LIP_ROOT: str = ""
PYTHON_EXE: str = ""


def configure(
    root: str,
    checkpoint: str,
    mobilenet: str,
    predictor: str,
    mouth_detector: str,
    gfpgan: str,
):
    global EASY_WAV2LIP_ROOT, PYTHON_EXE
    EASY_WAV2LIP_ROOT = root
    # venv Python 在根目录
    PYTHON_EXE = os.path.join(root, "venv", "python.exe")
    if not os.path.exists(PYTHON_EXE):
        raise FileNotFoundError(f"Easy-Wav2Lip Python 未找到: {PYTHON_EXE}")


# ══════════════════════════════════════════════════════════════
# 临时文件上下文管理器
# ══════════════════════════════════════════════════════════════

@contextmanager
def _temp_file(path: str | None):
    """自动管理临时文件生命周期，无论成功或异常都会清理。"""
    if path:
        try:
            yield path
        finally:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except OSError as e:
                _logger.warning(f"Failed to remove temp file {path}: {e}")
    else:
        yield path


# ══════════════════════════════════════════════════════════════
# 核心：子进程调用 inference.py（带超时 + 重试）
# ══════════════════════════════════════════════════════════════

def _run_inference(
    face_path: str,
    audio_path: str,
    output_path: str,
    checkpoint_path: str,
    quality: str,
    out_height: int,
    pads: tuple,
    mask_dilation: float,
    mask_feathering: float,
    nosmooth: bool,
    wav2lip_version: str,
) -> None:
    """
    在 Easy-Wav2Lip 的 venv 中调用 inference.py 进行唇形同步。
    包含超时控制（默认600秒）和重试逻辑（默认3次）。
    """
    script = os.path.join(EASY_WAV2LIP_ROOT, "inference.py")

    temp_wav: str | None = None
    with _temp_file(None):  # 占位，temp_wav 在下面单独管理
        # 确保音频是 wav
        if not audio_path.lower().endswith(".wav"):
            temp_wav = face_path + "_temp_audio.wav"
            try:
                subprocess.run(
                    ["ffmpeg", "-y", "-loglevel", "error", "-i", audio_path, temp_wav],
                    check=True,
                    timeout=60,
                )
                audio_path = temp_wav
            except subprocess.CalledProcessError as e:
                _logger.error(f"[Wav2Lip] ffmpeg 转换失败: {e}")
                raise RuntimeError(f"音频格式转换失败: {e}")
            except subprocess.TimeoutExpired:
                _logger.error("[Wav2Lip] ffmpeg 转换超时")
                raise RuntimeError("音频格式转换超时（60秒）")

        # 创建临时输出目录（Easy-Wav2Lip 用 temp/ 子目录）
        temp_dir = os.path.join(EASY_WAV2LIP_ROOT, "temp")
        os.makedirs(temp_dir, exist_ok=True)

        cmd = [
            PYTHON_EXE, script,
            "--checkpoint_path", checkpoint_path,
            "--face", face_path,
            "--audio", audio_path,
            "--outfile", output_path,
            "--pads", str(pads[0]), str(pads[1]), str(pads[2]), str(pads[3]),
            "--out_height", str(out_height),
            "--quality", quality,
            "--mask_dilation", str(mask_dilation),
            "--mask_feathering", str(int(mask_feathering)),
            "--nosmooth", str(nosmooth),
        ]

        # 隔离环境变量
        env = {k: v for k, v in os.environ.items() if not k.startswith("PYTHON")}

        last_error: Exception | None = None
        for attempt in range(1, WAV2LIP_MAX_RETRIES + 1):
            try:
                result = subprocess.run(
                    cmd,
                    cwd=EASY_WAV2LIP_ROOT,
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    env=env,
                    timeout=WAV2LIP_TIMEOUT,
                )

                if result.returncode != 0:
                    raise RuntimeError(
                        f"Wav2Lip 子进程失败 (exit={result.returncode}, attempt={attempt}):\n"
                        f"stdout: {result.stdout}\n"
                        f"stderr: {result.stderr}"
                    )

                if not os.path.exists(output_path):
                    raise FileNotFoundError(f"Wav2Lip 未生成输出文件: {output_path}")

                _logger.info(f"[Wav2Lip] 处理成功 (attempt={attempt})")
                return

            except subprocess.TimeoutExpired:
                err = RuntimeError(
                    f"Wav2Lip 子进程超时 ({WAV2LIP_TIMEOUT}s, attempt={attempt}/{WAV2LIP_MAX_RETRIES})"
                )
                _logger.warning(f"[Wav2Lip] {err}")
                last_error = err
                if attempt < WAV2LIP_MAX_RETRIES:
                    time.sleep(WAV2LIP_RETRY_DELAY)
                    continue
                raise last_error

            except Exception as e:
                tb = traceback.format_exc()
                _logger.error(f"[Wav2Lip] 子进程异常 (attempt={attempt}/{WAV2LIP_MAX_RETRIES}): {e}\n{tb}")
                last_error = e
                if attempt < WAV2LIP_MAX_RETRIES:
                    time.sleep(WAV2LIP_RETRY_DELAY)
                    continue
                raise last_error

        if last_error:
            raise last_error
        raise RuntimeError("Wav2Lip 未知错误")

    # 清理临时音频文件（外层 with 结束后执行）
    if temp_wav and os.path.exists(temp_wav):
        try:
            os.remove(temp_wav)
        except OSError as e:
            _logger.warning(f"Failed to remove temp audio {temp_wav}: {e}")


# ══════════════════════════════════════════════════════════════
# 公开 API（与原有接口兼容）
# ══════════════════════════════════════════════════════════════

def process_video(
    face_path: str,
    audio_path: str,
    output_path: str,
    quality: str = "Enhanced",
    out_height: int = 480,
    pads: tuple = (0, 10, 0, 0),
    mask_dilation: float = 2.5,
    mask_feathering: float = 2.0,
    nosmooth: bool = True,
    wav2lip_version: str = "Wav2Lip_GAN",
) -> dict:
    """
    执行唇形同步处理

    Args:
        face_path: 人脸视频路径 (mp4/jpg/png)
        audio_path: 音频文件路径 (wav/mp3)
        output_path: 输出视频路径 (mp4)
        quality: Fast / Improved / Enhanced
        out_height: 输出高度 (像素)
        pads: (上, 下, 左, 右) 边距
        mask_dilation: 蒙版膨胀系数
        mask_feathering: 蒙版羽化系数
        nosmooth: 禁用检测框平滑
        wav2lip_version: Wav2Lip 或 Wav2Lip_GAN
    """
    # checkpoint 路径
    if wav2lip_version == "Wav2Lip_GAN":
        ckpt = os.path.join(EASY_WAV2LIP_ROOT, "checkpoints", "Wav2Lip_GAN.pth")
    else:
        ckpt = os.path.join(EASY_WAV2LIP_ROOT, "checkpoints", "Wav2Lip.pth")

    if not os.path.exists(ckpt):
        raise FileNotFoundError(f"Checkpoint 不存在: {ckpt}")

    _run_inference(
        face_path=face_path,
        audio_path=audio_path,
        output_path=output_path,
        checkpoint_path=ckpt,
        quality=quality,
        out_height=out_height,
        pads=pads,
        mask_dilation=mask_dilation,
        mask_feathering=mask_feathering,
        nosmooth=nosmooth,
        wav2lip_version=wav2lip_version,
    )

    stat = os.stat(output_path)
    return {
        "path": output_path,
        "size_bytes": stat.st_size,
    }


# ══════════════════════════════════════════════════════════════
# 兼容层
# ══════════════════════════════════════════════════════════════

def unload_model():
    pass  # 子进程结束后自动清理
