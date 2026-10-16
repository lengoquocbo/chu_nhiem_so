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


def homeroom_context(user_id: str, is_principal: bool = False, school_id: str | None = None) -> dict:
    """Các phạm vi năm học - học kỳ - lớp mà GVCN thực sự được phân công."""
    db = get_supabase()
    if is_principal:
        year_rows = db.table("school_years").select("id").eq("school_id", school_id).execute().data or []
        year_ids = [row["id"] for row in year_rows]
        class_rows = db.table("classes").select("id").in_("school_year_id", year_ids).execute().data or [] if year_ids else []
        class_ids = [row["id"] for row in class_rows]
        rows = (
            db.table("class_academic_terms").select(
                "id,class_id,academic_term_id,classes(id,name,class_code,school_year_id,school_years(id,name,status,school_id)),academic_terms(id,name,term_number,start_date,end_date,status,school_year_id)"
            ).in_("class_id", class_ids).eq("status", "active").execute().data or []
        ) if class_ids else []
    else:
        assignments = db.table("homeroom_term_assignments").select(
            "class_academic_terms!inner(id,class_id,academic_term_id,status,classes(id,name,class_code,school_year_id,school_years(id,name,status,school_id)),academic_terms(id,name,term_number,start_date,end_date,status,school_year_id))"
        ).eq("teacher_id", user_id).eq("status", "active").eq("class_academic_terms.status", "active").execute().data or []
        rows = [row["class_academic_terms"] for row in assignments]
    scopes = []
    for row in rows:
        class_row = row.get("classes") or {}
        term = row.get("academic_terms") or {}
        year = class_row.get("school_years") or {}
        if year.get("school_id") != school_id:
            continue
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


