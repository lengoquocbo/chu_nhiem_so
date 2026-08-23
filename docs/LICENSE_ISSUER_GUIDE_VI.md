# Hướng dẫn công cụ phát hành license

Cách dễ nhất trên Windows: nhấp đúp `tools\license-issuer\TAO_LICENSE_WINDOWS.vbs`. Biểu mẫu có kiểm tra bắt buộc và bước xem trước trước khi ký.

CLI dành cho kiểm tra kỹ thuật:

```powershell
npm.cmd run license:issuer -- init-keys --out "D:\KHOA_CHU_NHIEM_SO"
npm.cmd run license:issuer -- inspect-license --file "D:\LICENSE\khach.license"
npm.cmd run license:issuer -- verify-license --public-key "D:\KHOA_CHU_NHIEM_SO\chu-nhiem-so-public.pem" --file "D:\LICENSE\khach.license"
```

Xem hướng dẫn đầy đủ tại `docs/HUONG_DAN_TAO_LICENSE_VI.md`. Private key phải nằm ngoài repository và ngoài bộ cài khách hàng.