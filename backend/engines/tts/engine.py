"""
TTS 引擎 - 通过子进程调用 QwenTTS_Fn2 的独立 Python 环境
避免包版本冲突，完全隔离运行环境
"""

from __future__ import annotations

import os
import sys
import json
import subprocess
import tempfile
import shutil
import time
import logging
import traceback
from pathlib import Path
from dataclasses import dataclass

_logger = logging.getLogger(__name__)

# 引擎默认配置
TTS_TIMEOUT = 600  # 秒（长文本分片生成 + 模型重载，9段×65秒 ≈ 585秒）
TTS_MAX_RETRIES = 3
TTS_RETRY_DELAY = 2.0  # 秒

# ══════════════════════════════════════════════════════════════
# 路径配置 (由 core/config.py 在启动时设置)
# ══════════════════════════════════════════════════════════════

QWEN_TTS_ROOT: str = ""
PYTHON_EXE: str = ""
DEBUG_LOG_PATH: str | None = None


def configure(root: str, custom_voice: str, base: str, voice_design: str):
    global QWEN_TTS_ROOT, PYTHON_EXE, DEBUG_LOG_PATH
    QWEN_TTS_ROOT = root
    PYTHON_EXE = os.path.join(root, "WPy64-312101", "python", "python.exe")
    if not os.path.exists(PYTHON_EXE):
        raise FileNotFoundError(f"QwenTTS Python 未找到: {PYTHON_EXE}")
    # 从环境变量或项目根目录查找 debug log
    DEBUG_LOG_PATH = os.environ.get("TTS_DEBUG_LOG")
    # 默认使用 backend 目录下的 tts_debug.log（与 session ID 一致）
    if not DEBUG_LOG_PATH:
        backend_dir = Path(__file__).resolve().parent
        DEBUG_LOG_PATH = str(backend_dir / "tts_debug.log")


# ══════════════════════════════════════════════════════════════
# 核心：子进程调用（带超时 + 重试）
# ══════════════════════════════════════════════════════════════

def _run(script_path: str, script_args: list[str], output_path: str | None = None) -> dict:
    """
    在 QwenTTS_Fn2 的 Python 环境中运行脚本。
    包含超时控制（默认120秒）和重试逻辑（默认3次）。
    """
    import json as _json

    def _log(hid: str, loc: str, msg: str, **data):
        if DEBUG_LOG_PATH:
            log_entry = {
                "id": f"log_{time.time_ns()}",
                "timestamp": time.time_ns() // 1_000_000,
                "sessionId": "3f2fc4",
                "runId": "debug-run",
                "hypothesisId": hid,
                "location": loc,
                "message": msg,
                "data": data,
            }
            with open(DEBUG_LOG_PATH, "a", encoding="utf-8") as _f:
                _f.write(_json.dumps(log_entry) + "\n")

    cmd = [PYTHON_EXE, script_path] + script_args

    env = {}
    for k, v in os.environ.items():
        if k.startswith("PYTHON") and k != "PYTHONIOENCODING":
            continue
        env[k] = v
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    # ── 使用 GPU（fp32 推理，0.6B 模型 + 6GB 显存足够）──
    # 注：0.6B 模型用 fp32 在 GPU 上推理稳定，不再使用 bf16
    env["TTS_FORCE_CPU"] = "0"
    env.pop("CUDA_VISIBLE_DEVICES", None)
    # ── 强制使用 0.6B 模型（更小，内存占用更低）──
    env["TTS_MODEL_SIZE"] = "0.6B"

    if DEBUG_LOG_PATH:
        env["TTS_DBG_LOG"] = DEBUG_LOG_PATH

    last_error: Exception | None = None
    for attempt in range(1, TTS_MAX_RETRIES + 1):
        _log("H1", "engine.py:_run", "attempt_start",
             attempt=attempt, timeout=TTS_TIMEOUT,
             text_len=len(script_args[1]) if len(script_args) > 1 else 0,
             gpu_available=torch.cuda.is_available() if 'torch' in globals() else None)
        try:
            import torch
            _log("H3", "engine.py:_run", "pre_subprocess",
                 attempt=attempt,
                 gpu_available=torch.cuda.is_available(),
                 env_TTS_FORCE_CPU=env.get("TTS_FORCE_CPU"),
                 env_TTS_MODEL_SIZE=env.get("TTS_MODEL_SIZE"))
            _t0 = time.monotonic()
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
                timeout=TTS_TIMEOUT,
            )
            _elapsed = time.monotonic() - _t0
            _log("H4", "engine.py:_run", "subprocess_result",
                 attempt=attempt,
                 elapsed_sec=round(_elapsed, 1),
                 returncode=result.returncode,
                 stdout_len=len(result.stdout),
                 stderr_len=len(result.stderr),
                 stdout=result.stdout[:500],
                 stderr=result.stderr[:500])

            if result.returncode != 0:
                raise RuntimeError(
                    f"TTS 子进程失败 (exit={result.returncode}, attempt={attempt}):\n"
                    f"stdout: {result.stdout}\n"
                    f"stderr: {result.stderr}"
                )

            _log("H4", "engine.py:_run", "subprocess_success",
                 attempt=attempt,
                 output_exists=os.path.exists(output_path) if output_path else None)

            if output_path:
                if not os.path.exists(output_path):
                    raise FileNotFoundError(f"TTS 输出文件不存在: {output_path}")
                import stat
                size = os.stat(output_path).st_size
                import soundfile as sf
                info = sf.info(output_path)
                return {
                    "path": output_path,
                    "size_bytes": size,
                    "sample_rate": info.samplerate,
                    "duration_sec": info.duration,
                }
            return {}

        except subprocess.TimeoutExpired as e:
            err_msg = f"TTS 子进程超时 ({TTS_TIMEOUT}s, attempt={attempt}/{TTS_MAX_RETRIES})"
            _log("H4", "engine.py:_run", "subprocess_timeout", attempt=attempt, timeout=TTS_TIMEOUT)
            _logger.warning(f"[TTS] {err_msg}")
            last_error = RuntimeError(err_msg)
            if attempt < TTS_MAX_RETRIES:
                time.sleep(TTS_RETRY_DELAY)
                continue
            raise last_error

        except Exception as e:
            tb = traceback.format_exc()
            _log("H4", "engine.py:_run", "subprocess_error",
                 attempt=attempt, error=str(e), traceback=tb[:500])
            _logger.error(f"[TTS] 子进程异常 (attempt={attempt}/{TTS_MAX_RETRIES}): {e}")
            last_error = e
            if attempt < TTS_MAX_RETRIES:
                time.sleep(TTS_RETRY_DELAY)
                continue
            raise last_error

    raise last_error or RuntimeError("TTS 未知错误")


