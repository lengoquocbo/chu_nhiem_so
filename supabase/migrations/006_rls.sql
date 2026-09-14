-- =========================================================
-- 006_rls.sql
-- Row Level Security dựa trên bảng scope phẳng (nhanh, không subquery lồng).
--
-- NGUYÊN TẮC PHÂN TẦNG (khớp phương án đã chốt):
--  - Bảng "tham chiếu/CRUD đơn giản" (classes, criteria, groups, class_officers...):
--    cho phép SELECT/INSERT/UPDATE trực tiếp qua RLS theo scope.
--  - Bảng "nghiệp vụ lõi" (student_events, score_transactions, competition_weeks
--    status, weekly/period summary, audit_logs, notifications, attendance):
--    CHỈ cho phép SELECT qua RLS. Mọi INSERT/UPDATE đi qua Python backend
--    (dùng service_role key, bypass RLS, TỰ kiểm tra quyền + business rule
--    trong code) để đảm bảo tính điểm, chống trùng, audit đúng transaction.
-- =========================================================

-- ---------------------------------------------------------
-- HELPER FUNCTIONS
-- ---------------------------------------------------------
create or replace function auth_uid() returns uuid as $$
  select auth.uid();
$$ language sql stable;

create or replace function has_app_role(p_role app_role) returns boolean as $$
  select exists (
    select 1 from user_roles where user_id = auth_uid() and role = p_role
  );
$$ language sql stable security definer;

create or replace function is_principal() returns boolean as $$
  select has_app_role('principal');
$$ language sql stable security definer;

create or replace function has_class_scope(p_class_id uuid, p_roles text[]) returns boolean as $$
  select exists (
    select 1 from user_class_scope
    where user_id = auth_uid() and class_id = p_class_id
      and scope_role = any(p_roles)
  );
$$ language sql stable security definer;

create or replace function has_any_class_scope(p_class_id uuid) returns boolean as $$
  select exists (
    select 1 from user_class_scope
    where user_id = auth_uid() and class_id = p_class_id
  );
$$ language sql stable security definer;

create or replace function has_group_scope(p_group_id uuid) returns boolean as $$
  select exists (
    select 1 from user_group_scope
    where user_id = auth_uid() and group_id = p_group_id
  );
$$ language sql stable security definer;

create or replace function is_parent_of(p_student_id uuid) returns boolean as $$
  select exists (
    select 1 from parent_student_scope
    where parent_id = auth_uid() and student_id = p_student_id
  );
$$ language sql stable security definer;

create or replace function is_self_student(p_student_id uuid) returns boolean as $$
  select exists (
    select 1 from student_user_link
    where student_id = p_student_id and user_id = auth_uid()
  );
$$ language sql stable security definer;

-- Lớp hiện tại của 1 học sinh (enrollment active)
create or replace function student_active_class(p_student_id uuid) returns uuid as $$
  select class_id from student_class_enrollments
  where student_id = p_student_id and left_at is null
  limit 1;
$$ language sql stable security definer;

-- ---------------------------------------------------------
-- BẬT RLS CHO TOÀN BỘ BẢNG
-- ---------------------------------------------------------
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table school_years enable row level security;
alter table grade_blocks enable row level security;
alter table classes enable row level security;
alter table class_subject_teachers enable row level security;
alter table students enable row level security;
alter table student_class_enrollments enable row level security;
alter table groups_ enable row level security;
alter table group_members enable row level security;
alter table class_officers enable row level security;
alter table officer_permissions enable row level security;
alter table subjects enable row level security;
alter table user_class_scope enable row level security;
alter table user_group_scope enable row level security;
alter table parent_student_scope enable row level security;
alter table student_user_link enable row level security;
alter table criteria enable row level security;
alter table competition_weeks enable row level security;
alter table week_unlock_requests enable row level security;
alter table event_types enable row level security;
alter table student_events enable row level security;
alter table score_transactions enable row level security;
alter table weekly_score_summary enable row level security;
alter table period_score_summary enable row level security;
alter table rank_configs enable row level security;
alter table attendance_sessions enable row level security;
alter table attendance_records enable row level security;
alter table audit_logs enable row level security;
alter table notification_configs enable row level security;
alter table notifications enable row level security;

-- ---------------------------------------------------------
-- PROFILES
-- ---------------------------------------------------------
create policy profiles_select on profiles for select
  using (id = auth_uid() or is_principal());
create policy profiles_update_self on profiles for update
  using (id = auth_uid());

create policy user_roles_select on user_roles for select
  using (user_id = auth_uid() or is_principal());
create policy user_roles_write_principal on user_roles for all
  using (is_principal()) with check (is_principal());

