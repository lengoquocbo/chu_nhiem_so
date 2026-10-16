"""Attendance API routes."""
from fastapi import APIRouter
from datetime import date
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from _lib.attendance_engine import AttendanceRecordInput, get_or_create_session, submit_attendance
from _lib.auth import (
    CurrentUser,
    get_current_user,
    require_class_role,
    require_record_class,
    require_subject_assignment,
)

router = APIRouter()


# ---------------------------------------------------------
# ĐIỂM DANH HÀNG LOẠT
# ---------------------------------------------------------
class CreateSessionBody(BaseModel):
    class_id: str
    subject_id: str
    session_date: date
    period: int


@router.post("/api/attendance/session")
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


@router.post("/api/attendance/submit")
def submit_attendance_endpoint(body: SubmitAttendanceBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["subject_teacher", "homeroom_teacher"])
    session = require_record_class("attendance_sessions", body.session_id, body.class_id, "phiên điểm danh")
    require_subject_assignment(user, body.class_id, session["subject_id"])
    records = [AttendanceRecordInput(r.student_id, r.attendance_status, r.note) for r in body.records]
    return submit_attendance(body.session_id, records, user.user_id)
