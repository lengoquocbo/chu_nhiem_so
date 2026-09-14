-- =========================================================
-- 018_seed_default_subjects.sql
-- Danh mục môn học mặc định cho GVBM và cấu hình thời khóa biểu.
-- Giữ cả môn tích hợp (THCS) và môn tách riêng (THPT).
-- =========================================================

insert into subjects (name, status) values
  ('Ngữ văn', 'active'),
  ('Toán', 'active'),
  ('Ngoại ngữ 1', 'active'),
  ('Giáo dục công dân', 'active'),
  ('Lịch sử và Địa lí', 'active'),
  ('Khoa học tự nhiên', 'active'),
  ('Công nghệ', 'active'),
  ('Tin học', 'active'),
  ('Giáo dục thể chất', 'active'),
  ('Nghệ thuật', 'active'),
  ('Hoạt động trải nghiệm, hướng nghiệp', 'active'),
  ('Nội dung giáo dục địa phương', 'active'),
  ('Lịch sử', 'active'),
  ('Giáo dục quốc phòng và an ninh', 'active'),
  ('Địa lí', 'active'),
  ('Giáo dục kinh tế và pháp luật', 'active'),
  ('Vật lí', 'active'),
  ('Hóa học', 'active'),
  ('Sinh học', 'active'),
  ('Âm nhạc', 'active'),
  ('Mỹ thuật', 'active')
on conflict (name) do update set status = 'active';
