"""Diễn đàn lớp, góp ý ẩn danh và bộ đếm nội dung chưa đọc."""
from __future__ import annotations

from fastapi import HTTPException

from .officer_engine import _access_rows_for_user, _require_permission
from .supabase_client import get_supabase


def _audit(db, actor_id: str, action: str, entity: str, entity_id: str, before, after, reason=None) -> None:
    db.table("audit_logs").insert({
        "actor_id": actor_id, "action": action, "entity": entity, "entity_id": entity_id,
        "before_data": before, "after_data": after, "reason": reason,
    }).execute()


def accessible_class_ids(user_id: str, is_principal: bool = False) -> list[str]:
    db = get_supabase()
    if is_principal:
        return [row["id"] for row in (db.table("classes").select("id").eq("status", "active").execute().data or [])]
    scope = db.table("user_class_scope").select("class_id").eq("user_id", user_id).execute().data or []
    links = db.table("student_user_link").select("student_id").eq("user_id", user_id).limit(1).execute().data or []
    enrollment = []
    if links:
        enrollment = (
            db.table("student_class_enrollments").select("class_id")
            .eq("student_id", links[0]["student_id"]).is_("left_at", None).execute().data or []
        )
    return list(dict.fromkeys([row["class_id"] for row in scope + enrollment]))


def require_communication_access(user_id: str, class_id: str, is_principal: bool = False) -> None:
    if class_id not in accessible_class_ids(user_id, is_principal):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem nội dung của lớp này.")


def _is_homeroom(db, user_id: str, class_id: str, is_principal: bool) -> bool:
    if is_principal:
        return True
    rows = (
        db.table("user_class_scope").select("scope_role").eq("user_id", user_id)
        .eq("class_id", class_id).eq("scope_role", "homeroom_teacher").limit(1).execute().data or []
    )
    return bool(rows)


def _has_officer_permission(db, user_id: str, class_id: str, permission: str, positions: tuple[str, ...]) -> bool:
    rows = _access_rows_for_user(db, user_id, class_id)
    return any(
        row["position"] in positions
        and permission in {item["permission_key"] for item in row.get("officer_permissions") or []}
        for row in rows
    )


def communication_context(user_id: str, is_principal: bool = False) -> dict:
    db = get_supabase()
    class_ids = accessible_class_ids(user_id, is_principal)
    classes = []
    if class_ids:
        classes = db.table("classes").select("id,name").in_("id", class_ids).order("name").execute().data or []
    return {"classes": classes}


def list_forum(user_id: str, class_id: str, is_principal: bool = False) -> dict:
    db = get_supabase()
    require_communication_access(user_id, class_id, is_principal)
    homeroom = _is_homeroom(db, user_id, class_id, is_principal)
    can_create = homeroom or _has_officer_permission(
        db, user_id, class_id, "create_forum_posts", ("class_monitor", "vice_monitor_academic")
    )
    can_approve = homeroom or _has_officer_permission(
        db, user_id, class_id, "approve_forum_posts", ("class_monitor",)
    )
    posts = (
        db.table("class_forum_posts")
        .select("*, author:profiles!class_forum_posts_author_id_fkey(full_name), reviewer:profiles!class_forum_posts_reviewed_by_fkey(full_name)")
        .eq("class_id", class_id).order("created_at", desc=True).execute().data or []
    )
    if not homeroom and not can_approve:
        posts = [post for post in posts if post["status"] == "approved" or post["author_id"] == user_id]
    return {"posts": posts, "can_create": can_create, "can_approve": can_approve, "is_homeroom": homeroom}


