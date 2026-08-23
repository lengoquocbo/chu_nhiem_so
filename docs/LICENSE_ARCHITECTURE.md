# Kiến trúc license ngoại tuyến

Bản LOCAL_MANAGED dùng Ed25519. Công cụ `tools/license-issuer` giữ riêng với ứng dụng khách. Ứng dụng khách chỉ được nhận public key và tệp `.license`. Payload được canonicalize trước khi ký; mọi trường đều không đáng tin cho tới khi chữ ký hợp lệ. Trạng thái sau hết hạn là `READ_ONLY_EXPIRED`: không xóa dữ liệu và phải cho phép xem/sao lưu/xuất.

Trạng thái hiện tại: lõi xác minh và CLI phát hành đã hoạt động; LicenseStorage, trang `/ban-quyen`, chặn mutation và backup/export vẫn chưa hoàn tất nên chưa PASS.