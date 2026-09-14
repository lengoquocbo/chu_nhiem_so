"""Phân quyền và không gian làm việc cho ban cán sự lớp."""
from __future__ import annotations

from fastapi import HTTPException

from .supabase_client import get_supabase

OFFICER_PERMISSION_KEYS = {
    "view_class_overview",
    "view_competition_ranking",
    "view_group_ranking",
    "record_violation",
    "record_achievement",
    "record_academic",
    "review_officer_records",
    "approve_scores",
    "create_forum_posts",
    "publish_forum_without_review",
    "approve_forum_posts",
    "view_weekly_report",
}

DEFAULT_OFFICER_PERMISSIONS = {
    "class_monitor": [
        "view_class_overview", "view_competition_ranking", "record_violation",
        "record_achievement", "review_officer_records", "approve_scores", "create_forum_posts", "view_weekly_report",
    ],
    "vice_monitor_academic": [
        "view_class_overview", "view_competition_ranking", "record_academic",
        "create_forum_posts", "view_weekly_report",
    ],
    "group_leader": [
        "view_group_ranking", "record_violation", "record_achievement",
        "record_academic", "view_weekly_report",
    ],
}


def _audit(db, actor_id: str, action: str, entity_id: str, before, after) -> None:
    db.table("audit_logs").insert({
        "actor_id": actor_id,
        "action": action,
        "entity": "officer_permissions",
        "entity_id": entity_id,
        "before_data": before,
        "after_data": after,
    }).execute()


