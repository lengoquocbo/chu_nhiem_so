"""Tạo và gửi báo cáo tuần cho phụ huynh qua Gmail SMTP hoặc Resend."""
from __future__ import annotations

import html
import os
import re
import smtplib
import ssl
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from typing import Optional

import requests
from fastapi import HTTPException

from .supabase_client import get_supabase
from .week_engine import COUNTED_STATUSES, compute_weekly_summary

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
EMAIL_PROVIDER = os.environ.get("EMAIL_PROVIDER", "resend").strip().lower()
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com").strip()
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587") or 587)
SMTP_USER = os.environ.get("SMTP_USER", "").strip()
SMTP_APP_PASSWORD = "".join(os.environ.get("SMTP_APP_PASSWORD", "").split())
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "Thông báo nhà trường").strip()
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "")
RESEND_API_URL = "https://api.resend.com/emails/batch"


def _week(class_id: str, academic_term_id: str, week_id: str) -> dict:
    rows = (
        get_supabase().table("competition_weeks")
        .select("*, classes(name,class_code)")
        .eq("id", week_id).eq("class_id", class_id)
        .eq("academic_term_id", academic_term_id).limit(1).execute().data or []
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Không tìm thấy tuần trong lớp và học kỳ đã chọn.")
    return rows[0]


def _teacher(actor_id: str, actor_email: Optional[str]) -> dict:
    rows = get_supabase().table("profiles").select("full_name").eq("id", actor_id).limit(1).execute().data or []
    return {
        "full_name": rows[0]["full_name"] if rows else "Giáo viên chủ nhiệm",
        "username": (actor_email or "").split("@", 1)[0] or "—",
    }


def _number(value) -> float:
    number = float(value or 0)
    return int(number) if number.is_integer() else round(number, 2)


def _date_vi(value: str) -> str:
    try:
        return datetime.strptime(value, "%Y-%m-%d").strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return value or "—"


def _report_rows(class_id: str, academic_term_id: str, week_id: str) -> tuple[dict, list[dict]]:
    db = get_supabase()
    week = _week(class_id, academic_term_id, week_id)
    enrollments = (
        db.table("student_class_enrollments")
        .select("student_id, students(id,student_code,full_name,parent_email)")
        .eq("class_id", class_id).is_("left_at", None).execute().data or []
    )
    students = [row["students"] for row in enrollments if row.get("students")]
    students.sort(key=lambda item: (item.get("full_name") or "").casefold())

    summaries = db.table("weekly_score_summary").select("*").eq("week_id", week_id).execute().data or []
    if len(summaries) < len(students):
        summaries = compute_weekly_summary(week_id, persist=week["status"] == "locked")
    summary_by_student = {row["student_id"]: row for row in summaries}

    transactions = (
        db.table("score_transactions")
        .select("student_id,system_points,adjusted_points,criteria_code_snapshot,criteria_name_snapshot,status,student_events(event_date,note)")
        .eq("week_id", week_id).in_("status", list(COUNTED_STATUSES)).execute().data or []
    )
    details: dict[str, dict[str, list[dict]]] = {}
    for tx in transactions:
        points = _number(tx.get("adjusted_points") if tx.get("adjusted_points") is not None else tx.get("system_points"))
        item = {
            "code": tx.get("criteria_code_snapshot"),
            "name": tx.get("criteria_name_snapshot") or "Ghi nhận thi đua",
            "points": points,
            "date": (tx.get("student_events") or {}).get("event_date"),
            "note": (tx.get("student_events") or {}).get("note"),
        }
        bucket = details.setdefault(tx["student_id"], {"achievements": [], "violations": []})
        bucket["achievements" if points >= 0 else "violations"].append(item)

    existing = db.table("parent_weekly_reports").select("*").eq("week_id", week_id).execute().data or []
    existing_by_student = {row["student_id"]: row for row in existing}
    rows = []
    for student in students:
        summary = summary_by_student.get(student["id"], {})
        detail = details.get(student["id"], {"achievements": [], "violations": []})
        saved = existing_by_student.get(student["id"], {})
        email = (student.get("parent_email") or "").strip().lower()
        start_score = _number(summary.get("start_score", 100))
        total_add = _number(summary.get("total_add", 0))
        total_deduct = _number(summary.get("total_deduct", 0))
        # Điểm thi đua khởi đầu từ 100 nhưng không có trần 100.
        # Không dùng final_score lưu sẵn để bản báo cáo luôn phản ánh đúng công thức.
        final_score = _number(max(0, start_score + total_add - total_deduct))
        rows.append({
            "student_id": student["id"],
            "student_code": student.get("student_code"),
            "student_name": student.get("full_name"),
            "parent_email": email or None,
            "email_valid": bool(email and EMAIL_RE.match(email)),
            "start_score": start_score,
            "total_add": total_add,
            "total_deduct": total_deduct,
            "final_score": final_score,
            "rank_label": summary.get("rank_label"),
            "achievements": detail["achievements"],
            "violations": detail["violations"],
            "homeroom_comment": saved.get("homeroom_comment") or "",
            "report_id": saved.get("id"),
            "status": saved.get("status") or ("draft" if email else "missing_email"),
            "error_reason": saved.get("error_reason"),
            "sent_at": saved.get("sent_at"),
            "attempt_count": saved.get("attempt_count", 0),
        })
    return week, rows


def get_report_workspace(class_id: str, academic_term_id: str, week_id: str) -> dict:
    db = get_supabase()
    week, rows = _report_rows(class_id, academic_term_id, week_id)
    config_rows = (
        db.table("parent_report_configs").select("*")
        .eq("class_id", class_id).eq("academic_term_id", academic_term_id).limit(1).execute().data or []
    )
    return {
        "week": week,
        "config": config_rows[0] if config_rows else {"send_mode": "manual"},
        "email_provider": EMAIL_PROVIDER,
        "sender_ready": _sender_ready(),
        "students": rows,
    }


def save_report_config(class_id: str, academic_term_id: str, send_mode: str, actor_id: str) -> dict:
    if send_mode not in ("manual", "auto_on_lock"):
        raise HTTPException(status_code=422, detail="Chế độ gửi báo cáo không hợp lệ.")
    result = get_supabase().table("parent_report_configs").upsert(
        {
            "class_id": class_id,
            "academic_term_id": academic_term_id,
            "send_mode": send_mode,
            "configured_by": actor_id,
            "updated_at": "now()",
        },
        on_conflict="class_id,academic_term_id",
    ).execute()
    return result.data[0]


def _plain_message(week: dict, row: dict, teacher: dict, comment: str) -> str:
    achievements = "\n".join(
        f"- {item['name']} ({'+' if item['points'] >= 0 else ''}{item['points']} điểm)"
        for item in row["achievements"]
    ) or "- Không có ghi nhận"
    violations = "\n".join(
        f"- {item['name']} ({item['points']} điểm)" for item in row["violations"]
    ) or "- Không có ghi nhận"
    return (
        f"Xin chào phụ huynh của em {row['student_name']},\n\n"
        "Đây là email tự động thông báo hoạt động của học sinh trong tuần vừa qua.\n"
        f"Tuần {week['week_number']}: {_date_vi(week['start_date'])} đến {_date_vi(week['end_date'])}.\n"
        f"Lớp: {(week.get('classes') or {}).get('name', '—')}.\n\n"
        f"TUYÊN DƯƠNG\n{achievements}\n\n"
        f"VI PHẠM\n{violations}\n\n"
        f"KẾT QUẢ THI ĐUA\nĐiểm đầu tuần: {row['start_score']}\n"
        f"Điểm cộng: +{row['total_add']}\nĐiểm trừ: -{row['total_deduct']}\n"
        f"Điểm cuối tuần: {row['final_score']}\nXếp loại: {row['rank_label'] or '—'}\n\n"
        f"Nhận xét của GVCN: {comment.strip() or 'Không có nhận xét thêm.'}\n\n"
        f"Nội dung được xác nhận và chịu trách nhiệm bởi GVCN {teacher['full_name']}. "
        f"Tài khoản xác nhận: {teacher['username']}."
    )


def _html_message(text: str) -> str:
    escaped = html.escape(text)
    return (
        '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:680px;margin:auto">'
        '<div style="border:1px solid #d9dee8;border-radius:12px;padding:28px">'
        '<h2 style="margin-top:0;color:#14213d">Báo cáo hoạt động tuần</h2>'
        f'<div style="white-space:pre-line">{escaped}</div>'
        '<p style="margin-top:24px;padding-top:16px;border-top:1px solid #e6e9ef;color:#667085;font-size:12px">'
        'Đây là email tự động từ hệ thống quản lý lớp học. Vui lòng liên hệ GVCN nếu cần trao đổi thêm.'
        '</p></div></div>'
    )


def _sender_ready() -> bool:
    if EMAIL_PROVIDER == "gmail":
        return bool(SMTP_HOST and SMTP_PORT and SMTP_USER and SMTP_APP_PASSWORD)
    if EMAIL_PROVIDER == "resend":
        return bool(RESEND_API_KEY and RESEND_FROM_EMAIL)
    return False


def _require_sender_ready() -> None:
    if EMAIL_PROVIDER not in ("gmail", "resend"):
        raise HTTPException(status_code=503, detail=f"EMAIL_PROVIDER không được hỗ trợ: {EMAIL_PROVIDER}.")
    if _sender_ready():
        return
    if EMAIL_PROVIDER == "gmail":
        raise HTTPException(
            status_code=503,
            detail="Chưa cấu hình đủ SMTP_HOST, SMTP_PORT, SMTP_USER hoặc SMTP_APP_PASSWORD.",
        )
    raise HTTPException(status_code=503, detail="Chưa cấu hình RESEND_API_KEY hoặc RESEND_FROM_EMAIL.")


def _mark_delivery(db, item: dict, status: str, provider_id: Optional[str], error: Optional[str]) -> None:
    attempt_count = item["report"].get("attempt_count", 0) + 1
    values = {
        "status": status,
        "provider_message_id": provider_id,
        "error_reason": error[:500] if error else None,
        "attempt_count": attempt_count,
        "updated_at": "now()",
    }
    if status in ("queued", "sent"):
        values["sent_at"] = "now()"
    db.table("parent_weekly_reports").update(values).eq("id", item["report"]["id"]).execute()


def _send_with_gmail(db, items: list[dict]) -> tuple[int, int]:
    sent = 0
    failed = 0
    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=25) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(SMTP_USER, SMTP_APP_PASSWORD)
            for item in items:
                try:
                    message = EmailMessage()
                    message_id = make_msgid(domain=SMTP_USER.rsplit("@", 1)[-1])
                    message["Message-ID"] = message_id
                    message["From"] = formataddr((SMTP_FROM_NAME, SMTP_USER))
                    message["To"] = item["report"]["recipient_email"]
                    message["Subject"] = item["subject"]
                    message.set_content(item["message"])
                    message.add_alternative(_html_message(item["message"]), subtype="html")
                    smtp.send_message(message)
                    _mark_delivery(db, item, "sent", message_id, None)
                    sent += 1
                except Exception as exc:  # Một email lỗi không dừng cả lớp.
                    _mark_delivery(db, item, "failed", None, str(exc))
                    failed += 1
    except Exception as exc:  # Lỗi kết nối/đăng nhập áp dụng cho các email chưa gửi.
        reason = str(exc)
        for item in items[sent + failed:]:
            _mark_delivery(db, item, "failed", None, reason)
            failed += 1
    return sent, failed


