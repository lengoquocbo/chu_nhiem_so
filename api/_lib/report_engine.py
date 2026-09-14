"""
Báo cáo. KHÔNG quét lại raw score_transactions - luôn đọc từ
weekly_score_summary (đã tính khi chốt tuần) hoặc tổng hợp tiếp lên
period_score_summary (tháng/kỳ/năm) từ chính các tuần đã LOCKED.
"""
from __future__ import annotations

from datetime import date

from fastapi import HTTPException

from .supabase_client import get_supabase
from .week_engine import compute_weekly_summary


def weekly_class_report(class_id: str, week_id: str) -> dict:
    supabase = get_supabase()

    summary_resp = (
        supabase.table("weekly_score_summary")
        .select("*, students(full_name, student_code)")
        .eq("class_id", class_id)
        .eq("week_id", week_id)
        .execute()
    )
    rows = summary_resp.data or []
    if not rows:
        return {"class_id": class_id, "week_id": week_id, "students": [], "class_average": None}

    avg = sum(r["final_score"] for r in rows) / len(rows)
    return {
        "class_id": class_id,
        "week_id": week_id,
        "students": rows,
        "class_average": round(avg, 2),
        "rank_distribution": _count_ranks(rows),
    }


def _count_ranks(rows: list[dict]) -> dict:
    counts: dict[str, int] = {}
    for r in rows:
        label = r.get("rank_label") or "Chưa xếp loại"
        counts[label] = counts.get(label, 0) + 1
    return counts


def group_report(group_id: str, week_id: str) -> dict:
    supabase = get_supabase()

    members_resp = (
        supabase.table("group_members")
        .select("student_id")
        .eq("group_id", group_id)
        .is_("left_at", None)
        .execute()
    )
    student_ids = [m["student_id"] for m in (members_resp.data or [])]
    if not student_ids:
        return {"group_id": group_id, "week_id": week_id, "students": [], "average": None}

    summary_resp = (
        supabase.table("weekly_score_summary")
        .select("*, students(full_name, student_code)")
        .eq("week_id", week_id)
        .in_("student_id", student_ids)
        .execute()
    )
    rows = summary_resp.data or []
    avg = sum(r["final_score"] for r in rows) / len(rows) if rows else None
    return {"group_id": group_id, "week_id": week_id, "students": rows, "average": round(avg, 2) if avg is not None else None}


def compute_period_summary(
    class_id: str, school_year_id: str, period_type: str, period_label: str, week_ids: list[str]
) -> list[dict]:
    """
    Tổng hợp period (tháng/kỳ/năm) TỪ các weekly_score_summary đã có
    (chỉ nên gọi với các week đã LOCKED). Không đọc lại raw transaction.
    """
    if period_type not in ("month", "semester", "year"):
        raise HTTPException(status_code=422, detail="period_type phải là month/semester/year")

    supabase = get_supabase()

    weeks_resp = (
        supabase.table("weekly_score_summary")
        .select("*")
        .eq("class_id", class_id)
        .in_("week_id", week_ids)
        .execute()
    )
    rows = weeks_resp.data or []

    by_student: dict[str, list[dict]] = {}
    for r in rows:
        by_student.setdefault(r["student_id"], []).append(r)

    results = []
    for student_id, weeks in by_student.items():
        avg_score = sum(w["final_score"] for w in weeks) / len(weeks)
        total_add = sum(w["total_add"] for w in weeks)
        total_deduct = sum(w["total_deduct"] for w in weeks)
        rank_label = _resolve_rank_simple(supabase, class_id, avg_score)

        row = {
            "student_id": student_id,
            "class_id": class_id,
            "school_year_id": school_year_id,
            "period_type": period_type,
            "period_label": period_label,
            "avg_score": round(avg_score, 2),
            "total_add": total_add,
            "total_deduct": total_deduct,
            "rank_label": rank_label,
            "computed_at": "now()",
        }
        supabase.table("period_score_summary").upsert(
            row, on_conflict="student_id,school_year_id,period_type,period_label"
        ).execute()
        results.append(row)

    return results


def _resolve_rank_simple(supabase, class_id: str, score: float) -> str | None:
    for query in (
        supabase.table("rank_configs").select("*").eq("class_id", class_id),
        supabase.table("rank_configs").select("*").is_("class_id", None),
    ):
        resp = query.lte("min_score", score).gte("max_score", score).limit(1).execute()
        if resp.data:
            return resp.data[0]["label"]
    for query in (
        supabase.table("rank_configs").select("*").eq("class_id", class_id),
        supabase.table("rank_configs").select("*").is_("class_id", None),
    ):
        resp = query.lte("min_score", score).order("min_score", desc=True).limit(1).execute()
        if resp.data:
            return resp.data[0]["label"]
    return None