def create_forum_post(user_id: str, class_id: str, title: str, content: str, is_principal: bool = False) -> dict:
    db = get_supabase()
    require_communication_access(user_id, class_id, is_principal)
    clean_title, clean_content = title.strip(), content.strip()
    if not clean_title or not clean_content:
        raise HTTPException(status_code=422, detail="Tiêu đề và nội dung không được để trống.")
    homeroom = _is_homeroom(db, user_id, class_id, is_principal)
    if not homeroom:
        _require_permission(db, user_id, class_id, "create_forum_posts")
        allowed = _access_rows_for_user(db, user_id, class_id)
        if not any(row["position"] in ("class_monitor", "vice_monitor_academic") for row in allowed):
            raise HTTPException(status_code=403, detail="Chỉ lớp trưởng hoặc lớp phó học tập được đăng thông báo.")
    auto_publish = homeroom or _has_officer_permission(
        db, user_id, class_id, "publish_forum_without_review", ("class_monitor", "vice_monitor_academic")
    )
    values = {
        "class_id": class_id, "title": clean_title, "content": clean_content,
        "author_id": user_id, "status": "approved" if auto_publish else "pending",
    }
    if auto_publish:
        values.update({"reviewed_by": user_id, "reviewed_at": "now()"})
    post = db.table("class_forum_posts").insert(values).execute().data[0]
    db.table("class_content_reads").upsert({
        "user_id": user_id, "content_type": "forum", "content_id": post["id"], "read_at": "now()",
    }, on_conflict="user_id,content_type,content_id").execute()
    _audit(db, user_id, "CREATE", "class_forum_posts", post["id"], None, post)
    return post


def review_forum_post(user_id: str, class_id: str, post_id: str, approve: bool, reason: str | None, is_principal: bool = False) -> dict:
    db = get_supabase()
    require_communication_access(user_id, class_id, is_principal)
    if not _is_homeroom(db, user_id, class_id, is_principal):
        rows = _require_permission(db, user_id, class_id, "approve_forum_posts")
        if not any(row["position"] == "class_monitor" for row in rows):
            raise HTTPException(status_code=403, detail="Chỉ lớp trưởng được cấp quyền mới có thể duyệt thông báo.")
    found = db.table("class_forum_posts").select("*").eq("id", post_id).eq("class_id", class_id).limit(1).execute().data or []
    if not found:
        raise HTTPException(status_code=404, detail="Không tìm thấy thông báo.")
    before = found[0]
    if before["status"] != "pending":
        raise HTTPException(status_code=409, detail="Thông báo không còn chờ duyệt.")
    values = {
        "status": "approved" if approve else "rejected", "reviewed_by": user_id,
        "reviewed_at": "now()", "rejection_reason": None if approve else (reason or "").strip() or None,
        "updated_at": "now()",
    }
    after = db.table("class_forum_posts").update(values).eq("id", post_id).execute().data[0]
    db.table("class_content_reads").delete().eq("content_type", "forum").eq("content_id", post_id).neq("user_id", user_id).execute()
    _audit(db, user_id, "APPROVE" if approve else "REJECT", "class_forum_posts", post_id, before, after, reason)
    return after


def list_feedback(user_id: str, class_id: str, is_principal: bool = False) -> dict:
    db = get_supabase()
    require_communication_access(user_id, class_id, is_principal)
    homeroom = _is_homeroom(db, user_id, class_id, is_principal)
    rows = (
        db.table("anonymous_class_feedback")
        .select("*")
        .eq("class_id", class_id).order("created_at", desc=True).execute().data or []
    )
    if not homeroom:
        rows = [
            row for row in rows
            if row["status"] == "approved" or row["author_id"] == user_id
        ]
    for row in rows:
        row.pop("author_id", None)
        row.pop("responded_by", None)
    return {"feedback": rows, "is_homeroom": homeroom}


def create_feedback(user_id: str, class_id: str, content: str) -> dict:
    db = get_supabase()
    require_communication_access(user_id, class_id)
    links = db.table("student_user_link").select("student_id").eq("user_id", user_id).limit(1).execute().data or []
    if not links:
        raise HTTPException(status_code=403, detail="Chỉ học sinh của lớp mới được gửi góp ý.")
    enrollment = (
        db.table("student_class_enrollments").select("id").eq("student_id", links[0]["student_id"])
        .eq("class_id", class_id).is_("left_at", None).limit(1).execute().data or []
    )
    if not enrollment:
        raise HTTPException(status_code=403, detail="Bạn không phải học sinh đang học tại lớp này.")
    clean_content = content.strip()
    if not clean_content:
        raise HTTPException(status_code=422, detail="Nội dung góp ý không được để trống.")
    row = db.table("anonymous_class_feedback").insert({
        "class_id": class_id, "author_id": user_id, "content": clean_content,
    }).execute().data[0]
    db.table("class_content_reads").upsert({
        "user_id": user_id, "content_type": "feedback", "content_id": row["id"], "read_at": "now()",
    }, on_conflict="user_id,content_type,content_id").execute()
    _audit(db, user_id, "CREATE", "anonymous_class_feedback", row["id"], None, {**row, "author_id": "anonymous"})
    return {key: value for key, value in row.items() if key != "author_id"}


