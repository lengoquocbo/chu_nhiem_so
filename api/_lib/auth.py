"""
Xác thực người dùng cho các API Python.

Frontend gửi Supabase access_token (JWT) trong header:
    Authorization: Bearer <token>

Supabase (hệ key mới) ký JWT bất đối xứng (ES256/RS256) - không còn dùng
1 secret dùng chung (HS256) như trước. Ta verify bằng JWKS endpoint:
    https://<project>.supabase.co/auth/v1/.well-known/jwks.json
PyJWT tự tải + cache public key tương ứng theo `kid` trong token.

Sau khi xác thực xong, ta tự truy vấn user_roles / user_class_scope bằng
service key (SUPABASE_SECRET_KEY) để biết user có quyền gì - vì API ở đây
dùng service key nên PHẢI tự kiểm tra quyền thủ công, RLS không tự áp dụng.
"""
import os
import time
from dataclasses import dataclass, field
from functools import lru_cache
from threading import Lock, RLock
from typing import Callable, TypeVar
from uuid import UUID

import httpx
import jwt
from jwt import PyJWKClient
from fastapi import Header, HTTPException, status

from .supabase_client import get_supabase

SUPABASE_JWKS_URL = os.environ.get("SUPABASE_JWKS_URL", "")
# Fallback cho project cũ vẫn còn dùng JWT Secret (HS256) thay vì JWKS.
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
T = TypeVar("T")
_AUTH_CACHE: dict[str, tuple[float, object]] = {}
_AUTH_CACHE_LOCK = RLock()
_AUTH_KEY_LOCKS: dict[str, Lock] = {}
_TRANSIENT_HTTP_ERRORS = (
    httpx.RemoteProtocolError,
    httpx.ConnectError,
    httpx.ReadError,
    httpx.ReadTimeout,
)


def _read_with_retry(operation: Callable[[], T]) -> T:
    """Retry ngắn chỉ dành cho truy vấn xác thực/scope chỉ đọc."""
    for attempt in range(3):
        try:
            return operation()
        except _TRANSIENT_HTTP_ERRORS:
            if attempt == 2:
                raise
            time.sleep(0.12 * (2 ** attempt))
    raise RuntimeError("Không thể hoàn tất truy vấn xác thực.")


def _cached_read(key: str, ttl_seconds: float, operation: Callable[[], T]) -> T:
    now = time.monotonic()
    with _AUTH_CACHE_LOCK:
        cached = _AUTH_CACHE.get(key)
        if cached and cached[0] > now:
            return cached[1]  # type: ignore[return-value]
        key_lock = _AUTH_KEY_LOCKS.setdefault(key, Lock())

    # Chỉ tuần tự hóa cùng một user/scope; các user khác vẫn được xử lý song song.
    with key_lock:
        now = time.monotonic()
        with _AUTH_CACHE_LOCK:
            cached = _AUTH_CACHE.get(key)
            if cached and cached[0] > now:
                return cached[1]  # type: ignore[return-value]
        value = _read_with_retry(operation)
        with _AUTH_CACHE_LOCK:
            _AUTH_CACHE[key] = (time.monotonic() + ttl_seconds, value)
        return value


@dataclass
class CurrentUser:
    user_id: str
    email: str | None
    roles: list[str] = field(default_factory=list)
    school_id: str | None = None

    def has_role(self, role: str) -> bool:
        return role in self.roles

    def is_system_admin(self) -> bool:
        return self.has_role("system_admin")

    def is_principal(self) -> bool:
        return (self.has_role("principal") or self.is_system_admin()) and self.school_id is not None

    def is_principal_for_class(self, class_id: str) -> bool:
        return self.is_principal() and self.school_id == get_class_school_id(class_id)

    def is_principal_for_year(self, school_year_id: str) -> bool:
        return self.is_principal() and self.school_id == get_year_school_id(school_year_id)

    def is_principal_for_student(self, student_id: str) -> bool:
        return self.is_principal() and self.school_id == get_student_school_id(student_id)


@lru_cache
def _get_jwk_client() -> PyJWKClient:
    if not SUPABASE_JWKS_URL:
        raise RuntimeError("Thiếu SUPABASE_JWKS_URL trong biến môi trường.")
    return PyJWKClient(SUPABASE_JWKS_URL)


def _decode_token(token: str) -> dict:
    # Ưu tiên JWKS (hệ key mới, ES256/RS256).
    if SUPABASE_JWKS_URL:
        try:
            signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token không hợp lệ (JWKS): {exc}",
            ) from exc

    # Fallback: project cũ dùng JWT Secret chung (HS256).
    if SUPABASE_JWT_SECRET:
        try:
            return jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated",
            )
        except jwt.PyJWTError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Token không hợp lệ (HS256): {exc}",
            ) from exc

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail="Backend chưa cấu hình SUPABASE_JWKS_URL hoặc SUPABASE_JWT_SECRET.",
    )


