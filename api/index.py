"""
Entry point duy nhất cho Vercel Python Serverless Function.
Mọi request /api/* được route vào đây (xem vercel.json).
"""
import json
import re
from datetime import date
from typing import Optional

import httpx
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from starlette.responses import JSONResponse

from _lib.admin_engine import (
    activate_academic_term,
    assign_homeroom_teacher,
    create_academic_term,
    create_class,
    create_parent_login,
    create_student_login,
    create_teacher_account,
    delete_student_login,
    list_class_student_accounts,
    update_student_login,
    homeroom_context,
)
from _lib.attendance_engine import AttendanceRecordInput, get_or_create_session, submit_attendance
from _lib.assessment_engine import (
    assessment_score_detail,
    create_fifteen_minute_score,
    create_oral_score,
    list_assessment_scores,
    oral_student_info,
    random_oral_student,
    student_gradebook,
    update_assessment_score,
)
from _lib.bulk_account_engine import create_bulk_accounts, export_student_accounts_xlsx, preview_class_accounts
from _lib.class_communication_engine import (
    communication_context,
    create_feedback,
    create_forum_post,
    list_feedback,
    list_forum,
    mark_read,
    review_feedback,
    review_forum_post,
    unread_counts,
)
from _lib.auth import (
    CurrentUser,
    get_current_user,
    get_user_class_scope,
    require_active_student_in_class,
    require_class_role,
    require_record_class,
    require_group_access,
    require_homeroom_term_access,
    require_student_record_scope,
    require_student_access,
    require_subject_assignment,
    require_subject_term_access,
)
from _lib.import_engine import confirm_import, parse_and_validate
from _lib.lesson_book_engine import (
    attendance_detail,
    count_pending_unlock_requests,
    list_lessons,
    list_timetable,
    list_unlock_requests,
    remove_timetable_entry,
    request_extra_lesson,
    request_week_unlock,
    revise_student_criteria,
    review_extra_lesson,
    review_unlock_request,
    save_attendance,
    save_timetable_entry,
    timetable_options,
    update_lesson,
)
from _lib.notification_engine import process_pending_notifications
from _lib.parent_report_engine import get_report_workspace, save_report_config, send_if_auto, send_week_reports
from _lib.officer_engine import (
    confirm_officer_transaction,
    my_officer_access,
    officer_workspace,
    save_officer_permissions,
    validate_officer_event,
    validate_officer_score_approval,
)
from _lib.report_engine import compute_period_summary, group_report, student_history, weekly_class_report
from _lib.score_engine import RecordEventInput, approve_transaction, adjust_transaction, record_student_event
from _lib.supabase_client import get_supabase
from _lib.week_engine import compute_weekly_summary, create_week, lock_week, unlock_week, update_week
from _lib.teacher_engine import join_class_by_code, subject_teacher_context

