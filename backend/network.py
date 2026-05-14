"""
网络状态检测模块
监控网络连接状态，支持在线/离线模式自动切换
"""

from __future__ import annotations

import time
import socket
import threading
import logging
from typing import Callable

_logger = logging.getLogger(__name__)

# 检测服务器列表（使用可靠的公共 DNS）
_CHECK_HOSTS = [
    ("8.8.8.8", 53, 3.0),      # Google DNS
    ("114.114.114.114", 53, 3.0), # 百度 DNS
    ("1.1.1.1", 53, 3.0),       # Cloudflare DNS
]

# 全局状态
_state = {
    "online": True,
    "mode": "online",  # "online" | "offline"
    "last_check": 0.0,
    "last_online": 0.0,
    "consecutive_failures": 0,
    "check_interval": 30.0,  # 检测间隔（秒）
}

_listeners: list[Callable[[dict], None]] = []
_state_lock = threading.Lock()


def check_network(timeout: float = 3.0) -> bool:
    """
    检测网络连接状态。
    依次尝试 TCP 连接多个检测服务器，只要有一个成功即认为在线。
    """
    for host, port, tmo in _CHECK_HOSTS:
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(tmo)
            sock.connect((host, port))
            sock.close()
            return True
        except (socket.error, OSError):
            continue
    return False


def _background_check(interval: float = 30.0):
    """后台线程定期检测网络状态"""
    while True:
        time.sleep(interval)
        was_online = _state["online"]
        is_online = check_network()

        with _state_lock:
            _state["online"] = is_online
            _state["last_check"] = time.time()
            if is_online:
                _state["last_online"] = _state["last_check"]
                _state["consecutive_failures"] = 0
                if not was_online:
                    _state["mode"] = "online"
                    _notify({"event": "network_recovered"})
            else:
                _state["consecutive_failures"] += 1
                if _state["consecutive_failures"] >= 3 and was_online:
                    _state["mode"] = "offline"
                    _notify({"event": "network_lost"})


def _notify(payload: dict):
    for cb in _listeners:
        try:
            cb(payload)
        except Exception as e:
            _logger.warning(f"Network listener callback failed: {e}")


def start_network_monitor(interval: float = 30.0):
    """启动后台网络监控线程"""
    t = threading.Thread(target=_background_check, args=(interval,), daemon=True)
    t.start()
    _logger.info(f"网络监控线程已启动 (间隔 {interval}s)")


def get_network_status() -> dict:
    """获取当前网络状态"""
    with _state_lock:
        return {
            "online": _state["online"],
            "mode": _state["mode"],
            "last_check": _state["last_check"],
            "last_online": _state["last_online"],
            "consecutive_failures": _state["consecutive_failures"],
        }


def is_online() -> bool:
    """快速判断是否在线（读缓存）"""
    with _state_lock:
        return _state["online"]


def force_check() -> bool:
    """强制立即检测并返回结果"""
    result = check_network()
    with _state_lock:
        was_online = _state["online"]
        _state["online"] = result
        _state["last_check"] = time.time()
        if result:
            _state["last_online"] = _state["last_check"]
            _state["consecutive_failures"] = 0
            if not was_online:
                _state["mode"] = "online"
                _notify({"event": "network_recovered"})
        else:
            _state["consecutive_failures"] += 1
            if _state["consecutive_failures"] >= 3 and was_online:
                _state["mode"] = "offline"
                _notify({"event": "network_lost"})
    return result


def add_listener(cb: Callable[[dict], None]):
    """添加状态变化监听器"""
    _listeners.append(cb)


def remove_listener(cb: Callable[[dict], None]):
    """移除监听器"""
    if cb in _listeners:
        _listeners.remove(cb)
