"""Accounts API routes."""
from fastapi import APIRouter
import re
from datetime import date
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from _lib.admin_engine import (
    TEACHER_ROLES,
    activate_academic_term,
    assign_homeroom_teacher,
    create_academic_term,
    create_class,
    create_parent_login,
    create_student_login,
    create_teacher_account,
    delete_student_login,
    delete_teacher_account,
    list_class_student_accounts,
    list_school_staff,
    reset_staff_password,
    revoke_teacher_access,
    update_student_login,
    homeroom_context,
)
from _lib.bulk_account_engine import (
    create_bulk_accounts,
    export_student_accounts_xlsx,
    preview_class_accounts,
)
from _lib.auth import (
    CurrentUser, get_current_user, require_class_role,
    require_principal_for_class, require_principal_for_year,
    require_principal_for_student, require_principal_for_term,
)
from _lib.supabase_client import get_supabase

router = APIRouter()


# ---------------------------------------------------------
# ADMIN: TẠO TÀI KHOẢN GIÁO VIÊN / HỌC SINH / PHỤ HUYNH
# ---------------------------------------------------------
class CreateTeacherBody(BaseModel):
    email: str
    full_name: str
    role: str  # homeroom_teacher | subject_teacher
    password: Optional[str] = None


@router.post("/api/admin/teachers")
def admin_create_teacher(body: CreateTeacherBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được tạo tài khoản giáo viên.")
    return create_teacher_account(body.email, body.full_name, body.role, user.user_id, body.password, user.school_id)


def _require_teacher_manager(user: CurrentUser) -> str:
    """Hiệu trưởng (hoặc admin cấp hệ thống đang chọn trường) của chính trường mình."""
    if not user.is_principal() or not user.school_id:
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được quản lý tài khoản giáo viên.")
    return user.school_id


@router.get("/api/admin/teachers")
def admin_list_teachers(user: CurrentUser = Depends(get_current_user)):
    return list_school_staff(_require_teacher_manager(user), list(TEACHER_ROLES))


class ResetTeacherPasswordBody(BaseModel):
    new_password: str


@router.put("/api/admin/teachers/{teacher_id}/password")
def admin_reset_teacher_password(
    teacher_id: str, body: ResetTeacherPasswordBody, user: CurrentUser = Depends(get_current_user),
):
    return reset_staff_password(_require_teacher_manager(user), teacher_id, body.new_password, user.user_id)


@router.post("/api/admin/teachers/{teacher_id}/revoke")
def admin_revoke_teacher(teacher_id: str, user: CurrentUser = Depends(get_current_user)):
    return revoke_teacher_access(_require_teacher_manager(user), teacher_id, user.user_id)


@router.delete("/api/admin/teachers/{teacher_id}")
def admin_delete_teacher(teacher_id: str, user: CurrentUser = Depends(get_current_user)):
    return delete_teacher_account(_require_teacher_manager(user), teacher_id, user.user_id)


class AssignHomeroomBody(BaseModel):
    teacher_id: Optional[str] = None
    academic_term_id: str


@router.post("/api/admin/classes/{class_id}/homeroom")
def admin_assign_homeroom(class_id: str, body: AssignHomeroomBody, user: CurrentUser = Depends(get_current_user)):
    require_principal_for_class(user, class_id)
    return assign_homeroom_teacher(class_id, body.academic_term_id, body.teacher_id, user.user_id)


@router.get("/api/homeroom/context")
def get_homeroom_context(user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal() and "homeroom_teacher" not in user.roles:
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho GVCN.")
    return homeroom_context(user.user_id, user.is_principal(), user.school_id)


class CreateClassBody(BaseModel):
    name: str
    grade_block_id: str
    school_year_id: str
    academic_term_id: str


@router.post("/api/admin/classes")
def admin_create_class(body: CreateClassBody, user: CurrentUser = Depends(get_current_user)):
    require_principal_for_year(user, body.school_year_id)
    return create_class(
        body.name,
        body.grade_block_id,
        body.school_year_id,
        body.academic_term_id,
        user.user_id,
    )


class CreateAcademicTermBody(BaseModel):
    school_year_id: str
    name: str
    term_number: int
    start_date: date
    end_date: date


@router.post("/api/admin/academic-terms")
def admin_create_academic_term(body: CreateAcademicTermBody, user: CurrentUser = Depends(get_current_user)):
    require_principal_for_year(user, body.school_year_id)
    return create_academic_term(
        body.school_year_id, body.name, body.term_number, body.start_date, body.end_date, user.user_id
    )


@router.post("/api/admin/academic-terms/{term_id}/activate")
def admin_activate_academic_term(term_id: str, user: CurrentUser = Depends(get_current_user)):
    require_principal_for_term(user, term_id)
    return activate_academic_term(term_id, user.user_id)


class CreateStudentLoginBody(BaseModel):
    student_id: str
    class_id: str  # dùng để kiểm tra quyền GVCN
    email: str
    password: Optional[str] = None


@router.post("/api/homeroom/students/create-login")
def homeroom_create_student_login(body: CreateStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return create_student_login(body.student_id, body.email, user.user_id, body.password, body.class_id)


@router.get("/api/homeroom/students/accounts")
def homeroom_list_student_accounts(class_id: str, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher"])
    return list_class_student_accounts(class_id)


class UpdateStudentLoginBody(BaseModel):
    student_id: str
    class_id: str
    email: str
    password: Optional[str] = None


@router.post("/api/homeroom/students/update-login")
def homeroom_update_student_login(body: UpdateStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return update_student_login(body.student_id, body.class_id, body.email, user.user_id, body.password)


class DeleteStudentLoginBody(BaseModel):
    student_id: str
    class_id: str


@router.post("/api/homeroom/students/delete-login")
def homeroom_delete_student_login(body: DeleteStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return delete_student_login(body.student_id, body.class_id, user.user_id)


class BulkStudentAccountsPreviewBody(BaseModel):
    class_id: str


@router.post("/api/homeroom/students/accounts/bulk/preview")
def homeroom_preview_student_accounts(
    body: BulkStudentAccountsPreviewBody,
    user: CurrentUser = Depends(get_current_user),
):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return preview_class_accounts(body.class_id)


class ExportStudentAccountsBody(BaseModel):
    class_id: str


@router.post("/api/homeroom/students/accounts/export")
def homeroom_export_student_accounts(body: ExportStudentAccountsBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return export_student_accounts_xlsx(body.class_id)


class BulkStudentAccountsBody(BaseModel):
    class_id: str
    rows: list[dict]


@router.post("/api/homeroom/students/accounts/bulk/confirm")
def homeroom_create_bulk_student_accounts(
    body: BulkStudentAccountsBody, user: CurrentUser = Depends(get_current_user)
):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    if not body.rows:
        raise HTTPException(status_code=422, detail="Chưa chọn học sinh cần tạo tài khoản.")
    if len(body.rows) > 1000:
        raise HTTPException(status_code=422, detail="Mỗi lần chỉ được tạo tối đa 1.000 tài khoản.")
    return create_bulk_accounts(body.class_id, body.rows, user.user_id)


class ChangePasswordBody(BaseModel):
    new_password: str


@router.post("/api/student/change-password")
def student_change_password(body: ChangePasswordBody, user: CurrentUser = Depends(get_current_user)):
    if "student" not in user.roles:
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho học sinh.")
    password = body.new_password
    if len(password) < 8 or not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise HTTPException(
            status_code=422,
            detail="Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ và số.",
        )

    supabase = get_supabase()
    try:
        supabase.auth.admin.update_user_by_id(user.user_id, {"password": password})
        supabase.table("profiles").update({"must_change_password": False}).eq("id", user.user_id).execute()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail="Không thể đổi mật khẩu. Vui lòng thử lại.") from exc
    try:
        supabase.table("audit_logs").insert(
            {
                "actor_id": user.user_id,
                "action": "UPDATE",
                "entity": "profiles",
                "entity_id": user.user_id,
                "after_data": {"must_change_password": False},
                "reason": "Học sinh đổi mật khẩu lần đầu",
            }
        ).execute()
    except Exception:  # noqa: BLE001
        # Mật khẩu và cờ bảo mật đã cập nhật thành công; lỗi ghi nhật ký không
        # được khiến học sinh hiểu nhầm rằng phải thực hiện lại thao tác.
        pass
    return {"success": True}


class CreateParentLoginBody(BaseModel):
    student_id: str
    class_id: str
    email: str
    full_name: str
    relationship: str = "guardian"
    password: Optional[str] = None


@router.post("/api/homeroom/parents/create-login")
def homeroom_create_parent_login(body: CreateParentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return create_parent_login(
        body.student_id, body.email, body.full_name, body.relationship, user.user_id, body.password, body.class_id
    )


# --- ADMIN: tạo tài khoản học sinh / phụ huynh (dành cho Hiệu trưởng/BGH) ---
class AdminCreateStudentLoginBody(BaseModel):
    student_id: str
    email: str
    password: Optional[str] = None


@router.post("/api/admin/students/create-login")
def admin_create_student_login(body: AdminCreateStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_principal_for_student(user, body.student_id)
    return create_student_login(body.student_id, body.email, user.user_id, body.password)


class AdminCreateParentLoginBody(BaseModel):
    student_id: str
    email: str
    full_name: str
    relationship: str = "guardian"
    password: Optional[str] = None


@router.post("/api/admin/parents/create-login")
def admin_create_parent_login(body: AdminCreateParentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_principal_for_student(user, body.student_id)
    return create_parent_login(body.student_id, body.email, body.full_name, body.relationship, user.user_id, body.password)
