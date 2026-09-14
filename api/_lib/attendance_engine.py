"""
Điểm danh theo tiết học.

GVBM chỉ chọn trạng thái (present/late/unexcused_absent/excused_absent/left_early)
cho từng học sinh - KHÔNG tự nhập điểm. Với các trạng thái cần trừ điểm
(late/unexcused_absent/left_early), hệ thống gọi thẳng score_engine để
đối chiếu tiêu chí + tạo Score Transaction, y hệt luồng ghi sự việc thủ công.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from fastapi import HTTPException
from postgrest.exceptions import APIError

from .score_engine import DuplicateEventError, RecordEventInput, record_student_event
from .supabase_client import get_supabase

# Trạng thái điểm danh nào tạo sự kiện trừ điểm tương ứng event_type nào.
# 'present' và 'excused_absent' KHÔNG tạo sự kiện (không trừ điểm).
STATUS_TO_EVENT_TYPE = {
    "late": "ATTENDANCE_LATE",
    "unexcused_absent": "ATTENDANCE_ABSENT_UNEXCUSED",
    "left_early": "ATTENDANCE_LEFT_EARLY",
}
ALLOWED_STATUSES = {"present", "late", "unexcused_absent", "excused_absent", "left_early"}


@dataclass
class AttendanceRecordInput:
    student_id: str
    attendance_status: str  # present | excused_absent | unexcused_absent | late | left_early
    note: str | None = None


def get_or_create_session(class_id: str, subject_id: str, teacher_id: str, session_date: date, period: int) -> dict:
    supabase = get_supabase()
    existing = (
        supabase.table("attendance_sessions")
        .select("*")
        .eq("class_id", class_id)
        .eq("subject_id", subject_id)
        .eq("session_date", session_date.isoformat())
        .eq("period", period)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    resp = (
        supabase.table("attendance_sessions")
        .insert(
            {
                "class_id": class_id,
                "subject_id": subject_id,
                "teacher_id": teacher_id,
                "session_date": session_date.isoformat(),
                "period": period,
            }
        )
        .execute()
    )
    return resp.data[0]


def submit_attendance(
    session_id: str,
    records: list[AttendanceRecordInput],
    actor_id: str,
) -> dict:
    supabase = get_supabase()

    session_resp = supabase.table("attendance_sessions").select("*").eq("id", session_id).limit(1).execute()
    if not session_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên điểm danh.")
    session = session_resp.data[0]

    results = {"created": [], "skipped_existing": [], "errors": []}

    for rec in records:
        if rec.attendance_status not in ALLOWED_STATUSES:
            results["errors"].append({"student_id": rec.student_id, "detail": "Trạng thái điểm danh không hợp lệ."})
            continue

        enrollment = (
            supabase.table("student_class_enrollments")
            .select("id")
            .eq("student_id", rec.student_id)
            .eq("class_id", session["class_id"])
            .is_("left_at", None)
            .limit(1)
            .execute()
        )
        if not enrollment.data:
            results["errors"].append({"student_id": rec.student_id, "detail": "Học sinh không thuộc lớp."})
            continue

        existing = (
            supabase.table("attendance_records")
            .select("id")
            .eq("session_id", session_id)
            .eq("student_id", rec.student_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            results["skipped_existing"].append(rec.student_id)
            continue

        student_event_id = None
        event_type_code = STATUS_TO_EVENT_TYPE.get(rec.attendance_status)

        if event_type_code:
            try:
                event_result = record_student_event(
                    RecordEventInput(
                        student_id=rec.student_id,
                        class_id=session["class_id"],
                        event_type_code=event_type_code,
                        criteria_code=None,  # tự đối chiếu qua event_criteria_mappings
                        event_date=date.fromisoformat(session["session_date"]),
                        created_by=actor_id,
                        period=session["period"],
                        subject_id=session["subject_id"],
                        note=rec.note,
                    )
                )
                student_event_id = event_result["event"]["id"]
            except DuplicateEventError:
                # Sự kiện đã tồn tại (ví dụ điểm danh lại) - vẫn ghi attendance_records,
                # chỉ là không tạo thêm transaction trùng.
                pass
            except HTTPException as exc:
                results["errors"].append({"student_id": rec.student_id, "detail": exc.detail})
                continue

        try:
            insert_resp = (
                supabase.table("attendance_records")
                .insert(
                    {
                        "session_id": session_id,
                        "student_id": rec.student_id,
                        "attendance_status": rec.attendance_status,
                        "note": rec.note,
                        "student_event_id": student_event_id,
                        "created_by": actor_id,
                    }
                )
                .execute()
            )
            results["created"].append(insert_resp.data[0])
        except APIError as exc:
            results["errors"].append({"student_id": rec.student_id, "detail": str(exc)})

    if not results["errors"]:
        supabase.table("attendance_sessions").update({"status": "confirmed", "confirmed_at": "now()"}).eq(
            "id", session_id
        ).execute()

    return results
