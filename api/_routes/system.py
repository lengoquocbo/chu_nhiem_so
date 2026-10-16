"""Platform administrator routes. Never accept a client-supplied actor or role."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from _lib.auth import CurrentUser, get_current_user
from _lib.admin_engine import list_school_staff
from _lib.system_engine import (
    create_principal_account,
    create_school,
    delete_principal_account,
    list_school_principals,
    list_schools,
    update_principal_password,
)

router = APIRouter()


def require_system_admin(user: CurrentUser) -> None:
    if not user.is_system_admin():
        raise HTTPException(status_code=403, detail="Chỉ admin cấp hệ thống được thực hiện thao tác này.")


class CreateSchoolBody(BaseModel):
    name: str


@router.get("/api/system/schools")
def system_list_schools(user: CurrentUser = Depends(get_current_user)):
    require_system_admin(user)
    return list_schools()


@router.post("/api/system/schools")
def system_create_school(body: CreateSchoolBody, user: CurrentUser = Depends(get_current_user)):
    require_system_admin(user)
    return create_school(body.name, user.user_id)


class CreatePrincipalBody(BaseModel):
    email: str
    full_name: str
    password: str


@router.post("/api/system/schools/{school_id}/principals")
def system_create_principal(
    school_id: UUID, body: CreatePrincipalBody, user: CurrentUser = Depends(get_current_user),
):
    require_system_admin(user)
    return create_principal_account(str(school_id), body.email, body.full_name, body.password, user.user_id)


@router.get("/api/system/schools/{school_id}/principals")
def system_list_principals(
    school_id: UUID, user: CurrentUser = Depends(get_current_user),
):
    require_system_admin(user)
    return list_school_principals(str(school_id))


@router.get("/api/system/schools/{school_id}/staff")
def system_list_staff(
    school_id: UUID, user: CurrentUser = Depends(get_current_user),
):
    """Toàn bộ nhân sự của một trường (hiệu trưởng + giáo viên) kèm vai trò."""
    require_system_admin(user)
    return list_school_staff(str(school_id))


class UpdatePrincipalPasswordBody(BaseModel):
    new_password: str


@router.put("/api/system/schools/{school_id}/principals/{user_id}/password")
def system_update_principal_password(
    school_id: UUID,
    user_id: UUID,
    body: UpdatePrincipalPasswordBody,
    user: CurrentUser = Depends(get_current_user),
):
    require_system_admin(user)
    return update_principal_password(str(school_id), str(user_id), body.new_password, user.user_id)


@router.delete("/api/system/schools/{school_id}/principals/{user_id}")
def system_delete_principal(
    school_id: UUID,
    user_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    require_system_admin(user)
    return delete_principal_account(str(school_id), str(user_id), user.user_id)
