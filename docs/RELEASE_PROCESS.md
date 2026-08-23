# Quy trình phát hành

Nhánh phát hành → migration review → lint/typecheck/unit/integration/E2E/build → dependency scan → staging → smoke/restore test → phê duyệt → backup production → deploy cùng image → readiness → giám sát → release notes. Rollback ứng dụng không tự rollback migration phá hủy; migration phải tương thích ngược.