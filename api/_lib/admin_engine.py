"""
Tạo tài khoản đăng nhập (auth.users) cho giáo viên / học sinh / phụ huynh.

Học sinh KHÔNG tự đăng ký tài khoản - Admin hoặc GVCN tạo hộ, sau đó gửi
email/mật khẩu cho học sinh/phụ huynh tự đổi mật khẩu ở lần đăng nhập đầu.

Dùng Supabase Admin API (auth.admin.create_user) - yêu cầu SECRET key,
nên chỉ gọi được từ backend Python (không thể gọi từ frontend).
"""
from __future__ import annotations

import secrets
import re
from datetime import date
from typing import Optional

from fastapi import HTTPException

from .supabase_client import get_supabase


def create_class(
    name: str,
    grade_block_id: str,
    school_year_id: str,
    academic_term_id: str,
    actor_id: str,
) -> dict:
    """Tạo lớp năm học và đồng thời mở lớp trong học kỳ đã chọn."""
    name = name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Tên lớp không được để trống.")

    supabase = get_supabase()
    grade_rows = (
        supabase.table("grade_blocks").select("id,school_year_id")
        .eq("id", grade_block_id).limit(1).execute().data or []
    )
    term_rows = (
        supabase.table("academic_terms").select("id,school_year_id,name,status")
        .eq("id", academic_term_id).limit(1).execute().data or []
    )
    if not grade_rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy khối học.")
    if not term_rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy học kỳ.")
    if grade_rows[0]["school_year_id"] != school_year_id:
        raise HTTPException(status_code=422, detail="Khối học không thuộc năm học đã chọn.")
    if term_rows[0]["school_year_id"] != school_year_id:
        raise HTTPException(status_code=422, detail="Học kỳ không thuộc năm học đã chọn.")

    created_class: dict | None = None
    created_new = False
    try:
        existing = (
            supabase.table("classes").select("*").eq("name", name)
            .eq("grade_block_id", grade_block_id).eq("school_year_id", school_year_id)
            .limit(1).execute().data or []
        )
        if existing:
            created_class = existing[0]
        else:
            created_class = supabase.table("classes").insert({
                "name": name,
                "grade_block_id": grade_block_id,
                "school_year_id": school_year_id,
                "class_code": "",
                "created_by": actor_id,
            }).execute().data[0]
            created_new = True
        duplicate_link = (
            supabase.table("class_academic_terms").select("id")
            .eq("class_id", created_class["id"]).eq("academic_term_id", academic_term_id)
            .limit(1).execute().data or []
        )
        if duplicate_link:
            raise HTTPException(status_code=409, detail="Lớp này đã được mở trong học kỳ đã chọn.")
        class_term = supabase.table("class_academic_terms").insert({
            "class_id": created_class["id"],
            "academic_term_id": academic_term_id,
            "created_by": actor_id,
        }).execute().data[0]
        supabase.table("audit_logs").insert({
            "actor_id": actor_id,
            "action": "CREATE",
            "entity": "classes",
            "entity_id": created_class["id"],
            "after_data": {
                "name": name,
                "school_year_id": school_year_id,
                "academic_term_id": academic_term_id,
            },
            "reason": "Hiệu trưởng tạo lớp cho năm học và học kỳ",
        }).execute()
    except HTTPException:
        if created_new and created_class:
            supabase.table("classes").delete().eq("id", created_class["id"]).execute()
        raise
    except Exception as exc:  # noqa: BLE001
        if created_new and created_class:
            supabase.table("classes").delete().eq("id", created_class["id"]).execute()
        raise HTTPException(status_code=422, detail=f"Không thể tạo lớp: {exc}") from exc

    return {**created_class, "class_academic_term": class_term}


