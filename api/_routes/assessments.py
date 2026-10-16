"""Assessments API routes."""
from fastapi import APIRouter
from datetime import date
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
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
from _lib.auth import (
    CurrentUser,
    get_current_user,
    get_user_class_scope,
    require_class_role,
    require_homeroom_term_access,
    require_subject_assignment,
    require_subject_term_access,
)
from _lib.lesson_book_engine import list_lessons
from _lib.supabase_client import get_supabase

router = APIRouter()


# ---------------------------------------------------------
# DÒ BÀI CŨ / QUẢN LÝ ĐIỂM KIỂM TRA
# ---------------------------------------------------------
@router.get("/api/student/gradebook")
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


@router.get("/api/assessments/oral/random")
def assessment_oral_random(class_id: str, lesson_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_subject_lesson_owner(user, class_id, lesson_id, require_active=True)
    return random_oral_student(class_id, lesson_id)


@router.get("/api/assessments/oral/student")
def assessment_oral_student(class_id: str, lesson_id: str, student_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_subject_lesson_owner(user, class_id, lesson_id, require_active=True)
    return oral_student_info(class_id, lesson_id, student_id)


@router.get("/api/assessments/oral/lessons")
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


@router.post("/api/assessments/oral")
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


@router.post("/api/assessments/fifteen-minute")
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


@router.get("/api/assessments")
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


@router.get("/api/assessments/{score_id}")
def assessment_detail(score_id: str, class_id: str, user: CurrentUser = Depends(get_current_user)):
    _require_assessment_access(user, class_id, score_id)
    return assessment_score_detail(score_id, class_id)


class UpdateAssessmentScoreBody(BaseModel):
    class_id: str
    score: float = Field(ge=0, le=10)
    comment: Optional[str] = None
    reason: Optional[str] = None


@router.post("/api/assessments/{score_id}/update")
def assessment_update(score_id: str, body: UpdateAssessmentScoreBody, user: CurrentUser = Depends(get_current_user)):
    current = _require_assessment_access(user, body.class_id, score_id, editing=True)
    require_reason = current["teacher_id"] != user.user_id
    return update_assessment_score(
        score_id, body.class_id, body.score, body.comment, body.reason,
        user.user_id, require_reason=require_reason,
    )
