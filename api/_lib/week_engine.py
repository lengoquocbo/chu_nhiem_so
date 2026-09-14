"""
Chốt tuần thi đua (LOCK) + tính weekly_score_summary.

Chỉ tổng hợp từ score_transactions có status trong
('APPROVED','ADJUSTED') - transaction còn ở DRAFT/SUBMITTED/...
(chưa qua GVCN duyệt) KHÔNG được tính vào điểm.
"""
from __future__ import annotations

from datetime import date

from fastapi import HTTPException

from .supabase_client import get_supabase

START_SCORE_DEFAULT = 100
MIN_SCORE = 0
COUNTED_STATUSES = ("APPROVED", "ADJUSTED", "LOCKED")


def _validated_criteria_ids(supabase, class_id: str, criteria_ids: list[str]) -> list[str]:
    unique_ids = list(dict.fromkeys(criteria_ids))
    if not unique_ids:
        raise HTTPException(status_code=422, detail="Phải chọn ít nhất một tiêu chí cho tuần thi đua.")

    criteria_resp = (
        supabase.table("criteria")
        .select("id")
        .eq("class_id", class_id)
        .eq("status", "active")
        .in_("id", unique_ids)
        .execute()
    )
    valid_ids = {row["id"] for row in (criteria_resp.data or [])}
    if valid_ids != set(unique_ids):
        raise HTTPException(status_code=422, detail="Có tiêu chí không tồn tại, đã ngừng dùng hoặc thuộc lớp khác.")
    return unique_ids


def create_week(
    class_id: str,
    school_year_id: str,
    academic_term_id: str,
    week_number: int,
    start_date: date,
    end_date: date,
    criteria_ids: list[str],
    actor_id: str,
) -> dict:
    supabase = get_supabase()
    selected_ids = _validated_criteria_ids(supabase, class_id, criteria_ids)
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.")
    class_resp = supabase.table("classes").select("school_year_id").eq("id", class_id).limit(1).execute()
    if not class_resp.data or class_resp.data[0]["school_year_id"] != school_year_id:
        raise HTTPException(status_code=422, detail="Năm học không khớp với lớp đang tạo tuần.")
    term_resp = (
        supabase.table("academic_terms").select("id,school_year_id,start_date,end_date")
        .eq("id", academic_term_id).eq("school_year_id", school_year_id).limit(1).execute()
    )
    if not term_resp.data:
        raise HTTPException(status_code=422, detail="Học kỳ không thuộc năm học đã chọn.")
    term = term_resp.data[0]
    if start_date.isoformat() < term["start_date"] or end_date.isoformat() > term["end_date"]:
        raise HTTPException(status_code=422, detail="Thời gian tuần phải nằm trong học kỳ đã chọn.")

    try:
        week_resp = supabase.table("competition_weeks").insert(
            {
                "class_id": class_id,
                "school_year_id": school_year_id,
                "academic_term_id": academic_term_id,
                "week_number": week_number,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "created_by": actor_id,
            }
        ).execute()
        week = week_resp.data[0]
        supabase.table("competition_week_criteria").insert(
            [{"week_id": week["id"], "class_id": class_id, "criteria_id": criteria_id} for criteria_id in selected_ids]
        ).execute()
    except Exception as exc:  # noqa: BLE001
        if "week" in locals():
            supabase.table("competition_weeks").delete().eq("id", week["id"]).execute()
        raise HTTPException(status_code=422, detail=f"Không thể tạo tuần thi đua: {exc}") from exc

    supabase.table("audit_logs").insert(
        {
            "actor_id": actor_id,
            "action": "CREATE",
            "entity": "competition_weeks",
            "entity_id": week["id"],
            "before_data": None,
            "after_data": {**week, "criteria_ids": selected_ids},
            "reason": None,
        }
    ).execute()
    return {**week, "criteria_ids": selected_ids}