def _send_with_resend(db, items: list[dict], week_id: str, trigger: str) -> tuple[int, int]:
    queued = 0
    failed = 0
    for offset in range(0, len(items), 100):
        chunk = items[offset:offset + 100]
        batch_attempt = max((item["report"].get("attempt_count", 0) for item in chunk), default=0) + 1
        emails = [
            {
                "from": RESEND_FROM_EMAIL,
                "to": [item["report"]["recipient_email"]],
                "subject": item["subject"],
                "html": _html_message(item["message"]),
                "text": item["message"],
                "tags": [
                    {"name": "type", "value": "weekly-report"},
                    {"name": "trigger", "value": trigger},
                ],
            }
            for item in chunk
        ]
        try:
            response = requests.post(
                RESEND_API_URL,
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"weekly-report/{week_id}/{offset}/{batch_attempt}",
                },
                json=emails,
                timeout=20,
            )
            if not response.ok:
                try:
                    provider_error = response.json().get("message") or response.text
                except ValueError:
                    provider_error = response.text
                raise RuntimeError(f"Resend HTTP {response.status_code}: {provider_error}")
            response_rows = response.json().get("data") or []
            if len(response_rows) != len(chunk):
                raise RuntimeError("Resend không trả đủ mã email trong lô gửi.")
            for item, provider in zip(chunk, response_rows):
                _mark_delivery(db, item, "queued", provider.get("id"), None)
                queued += 1
        except Exception as exc:  # Một lô lỗi không dừng các lô còn lại.
            for item in chunk:
                _mark_delivery(db, item, "failed", None, str(exc))
                failed += 1
    return queued, failed