def student_history(
    student_id: str,
    school_year_id: str | None = None,
    academic_term_id: str | None = None,
    week_id: str | None = None,
) -> dict:
    """Lịch sử thi đua của học sinh trong đúng năm học và học kỳ được chọn."""
    supabase = get_supabase()

    enrollments = (
        supabase.table("student_class_enrollments").select("class_id,school_year_id")
        .eq("student_id", student_id).execute().data or []
    )
    enrolled_year_ids = list(dict.fromkeys(row["school_year_id"] for row in enrollments))
    if not enrolled_year_ids:
        return {
            "school_years": [], "terms": [], "selected_school_year_id": None,
            "selected_term_id": None, "weeks": [], "selected_week_id": None, "current_summary": None,
            "weekly_summary": [], "recent_transactions": [],
        }
    years = (
        supabase.table("school_years").select("id,name,start_date,end_date,status")
        .in_("id", enrolled_year_ids).order("start_date", desc=True).execute().data or []
    )
    valid_year_ids = {row["id"] for row in years}
    if school_year_id and school_year_id not in valid_year_ids:
        raise HTTPException(status_code=403, detail="Năm học không thuộc quá trình học của bạn.")
    selected_year_id = school_year_id or next(
        (row["id"] for row in years if row["status"] == "active"),
        years[0]["id"] if years else None,
    )
    terms = (
        supabase.table("academic_terms").select("id,school_year_id,name,term_number,start_date,end_date,status")
        .eq("school_year_id", selected_year_id).order("term_number").execute().data or []
    )
    valid_term_ids = {row["id"] for row in terms}
    if academic_term_id and academic_term_id not in valid_term_ids:
        raise HTTPException(status_code=422, detail="Học kỳ không thuộc năm học đã chọn.")
    selected_term_id = academic_term_id or next(
        (row["id"] for row in terms if row["status"] == "active"),
        terms[0]["id"] if terms else None,
    )
    class_ids = list(dict.fromkeys(
        row["class_id"] for row in enrollments if row["school_year_id"] == selected_year_id
    ))

    if not selected_term_id or not class_ids:
        return {
            "school_years": years, "terms": terms,
            "selected_school_year_id": selected_year_id, "selected_term_id": selected_term_id,
            "weeks": [], "selected_week_id": None, "current_summary": None,
            "weekly_summary": [], "recent_transactions": [],
        }

    weeks = (
        supabase.table("competition_weeks").select("id,class_id,week_number,start_date,end_date,status")
        .in_("class_id", class_ids).eq("academic_term_id", selected_term_id)
        .order("start_date", desc=True).execute().data or []
    )
    valid_week_ids = {row["id"] for row in weeks}
    if week_id and week_id not in valid_week_ids:
        raise HTTPException(status_code=422, detail="Tuần không thuộc học kỳ đã chọn.")
    today = date.today().isoformat()
    selected_week_id = week_id or next(
        (row["id"] for row in weeks if row["start_date"] <= today <= row["end_date"]),
        next((row["id"] for row in weeks if row["status"] == "open"), weeks[0]["id"] if weeks else None),
    )

    weekly = (
        supabase.table("weekly_score_summary")
        .select("*, competition_weeks!inner(week_number,start_date,end_date,status,school_year_id,academic_term_id)")
        .eq("student_id", student_id).in_("class_id", class_ids)
        .eq("competition_weeks.academic_term_id", selected_term_id)
        .execute()
    )
    weekly_rows = sorted(
        weekly.data or [],
        key=lambda row: (row.get("competition_weeks") or {}).get("start_date") or "",
        reverse=True,
    )
    current_summary = _current_student_summary(supabase, student_id, weeks, selected_week_id)
    transaction_rows = []
    if selected_week_id:
        transactions = (
            supabase.table("score_transactions")
            .select("*, competition_weeks!inner(school_year_id,academic_term_id)")
            .eq("student_id", student_id).in_("class_id", class_ids)
            .eq("competition_weeks.academic_term_id", selected_term_id)
            .eq("week_id", selected_week_id)
            .in_("status", ["APPROVED", "ADJUSTED", "LOCKED"])
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        transaction_rows = transactions.data or []
    return {
        "school_years": years,
        "terms": terms,
        "selected_school_year_id": selected_year_id,
        "selected_term_id": selected_term_id,
        "weeks": weeks,
        "selected_week_id": selected_week_id,
        "current_summary": current_summary,
        "weekly_summary": weekly_rows,
        "recent_transactions": transaction_rows,
    }


def _current_student_summary(
    supabase,
    student_id: str,
    weeks: list[dict],
    selected_week_id: str | None,
) -> dict | None:
    """Điểm của tuần được chọn: tuần mở tính trực tiếp, tuần khóa dùng summary chính thức."""
    if not weeks or not selected_week_id:
        return None
    week = next((item for item in weeks if item["id"] == selected_week_id), None)
    if not week:
        return None

    if week["status"] == "locked":
        saved = (
            supabase.table("weekly_score_summary").select("*").eq("student_id", student_id)
            .eq("week_id", week["id"]).limit(1).execute().data or []
        )
        summary = saved[0] if saved else None
    else:
        summary = next(
            (item for item in compute_weekly_summary(week["id"], persist=False) if item["student_id"] == student_id),
            None,
        )
    if not summary:
        return None
    return {**summary, "competition_weeks": {
        "week_number": week["week_number"], "start_date": week["start_date"],
        "end_date": week["end_date"], "status": week["status"],
    }}
