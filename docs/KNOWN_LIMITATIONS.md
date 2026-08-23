# Giới hạn đã biết

- Sản phẩm chưa sẵn sàng bán: còn PostgreSQL production, điểm danh đầy đủ, RBAC toàn module, tài khoản khách hàng, backup/restore, hạ tầng và pháp lý.
- `npm audit` còn 2 cảnh báo Moderate do ExcelJS 4.4.0 phụ thuộc UUID 8.3.2. ExcelJS 4.4.0 là bản mới nhất; đề xuất tự động hạ về 3.4.0 không an toàn về tính năng. Ứng dụng không gọi UUID v3/v5/v6 với `buf`/offset do người dùng kiểm soát; file Excel chỉ được ExcelJS đọc sau giới hạn loại `.xlsx` và 5 MB. Theo dõi bản ExcelJS cập nhật hoặc đánh giá thay thế trước phát hành chính thức.
- Prisma CLI cảnh báo cấu hình seed trong `package.json` sẽ bỏ ở Prisma 7; đang giữ Prisma 6.19.3 để tránh nâng major không cần thiết.
- SQLite chỉ dùng development/test. Production vẫn bắt buộc PostgreSQL và chưa có bằng chứng migration sạch/restore drill.
## Verification 2026-08-14 - attendance and class officers

- Dedicated `/diem-danh` page: date/previous/today/next, morning/afternoon, transactional session creation, batch upsert, server-side scope checks, finalized-week lock, audit trail and attendance-linked competition-event reconciliation.
- Added `/diem-danh/lich-su` with date/period/status filters and totals. Excel export, student/team filters and pagination remain open; therefore the full attendance epic remains PARTIAL, not release PASS.
- `/can-bo-lop`: DRAFT/SCHEDULED/ACTIVE/EXPIRED/REVOKED lifecycle, draft edit/delete, effective-record versioning, reason-required revocation and audit trail. Account invitation/activation and complete customer-account workflow remain open.
- Login throttling now uses normalized-email and trusted-IP keys through a pluggable store; memory in development, shared-store adapter required in production.
- Migration `20260814010000_attendance_officer_lifecycle` applied without resetting existing data. Prisma reports 5 migrations and schema up to date.
- Evidence: lint PASS; typecheck PASS; Vitest 37/37 PASS; Playwright desktop/mobile 22/22 PASS; production build PASS; npm audit 0 high/critical and 2 moderate (ExcelJS transitive uuid).

## Xác minh 14/08/2026 — encoding Điểm danh và license ngoại tuyến

| Điều kiện | Trạng thái | Bằng chứng |
|---|---|---|
| UTF-8 module Điểm danh | PASS | Bốn tệp được sao lưu rồi viết UTF-8 không BOM; `npm run check:encoding` PASS cho module; test/build PASS. Bộ quét còn báo 19 lỗi cũ ngoài module nên toàn dự án chưa sạch. |
| Lõi chữ ký Ed25519 | PARTIAL | `src/lib/license/core.ts`, CLI issuer và 5 unit test PASS: chữ ký hợp lệ, tamper, canonical, ranh giới ngày, grace, product/installation. |
| LOCAL_MANAGED hoàn chỉnh | FAIL | Chưa có `/ban-quyen`, LicenseStorage atomic, public-key provisioning, assertWriteAllowed toàn hệ thống, backup/export khi hết hạn, E2E license và customer-build secret scan. |
| Giáo viên bộ môn | FAIL | Yêu cầu mới đã ghi nhận nhưng chưa có schema/migration/UI/authorization/E2E trong lát cắt này. |

Không đủ điều kiện phát hành hoặc dùng dữ liệu thật.

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