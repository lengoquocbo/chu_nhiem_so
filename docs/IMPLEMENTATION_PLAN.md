# Kế hoạch triển khai

## Đã hoàn thành trong lát cắt chạy được

- Khởi tạo Next.js App Router, TypeScript strict, Tailwind và design system responsive.
- Mô hình dữ liệu Prisma đa trường/lớp; SQLite cục bộ do máy chưa có Docker/PostgreSQL.
- Đăng nhập cookie ký, mật khẩu bcrypt, kiểm tra quyền phía máy chủ và audit log.
- Dữ liệu mẫu lớp 8A1, 20 học sinh, 4 tổ, điểm danh, nội quy, sự kiện và nhiệm vụ.
- Dashboard, học sinh, điểm danh, sự kiện, nội quy, thi đua, nhiệm vụ, báo cáo, thông báo, cài đặt.
- Duyệt sự kiện, sửa điểm danh có tự sinh/hủy sự kiện, tính điểm, chốt tuần, Excel riêng tư.
- Tiếng Việt mặc định; cấu trúc vi/en và nút chuyển ngôn ngữ lưu theo tài khoản.

## Các chặng tiếp theo

- Biểu mẫu CRUD đầy đủ, nhập/xem trước Excel, quản lý phụ huynh và bổ nhiệm theo thời hạn.
- Bằng chứng upload, giải trình, mở lại tuần theo phiên bản, xếp hạng tổ và PDF.
- Hoàn thiện bản dịch English cho mọi trang phụ, Zalo OA thật khi có API.
- Chuyển datasource sang PostgreSQL, bổ sung rate limit phân tán và bộ integration/E2E đầy đủ.

## Cập nhật 13/08/2026 — quản lý học sinh và Excel

Đã hoàn thành và có mã chạy thật:
- CRUD học sinh: thêm, xem, sửa, chuyển trạng thái nghiệp vụ; không xóa cứng.
- Quản lý nhiều người giám hộ và người liên hệ chính.
- Phân tổ/chuyển tổ có lịch sử và lý do; kiểm tra `classId` tại server.
- Nhập Excel: file mẫu tiếng Việt, giới hạn 5 MB, xem trước, lỗi từng dòng, phát hiện trùng, xác nhận mới ghi database.
- Rate limit đăng nhập cục bộ; migration cho lịch sử chuyển tổ và khung bổ nhiệm cán bộ.

Chưa hoàn thành trong lượt này:
- CRUD trường, năm học, học kỳ, lớp và tổ.
- Giao diện bổ nhiệm cán bộ theo thời hạn (schema đã có).
- Upload minh chứng, giải trình, mở lại tuần theo phiên bản, PDF và bản dịch English toàn diện.

## Cập nhật 13/08/2026 - kiểm toán thương mại

Đã hoàn thành trong lát cắt này: bộ tài liệu phát hành; launcher ẩn tự mở trình duyệt; health/readiness; security headers; Dockerfile/Compose nền tảng; sửa báo cáo Excel tuần 8 sheet; E2E 12/12 desktop/mobile; lint, typecheck, 16 unit và build đều PASS. Ưu tiên tiếp theo: CRUD cấu trúc trường và trang /can-bo-lop với RBAC SELF/TEAM/CLASS. Sản phẩm chưa sẵn sàng bán; xem RELEASE_AUDIT.md.

## Cập nhật 14/08/2026 — cán bộ lớp và RBAC

Đã tạo /can-bo-lop, bổ nhiệm/thu hồi theo hiệu lực, liên kết tài khoản, kiểm tra class/school phía server, transaction và audit log. Policy SELF/TEAM/CLASS đã được tách dùng chung; action điểm danh chặn tổ trưởng thao tác ngoài tổ. Unit 20/20, E2E 16/16 desktop/mobile, lint/typecheck/build PASS. RBAC toàn hệ thống vẫn FAIL cho đến khi policy được áp dụng đầy đủ sang sự kiện, nhiệm vụ, phụ huynh và hồ sơ cá nhân.


## Cập nhật 14/08/2026 — dependency, cấu trúc trường và RBAC

Đã nâng Prisma/client 6.19.3, loại toàn bộ High; tạo migration cộng dồn có backup; hoàn thiện 5 trang CRUD cấu trúc; bổ sung ClassMembership, lịch sử chuyển lớp, Permission/RolePermission; hoàn thiện appointment nhiều lớp/thời hạn/ghi chú và backend quyền điểm danh theo tổ. Kiểm tra: 30/30 unit/integration, integration chuyên biệt 5/5, E2E 18/18, lint/typecheck/build PASS. RBAC toàn module, PostgreSQL và các mục go-live vẫn FAIL.


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