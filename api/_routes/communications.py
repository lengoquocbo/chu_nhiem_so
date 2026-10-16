"""Communications API routes."""
from fastapi import APIRouter
from typing import Optional
from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field
from _lib.class_communication_engine import (
    communication_context,
    create_feedback,
    create_forum_post,
    list_feedback,
    list_forum,
    mark_read,
    review_feedback,
    review_forum_post,
    unread_counts,
)
from _lib.auth import CurrentUser, get_current_user

router = APIRouter()


# ---------------------------------------------------------
# DIỄN ĐÀN THÔNG BÁO / GÓP Ý ẨN DANH
# ---------------------------------------------------------
@router.get("/api/communications/context")
def communications_context(user: CurrentUser = Depends(get_current_user)):
    return communication_context(user.user_id, user.is_principal(), user.school_id)


@router.get("/api/communications/unread")
def communications_unread(class_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    return unread_counts(user.user_id, user.is_principal(), class_id, user.school_id)


@router.get("/api/communications/forum")
def communications_forum(class_id: str, user: CurrentUser = Depends(get_current_user)):
    return list_forum(user.user_id, class_id, user.is_principal(), user.school_id)


class ForumPostBody(BaseModel):
    class_id: str
    title: str = Field(min_length=1, max_length=200)
    content: str = Field(min_length=1, max_length=5000)


@router.post("/api/communications/forum/create")
def communications_forum_create(body: ForumPostBody, user: CurrentUser = Depends(get_current_user)):
    return create_forum_post(user.user_id, body.class_id, body.title, body.content, user.is_principal(), user.school_id)


class ForumReviewBody(BaseModel):
    class_id: str
    post_id: str
    approve: bool
    reason: Optional[str] = None


@router.post("/api/communications/forum/review")
def communications_forum_review(body: ForumReviewBody, user: CurrentUser = Depends(get_current_user)):
    return review_forum_post(user.user_id, body.class_id, body.post_id, body.approve, body.reason, user.is_principal(), user.school_id)


@router.get("/api/communications/feedback")
def communications_feedback(class_id: str, user: CurrentUser = Depends(get_current_user)):
    return list_feedback(user.user_id, class_id, user.is_principal(), user.school_id)


class FeedbackCreateBody(BaseModel):
    class_id: str
    content: str = Field(min_length=1, max_length=5000)


@router.post("/api/communications/feedback/create")
def communications_feedback_create(body: FeedbackCreateBody, user: CurrentUser = Depends(get_current_user)):
    if "student" not in user.roles:
        raise HTTPException(status_code=403, detail="Chỉ học sinh được gửi góp ý ẩn danh.")
    return create_feedback(user.user_id, body.class_id, body.content)


class FeedbackReviewBody(BaseModel):
    class_id: str
    feedback_id: str
    approve: bool


@router.post("/api/communications/feedback/review")
def communications_feedback_review(body: FeedbackReviewBody, user: CurrentUser = Depends(get_current_user)):
    return review_feedback(user.user_id, body.class_id, body.feedback_id, body.approve, user.is_principal(), user.school_id)


class MarkContentReadBody(BaseModel):
    class_id: str
    content_type: str
    content_ids: list[str]


@router.post("/api/communications/read")
def communications_mark_read(body: MarkContentReadBody, user: CurrentUser = Depends(get_current_user)):
    return mark_read(user.user_id, body.class_id, body.content_type, body.content_ids, user.is_principal(), user.school_id)
