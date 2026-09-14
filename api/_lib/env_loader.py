"""Nạp biến môi trường local mà không ghi đè cấu hình do hệ thống/deploy cung cấp."""
from __future__ import annotations

import os
from pathlib import Path


def load_local_env() -> None:
    project_root = Path(__file__).resolve().parents[2]

    # Thứ tự ưu tiên: biến hệ thống > .env.local > .env.
    for filename in (".env.local", ".env"):
        path = project_root / filename
        if not path.is_file():
            continue

        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            if line.startswith("export "):
                line = line[7:].lstrip()

            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip()
            if not key:
                continue
            if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
                value = value[1:-1]
            os.environ.setdefault(key, value)


load_local_env()
