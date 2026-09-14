-- =========================================================
-- 014_enrollment_position.sql
-- Thêm cột "chức vụ" vào bảng ghi danh học sinh
-- =========================================================

alter table student_class_enrollments
  add column if not exists position text
    check (position in ('class_monitor', 'vice_monitor', 'secretary', 'group_leader', null));

comment on column student_class_enrollments.position is
  'Chức vụ trong lớp: class_monitor=Lớp trưởng, vice_monitor=Lớp phó, secretary=Bí thư, group_leader=Tổ trưởng, null=Học sinh';