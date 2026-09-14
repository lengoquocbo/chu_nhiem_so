"""
LÕI NGHIỆP VỤ TÍNH ĐIỂM.

Nguyên tắc:
  Nhập sự việc -> hệ thống đối chiếu tiêu chí -> tự tính điểm ->
  tạo Score Transaction (DRAFT) -> chờ quy trình duyệt.

Không có hàm nào ở đây cho phép truyền thẳng số điểm vào từ người dùng.
Điểm luôn được suy ra từ `criteria.points` + `criteria.kind` tại
THỜI ĐIỂM ghi nhận, sau đó SNAPSHOT vào score_transactions
(system_points, criteria_code_snapshot, criteria_name_snapshot)
để việc sửa criteria sau này không ảnh hưởng transaction cũ.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional

from fastapi import HTTPException
from postgrest.exceptions import APIError

from .notification_engine import create_and_send_notifications_for_transaction
from .supabase_client import get_supabase


class DuplicateEventError(HTTPException):
    def __init__(self):
        super().__init__(
            status_code=409,
            detail="Sự việc này đã được ghi nhận trước đó cho học sinh này "
            "(trùng ngày/tiết/loại sự kiện/tiêu chí).",
        )


@dataclass
class RecordEventInput:
    student_id: str
    class_id: str
    event_type_code: str          # ví dụ: 'VIOLATION', 'ACHIEVEMENT', 'ATTENDANCE_LATE'
    criteria_code: Optional[str]  # nếu None, hệ thống tự suy ra theo event_type mặc định
    event_date: date
    created_by: str
    period: Optional[int] = None
    subject_id: Optional[str] = None
    note: Optional[str] = None
    evidence_url: Optional[str] = None
    week_id: Optional[str] = None
    lesson_id: Optional[str] = None


def _get_active_week(supabase, class_id: str, event_date: date) -> Optional[dict]:
    resp = (
        supabase.table("competition_weeks")
        .select("id,status,start_date,end_date")
        .eq("class_id", class_id)
        .lte("start_date", event_date.isoformat())
        .gte("end_date", event_date.isoformat())
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


def _resolve_criteria(supabase, class_id: str, event_type_id: str, event_type_code: str, criteria_code: Optional[str]) -> dict:
    """
    Tìm tiêu chí áp dụng, theo thứ tự ưu tiên:
      1. criteria_code được truyền thẳng (trường hợp người dùng chọn tay 1 tiêu chí cụ thể)
      2. event_criteria_mappings kỹ thuật đã được cấu hình sẵn cho các luồng tự động
         như điểm danh.
    Không tự "đoán" tiêu chí theo cách nào khác.
    """
    if criteria_code:
        resp = (
            supabase.table("criteria")
            .select("*")
            .eq("class_id", class_id)
            .eq("code", criteria_code)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if resp.data:
            return resp.data[0]
        raise HTTPException(
            status_code=422,
            detail=f"Tiêu chí '{criteria_code}' không tồn tại hoặc không active trong lớp này.",
        )

    mapping_resp = (
        supabase.table("event_criteria_mappings")
        .select("criteria_id")
        .eq("class_id", class_id)
        .eq("event_type_id", event_type_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not mapping_resp.data:
        raise HTTPException(
            status_code=422,
            detail=f"Loại sự kiện '{event_type_code}' chưa có tiêu chí tính điểm tự động trong lớp này.",
        )
    criteria_resp = (
        supabase.table("criteria")
        .select("*")
        .eq("id", mapping_resp.data[0]["criteria_id"])
        .eq("class_id", class_id)
        .eq("status", "active")
        .limit(1)
        .execute()
    )
    if not criteria_resp.data:
        raise HTTPException(status_code=422, detail="Tiêu chí được ánh xạ hiện không còn active.")
    return criteria_resp.data[0]


def _get_event_type(supabase, code: str) -> dict:
    resp = supabase.table("event_types").select("*").eq("code", code).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=422, detail=f"event_type_code '{code}' chưa tồn tại.")
    return resp.data[0]


def record_student_event(data: RecordEventInput) -> dict:
    """
    Ghi nhận 1 sự việc, tự đối chiếu tiêu chí, tạo Score Transaction (DRAFT).
    Trả về dict {event, transaction}.
    Raise DuplicateEventError nếu trùng (dựa vào unique index dedup_key trong DB).
    """
    supabase = get_supabase()

    enrollment = (
        supabase.table("student_class_enrollments")
        .select("id")
        .eq("student_id", data.student_id)
        .eq("class_id", data.class_id)
        .is_("left_at", None)
        .limit(1)
        .execute()
    )
    if not enrollment.data:
        raise HTTPException(status_code=422, detail="Học sinh không thuộc lớp đang ghi nhận.")

    event_type = _get_event_type(supabase, data.event_type_code)
    criteria = _resolve_criteria(supabase, data.class_id, event_type["id"], data.event_type_code, data.criteria_code)

    week = None
    if data.week_id:
        week_resp = supabase.table("competition_weeks").select("*").eq("id", data.week_id).limit(1).execute()
        if not week_resp.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
        week = week_resp.data[0]
    else:
        week = _get_active_week(supabase, data.class_id, data.event_date)

    if not week:
        raise HTTPException(status_code=422, detail="Ngày ghi nhận chưa thuộc tuần thi đua nào của lớp.")
    if week["class_id"] != data.class_id:
        raise HTTPException(status_code=422, detail="Tuần thi đua không thuộc lớp đang ghi nhận.")
    if not (week["start_date"] <= data.event_date.isoformat() <= week["end_date"]):
        raise HTTPException(status_code=422, detail="Ngày sự việc nằm ngoài khoảng thời gian của tuần thi đua.")

    if week and week.get("status") != "open":
        raise HTTPException(
            status_code=423,
            detail="Tuần thi đua không ở trạng thái mở. Cần mở khóa trước khi ghi nhận thêm sự việc.",
        )

    enabled_criteria = (
        supabase.table("competition_week_criteria")
        .select("id")
        .eq("week_id", week["id"])
        .eq("criteria_id", criteria["id"])
        .limit(1)
        .execute()
    )
    if not enabled_criteria.data:
        raise HTTPException(
            status_code=422,
            detail=f"Tiêu chí '{criteria['name']}' chưa được bật cho tuần thi đua này.",
        )

    event_payload = {
        "student_id": data.student_id,
        "class_id": data.class_id,
        "week_id": week["id"] if week else None,
        "event_type_id": event_type["id"],
        "criteria_id": criteria["id"],
        "event_date": data.event_date.isoformat(),
        "period": data.period,
        "subject_id": data.subject_id,
        "note": data.note,
        "evidence_url": data.evidence_url,
        "created_by": data.created_by,
        "lesson_id": data.lesson_id,
    }

    try:
        event_resp = supabase.table("student_events").insert(event_payload).execute()
    except APIError as exc:
        # Vi phạm unique index dedup_key (Postgres code 23505)
        if getattr(exc, "code", None) == "23505" or "duplicate" in str(exc).lower():
            raise DuplicateEventError() from exc
        raise HTTPException(status_code=500, detail=f"Lỗi ghi sự việc: {exc}") from exc

    event = event_resp.data[0]

    signed_points = criteria["points"] if criteria["kind"] == "ADD" else -criteria["points"]

    tx_payload = {
        "student_event_id": event["id"],
        "student_id": data.student_id,
        "class_id": data.class_id,
        "week_id": week["id"] if week else None,
        "system_points": signed_points,
        "criteria_code_snapshot": criteria["code"],
        "criteria_name_snapshot": criteria["name"],
        "status": "SUBMITTED",
        "submitted_by": data.created_by,
        "submitted_at": "now()",
    }
    try:
        tx_resp = supabase.table("score_transactions").insert(tx_payload).execute()
    except Exception as exc:  # noqa: BLE001
        supabase.table("student_events").delete().eq("id", event["id"]).execute()
        raise HTTPException(status_code=500, detail="Không thể tạo giao dịch điểm cho sự việc.") from exc
    transaction = tx_resp.data[0]

    _write_audit(
        supabase,
        actor_id=data.created_by,
        action="CREATE",
        entity="score_transactions",
        entity_id=transaction["id"],
        before=None,
        after=transaction,
        reason=None,
    )

    return {"event": event, "transaction": transaction}


def approve_transaction(transaction_id: str, approver_id: str) -> dict:
    """GVCN APPROVE: chấp nhận điểm hệ thống tính, không đổi số điểm."""
    supabase = get_supabase()
    before = _get_transaction_or_404(supabase, transaction_id)
    if before["status"] not in ("DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK", "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW"):
        raise HTTPException(status_code=409, detail="Giao dịch điểm không còn ở trạng thái chờ duyệt.")

    resp = (
        supabase.table("score_transactions")
        .update({"status": "APPROVED", "reviewed_by": approver_id, "reviewed_at": "now()"})
        .eq("id", transaction_id)
        .execute()
    )
    after = resp.data[0]
    _write_audit(supabase, approver_id, "APPROVE", "score_transactions", transaction_id, before, after, None)
    create_and_send_notifications_for_transaction(after)
    return after


def adjust_transaction(transaction_id: str, approver_id: str, adjusted_points: float, reason: str) -> dict:
    """GVCN ADJUST: bắt buộc phải có lý do, lưu cả điểm hệ thống lẫn điểm điều chỉnh."""
    supabase = get_supabase()
    before = _get_transaction_or_404(supabase, transaction_id)

    if before["status"] not in ("DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK", "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW", "APPROVED", "ADJUSTED"):
        raise HTTPException(status_code=409, detail="Giao dịch điểm không còn ở trạng thái có thể điều chỉnh.")

    if not reason or not reason.strip():
        raise HTTPException(status_code=422, detail="Phải nhập lý do khi điều chỉnh điểm.")

    resp = (
        supabase.table("score_transactions")
        .update(
            {
                "status": "ADJUSTED",
                "adjusted_points": adjusted_points,
                "adjust_reason": reason,
                "adjusted_by": approver_id,
                "adjusted_at": "now()",
                "reviewed_by": approver_id,
                "reviewed_at": "now()",
            }
        )
        .eq("id", transaction_id)
        .execute()
    )
    after = resp.data[0]
    _write_audit(supabase, approver_id, "ADJUST", "score_transactions", transaction_id, before, after, reason)
    create_and_send_notifications_for_transaction(after)
    return after


def _get_transaction_or_404(supabase, transaction_id: str) -> dict:
    resp = supabase.table("score_transactions").select("*").eq("id", transaction_id).limit(1).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy score transaction.")
    return resp.data[0]


def _write_audit(supabase, actor_id, action, entity, entity_id, before, after, reason):
    supabase.table("audit_logs").insert(
        {
            "actor_id": actor_id,
            "action": action,
            "entity": entity,
            "entity_id": entity_id,
            "before_data": before,
            "after_data": after,
            "reason": reason,
        }
    ).execute()
