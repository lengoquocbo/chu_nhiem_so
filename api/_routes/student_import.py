"""Student Import API routes."""
from fastapi import APIRouter
from fastapi import Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from _lib.auth import CurrentUser, get_current_user, require_class_role
from _lib.import_engine import confirm_import, parse_and_validate
from _lib.supabase_client import get_supabase

router = APIRouter()


# ---------------------------------------------------------
# IMPORT EXCEL HỌC SINH
# ---------------------------------------------------------
@router.post("/api/students/import/validate")
async def import_validate(
    class_id: str = Form(...),
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
):
    require_class_role(user, class_id, allowed_roles=["homeroom_teacher"])
    content = await file.read()
    rows = parse_and_validate(content, class_id)
    return {
        "total": len(rows),
        "valid_count": sum(1 for r in rows if r.is_valid),
        "invalid_count": sum(1 for r in rows if not r.is_valid),
        "rows": [
            {
                "row_index": r.row_index,
                "full_name": r.full_name,
                "gender": r.gender,
                "dob": r.dob,
                "parent_phone": r.parent_phone,
                "parent_email": r.parent_email,
                "address": r.address,
                "errors": r.errors,
                "is_valid": r.is_valid,
            }
            for r in rows
        ],
    }


class ImportConfirmBody(BaseModel):
    class_id: str
    school_year_id: str
    rows: list[dict]


@router.post("/api/students/import/confirm")
def import_confirm(body: ImportConfirmBody, user: CurrentUser = Depends(get_current_user)):
    require_class_role(user, body.class_id, allowed_roles=["homeroom_teacher"])
    class_resp = get_supabase().table("classes").select("school_year_id").eq("id", body.class_id).limit(1).execute()
    if not class_resp.data or class_resp.data[0]["school_year_id"] != body.school_year_id:
        raise HTTPException(status_code=422, detail="Năm học không khớp với lớp đang import.")
    return confirm_import(body.rows, body.class_id, body.school_year_id, user.user_id)