def send_week_reports(
    class_id: str,
    academic_term_id: str,
    week_id: str,
    student_ids: Optional[list[str]],
    comments: Optional[dict[str, str]],
    actor_id: str,
    actor_email: Optional[str],
    trigger: str = "manual",
) -> dict:
    db = get_supabase()
    week, rows = _report_rows(class_id, academic_term_id, week_id)
    if week["status"] != "locked":
        raise HTTPException(status_code=423, detail="Chỉ được gửi báo cáo sau khi tuần đã chốt.")
    _require_sender_ready()

    requested = set(student_ids or [row["student_id"] for row in rows])
    teacher = _teacher(actor_id, actor_email)
    comments = comments or {}
    queued_rows: list[dict] = []
    skipped_sent = 0
    missing_email = 0

    for row in rows:
        if row["student_id"] not in requested:
            continue
        if row["status"] in ("queued", "sent"):
            skipped_sent += 1
            continue
        comment = comments.get(row["student_id"], row.get("homeroom_comment") or "")[:2000]
        subject = f"Báo cáo Tuần {week['week_number']} - {row['student_name']}"
        message = _plain_message(week, row, teacher, comment)
        status = "sending" if row["email_valid"] else "missing_email"
        payload = {
            "class_id": class_id,
            "academic_term_id": academic_term_id,
            "week_id": week_id,
            "student_id": row["student_id"],
            "recipient_email": row["parent_email"],
            "start_score": row["start_score"],
            "total_add": row["total_add"],
            "total_deduct": row["total_deduct"],
            "final_score": row["final_score"],
            "rank_label": row["rank_label"],
            "achievements": row["achievements"],
            "violations": row["violations"],
            "homeroom_comment": comment or None,
            "subject_snapshot": subject,
            "message_snapshot": message,
            "status": status,
            "error_reason": None if row["email_valid"] else "Học sinh chưa có email phụ huynh hợp lệ.",
            "generated_by": actor_id,
            "last_attempted_by": actor_id,
            "updated_at": "now()",
        }
        saved = db.table("parent_weekly_reports").upsert(payload, on_conflict="week_id,student_id").execute().data[0]
        if not row["email_valid"]:
            missing_email += 1
            continue
        queued_rows.append({"report": saved, "subject": subject, "message": message})

    if EMAIL_PROVIDER == "gmail":
        sent_count, failed_count = _send_with_gmail(db, queued_rows)
    else:
        sent_count, failed_count = _send_with_resend(db, queued_rows, week_id, trigger)

    db.table("audit_logs").insert({
        "actor_id": actor_id,
        "action": "SEND_PARENT_WEEKLY_REPORT",
        "entity": "competition_weeks",
        "entity_id": week_id,
        "after_data": {
            "trigger": trigger,
            "provider": EMAIL_PROVIDER,
            "queued": sent_count,
            "failed": failed_count,
            "missing_email": missing_email,
            "skipped_sent": skipped_sent,
        },
        "reason": "Gửi tự động khi chốt tuần" if trigger == "auto_on_lock" else "GVCN gửi hàng loạt",
    }).execute()
    return {
        "enabled": True,
        "provider": EMAIL_PROVIDER,
        "queued": sent_count,
        "failed": failed_count,
        "missing_email": missing_email,
        "skipped_sent": skipped_sent,
    }


def send_if_auto(week_id: str, actor_id: str, actor_email: Optional[str]) -> dict:
    week_rows = get_supabase().table("competition_weeks").select("class_id,academic_term_id").eq("id", week_id).limit(1).execute().data or []
    if not week_rows:
        return {"enabled": False}
    week = week_rows[0]
    configs = (
        get_supabase().table("parent_report_configs").select("send_mode")
        .eq("class_id", week["class_id"]).eq("academic_term_id", week["academic_term_id"])
        .eq("send_mode", "auto_on_lock").limit(1).execute().data or []
    )
    if not configs:
        return {"enabled": False}
    try:
        return send_week_reports(
            week["class_id"], week["academic_term_id"], week_id,
            None, None, actor_id, actor_email, trigger="auto_on_lock",
        )
    except Exception as exc:  # Chốt tuần vẫn thành công nếu nhà cung cấp email lỗi.
        return {"enabled": True, "queued": 0, "failed": 0, "missing_email": 0, "error": str(exc)}
