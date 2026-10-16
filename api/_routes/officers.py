"""Officers API routes."""
from fastapi import APIRouter
from typing import Optional
from fastapi import Depends
from pydantic import BaseModel
from _lib.auth import CurrentUser, get_current_user, require_class_role
from _lib.officer_engine import (
    confirm_officer_transaction,
    my_officer_access,
    officer_workspace,
    save_officer_permissions,
)

router = APIRouter()


# ---------------------------------------------------------
# BAN CÁN SỰ / PHÂN QUYỀN QUẢN LÝ LỚP
# ---------------------------------------------------------
class OfficerPermissionsBody(BaseModel):
    class_id: str
    officer_id: str
    permission_keys: list[str]


@router.post("/api/officers/permissions/save")
def officer_permissions_save(body: OfficerPermissionsBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    return save_officer_permissions(body.officer_id, body.class_id, body.permission_keys, user.user_id)


@router.get("/api/officers/me")
def officer_me(user: CurrentUser = Depends(get_current_user)):
    return my_officer_access(user.user_id)


@router.get("/api/officers/workspace")
def officer_workspace_endpoint(class_id: str, week_id: Optional[str] = None, user: CurrentUser = Depends(get_current_user)):
    return officer_workspace(user.user_id, class_id, week_id)


class OfficerConfirmBody(BaseModel):
    class_id: str
    transaction_id: str


@router.post("/api/officers/transactions/confirm")
def officer_transaction_confirm(body: OfficerConfirmBody, user: CurrentUser = Depends(get_current_user)):
    return confirm_officer_transaction(user.user_id, body.class_id, body.transaction_id)
