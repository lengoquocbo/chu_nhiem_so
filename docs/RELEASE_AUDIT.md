# Kiểm toán phát hành

Ngày xác minh: 14/08/2026. Kết luận: **CHƯA SẴN SÀNG BÁN**.

| Điều kiện phát hành | Trạng thái | Bằng chứng | Tệp liên quan | Test liên quan | Việc cần thực hiện | Ngày xác minh |
|---|---|---|---|---|---|---|
| Không có Critical/High từ npm audit | PASS | Prisma/client 6.19.3; effect 3.21.0; audit 0 Critical, 0 High, 2 Moderate | `package.json`, `package-lock.json` | `npm audit` | Theo dõi bản ExcelJS mới | 14/08/2026 |
| CRUD trường/năm học/học kỳ/lớp/tổ | PASS | 5 trang thật, server validation, school scope, soft archive, audit log, constraint | `src/app/truong-hoc`, `src/app/nam-hoc`, `src/app/hoc-ky`, `src/app/lop-hoc`, `src/app/to-hoc-tap` | Unit 30/30; integration 5/5; E2E desktop/mobile | Bổ sung UX xác nhận modal nâng cao | 14/08/2026 |
| Migration cấu trúc thương mại SQLite | PASS | Backup trước migration; 4 migration up-to-date; Prisma generate 6.19.3 | `prisma/migrations`, `prisma/backups`, `prisma/schema.prisma` | `prisma migrate status` | PostgreSQL vẫn là mục riêng | 14/08/2026 |
| Cán bộ lớp và ma trận quyền nền tảng | PASS | `/can-bo-lop`, chọn lớp/tổ/thời hạn/ghi chú; Permission/RolePermission; hết hạn mất quyền; audit | `src/app/can-bo-lop`, `src/lib/authorization.ts`, `prisma/schema.prisma` | Unit scope/expiry/conflict; E2E 403 | Mở rộng integration mutation qua HTTP | 14/08/2026 |
| Tổ trưởng chỉ cập nhật điểm danh đúng tổ | PASS | Backend đọc appointment và scope từ DB, không tin teamId trình duyệt | `src/app/actions.ts`, `src/lib/authorization.ts` | Unit TEAM scope | Áp dụng canPerform sang toàn bộ module | 14/08/2026 |
| Lint/typecheck/test/build | PASS | Lint 0 lỗi; typecheck 0 lỗi; 30/30 test; integration 5/5; E2E 18/18; build thành công | `package.json`, `docs/TEST_REPORT.md` | Vitest/Playwright | Duy trì CI | 14/08/2026 |
| Báo cáo Excel tuần riêng tư | PASS | Backend teacher/class check, 8 sheet, audit tải | `src/app/api/reports/week/route.ts` | E2E desktop/mobile | PDF/kỳ khác còn FAIL | 13/08/2026 |
| Health/readiness và security headers cơ bản | PASS | `/api/health`, `/api/ready` 200; CSP/nosniff/frame deny | `src/app/api`, `next.config.ts` | E2E/HTTP | Monitoring và nonce production | 14/08/2026 |
| Điểm danh nhiều ngày/buổi hoàn chỉnh | FAIL | Chưa đủ lịch, tạo buổi, thống kê và toàn bộ E2E bắt buộc | `src/app/actions.ts` | Chưa đủ | Hoàn thiện module | 14/08/2026 |
| RBAC SELF/TEAM/CLASS trên toàn hệ thống | FAIL | Nền tảng DB/policy đã có; sự kiện, nhiệm vụ, phụ huynh chưa áp dụng toàn diện | `src/lib/authorization.ts` | Unit nền tảng | Áp dụng `canPerform` cho mọi module và cross-tenant E2E | 14/08/2026 |
| Chốt/mở lại tuần có phiên bản | FAIL | Chốt có snapshot; mở lại/version chưa đủ | `src/app/actions.ts` | Unit scoring | Thêm version/report superseded | 14/08/2026 |
| Excel/PDF/tháng/học kỳ/năm | FAIL | Excel tuần có; PDF và kỳ khác chưa đủ | `src/app/api/reports/week` | E2E Excel | Hoàn thiện báo cáo | 14/08/2026 |
| Tài khoản khách hàng đầy đủ | FAIL | Chưa có đăng ký/xác minh/reset | `src/lib/auth.ts` | Chưa có | Email adapter/token | 14/08/2026 |
| Multi-tenant kiểm thử toàn diện | FAIL | School/membership scope đã cải thiện; chưa có hai tenant E2E đầy đủ | `ClassMembership`, server actions | Integration cục bộ | Cross-tenant suite | 14/08/2026 |
| PostgreSQL production | FAIL | Hiện dùng SQLite; chưa chạy PostgreSQL sạch | `prisma/schema.prisma`, `docker-compose.yml` | Chưa chạy | Migration PostgreSQL thật | 14/08/2026 |
| Gói dịch vụ | FAIL | Chưa triển khai | Chưa có | Chưa có | Plan/Subscription/Usage | 14/08/2026 |
| Backup/restore PostgreSQL | FAIL | Chỉ backup SQLite development; chưa restore drill PostgreSQL | `prisma/backups` | Chưa có | Chạy drill | 14/08/2026 |
| Staging/production/monitoring | FAIL | Chưa có hạ tầng thật | `Dockerfile`, `docs/DEPLOYMENT.md` | Chưa có | Cấu hình hạ tầng | 14/08/2026 |
| Pháp lý và GO_LIVE được phê duyệt | FAIL | Bản nháp, chưa ký | `docs/TERMS_DRAFT.md`, `docs/GO_LIVE_CHECKLIST.md` | Không áp dụng | Chuyên gia/chủ sản phẩm phê duyệt | 14/08/2026 |
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