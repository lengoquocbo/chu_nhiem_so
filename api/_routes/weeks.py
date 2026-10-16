"""Weeks API routes."""
from fastapi import APIRouter
from datetime import date
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from _lib.auth import (
    CurrentUser,
    get_current_user,
    require_class_role,
    require_record_class,
    require_homeroom_term_access,
)
from _lib.parent_report_engine import send_if_auto
from _lib.supabase_client import get_supabase
from _lib.week_engine import (
    compute_weekly_summary,
    create_week,
    lock_week,
    unlock_week,
    update_week,
)

router = APIRouter()


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


@router.post("/api/weeks/create")
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


@router.post("/api/weeks/update")
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


@router.post("/api/weeks/preview-summary")
def preview_summary(body: WeekActionBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    return compute_weekly_summary(body.week_id, persist=False)


@router.post("/api/weeks/lock")
def lock(body: WeekActionBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    week = lock_week(body.week_id, user.user_id)
    week["parent_report"] = send_if_auto(body.week_id, user.user_id, user.email)
    return week


@router.post("/api/weeks/unlock")
def unlock(body: WeekActionBody, user: CurrentUser = Depends(get_current_user)):
    # Mở khóa nên giới hạn chặt hơn: chỉ hiệu trưởng duyệt yêu cầu mở khóa trong thực tế.
    # Ở đây tạm cho phép GVCN tự mở khóa lớp mình; siết lại khi có bảng week_unlock_requests UI.
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("competition_weeks", body.week_id, body.class_id, "tuần thi đua")
    return unlock_week(body.week_id, user.user_id, body.reason or "")