def update_week(
    week_id: str,
    class_id: str,
    week_number: int,
    start_date: date,
    end_date: date,
    criteria_ids: list[str],
    actor_id: str,
) -> dict:
    supabase = get_supabase()
    selected_ids = _validated_criteria_ids(supabase, class_id, criteria_ids)
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.")

    before_resp = supabase.table("competition_weeks").select("*").eq("id", week_id).limit(1).execute()
    if not before_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
    before = before_resp.data[0]
    if before["class_id"] != class_id:
        raise HTTPException(status_code=422, detail="Tuần thi đua không thuộc lớp đang thao tác.")
    if before["status"] == "locked":
        raise HTTPException(status_code=423, detail="Phải mở khóa tuần trước khi chỉnh sửa.")

    old_links = supabase.table("competition_week_criteria").select("criteria_id").eq("week_id", week_id).execute()
    old_ids = [row["criteria_id"] for row in (old_links.data or [])]
    try:
        after_resp = supabase.table("competition_weeks").update(
            {
                "week_number": week_number,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
            }
        ).eq("id", week_id).execute()
        supabase.table("competition_week_criteria").delete().eq("week_id", week_id).execute()
        supabase.table("competition_week_criteria").insert(
            [{"week_id": week_id, "class_id": class_id, "criteria_id": criteria_id} for criteria_id in selected_ids]
        ).execute()
    except Exception as exc:  # noqa: BLE001
        # Supabase REST không hỗ trợ transaction nhiều request; khôi phục trạng thái
        # cũ nếu bước cập nhật danh sách tiêu chí thất bại.
        try:
            supabase.table("competition_weeks").update(
                {
                    "week_number": before["week_number"],
                    "start_date": before["start_date"],
                    "end_date": before["end_date"],
                }
            ).eq("id", week_id).execute()
            supabase.table("competition_week_criteria").delete().eq("week_id", week_id).execute()
            if old_ids:
                supabase.table("competition_week_criteria").insert(
                    [{"week_id": week_id, "class_id": class_id, "criteria_id": criteria_id} for criteria_id in old_ids]
                ).execute()
        except Exception:  # noqa: BLE001
            pass
        raise HTTPException(status_code=422, detail=f"Không thể cập nhật tuần thi đua: {exc}") from exc

    after = after_resp.data[0]
    supabase.table("audit_logs").insert(
        {
            "actor_id": actor_id,
            "action": "UPDATE",
            "entity": "competition_weeks",
            "entity_id": week_id,
            "before_data": {**before, "criteria_ids": old_ids},
            "after_data": {**after, "criteria_ids": selected_ids},
            "reason": None,
        }
    ).execute()
    return {**after, "criteria_ids": selected_ids}


def _effective_points(tx: dict) -> float:
    return tx["adjusted_points"] if tx.get("adjusted_points") is not None else tx["system_points"]


def _resolve_rank(supabase, class_id: str, score: float) -> str | None:
    for query in (
        supabase.table("rank_configs").select("*").eq("class_id", class_id),
        supabase.table("rank_configs").select("*").is_("class_id", None),
    ):
        resp = query.lte("min_score", score).gte("max_score", score).limit(1).execute()
        if resp.data:
            return resp.data[0]["label"]
    # Điểm thi đua có thể vượt 100; dùng mức có ngưỡng tối thiểu cao nhất.
    for query in (
        supabase.table("rank_configs").select("*").eq("class_id", class_id),
        supabase.table("rank_configs").select("*").is_("class_id", None),
    ):
        resp = query.lte("min_score", score).order("min_score", desc=True).limit(1).execute()
        if resp.data:
            return resp.data[0]["label"]
    return None


