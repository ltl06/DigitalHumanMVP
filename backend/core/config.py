"""
Core configuration loader.
Loads paths from config.yaml and configures both engine modules.
"""

import os
import sys
import yaml
import logging
from pathlib import Path

_logger = logging.getLogger(__name__)

_root_dir = Path(__file__).parent.parent.resolve()
# config.yaml 放在项目根目录（backend 的上一级）
_config_path = _root_dir.parent / "config.yaml"

# ── 持久化配置（模块级，惰性填充）───────────────────────────────
_config: dict = {
    "tts_root": "",
    "wav2lip_root": "",
    "upload_dir": _root_dir / "uploads",
    "output_dir": _root_dir / "outputs",
    "api_host": "0.0.0.0",
    "api_port": 8000,
}


def _load_yaml():
    if not _config_path.exists():
        _logger.warning(f"[Config] 配置文件不存在 {_config_path}，使用默认路径")
        return {}
    with open(_config_path, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def _expand(path: str) -> str:
    return os.path.expandvars(path)


# ── 配置校验 ─────────────────────────────────────────────────

class ConfigValidator:
    """启动时校验关键配置项，缺失时报告，严重错误时终止启动。"""

    def __init__(self):
        self.warnings: list[str] = []
        self.errors: list[str] = []

    def warn(self, msg: str):
        self.warnings.append(msg)
        _logger.warning(f"[Config] {msg}")

    def error(self, msg: str):
        self.errors.append(msg)
        _logger.error(f"[Config] {msg}")

    def validate_dir(self, name: str, path: Path | str, required: bool = False):
        p = Path(path) if path else None
        if not p:
            if required:
                self.error(f"{name} 路径未配置")
            else:
                self.warn(f"{name} 路径未配置")
            return False
        try:
            resolved = p.resolve()
            if not resolved.exists():
                if required:
                    self.error(f"{name} 目录不存在: {resolved}")
                else:
                    self.warn(f"{name} 目录不存在: {resolved}")
                return False
            if not resolved.is_dir():
                self.error(f"{name} 不是有效目录: {resolved}")
                return False
            return True
        except OSError as e:
            self.error(f"{name} 路径访问失败: {e}")
            return False

    def validate_file(self, name: str, path: Path | str, required: bool = True, min_size: int = 1024):
        p = Path(path) if path else None
        if not p:
            if required:
                self.error(f"{name} 文件未配置")
            else:
                self.warn(f"{name} 文件未配置")
            return False
        try:
            resolved = p.resolve()
            if not resolved.exists():
                if required:
                    self.error(f"{name} 文件不存在: {resolved}")
                else:
                    self.warn(f"{name} 文件不存在: {resolved}")
                return False
            if not resolved.is_file():
                self.error(f"{name} 不是有效文件: {resolved}")
                return False
            size = resolved.stat().st_size
            if size < min_size:
                self.error(f"{name} 文件可能损坏（大小 {size} 字节 < {min_size}）: {resolved}")
                return False
            return True
        except OSError as e:
            self.error(f"{name} 文件访问失败: {e}")
            return False

    def validate_int(self, name: str, value: int, min_v: int, max_v: int, default: int):
        if not isinstance(value, int):
            self.warn(f"{name} 不是整数，使用默认值 {default}")
            return default
        if value < min_v or value > max_v:
            self.warn(f"{name}={value} 超出范围 [{min_v}, {max_v}]，使用默认值 {default}")
            return default
        return value


# ── 公开 API ─────────────────────────────────────────────────

def get_config() -> dict:
    """返回配置字典（惰性加载）"""
    return _config


def configure():
    """
    初始化配置和引擎路径（仅在服务启动时调用一次）。
    使用 ConfigValidator 校验配置项。
    """
    global _config

    cfg = _load_yaml()
    validator = ConfigValidator()

    upload_dir = Path(_expand(cfg.get("UPLOAD_DIR", str(_root_dir / "uploads"))))
    output_dir = Path(_expand(cfg.get("OUTPUT_DIR", str(_root_dir / "outputs"))))

    # 校验目录
    validator.validate_dir("上传目录", upload_dir, required=False)
    validator.validate_dir("输出目录", output_dir, required=False)

    # 尝试创建目录
    try:
        upload_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        validator.error(f"无法创建上传/输出目录: {e}")

    _config["upload_dir"] = upload_dir
    _config["output_dir"] = output_dir
    _config["api_host"] = cfg.get("API_HOST", "0.0.0.0")
    _config["api_port"] = validator.validate_int("API_PORT", cfg.get("API_PORT", 8000), 1, 65535, 8000)

    # ── TTS ────────────────────────────────────────────────────
    tts_root = cfg.get("QWEN_TTS_ROOT", "")
    if tts_root:
        tts_root = _expand(tts_root)
        _config["tts_root"] = tts_root

        if validator.validate_dir("TTS 根目录", tts_root, required=True):
            # 校验 Python 可执行文件
            py_exe = Path(tts_root) / "WPy64-312101" / "python" / "python.exe"
            validator.validate_file("TTS Python", py_exe, required=True, min_size=1024)

        try:
            from engines.tts import configure as tts_configure
            tts_configure(
                root=tts_root,
                custom_voice=_expand(cfg.get("QWEN_MODEL_CUSTOM_VOICE", "")),
                base=_expand(cfg.get("QWEN_MODEL_BASE", "")),
                voice_design=_expand(cfg.get("QWEN_MODEL_VOICE_DESIGN", "")),
            )
            _logger.info(f"[Config] TTS 已配置: {tts_root}")
        except Exception as e:
            validator.error(f"TTS 配置失败: {e}")
    else:
        validator.warn("QWEN_TTS_ROOT 未配置，TTS 接口将不可用")

    # ── Wav2Lip ────────────────────────────────────────────────
    wav2lip_root = cfg.get("WAV2LIP_ROOT", "")
    if wav2lip_root:
        wav2lip_root = _expand(wav2lip_root)
        _config["wav2lip_root"] = wav2lip_root

        if validator.validate_dir("Wav2Lip 根目录", wav2lip_root, required=True):
            # 校验关键 checkpoint 文件
            checkpoints = Path(wav2lip_root) / "checkpoints"
            validator.validate_dir("Wav2Lip checkpoints", checkpoints, required=True)
            validator.validate_file("Wav2Lip_GAN", checkpoints / "Wav2Lip_GAN.pth", required=True, min_size=10 * 1024 * 1024)
            validator.validate_file("RetinaFace", checkpoints / "mobilenet.pth", required=True, min_size=1024)

        try:
            from engines.wav2lip import configure as wav2lip_configure
            wav2lip_configure(
                root=wav2lip_root,
                checkpoint="",
                mobilenet="",
                predictor="",
                mouth_detector="",
                gfpgan="",
            )
            _logger.info(f"[Config] Wav2Lip 已配置: {wav2lip_root}")
        except Exception as e:
            validator.error(f"Wav2Lip 配置失败: {e}")
    else:
        validator.warn("WAV2LIP_ROOT 未配置，唇形同步接口将不可用")

    # 如果有严重错误，仍允许启动（让接口报告具体错误）
    if validator.errors:
        _logger.error(f"[Config] 严重配置错误 {len(validator.errors)} 项，请检查配置")

    return _config