def get_current_user(
    authorization: str = Header(default=""),
    x_acting_school_id: str = Header(default="", alias="X-Acting-School-Id"),
) -> CurrentUser:
    if not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Thiếu Authorization: Bearer <token>",
        )
    token = authorization.removeprefix("Bearer ").strip()
    payload = _decode_token(token)
    user_id = payload.get("sub")
    email = payload.get("email")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token thiếu user id")

    supabase = get_supabase()
    # Staff role/school revocation must take effect on the next API request.
    roles_resp = supabase.table("user_roles").select("role").eq("user_id", user_id).execute()
    roles = [r["role"] for r in (roles_resp.data or [])]

    school_id = None
    if any(role in roles for role in ("principal", "homeroom_teacher", "subject_teacher")):
        assignment = supabase.table("staff_school_assignments")\
            .select("school_id").eq("user_id", user_id).limit(1).execute().data or []
        school_id = assignment[0]["school_id"] if assignment else None
        if school_id is None:
            raise HTTPException(status_code=403, detail="Tài khoản nhân sự chưa được gắn với trường.")

    if "system_admin" in roles and x_acting_school_id:
        try:
            selected_school_id = str(UUID(x_acting_school_id))
        except (ValueError, TypeError) as exc:
            raise HTTPException(status_code=422, detail="Mã trường được chọn không hợp lệ.") from exc
        selected = supabase.table("schools").select("id").eq("id", selected_school_id).limit(1).execute().data or []
        if not selected:
            raise HTTPException(status_code=404, detail="Trường được chọn không tồn tại.")
        school_id = selected_school_id

    return CurrentUser(user_id=user_id, email=email, roles=roles, school_id=school_id)


def get_year_school_id(school_year_id: str) -> str | None:
    rows = _cached_read(
        f"year-school:{school_year_id}", 15,
        lambda: get_supabase().table("school_years").select("school_id")
        .eq("id", school_year_id).limit(1).execute().data or [],
    )
    return rows[0]["school_id"] if rows else None


def get_class_school_id(class_id: str) -> str | None:
    rows = _cached_read(
        f"class-school:{class_id}", 15,
        lambda: get_supabase().table("classes").select("school_year_id")
        .eq("id", class_id).limit(1).execute().data or [],
    )
    return get_year_school_id(rows[0]["school_year_id"]) if rows else None


def get_student_school_id(student_id: str) -> str | None:
    rows = _cached_read(
        f"student-school:{student_id}", 15,
        lambda: get_supabase().table("students").select("school_id")
        .eq("id", student_id).limit(1).execute().data or [],
    )
    return rows[0]["school_id"] if rows else None


def get_school_class_ids(school_id: str) -> list[str]:
    db = get_supabase()
    years = db.table("school_years").select("id").eq("school_id", school_id).execute().data or []
    year_ids = [row["id"] for row in years]
    if not year_ids:
        return []
    classes = db.table("classes").select("id").in_("school_year_id", year_ids).execute().data or []
    return [row["id"] for row in classes]


def _require_term_in_class(class_id: str, academic_term_id: str) -> None:
    db = get_supabase()
    class_rows = _cached_read(
        f"class-year:{class_id}", 15,
        lambda: db.table("classes").select("school_year_id")
        .eq("id", class_id).limit(1).execute().data or [],
    )
    term_rows = _cached_read(
        f"term-year:{academic_term_id}", 15,
        lambda: db.table("academic_terms").select("school_year_id")
        .eq("id", academic_term_id).limit(1).execute().data or [],
    )
    if not class_rows or not term_rows or class_rows[0]["school_year_id"] != term_rows[0]["school_year_id"]:
        raise HTTPException(status_code=422, detail="Học kỳ không thuộc năm học của lớp.")


def require_principal_for_class(user: CurrentUser, class_id: str) -> None:
    if not user.is_principal_for_class(class_id):
        raise HTTPException(status_code=403, detail="Bạn không quản lý trường của lớp này.")


def require_principal_for_year(user: CurrentUser, school_year_id: str) -> None:
    if not user.is_principal_for_year(school_year_id):
        raise HTTPException(status_code=403, detail="Bạn không quản lý trường của năm học này.")


def require_principal_for_student(user: CurrentUser, student_id: str) -> None:
    if not user.is_principal_for_student(student_id):
        raise HTTPException(status_code=403, detail="Bạn không quản lý trường của học sinh này.")


def require_principal_for_term(user: CurrentUser, academic_term_id: str) -> None:
    rows = get_supabase().table("academic_terms").select("school_year_id")\
        .eq("id", academic_term_id).limit(1).execute().data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy học kỳ.")
    require_principal_for_year(user, rows[0]["school_year_id"])


