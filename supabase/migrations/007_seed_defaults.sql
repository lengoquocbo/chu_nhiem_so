-- =========================================================
-- 007_seed_defaults.sql
-- Dữ liệu mặc định cần có trước khi dùng score engine / attendance.
-- =========================================================

insert into event_types (code, name, requires_criteria) values
  ('ATTENDANCE_LATE', 'Đi muộn', true),
  ('ATTENDANCE_ABSENT_UNEXCUSED', 'Nghỉ không phép', true),
  ('ATTENDANCE_LEFT_EARLY', 'Về sớm', true),
  ('VIOLATION', 'Vi phạm nội quy', true),
  ('ACHIEVEMENT', 'Đạt thành tích', true),
  ('TASK_DONE', 'Hoàn thành nhiệm vụ', true),
  ('ACTIVITY_PARTICIPATION', 'Tham gia hoạt động', true),
  ('HOMEWORK_MISSING', 'Không làm bài tập', true)
on conflict (code) do nothing;

-- Xếp loại mặc định áp dụng toàn trường (class_id = null).
-- GVCN/BGH có thể thêm rank_configs riêng cho từng lớp để ghi đè.
insert into rank_configs (class_id, min_score, max_score, label, order_index) values
  (null, 90, 100, 'Tốt', 1),
  (null, 80, 89.999, 'Khá', 2),
  (null, 70, 79.999, 'Đạt', 3),
  (null, 0, 69.999, 'Chưa đạt', 4)
on conflict do nothing;
