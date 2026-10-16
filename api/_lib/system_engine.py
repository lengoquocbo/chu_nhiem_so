"""Trusted service-key operations for platform administrators."""
import re
import unicodedata

from fastapi import HTTPException

from .admin_engine import _delete_auth_account, create_auth_account, list_school_staff
from .supabase_client import get_supabase


def list_schools() -> list[dict]:
    response = get_supabase().table("schools").select("id,slug,name,created_at").order("name").execute()
    return response.data or []


def _school_slug(name: str) -> str:
    normalized = unicodedata.normalize("NFKD", name.replace("Đ", "D").replace("đ", "d"))
    ascii_name = "".join(char for char in normalized if not unicodedata.combining(char))
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:80].rstrip("-")


def create_school(name: str, actor_id: str) -> dict:
    name = name.strip()
    if not name or len(name) > 160:
        raise HTTPException(status_code=422, detail="Tên trường phải có từ 1 đến 160 ký tự.")
    base_slug = _school_slug(name)
    if not base_slug:
        raise HTTPException(status_code=422, detail="Tên trường cần có chữ cái hoặc chữ số để tạo mã trường.")

    db = get_supabase()
    for number in range(1, 1001):
        suffix = f"-{number}" if number > 1 else ""
        slug = base_slug[:80 - len(suffix)].rstrip("-") + suffix
        try:
            rows = db.table("schools").insert({"name": name, "slug": slug}).execute().data or []
            break
        except Exception as exc:  # noqa: BLE001
            if getattr(exc, "code", None) == "23505":
                continue
            raise HTTPException(status_code=500, detail="Không thể tạo trường.") from exc
    else:
        raise HTTPException(status_code=409, detail="Không tìm được mã trường chưa sử dụng.")
    if not rows:
        raise HTTPException(status_code=500, detail="Không nhận được thông tin trường vừa tạo.")
    school = rows[0]
    try:
        db.table("audit_logs").insert({
            "actor_id": actor_id,
            "school_id": school["id"],
            "action": "CREATE",
            "entity": "schools",
            "entity_id": school["id"],
            "after_data": {"name": name, "slug": slug},
            "reason": "Admin cấp hệ thống tạo trường",
        }).execute()
    except Exception as exc:  # noqa: BLE001
        try:
            db.table("schools").delete().eq("id", school["id"]).execute()
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(status_code=500, detail="Không ghi được nhật ký tạo trường.") from exc
    return school


def create_principal_account(school_id: str, email: str, full_name: str, password: str, actor_id: str) -> dict:
    if len(password) < 12 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(status_code=422, detail="Mật khẩu hiệu trưởng cần ít nhất 12 ký tự, gồm chữ và số.")
    db = get_supabase()
    schools = db.table("schools").select("id").eq("id", school_id).limit(1).execute().data or []
    if not schools:
        raise HTTPException(status_code=404, detail="Không tìm thấy trường.")

    account = create_auth_account(email, full_name, password)
    try:
        db.table("staff_school_assignments").insert({
            "user_id": account["user_id"], "school_id": school_id,
        }).execute()
        db.table("user_roles").insert({"user_id": account["user_id"], "role": "principal"}).execute()
        db.table("audit_logs").insert({
            "actor_id": actor_id,
            "school_id": school_id,
            "action": "CREATE",
            "entity": "user_roles",
            "entity_id": account["user_id"],
            "after_data": {"email": account["email"], "role": "principal", "school_id": school_id},
            "reason": "Admin cấp hệ thống tạo hiệu trưởng",
        }).execute()
    except Exception as exc:  # noqa: BLE001
        _delete_auth_account(account["user_id"])
        raise HTTPException(status_code=500, detail="Không thể hoàn tất tài khoản hiệu trưởng.") from exc
    return {"user_id": account["user_id"], "email": account["email"]}


def list_school_principals(school_id: str) -> list[dict]:
    """Lấy danh sách tài khoản hiệu trưởng của một trường."""
    db = get_supabase()
    schools = db.table("schools").select("id").eq("id", school_id).limit(1).execute().data or []
    if not schools:
        raise HTTPException(status_code=404, detail="Không tìm thấy trường.")
    return list_school_staff(school_id, ["principal"])