def assign_homeroom_teacher(class_id: str, academic_term_id: str, teacher_id: Optional[str], actor_id: str) -> dict:
    supabase = get_supabase()
    class_term_rows = (
        supabase.table("class_academic_terms").select("id,class_id,academic_term_id")
        .eq("class_id", class_id).eq("academic_term_id", academic_term_id)
        .limit(1).execute().data or []
    )
    if not class_term_rows:
        raise HTTPException(status_code=404, detail="Lớp chưa được mở trong học kỳ này.")

    if teacher_id:
        role_resp = (
            supabase.table("user_roles")
            .select("user_id")
            .eq("user_id", teacher_id)
            .eq("role", "homeroom_teacher")
            .limit(1)
            .execute()
        )
        if not role_resp.data:
            raise HTTPException(status_code=422, detail="Tài khoản được chọn chưa có vai trò Giáo viên chủ nhiệm.")

    class_term_id = class_term_rows[0]["id"]
    previous = (
        supabase.table("homeroom_term_assignments").select("*")
        .eq("class_academic_term_id", class_term_id).eq("status", "active")
        .limit(1).execute().data or []
    )
    previous_teacher_id = previous[0]["teacher_id"] if previous else None
    if previous_teacher_id == teacher_id:
        return {"class_id": class_id, "academic_term_id": academic_term_id, "teacher_id": teacher_id}
    try:
        if previous:
            supabase.table("homeroom_term_assignments").update({
                "status": "removed", "removed_by": actor_id, "removed_at": "now()",
            }).eq("id", previous[0]["id"]).execute()
        assignment = None
        if teacher_id:
            assignment = supabase.table("homeroom_term_assignments").insert({
                "class_academic_term_id": class_term_id,
                "teacher_id": teacher_id,
                "assigned_by": actor_id,
            }).execute().data[0]
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "UPDATE",
                "entity": "homeroom_term_assignments",
                "entity_id": assignment["id"] if assignment else previous[0]["id"],
                "before_data": {"homeroom_teacher_id": previous_teacher_id},
                "after_data": {"homeroom_teacher_id": teacher_id or None, "academic_term_id": academic_term_id},
                "reason": "Hiệu trưởng phân công GVCN theo học kỳ",
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Không thể cập nhật giáo viên chủ nhiệm cho lớp.") from exc

    return {"class_id": class_id, "academic_term_id": academic_term_id, "teacher_id": teacher_id or None}


def homeroom_context(user_id: str, is_principal: bool = False) -> dict:
    """Các phạm vi năm học - học kỳ - lớp mà GVCN thực sự được phân công."""
    db = get_supabase()
    if is_principal:
        rows = db.table("class_academic_terms").select(
            "id,class_id,academic_term_id,classes(id,name,class_code,school_year_id,school_years(id,name,status)),academic_terms(id,name,term_number,start_date,end_date,status,school_year_id)"
        ).eq("status", "active").execute().data or []
    else:
        assignments = db.table("homeroom_term_assignments").select(
            "class_academic_terms!inner(id,class_id,academic_term_id,status,classes(id,name,class_code,school_year_id,school_years(id,name,status)),academic_terms(id,name,term_number,start_date,end_date,status,school_year_id))"
        ).eq("teacher_id", user_id).eq("status", "active").eq("class_academic_terms.status", "active").execute().data or []
        rows = [row["class_academic_terms"] for row in assignments]
    scopes = []
    for row in rows:
        class_row = row.get("classes") or {}
        term = row.get("academic_terms") or {}
        year = class_row.get("school_years") or {}
        scopes.append({
            "class_term_id": row["id"], "class_id": row["class_id"],
            "class_name": class_row.get("name"), "class_code": class_row.get("class_code"),
            "school_year_id": class_row.get("school_year_id"), "school_year_name": year.get("name"),
            "school_year_status": year.get("status"), "academic_term_id": row["academic_term_id"],
            "term_name": term.get("name"), "term_number": term.get("term_number"),
            "term_start_date": term.get("start_date"), "term_end_date": term.get("end_date"),
            "term_status": term.get("status"),
        })
    scopes.sort(key=lambda item: (item.get("school_year_name") or "", item.get("term_number") or 0, item.get("class_name") or ""))
    return {"scopes": scopes}


