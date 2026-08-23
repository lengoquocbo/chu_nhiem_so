# Sao lưu và khôi phục bản cục bộ

## Sao lưu từ giao diện

1. Đăng nhập bằng tài khoản giáo viên chủ nhiệm hoặc quản trị.
2. Mở **Sao lưu dữ liệu** trên menu.
3. Bấm **Sao lưu ngay**.
4. Bấm **Tải xuống** và lưu tệp `.db` sang ổ đĩa khác hoặc USB được bảo vệ.

Ứng dụng dùng SQLite `VACUUM INTO`, không sao chép thô khi database đang ghi. Bản mặc định nằm tại `%LOCALAPPDATA%\ChuNhiemSo\backups`. Mỗi bản hiển thị checksum SHA-256. Sao lưu vẫn được phép khi license hết hạn.

## Khôi phục an toàn

1. Dừng ứng dụng.
2. Mở Command Prompt trong thư mục cài đặt.
3. Chạy:

```powershell
npm.cmd run restore:database -- --file "D:\Duong-dan\chu-nhiem-so-YYYYMMDD-HHMMSS.db" --confirm KHOI-PHUC
```

Công cụ kiểm tra SQLite header, tạo bản `dev.db.before-restore-...bak`, sao chép sang tệp tạm rồi mới thay thế. Nếu thay thế lỗi, công cụ đưa database cũ trở lại. Không khôi phục khi ứng dụng đang chạy.

## Kiểm tra định kỳ

Chạy `npm.cmd run test:backup`. Restore drill chỉ dùng thư mục tạm và so sánh checksum, không thay database thật. Sau khi khôi phục dữ liệu thật, mở ứng dụng và kiểm tra sĩ số, điểm danh, sự kiện, báo cáo trước khi tiếp tục nhập liệu.