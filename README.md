# CHỦ NHIỆM SỐ

Ứng dụng web quản lý lớp học dành cho giáo viên chủ nhiệm Việt Nam. Bản hiện tại là một lát cắt cốt lõi chạy cục bộ, dùng dữ liệu hoàn toàn giả lập.

## Yêu cầu máy

- Node.js 20 trở lên và npm.
- Máy hiện tại không có Docker/PostgreSQL, vì vậy bản thử dùng SQLite. Kiến trúc Prisma cho phép đổi `provider`/`DATABASE_URL` sang PostgreSQL trước khi dùng thật.

## Cài đặt lần đầu

```powershell
npm install
Copy-Item .env.example .env
npm run db:generate
npx prisma db push
npm run db:seed
```

Trong `.env`, hãy thay `AUTH_SECRET` bằng chuỗi ngẫu nhiên dài ít nhất 32 ký tự trước khi dùng ngoài môi trường thử.

## Khởi chạy

```powershell
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Tài khoản mẫu

Mật khẩu chung: `Giaovien@123` (chỉ dùng development, phải đổi trước dữ liệu thật).

| Vai trò | Email |
|---|---|
| Giáo viên | `giaovien@chunhiemso.local` |
| Lớp trưởng | `loptruong@chunhiemso.local` |
| Lớp phó học tập | `lopphohoc@chunhiemso.local` |
| Lớp phó kỷ luật | `lopphokl@chunhiemso.local` |
| Tổ trưởng | `totruong@chunhiemso.local` |
| Học sinh | `hocsinh@chunhiemso.local` |
| Phụ huynh | `phuhuynh@chunhiemso.local` |

## Kiểm tra

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

## Chuyển sang PostgreSQL

Đổi `provider = "postgresql"` trong `prisma/schema.prisma`, đặt `DATABASE_URL` PostgreSQL, sau đó chạy `npx prisma migrate deploy` và seed trong môi trường được phép. Xem thêm `docs/BACKUP_RESTORE.md` và `docs/SECURITY.md`.

## Tài liệu

Xem thư mục `docs/` cho kế hoạch, yêu cầu, phân quyền, tính điểm, thiết kế dữ liệu, bảo mật, sao lưu, hướng dẫn sử dụng, đa ngôn ngữ và Zalo OA.

## Sao lưu và xuất dữ liệu

Sau khi đăng nhập giáo viên, mở `http://localhost:3000/sao-luu`. Nút **Sao lưu ngay** tạo database SQLite nhất quán; **Xuất toàn bộ dữ liệu** tải ZIP gồm JSON, CSV, Excel và manifest checksum. Kiểm tra khôi phục bằng `npm.cmd run test:backup`; xem hướng dẫn chi tiết tại `docs/BACKUP_RESTORE.md`.
## License ngoại tuyến cho người mới

Khách hàng mở `http://localhost:3000/ban-quyen`, sao chép Mã cài đặt và gửi người bán. Người bán nhấp đúp `tools\license-issuer\TAO_LICENSE_WINDOWS.vbs`, xem trước rồi tạo file `.license`. Khách chọn file trên trang Bản quyền và bấm **Nhập license**. Hướng dẫn: `docs/HUONG_DAN_TAO_LICENSE_VI.md` và `docs/HUONG_DAN_NHAP_LICENSE_VI.md`.

Production chỉ tin public key cố định tại `resources\license-public-key.pem`; private key tuyệt đối không nằm trong dự án/bản khách. Trước đóng gói chạy `npm run build`, `npm run prepare:customer-build`, `npm run check:customer-build`.