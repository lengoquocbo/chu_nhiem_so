"""Lesson Book API routes."""
from fastapi import APIRouter
from datetime import date
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from _lib.auth import (
    CurrentUser,
    get_current_user,
    get_user_class_scope,
    get_school_class_ids,
    require_class_role,
    require_record_class,
    require_homeroom_term_access,
    require_subject_term_access,
)
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
from _lib.supabase_client import get_supabase

router = APIRouter()


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


@router.get("/api/lesson-book/timetable")
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


@router.post("/api/lesson-book/timetable/save")
def lesson_timetable_save(body: TimetableBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return save_timetable_entry(body.class_id, body.weekday, body.period, body.subject_id, body.teacher_id, user.user_id, body.entry_id)


class TimetableDeleteBody(BaseModel):
    class_id: str
    entry_id: str


@router.post("/api/lesson-book/timetable/delete")
def lesson_timetable_delete(body: TimetableDeleteBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return remove_timetable_entry(body.entry_id, body.class_id, user.user_id)


@router.get("/api/lesson-book/entries")
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


@router.post("/api/lesson-book/entries/update")
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


@router.post("/api/lesson-book/extra/request")
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


@router.post("/api/lesson-book/extra/review")
def lesson_extra_review(body: ReviewExtraBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return review_extra_lesson(body.lesson_id, body.class_id, user.user_id, body.approve, body.note)


@router.get("/api/lesson-book/attendance")
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


@router.post("/api/lesson-book/attendance/save")
def lesson_attendance_save(body: LessonAttendanceBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, body.lesson_id, require_active=True)
    return save_attendance(body.lesson_id, body.class_id, user.user_id, [row.model_dump() for row in body.rows])


class ReviseStudentCriteriaBody(BaseModel):
    class_id: str
    lesson_id: str
    student_id: str
    criteria_ids: list[str]


@router.post("/api/lesson-book/criteria/revise")
def lesson_criteria_revise(body: ReviseStudentCriteriaBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return revise_student_criteria(body.lesson_id, body.class_id, body.student_id, body.criteria_ids, user.user_id)


class UnlockRequestBody(BaseModel):
    class_id: str
    week_id: str
    reason: str


@router.post("/api/lesson-book/unlock/request")
def lesson_unlock_request(body: UnlockRequestBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher"])
    return request_week_unlock(body.week_id, body.class_id, user.user_id, body.reason)


@router.get("/api/lesson-book/unlock/requests")
def lesson_unlock_requests(class_id: str, academic_term_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, class_id, manage=True)
    if academic_term_id:
        require_homeroom_term_access(user, class_id, academic_term_id)
    return {"requests": list_unlock_requests(class_id, academic_term_id)}


@router.get("/api/lesson-book/unlock/pending-count")
def lesson_unlock_pending_count(user: CurrentUser = Depends(get_current_user)):
    if user.is_principal():
        return {"count": count_pending_unlock_requests(get_school_class_ids(user.school_id))}
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


@router.post("/api/lesson-book/unlock/review")
def lesson_unlock_review(body: ReviewUnlockBody, user: CurrentUser = Depends(get_current_user)):
    _require_lesson_access(user, body.class_id, manage=True)
    return review_unlock_request(body.request_id, body.class_id, user.user_id, body.approve)