def create_academic_term(
    school_year_id: str,
    name: str,
    term_number: int,
    start_date: date,
    end_date: date,
    actor_id: str,
) -> dict:
    name = name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Tên học kỳ không được để trống.")
    if term_number not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="Số học kỳ phải từ 1 đến 3.")
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="Ngày bắt đầu học kỳ phải trước ngày kết thúc.")

    supabase = get_supabase()
    year_resp = supabase.table("school_years").select("id, start_date, end_date").eq("id", school_year_id).limit(1).execute()
    if not year_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy năm học.")
    year = year_resp.data[0]
    if start_date.isoformat() < year["start_date"] or end_date.isoformat() > year["end_date"]:
        raise HTTPException(status_code=422, detail="Thời gian học kỳ phải nằm trong thời gian của năm học.")

    try:
        result = supabase.table("academic_terms").insert(
            {
                "school_year_id": school_year_id,
                "name": name,
                "term_number": term_number,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "created_by": actor_id,
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Không thể tạo học kỳ: {exc}") from exc
    return result.data[0]


def activate_academic_term(term_id: str, actor_id: str) -> dict:
    supabase = get_supabase()
    term_resp = supabase.table("academic_terms").select("id, school_year_id, status").eq("id", term_id).limit(1).execute()
    if not term_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy học kỳ.")
    term = term_resp.data[0]

    try:
        supabase.table("academic_terms").update({"status": "closed"}).eq("school_year_id", term["school_year_id"]).eq("status", "active").neq("id", term_id).execute()
        supabase.table("academic_terms").update({"status": "active"}).eq("id", term_id).execute()
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "UPDATE",
                "entity": "academic_terms",
                "entity_id": term_id,
                "after_data": {"status": "active"},
                "reason": "Hiệu trưởng kích hoạt học kỳ",
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Không thể kích hoạt học kỳ.") from exc
    return {"id": term_id, "status": "active"}


def _generate_password() -> str:
    return secrets.token_urlsafe(9)  # ví dụ: 'k3F9x_2pQabc' - đủ mạnh, dễ copy gửi phụ huynh


def _extract_user(resp) -> dict:
    """supabase-py trả về object hoặc dict tuỳ version - chuẩn hoá lại."""
    user = getattr(resp, "user", None)
    if user is None and isinstance(resp, dict):
        user = resp.get("user")
    if user is None:
        raise HTTPException(status_code=500, detail=f"Không tạo được tài khoản, phản hồi lạ: {resp}")
    user_id = getattr(user, "id", None) or (user.get("id") if isinstance(user, dict) else None)
    email = getattr(user, "email", None) or (user.get("email") if isinstance(user, dict) else None)
    if not user_id:
        raise HTTPException(status_code=500, detail="Không lấy được user_id sau khi tạo tài khoản.")
    return {"id": user_id, "email": email}


def create_auth_account(email: str, full_name: str, password: Optional[str] = None) -> dict:
    email = email.strip().lower()
    full_name = full_name.strip()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="Email không hợp lệ.")
    if not full_name:
        raise HTTPException(status_code=422, detail="Họ tên không được để trống.")

    supabase = get_supabase()
    if password is not None and (len(password) < 8 or not password.strip()):
        raise HTTPException(status_code=422, detail="Mật khẩu phải có ít nhất 8 ký tự.")
    pwd = password or _generate_password()
    try:
        resp = supabase.auth.admin.create_user(
            {
                "email": email,
                "password": pwd,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            }
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Không tạo được tài khoản: {exc}") from exc

    user = _extract_user(resp)
    return {"user_id": user["id"], "email": user["email"], "temporary_password": pwd}


def _delete_auth_account(user_id: str) -> None:
    """Rollback tài khoản Auth nếu bước liên kết business phía sau thất bại."""
    try:
        get_supabase().auth.admin.delete_user(user_id)
    except Exception:  # noqa: BLE001
        pass


def _ensure_student_in_class(supabase, student_id: str, class_id: Optional[str]) -> None:
    if not class_id:
        return
    enrollment = (
        supabase.table("student_class_enrollments")
        .select("id")
        .eq("student_id", student_id)
        .eq("class_id", class_id)
        .is_("left_at", None)
        .limit(1)
        .execute()
    )
    if not enrollment.data:
        raise HTTPException(status_code=422, detail="Học sinh không thuộc lớp đang thao tác.")


def create_teacher_account(
    email: str, full_name: str, role: str, actor_id: str, password: Optional[str] = None
) -> dict:
    if role not in ("homeroom_teacher", "subject_teacher", "principal"):
        raise HTTPException(status_code=422, detail="role không hợp lệ.")

    supabase = get_supabase()
    account = create_auth_account(email, full_name, password)
    try:
        supabase.table("user_roles").insert({"user_id": account["user_id"], "role": role}).execute()
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "CREATE",
                "entity": "user_roles",
                "entity_id": account["user_id"],
                "after_data": {"email": email, "role": role},
                "reason": "Admin tạo tài khoản người dùng",
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        _delete_auth_account(account["user_id"])
        raise HTTPException(status_code=500, detail="Không thể hoàn tất phân quyền cho tài khoản.") from exc
    return account


def create_student_login(
    student_id: str,
    email: str,
    actor_id: str,
    password: Optional[str] = None,
    expected_class_id: Optional[str] = None,
) -> dict:
    supabase = get_supabase()

    student_resp = supabase.table("students").select("full_name").eq("id", student_id).limit(1).execute()
    if not student_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    _ensure_student_in_class(supabase, student_id, expected_class_id)
    full_name = student_resp.data[0]["full_name"]

    existing = supabase.table("student_user_link").select("student_id").eq("student_id", student_id).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Học sinh này đã có tài khoản đăng nhập.")

    account = create_auth_account(email, full_name, password)
    try:
        supabase.table("student_user_link").insert(
            {"student_id": student_id, "user_id": account["user_id"]}
        ).execute()
        supabase.table("user_roles").insert({"user_id": account["user_id"], "role": "student"}).execute()
        # Tài khoản học sinh do nhà trường cấp phải đổi mật khẩu trước khi
        # được sử dụng các chức năng khác của cổng học sinh.
        supabase.table("profiles").update({"must_change_password": True}).eq(
            "id", account["user_id"]
        ).execute()
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "CREATE",
                "entity": "student_user_link",
                "entity_id": student_id,
                "after_data": {"email": email},
                "reason": "Tạo tài khoản đăng nhập cho học sinh",
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        _delete_auth_account(account["user_id"])
        raise HTTPException(status_code=500, detail="Không thể liên kết tài khoản với học sinh.") from exc
    return account


def list_class_student_accounts(class_id: str) -> list[dict]:
    """Danh sách tài khoản của các học sinh đang học trong một lớp."""
    supabase = get_supabase()
    enrollment_resp = (
        supabase.table("student_class_enrollments")
        .select("student_id, students(id, student_code, full_name)")
        .eq("class_id", class_id)
        .is_("left_at", None)
        .execute()
    )
    students = [row["students"] for row in (enrollment_resp.data or []) if row.get("students")]
    student_ids = [student["id"] for student in students]
    links_by_student: dict[str, str] = {}
    if student_ids:
        link_resp = (
            supabase.table("student_user_link")
            .select("student_id, user_id")
            .in_("student_id", student_ids)
            .execute()
        )
        links_by_student = {row["student_id"]: row["user_id"] for row in (link_resp.data or [])}

    auth_users: dict[str, object] = {}
    page = 1
    while True:
        users = supabase.auth.admin.list_users(page=page, per_page=1000)
        for auth_user in users:
            auth_users[auth_user.id] = auth_user
        if len(users) < 1000:
            break
        page += 1

    result: list[dict] = []
    for student in students:
        user_id = links_by_student.get(student["id"])
        auth_user = auth_users.get(user_id or "")
        result.append(
            {
                "student_id": student["id"],
                "student_code": student.get("student_code"),
                "full_name": student["full_name"],
                "account": None
                if not user_id
                else {
                    "user_id": user_id,
                    "email": getattr(auth_user, "email", None) or "Không lấy được email",
                    "created_at": getattr(auth_user, "created_at", None),
                    "last_sign_in_at": getattr(auth_user, "last_sign_in_at", None),
                },
            }
        )
    result.sort(key=lambda item: (str(item.get("student_code") or ""), item["full_name"].casefold()))
    return result


def update_student_login(
    student_id: str,
    class_id: str,
    email: str,
    actor_id: str,
    password: Optional[str] = None,
) -> dict:
    supabase = get_supabase()
    _ensure_student_in_class(supabase, student_id, class_id)
    link_resp = (
        supabase.table("student_user_link")
        .select("user_id")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    if not link_resp.data:
        raise HTTPException(status_code=404, detail="Học sinh chưa có tài khoản để sửa.")
    user_id = link_resp.data[0]["user_id"]
    email = email.strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise HTTPException(status_code=422, detail="Email không hợp lệ.")
    if password and len(password) < 8:
        raise HTTPException(status_code=422, detail="Mật khẩu mới phải có ít nhất 8 ký tự.")
    roles_resp = supabase.table("user_roles").select("role").eq("user_id", user_id).execute()
    other_roles = [row["role"] for row in (roles_resp.data or []) if row["role"] != "student"]
    if other_roles:
        raise HTTPException(status_code=409, detail="Tài khoản còn vai trò khác nên GVCN không thể sửa.")

    try:
        before = _extract_user(supabase.auth.admin.get_user_by_id(user_id))
        attributes: dict = {"email": email, "email_confirm": True}
        if password:
            attributes["password"] = password
        updated = _extract_user(supabase.auth.admin.update_user_by_id(user_id, attributes))
        if password:
            supabase.table("profiles").update({"must_change_password": True}).eq("id", user_id).execute()
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Không thể cập nhật tài khoản: {exc}") from exc
    try:
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "UPDATE",
                "entity": "student_user_link",
                "entity_id": student_id,
                "before_data": {"email": before["email"]},
                "after_data": {"email": updated["email"], "password_reset": bool(password)},
                "reason": "GVCN cập nhật tài khoản học sinh",
            }
        ).execute()
    except Exception:  # noqa: BLE001
        pass
    return {"student_id": student_id, "user_id": user_id, "email": updated["email"]}


def delete_student_login(student_id: str, class_id: str, actor_id: str) -> dict:
    supabase = get_supabase()
    _ensure_student_in_class(supabase, student_id, class_id)
    link_resp = (
        supabase.table("student_user_link")
        .select("user_id")
        .eq("student_id", student_id)
        .limit(1)
        .execute()
    )
    if not link_resp.data:
        raise HTTPException(status_code=404, detail="Học sinh chưa có tài khoản để xóa.")
    user_id = link_resp.data[0]["user_id"]
    roles_resp = supabase.table("user_roles").select("role").eq("user_id", user_id).execute()
    other_roles = [row["role"] for row in (roles_resp.data or []) if row["role"] != "student"]
    if other_roles:
        raise HTTPException(status_code=409, detail="Tài khoản còn vai trò khác nên không thể xóa.")

    try:
        account = _extract_user(supabase.auth.admin.get_user_by_id(user_id))
        supabase.auth.admin.delete_user(user_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=422, detail=f"Không thể xóa tài khoản: {exc}") from exc
    try:
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "DELETE",
                "entity": "student_user_link",
                "entity_id": student_id,
                "before_data": {"email": account["email"]},
                "reason": "GVCN xóa tài khoản học sinh",
            }
        ).execute()
    except Exception:  # noqa: BLE001
        pass
    return {"success": True, "student_id": student_id}


