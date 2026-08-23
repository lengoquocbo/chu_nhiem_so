# Hướng dẫn sử dụng

1. Chạy lệnh cài đặt cơ sở dữ liệu và khởi động theo README.
2. Mở `http://localhost:3000`, đăng nhập tài khoản mẫu.
3. Tổng quan cho biết sĩ số, điểm danh, sự kiện chờ duyệt và nhiệm vụ.
4. Bấm **Duyệt** để xác nhận sự kiện. Chỉ sự kiện đã duyệt mới tính điểm.
5. Sửa trạng thái điểm danh và bấm **Lưu**; hệ thống thay sự kiện cũ để không trừ hai lần.
6. Khi không còn sự kiện chờ duyệt, bấm **Chốt kết quả tuần**.
7. Vào **Báo cáo** để tải Excel. Học sinh không thể tải file này.
8. Bấm **English/Tiếng Việt** phía trên để đổi ngôn ngữ.

## Verification 2026-08-14 - attendance and class officers

- Dedicated `/diem-danh` page: date/previous/today/next, morning/afternoon, transactional session creation, batch upsert, server-side scope checks, finalized-week lock, audit trail and attendance-linked competition-event reconciliation.
- Added `/diem-danh/lich-su` with date/period/status filters and totals. Excel export, student/team filters and pagination remain open; therefore the full attendance epic remains PARTIAL, not release PASS.
- `/can-bo-lop`: DRAFT/SCHEDULED/ACTIVE/EXPIRED/REVOKED lifecycle, draft edit/delete, effective-record versioning, reason-required revocation and audit trail. Account invitation/activation and complete customer-account workflow remain open.
- Login throttling now uses normalized-email and trusted-IP keys through a pluggable store; memory in development, shared-store adapter required in production.
- Migration `20260814010000_attendance_officer_lifecycle` applied without resetting existing data. Prisma reports 5 migrations and schema up to date.
- Evidence: lint PASS; typecheck PASS; Vitest 37/37 PASS; Playwright desktop/mobile 22/22 PASS; production build PASS; npm audit 0 high/critical and 2 moderate (ExcelJS transitive uuid).

## Xác minh 14/08/2026 — LicenseStorage và chế độ chỉ đọc

- `FileLicenseStorage` lưu ngoài source tại `%LOCALAPPDATA%\ChuNhiemSo\license`, ghi file tạm và rename atomic, giữ bản `.previous`.
- `/ban-quyen` hiển thị trạng thái/thời hạn/giới hạn và chỉ nhận file tối đa 250 KB; server xác minh Ed25519 trước khi thay thế.
- `assertWriteAllowed` đã áp dụng vào mutation hiện có của trường/lớp/tổ, học sinh/phụ huynh/import, điểm danh, sự kiện/chốt tuần và cán bộ lớp. Login, xem, đổi ngôn ngữ, nhập license và xuất dữ liệu cũ không bị chặn.
- `renew-license` xác minh license cũ, yêu cầu hạn mới dài hơn, tạo licenseId/nonce mới và `previousLicenseId`; không sửa file cũ.
- Encoding toàn dự án: PASS. Unit/integration 45/45 PASS. E2E desktop/mobile 24/24 PASS. Build PASS. Audit 0 Critical/High, 2 Moderate ExcelJS/uuid.
- Trạng thái LOCAL_MANAGED vẫn PARTIAL: chưa có E2E license hợp lệ→hết hạn→gia hạn xuyên suốt, backup/restore drill, xuất toàn bộ dữ liệu khi hết hạn và public key phát hành chính thức. Không sẵn sàng bán.
