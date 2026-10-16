"""Nghiệp vụ sổ đầu bài điện tử theo lớp và tuần."""
from __future__ import annotations

from datetime import date, timedelta

from fastapi import HTTPException

from .score_engine import DuplicateEventError, RecordEventInput, approve_transaction, record_student_event
from .supabase_client import get_supabase

RATINGS = {"Tốt", "Khá", "Đạt", "Chưa đạt"}
ATTENDANCE_STATUSES = {"present", "late", "unexcused_absent", "excused_absent", "left_early", "skipped"}

ATTENDANCE_CRITERIA = {
    "late": ("ATTENDANCE_LATE", {"Đi muộn", "Đi trễ"}),
    "unexcused_absent": ("ATTENDANCE_ABSENT_UNEXCUSED", {"Vắng không phép", "Nghỉ không phép", "Vắng học không phép"}),
    "excused_absent": (None, {"Vắng có phép"}),
    "left_early": ("ATTENDANCE_LEFT_EARLY", {"Về sớm không phép"}),
    "skipped": (None, {"Bỏ tiết"}),
}


def _attendance_criterion(db, class_id: str, status: str, criteria: list[dict]) -> str | None:
    if status == "present":
        return None
    event_code, names = ATTENDANCE_CRITERIA[status]
    active = [c for c in criteria if c.get("status") == "active"]
    mapped_id = None
    if event_code:
        event_types = db.table("event_types").select("id").eq("code", event_code).limit(1).execute().data or []
        if event_types:
            mappings = db.table("event_criteria_mappings").select("criteria_id").eq("class_id", class_id).eq("event_type_id", event_types[0]["id"]).eq("status", "active").limit(1).execute().data or []
            if mappings:
                mapped_id = mappings[0]["criteria_id"]
    matches = [c for c in active if c["id"] == mapped_id] if mapped_id else [c for c in active if c.get("name", "").strip().casefold() in {n.casefold() for n in names}]
    if len(matches) != 1:
        raise HTTPException(status_code=422, detail=f"Chưa xác định được tiêu chí điểm danh '{status}'. GVCN cần cấu hình tiêu chí tương ứng và bật cho tuần này.")
    if status != "excused_absent" and matches[0].get("kind") != "DEDUCT":
        raise HTTPException(status_code=422, detail="Tiêu chí vi phạm điểm danh phải là tiêu chí trừ điểm.")
    return matches[0]["id"]


def _audit(db, actor_id: str, action: str, entity: str, entity_id: str, before, after, reason=None) -> None:
    db.table("audit_logs").insert({
        "actor_id": actor_id, "action": action, "entity": entity, "entity_id": entity_id,
        "before_data": before, "after_data": after, "reason": reason,
    }).execute()


