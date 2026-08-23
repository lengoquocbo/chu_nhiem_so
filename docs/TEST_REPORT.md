# Báo cáo kiểm thử

Ngày xác minh: 14/08/2026.

- Prisma: 6.19.3; generate PASS; 4 migration up-to-date; backup SQLite tạo trước migration.
- npm audit: 0 Critical, 0 High, 2 Moderate.
- Lint: PASS, 0 lỗi.
- Typecheck strict: PASS.
- Unit + integration trong suite chung: 30/30 PASS, 5 tệp.
- Integration database chuyên biệt: 5/5 PASS (CRUD cấu trúc, FK/unique và ma trận quyền).
- Playwright: 18/18 PASS trên Desktop Chrome và Pixel 7.
- Production build: PASS; 16 route, gồm 5 trang cấu trúc và `/can-bo-lop`.
- Readiness: database connected.

Chưa chạy PostgreSQL migration/backup restore và chưa đủ E2E cho mutation toàn bộ CRUD, hai tenant, appointment thu hồi qua UI.
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

## Xác minh 14/08/2026 — sao lưu, khôi phục và xuất toàn bộ dữ liệu

| Điều kiện | Trạng thái | Bằng chứng mã nguồn | Kiểm thử | Ngày xác minh |
|---|---|---|---|---|
| Sao lưu SQLite nhất quán | PASS | `src/lib/backup.ts` dùng `VACUUM INTO`; `/sao-luu`; API tải có xác thực và tên tệp whitelist | Tạo thật bản 909.312 byte, SHA-256 `37826c...67ff3`; E2E desktop/mobile | 14/08/2026 |
| Khôi phục an toàn | PASS (CLI cục bộ) | `tools/restore-backup.cjs` kiểm tra SQLite header, bắt buộc `KHOI-PHUC`, tạo bản `.before-restore`, thay thế có rollback | `npm run test:backup`: PASS trên thư mục tạm, checksum sau restore khớp | 14/08/2026 |
| Xuất toàn bộ dữ liệu | PASS | `/api/data-export`, `src/lib/zip.ts`: ZIP chứa JSON, CSV UTF-8, XLSX, manifest và SHA-256; giới hạn 100.000 bản ghi; quyền giáo viên và audit log | E2E tải file thật desktop/mobile PASS | 14/08/2026 |
| Sao lưu/xuất khi license hết hạn | PASS ở lớp authorization | Hai luồng không gọi `assertWriteAllowed`, vẫn yêu cầu đăng nhập giáo viên; mutation nghiệp vụ vẫn bị chặn | Unit license + E2E quyền sao lưu; còn thiếu E2E xuyên suốt thay license ACTIVE→EXPIRED→RENEWED | 14/08/2026 |
| UTF-8 toàn bộ vùng mã nguồn phát hành | PASS | `scripts/check-encoding.cjs` quét `src`, `messages`, `prisma`, `docs`, `e2e`, `scripts`, `tools`, phát hiện BOM/U+FFFD/mojibake | `npm run check:encoding`: PASS | 14/08/2026 |

Kết luận không thay đổi: **CHƯA SẴN SÀNG PHÁT HÀNH BẢN CỤC BỘ**. Cơ chế license vẫn PARTIAL cho đến khi có E2E ACTIVE→EXPIRED/read-only→RENEWED, public key phát hành chính thức, kiểm thử gói Windows sạch và rà soát toàn bộ mutation mới về `assertWriteAllowed`.
### Kết quả lệnh cuối lượt 14/08/2026

- `npm.cmd run check:encoding`: PASS.
- `npm.cmd run lint`: PASS.
- `npm.cmd run typecheck`: PASS.
- `npm.cmd test`: 48/48 PASS, 9/9 tệp.
- `npm.cmd run test:backup`: PASS; restore drill checksum khớp, database thật không bị thay thế.
- `npm.cmd run test:e2e`: 28/28 PASS trên desktop/mobile.
- `npm.cmd run build`: PASS; có route `/sao-luu`, `/api/backups/download`, `/api/data-export`.
- `npm.cmd audit --audit-level=high`: PASS; 0 Critical/High, còn 2 Moderate gián tiếp từ ExcelJS/uuid; không dùng `npm audit fix --force` vì đề xuất hạ ExcelJS xuống bản breaking.
- Development server: trang `http://localhost:3000/dang-nhap` trả HTTP 200 và tiếp tục chạy.
## Xác minh 14/08/2026 — quy trình license dành cho người mới

| Điều kiện | Trạng thái | Bằng chứng | Kiểm thử |
|---|---|---|---|
| Mã cài đặt ổn định và nút sao chép | PASS | `src/lib/license/installation.ts`, `/ban-quyen`, `installation-code.tsx`; lưu ngoài source tại `%LOCALAPPDATA%\ChuNhiemSo\installation` | Unit + E2E desktop/mobile |
| Nhập file `.license`/`.json` | PASS | Form file-only, tối đa 250 KB; phản hồi riêng chữ ký, máy, sản phẩm, lịch hiệu lực; refresh dữ liệu ngay | E2E file giả mạo; unit trạng thái |
| Production bắt buộc license | PASS về mã nguồn | Production chỉ tin `resources/license-public-key.pem`; không dùng `LICENSE_ENFORCEMENT` hoặc public key từ env | Integration test `LICENSE_ENFORCEMENT=0` vẫn MISSING/read-only |
| Chế độ hết hạn chỉ đọc | PASS ở runtime hiện có | `assertWriteAllowed` chặn mutation hiện hữu; backup/export/import license không bị chặn; dữ liệu không bị xóa | Unit runtime expired + E2E backup/export |
| CLI issuer Ed25519 | PASS | `init-keys`, `issue-license`, `renew-license`, `inspect-license`, `verify-license` | CLI integration: phát hành→verify→renew→tamper reject |
| Trình tạo license Windows | PASS về mã nguồn | `tools/license-issuer/TAO_LICENSE_WINDOWS.vbs`, `.bat`, `license-issuer-gui.ps1`; validate, preview, chọn tính năng, Save dialog | PowerShell parser PASS; cần chủ sản phẩm chạy nghiệm thu trực quan trên máy phát hành |
| Private key không vào bản khách | PASS ở artifact hiện tại | `prepare:customer-build` bỏ script issuer; `check:customer-build` quét standalone/static | Customer artifact scan PASS |
| Public key phát hành chính thức | FAIL — cần chủ sản phẩm | Chưa tạo/commit public key thật theo yêu cầu “không tạo license mẫu dùng thật”. Production sẽ từ chối license an toàn cho đến khi chủ sản phẩm tạo khóa ngoài repo và chép public key vào `resources/license-public-key.pem` trước đóng gói | Cần dấu vân tay public key được chủ sản phẩm xác nhận |

Không đổi kết luận phát hành: **CHƯA SẴN SÀNG PHÁT HÀNH BẢN CỤC BỘ** cho đến khi public key chính thức được cung cấp và trình GUI/bộ cài sạch được nghiệm thu trực quan trên máy Windows phát hành.