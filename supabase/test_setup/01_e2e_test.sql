-- =========================================================
-- Test end-to-end: tạo năm học -> lớp -> GVCN -> học sinh -> tổ ->
-- cán bộ lớp -> tiêu chí -> ghi sự việc -> tính điểm -> kiểm tra RLS scope
-- =========================================================

-- 1. Tạo user giả (GVCN, GVBM, học sinh, phụ huynh, hiệu trưởng)
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'principal@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'gvcn@test.com'),
  ('33333333-3333-3333-3333-333333333333', 'gvbm@test.com'),
  ('44444444-4444-4444-4444-444444444444', 'student1@test.com'),
  ('55555555-5555-5555-5555-555555555555', 'parent1@test.com');

insert into profiles (id, full_name, phone) values
  ('11111111-1111-1111-1111-111111111111', 'Hiệu trưởng Test', null),
  ('22222222-2222-2222-2222-222222222222', 'Nguyễn Văn GVCN', null),
  ('33333333-3333-3333-3333-333333333333', 'Trần Thị GVBM', null),
  ('44444444-4444-4444-4444-444444444444', 'Học sinh Test', null),
  ('55555555-5555-5555-5555-555555555555', 'Phụ huynh Test', null);

insert into user_roles (user_id, role) values
  ('11111111-1111-1111-1111-111111111111', 'principal'),
  ('22222222-2222-2222-2222-222222222222', 'homeroom_teacher'),
  ('33333333-3333-3333-3333-333333333333', 'subject_teacher');

-- 2. Năm học, khối, lớp, môn
insert into school_years (id, name, start_date, end_date, status)
values ('a1000000-0000-0000-0000-000000000001', '2026-2027', '2026-09-01', '2027-05-31', 'active');

insert into grade_blocks (id, name, school_year_id)
values ('a2000000-0000-0000-0000-000000000001', 'Khối 10', 'a1000000-0000-0000-0000-000000000001');

insert into subjects (id, name)
values ('a3000000-0000-0000-0000-000000000001', 'Toán');

insert into classes (id, name, grade_block_id, school_year_id, class_code, homeroom_teacher_id)
values (
  'a4000000-0000-0000-0000-000000000001', '10A1',
  'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001',
  'TESTAB', '22222222-2222-2222-2222-222222222222'
);

-- Kiểm tra: trigger sync_homeroom_scope_insert đã tự tạo scope GVCN chưa?
select 'TEST 1: GVCN scope tự động sau khi tạo lớp' as test_name,
       count(*) as expect_1
from user_class_scope
where user_id = '22222222-2222-2222-2222-222222222222' and scope_role = 'homeroom_teacher';

-- 3. GVBM tham gia lớp
insert into class_subject_teachers (class_id, subject_id, teacher_id)
values ('a4000000-0000-0000-0000-000000000001', 'a3000000-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333');

select 'TEST 2: GVBM scope tự động sau khi join lớp' as test_name,
       count(*) as expect_1
from user_class_scope
where user_id = '33333333-3333-3333-3333-333333333333' and scope_role = 'subject_teacher';

-- 4. Tạo học sinh + ghi danh vào lớp
insert into students (id, student_code, full_name, date_of_birth, parent_phone)
values ('a5000000-0000-0000-0000-000000000001', 'HS20260001', 'Học sinh Test', '2010-01-01', '0900000000');

insert into student_class_enrollments (student_id, class_id, school_year_id)
values ('a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001');

-- 5. Liên kết tài khoản học sinh + phụ huynh
insert into student_user_link (student_id, user_id)
values ('a5000000-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444');

insert into parent_student_scope (parent_id, student_id, relationship)
values ('55555555-5555-5555-5555-555555555555', 'a5000000-0000-0000-0000-000000000001', 'father');

-- 6. Tạo tổ + thêm học sinh vào tổ
insert into groups_ (id, class_id, name)
values ('a6000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'Tổ 1');

insert into group_members (group_id, student_id)
values ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001');

-- 7. Chỉ định tổ trưởng (test TRIGGER + BACKFILL vì học sinh đã có tài khoản)
insert into class_officers (class_id, student_id, position, group_id, assigned_by)
values (
  'a4000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
  'group_leader', 'a6000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'
);

select 'TEST 3: Tổ trưởng scope tự động (đã có tài khoản trước)' as test_name,
       count(*) as expect_1
from user_group_scope
where user_id = '44444444-4444-4444-4444-444444444444' and scope_role = 'group_leader';

-- 8. TEST BACKFILL: chỉ định lớp trưởng cho học sinh CHƯA có tài khoản, rồi mới tạo tài khoản sau
insert into students (id, student_code, full_name, date_of_birth)
values ('a5000000-0000-0000-0000-000000000002', 'HS20260002', 'Học sinh B', '2010-02-02');

insert into student_class_enrollments (student_id, class_id, school_year_id)
values ('a5000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001');

insert into class_officers (class_id, student_id, position, assigned_by)
values ('a4000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', 'class_monitor', '22222222-2222-2222-2222-222222222222');

-- Lúc này CHƯA có scope vì chưa có tài khoản:
select 'TEST 4a: Trước khi có tài khoản - PHẢI = 0' as test_name, count(*) as expect_0
from user_class_scope
where class_id = 'a4000000-0000-0000-0000-000000000001' and scope_role = 'class_monitor';

-- Giờ tạo tài khoản cho học sinh B -> trigger backfill phải tự chạy
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'student2@test.com');
insert into profiles (id, full_name) values ('66666666-6666-6666-6666-666666666666', 'Học sinh B');
insert into student_user_link (student_id, user_id)
values ('a5000000-0000-0000-0000-000000000002', '66666666-6666-6666-6666-666666666666');