def get_user_class_scope(user_id: str, class_id: str) -> list[str]:
    """Trả về danh sách scope_role của user trên 1 lớp cụ thể."""
    supabase = get_supabase()
    resp = _cached_read(
        f"class-scope:{user_id}:{class_id}",
        8,
        lambda: supabase.table("user_class_scope")
        .select("scope_role").eq("user_id", user_id).eq("class_id", class_id).execute(),
    )
    return [r["scope_role"] for r in (resp.data or [])]


def require_homeroom_term_access(user: CurrentUser, class_id: str, academic_term_id: str) -> None:
    """GVCN chỉ được thao tác học kỳ mà mình được Hiệu trưởng phân công."""
    _require_term_in_class(class_id, academic_term_id)
    if user.is_principal_for_class(class_id):
        return
    rows = _cached_read(
        f"homeroom-term:{user.user_id}:{class_id}:{academic_term_id}",
        8,
        lambda: get_supabase().table("homeroom_term_assignments")
        .select("id,class_academic_terms!inner(class_id,academic_term_id,status)")
        .eq("teacher_id", user.user_id).eq("status", "active")
        .eq("class_academic_terms.class_id", class_id)
        .eq("class_academic_terms.academic_term_id", academic_term_id)
        .eq("class_academic_terms.status", "active").limit(1).execute().data or [],
    )
    if not rows:
        raise HTTPException(status_code=403, detail="Bạn không được phân công chủ nhiệm lớp này trong học kỳ đã chọn.")
    term_rows = _cached_read(
        f"term-status:{academic_term_id}",
        5,
        lambda: get_supabase().table("academic_terms").select("status")
        .eq("id", academic_term_id).limit(1).execute().data or [],
    )
    if not term_rows or term_rows[0]["status"] != "active":
        raise HTTPException(status_code=423, detail="Học kỳ đã đóng hoặc chưa hoạt động; toàn bộ quyền GVCN đã bị khóa.")


def require_student_access(user: CurrentUser, student_id: str) -> None:
    """
    Cho phép xem dữ liệu của 1 học sinh nếu:
      - user là chính học sinh đó (student_user_link)
      - user là phụ huynh của học sinh đó (parent_student_scope)
      - user có bất kỳ scope nào trên lớp hiện tại của học sinh (GVCN/GVBM/cán bộ lớp)
      - user là principal
    """
    if user.is_principal_for_student(student_id):
        return
    supabase = get_supabase()

    if user.has_role("student"):
        profile_resp = (
            supabase.table("profiles")
            .select("must_change_password")
            .eq("id", user.user_id)
            .limit(1)
            .execute()
        )
        if profile_resp.data and profile_resp.data[0].get("must_change_password"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Bạn phải đổi mật khẩu lần đầu trước khi xem dữ liệu học tập.",
            )

    link_resp = (
        supabase.table("student_user_link")
        .select("student_id")
        .eq("student_id", student_id)
        .eq("user_id", user.user_id)
        .execute()
    )
    if link_resp.data:
        return

    parent_resp = (
        supabase.table("parent_student_scope")
        .select("student_id")
        .eq("student_id", student_id)
        .eq("parent_id", user.user_id)
        .execute()
    )
    if parent_resp.data:
        return

    enroll_resp = (
        supabase.table("student_class_enrollments")
        .select("class_id")
        .eq("student_id", student_id)
        .is_("left_at", None)
        .limit(1)
        .execute()
    )
    if enroll_resp.data:
        class_id = enroll_resp.data[0]["class_id"]
        scope = get_user_class_scope(user.user_id, class_id)
        if scope:
            return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền xem dữ liệu của học sinh này.",
    )


def require_class_role(user: CurrentUser, class_id: str, allowed_roles: list[str]) -> None:
    """Raise 403 nếu user không có 1 trong các scope_role cho phép trên lớp này."""
    class_school_id = get_class_school_id(class_id)
    if user.is_principal_for_class(class_id):
        return
    if any(role in user.roles for role in ("principal", "homeroom_teacher", "subject_teacher")):
        if user.school_id is None or user.school_id != class_school_id:
            raise HTTPException(status_code=403, detail="Lớp không thuộc trường của bạn.")
    scope = get_user_class_scope(user.user_id, class_id)
    if any(r in allowed_roles for r in scope):
        return
    if "group_leader" in allowed_roles:
        group_scope = (
            get_supabase().table("user_group_scope")
            .select("group_id, groups_!inner(class_id)")
            .eq("user_id", user.user_id)
            .eq("scope_role", "group_leader")
            .eq("groups_.class_id", class_id)
            .limit(1)
            .execute()
        )
        if group_scope.data:
            return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Bạn không có quyền thao tác trên lớp này.",
    )


