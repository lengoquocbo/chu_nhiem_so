# Gia hạn license

Gia hạn phải tạo file mới, không sửa file cũ. Giữ nguyên customerId, tạo licenseId/nonce mới và ghi previousLicenseId. Lệnh `renew-license` và giao diện nhập thay thế atomic vẫn đang được triển khai; không sử dụng thao tác sửa JSON thủ công.