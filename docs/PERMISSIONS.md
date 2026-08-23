# Phân quyền

- Giáo viên: quản lý lớp được giao, duyệt sự kiện, chốt tuần, tải báo cáo.
- Cán bộ lớp/tổ trưởng: ghi nhận trong phạm vi được giao; không duyệt và không xem dữ liệu phụ huynh nhạy cảm.
- Học sinh: chỉ xem dữ liệu được phép; không tải báo cáo riêng.
- Phụ huynh: kiến trúc vai trò đã có; màn hình riêng sẽ hoàn thiện ở chặng sau.

Mọi truy vấn ghi đều đối chiếu `classId` từ session; quyền tải báo cáo được kiểm tra tại API.

## Ma trận triển khai 14/08/2026

Các quyền `class.view`, `student.view`, `attendance.view/create/update`, `event.view/create`, `score.view`, `task.view/update` được lưu trong Permission/RolePermission với SELF/TEAM/CLASS. Quyền nhạy cảm không được cấp cho cán bộ lớp. `canPerform` đọc role permission và appointment đang hiệu lực từ database; điểm danh đã áp dụng kiểm tra này.

## Verification 2026-08-14 - attendance and class officers

- Dedicated `/diem-danh` page: date/previous/today/next, morning/afternoon, transactional session creation, batch upsert, server-side scope checks, finalized-week lock, audit trail and attendance-linked competition-event reconciliation.
- Added `/diem-danh/lich-su` with date/period/status filters and totals. Excel export, student/team filters and pagination remain open; therefore the full attendance epic remains PARTIAL, not release PASS.
- `/can-bo-lop`: DRAFT/SCHEDULED/ACTIVE/EXPIRED/REVOKED lifecycle, draft edit/delete, effective-record versioning, reason-required revocation and audit trail. Account invitation/activation and complete customer-account workflow remain open.
- Login throttling now uses normalized-email and trusted-IP keys through a pluggable store; memory in development, shared-store adapter required in production.
- Migration `20260814010000_attendance_officer_lifecycle` applied without resetting existing data. Prisma reports 5 migrations and schema up to date.
- Evidence: lint PASS; typecheck PASS; Vitest 37/37 PASS; Playwright desktop/mobile 22/22 PASS; production build PASS; npm audit 0 high/critical and 2 moderate (ExcelJS transitive uuid).