def _active_officer(db, officer_id: str, class_id: str) -> dict:
    response = (
        db.table("class_officers").select("*").eq("id", officer_id)
        .eq("class_id", class_id).eq("status", "active").limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy thành viên ban cán sự đang hoạt động.")
    return response.data[0]


def save_officer_permissions(officer_id: str, class_id: str, permission_keys: list[str], actor_id: str) -> dict:
    db = get_supabase()
    officer = _active_officer(db, officer_id, class_id)
    unique_keys = list(dict.fromkeys(permission_keys))
    invalid = set(unique_keys) - OFFICER_PERMISSION_KEYS
    if invalid:
        raise HTTPException(status_code=422, detail=f"Quyền không hợp lệ: {', '.join(sorted(invalid))}")
    if "approve_scores" in unique_keys and officer["position"] != "class_monitor":
        raise HTTPException(status_code=422, detail="Chỉ lớp trưởng mới được cấp quyền duyệt điểm thay GVCN.")
    forum_manager_keys = {"create_forum_posts", "publish_forum_without_review"}
    if forum_manager_keys.intersection(unique_keys) and officer["position"] not in ("class_monitor", "vice_monitor_academic"):
        raise HTTPException(status_code=422, detail="Chỉ lớp trưởng hoặc lớp phó học tập được cấp quyền đăng thông báo.")
    if "approve_forum_posts" in unique_keys and officer["position"] != "class_monitor":
        raise HTTPException(status_code=422, detail="Chỉ lớp trưởng được cấp quyền duyệt thông báo.")
    old_rows = db.table("officer_permissions").select("permission_key").eq("class_officer_id", officer_id).execute().data or []
    old_keys = sorted(row["permission_key"] for row in old_rows)
    db.table("officer_permissions").delete().eq("class_officer_id", officer_id).execute()
    if unique_keys:
        db.table("officer_permissions").insert([
            {"class_officer_id": officer_id, "permission_key": key, "granted_by": actor_id}
            for key in unique_keys
        ]).execute()
    _audit(db, actor_id, "UPDATE", officer_id, {"officer": officer, "permissions": old_keys}, {"officer": officer, "permissions": sorted(unique_keys)})
    return {"officer_id": officer_id, "permissions": sorted(unique_keys)}


def _access_rows_for_user(db, user_id: str, class_id: str | None = None) -> list[dict]:
    link = db.table("student_user_link").select("student_id").eq("user_id", user_id).limit(1).execute().data or []
    if not link:
        return []
    query = (
        db.table("class_officers")
        .select("*, classes(name), groups_(name), officer_permissions(permission_key)")
        .eq("student_id", link[0]["student_id"]).eq("status", "active")
    )
    if class_id:
        query = query.eq("class_id", class_id)
    return query.execute().data or []


def my_officer_access(user_id: str) -> dict:
    rows = _access_rows_for_user(get_supabase(), user_id)
    classes: dict[str, dict] = {}
    for row in rows:
        item = classes.setdefault(row["class_id"], {
            "class_id": row["class_id"], "class_name": (row.get("classes") or {}).get("name"),
            "positions": [], "groups": [], "permissions": [],
        })
        item["positions"].append(row["position"])
        if row.get("group_id"):
            item["groups"].append({"id": row["group_id"], "name": (row.get("groups_") or {}).get("name")})
        item["permissions"].extend(permission["permission_key"] for permission in row.get("officer_permissions") or [])
    for item in classes.values():
        item["permissions"] = sorted(set(item["permissions"]))
    return {"classes": list(classes.values())}


def _require_permission(db, user_id: str, class_id: str, permission_key: str) -> list[dict]:
    if permission_key not in OFFICER_PERMISSION_KEYS:
        raise HTTPException(status_code=422, detail="Quyền cán sự không hợp lệ.")
    rows = _access_rows_for_user(db, user_id, class_id)
    allowed = [row for row in rows if permission_key in {p["permission_key"] for p in row.get("officer_permissions") or []}]
    if not allowed:
        raise HTTPException(status_code=403, detail="GVCN chưa cấp quyền này cho bạn.")
    return allowed


def _student_ids_in_scope(db, officer_rows: list[dict], class_id: str) -> list[str]:
    if any(row["position"] != "group_leader" for row in officer_rows):
        enrollments = db.table("student_class_enrollments").select("student_id").eq("class_id", class_id).is_("left_at", None).execute().data or []
        return [row["student_id"] for row in enrollments]
    group_ids = [row["group_id"] for row in officer_rows if row.get("group_id")]
    if not group_ids:
        return []
    members = db.table("group_members").select("student_id").in_("group_id", group_ids).is_("left_at", None).execute().data or []
    return list({row["student_id"] for row in members})


def officer_workspace(user_id: str, class_id: str, week_id: str | None = None) -> dict:
    db = get_supabase()
    rows = _access_rows_for_user(db, user_id, class_id)
    if not rows:
        raise HTTPException(status_code=403, detail="Bạn không thuộc ban cán sự của lớp này.")
    permissions = sorted({p["permission_key"] for row in rows for p in row.get("officer_permissions") or []})
    allowed_student_ids = _student_ids_in_scope(db, rows, class_id)
    students = []
    if allowed_student_ids:
        enrollments = (
            db.table("student_class_enrollments").select("students(id,student_code,full_name)")
            .eq("class_id", class_id).in_("student_id", allowed_student_ids).is_("left_at", None).execute().data or []
        )
        students = [row["students"] for row in enrollments if row.get("students")]
    weeks = db.table("competition_weeks").select("*").eq("class_id", class_id).order("week_number", desc=True).execute().data or []
    if week_id and week_id not in {week["id"] for week in weeks}:
        raise HTTPException(status_code=422, detail="Tuần thi đua không thuộc lớp được phân quyền.")
    selected_week_id = week_id or (weeks[0]["id"] if weeks else None)
    criteria = []
    transactions = []
    if selected_week_id:
        if any(key in permissions for key in ("record_violation", "record_achievement", "record_academic")):
            links = (
                db.table("competition_week_criteria").select("criteria(*)")
                .eq("week_id", selected_week_id).execute().data or []
            )
            criteria = [row["criteria"] for row in links if row.get("criteria") and row["criteria"].get("status") == "active"]
        can_view_transactions = any(key in permissions for key in (
            "view_class_overview", "view_competition_ranking", "view_group_ranking",
            "view_weekly_report", "review_officer_records", "approve_scores",
        ))
        if allowed_student_ids and can_view_transactions:
            transactions = (
                db.table("score_transactions")
                .select("*, students(full_name), student_events(created_by,event_date,note)")
                .eq("class_id", class_id).eq("week_id", selected_week_id)
                .in_("student_id", allowed_student_ids).order("created_at", desc=True).execute().data or []
            )
    officer_students = db.table("class_officers").select("student_id").eq("class_id", class_id).eq("status", "active").execute().data or []
    officer_student_ids = list({row["student_id"] for row in officer_students})
    creator_ids: set[str] = set()
    if officer_student_ids:
        links = db.table("student_user_link").select("user_id").in_("student_id", officer_student_ids).execute().data or []
        creator_ids = {row["user_id"] for row in links}
    reviewable_transactions = [
        transaction for transaction in transactions
        if transaction["status"] in ("SUBMITTED", "CLASS_LEADER_CHECK")
        and (transaction.get("student_events") or {}).get("created_by") in creator_ids
        and (transaction.get("student_events") or {}).get("created_by") != user_id
    ]
    approvable_transactions = [
        transaction for transaction in transactions
        if transaction["status"] in (
            "DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK",
            "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW",
        )
    ] if "approve_scores" in permissions else []
    return {
        "permissions": permissions, "positions": [row["position"] for row in rows],
        "students": students, "weeks": weeks, "selected_week_id": selected_week_id,
        "criteria": criteria, "transactions": transactions,
        "reviewable_transactions": reviewable_transactions,
        "approvable_transactions": approvable_transactions,
    }


def validate_officer_event(user_id: str, class_id: str, student_id: str, criteria_code: str | None) -> None:
    if not criteria_code:
        raise HTTPException(status_code=422, detail="Cán sự phải chọn một tiêu chí thi đua.")
    db = get_supabase()
    criteria_rows = db.table("criteria").select("kind,category").eq("class_id", class_id).eq("code", criteria_code).eq("status", "active").limit(1).execute().data or []
    if not criteria_rows:
        raise HTTPException(status_code=422, detail="Tiêu chí không hợp lệ.")
    criteria = criteria_rows[0]
    candidate_permissions = ["record_academic"] if criteria.get("category") == "Học tập" else []
    candidate_permissions.append("record_achievement" if criteria["kind"] == "ADD" else "record_violation")
    permitted_rows = []
    for key in candidate_permissions:
        try:
            permitted_rows.extend(_require_permission(db, user_id, class_id, key))
        except HTTPException:
            continue
    if not permitted_rows:
        raise HTTPException(status_code=403, detail="Bạn chưa được cấp quyền ghi nhận nhóm tiêu chí này.")
    if student_id not in _student_ids_in_scope(db, permitted_rows, class_id):
        raise HTTPException(status_code=403, detail="Học sinh nằm ngoài phạm vi bạn phụ trách.")


def confirm_officer_transaction(user_id: str, class_id: str, transaction_id: str) -> dict:
    db = get_supabase()
    reviewer_rows = _require_permission(db, user_id, class_id, "review_officer_records")
    response = (
        db.table("score_transactions").select("*, student_events(created_by)")
        .eq("id", transaction_id).eq("class_id", class_id).limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy ghi nhận thi đua.")
    before = response.data[0]
    if before["status"] not in ("SUBMITTED", "CLASS_LEADER_CHECK"):
        raise HTTPException(status_code=409, detail="Ghi nhận này không còn chờ cán sự xác nhận.")
    week = db.table("competition_weeks").select("status").eq("id", before["week_id"]).eq("class_id", class_id).limit(1).execute().data or []
    if not week or week[0]["status"] != "open":
        raise HTTPException(status_code=423, detail="Tuần thi đua đã khóa; không thể xác nhận ghi nhận.")
    if before["student_id"] not in _student_ids_in_scope(db, reviewer_rows, class_id):
        raise HTTPException(status_code=403, detail="Ghi nhận nằm ngoài phạm vi bạn phụ trách.")
    creator_id = (before.get("student_events") or {}).get("created_by")
    if not creator_id or not _access_rows_for_user(db, creator_id, class_id):
        raise HTTPException(status_code=403, detail="Chỉ được xác nhận ghi nhận do ban cán sự tạo.")
    if creator_id == user_id:
        raise HTTPException(status_code=403, detail="Bạn không được tự xác nhận ghi nhận do mình tạo.")
    after = (
        db.table("score_transactions")
        .update({"status": "CLASS_LEADER_CONFIRMED", "checked_by": user_id, "checked_at": "now()", "updated_at": "now()"})
        .eq("id", transaction_id).execute().data[0]
    )
    db.table("audit_logs").insert({
        "actor_id": user_id, "action": "CLASS_LEADER_CONFIRM", "entity": "score_transactions",
        "entity_id": transaction_id, "before_data": before, "after_data": after,
    }).execute()
    return after


def validate_officer_score_approval(user_id: str, class_id: str, transaction_id: str) -> None:
    """Cho phép lớp trưởng được GVCN ủy quyền duyệt điểm cuối cùng của lớp."""
    db = get_supabase()
    permission_rows = _require_permission(db, user_id, class_id, "approve_scores")
    monitor_rows = [row for row in permission_rows if row["position"] == "class_monitor"]
    if not monitor_rows:
        raise HTTPException(status_code=403, detail="Chỉ lớp trưởng được GVCN cấp quyền mới có thể duyệt điểm.")

    response = (
        db.table("score_transactions").select("id,class_id,week_id,student_id,status")
        .eq("id", transaction_id).eq("class_id", class_id).limit(1).execute()
    )
    if not response.data:
        raise HTTPException(status_code=404, detail="Không tìm thấy giao dịch điểm trong lớp này.")
    transaction = response.data[0]
    if transaction["status"] not in (
        "DRAFT", "SUBMITTED", "CLASS_LEADER_CHECK",
        "CLASS_LEADER_CONFIRMED", "HOMEROOM_REVIEW",
    ):
        raise HTTPException(status_code=409, detail="Giao dịch điểm không còn ở trạng thái chờ duyệt.")

    week = (
        db.table("competition_weeks").select("status").eq("id", transaction["week_id"])
        .eq("class_id", class_id).limit(1).execute().data or []
    )
    if not week or week[0]["status"] != "open":
        raise HTTPException(status_code=423, detail="Tuần thi đua đã khóa; không thể duyệt điểm.")
    if transaction["student_id"] not in _student_ids_in_scope(db, monitor_rows, class_id):
        raise HTTPException(status_code=403, detail="Giao dịch điểm nằm ngoài phạm vi được phân quyền.")