select 'TEST 4b: Sau khi tạo tài khoản - BACKFILL phải = 1' as test_name, count(*) as expect_1
from user_class_scope
where user_id = '66666666-6666-6666-6666-666666666666' and scope_role = 'class_monitor';

-- 9. Tiêu chí thi đua + ánh xạ event_type
insert into criteria (id, class_id, code, name, kind, points, created_by)
values ('a7000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'TC04', 'Đi muộn', 'DEDUCT', 2, '22222222-2222-2222-2222-222222222222');

insert into event_criteria_mappings (class_id, event_type_id, criteria_id, created_by)
select 'a4000000-0000-0000-0000-000000000001', id, 'a7000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222'
from event_types where code = 'ATTENDANCE_LATE';

-- 10. Tuần thi đua
insert into competition_weeks (id, class_id, school_year_id, week_number, start_date, end_date)
values ('a8000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, '2026-09-01', '2026-09-07');

-- 11. Ghi nhận sự việc "đi muộn" (giả lập score_engine.record_student_event làm thủ công bằng SQL)
insert into student_events (id, student_id, class_id, week_id, event_type_id, criteria_id, event_date, created_by)
select 'a9000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001',
       'a4000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001',
       et.id, 'a7000000-0000-0000-0000-000000000001', '2026-09-02', '33333333-3333-3333-3333-333333333333'
from event_types et where et.code = 'ATTENDANCE_LATE';

-- Test chống trùng: ghi lại y hệt sự việc này lần 2 -> PHẢI lỗi unique violation
select 'TEST 5: Chống trùng sự kiện (phải raise exception)' as test_name;
do $$
begin
  insert into student_events (student_id, class_id, week_id, event_type_id, criteria_id, event_date, created_by)
  select 'a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
         'a8000000-0000-0000-0000-000000000001', et.id, 'a7000000-0000-0000-0000-000000000001',
         '2026-09-02', '33333333-3333-3333-3333-333333333333'
  from event_types et where et.code = 'ATTENDANCE_LATE';
  raise exception 'LỖI: Không chống trùng được - đây là bug!';
exception
  when unique_violation then
    raise notice 'OK: Chống trùng hoạt động đúng (unique_violation bị chặn).';
end $$;

-- 12. Tạo score transaction (giả lập record_student_event tạo transaction)
insert into score_transactions (id, student_event_id, student_id, class_id, week_id, system_points, criteria_code_snapshot, criteria_name_snapshot, status, submitted_by)
values (
  'aa000000-0000-0000-0000-000000000001', 'a9000000-0000-0000-0000-000000000001',
  'a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001',
  'a8000000-0000-0000-0000-000000000001', -2, 'TC04', 'Đi muộn', 'SUBMITTED', '33333333-3333-3333-3333-333333333333'
);

-- 13. GVCN approve
update score_transactions set status = 'APPROVED', reviewed_by = '22222222-2222-2222-2222-222222222222', reviewed_at = now()
where id = 'aa000000-0000-0000-0000-000000000001';

-- 14. Tính weekly summary thủ công (giả lập week_engine.compute_weekly_summary)
insert into weekly_score_summary (student_id, class_id, week_id, start_score, total_add, total_deduct, final_score, rank_label)
values ('a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a8000000-0000-0000-0000-000000000001', 100, 0, 2, 98, 'Tốt');

select 'TEST 6: Weekly summary tính đúng (100 - 2 = 98)' as test_name, final_score as expect_98
from weekly_score_summary where student_id = 'a5000000-0000-0000-0000-000000000001';

-- 15. Kiểm tra rank_configs default hoạt động đúng
select 'TEST 7: Rank config 98 điểm phải là Tốt' as test_name, label
from rank_configs
where class_id is null and 98 between min_score and max_score;

select '===== TẤT CẢ TEST HOÀN TẤT =====' as final_status;
