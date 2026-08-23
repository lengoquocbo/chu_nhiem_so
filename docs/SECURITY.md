# Bảo mật

Mật khẩu băm bcrypt 12 vòng; session JWT ký trong cookie HttpOnly, SameSite=Lax, Secure ở production. Server action/API kiểm tra đăng nhập, vai trò và `classId`. Zod kiểm tra input. Báo cáo tạo tức thời, `no-store`, không có URL công khai vĩnh viễn và có audit. Không log mật khẩu/token. Trước dữ liệu thật phải đổi AUTH_SECRET, mật khẩu mẫu và dùng PostgreSQL/TLS; cần bổ sung rate limit bền vững và quét virus upload.

## Đánh giá dependency 14/08/2026

- Prisma CLI và client nâng đồng bộ từ 6.19.0 lên 6.19.3; `@prisma/config` 6.19.3 dùng `effect` 3.21.0, loại GHSA-38f7-945m-qr2g.
- Audit còn UUID Moderate qua ExcelJS. Không có API ứng dụng nào gọi UUID v3/v5/v6 với buffer/offset do người dùng kiểm soát. Không dùng `audit fix --force` và không hạ ExcelJS.
- Quyền nhạy cảm không được cấp cho cán bộ: duyệt/từ chối sự kiện, điều chỉnh điểm, chốt/mở tuần, báo cáo riêng, phân quyền, nội quy và dữ liệu riêng phụ huynh.