def _auth_users_by_id(user_ids: list[str]) -> dict[str, object]:
    """Bản đồ user_id -> auth user, để lấy email/created_at/last_sign_in_at.

    auth.admin không có API tra nhiều user theo id, nên phân trang một lượt
    thay vì gọi get_user_by_id cho từng người.
    """
    if not user_ids:
        return {}
    wanted = set(user_ids)
    supabase = get_supabase()
    found: dict[str, object] = {}
    page = 1
    while True:
        users = supabase.auth.admin.list_users(page=page, per_page=1000)
        for auth_user in users:
            if auth_user.id in wanted:
                found[auth_user.id] = auth_user
        if len(found) == len(wanted) or len(users) < 1000:
            break
        page += 1
    return found


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
    email: str, full_name: str, role: str, actor_id: str, password: Optional[str] = None,
    school_id: str | None = None,
) -> dict:
    if role not in ("homeroom_teacher", "subject_teacher"):
        raise HTTPException(status_code=422, detail="role không hợp lệ.")
    if not school_id:
        raise HTTPException(status_code=403, detail="Hiệu trưởng chưa được gắn với trường.")

    supabase = get_supabase()
    account = create_auth_account(email, full_name, password)
    try:
        supabase.table("staff_school_assignments").insert({
            "user_id": account["user_id"], "school_id": school_id,
        }).execute()
        supabase.table("user_roles").insert({"user_id": account["user_id"], "role": role}).execute()
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "school_id": school_id,
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

    student_resp = supabase.table("students").select("full_name, school_id").eq("id", student_id).limit(1).execute()
    if not student_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    _ensure_student_in_class(supabase, student_id, expected_class_id)
    full_name = student_resp.data[0]["full_name"]
    school_id = student_resp.data[0].get("school_id")

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
                "school_id": school_id,
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

    auth_users = _auth_users_by_id([user_id for user_id in links_by_student.values() if user_id])

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

    student_resp = supabase.table("students").select("id, school_id").eq("id", student_id).limit(1).execute()
    if not student_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy học sinh.")
    _ensure_student_in_class(supabase, student_id, expected_class_id)
    school_id = student_resp.data[0].get("school_id")

    account = create_auth_account(email, full_name, password)
    try:
        supabase.table("parent_student_scope").insert(
            {"parent_id": account["user_id"], "student_id": student_id, "relationship": relationship}
        ).execute()
        supabase.table("user_roles").insert({"user_id": account["user_id"], "role": "parent"}).execute()
        supabase.table("audit_logs").insert(
            {
                "actor_id": actor_id,
                "school_id": school_id,
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


# ---------------------------------------------------------
# QUẢN LÝ TÀI KHOẢN NHÂN SỰ CỦA MỘT TRƯỜNG
# ---------------------------------------------------------
TEACHER_ROLES = ("homeroom_teacher", "subject_teacher")

# Thứ tự hiển thị vai trò trong danh sách tài khoản.
_ROLE_ORDER = ("system_admin", "principal", "homeroom_teacher", "subject_teacher", "student", "parent")

# Giáo viên chỉ xóa được khi chưa từng tạo dữ liệu giảng dạy. Các bảng này trỏ
# profiles(id) KHÔNG có ON DELETE CASCADE, nên xóa tài khoản sẽ vi phạm khóa
# ngoại. (class_subject_teachers và homeroom_term_assignments thì cascade.)
_TEACHER_HISTORY = (
    ("classes", "homeroom_teacher_id", "đang là GVCN của lớp"),
    ("attendance_sessions", "teacher_id", "phiên điểm danh"),
    ("timetable_entries", "teacher_id", "tiết trong thời khóa biểu"),
    ("lesson_book_entries", "teacher_id", "tiết trong sổ đầu bài"),
    ("assessment_scores", "teacher_id", "điểm đánh giá"),
)


def _audit(
    db, *, actor_id: str, school_id: Optional[str], action: str, entity: str,
    entity_id: str, reason: str, before: Optional[dict] = None, after: Optional[dict] = None,
) -> None:
    """Ghi nhật ký thao tác quản trị.

    school_id luôn được set tường minh: trigger set_audit_school() chỉ suy ra
    được từ staff_school_assignments của actor, nên thao tác của admin cấp hệ
    thống đang chọn trường sẽ bị bỏ trống và hiệu trưởng không đọc được.
    Lỗi ghi nhật ký không được làm hỏng thao tác chính.
    """
    payload: dict = {
        "actor_id": actor_id, "school_id": school_id, "action": action,
        "entity": entity, "entity_id": entity_id, "reason": reason,
    }
    if before is not None:
        payload["before_data"] = before
    if after is not None:
        payload["after_data"] = after
    try:
        db.table("audit_logs").insert(payload).execute()
    except Exception:  # noqa: BLE001
        pass


def _require_teacher_of_school(supabase, school_id: str, user_id: str) -> list[str]:
    """Xác nhận user là giáo viên thuộc đúng trường, trả về danh sách vai trò."""
    assignment = (
        supabase.table("staff_school_assignments").select("user_id")
        .eq("user_id", user_id).eq("school_id", school_id)
        .limit(1).execute().data or []
    )
    if not assignment:
        raise HTTPException(status_code=404, detail="Không tìm thấy giáo viên trong trường.")
    roles = [
        row["role"]
        for row in (supabase.table("user_roles").select("role").eq("user_id", user_id).execute().data or [])
    ]
    if not set(roles).intersection(TEACHER_ROLES):
        raise HTTPException(status_code=404, detail="Tài khoản này không phải giáo viên của trường.")
    return roles


def list_school_staff(school_id: str, roles: Optional[list[str]] = None) -> list[dict]:
    """Tài khoản nhân sự của một trường, kèm email đăng nhập và vai trò.

    `roles` giới hạn kết quả theo vai trò (VD: chỉ hiệu trưởng). Truyền None
    để lấy toàn bộ nhân sự.
    """
    supabase = get_supabase()
    assignments = (
        supabase.table("staff_school_assignments")
        .select("user_id, profiles(id, full_name, created_at)")
        .eq("school_id", school_id)
        .execute()
        .data or []
    )
    user_ids = [row["user_id"] for row in assignments if row.get("user_id")]
    if not user_ids:
        return []

    roles_by_user: dict[str, list[str]] = {}
    for row in (
        supabase.table("user_roles").select("user_id, role").in_("user_id", user_ids).execute().data or []
    ):
        roles_by_user.setdefault(row["user_id"], []).append(row["role"])

    wanted = set(roles) if roles else None
    auth_users = _auth_users_by_id(user_ids)

    result: list[dict] = []
    for assignment in assignments:
        user_id = assignment.get("user_id")
        if not user_id:
            continue
        user_roles = sorted(roles_by_user.get(user_id, []), key=lambda role: _ROLE_ORDER.index(role) if role in _ROLE_ORDER else len(_ROLE_ORDER))
        if wanted is not None and not wanted.intersection(user_roles):
            continue
        profile = assignment.get("profiles") or {}
        auth_user = auth_users.get(user_id)
        result.append({
            "user_id": user_id,
            "email": getattr(auth_user, "email", None) or "",
            "full_name": profile.get("full_name", ""),
            "roles": user_roles,
            "created_at": getattr(auth_user, "created_at", None) or profile.get("created_at", ""),
            "last_sign_in_at": getattr(auth_user, "last_sign_in_at", None),
        })

    result.sort(key=lambda item: (item["full_name"].casefold(), item["user_id"]))
    return result


def reset_staff_password(school_id: str, user_id: str, new_password: str, actor_id: str) -> dict:
    """Đặt mật khẩu mới cho một tài khoản giáo viên trong trường."""
    if len(new_password or "") < 8 or not new_password.strip():
        raise HTTPException(status_code=422, detail="Mật khẩu mới phải có ít nhất 8 ký tự.")
    supabase = get_supabase()
    _require_teacher_of_school(supabase, school_id, user_id)

    try:
        supabase.auth.admin.update_user_by_id(user_id, {"password": new_password})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Không thể cập nhật mật khẩu giáo viên.") from exc

    _audit(
        supabase, actor_id=actor_id, school_id=school_id, action="UPDATE",
        entity="auth_users", entity_id=user_id,
        after={"password_changed": True}, reason="Hiệu trưởng đổi mật khẩu giáo viên",
    )
    return {"success": True, "user_id": user_id}


def _teacher_history_blockers(supabase, user_id: str) -> list[str]:
    """Dữ liệu giảng dạy còn trỏ tới giáo viên, khiến không thể xóa tài khoản."""
    blockers: list[str] = []
    for table, column, label in _TEACHER_HISTORY:
        rows = supabase.table(table).select("id").eq(column, user_id).limit(1).execute().data or []
        if rows:
            blockers.append(label)
    return blockers


def delete_teacher_account(school_id: str, user_id: str, actor_id: str) -> dict:
    """Xóa hẳn tài khoản giáo viên chưa có dữ liệu giảng dạy."""
    supabase = get_supabase()
    roles = _require_teacher_of_school(supabase, school_id, user_id)
    if set(roles).difference(TEACHER_ROLES):
        raise HTTPException(
            status_code=409,
            detail="Tài khoản còn vai trò khác nên không thể xóa.",
        )

    blockers = _teacher_history_blockers(supabase, user_id)
    if blockers:
        raise HTTPException(
            status_code=409,
            detail="Giáo viên còn " + ", ".join(blockers)
            + " nên không thể xóa. Hãy dùng chức năng Thu hồi quyền truy cập để giữ lại lịch sử.",
        )

    try:
        supabase.auth.admin.delete_user(user_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Không thể xóa tài khoản giáo viên.") from exc

    _audit(
        supabase, actor_id=actor_id, school_id=school_id, action="DELETE",
        entity="user_roles", entity_id=user_id,
        before={"roles": roles}, reason="Hiệu trưởng xóa tài khoản giáo viên",
    )
    return {"success": True, "user_id": user_id}


def revoke_teacher_access(school_id: str, user_id: str, actor_id: str) -> dict:
    """Thu hồi quyền truy cập nhưng giữ hồ sơ và lịch sử giảng dạy.

    Dùng cho giáo viên đã nghỉ nhưng còn điểm danh/sổ đầu bài: gỡ vai trò và
    phân công trường, giữ nguyên profiles cùng toàn bộ dữ liệu tham chiếu.
    """
    supabase = get_supabase()
    roles = _require_teacher_of_school(supabase, school_id, user_id)

    year_ids = [
        row["id"]
        for row in (supabase.table("school_years").select("id").eq("school_id", school_id).execute().data or [])
    ]
    homeroom = []
    if year_ids:
        homeroom = (
            supabase.table("classes").select("id, name")
            .in_("school_year_id", year_ids).eq("homeroom_teacher_id", user_id)
            .limit(1).execute().data or []
        )
    if homeroom:
        raise HTTPException(
            status_code=409,
            detail=f"Giáo viên đang là GVCN của lớp {homeroom[0]['name']}. "
                   "Hãy phân công GVCN khác trước khi thu hồi quyền.",
        )

    removed = [role for role in roles if role in TEACHER_ROLES]
    try:
        supabase.table("user_roles").delete().eq("user_id", user_id).in_("role", list(TEACHER_ROLES)).execute()
        supabase.table("staff_school_assignments").delete()\
            .eq("user_id", user_id).eq("school_id", school_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Không thể thu hồi quyền truy cập.") from exc

    _audit(
        supabase, actor_id=actor_id, school_id=school_id, action="REVOKE",
        entity="user_roles", entity_id=user_id,
        before={"roles": removed}, reason="Hiệu trưởng thu hồi quyền truy cập giáo viên",
    )
    return {"success": True, "user_id": user_id, "removed_roles": removed}