-- ---------------------------------------------------------
-- NĂM HỌC / KHỐI / MÔN HỌC - đọc cho mọi user đăng nhập, ghi chỉ principal
-- ---------------------------------------------------------
create policy school_years_select on school_years for select using (auth.role() = 'authenticated');
create policy school_years_write on school_years for all using (is_principal()) with check (is_principal());

create policy grade_blocks_select on grade_blocks for select using (auth.role() = 'authenticated');
create policy grade_blocks_write on grade_blocks for all using (is_principal()) with check (is_principal());

create policy subjects_select on subjects for select using (auth.role() = 'authenticated');
create policy subjects_write on subjects for all using (is_principal()) with check (is_principal());

-- ---------------------------------------------------------
-- LỚP - xem nếu principal hoặc có scope bất kỳ trên lớp; sửa chỉ principal
-- (riêng GVCN được UPDATE các trường không nhạy cảm qua policy riêng nếu cần sau này)
-- ---------------------------------------------------------
create policy classes_select on classes for select
  using (is_principal() or has_any_class_scope(id));
create policy classes_write_principal on classes for all
  using (is_principal()) with check (is_principal());

create policy class_subject_teachers_select on class_subject_teachers for select
  using (is_principal() or has_any_class_scope(class_id));
-- GVBM tự join lớp bằng mã lớp (insert chính mình)
create policy class_subject_teachers_insert_self on class_subject_teachers for insert
  with check (teacher_id = auth_uid() and has_app_role('subject_teacher'));

-- ---------------------------------------------------------
-- HỌC SINH - principal toàn quyền; GVCN/GVBM xem theo lớp; học sinh xem chính mình;
-- phụ huynh xem con mình
-- ---------------------------------------------------------
create policy students_select on students for select
  using (
    is_principal()
    or has_any_class_scope(student_active_class(id))
    or is_self_student(id)
    or is_parent_of(id)
  );
create policy students_write on students for all
  using (is_principal() or has_class_scope(student_active_class(id), array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(student_active_class(id), array['homeroom_teacher']));

create policy enrollments_select on student_class_enrollments for select
  using (
    is_principal() or has_any_class_scope(class_id)
    or is_self_student(student_id) or is_parent_of(student_id)
  );
create policy enrollments_write on student_class_enrollments for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

-- ---------------------------------------------------------
-- TỔ / THÀNH VIÊN TỔ - GVCN toàn quyền trong lớp mình; tổ trưởng xem tổ mình
-- ---------------------------------------------------------
create policy groups_select on groups_ for select
  using (is_principal() or has_any_class_scope(class_id));
create policy groups_write on groups_ for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

create policy group_members_select on group_members for select
  using (
    is_principal()
    or has_group_scope(group_id)
    or exists (select 1 from groups_ g where g.id = group_id and has_any_class_scope(g.class_id))
    or is_self_student(student_id) or is_parent_of(student_id)
  );
create policy group_members_write on group_members for all
  using (
    is_principal()
    or exists (select 1 from groups_ g where g.id = group_id and has_class_scope(g.class_id, array['homeroom_teacher']))
  )
  with check (
    is_principal()
    or exists (select 1 from groups_ g where g.id = group_id and has_class_scope(g.class_id, array['homeroom_teacher']))
  );

-- ---------------------------------------------------------
-- BAN CÁN SỰ LỚP - chỉ GVCN/principal cấu hình
-- ---------------------------------------------------------
create policy class_officers_select on class_officers for select
  using (is_principal() or has_any_class_scope(class_id));
create policy class_officers_write on class_officers for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

create policy officer_permissions_select on officer_permissions for select
  using (
    is_principal()
    or exists (select 1 from class_officers co where co.id = class_officer_id and has_any_class_scope(co.class_id))
  );
create policy officer_permissions_write on officer_permissions for all
  using (
    is_principal()
    or exists (select 1 from class_officers co where co.id = class_officer_id and has_class_scope(co.class_id, array['homeroom_teacher']))
  )
  with check (
    is_principal()
    or exists (select 1 from class_officers co where co.id = class_officer_id and has_class_scope(co.class_id, array['homeroom_teacher']))
  );

-- ---------------------------------------------------------
-- SCOPE TABLES - chỉ đọc (ghi do trigger/service role thực hiện)
-- ---------------------------------------------------------
create policy user_class_scope_select on user_class_scope for select
  using (user_id = auth_uid() or is_principal());
create policy user_group_scope_select on user_group_scope for select
  using (user_id = auth_uid() or is_principal());
create policy parent_student_scope_select on parent_student_scope for select
  using (parent_id = auth_uid() or is_principal());
create policy student_user_link_select on student_user_link for select
  using (user_id = auth_uid() or is_principal() or is_parent_of(student_id));

-- ---------------------------------------------------------
-- TIÊU CHÍ THI ĐUA - chỉ GVCN của lớp cấu hình; ai có scope trong lớp đều xem được
-- ---------------------------------------------------------
create policy criteria_select on criteria for select
  using (is_principal() or has_any_class_scope(class_id));
create policy criteria_write on criteria for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

-- ---------------------------------------------------------
-- TUẦN THI ĐUA - xem theo scope; GHI (tạo tuần) do GVCN qua RLS,
-- nhưng LOCK/UNLOCK bắt buộc qua Python API (không có policy UPDATE ở đây)
-- ---------------------------------------------------------
create policy competition_weeks_select on competition_weeks for select
  using (is_principal() or has_any_class_scope(class_id));
create policy competition_weeks_insert on competition_weeks for insert
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));
-- Không có policy update/delete -> chỉ service_role (Python backend) mới sửa được

