# HƯỚNG DẪN TẠO LICENSE CHỦ NHIỆM SỐ

Tài liệu dành cho người bán, không yêu cầu biết lập trình.

## 1. Mở trình tạo license

Mở thư mục dự án, vào `tools\license-issuer`, rồi nhấp đúp `TAO_LICENSE_WINDOWS.vbs`. Nếu Windows không mở, nhấp đúp `TAO_LICENSE_WINDOWS.bat`.

## 2. Khởi tạo khóa lần đầu

1. Bấm **Khởi tạo cặp khóa lần đầu**.
2. Chọn một thư mục ngoài dự án, ví dụ ổ USB mã hóa hoặc `D:\KHOA_CHU_NHIEM_SO`.
3. Công cụ tạo:
   - `chu-nhiem-so-private.pem`: khóa bí mật, chỉ người bán giữ.
   - `chu-nhiem-so-public.pem`: khóa công khai dùng trong bản khách.
4. Sao lưu thư mục khóa ở ít nhất hai nơi ngoại tuyến được bảo vệ.

Không tạo lại khóa nếu đã phát hành license. Mất private key đồng nghĩa không thể gia hạn bằng cùng danh tính phát hành. Không gửi private key qua email/Zalo, không chép vào dự án, Git hoặc bộ cài khách hàng.

## 3. Nhận Mã cài đặt

Khách mở **Bản quyền**, bấm **Sao chép mã** và gửi mã dạng `CNS-XXXXXXXX-XXXX` cho người bán.

## 4. Nhập biểu mẫu

- **Private key**: chọn `chu-nhiem-so-private.pem` trên máy người bán.
- **Tên khách hàng**: họ tên giáo viên mua phần mềm.
- **Tên trường**: trường khách đang công tác.
- **Mã cài đặt**: dán nguyên mã khách gửi.
- **Ngày bắt đầu/ngày hết hạn**: thời hạn đã thỏa thuận.
- **Số lớp/học sinh/tài khoản con**: giới hạn được bán.
- **Tính năng**: đánh dấu tính năng khách được sử dụng.

Bấm **Xem trước**, đọc lại toàn bộ thông tin, rồi bấm **Tạo file license** và xác nhận. Chọn thư mục lưu ngoài thư mục khóa.

## 5. File gửi khách

Chỉ gửi file có đuôi `.license`. Không gửi private key, thư mục dữ liệu người bán hoặc công cụ issuer.

## 6. Gia hạn

Dùng CLI trong Command Prompt:

```powershell
npm.cmd run license:issuer -- renew-license --private-key "D:\KHOA_CHU_NHIEM_SO\chu-nhiem-so-private.pem" --public-key "D:\KHOA_CHU_NHIEM_SO\chu-nhiem-so-public.pem" --file "D:\LICENSE\license-cu.license" --out "D:\LICENSE\license-gia-han.license" --expires 2028-08-31
```

Gửi file gia hạn mới cho khách. Không sửa hoặc ghi đè file cũ.

## 7. Kiểm tra chữ ký

```powershell
npm.cmd run license:issuer -- verify-license --public-key "D:\KHOA_CHU_NHIEM_SO\chu-nhiem-so-public.pem" --file "D:\LICENSE\license-gia-han.license"
```

Public key chính thức phải được chép thành `resources\license-public-key.pem` khi đóng gói bản khách. Production không đọc public key từ biến môi trường.