def review_feedback(user_id: str, class_id: str, feedback_id: str, approve: bool, is_principal: bool = False) -> dict:
    db = get_supabase()
    if not _is_homeroom(db, user_id, class_id, is_principal):
        raise HTTPException(status_code=403, detail="Chỉ GVCN được duyệt góp ý.")
    found = db.table("anonymous_class_feedback").select("*").eq("id", feedback_id).eq("class_id", class_id).limit(1).execute().data or []
    if not found:
        raise HTTPException(status_code=404, detail="Không tìm thấy góp ý.")
    before = found[0]
    if before["status"] != "pending":
        raise HTTPException(status_code=409, detail="Góp ý này không còn chờ duyệt.")
    values = {
        "status": "approved" if approve else "rejected", "response": None,
        "responded_by": user_id, "responded_at": "now()", "updated_at": "now()",
    }
    after = db.table("anonymous_class_feedback").update(values).eq("id", feedback_id).execute().data[0]
    db.table("class_content_reads").delete().eq("content_type", "feedback").eq("content_id", feedback_id).neq("user_id", user_id).execute()
    safe_before = {**before, "author_id": "anonymous"}
    safe_after = {**after, "author_id": "anonymous"}
    _audit(db, user_id, "APPROVE" if approve else "REJECT", "anonymous_class_feedback", feedback_id, safe_before, safe_after)
    return {key: value for key, value in after.items() if key not in ("author_id", "responded_by")}


def unread_counts(user_id: str, is_principal: bool = False, class_id: str | None = None) -> dict:
    db = get_supabase()
    class_ids = accessible_class_ids(user_id, is_principal)
    if class_id:
        if class_id not in class_ids:
            raise HTTPException(status_code=403, detail="Bạn không có quyền xem nội dung của lớp này.")
        class_ids = [class_id]
    if not class_ids:
        return {"forum": 0, "feedback": 0}
    forum = db.table("class_forum_posts").select("id,class_id,status").in_("class_id", class_ids).execute().data or []
    feedback = db.table("anonymous_class_feedback").select("id,class_id,status,author_id").in_("class_id", class_ids).execute().data or []
    homeroom_by_class = {
        current_class_id: _is_homeroom(db, user_id, current_class_id, is_principal)
        for current_class_id in class_ids
    }
    forum_moderator_by_class = {
        current_class_id: homeroom_by_class[current_class_id] or _has_officer_permission(
            db, user_id, current_class_id, "approve_forum_posts", ("class_monitor",)
        )
        for current_class_id in class_ids
    }
    visible_forum = []
    for post in forum:
        if post["status"] == "approved" or (post["status"] == "pending" and forum_moderator_by_class[post["class_id"]]):
            visible_forum.append(post["id"])
    visible_feedback = [
        row["id"] for row in feedback
        if homeroom_by_class[row["class_id"]]
        or row["status"] == "approved"
        or row["author_id"] == user_id
    ]

    def count_unread(content_type: str, ids: list[str]) -> int:
        if not ids:
            return 0
        reads = (
            db.table("class_content_reads").select("content_id").eq("user_id", user_id)
            .eq("content_type", content_type).in_("content_id", ids).execute().data or []
        )
        return len(set(ids) - {row["content_id"] for row in reads})

    return {"forum": count_unread("forum", visible_forum), "feedback": count_unread("feedback", visible_feedback)}


def mark_read(user_id: str, class_id: str, content_type: str, content_ids: list[str], is_principal: bool = False) -> dict:
    require_communication_access(user_id, class_id, is_principal)
    if content_type not in ("forum", "feedback"):
        raise HTTPException(status_code=422, detail="Loại nội dung không hợp lệ.")
    db = get_supabase()
    table = "class_forum_posts" if content_type == "forum" else "anonymous_class_feedback"
    existing = db.table(table).select("id").eq("class_id", class_id).in_("id", content_ids).execute().data or [] if content_ids else []
    valid_ids = [row["id"] for row in existing]
    if valid_ids:
        db.table("class_content_reads").upsert([
            {"user_id": user_id, "content_type": content_type, "content_id": content_id, "read_at": "now()"}
            for content_id in valid_ids
        ], on_conflict="user_id,content_type,content_id").execute()
    return {"marked": len(valid_ids)}
