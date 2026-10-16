"""Teacher API routes."""
from fastapi import APIRouter
from fastapi import Depends, HTTPException
from pydantic import BaseModel
from _lib.auth import CurrentUser, get_current_user
from _lib.teacher_engine import join_class_by_code, subject_teacher_context

router = APIRouter()


class JoinClassBody(BaseModel):
    class_code: str
    subject_id: str


@router.post("/api/teacher/join-class")
def teacher_join_class(body: JoinClassBody, user: CurrentUser = Depends(get_current_user)):
    if not user.has_role("subject_teacher"):
        raise HTTPException(status_code=403, detail="Chỉ giáo viên bộ môn được tham gia lớp bằng mã.")
    if not user.school_id:
        raise HTTPException(status_code=403, detail="Giáo viên chưa được gắn với trường.")
    return join_class_by_code(body.class_code, body.subject_id, user.user_id, user.school_id)


@router.get("/api/teacher/context")
def teacher_context(user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal() and not user.has_role("subject_teacher"):
        raise HTTPException(status_code=403, detail="Chức năng này chỉ dành cho giáo viên bộ môn.")
    if not user.school_id:
        raise HTTPException(status_code=403, detail="Tài khoản chưa được gắn với trường.")
    return subject_teacher_context(None if user.is_principal() else user.user_id, user.school_id)