app = FastAPI(title="Class Management API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # TODO: giới hạn lại domain thật khi deploy production
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(httpx.TransportError)
def handle_upstream_transport_error(_request, exc: httpx.TransportError):
    """Supabase ngắt kết nối tạm thời là 503 có thể thử lại, không phải lỗi ứng dụng 500."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Kết nối dữ liệu tạm thời bị gián đoạn. Vui lòng thử lại sau vài giây."},
        headers={"Retry-After": "1"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ---------------------------------------------------------
# DIỄN ĐÀN THÔNG BÁO / GÓP Ý ẨN DANH
# ---------------------------------------------------------
@app.get("/api/communications/context")
def communications_context(user: CurrentUser = Depends(get_current_user)):
    return communication_context(user.user_id, user.is_principal())


@app.get("/api/communications/unread")
def communications_unread(class_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    return unread_counts(user.user_id, user.is_principal(), class_id)


@app.get("/api/communications/forum")
def communications_forum(class_id: str, user: CurrentUser = Depends(get_current_user)):
    return list_forum(user.user_id, class_id, user.is_principal())


class ForumPostBody(BaseModel):
    class_id: str
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=5000)


@app.post("/api/communications/forum/create")
def communications_forum_create(body: ForumPostBody, user: CurrentUser = Depends(get_current_user)):
    return create_forum_post(user.user_id, body.class_id, body.title, body.content, user.is_principal())


class ForumReviewBody(BaseModel):
    class_id: str
    post_id: str
    approve: bool
    reason: Optional[str] = None


@app.post("/api/communications/forum/review")
def communications_forum_review(body: ForumReviewBody, user: CurrentUser = Depends(get_current_user)):
    return review_forum_post(user.user_id, body.class_id, body.post_id, body.approve, body.reason, user.is_principal())


@app.get("/api/communications/feedback")
def communications_feedback(class_id: str, user: CurrentUser = Depends(get_current_user)):
    return list_feedback(user.user_id, class_id, user.is_principal())


class FeedbackCreateBody(BaseModel):
    class_id: str
    content: str = Field(min_length=1, max_length=5000)


@app.post("/api/communications/feedback/create")
def communications_feedback_create(body: FeedbackCreateBody, user: CurrentUser = Depends(get_current_user)):
    if "student" not in user.roles:
        raise HTTPException(status_code=403, detail="Chỉ học sinh được gửi góp ý ẩn danh.")
    return create_feedback(user.user_id, body.class_id, body.content)


class FeedbackReviewBody(BaseModel):
    class_id: str
    feedback_id: str
    approve: bool


@app.post("/api/communications/feedback/review")
def communications_feedback_review(body: FeedbackReviewBody, user: CurrentUser = Depends(get_current_user)):
    return review_feedback(user.user_id, body.class_id, body.feedback_id, body.approve, user.is_principal())


class MarkContentReadBody(BaseModel):
    class_id: str
    content_type: str
    content_ids: list[str]


@app.post("/api/communications/read")
def communications_mark_read(body: MarkContentReadBody, user: CurrentUser = Depends(get_current_user)):
    return mark_read(user.user_id, body.class_id, body.content_type, body.content_ids, user.is_principal())


# ---------------------------------------------------------
# ADMIN: TẠO TÀI KHOẢN GIÁO VIÊN / HỌC SINH / PHỤ HUYNH
# ---------------------------------------------------------
class CreateTeacherBody(BaseModel):
    email: str
    full_name: str
    role: str  # homeroom_teacher | subject_teacher | principal
    password: Optional[str] = None


@app.post("/api/admin/teachers")
def admin_create_teacher(body: CreateTeacherBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được tạo tài khoản giáo viên.")
    return create_teacher_account(body.email, body.full_name, body.role, user.user_id, body.password)


class AssignHomeroomBody(BaseModel):
    teacher_id: Optional[str] = None
    academic_term_id: str


@app.post("/api/admin/classes/{class_id}/homeroom")
def admin_assign_homeroom(class_id: str, body: AssignHomeroomBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được phân công GVCN.")
    return assign_homeroom_teacher(class_id, body.academic_term_id, body.teacher_id, user.user_id)


@app.get("/api/homeroom/context")
def get_homeroom_context(user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal() and "homeroom_teacher" not in user.roles:
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho GVCN.")
    return homeroom_context(user.user_id, user.is_principal())


class CreateClassBody(BaseModel):
    name: str
    grade_block_id: str
    school_year_id: str
    academic_term_id: str


@app.post("/api/admin/classes")
def admin_create_class(body: CreateClassBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được tạo lớp.")
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


@app.post("/api/admin/academic-terms")
def admin_create_academic_term(body: CreateAcademicTermBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được tạo học kỳ.")
    return create_academic_term(
        body.school_year_id, body.name, body.term_number, body.start_date, body.end_date, user.user_id
    )


@app.post("/api/admin/academic-terms/{term_id}/activate")
def admin_activate_academic_term(term_id: str, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được kích hoạt học kỳ.")
    return activate_academic_term(term_id, user.user_id)


class CreateStudentLoginBody(BaseModel):
    student_id: str
    class_id: str  # dùng để kiểm tra quyền GVCN
    email: str
    password: Optional[str] = None


@app.post("/api/homeroom/students/create-login")
def homeroom_create_student_login(body: CreateStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return create_student_login(body.student_id, body.email, user.user_id, body.password, body.class_id)


@app.get("/api/homeroom/students/accounts")
def homeroom_list_student_accounts(class_id: str, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher"])
    return list_class_student_accounts(class_id)


class UpdateStudentLoginBody(BaseModel):
    student_id: str
    class_id: str
    email: str
    password: Optional[str] = None


@app.post("/api/homeroom/students/update-login")
def homeroom_update_student_login(body: UpdateStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return update_student_login(body.student_id, body.class_id, body.email, user.user_id, body.password)


class DeleteStudentLoginBody(BaseModel):
    student_id: str
    class_id: str


@app.post("/api/homeroom/students/delete-login")
def homeroom_delete_student_login(body: DeleteStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return delete_student_login(body.student_id, body.class_id, user.user_id)


class BulkStudentAccountsPreviewBody(BaseModel):
    class_id: str


@app.post("/api/homeroom/students/accounts/bulk/preview")
def homeroom_preview_student_accounts(
    body: BulkStudentAccountsPreviewBody,
    user: CurrentUser = Depends(get_current_user),
):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return preview_class_accounts(body.class_id)


class ExportStudentAccountsBody(BaseModel):
    class_id: str


@app.post("/api/homeroom/students/accounts/export")
def homeroom_export_student_accounts(body: ExportStudentAccountsBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return export_student_accounts_xlsx(body.class_id)


class BulkStudentAccountsBody(BaseModel):
    class_id: str
    rows: list[dict]


@app.post("/api/homeroom/students/accounts/bulk/confirm")
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


@app.post("/api/student/change-password")
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


@app.post("/api/homeroom/parents/create-login")
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


@app.post("/api/admin/students/create-login")
def admin_create_student_login(body: AdminCreateStudentLoginBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được tạo tài khoản học sinh.")
    return create_student_login(body.student_id, body.email, user.user_id, body.password)


class AdminCreateParentLoginBody(BaseModel):
    student_id: str
    email: str
    full_name: str
    relationship: str = "guardian"
    password: Optional[str] = None


@app.post("/api/admin/parents/create-login")
def admin_create_parent_login(body: AdminCreateParentLoginBody, user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được tạo tài khoản phụ huynh.")
    return create_parent_login(body.student_id, body.email, body.full_name, body.relationship, user.user_id, body.password)


# ---------------------------------------------------------
# GHI NHẬN SỰ VIỆC (vi phạm / thành tích / nhiệm vụ / cộng-trừ)
# ---------------------------------------------------------
class RecordEventBody(BaseModel):
    student_id: str
    class_id: str
    event_type_code: str
    criteria_code: Optional[str] = None
    event_date: date
    period: Optional[int] = None
    subject_id: Optional[str] = None
    note: Optional[str] = None
    evidence_url: Optional[str] = None
    week_id: Optional[str] = None


@app.post("/api/events")
def create_event(body: RecordEventBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(
        user,
        body.class_id,
        allowed_roles=[
            "homeroom_teacher",
            "subject_teacher",
            "class_monitor",
            "vice_monitor",
            "group_leader",
        ],
    )
    require_active_student_in_class(body.student_id, body.class_id)
    require_student_record_scope(user, body.student_id, body.class_id)
    class_scope = get_user_class_scope(user.user_id, body.class_id)
    if not user.is_principal() and not any(role in class_scope for role in ("homeroom_teacher", "subject_teacher")):
        validate_officer_event(user.user_id, body.class_id, body.student_id, body.criteria_code)
    if body.week_id:
        require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    if body.subject_id:
        require_subject_assignment(user, body.class_id, body.subject_id)
    result = record_student_event(
        RecordEventInput(
            student_id=body.student_id,
            class_id=body.class_id,
            event_type_code=body.event_type_code,
            criteria_code=body.criteria_code,
            event_date=body.event_date,
            created_by=user.user_id,
            period=body.period,
            subject_id=body.subject_id,
            note=body.note,
            evidence_url=body.evidence_url,
            week_id=body.week_id,
        )
    )
    return result


# ---------------------------------------------------------
# BAN CÁN SỰ / PHÂN QUYỀN QUẢN LÝ LỚP
# ---------------------------------------------------------
class OfficerPermissionsBody(BaseModel):
    class_id: str
    officer_id: str
    permission_keys: list[str]


@app.post("/api/officers/permissions/save")
def officer_permissions_save(body: OfficerPermissionsBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return save_officer_permissions(body.officer_id, body.class_id, body.permission_keys, user.user_id)


@app.get("/api/officers/me")
def officer_me(user: CurrentUser = Depends(get_current_user)):
    return my_officer_access(user.user_id)


@app.get("/api/officers/workspace")
def officer_workspace_endpoint(class_id: str, week_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    return officer_workspace(user.user_id, class_id, week_id)


class OfficerConfirmBody(BaseModel):
    class_id: str
    transaction_id: str


@app.post("/api/officers/transactions/confirm")
def officer_transaction_confirm(body: OfficerConfirmBody, user: CurrentUser = Depends(get_current_user)):
    return confirm_officer_transaction(user.user_id, body.class_id, body.transaction_id)


# ---------------------------------------------------------
# DUYỆT ĐIỂM (GVCN / Hiệu trưởng / lớp trưởng được GVCN cấp quyền)
# ---------------------------------------------------------
class ApproveBody(BaseModel):
    transaction_id: str
    class_id: str


@app.post("/api/score/approve")
def approve(body: ApproveBody, user: CurrentUser = Depends(get_current_user)):
    class_scope = get_user_class_scope(user.user_id, body.class_id)
    if not user.is_principal() and "homeroom_teacher" not in class_scope:
        require_class_role(user, body.class_id, allowed_roles=["class_monitor"])
        validate_officer_score_approval(user.user_id, body.class_id, body.transaction_id)
    require_record_class("score_transactions", body.transaction_id, body.class_id, "giao dịch điểm")
    return approve_transaction(body.transaction_id, user.user_id)


class AdjustBody(BaseModel):
    transaction_id: str
    class_id: str
    adjusted_points: float
    reason: str


@app.post("/api/score/adjust")
def adjust(body: AdjustBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("score_transactions", body.transaction_id, body.class_id, "giao dịch điểm")
    return adjust_transaction(body.transaction_id, user.user_id, body.adjusted_points, body.reason)


# ---------------------------------------------------------
# TUẦN THI ĐUA: xem trước summary / chốt tuần / mở khóa
# ---------------------------------------------------------
class SaveWeekBody(BaseModel):
    class_id: str
    week_number: int
    start_date: date
    end_date: date
    criteria_ids: list[str]
    school_year_id: Optional[str] = None
    academic_term_id: Optional[str] = None
    week_id: Optional[str] = None


@app.post("/api/weeks/create")
def create_competition_week(body: SaveWeekBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    if not body.school_year_id or not body.academic_term_id:
        raise HTTPException(status_code=422, detail="Thiếu năm học hoặc học kỳ của tuần thi đua.")
    require_homeroom_term_access(user, body.class_id, body.academic_term_id)
    return create_week(
        body.class_id,
        body.school_year_id,
        body.academic_term_id,
        body.week_number,
        body.start_date,
        body.end_date,
        body.criteria_ids,
        user.user_id,
    )


@app.post("/api/weeks/update")
def update_competition_week(body: SaveWeekBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    if not body.week_id:
        raise HTTPException(status_code=422, detail="Thiếu tuần thi đua cần cập nhật.")
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    week_scope = get_supabase().table("competition_weeks").select("academic_term_id").eq("id", body.week_id).limit(1).execute().data[0]
    require_homeroom_term_access(user, body.class_id, week_scope["academic_term_id"])
    return update_week(
        body.week_id,
        body.class_id,
        body.week_number,
        body.start_date,
        body.end_date,
        body.criteria_ids,
        user.user_id,
    )


class WeekActionBody(BaseModel):
    week_id: str
    class_id: str
    reason: Optional[str] = None


@app.post("/api/weeks/preview-summary")
def preview_summary(body: WeekActionBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    return compute_weekly_summary(body.week_id, persist=False)


@app.post("/api/weeks/lock")
def lock(body: WeekActionBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    week = lock_week(body.week_id, user.user_id)
    week["parent_report"] = send_if_auto(body.week_id, user.user_id, user.email)
    return week


@app.post("/api/weeks/unlock")
def unlock(body: WeekActionBody, user: CurrentUser = Depends(get_current_user)):
    # Mở khóa nên giới hạn chặt hơn: chỉ hiệu trưởng duyệt yêu cầu mở khóa trong thực tế.
    # Ở đây tạm cho phép GVCN tự mở khóa lớp mình; siết lại khi có bảng week_unlock_requests UI.
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    return unlock_week(body.week_id, user.user_id, body.reason or "")


class JoinClassBody(BaseModel):
    class_code: str
    subject_id: str


@app.post("/api/teacher/join-class")
def teacher_join_class(body: JoinClassBody, user: CurrentUser = Depends(get_current_user)):
    if not user.has_role("subject_teacher"):
        raise HTTPException(status_code=403, detail="Chỉ giáo viên bộ môn được tham gia lớp bằng mã.")
    return join_class_by_code(body.class_code, body.subject_id, user.user_id)


@app.get("/api/teacher/context")
def teacher_context(user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal() and not user.has_role("subject_teacher"):
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho giáo viên bộ môn.")
    return subject_teacher_context(None if user.is_principal() else user.user_id)


# ---------------------------------------------------------
# ĐIỂM DANH HÀNG LOẠT
# ---------------------------------------------------------
class CreateSessionBody(BaseModel):
    class_id: str
    subject_id: str
    session_date: date
    period: int


@app.post("/api/attendance/session")
def create_session(body: CreateSessionBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher", "homeroom_teacher"])
    require_subject_assignment(user, body.class_id, body.subject_id)
    if body.period < 1 or body.period > 10:
        raise HTTPException(status_code=422, detail="Tiết học phải từ 1 đến 10.")
    return get_or_create_session(body.class_id, body.subject_id, user.user_id, body.session_date, body.period)


class AttendanceRecordBody(BaseModel):
    student_id: str
    attendance_status: str
    note: Optional[str] = None


class SubmitAttendanceBody(BaseModel):
    session_id: str
    class_id: str
    records: list[AttendanceRecordBody]


@app.post("/api/attendance/submit")
def submit_attendance_endpoint(body: SubmitAttendanceBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher", "homeroom_teacher"])
    session = require_record_class("attendance_sessions", body.session_id, body.class_id, "phiên điểm danh")
    require_subject_assignment(user, body.class_id, session["subject_id"])
    records = [AttendanceRecordInput(r.student_id, r.attendance_status, r.note) for r in body.records]
    return submit_attendance(body.session_id, records, user.user_id)


# ---------------------------------------------------------
# SỔ ĐẦU BÀI ĐIỆN TỬ
# ---------------------------------------------------------
def _require_lesson_access(
    user: CurrentUser,
    class_id: str,
    lesson_id: Optional[str] = None,
    manage: bool = False,
    require_active: bool = False,
) -> None:
    allowed = ["homeroom_teacher"] if manage else ["homeroom_teacher", "subject_teacher"]
    require_class_role(user, class_id, allowed_roles=allowed)
    if not lesson_id or user.is_principal() or "homeroom_teacher" in get_user_class_scope(user.user_id, class_id):
        return
    lesson = get_supabase().table("lesson_book_entries").select(
        "teacher_id,subject_id,competition_weeks!inner(academic_term_id)"
    ).eq("id", lesson_id).eq("class_id", class_id).limit(1).execute()
    if not lesson.data or lesson.data[0]["teacher_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Bạn chỉ được cập nhật tiết mình phụ trách.")
    row = lesson.data[0]
    term = row.get("competition_weeks") or {}
    if not term.get("academic_term_id"):
        raise HTTPException(status_code=422, detail="Tiết học chưa được gắn học kỳ.")
    require_subject_term_access(
        user, class_id, row["subject_id"], term["academic_term_id"], require_active=require_active,
    )


@app.get("/api/lesson-book/timetable")
def lesson_timetable(class_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, class_id)
    return {"entries": list_timetable(class_id), **timetable_options(class_id)}


class TimetableBody(BaseModel):
    class_id: str
    weekday: int
    period: int
    subject_id: str
    teacher_id: str
    entry_id: Optional[str] = None


@app.post("/api/lesson-book/timetable/save")
def lesson_timetable_save(body: TimetableBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return save_timetable_entry(body.class_id, body.weekday, body.period, body.subject_id, body.teacher_id, user.user_id, body.entry_id)


class TimetableDeleteBody(BaseModel):
    class_id: str
    entry_id: str


@app.post("/api/lesson-book/timetable/delete")
def lesson_timetable_delete(body: TimetableDeleteBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return remove_timetable_entry(body.entry_id, body.class_id, user.user_id)


@app.get("/api/lesson-book/entries")
def lesson_entries(
    class_id: str,
    week_id: str,
    subject_id: Optional[str] = None,
    academic_term_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    _require_lesson_access(user, class_id)
    week_scope = require_record_class("competition_weeks", week_id, class_id, "tuần thi đua")
    if academic_term_id and week_scope.get("academic_term_id") != academic_term_id:
        raise HTTPException(status_code=422, detail="Tuần không thuộc học kỳ đã chọn.")
    class_scope = get_user_class_scope(user.user_id, class_id)
    if not user.is_principal() and "subject_teacher" in user.roles and "homeroom_teacher" not in class_scope:
        if not subject_id or not academic_term_id:
            raise HTTPException(status_code=422, detail="GVBM phải chọn môn học và học kỳ.")
        require_subject_term_access(user, class_id, subject_id, academic_term_id)
    result = list_lessons(class_id, week_id)
    if not user.is_principal() and "homeroom_teacher" not in get_user_class_scope(user.user_id, class_id):
        result["lessons"] = [lesson for lesson in result["lessons"] if lesson["teacher_id"] == user.user_id]
    return result


class LessonUpdateBody(BaseModel):
    class_id: str
    lesson_id: str
    lecture_content: Optional[str] = None
    collective_rating: Optional[str] = None
    collective_comment: Optional[str] = None
    notes: Optional[str] = None


@app.post("/api/lesson-book/entries/update")
def lesson_entry_update(body: LessonUpdateBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, body.lesson_id, require_active=True)
    return update_lesson(body.lesson_id, body.class_id, user.user_id, body.lecture_content, body.collective_rating, body.collective_comment, body.notes)


class ExtraLessonBody(BaseModel):
    class_id: str
    subject_id: str
    academic_term_id: str
    lesson_date: date
    period: int
    reason: str


@app.post("/api/lesson-book/extra/request")
def lesson_extra_request(body: ExtraLessonBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher"])
    require_subject_term_access(user, body.class_id, body.subject_id, body.academic_term_id, require_active=True)
    term = get_supabase().table("academic_terms").select("start_date,end_date").eq("id", body.academic_term_id).limit(1).execute().data or []
    if not term or not (term[0]["start_date"] <= body.lesson_date.isoformat() <= term[0]["end_date"]):
        raise HTTPException(status_code=422, detail="Ngày học không nằm trong học kỳ đã chọn.")
    return request_extra_lesson(body.class_id, user.user_id, body.subject_id, body.lesson_date, body.period, body.reason)


class ReviewExtraBody(BaseModel):
    class_id: str
    lesson_id: str
    approve: bool
    note: Optional[str] = None


@app.post("/api/lesson-book/extra/review")
def lesson_extra_review(body: ReviewExtraBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return review_extra_lesson(body.lesson_id, body.class_id, user.user_id, body.approve, body.note)


@app.get("/api/lesson-book/attendance")
def lesson_attendance(lesson_id: str, class_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, class_id, lesson_id)
    return attendance_detail(lesson_id, class_id)


class LessonAttendanceRow(BaseModel):
    student_id: str
    attendance_status: str
    note: Optional[str] = None
    criteria_ids: list[str] = []


class LessonAttendanceBody(BaseModel):
    class_id: str
    lesson_id: str
    rows: list[LessonAttendanceRow]


@app.post("/api/lesson-book/attendance/save")
def lesson_attendance_save(body: LessonAttendanceBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, body.lesson_id, require_active=True)
    return save_attendance(body.lesson_id, body.class_id, user.user_id, [row.model_dump() for row in body.rows])


class ReviseStudentCriteriaBody(BaseModel):
    class_id: str
    lesson_id: str
    student_id: str
    criteria_ids: list[str]


@app.post("/api/lesson-book/criteria/revise")
def lesson_criteria_revise(body: ReviseStudentCriteriaBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return revise_student_criteria(body.lesson_id, body.class_id, body.student_id, body.criteria_ids, user.user_id)


class UnlockRequestBody(BaseModel):
    class_id: str
    week_id: str
    reason: str


@app.post("/api/lesson-book/unlock/request")
def lesson_unlock_request(body: UnlockRequestBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher"])
    return request_week_unlock(body.week_id, body.class_id, user.user_id, body.reason)


@app.get("/api/lesson-book/unlock/requests")
def lesson_unlock_requests(class_id: str, academic_term_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, class_id, manage=True)
    if academic_term_id:
        require_homeroom_term_access(user, class_id, academic_term_id)
    return {"requests": list_unlock_requests(class_id, academic_term_id)}


@app.get("/api/lesson-book/unlock/pending-count")
def lesson_unlock_pending_count(user: CurrentUser = Depends(get_current_user)):
    if user.is_principal():
        return {"count": count_pending_unlock_requests()}
    if "homeroom_teacher" not in user.roles:
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho GVCN.")
    scopes = (
        get_supabase().table("user_class_scope")
        .select("class_id")
        .eq("user_id", user.user_id)
        .eq("scope_role", "homeroom_teacher")
        .execute().data or []
    )
    return {"count": count_pending_unlock_requests(list({row["class_id"] for row in scopes}))}


class ReviewUnlockBody(BaseModel):
    class_id: str
    request_id: str
    approve: bool


@app.post("/api/lesson-book/unlock/review")
def lesson_unlock_review(body: ReviewUnlockBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return review_unlock_request(body.request_id, body.class_id, user.user_id, body.approve)


# ---------------------------------------------------------
# DÒ BÀI CŨ / QUẢN LÝ ĐIỂM KIỂM TRA
# ---------------------------------------------------------
@app.get("/api/student/gradebook")
def student_personal_gradebook(
    school_year_id: Optional[str] = None,
    term_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    if "student" not in user.roles:
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho học sinh.")
    return student_gradebook(user.user_id, school_year_id, term_id)


def _require_subject_lesson_owner(user: CurrentUser, class_id: str, lesson_id: str, require_active: bool = False) -> dict:
    require_class_role(user, class_id, allowed_roles=["subject_teacher"])
    response = (
        get_supabase().table("lesson_book_entries").select("teacher_id,subject_id,competition_weeks!inner(academic_term_id)")
        .eq("id", lesson_id).eq("class_id", class_id).limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tiết học.")
    lesson = response.data[0]
    if not user.is_principal() and lesson["teacher_id"] != user.user_id:
        raise HTTPException(status_code=403, detail="Bạn chỉ được dò bài trong tiết mình phụ trách.")
    term_id = (lesson.get("competition_weeks") or {}).get("academic_term_id")
    if not term_id:
        raise HTTPException(status_code=422, detail="Tiết học chưa được gắn học kỳ.")
    require_subject_term_access(user, class_id, lesson["subject_id"], term_id, require_active=require_active)
    return lesson


@app.get("/api/assessments/oral/random")
def assessment_oral_random(class_id: str, lesson_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_subject_lesson_owner(user, class_id, lesson_id, require_active=True)
    return random_oral_student(class_id, lesson_id)


@app.get("/api/assessments/oral/student")
def assessment_oral_student(class_id: str, lesson_id: str, student_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_subject_lesson_owner(user, class_id, lesson_id, require_active=True)
    return oral_student_info(class_id, lesson_id, student_id)


@app.get("/api/assessments/oral/lessons")
def assessment_oral_lessons(class_id: str, subject_id: str, academic_term_id: str, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, class_id, allowed_roles=["subject_teacher"])
    require_subject_term_access(user, class_id, subject_id, academic_term_id)
    weeks = (
        get_supabase().table("competition_weeks").select("id").eq("class_id", class_id)
        .eq("academic_term_id", academic_term_id).eq("status", "open")
        .order("start_date", desc=True).execute().data or []
    )
    lessons = []
    for week in weeks:
        entries = list_lessons(class_id, week["id"])["lessons"]
        lessons.extend(
            lesson for lesson in entries
            if lesson["subject_id"] == subject_id
            and lesson["approval_status"] == "approved"
            and (user.is_principal() or lesson["teacher_id"] == user.user_id)
        )
    lessons.sort(key=lambda item: (item["lesson_date"], item["period"]), reverse=True)
    return {"lessons": lessons}


class OralScoreBody(BaseModel):
    class_id: str
    lesson_id: str
    student_id: str
    score: float = Field(ge=0, le=10)
    comment: Optional[str] = None


@app.post("/api/assessments/oral")
def assessment_oral_create(body: OralScoreBody, user: CurrentUser = Depends(get_current_user)):
    _require_subject_lesson_owner(user, body.class_id, body.lesson_id, require_active=True)
    return create_oral_score(body.class_id, body.lesson_id, body.student_id, body.score, body.comment, user.user_id)


class FifteenMinuteScoreBody(BaseModel):
    class_id: str
    subject_id: str
    academic_term_id: str
    student_id: str
    score: float = Field(ge=0, le=10)
    assessment_date: date
    period: Optional[int] = Field(default=None, ge=1, le=15)
    comment: Optional[str] = None


@app.post("/api/assessments/fifteen-minute")
def assessment_fifteen_minute_create(body: FifteenMinuteScoreBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher"])
    require_subject_term_access(user, body.class_id, body.subject_id, body.academic_term_id, require_active=True)
    matching_week = (
        get_supabase().table("competition_weeks").select("id").eq("class_id", body.class_id)
        .eq("academic_term_id", body.academic_term_id).lte("start_date", body.assessment_date.isoformat())
        .gte("end_date", body.assessment_date.isoformat()).eq("status", "open").limit(1).execute().data or []
    )
    if not matching_week:
        raise HTTPException(status_code=422, detail="Ngày kiểm tra không thuộc tuần đang mở của học kỳ đã chọn.")
    return create_fifteen_minute_score(
        body.class_id, body.subject_id, body.student_id, body.score,
        body.assessment_date, body.period, body.comment, user.user_id,
    )


@app.get("/api/assessments")
def assessments_list(class_id: str, subject_id: str, academic_term_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher", "subject_teacher"])
    class_scope = get_user_class_scope(user.user_id, class_id)
    if not user.is_principal() and "subject_teacher" in user.roles and "homeroom_teacher" not in class_scope:
        if not academic_term_id:
            raise HTTPException(status_code=422, detail="GVBM phải chọn học kỳ.")
        require_subject_term_access(user, class_id, subject_id, academic_term_id)
    else:
        require_subject_assignment(user, class_id, subject_id)
    if academic_term_id and (user.is_principal() or "homeroom_teacher" in get_user_class_scope(user.user_id, class_id)):
        require_homeroom_term_access(user, class_id, academic_term_id)
    return list_assessment_scores(class_id, subject_id, academic_term_id)


def _require_assessment_access(user: CurrentUser, class_id: str, score_id: str, editing: bool = False) -> dict:
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher", "subject_teacher"])
    response = (
        get_supabase().table("assessment_scores").select("*,competition_weeks(academic_term_id)")
        .eq("id", score_id).eq("class_id", class_id).limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy điểm kiểm tra.")
    score = response.data[0]
    scope = get_user_class_scope(user.user_id, class_id)
    if not user.is_principal() and "homeroom_teacher" not in scope:
        term_id = (score.get("competition_weeks") or {}).get("academic_term_id")
        if not term_id:
            raise HTTPException(status_code=422, detail="Điểm kiểm tra chưa được gắn học kỳ.")
        require_subject_term_access(user, class_id, score["subject_id"], term_id, require_active=editing)
        if editing and score["teacher_id"] != user.user_id:
            raise HTTPException(status_code=403, detail="Bạn chỉ được sửa điểm do mình nhập.")
    return score


@app.get("/api/assessments/{score_id}")
def assessment_detail(score_id: str, class_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_assessment_access(user, class_id, score_id)
    return assessment_score_detail(score_id, class_id)


class UpdateAssessmentScoreBody(BaseModel):
    class_id: str
    score: float = Field(ge=0, le=10)
    comment: Optional[str] = None
    reason: Optional[str] = None


@app.post("/api/assessments/{score_id}/update")
def assessment_update(score_id: str, body: UpdateAssessmentScoreBody, user: CurrentUser = Depends(get_current_user)):
    current = _require_assessment_access(user, body.class_id, score_id, editing=True)
    require_reason = current["teacher_id"] != user.user_id
    return update_assessment_score(
        score_id, body.class_id, body.score, body.comment, body.reason,
        user.user_id, require_reason=require_reason,
    )


# ---------------------------------------------------------
# IMPORT EXCEL HỌC SINH
# ---------------------------------------------------------
@app.post("/api/students/import/validate")
async def import_validate(
    class_id: str = Form(...),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher"])
    content = await file.read()
    rows = parse_and_validate(content, class_id)
    return {
        "total": len(rows),
        "valid_count": sum(1 for r in rows if r.is_valid),
        "invalid_count": sum(1 for r in rows if not r.is_valid),
        "rows": [
            {
                "row_index": r.row_index,
                "full_name": r.full_name,
                "gender": r.gender,
                "dob": r.dob,
                "parent_phone": r.parent_phone,
                "parent_email": r.parent_email,
                "address": r.address,
                "errors": r.errors,
                "is_valid": r.is_valid,
            }
            for r in rows
        ],
    }


class ImportConfirmBody(BaseModel):
    class_id: str
    school_year_id: str
    rows: list[dict]


@app.post("/api/students/import/confirm")
def import_confirm(body: ImportConfirmBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    class_resp = get_supabase().table("classes").select("school_year_id").eq("id", body.class_id).limit(1).execute()
    if not class_resp.data or class_resp.data[0]["school_year_id"] != body.school_year_id:
        raise HTTPException(status_code=422, detail="Năm học không khớp với lớp đang import.")
    return confirm_import(body.rows, body.class_id, body.school_year_id, user.user_id)


# ---------------------------------------------------------
# BÁO CÁO TUẦN GỬI PHỤ HUYNH QUA EMAIL
# ---------------------------------------------------------
@app.get("/api/parent-reports/weekly")
def parent_reports_weekly(
    class_id: str,
    academic_term_id: str,
    week_id: str,
    user: CurrentUser = Depends(get_current_user),
):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher"])
    require_homeroom_term_access(user, class_id, academic_term_id)
    return get_report_workspace(class_id, academic_term_id, week_id)


class ParentReportConfigBody(BaseModel):
    class_id: str
    academic_term_id: str
    send_mode: str


@app.post("/api/parent-reports/config")
def parent_reports_config(body: ParentReportConfigBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_homeroom_term_access(user, body.class_id, body.academic_term_id)
    return save_report_config(body.class_id, body.academic_term_id, body.send_mode, user.user_id)


class SendParentReportsBody(BaseModel):
    class_id: str
    academic_term_id: str
    week_id: str
    student_ids: Optional[list[str]] = None
    comments: Optional[dict[str, str]] = None


@app.post("/api/parent-reports/send")
def parent_reports_send(body: SendParentReportsBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_homeroom_term_access(user, body.class_id, body.academic_term_id)
    return send_week_reports(
        body.class_id,
        body.academic_term_id,
        body.week_id,
        body.student_ids,
        body.comments,
        user.user_id,
        user.email,
    )


# ---------------------------------------------------------
# BÁO CÁO
# ---------------------------------------------------------
@app.get("/api/reports/weekly")
def report_weekly(class_id: str, week_id: str, user: CurrentUser = Depends(get_current_user)):
    require_class_role(
        user, class_id, allowed_roles=["homeroom_teacher", "subject_teacher", "class_monitor", "vice_monitor"]
    )
    require_record_class("competition_weeks", week_id, class_id, "tuần thi đua")
    return weekly_class_report(class_id, week_id)


@app.get("/api/reports/group")
def report_group(group_id: str, week_id: str, class_id: str, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher", "class_monitor", "group_leader"])
    require_record_class("groups_", group_id, class_id, "tổ")
    require_group_access(user, group_id, class_id)
    require_record_class("competition_weeks", week_id, class_id, "tuần thi đua")
    return group_report(group_id, week_id)


class PeriodSummaryBody(BaseModel):
    class_id: str
    school_year_id: str
    period_type: str
    period_label: str
    week_ids: list[str]


@app.post("/api/reports/period/compute")
def report_period_compute(body: PeriodSummaryBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    if not body.week_ids:
        raise HTTPException(status_code=422, detail="Cần chọn ít nhất một tuần để tổng hợp.")
    for week_id in set(body.week_ids):
        week = require_record_class("competition_weeks", week_id, body.class_id, "tuần thi đua")
        if week["school_year_id"] != body.school_year_id or week["status"] != "locked":
            raise HTTPException(status_code=422, detail="Chỉ được tổng hợp các tuần đã khóa trong đúng năm học.")
    return compute_period_summary(
        body.class_id, body.school_year_id, body.period_type, body.period_label, body.week_ids
    )


@app.get("/api/reports/student/{student_id}")
def report_student(
    student_id: str,
    school_year_id: Optional[str] = None,
    academic_term_id: Optional[str] = None,
    week_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    require_student_access(user, student_id)
    return student_history(student_id, school_year_id, academic_term_id, week_id)


# ---------------------------------------------------------
# THÔNG BÁO - xử lý lại các thông báo pending/failed (gọi định kỳ qua Vercel Cron)
# ---------------------------------------------------------
@app.post("/api/notifications/process-pending")
def notifications_process_pending(user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được chạy tác vụ này thủ công.")
    count = process_pending_notifications()
    return {"processed": count}