def create_parent_login(
    student_id: str,
    email: str,
    full_name: str,
    relationship: str,
    actor_id: str,
    password: Optional[str] = None,
    expected_class_id: Optional[str] = None,
) -> dict:
    relationship = relationship.strip().lower()
    if relationship not in ("father", "mother", "guardian"):
        raise HTTPException(status_code=422, detail="Quan hệ phụ huynh không hợp lệ.")

    supabase = get_supabase()

    student_resp = supabase.table("students").select("id").eq("id", student_id).limit(1).execute()
    if not student_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    _ensure_student_in_class(supabase, student_id, expected_class_id)

    account = create_auth_account(email, full_name, password)
    try:
        supabase.table("parent_student_scope").insert(
            {"parent_id": account["user_id"], "student_id": student_id, "relationship": relationship}
        ).execute()
        supabase.table("user_roles").insert({"user_id": account["user_id"], "role": "parent"}).execute()
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "action": "CREATE",
                "entity": "parent_student_scope",
                "entity_id": student_id,
                "after_data": {"email": email, "relationship": relationship},
                "reason": "Tạo tài khoản đăng nhập cho phụ huynh",
            }
        ).execute()
    except Exception as exc:  # noqa: BLE001
        _delete_auth_account(account["user_id"])
        raise HTTPException(status_code=500, detail="Không thể liên kết tài khoản với phụ huynh.") from exc
    return account
