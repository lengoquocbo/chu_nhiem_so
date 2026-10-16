"""Parent Reports API routes."""
from fastapi import APIRouter
from typing import Optional
from fastapi import Depends
from pydantic import BaseModel
from _lib.auth import (
    CurrentUser,
    get_current_user,
    require_class_role,
    require_homeroom_term_access,
)
from _lib.parent_report_engine import get_report_workspace, save_report_config, send_week_reports

router = APIRouter()


# ---------------------------------------------------------
# BÁO CÁO TUẦN GỬI PHỤ HUYNH QUA EMAIL
# ---------------------------------------------------------
@router.get("/api/parent-reports/weekly")
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


@router.post("/api/parent-reports/config")
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


@router.post("/api/parent-reports/send")
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
