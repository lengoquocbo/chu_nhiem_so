"""Events API routes."""
from fastapi import APIRouter
from datetime import date
from typing import Optional
from fastapi import Depends
from pydantic import BaseModel
from _lib.auth import (
    CurrentUser,
    get_current_user,
    get_user_class_scope,
    require_active_student_in_class,
    require_class_role,
    require_record_class,
    require_student_record_scope,
    require_subject_assignment,
)
from _lib.officer_engine import validate_officer_event
from _lib.score_engine import RecordEventInput, record_student_event

router = APIRouter()


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


@router.post("/api/events")
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