def compute_weekly_summary(week_id: str, persist: bool = True) -> list[dict]:
    """Tính (và ghi đè) weekly_score_summary cho toàn bộ học sinh có transaction trong tuần."""
    supabase = get_supabase()

    week_resp = supabase.table("competition_weeks").select("*").eq("id", week_id).limit(1).execute()
    if not week_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
    week = week_resp.data[0]

    enrollment_resp = (
        supabase.table("student_class_enrollments")
        .select("student_id")
        .eq("class_id", week["class_id"])
        .is_("left_at", None)
        .execute()
    )
    student_ids = [row["student_id"] for row in (enrollment_resp.data or [])]

    tx_resp = (
        supabase.table("score_transactions")
        .select("*")
        .eq("week_id", week_id)
        .in_("status", COUNTED_STATUSES)
        .execute()
    )
    transactions = tx_resp.data or []

    by_student: dict[str, list[dict]] = {student_id: [] for student_id in student_ids}
    for tx in transactions:
        by_student.setdefault(tx["student_id"], []).append(tx)

    results = []
    for student_id, txs in by_student.items():
        total_add = sum(p for p in (_effective_points(t) for t in txs) if p > 0)
        total_deduct = sum(-p for p in (_effective_points(t) for t in txs) if p < 0)
        raw_score = START_SCORE_DEFAULT + total_add - total_deduct
        final_score = max(MIN_SCORE, raw_score)
        rank_label = _resolve_rank(supabase, week["class_id"], final_score)

        row = {
            "student_id": student_id,
            "class_id": week["class_id"],
            "week_id": week_id,
            "start_score": START_SCORE_DEFAULT,
            "total_add": total_add,
            "total_deduct": total_deduct,
            "final_score": final_score,
            "rank_label": rank_label,
            "computed_at": "now()",
        }
        if persist:
            supabase.table("weekly_score_summary").upsert(row, on_conflict="student_id,week_id").execute()
        results.append(row)

    return results


def lock_week(week_id: str, actor_id: str) -> dict:
    """Tính summary rồi khóa tuần. Yêu cầu mọi transaction phải đã qua duyệt
    (không còn DRAFT/SUBMITTED/CLASS_LEADER_CHECK/... đang chờ)."""
    supabase = get_supabase()

    week_resp = supabase.table("competition_weeks").select("*").eq("id", week_id).limit(1).execute()
    if not week_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
    week = week_resp.data[0]
    if week["status"] == "locked":
        raise HTTPException(status_code=409, detail="Tuần này đã LOCKED rồi.")

    pending_resp = (
        supabase.table("score_transactions")
        .select("id", count="exact")
        .eq("week_id", week_id)
        .not_.in_("status", list(COUNTED_STATUSES) + ["REJECTED"])
        .execute()
    )
    if (pending_resp.count or 0) > 0:
        raise HTTPException(
            status_code=422,
            detail="Vẫn còn Score Transaction chưa được duyệt (APPROVE/ADJUST/REJECT) trong tuần này.",
        )

    compute_weekly_summary(week_id)

    supabase.table("score_transactions").update({"status": "LOCKED", "locked_at": "now()"}).eq("week_id", week_id).in_(
        "status", ["APPROVED", "ADJUSTED"]
    ).execute()

    before = week
    after_resp = (
        supabase.table("competition_weeks")
        .update({"status": "locked", "locked_at": "now()", "locked_by": actor_id})
        .eq("id", week_id)
        .execute()
    )
    after = after_resp.data[0]

    supabase.table("audit_logs").insert(
        {
            "actor_id": actor_id,
            "action": "LOCK",
            "entity": "competition_weeks",
            "entity_id": week_id,
            "before_data": before,
            "after_data": after,
            "reason": None,
        }
    ).execute()

    return after


def unlock_week(week_id: str, actor_id: str, reason: str) -> dict:
    """Mở khóa tuần: bắt buộc lý do, ghi audit. Dùng khi cần sửa dữ liệu đã LOCKED."""
    supabase = get_supabase()
    if not reason or not reason.strip():
        raise HTTPException(status_code=422, detail="Phải nhập lý do khi mở khóa tuần.")

    before_resp = supabase.table("competition_weeks").select("*").eq("id", week_id).limit(1).execute()
    if not before_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
    before = before_resp.data[0]
    if before["status"] != "locked":
        raise HTTPException(status_code=409, detail="Tuần này chưa được khóa.")

    supabase.table("score_transactions").update({"status": "APPROVED", "locked_at": None}).eq(
        "week_id", week_id
    ).eq("status", "LOCKED").execute()
    supabase.table("weekly_score_summary").delete().eq("week_id", week_id).execute()

    after_resp = (
        supabase.table("competition_weeks")
        .update({"status": "open", "locked_at": None, "locked_by": None})
        .eq("id", week_id)
        .execute()
    )
    after = after_resp.data[0]

    supabase.table("audit_logs").insert(
        {
            "actor_id": actor_id,
            "action": "UNLOCK",
            "entity": "competition_weeks",
            "entity_id": week_id,
            "before_data": before,
            "after_data": after,
            "reason": reason,
        }
    ).execute()

    return after