def require_student_record_scope(user: CurrentUser, student_id: str, class_id: str) -> None:
    """Tổ trưởng chỉ được ghi nhận học sinh thuộc đúng tổ mình phụ trách."""
    if user.is_principal_for_class(class_id):
        return
    class_scope = get_user_class_scope(user.user_id, class_id)
    if any(role in class_scope for role in ("homeroom_teacher", "subject_teacher", "class_monitor", "vice_monitor")):
        return
    group_scope = (
        get_supabase().table("user_group_scope")
        .select("group_id")
        .eq("user_id", user.user_id)
        .eq("scope_role", "group_leader")
        .execute()
    )
    group_ids = [row["group_id"] for row in (group_scope.data or [])]
    if group_ids:
        membership = (
            get_supabase().table("group_members")
            .select("id, groups_!inner(class_id)")
            .eq("student_id", student_id)
            .in_("group_id", group_ids)
            .eq("groups_.class_id", class_id)
            .is_("left_at", None)
            .limit(1)
            .execute()
        )
        if membership.data:
            return
    raise HTTPException(status_code=403, detail="Bạn chỉ được ghi nhận học sinh thuộc tổ mình phụ trách.")


def require_group_access(user: CurrentUser, group_id: str, class_id: str) -> None:
    if user.is_principal_for_class(class_id):
        return
    class_scope = get_user_class_scope(user.user_id, class_id)
    if any(role in class_scope for role in ("homeroom_teacher", "class_monitor")):
        return
    scoped = (
        get_supabase().table("user_group_scope")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("group_id", group_id)
        .eq("scope_role", "group_leader")
        .limit(1)
        .execute()
    )
    if not scoped.data:
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem tổ này.")


def require_record_class(table: str, record_id: str, class_id: str, label: str) -> dict:
    """Chống thay class_id ở request để thao tác tài nguyên của lớp khác."""
    allowed_tables = {"score_transactions", "competition_weeks", "attendance_sessions", "groups_"}
    if table not in allowed_tables:
        raise RuntimeError("Bảng kiểm tra tài nguyên không được hỗ trợ.")
    resp = get_supabase().table(table).select("*").eq("id", record_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail=f"Không tìm thấy {label}.")
    record = resp.data[0]
    if record.get("class_id") != class_id:
        raise HTTPException(status_code=422, detail=f"{label} không thuộc lớp đang thao tác.")
    return record


def require_active_student_in_class(student_id: str, class_id: str) -> None:
    resp = (
        get_supabase().table("student_class_enrollments")
        .select("id")
        .eq("student_id", student_id)
        .eq("class_id", class_id)
        .is_("left_at", None)
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=422, detail="Học sinh không thuộc lớp đang thao tác.")


def require_subject_assignment(user: CurrentUser, class_id: str, subject_id: str) -> None:
    if user.is_principal_for_class(class_id) or "homeroom_teacher" in get_user_class_scope(user.user_id, class_id):
        return
    resp = (
        get_supabase().table("class_subject_teachers")
        .select("id")
        .eq("teacher_id", user.user_id)
        .eq("class_id", class_id)
        .eq("subject_id", subject_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=403, detail="Bạn không được phân công môn này trong lớp.")


def require_subject_term_access(
    user: CurrentUser,
    class_id: str,
    subject_id: str,
    academic_term_id: str,
    *,
    require_active: bool = False,
) -> None:
    """Xác thực phân công GVBM trong đúng học kỳ; học kỳ đóng vẫn được xem."""
    _require_term_in_class(class_id, academic_term_id)
    if user.is_principal_for_class(class_id) or "homeroom_teacher" in get_user_class_scope(user.user_id, class_id):
        if require_active:
            term_rows = get_supabase().table("academic_terms").select("status").eq("id", academic_term_id).limit(1).execute().data or []
            if not term_rows or term_rows[0]["status"] != "active":
                raise HTTPException(status_code=423, detail="Học kỳ đã đóng hoặc chưa hoạt động; chỉ được xem dữ liệu.")
        return

    rows = (
        get_supabase().table("class_subject_teachers")
        .select("id,class_academic_terms!inner(class_id,academic_term_id,status)")
        .eq("teacher_id", user.user_id).eq("class_id", class_id).eq("subject_id", subject_id)
        .eq("status", "active").eq("class_academic_terms.academic_term_id", academic_term_id)
        .eq("class_academic_terms.status", "active").limit(1).execute().data or []
    )
    if not rows:
        raise HTTPException(status_code=403, detail="Bạn không được phân công môn này trong học kỳ đã chọn.")
    if require_active:
        term_rows = get_supabase().table("academic_terms").select("status").eq("id", academic_term_id).limit(1).execute().data or []
        if not term_rows or term_rows[0]["status"] != "active":
            raise HTTPException(status_code=423, detail="Học kỳ đã đóng hoặc chưa hoạt động; chỉ được xem dữ liệu.")