# ══════════════════════════════════════════════════════════════
# 公开 API
# ══════════════════════════════════════════════════════════════

def generate_custom_voice(
    text: str,
    output_path: str,
    speaker: str = "Vivian",
    language: str = "Auto",
    instruct: str = "",
    speed: float = 1.0,
    pitch: float = 0.0,
    volume: float = 1.0,
) -> dict:
    """
    使用预设音色合成语音
    - speaker: Vivian / Serena / Uncle_Fu / Dylan / Eric / Ryan / Aiden / Ono_Anna / Sohee
    - language: Auto / Chinese / English / Japanese / Korean / German / French / Russian / Portuguese / Spanish / Italian
    - instruct: 风格指令，如"用开心的语气"
    - speed: 语速倍率 0.5–2.0
    - pitch: 音调偏移（半音）-12到+12
    - volume: 音量倍率 0.0–2.0
    """
    import tempfile as _tempfile
    raw_path = output_path
    needs_adjust = speed != 1.0 or pitch != 0.0 or volume != 1.0
    if needs_adjust:
        fd, raw_path = _tempfile.mkstemp(suffix=".wav")
        os.close(fd)

    script = os.path.join(QWEN_TTS_ROOT, "generate_audio.py")
    args = [
        "--text", text,
        "--output", raw_path,
        "--speaker", speaker,
        "--language", language,
    ]
    if instruct:
        args += ["--style", instruct]
    result = _run(script, args, raw_path)

    if needs_adjust:
        adjust_audio_params(raw_path, output_path, speed=speed, pitch=pitch, volume=volume)
        try:
            os.unlink(raw_path)
        except OSError:
            pass
        stat = os.stat(output_path)
        return {
            "path": output_path,
            "size_bytes": stat.st_size,
            "sample_rate": result.get("sample_rate", 24000),
            "duration_sec": result.get("duration_sec", 0) / speed,
            "params": {"speed": speed, "pitch": pitch, "volume": volume},
        }
    return result


