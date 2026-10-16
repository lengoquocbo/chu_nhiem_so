"""
Thông báo phụ huynh khi có sự kiện quan trọng.

GVCN cấu hình trong `notification_configs`: event_type nào cần báo phụ huynh,
qua kênh nào (zalo/telegram/in_app). Hàm ở đây được gọi SAU khi 1 Score
Transaction được APPROVE/ADJUST (điểm đã chính thức, tránh báo rồi lại
phải đính chính nếu bị điều chỉnh).
"""
from __future__ import annotations

import os
from typing import Optional

import requests

from .supabase_client import get_supabase

ZALO_OA_ACCESS_TOKEN = os.environ.get("ZALO_OA_ACCESS_TOKEN", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")


def _build_content(event: dict, event_type_name: str, criteria_name: str, points: float, student_name: str) -> str:
    sign = "+" if points >= 0 else ""
    return (
        f"Học sinh {student_name} được ghi nhận: {event_type_name} "
        f"({criteria_name}). Điểm thi đua: {sign}{points}."
    )


def create_and_send_notifications_for_transaction(transaction: dict) -> list[dict]:
    supabase = get_supabase()

    event_resp = (
        supabase.table("student_events")
        .select("*, event_types(*)")
        .eq("id", transaction["student_event_id"])
        .limit(1)
        .execute()
    )
    if not event_resp.data:
        return []
    event = event_resp.data[0]
    event_type = event["event_types"]

    config_resp = (
        supabase.table("notification_configs")
        .select("*")
        .eq("class_id", transaction["class_id"])
        .eq("event_type_id", event_type["id"])
        .limit(1)
        .execute()
    )
    if not config_resp.data or not config_resp.data[0]["notify_parent"]:
        return []
    config = config_resp.data[0]

    student_resp = supabase.table("students").select("full_name").eq("id", transaction["student_id"]).limit(1).execute()
    student_name = student_resp.data[0]["full_name"] if student_resp.data else "?"

    points = transaction.get("adjusted_points")
    if points is None:
        points = transaction["system_points"]

    content = _build_content(
        event, event_type["name"], transaction["criteria_name_snapshot"], points, student_name
    )

    parents_resp = (
        supabase.table("parent_student_scope")
        .select("parent_id")
        .eq("student_id", transaction["student_id"])
        .execute()
    )
    parent_ids = [p["parent_id"] for p in (parents_resp.data or [])]
    if not parent_ids:
        return []

    created = []
    for parent_id in parent_ids:
        for channel in config["notify_channels"] or []:
            row = {
                "student_id": transaction["student_id"],
                "recipient_parent_id": parent_id,
                "channel": channel,
                "content": content,
                "related_transaction_id": transaction["id"],
                "status": "pending",
            }
            insert_resp = supabase.table("notifications").insert(row).execute()
            notif = insert_resp.data[0]
            _send_notification(supabase, notif, parent_id)
            created.append(notif)
    return created


def _get_parent_channel_id(supabase, parent_id: str, channel: str) -> Optional[str]:
    """
    Lấy zalo_user_id / telegram_chat_id của phụ huynh.
    NOTE: cần thêm cột này vào bảng profiles khi tích hợp thật
    (ví dụ profiles.zalo_user_id, profiles.telegram_chat_id) - phụ huynh
    phải liên kết tài khoản Zalo/Telegram của họ trước (OAuth / /start bot).
    Hiện tại trả về None nếu chưa có cột này -> gửi sẽ failed với lý do rõ ràng.
    """
    resp = supabase.table("profiles").select("*").eq("id", parent_id).limit(1).execute()
    if not resp.data:
        return None
    profile = resp.data[0]
    if channel == "zalo":
        return profile.get("zalo_user_id")
    if channel == "telegram":
        return profile.get("telegram_chat_id")
    return None


def _send_notification(supabase, notif: dict, parent_id: str) -> None:
    channel = notif["channel"]

    if channel == "in_app":
        supabase.table("notifications").update({"status": "sent", "sent_at": "now()"}).eq("id", notif["id"]).execute()
        return

    recipient_id = _get_parent_channel_id(supabase, parent_id, channel)
    if not recipient_id:
        supabase.table("notifications").update(
            {"status": "failed", "error_reason": f"Phụ huynh chưa liên kết tài khoản {channel}."}
        ).eq("id", notif["id"]).execute()
        return

    try:
        if channel == "zalo":
            _send_zalo(recipient_id, notif["content"])
        elif channel == "telegram":
            _send_telegram(recipient_id, notif["content"])
        supabase.table("notifications").update({"status": "sent", "sent_at": "now()"}).eq("id", notif["id"]).execute()
    except Exception as exc:  # noqa: BLE001 - muốn bắt mọi lỗi gửi để lưu lý do
        supabase.table("notifications").update(
            {"status": "failed", "error_reason": str(exc)[:500]}
        ).eq("id", notif["id"]).execute()


def _send_zalo(zalo_user_id: str, content: str) -> None:
    if not ZALO_OA_ACCESS_TOKEN:
        raise RuntimeError("Chưa cấu hình ZALO_OA_ACCESS_TOKEN.")
    resp = requests.post(
        "https://openapi.zalo.me/v3.0/oa/message/cs",
        headers={"access_token": ZALO_OA_ACCESS_TOKEN, "Content-Type": "application/json"},
        json={"recipient": {"user_id": zalo_user_id}, "message": {"text": content}},
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    if body.get("error"):
        raise RuntimeError(f"Zalo API lỗi: {body}")


def _send_telegram(chat_id: str, content: str) -> None:
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError("Chưa cấu hình TELEGRAM_BOT_TOKEN.")
    resp = requests.post(
        f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
        json={"chat_id": chat_id, "text": content},
        timeout=10,
    )
    resp.raise_for_status()
    body = resp.json()
    if not body.get("ok"):
        raise RuntimeError(f"Telegram API lỗi: {body}")


def process_pending_notifications(limit: int = 50, school_id: str | None = None) -> int:
    """Gọi định kỳ (cron) để retry các thông báo failed/pending còn sót."""
    supabase = get_supabase()
    query = supabase.table("notifications").select("*,students!inner(school_id)") if school_id else supabase.table("notifications").select("*")
    if school_id:
        query = query.eq("students.school_id", school_id)
    resp = query.in_("status", ["pending", "failed"]).limit(limit).execute()
    count = 0
    for notif in resp.data or []:
        _send_notification(supabase, notif, notif["recipient_parent_id"])
        count += 1
    return count
