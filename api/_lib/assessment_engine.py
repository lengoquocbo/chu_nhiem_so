"""Nghiệp vụ dò bài cũ và quản lý điểm kiểm tra."""
from __future__ import annotations

from datetime import date
from secrets import choice

from fastapi import HTTPException

from .supabase_client import get_supabase


def _audit(db, actor_id: str, action: str, entity_id: str, before, after, reason: str | None = None) -> None:
    db.table("audit_logs").insert({
        "actor_id": actor_id,
        "action": action,
        "entity": "assessment_scores",
        "entity_id": entity_id,
        "before_data": before,
        "after_data": after,
        "reason": reason,
    }).execute()


def _lesson(db, lesson_id: str, class_id: str) -> dict:
    response = db.table("lesson_book_entries").select("*").eq("id", lesson_id).eq("class_id", class_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tiết học.")
    lesson = response.data[0]
    if lesson["approval_status"] != "approved":
        raise HTTPException(status_code=409, detail="Tiết học chưa được GVCN duyệt.")
    return lesson


def _open_week(db, week_id: str, class_id: str) -> dict:
    response = db.table("competition_weeks").select("*").eq("id", week_id).eq("class_id", class_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần thi đua.")
    week = response.data[0]
    if week["status"] != "open":
        raise HTTPException(status_code=423, detail="Tuần đã khóa; không thể thêm hoặc sửa điểm kiểm tra.")
    return week


def _week_for_date(db, class_id: str, assessment_date: date) -> dict:
    response = (
        db.table("competition_weeks").select("*").eq("class_id", class_id)
        .lte("start_date", assessment_date.isoformat()).gte("end_date", assessment_date.isoformat())
        .limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=422, detail="Ngày kiểm tra chưa thuộc tuần thi đua nào.")
    return _open_week(db, response.data[0]["id"], class_id)


def _student_in_class(db, student_id: str, class_id: str) -> dict:
    response = (
        db.table("student_class_enrollments").select("students(id,student_code,full_name,date_of_birth)")
        .eq("class_id", class_id).eq("student_id", student_id).is_("left_at", None).limit(1).execute()
    )
    if not response.data or not response.data[0].get("students"):
        raise HTTPException(status_code=422, detail="Học sinh không thuộc lớp đang thao tác.")
    return response.data[0]["students"]


def random_oral_student(class_id: str, lesson_id: str) -> dict:
    db = get_supabase()
    lesson = _lesson(db, lesson_id, class_id)
    _open_week(db, lesson["week_id"], class_id)
    enrollments = (
        db.table("student_class_enrollments").select("students(id,student_code,full_name,date_of_birth)")
        .eq("class_id", class_id).is_("left_at", None).execute().data or []
    )
    students = [row["students"] for row in enrollments if row.get("students")]
    if not students:
        raise HTTPException(status_code=422, detail="Lớp chưa có học sinh để quay.")
    student = choice(students)
    return _oral_student_summary(db, lesson, student)


def _oral_student_summary(db, lesson: dict, student: dict) -> dict:
    previous = (
        db.table("assessment_scores").select("id,score,assessment_date,created_at", count="exact")
        .eq("class_id", lesson["class_id"]).eq("student_id", student["id"])
        .eq("subject_id", lesson["subject_id"]).eq("assessment_type", "oral")
        .order("assessment_date", desc=True).order("created_at", desc=True).execute()
    )
    return {
        "student": student,
        "previous_count": previous.count or 0,
        "latest_score": previous.data[0]["score"] if previous.data else None,
    }


def oral_student_info(class_id: str, lesson_id: str, student_id: str) -> dict:
    """Thông tin một học sinh được GVBM chọn thủ công để dò bài."""
    db = get_supabase()
    lesson = _lesson(db, lesson_id, class_id)
    _open_week(db, lesson["week_id"], class_id)
    student = _student_in_class(db, student_id, class_id)
    return _oral_student_summary(db, lesson, student)


def _insert_score(db, values: dict, actor_id: str) -> dict:
    saved = db.table("assessment_scores").insert(values).execute().data[0]
    db.table("assessment_score_history").insert({
        "assessment_score_id": saved["id"],
        "class_id": saved["class_id"],
        "student_id": saved["student_id"],
        "subject_id": saved["subject_id"],
        "action": "create",
        "new_score": saved["score"],
        "new_comment": saved.get("comment"),
        "changed_by": actor_id,
    }).execute()
    _audit(db, actor_id, "CREATE", saved["id"], None, saved)
    return saved


def create_oral_score(class_id: str, lesson_id: str, student_id: str, score: float, comment: str | None, actor_id: str) -> dict:
    db = get_supabase()
    lesson = _lesson(db, lesson_id, class_id)
    _open_week(db, lesson["week_id"], class_id)
    _student_in_class(db, student_id, class_id)
    return _insert_score(db, {
        "class_id": class_id,
        "student_id": student_id,
        "subject_id": lesson["subject_id"],
        "week_id": lesson["week_id"],
        "lesson_id": lesson_id,
        "assessment_type": "oral",
        "score": score,
        "assessment_date": lesson["lesson_date"],
        "period": lesson["period"],
        "teacher_id": actor_id,
        "comment": comment.strip() if comment and comment.strip() else None,
        "created_by": actor_id,
    }, actor_id)


def create_fifteen_minute_score(class_id: str, subject_id: str, student_id: str, score: float, assessment_date: date, period: int | None, comment: str | None, actor_id: str) -> dict:
    db = get_supabase()
    week = _week_for_date(db, class_id, assessment_date)
    _student_in_class(db, student_id, class_id)
    return _insert_score(db, {
        "class_id": class_id,
        "student_id": student_id,
        "subject_id": subject_id,
        "week_id": week["id"],
        "assessment_type": "fifteen_minute",
        "score": score,
        "assessment_date": assessment_date.isoformat(),
        "period": period,
        "teacher_id": actor_id,
        "comment": comment.strip() if comment and comment.strip() else None,
        "created_by": actor_id,
    }, actor_id)


def list_assessment_scores(class_id: str, subject_id: str, academic_term_id: str | None = None) -> dict:
    db = get_supabase()
    enrollment_query = (
        db.table("student_class_enrollments")
        .select("enrolled_at,left_at,status,students(id,student_code,full_name,date_of_birth)")
        .eq("class_id", class_id)
    )
    if not academic_term_id:
        enrollment_query = enrollment_query.is_("left_at", None)
    enrollments = enrollment_query.execute().data or []
    if academic_term_id:
        term_rows = (
            db.table("academic_terms").select("start_date,end_date")
            .eq("id", academic_term_id).limit(1).execute().data or []
        )
        if not term_rows:
            raise HTTPException(status_code=404, detail="Không tìm thấy học kỳ.")
        term = term_rows[0]
        enrollments = [
            row for row in enrollments
            if (row.get("enrolled_at") or "")[:10] <= term["end_date"]
            and (not row.get("left_at") or row["left_at"][:10] >= term["start_date"])
        ]
    score_query = (
        db.table("assessment_scores")
        .select("*, profiles!assessment_scores_teacher_id_fkey(full_name), competition_weeks!inner(status,week_number,academic_term_id)")
        .eq("class_id", class_id).eq("subject_id", subject_id)
    )
    if academic_term_id:
        score_query = score_query.eq("competition_weeks.academic_term_id", academic_term_id)
    scores = score_query.order("assessment_date").order("created_at").execute().data or []
    return {"students": [row["students"] for row in enrollments if row.get("students")], "scores": scores}


def student_gradebook(user_id: str, school_year_id: str | None = None, term_id: str | None = None) -> dict:
    """Bảng điểm kiểm tra của chính học sinh đang đăng nhập, lọc theo năm và học kỳ."""
    db = get_supabase()
    links = db.table("student_user_link").select("student_id").eq("user_id", user_id).limit(1).execute().data or []
    if not links:
        raise HTTPException(status_code=404, detail="Tài khoản chưa được liên kết với hồ sơ học sinh.")
    student_id = links[0]["student_id"]

    enrollments = (
        db.table("student_class_enrollments").select("class_id,school_year_id")
        .eq("student_id", student_id).execute().data or []
    )
    enrolled_year_ids = list(dict.fromkeys(row["school_year_id"] for row in enrollments))
    if not enrolled_year_ids:
        return {
            "school_years": [], "terms": [], "selected_school_year_id": None,
            "selected_term_id": None, "subjects": [],
        }

    years = (
        db.table("school_years").select("id,name,start_date,end_date,status")
        .in_("id", enrolled_year_ids).order("start_date", desc=True).execute().data or []
    )
    valid_year_ids = {year["id"] for year in years}
    if school_year_id and school_year_id not in valid_year_ids:
        raise HTTPException(status_code=403, detail="Năm học không thuộc quá trình học của bạn.")
    selected_year_id = school_year_id or next(
        (year["id"] for year in years if year["status"] == "active"),
        years[0]["id"] if years else None,
    )

    terms = (
        db.table("academic_terms").select("id,school_year_id,name,term_number,start_date,end_date,status")
        .eq("school_year_id", selected_year_id).order("term_number").execute().data or []
    )
    valid_term_ids = {term["id"] for term in terms}
    if term_id and term_id not in valid_term_ids:
        raise HTTPException(status_code=422, detail="Học kỳ không thuộc năm học đã chọn.")
    selected_term_id = term_id or next(
        (term["id"] for term in terms if term["status"] == "active"),
        terms[0]["id"] if terms else None,
    )
    selected_term = next((term for term in terms if term["id"] == selected_term_id), None)

    class_ids = list(dict.fromkeys(
        row["class_id"] for row in enrollments if row["school_year_id"] == selected_year_id
    ))
    scores = []
    if class_ids and selected_term:
        scores = (
            db.table("assessment_scores")
            .select("*, subjects(id,name), classes(name), profiles!assessment_scores_teacher_id_fkey(full_name)")
            .eq("student_id", student_id).in_("class_id", class_ids)
            .gte("assessment_date", selected_term["start_date"])
            .lte("assessment_date", selected_term["end_date"])
            .order("assessment_date").order("created_at").execute().data or []
        )

    subjects_by_id: dict[str, dict] = {}
    if class_ids:
        assignments = (
            db.table("class_subject_teachers").select("subject_id,subjects(id,name)")
            .in_("class_id", class_ids).execute().data or []
        )
        for assignment in assignments:
            subject = assignment.get("subjects")
            if subject:
                subjects_by_id.setdefault(subject["id"], {**subject, "oral_scores": [], "fifteen_minute_scores": []})
    for score in scores:
        subject = score.get("subjects") or {"id": score["subject_id"], "name": "Môn học"}
        row = subjects_by_id.setdefault(subject["id"], {**subject, "oral_scores": [], "fifteen_minute_scores": []})
        target = "oral_scores" if score["assessment_type"] == "oral" else "fifteen_minute_scores"
        row[target].append(score)

    return {
        "school_years": years,
        "terms": terms,
        "selected_school_year_id": selected_year_id,
        "selected_term_id": selected_term_id,
        "subjects": sorted(subjects_by_id.values(), key=lambda subject: subject["name"].casefold()),
    }


def assessment_score_detail(score_id: str, class_id: str) -> dict:
    db = get_supabase()
    score_response = (
        db.table("assessment_scores")
        .select("*, students(full_name,student_code), subjects(name), profiles!assessment_scores_teacher_id_fkey(full_name), competition_weeks(status,week_number)")
        .eq("id", score_id).eq("class_id", class_id).limit(1).execute()
    )
    if not score_response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy điểm kiểm tra.")
    history = (
        db.table("assessment_score_history")
        .select("*, profiles!assessment_score_history_changed_by_fkey(full_name)")
        .eq("assessment_score_id", score_id).order("changed_at", desc=True).execute().data or []
    )
    return {"score": score_response.data[0], "history": history}


def update_assessment_score(
    score_id: str,
    class_id: str,
    score: float,
    comment: str | None,
    reason: str | None,
    actor_id: str,
    require_reason: bool = True,
) -> dict:
    db = get_supabase()
    response = db.table("assessment_scores").select("*").eq("id", score_id).eq("class_id", class_id).limit(1).execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy điểm kiểm tra.")
    before = response.data[0]
    _open_week(db, before["week_id"], class_id)
    clean_reason = reason.strip() if reason and reason.strip() else None
    if require_reason and not clean_reason:
        raise HTTPException(status_code=422, detail="Phải nhập lý do chỉnh sửa điểm.")
    values = {
        "score": score,
        "comment": comment.strip() if comment and comment.strip() else None,
        "updated_by": actor_id,
        "updated_at": "now()",
    }
    after = db.table("assessment_scores").update(values).eq("id", score_id).execute().data[0]
    db.table("assessment_score_history").insert({
        "assessment_score_id": score_id,
        "class_id": before["class_id"],
        "student_id": before["student_id"],
        "subject_id": before["subject_id"],
        "action": "update",
        "old_score": before["score"],
        "new_score": after["score"],
        "old_comment": before.get("comment"),
        "new_comment": after.get("comment"),
        "changed_by": actor_id,
        "reason": clean_reason,
    }).execute()
    _audit(db, actor_id, "UPDATE", score_id, before, after, clean_reason)
    return after
