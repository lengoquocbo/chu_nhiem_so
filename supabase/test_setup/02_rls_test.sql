-- Tạo 1 role Postgres không phải superuser để RLS thực sự được áp dụng
-- (superuser/owner bảng luôn bypass RLS mặc định trong Postgres).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated_test') then
    create role authenticated_test nologin;
  end if;
end $$;

grant usage on schema public to authenticated_test;
grant select, insert, update, delete on all tables in schema public to authenticated_test;
grant usage on all sequences in schema public to authenticated_test;

-- Thêm 1 lớp thứ 2 + học sinh thứ 3 để test cách ly dữ liệu chéo lớp
insert into classes (id, name, grade_block_id, school_year_id, class_code, homeroom_teacher_id)
values ('a4000000-0000-0000-0000-000000000002', '10A2', 'a2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'TESTCD', null);

insert into students (id, student_code, full_name, date_of_birth)
values ('a5000000-0000-0000-0000-000000000003', 'HS20260003', 'Học sinh Lớp Khác', '2010-03-03');

insert into student_class_enrollments (student_id, class_id, school_year_id)
values ('a5000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001');

\echo '--- TEST RLS 1: GVCN lớp 10A1 xem được bao nhiêu lớp? (phải = 1, chỉ lớp mình) ---'
set role authenticated_test;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as classes_visible from classes;
reset role;

\echo '--- TEST RLS 2: GVCN lớp 10A1 xem được bao nhiêu học sinh? (phải = 2, không thấy học sinh lớp 10A2) ---'
set role authenticated_test;
set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
select count(*) as students_visible from students;
select full_name from students order by full_name;
reset role;

\echo '--- TEST RLS 3: Học sinh Test (44444...) chỉ xem được chính mình (phải = 1) ---'
set role authenticated_test;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select count(*) as students_visible from students;
reset role;

\echo '--- TEST RLS 4: Phụ huynh Test (55555...) chỉ xem được con mình (phải = 1) ---'
set role authenticated_test;
set request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';
select count(*) as students_visible from students;
reset role;

\echo '--- TEST RLS 5: Học sinh Test xem được score_transactions của mình (phải = 1) ---'
set role authenticated_test;
set request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';
select count(*) as my_transactions from score_transactions;
reset role;

\echo '--- TEST RLS 6: GVBM (33333...) KHÔNG được sửa criteria (phải lỗi permission denied / 0 rows) ---'
set role authenticated_test;
set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
do $$
begin
  update criteria set points = 999 where code = 'TC04';
  if not found then
    raise notice 'OK: GVBM không sửa được criteria (0 rows matched do RLS chặn).';
  else
    raise exception 'LỖI BẢO MẬT: GVBM sửa được criteria!';
  end if;
end $$;
reset role;

\echo '--- TEST RLS 7: Người lạ (không có scope gì) xem lớp 10A1 (phải = 0) ---'
set role authenticated_test;
set request.jwt.claim.sub = '99999999-9999-9999-9999-999999999999';
select count(*) as classes_visible_stranger from classes;
select count(*) as students_visible_stranger from students;
reset role;

\echo '===== HOÀN TẤT TEST RLS ====='
