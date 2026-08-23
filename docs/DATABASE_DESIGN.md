# Thiết kế cơ sở dữ liệu

Prisma schema mô hình hóa School → SchoolYear → Semester → Classroom → Team → Student và các bảng Guardian, RuleSet/RuleItem, CompetitionWeek, ClassSession/AttendanceRecord, CompetitionEvent, ScoreAdjustment, StudentWeeklyResult, Task, Notification, AuditLog. Các ràng buộc unique và index bảo vệ mã học sinh, phiên bản nội quy, phiên học và phạm vi lớp.

## Migration thương mại 14/08/2026

Thêm trạng thái/lưu trữ/timestamp cho School, SchoolYear, Semester, Classroom, Team; thêm ClassMembership, ClassTransferHistory, Permission, RolePermission và ghi chú appointment. Unique/index/FK được tạo trong migration `20260813172216_commercial_school_structure_rbac` và `20260814002500_officer_note_permission_seed`. SQLite development đã backup trước migration; 4 migration up-to-date. PostgreSQL vẫn chưa được chứng minh.

## Verification 2026-08-14 - attendance and class officers

- Dedicated `/diem-danh` page: date/previous/today/next, morning/afternoon, transactional session creation, batch upsert, server-side scope checks, finalized-week lock, audit trail and attendance-linked competition-event reconciliation.
- Added `/diem-danh/lich-su` with date/period/status filters and totals. Excel export, student/team filters and pagination remain open; therefore the full attendance epic remains PARTIAL, not release PASS.
- `/can-bo-lop`: DRAFT/SCHEDULED/ACTIVE/EXPIRED/REVOKED lifecycle, draft edit/delete, effective-record versioning, reason-required revocation and audit trail. Account invitation/activation and complete customer-account workflow remain open.
- Login throttling now uses normalized-email and trusted-IP keys through a pluggable store; memory in development, shared-store adapter required in production.
- Migration `20260814010000_attendance_officer_lifecycle` applied without resetting existing data. Prisma reports 5 migrations and schema up to date.
- Evidence: lint PASS; typecheck PASS; Vitest 37/37 PASS; Playwright desktop/mobile 22/22 PASS; production build PASS; npm audit 0 high/critical and 2 moderate (ExcelJS transitive uuid).
