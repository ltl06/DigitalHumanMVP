#!/usr/bin/env python3
"""
DigitalHuman MVP - 后端启动器
用法: python backend/serve.py
"""

import sys
import os
import uvicorn
from pathlib import Path

_venv_python = Path(__file__).parent / ".venv" / "Scripts" / "python.exe"

if not _venv_python.exists():
    print(f"[错误] 虚拟环境不存在: {_venv_python}", file=sys.stderr)
    sys.exit(1)

_current_python = Path(sys.executable).resolve()
_is_venv = _venv_python.resolve() == _current_python

if not _is_venv:
    os.execv(str(_venv_python), [str(_venv_python), __file__])

_backend_dir = Path(__file__).parent.resolve()
for p in [str(_backend_dir), str(_backend_dir.parent)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from main import app

if __name__ == "__main__":
    import yaml
    with open(_backend_dir.parent / "config.yaml", "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    host = cfg.get("API_HOST", "0.0.0.0")
    port = int(cfg.get("API_PORT", 8000))
    print(f"[启动] DigitalHuman API → http://localhost:{port}")
    uvicorn.run(app, host=host, port=port, reload=False)
