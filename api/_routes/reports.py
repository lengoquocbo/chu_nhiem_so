"""Reports API routes."""
from fastapi import APIRouter
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from _lib.auth import (
    CurrentUser,
    get_current_user,
    require_class_role,
    require_record_class,
    require_group_access,
    require_student_access,
)
from _lib.report_engine import (
    compute_period_summary,
    group_report,
    student_history,
    weekly_class_report,
)

router = APIRouter()


# ---------------------------------------------------------
# BÁO CÁO
# ---------------------------------------------------------
@router.get("/api/reports/weekly")
def report_weekly(class_id: str, week_id: str, user: CurrentUser = Depends(get_current_user)):
    require_class_role(
        user, class_id, allowed_roles=["homeroom_teacher", "subject_teacher", "class_monitor", "vice_monitor"]
    )
    require_record_class("competition_weeks", week_id, class_id, "tuần thi đua")
    return weekly_class_report(class_id, week_id)


@router.get("/api/reports/group")
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


@router.post("/api/reports/period/compute")
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


@router.get("/api/reports/student/{student_id}")
def report_student(
    student_id: str,
    school_year_id: Optional[str] = None,
    academic_term_id: Optional[str] = None,
    week_id: Optional[str] = None,
    user: CurrentUser = Depends(get_current_user),
):
    require_student_access(user, student_id)
    return student_history(student_id, school_year_id, academic_term_id, week_id)
