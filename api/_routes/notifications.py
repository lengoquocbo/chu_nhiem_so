"""Notifications API routes."""
from fastapi import APIRouter
from fastapi import Depends, HTTPException
from _lib.auth import CurrentUser, get_current_user
from _lib.notification_engine import process_pending_notifications

router = APIRouter()


# ---------------------------------------------------------
# THÔNG BÁO - xử lý lại các thông báo pending/failed (gọi định kỳ qua Vercel Cron)
# ---------------------------------------------------------
@router.post("/api/notifications/process-pending")
def notifications_process_pending(user: CurrentUser = Depends(get_current_user)):
    if not user.is_principal():
        raise HTTPException(status_code=403, detail="Chỉ Hiệu trưởng/BGH được chạy tác vụ này thủ công.")
    count = process_pending_notifications(school_id=user.school_id)
    return {"processed": count}
