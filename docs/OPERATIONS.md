# Vận hành

Theo dõi `/api/health` cho tiến trình và `/api/ready` cho database. Cảnh báo theo tỷ lệ lỗi, latency, login thất bại, dung lượng DB/storage và backup. Log phải có request ID, tenant/class scope, action, thời gian; không chứa token, cookie, mật khẩu, điện thoại hay nội dung giải trình. Kiểm tra backup hằng ngày và restore drill định kỳ.