create policy week_unlock_requests_select on week_unlock_requests for select
  using (
    is_principal()
    or exists (select 1 from competition_weeks w where w.id = week_id and has_any_class_scope(w.class_id))
  );
create policy week_unlock_requests_insert on week_unlock_requests for insert
  with check (
    exists (select 1 from competition_weeks w where w.id = week_id and has_class_scope(w.class_id, array['homeroom_teacher']))
  );
-- Duyệt yêu cầu mở khóa: chỉ principal, qua Python API cho chắc audit

-- ---------------------------------------------------------
-- EVENT TYPES - danh mục dùng chung, đọc cho tất cả, ghi chỉ principal
-- ---------------------------------------------------------
create policy event_types_select on event_types for select using (auth.role() = 'authenticated');
create policy event_types_write on event_types for all using (is_principal()) with check (is_principal());

-- ---------------------------------------------------------
-- STUDENT EVENTS & SCORE TRANSACTIONS - CHỈ SELECT qua RLS.
-- Mọi INSERT/UPDATE (ghi nhận sự việc, duyệt, điều chỉnh, khóa) đi qua Python
-- backend dùng service_role key để đảm bảo: đối chiếu tiêu chí đúng, chống
-- trùng, tạo audit log, và không cho sửa tổng điểm trực tiếp.
-- ---------------------------------------------------------
create policy student_events_select on student_events for select
  using (
    is_principal()
    or has_any_class_scope(class_id)
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

create policy score_transactions_select on score_transactions for select
  using (
    is_principal()
    or has_any_class_scope(class_id)
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

create policy weekly_summary_select on weekly_score_summary for select
  using (
    is_principal()
    or has_any_class_scope(class_id)
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

create policy period_summary_select on period_score_summary for select
  using (
    is_principal()
    or has_any_class_scope(class_id)
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

create policy rank_configs_select on rank_configs for select using (auth.role() = 'authenticated');
create policy rank_configs_write on rank_configs for all
  using (is_principal() or (class_id is not null and has_class_scope(class_id, array['homeroom_teacher'])))
  with check (is_principal() or (class_id is not null and has_class_scope(class_id, array['homeroom_teacher'])));

-- ---------------------------------------------------------
-- ĐIỂM DANH - SELECT theo scope; INSERT/UPDATE qua Python API
-- (để tự sinh student_events + score_transactions đồng bộ, đúng nghiệp vụ)
-- ---------------------------------------------------------
create policy attendance_sessions_select on attendance_sessions for select
  using (is_principal() or has_any_class_scope(class_id));

create policy attendance_records_select on attendance_records for select
  using (
    is_principal()
    or exists (select 1 from attendance_sessions s where s.id = session_id and has_any_class_scope(s.class_id))
    or is_self_student(student_id) or is_parent_of(student_id)
  );

-- ---------------------------------------------------------
-- AUDIT LOG - chỉ đọc; không ai (kể cả principal) được DELETE qua RLS
-- ---------------------------------------------------------
create policy audit_logs_select on audit_logs for select using (is_principal());
-- Không có policy insert/update/delete cho client -> chỉ service_role ghi được

-- ---------------------------------------------------------
-- THÔNG BÁO
-- ---------------------------------------------------------
create policy notification_configs_select on notification_configs for select
  using (is_principal() or has_any_class_scope(class_id));
create policy notification_configs_write on notification_configs for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

create policy notifications_select on notifications for select
  using (
    is_principal()
    or recipient_parent_id = auth_uid()
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );
-- Ghi thông báo + gửi qua Zalo/Telegram luôn qua Python backend (service_role)