def generate_voice_clone(
    text: str,
    output_path: str,
    ref_audio_path: str,
    ref_text: str = "",
    language: str = "Auto",
    speed: float = 1.0,
    pitch: float = 0.0,
    volume: float = 1.0,
) -> dict:
    """
    语音克隆：零样本模式（ref_text为空）或 ICL 模式（ref_text非空）
    speed/pitch/volume: 音频后处理参数
    """
    import tempfile as _tempfile
    raw_path = output_path
    needs_adjust = speed != 1.0 or pitch != 0.0 or volume != 1.0
    if needs_adjust:
        fd, raw_path = _tempfile.mkstemp(suffix=".wav")
        os.close(fd)

    script = os.path.join(QWEN_TTS_ROOT, "generate_audio.py")
    args = [
        "--text", text,
        "--output", raw_path,
        "--clone", ref_audio_path,
        "--language", language,
    ]
    if ref_text:
        args += ["--style", ref_text]
    result = _run(script, args, raw_path)

    if needs_adjust:
        adjust_audio_params(raw_path, output_path, speed=speed, pitch=pitch, volume=volume)
        try:
            os.unlink(raw_path)
        except OSError:
            pass
        stat = os.stat(output_path)
        return {
            "path": output_path,
            "size_bytes": stat.st_size,
            "sample_rate": result.get("sample_rate", 24000),
            "duration_sec": result.get("duration_sec", 0) / speed,
            "params": {"speed": speed, "pitch": pitch, "volume": volume},
        }
    return result


def generate_voice_design(
    text: str,
    output_path: str,
    language: str = "Auto",
    instruct: str = "",
    speed: float = 1.0,
    pitch: float = 0.0,
    volume: float = 1.0,
) -> dict:
    """
    声音设计：通过自然语言描述创建音色
    - instruct: 音色描述，如"甜美的萝莉音"或"低沉的磁性嗓音"
    speed/pitch/volume: 音频后处理参数
    """
    import tempfile as _tempfile
    raw_path = output_path
    needs_adjust = speed != 1.0 or pitch != 0.0 or volume != 1.0
    if needs_adjust:
        fd, raw_path = _tempfile.mkstemp(suffix=".wav")
        os.close(fd)

    script = os.path.join(QWEN_TTS_ROOT, "generate_audio.py")
    args = [
        "--text", text,
        "--output", raw_path,
        "--language", language,
        "--mode", "voice_design",
    ]
    if instruct:
        args += ["--style", instruct]
    result = _run(script, args, raw_path)

    if needs_adjust:
        adjust_audio_params(raw_path, output_path, speed=speed, pitch=pitch, volume=volume)
        try:
            os.unlink(raw_path)
        except OSError:
            pass
        stat = os.stat(output_path)
        return {
            "path": output_path,
            "size_bytes": stat.st_size,
            "sample_rate": result.get("sample_rate", 24000),
            "duration_sec": result.get("duration_sec", 0) / speed,
            "params": {"speed": speed, "pitch": pitch, "volume": volume},
        }
    return result


# ══════════════════════════════════════════════════════════════
# 兼容层（main.py 内部调用用）
# ══════════════════════════════════════════════════════════════

def load_model(m_type: str):
    pass  # 不再需要在主进程预加载

def unload_model():
    pass  # 子进程结束后自动清理


# ─────────────────────────────────────────────────────────────────
# 音频后处理：语速/音调/音量调节
# ─────────────────────────────────────────────────────────────────

def adjust_audio_params(
    input_path: str,
    output_path: str,
    speed: float = 1.0,
    pitch: float = 0.0,
    volume: float = 1.0,
) -> dict:
    """
    使用 scipy 调整音频参数。

    Args:
        input_path:  输入音频路径 (.wav)
        output_path: 输出音频路径 (.wav)
        speed:       语速倍率 0.5–2.0，默认 1.0
        pitch:       音调偏移（半音），-12 到 +12，默认 0
        volume:       音量倍率 0.0–2.0，默认 1.0
    """
    import numpy as np
    from scipy import signal
    import soundfile as sf

    speed = max(0.5, min(2.0, speed))
    pitch = max(-12, min(12, pitch))
    volume = max(0.0, min(2.0, volume))

    data, sample_rate = sf.read(input_path, dtype='float32')
    if data.ndim > 1:
        data = data.mean(axis=1)

    if speed != 1.0:
        duration_frames = int(len(data) / speed)
        indices = np.round(np.arange(0, len(data), speed)).astype(int)
        indices = indices[indices < len(data)]
        data = data[indices]

    if pitch != 0.0:
        tempo_ratio = 2 ** (pitch / 12.0)
        data = signal.resample(data, int(len(data) / tempo_ratio))

    if volume != 1.0:
        data = data * volume
        data = np.clip(data, -1.0, 1.0)

    sf.write(output_path, data, sample_rate, subtype='PCM_16')
    stat = os.stat(output_path)
    return {
        "path": output_path,
        "size_bytes": stat.st_size,
        "sample_rate": sample_rate,
        "params": {"speed": speed, "pitch": pitch, "volume": volume},
    }
