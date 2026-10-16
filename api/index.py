"""FastAPI entrypoint: shared middleware and feature routers."""
import os

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from _routes import (
    communications,
    accounts,
    events,
    officers,
    scores,
    weeks,
    teacher,
    attendance,
    lesson_book,
    assessments,
    student_import,
    parent_reports,
    reports,
    notifications,
    system,
)


app = FastAPI(title="Class Management API")

cors_origins = [
    origin.strip().rstrip("/")
    for origin in os.environ.get(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(httpx.TransportError)
def handle_upstream_transport_error(_request, exc: httpx.TransportError):
    """Supabase ngắt kết nối tạm thời là 503 có thể thử lại, không phải lỗi ứng dụng 500."""
    return JSONResponse(
        status_code=503,
        content={"detail": "Kết nối dữ liệu tạm thời bị gián đoạn. Vui lòng thử lại sau vài giây."},
        headers={"Retry-After": "1"},
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}


app.include_router(communications.router)
app.include_router(accounts.router)
app.include_router(events.router)
app.include_router(officers.router)
app.include_router(scores.router)
app.include_router(weeks.router)
app.include_router(teacher.router)
app.include_router(attendance.router)
app.include_router(lesson_book.router)
app.include_router(assessments.router)
app.include_router(student_import.router)
app.include_router(parent_reports.router)
app.include_router(reports.router)
app.include_router(notifications.router)
app.include_router(system.router)
