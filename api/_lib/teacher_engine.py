from fastapi import HTTPException

from .supabase_client import get_supabase


def subject_teacher_context(teacher_id: str | None, school_id: str | None = None) -> dict:
    """Các lớp/môn mà GVBM được phân công, tách rõ theo năm học và học kỳ."""
    db = get_supabase()
    assignment_query = (
        db.table("class_subject_teachers")
        .select("id,class_id,subject_id,class_academic_term_id,status")
        .eq("status", "active")
    )
    if not school_id:
        return {"scopes": []}
    years_in_school = db.table("school_years").select("id").eq("school_id", school_id).execute().data or []
    year_ids_in_school = [row["id"] for row in years_in_school]
    if not year_ids_in_school:
        return {"scopes": []}
    classes_in_school = db.table("classes").select("id").in_("school_year_id", year_ids_in_school).execute().data or []
    class_ids_in_school = [row["id"] for row in classes_in_school]
    if not class_ids_in_school:
        return {"scopes": []}
    assignment_query = assignment_query.in_("class_id", class_ids_in_school)
    if teacher_id:
        assignment_query = assignment_query.eq("teacher_id", teacher_id)
    assignments = assignment_query.execute().data or []
    if not assignments:
        return {"scopes": []}

    class_ids = list({row["class_id"] for row in assignments})
    subject_ids = list({row["subject_id"] for row in assignments if row.get("subject_id")})
    class_term_ids = list({row["class_academic_term_id"] for row in assignments if row.get("class_academic_term_id")})
    classes = db.table("classes").select("id,name,class_code,school_year_id").in_("id", class_ids).execute().data or []
    class_by_id = {row["id"]: row for row in classes}
    subjects = db.table("subjects").select("id,name").in_("id", subject_ids).execute().data or [] if subject_ids else []
    subject_by_id = {row["id"]: row for row in subjects}
    class_terms = (
        db.table("class_academic_terms").select("id,class_id,academic_term_id,status")
        .in_("id", class_term_ids).execute().data or []
    ) if class_term_ids else []
    class_term_by_id = {row["id"]: row for row in class_terms}
    term_ids = list({row["academic_term_id"] for row in class_terms})
    terms = (
        db.table("academic_terms").select("id,school_year_id,name,term_number,start_date,end_date,status")
        .in_("id", term_ids).execute().data or []
    ) if term_ids else []
    term_by_id = {row["id"]: row for row in terms}
    year_ids = list({row["school_year_id"] for row in classes})
    year_query = db.table("school_years").select("id,name,status,start_date,end_date,school_id").in_("id", year_ids)
    if school_id:
        year_query = year_query.eq("school_id", school_id)
    years = year_query.execute().data or []
    year_by_id = {row["id"]: row for row in years}

    scopes = []
    for assignment in assignments:
        class_row = class_by_id.get(assignment["class_id"])
        class_term = class_term_by_id.get(assignment.get("class_academic_term_id"))
        subject = subject_by_id.get(assignment.get("subject_id"))
        if not class_row or not class_term or not subject:
            continue
        term = term_by_id.get(class_term["academic_term_id"])
        year = year_by_id.get(class_row["school_year_id"])
        if not term or not year:
            continue
        scopes.append({
            "assignment_id": assignment["id"],
            "class_term_id": class_term["id"],
            "class_term_status": class_term["status"],
            "class_id": class_row["id"],
            "class_name": class_row["name"],
            "class_code": class_row["class_code"],
            "subject_id": subject["id"],
            "subject_name": subject["name"],
            "school_year_id": year["id"],
            "school_year_name": year["name"],
            "school_year_status": year["status"],
            "academic_term_id": term["id"],
            "term_name": term["name"],
            "term_number": term["term_number"],
            "term_start_date": term["start_date"],
            "term_end_date": term["end_date"],
            "term_status": term["status"],
        })
    scopes.sort(key=lambda row: (row["school_year_name"], row["term_number"], row["class_name"], row["subject_name"]), reverse=True)
    return {"scopes": scopes}


def join_class_by_code(class_code: str, subject_id: str, teacher_id: str, school_id: str) -> dict:
    supabase = get_supabase()
    normalized_code = class_code.strip().upper()
    if not normalized_code:
        raise HTTPException(status_code=422, detail="Mã lớp không được để trống.")

    class_resp = supabase.table("classes").select("id,name,school_year_id").eq("class_code", normalized_code).limit(1).execute()
    if not class_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy lớp với mã này.")

    subject_resp = supabase.table("subjects").select("id,name").eq("id", subject_id).limit(1).execute()
    if not subject_resp.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy môn học.")

    class_row = class_resp.data[0]
    year_rows = supabase.table("school_years").select("school_id").eq("id", class_row["school_year_id"]).limit(1).execute().data or []
    if not year_rows or year_rows[0]["school_id"] != school_id:
        raise HTTPException(status_code=403, detail="Mã lớp không thuộc trường của giáo viên.")
    class_terms = (
        supabase.table("class_academic_terms")
        .select("id,academic_term_id,status,academic_terms!inner(name,status,school_year_id)")
        .eq("class_id", class_row["id"]).eq("status", "active")
        .eq("academic_terms.status", "active").limit(1).execute().data or []
    )
    if not class_terms:
        raise HTTPException(status_code=422, detail="Lớp chưa được mở trong học kỳ đang hoạt động.")
    class_term = class_terms[0]
    existing = (
        supabase.table("class_subject_teachers")
        .select("*")
        .eq("class_academic_term_id", class_term["id"])
        .eq("teacher_id", teacher_id)
        .eq("subject_id", subject_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        if existing.data[0]["status"] == "active":
            raise HTTPException(status_code=409, detail="Bạn đã tham gia lớp với môn học này.")
        result = (
            supabase.table("class_subject_teachers")
            .update({"status": "active"})
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        result = supabase.table("class_subject_teachers").insert(
            {
                "class_id": class_row["id"], "class_academic_term_id": class_term["id"],
                "teacher_id": teacher_id, "subject_id": subject_id,
            }
        ).execute()

    return {
        "assignment": result.data[0], "class": class_row, "subject": subject_resp.data[0],
        "academic_term": class_term.get("academic_terms"),
    }
