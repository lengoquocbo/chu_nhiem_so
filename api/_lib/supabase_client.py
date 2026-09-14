"""
Supabase client cho backend Python.

Dùng SECRET key (hệ key mới, dạng sb_secret_...) -> tương đương
service_role cũ, bypass RLS hoàn toàn.
=> Mọi hàm gọi client này BẮT BUỘC phải tự kiểm tra quyền
   (qua current_user trong auth.py) trước khi đọc/ghi dữ liệu.
Không bao giờ để lộ SECRET key ra frontend.
"""
import os
from functools import lru_cache
from supabase import create_client, Client

from .env_loader import load_local_env

load_local_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
# Hỗ trợ cả tên biến mới (SUPABASE_SECRET_KEY) và tên cũ (SUPABASE_SERVICE_ROLE_KEY)
SUPABASE_SECRET_KEY = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
    "SUPABASE_SERVICE_ROLE_KEY", ""
)


@lru_cache
def get_supabase() -> Client:
    if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
        raise RuntimeError(
            "Thiếu SUPABASE_URL hoặc SUPABASE_SECRET_KEY (hay SUPABASE_SERVICE_ROLE_KEY) "
            "trong biến môi trường."
        )
    return create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)
