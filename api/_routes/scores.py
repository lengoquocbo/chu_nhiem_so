"""Scores API routes."""
from fastapi import APIRouter
from fastapi import Depends
from pydantic import BaseModel
from _lib.auth import (
    CurrentUser,
    get_current_user,
    get_user_class_scope,
    require_class_role,
    require_record_class,
)
from _lib.officer_engine import validate_officer_score_approval
from _lib.score_engine import approve_transaction, adjust_transaction

router = APIRouter()


# ---------------------------------------------------------
# DUYỆT ĐIỂM (GVCN / Hiệu trưởng / lớp trưởng được GVCN cấp quyền)
# ---------------------------------------------------------
class ApproveBody(BaseModel):
    transaction_id: str
    class_id: str


@router.post("/api/score/approve")
def approve(body: ApproveBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher", "class_monitor"])
    class_scope = get_user_class_scope(user.user_id, body.class_id)
    if not user.is_principal() and "homeroom_teacher" not in class_scope:
        require_class_role(user, body.class_id, allowed_roles=["class_monitor"])
        validate_officer_score_approval(user.user_id, body.class_id, body.transaction_id)
    require_record_class("score_transactions", body.transaction_id, body.class_id, "giao dịch điểm")
    return approve_transaction(body.transaction_id, user.user_id)


class AdjustBody(BaseModel):
    transaction_id: str
    class_id: str
    adjusted_points: float
    reason: str


@router.post("/api/score/adjust")
def adjust(body: AdjustBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    require_record_class("score_transactions", body.transaction_id, body.class_id, "giao dịch điểm")
    return adjust_transaction(body.transaction_id, user.user_id, body.adjusted_points, body.reason)