def update_principal_password(
    school_id: str, user_id: str, new_password: str, actor_id: str,
) -> dict:
    """Cập nhật mật khẩu cho tài khoản hiệu trưởng."""
    if (
        len(new_password) < 12
        or not re.search(r"[A-Za-z]", new_password)
        or not re.search(r"\d", new_password)
    ):
        raise HTTPException(
            status_code=422,
            detail="Mật khẩu hiệu trưởng cần ít nhất 12 ký tự, gồm chữ và số.",
        )
    db = get_supabase()
    _require_principal_of_school(db, school_id, user_id)

    try:
        db.auth.admin.update_user_by_id(user_id, {"password": new_password})
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Không thể cập nhật mật khẩu: {exc}"
        ) from exc

    try:
        db.table("audit_logs").insert({
            "actor_id": actor_id,
            "school_id": school_id,
            "action": "UPDATE",
            "entity": "auth_users",
            "entity_id": user_id,
            "after_data": {"password_changed": True},
            "reason": "Admin cấp hệ thống đổi mật khẩu hiệu trưởng",
        }).execute()
    except Exception:  # noqa: BLE001
        pass
    return {"success": True, "user_id": user_id}


def delete_principal_account(
    school_id: str, user_id: str, actor_id: str,
) -> dict:
    """Xóa tài khoản hiệu trưởng khỏi trường."""
    db = get_supabase()
    _require_principal_of_school(db, school_id, user_id)

    # Kiểm tra user có role khác không
    all_roles = (
        db.table("user_roles").select("role")
        .eq("user_id", user_id).execute().data or []
    )
    other_roles = [r["role"] for r in all_roles if r["role"] != "principal"]
    if other_roles:
        raise HTTPException(
            status_code=409,
            detail="Tài khoản còn vai trò khác nên không thể xóa.",
        )

    # Lấy email trước khi xóa
    email = _get_auth_email(db, user_id)

    try:
        db.auth.admin.delete_user(user_id)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=500, detail=f"Không thể xóa tài khoản: {exc}"
        ) from exc

    try:
        db.table("audit_logs").insert({
            "actor_id": actor_id,
            "school_id": school_id,
            "action": "DELETE",
            "entity": "user_roles",
            "entity_id": user_id,
            "before_data": {
                "email": email, "role": "principal",
                "school_id": school_id,
            },
            "reason": "Admin cấp hệ thống xóa tài khoản hiệu trưởng",
        }).execute()
    except Exception:  # noqa: BLE001
        pass
    return {"success": True, "user_id": user_id}


# --------------- helpers ---------------

def _get_auth_email(db, user_id: str) -> str:
    try:
        auth_user = db.auth.admin.get_user_by_id(user_id)
        user_obj = getattr(auth_user, "user", auth_user)
        return (
            getattr(user_obj, "email", None)
            or (user_obj.get("email") if isinstance(user_obj, dict) else None)
            or ""
        )
    except Exception:  # noqa: BLE001
        return ""


def _require_principal_of_school(db, school_id: str, user_id: str) -> None:
    schools = (
        db.table("schools").select("id")
        .eq("id", school_id).limit(1).execute().data or []
    )
    if not schools:
        raise HTTPException(status_code=404, detail="Không tìm thấy trường.")
    assignment = (
        db.table("staff_school_assignments").select("user_id")
        .eq("user_id", user_id).eq("school_id", school_id)
        .limit(1).execute().data or []
    )
    if not assignment:
        raise HTTPException(
            status_code=404, detail="Hiệu trưởng không thuộc trường này.",
        )
    role_check = (
        db.table("user_roles").select("user_id")
        .eq("user_id", user_id).eq("role", "principal")
        .limit(1).execute().data or []
    )
    if not role_check:
        raise HTTPException(
            status_code=404,
            detail="Tài khoản không có vai trò hiệu trưởng.",
        )