def _get_week(db, week_id: str, class_id: str | None = None) -> dict:
    response = db.table("competition_weeks").select("*").eq("id", week_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
    week = response.data[0]
    if class_id and week["class_id"] != class_id:
        raise HTTPException(status_code=422, detail="Tuần thi đua không thuộc lớp đang thao tác.")
    return week


def _require_open_week(db, week_id: str, class_id: str | None = None) -> dict:
    week = _get_week(db, week_id, class_id)
    if week["status"] != "open":
        raise HTTPException(status_code=423, detail="Tuần thi đua đã khóa; không thể cập nhật sổ đầu bài.")
    return week


def _get_lesson(db, lesson_id: str, class_id: str | None = None) -> dict:
    response = db.table("lesson_book_entries").select("*").eq("id", lesson_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tiết học.")
    lesson = response.data[0]
    if class_id and lesson["class_id"] != class_id:
        raise HTTPException(status_code=422, detail="Tiết học không thuộc lớp đang thao tác.")
    return lesson


def list_timetable(class_id: str) -> list[dict]:
    db = get_supabase()
    response = (
        db.table("timetable_entries")
        .select("*, subjects(name), profiles!timetable_entries_teacher_id_fkey(full_name)")
        .eq("class_id", class_id).eq("status", "active")
        .order("weekday").order("period").execute()
    )
    return response.data or []


def timetable_options(class_id: str) -> dict:
    db = get_supabase()
    assignments = (
        db.table("class_subject_teachers")
        .select("teacher_id, subject_id, subjects(id,name), profiles!class_subject_teachers_teacher_id_fkey(id,full_name)")
        .eq("class_id", class_id).eq("status", "active").execute()
    )
    return {"assignments": assignments.data or []}


def save_timetable_entry(class_id: str, weekday: int, period: int, subject_id: str, teacher_id: str, actor_id: str, entry_id: str | None = None) -> dict:
    db = get_supabase()
    if weekday not in range(1, 8) or period not in range(1, 16):
        raise HTTPException(status_code=422, detail="Thứ hoặc tiết học không hợp lệ.")
    assignment = (
        db.table("class_subject_teachers").select("id").eq("class_id", class_id)
        .eq("subject_id", subject_id).eq("teacher_id", teacher_id).eq("status", "active").limit(1).execute()
    )
    if not assignment.data:
        raise HTTPException(status_code=422, detail="Giáo viên chưa được phân công môn này trong lớp.")

    today = date.today()
    effective_from = today
    before = None
    if entry_id:
        old = db.table("timetable_entries").select("*").eq("id", entry_id).eq("class_id", class_id).limit(1).execute()
        if not old.data:
            raise HTTPException(status_code=404, detail="Không tìm thấy dòng thời khóa biểu.")
        before = old.data[0]
        if date.fromisoformat(before["effective_from"]) > today:
            saved = db.table("timetable_entries").update({
                "weekday": weekday, "period": period, "subject_id": subject_id,
                "teacher_id": teacher_id, "updated_at": "now()",
            }).eq("id", entry_id).execute().data[0]
            _audit(db, actor_id, "UPDATE", "timetable_entries", entry_id, before, saved)
            return saved
        effective_from = today + timedelta(days=1)
        db.table("timetable_entries").update({"effective_to": today.isoformat(), "status": "inactive", "updated_at": "now()"}).eq("id", entry_id).execute()
        db.table("lesson_book_entries").delete().eq("timetable_entry_id", entry_id).gt("lesson_date", today.isoformat()).eq("attendance_status", "not_started").is_("lecture_content", None).execute()

    try:
        response = db.table("timetable_entries").insert({
            "class_id": class_id, "weekday": weekday, "period": period,
            "subject_id": subject_id, "teacher_id": teacher_id,
            "effective_from": effective_from.isoformat(), "created_by": actor_id,
        }).execute()
    except Exception as exc:  # noqa: BLE001
        if before:
            db.table("timetable_entries").update({"effective_to": before.get("effective_to"), "status": before["status"]}).eq("id", entry_id).execute()
        raise HTTPException(status_code=422, detail=f"Không thể lưu thời khóa biểu: {exc}") from exc
    saved = response.data[0]
    _audit(db, actor_id, "UPDATE" if before else "CREATE", "timetable_entries", saved["id"], before, saved)
    return saved


def remove_timetable_entry(entry_id: str, class_id: str, actor_id: str) -> dict:
    db = get_supabase()
    response = db.table("timetable_entries").select("*").eq("id", entry_id).eq("class_id", class_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy dòng thời khóa biểu.")
    before = response.data[0]
    today = date.today()
    if date.fromisoformat(before["effective_from"]) > today:
        db.table("lesson_book_entries").delete().eq("timetable_entry_id", entry_id).execute()
        db.table("timetable_entries").delete().eq("id", entry_id).execute()
        _audit(db, actor_id, "DELETE", "timetable_entries", entry_id, before, None)
        return before
    after = db.table("timetable_entries").update({"effective_to": today.isoformat(), "status": "inactive", "updated_at": "now()"}).eq("id", entry_id).execute().data[0]
    db.table("lesson_book_entries").delete().eq("timetable_entry_id", entry_id).gt("lesson_date", today.isoformat()).eq("attendance_status", "not_started").is_("lecture_content", None).execute()
    _audit(db, actor_id, "DELETE", "timetable_entries", entry_id, before, after)
    return after


def _ensure_lessons(db, week: dict) -> None:
    start = date.fromisoformat(week["start_date"])
    end = date.fromisoformat(week["end_date"])
    schedules = db.table("timetable_entries").select("*").eq("class_id", week["class_id"]).execute().data or []
    current = start
    rows = []
    while current <= end:
        for item in schedules:
            if item["weekday"] != current.isoweekday():
                continue
            if item["effective_from"] > current.isoformat() or (item.get("effective_to") and item["effective_to"] < current.isoformat()):
                continue
            rows.append({
                "class_id": week["class_id"], "week_id": week["id"], "timetable_entry_id": item["id"],
                "lesson_date": current.isoformat(), "period": item["period"], "subject_id": item["subject_id"],
                "teacher_id": item["teacher_id"], "source": "scheduled", "approval_status": "approved",
                "created_by": item.get("created_by"),
            })
        current += timedelta(days=1)
    if rows:
        existing = db.table("lesson_book_entries").select("lesson_date,period").eq("class_id", week["class_id"]).eq("week_id", week["id"]).eq("source", "scheduled").execute().data or []
        occupied = {(item["lesson_date"], item["period"]) for item in existing}
        missing = [row for row in rows if (row["lesson_date"], row["period"]) not in occupied]
        if missing:
            db.table("lesson_book_entries").insert(missing).execute()


def list_lessons(class_id: str, week_id: str) -> dict:
    db = get_supabase()
    week = _get_week(db, week_id, class_id)
    _ensure_lessons(db, week)
    lessons = (
        db.table("lesson_book_entries")
        .select("*, subjects(name), profiles!lesson_book_entries_teacher_id_fkey(full_name)")
        .eq("class_id", class_id).eq("week_id", week_id)
        .order("lesson_date").order("period").execute().data or []
    )
    enrollment_count = db.table("student_class_enrollments").select("id", count="exact").eq("class_id", class_id).is_("left_at", None).execute().count or 0
    for lesson in lessons:
        lesson["attendance_summary"] = "Chưa điểm danh"
        if lesson["attendance_status"] != "completed":
            continue
        session = db.table("attendance_sessions").select("id").eq("lesson_id", lesson["id"]).limit(1).execute().data or []
        records = db.table("attendance_records").select("attendance_status").eq("session_id", session[0]["id"]).execute().data if session else []
        absent = sum(1 for row in records if row["attendance_status"] in ("excused_absent", "unexcused_absent", "skipped"))
        late = sum(1 for row in records if row["attendance_status"] == "late")
        present = enrollment_count - absent
        lesson["attendance_summary"] = f"{present}/{enrollment_count} – vắng {absent}" + (f" – đi trễ {late}" if late else "")
    return {"week": week, "lessons": lessons}


def update_lesson(lesson_id: str, class_id: str, actor_id: str, lecture_content: str | None, collective_rating: str | None, collective_comment: str | None, notes: str | None) -> dict:
    db = get_supabase()
    before = _get_lesson(db, lesson_id, class_id)
    _require_open_week(db, before["week_id"], class_id)
    if before["approval_status"] != "approved":
        raise HTTPException(status_code=409, detail="Tiết phát sinh chưa được GVCN duyệt.")
    if collective_rating and collective_rating not in RATINGS:
        raise HTTPException(status_code=422, detail="Xếp loại tập thể không hợp lệ.")
    values = {"lecture_content": lecture_content or None, "collective_rating": collective_rating or None, "collective_comment": collective_comment or None, "notes": notes or None, "updated_at": "now()"}
    after = db.table("lesson_book_entries").update(values).eq("id", lesson_id).execute().data[0]
    _audit(db, actor_id, "UPDATE", "lesson_book_entries", lesson_id, before, after)
    return after


def request_extra_lesson(class_id: str, teacher_id: str, subject_id: str, lesson_date: date, period: int, reason: str) -> dict:
    db = get_supabase()
    if not reason.strip():
        raise HTTPException(status_code=422, detail="Phải nhập lý do thêm tiết phát sinh.")
    assignment = db.table("class_subject_teachers").select("id").eq("class_id", class_id).eq("teacher_id", teacher_id).eq("subject_id", subject_id).eq("status", "active").limit(1).execute()
    if not assignment.data:
        raise HTTPException(status_code=403, detail="Bạn không được phân công môn này trong lớp.")
    week_resp = db.table("competition_weeks").select("*").eq("class_id", class_id).lte("start_date", lesson_date.isoformat()).gte("end_date", lesson_date.isoformat()).limit(1).execute()
    if not week_resp.data:
        raise HTTPException(status_code=422, detail="Ngày học chưa thuộc tuần thi đua nào.")
    week = _require_open_week(db, week_resp.data[0]["id"], class_id)
    lesson = db.table("lesson_book_entries").insert({
        "class_id": class_id, "week_id": week["id"], "lesson_date": lesson_date.isoformat(), "period": period,
        "subject_id": subject_id, "teacher_id": teacher_id, "source": "extra", "extra_reason": reason.strip(),
        "approval_status": "pending", "created_by": teacher_id,
    }).execute().data[0]
    _audit(db, teacher_id, "REQUEST", "lesson_book_entries", lesson["id"], None, lesson, reason)
    return lesson


def review_extra_lesson(lesson_id: str, class_id: str, actor_id: str, approve: bool, note: str | None) -> dict:
    db = get_supabase()
    before = _get_lesson(db, lesson_id, class_id)
    _require_open_week(db, before["week_id"], class_id)
    if before["source"] != "extra" or before["approval_status"] != "pending":
        raise HTTPException(status_code=409, detail="Tiết này không còn chờ duyệt.")
    status = "approved" if approve else "rejected"
    after = db.table("lesson_book_entries").update({"approval_status": status, "approval_note": note, "reviewed_by": actor_id, "reviewed_at": "now()", "updated_at": "now()"}).eq("id", lesson_id).execute().data[0]
    _audit(db, actor_id, "APPROVE" if approve else "REJECT", "lesson_book_entries", lesson_id, before, after, note)
    return after


def attendance_detail(lesson_id: str, class_id: str) -> dict:
    db = get_supabase()
    lesson = _get_lesson(db, lesson_id, class_id)
    students_raw = db.table("student_class_enrollments").select("students(id,full_name)").eq("class_id", class_id).is_("left_at", None).execute().data or []
    students = [row["students"] for row in students_raw if row.get("students")]
    session = db.table("attendance_sessions").select("*").eq("lesson_id", lesson_id).limit(1).execute().data or []
    records = []
    if session:
        records = db.table("attendance_records").select("*").eq("session_id", session[0]["id"]).execute().data or []
    links = db.table("lesson_individual_criteria").select("student_id,criteria_id,note").eq("lesson_id", lesson_id).eq("status", "active").execute().data or []
    allowed = db.table("competition_week_criteria").select("criteria_id, criteria(*)").eq("week_id", lesson["week_id"]).execute().data or []
    criteria = [row["criteria"] for row in allowed if row.get("criteria") and row["criteria"].get("status") == "active"]
    attendance_mappings = {}
    for status in ATTENDANCE_CRITERIA:
        try:
            criteria_id = _attendance_criterion(db, class_id, status, criteria)
        except HTTPException:
            continue
        if criteria_id:
            criterion = next((item for item in criteria if item["id"] == criteria_id), None)
            if criterion:
                attendance_mappings[status] = {
                    "criteria_id": criterion["id"],
                    "criteria_code": criterion["code"],
                    "criteria_name": criterion["name"],
                    "points": -criterion["points"] if criterion["kind"] == "DEDUCT" else criterion["points"],
                }
    return {"lesson": lesson, "students": students, "records": records, "selections": links, "criteria": criteria, "attendance_mappings": attendance_mappings}


def save_attendance(lesson_id: str, class_id: str, actor_id: str, rows: list[dict]) -> dict:
    db = get_supabase()
    lesson = _get_lesson(db, lesson_id, class_id)
    _require_open_week(db, lesson["week_id"], class_id)
    if lesson["approval_status"] != "approved":
        raise HTTPException(status_code=409, detail="Tiết học chưa được duyệt.")
    before_detail = attendance_detail(lesson_id, class_id)

    # Validate the entire submission before persisting any attendance changes.
    allowed = {c["id"]: c["code"] for c in before_detail["criteria"]}
    enrolled = {s["id"] for s in before_detail["students"]}
    previous = {r["student_id"]: r["attendance_status"] for r in before_detail["records"]}
    resolved = {}
    prepared_rows = []
    seen = set()
    for row in rows:
        student_id = row["student_id"]
        status = row.get("attendance_status", "present")
        selected = set(row.get("criteria_ids") or [])
        if student_id not in enrolled or student_id in seen or status not in ATTENDANCE_STATUSES or not selected.issubset(allowed):
            raise HTTPException(status_code=422, detail="Dữ liệu điểm danh hoặc tiêu chí không hợp lệ.")
        seen.add(student_id)
        if status not in resolved:
            resolved[status] = _attendance_criterion(db, class_id, status, before_detail["criteria"])
        old_status = previous.get(student_id, "present")
        if old_status != status and old_status in ATTENDANCE_CRITERIA:
            try:
                old_id = _attendance_criterion(db, class_id, old_status, before_detail["criteria"])
                selected.discard(old_id)
            except HTTPException:
                pass  # An old disabled criterion must not block correcting attendance.
        if resolved[status]:
            selected.add(resolved[status])
        prepared_rows.append({**row, "criteria_ids": sorted(selected)})

    session_rows = db.table("attendance_sessions").select("*").eq("lesson_id", lesson_id).limit(1).execute().data or []
    if session_rows:
        session = session_rows[0]
    else:
        legacy = db.table("attendance_sessions").select("*").eq("class_id", class_id).eq("subject_id", lesson["subject_id"]).eq("session_date", lesson["lesson_date"]).eq("period", lesson["period"]).limit(1).execute().data or []
        if legacy:
            session = db.table("attendance_sessions").update({"lesson_id": lesson_id}).eq("id", legacy[0]["id"]).execute().data[0]
        else:
            session = db.table("attendance_sessions").insert({"lesson_id": lesson_id, "class_id": class_id, "subject_id": lesson["subject_id"], "teacher_id": lesson["teacher_id"], "session_date": lesson["lesson_date"], "period": lesson["period"]}).execute().data[0]

    for row in prepared_rows:
        student_id = row["student_id"]
        status = row.get("attendance_status", "present")
        note = row.get("note") or None
        selected_ids = list(dict.fromkeys(row.get("criteria_ids") or []))
        if student_id not in enrolled or status not in ATTENDANCE_STATUSES or not set(selected_ids).issubset(allowed):
            raise HTTPException(status_code=422, detail="Dữ liệu điểm danh hoặc tiêu chí không hợp lệ.")
        existing_record = db.table("attendance_records").select("id").eq("session_id", session["id"]).eq("student_id", student_id).limit(1).execute().data or []
        if existing_record:
            db.table("attendance_records").update({"attendance_status": status, "note": note, "updated_at": "now()"}).eq("id", existing_record[0]["id"]).execute()
        else:
            db.table("attendance_records").insert({"session_id": session["id"], "student_id": student_id, "attendance_status": status, "note": note, "created_by": actor_id}).execute()

        old_links = db.table("lesson_individual_criteria").select("*").eq("lesson_id", lesson_id).eq("student_id", student_id).eq("status", "active").execute().data or []
        old_ids = {link["criteria_id"] for link in old_links}
        for criteria_id in set(selected_ids) - old_ids:
            try:
                event_result = record_student_event(RecordEventInput(
                    student_id=student_id, class_id=class_id, event_type_code="CRITERIA_RECORD",
                    criteria_code=allowed[criteria_id], event_date=date.fromisoformat(lesson["lesson_date"]),
                    created_by=actor_id, period=lesson["period"], subject_id=lesson["subject_id"], note=note,
                    week_id=lesson["week_id"], lesson_id=lesson_id,
                ))
            except DuplicateEventError:
                continue
            db.table("lesson_individual_criteria").insert({"lesson_id": lesson_id, "student_id": student_id, "criteria_id": criteria_id, "transaction_id": event_result["transaction"]["id"], "note": note, "created_by": actor_id}).execute()
        for link in old_links:
            if link["criteria_id"] in selected_ids:
                continue
            db.table("lesson_individual_criteria").update({"status": "removed", "removed_by": actor_id, "removed_at": "now()"}).eq("id", link["id"]).execute()
            if link.get("transaction_id"):
                tx = db.table("score_transactions").select("student_event_id,status").eq("id", link["transaction_id"]).limit(1).execute().data or []
                if tx and tx[0]["status"] != "LOCKED":
                    db.table("score_transactions").update({"status": "REJECTED", "reviewed_by": actor_id, "reviewed_at": "now()"}).eq("id", link["transaction_id"]).execute()
                    db.table("student_events").update({"status": "void", "void_reason": "Bỏ tiêu chí khỏi sổ đầu bài", "voided_by": actor_id, "voided_at": "now()"}).eq("id", tx[0]["student_event_id"]).execute()

    db.table("attendance_sessions").update({"status": "confirmed", "confirmed_at": "now()"}).eq("id", session["id"]).execute()
    after = db.table("lesson_book_entries").update({"attendance_status": "completed", "attendance_completed_at": "now()", "updated_at": "now()"}).eq("id", lesson_id).execute().data[0]
    after_detail = attendance_detail(lesson_id, class_id)
    _audit(db, actor_id, "ATTENDANCE", "lesson_book_entries", lesson_id, before_detail, {"lesson": after, **after_detail})
    return after_detail


def revise_student_criteria(lesson_id: str, class_id: str, student_id: str, criteria_ids: list[str], actor_id: str) -> dict:
    """GVCN thay đổi bộ tiêu chí của một học sinh trong một tiết và xác nhận ngay."""
    db = get_supabase()
    lesson = _get_lesson(db, lesson_id, class_id)
    _require_open_week(db, lesson["week_id"], class_id)
    enrollment = db.table("student_class_enrollments").select("id").eq("class_id", class_id).eq("student_id", student_id).is_("left_at", None).limit(1).execute()
    if not enrollment.data:
        raise HTTPException(status_code=422, detail="Học sinh không thuộc lớp đang thao tác.")

    requested_ids = list(dict.fromkeys(criteria_ids))
    allowed_rows = db.table("competition_week_criteria").select("criteria_id, criteria(code)").eq("week_id", lesson["week_id"]).execute().data or []
    allowed = {row["criteria_id"]: row["criteria"]["code"] for row in allowed_rows if row.get("criteria") and row["criteria"].get("code")}
    if not set(requested_ids).issubset(allowed):
        raise HTTPException(status_code=422, detail="Có tiêu chí chưa được bật trong tuần thi đua.")

    old_links = db.table("lesson_individual_criteria").select("*").eq("lesson_id", lesson_id).eq("student_id", student_id).eq("status", "active").execute().data or []
    old_ids = {link["criteria_id"] for link in old_links}

    for link in old_links:
        transaction_id = link.get("transaction_id")
        if link["criteria_id"] not in requested_ids:
            db.table("lesson_individual_criteria").update({"status": "removed", "removed_by": actor_id, "removed_at": "now()"}).eq("id", link["id"]).execute()
            if transaction_id:
                tx_rows = db.table("score_transactions").select("*").eq("id", transaction_id).limit(1).execute().data or []
                if tx_rows and tx_rows[0]["status"] != "LOCKED":
                    before_tx = tx_rows[0]
                    after_tx = db.table("score_transactions").update({"status": "REJECTED", "reviewed_by": actor_id, "reviewed_at": "now()", "updated_at": "now()"}).eq("id", transaction_id).execute().data[0]
                    db.table("student_events").update({"status": "void", "void_reason": "GVCN bỏ tiêu chí khi duyệt", "voided_by": actor_id, "voided_at": "now()"}).eq("id", before_tx["student_event_id"]).execute()
                    _audit(db, actor_id, "REJECT", "score_transactions", transaction_id, before_tx, after_tx, "GVCN bỏ tiêu chí khi duyệt")
        elif transaction_id:
            tx = db.table("score_transactions").select("status").eq("id", transaction_id).limit(1).execute().data or []
            if tx and tx[0]["status"] in ("DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK", "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW"):
                approve_transaction(transaction_id, actor_id)

    for criteria_id in set(requested_ids) - old_ids:
        try:
            event_result = record_student_event(RecordEventInput(
                student_id=student_id, class_id=class_id, event_type_code="CRITERIA_RECORD",
                criteria_code=allowed[criteria_id], event_date=date.fromisoformat(lesson["lesson_date"]),
                created_by=actor_id, period=lesson["period"], subject_id=lesson["subject_id"],
                week_id=lesson["week_id"], lesson_id=lesson_id,
            ))
        except DuplicateEventError as exc:
            raise HTTPException(status_code=409, detail="Tiêu chí này đã được ghi nhận cho học sinh trong tiết học.") from exc
        db.table("lesson_individual_criteria").insert({
            "lesson_id": lesson_id, "student_id": student_id, "criteria_id": criteria_id,
            "transaction_id": event_result["transaction"]["id"], "created_by": actor_id,
        }).execute()
        approve_transaction(event_result["transaction"]["id"], actor_id)

    after_links = db.table("lesson_individual_criteria").select("criteria_id,transaction_id").eq("lesson_id", lesson_id).eq("student_id", student_id).eq("status", "active").execute().data or []
    _audit(db, actor_id, "REVIEW_CRITERIA", "lesson_book_entries", lesson_id, {"student_id": student_id, "criteria_ids": list(old_ids)}, {"student_id": student_id, "criteria_ids": requested_ids})
    return {"lesson_id": lesson_id, "student_id": student_id, "criteria": after_links}


def request_week_unlock(week_id: str, class_id: str, actor_id: str, reason: str) -> dict:
    db = get_supabase()
    week = _get_week(db, week_id, class_id)
    if week["status"] != "locked" or not reason.strip():
        raise HTTPException(status_code=422, detail="Tuần phải đang khóa và yêu cầu phải có lý do.")
    pending = db.table("week_unlock_requests").select("id").eq("week_id", week_id).eq("requested_by", actor_id).eq("status", "pending").limit(1).execute()
    if pending.data:
        raise HTTPException(status_code=409, detail="Bạn đã có yêu cầu mở khóa đang chờ duyệt.")
    result = db.table("week_unlock_requests").insert({"week_id": week_id, "requested_by": actor_id, "reason": reason.strip()}).execute().data[0]
    _audit(db, actor_id, "REQUEST_UNLOCK", "competition_weeks", week_id, week, result, reason)
    return result


def list_unlock_requests(class_id: str, academic_term_id: str | None = None) -> list[dict]:
    db = get_supabase()
    query = db.table("week_unlock_requests").select("*, competition_weeks!inner(class_id,week_number,academic_term_id), profiles!week_unlock_requests_requested_by_fkey(full_name)").eq("competition_weeks.class_id", class_id).eq("status", "pending")
    if academic_term_id:
        query = query.eq("competition_weeks.academic_term_id", academic_term_id)
    return query.order("created_at").execute().data or []


def count_pending_unlock_requests(class_ids: list[str] | None = None) -> int:
    """Đếm yêu cầu đang chờ trong các lớp GVCN được phép quản lý."""
    if class_ids == []:
        return 0
    query = get_supabase().table("week_unlock_requests").select(
        "id, competition_weeks!inner(class_id)"
    ).eq("status", "pending")
    if class_ids is not None:
        query = query.in_("competition_weeks.class_id", class_ids)
    return len(query.execute().data or [])


def review_unlock_request(request_id: str, class_id: str, actor_id: str, approve: bool) -> dict:
    from .week_engine import unlock_week
    db = get_supabase()
    response = db.table("week_unlock_requests").select("*, competition_weeks!inner(class_id)").eq("id", request_id).limit(1).execute()
    if not response.data or response.data[0]["competition_weeks"]["class_id"] != class_id:
        raise HTTPException(status_code=404, detail="Không tìm thấy yêu cầu mở khóa.")
    request = response.data[0]
    if request["status"] != "pending":
        raise HTTPException(status_code=409, detail="Yêu cầu này đã được xử lý.")
    if approve:
        unlock_week(request["week_id"], actor_id, request["reason"])
    result = db.table("week_unlock_requests").update({"status": "approved" if approve else "rejected", "reviewed_by": actor_id, "reviewed_at": "now()"}).eq("id", request_id).execute().data[0]
    return result
