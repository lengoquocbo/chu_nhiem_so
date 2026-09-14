-- =========================================================
-- Ràng buộc toàn vẹn chéo bảng cho các luồng lớp/học sinh/điểm danh/điểm.
-- API dùng secret key nên các kiểm tra này là lớp bảo vệ cuối cùng tại DB.
-- =========================================================

drop policy if exists class_subject_teachers_insert_self on class_subject_teachers;

create or replace function validate_enrollment_class_year() returns trigger as $$
begin
  if not exists (
    select 1 from classes c
    where c.id = new.class_id and c.school_year_id = new.school_year_id
  ) then
    raise exception 'Năm học của enrollment không khớp với lớp';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_enrollment_class_year on student_class_enrollments;
create trigger trg_validate_enrollment_class_year
  before insert or update on student_class_enrollments
  for each row execute function validate_enrollment_class_year();

create or replace function validate_group_member_class() returns trigger as $$
declare
  target_class_id uuid;
begin
  select class_id into target_class_id from groups_ where id = new.group_id and status = 'active';
  if target_class_id is null then
    raise exception 'Tổ không tồn tại hoặc không còn hoạt động';
  end if;
  if not exists (
    select 1 from student_class_enrollments
    where student_id = new.student_id and class_id = target_class_id and left_at is null
  ) then
    raise exception 'Học sinh không thuộc lớp của tổ';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_group_member_class on group_members;
create trigger trg_validate_group_member_class
  before insert or update of group_id, student_id, left_at on group_members
  for each row when (new.left_at is null)
  execute function validate_group_member_class();

create or replace function sync_removed_group_member() returns trigger as $$
begin
  if old.left_at is null and new.left_at is not null then
    new.is_leader := false;
    update class_officers
      set status = 'removed', removed_at = coalesce(removed_at, now())
      where group_id = new.group_id and student_id = new.student_id
        and position = 'group_leader' and status = 'active';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_removed_group_member on group_members;
create trigger trg_sync_removed_group_member
  before update of left_at on group_members
  for each row execute function sync_removed_group_member();

create or replace function validate_class_officer_assignment() returns trigger as $$
declare
  officer_group_class_id uuid;
begin
  if new.status = 'active' and not exists (
    select 1 from student_class_enrollments
    where student_id = new.student_id and class_id = new.class_id and left_at is null
  ) then
    raise exception 'Cán bộ lớp phải là học sinh đang học trong lớp';
  end if;

  if new.position = 'group_leader' then
    if new.group_id is null then
      raise exception 'Tổ trưởng bắt buộc phải có tổ';
    end if;
    select class_id into officer_group_class_id from groups_ where id = new.group_id;
    if officer_group_class_id is distinct from new.class_id then
      raise exception 'Tổ không thuộc lớp đang chỉ định';
    end if;
    if new.status = 'active' and not exists (
      select 1 from group_members
      where group_id = new.group_id and student_id = new.student_id and left_at is null
    ) then
      raise exception 'Tổ trưởng phải là thành viên đang hoạt động của tổ';
    end if;
  elsif new.group_id is not null then
    raise exception 'Chỉ chức vụ tổ trưởng mới được gắn group_id';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_class_officer_assignment on class_officers;
create trigger trg_validate_class_officer_assignment
  before insert or update on class_officers
  for each row execute function validate_class_officer_assignment();

create unique index if not exists uq_active_officer_position_per_student
  on class_officers (class_id, student_id, position)
  where status = 'active';
create unique index if not exists uq_active_class_monitor
  on class_officers (class_id)
  where status = 'active' and position = 'class_monitor';
create unique index if not exists uq_active_group_leader
  on class_officers (group_id)
  where status = 'active' and position = 'group_leader';

create or replace function rebuild_student_officer_scopes(p_student_id uuid, p_class_id uuid)
returns void as $$
declare
  linked_user_id uuid;
begin
  select user_id into linked_user_id from student_user_link where student_id = p_student_id;
  if linked_user_id is null then
    return;
  end if;

  delete from user_class_scope
    where user_id = linked_user_id and class_id = p_class_id
      and scope_role in ('class_monitor', 'vice_monitor');
  delete from user_group_scope ugs
    using groups_ g
    where ugs.group_id = g.id and g.class_id = p_class_id
      and ugs.user_id = linked_user_id and ugs.scope_role = 'group_leader';

  if exists (
    select 1 from class_officers
    where student_id = p_student_id and class_id = p_class_id
      and position = 'class_monitor' and status = 'active'
  ) then
    insert into user_class_scope (user_id, class_id, scope_role)
    values (linked_user_id, p_class_id, 'class_monitor') on conflict do nothing;
  end if;
  if exists (
    select 1 from class_officers
    where student_id = p_student_id and class_id = p_class_id
      and position like 'vice_monitor%' and status = 'active'
  ) then
    insert into user_class_scope (user_id, class_id, scope_role)
    values (linked_user_id, p_class_id, 'vice_monitor') on conflict do nothing;
  end if;
  insert into user_group_scope (user_id, group_id, scope_role)
  select linked_user_id, group_id, 'group_leader'
  from class_officers
  where student_id = p_student_id and class_id = p_class_id
    and position = 'group_leader' and status = 'active' and group_id is not null
  on conflict do nothing;
end;
$$ language plpgsql;

create or replace function sync_officer_scope() returns trigger as $$
begin
  if tg_op = 'UPDATE' then
    perform rebuild_student_officer_scopes(old.student_id, old.class_id);
  end if;
  perform rebuild_student_officer_scopes(new.student_id, new.class_id);
  return new;
end;
$$ language plpgsql;

create or replace function validate_week_class_year() returns trigger as $$
begin
  if not exists (
    select 1 from classes c
    where c.id = new.class_id and c.school_year_id = new.school_year_id
  ) then
    raise exception 'Năm học của tuần thi đua không khớp với lớp';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_week_class_year on competition_weeks;
create trigger trg_validate_week_class_year
  before insert or update of class_id, school_year_id on competition_weeks
  for each row execute function validate_week_class_year();

create or replace function validate_event_mapping_class() returns trigger as $$
begin
  if not exists (
    select 1 from criteria c where c.id = new.criteria_id and c.class_id = new.class_id
  ) then
    raise exception 'Tiêu chí ánh xạ không thuộc lớp';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_event_mapping_class on event_criteria_mappings;
create trigger trg_validate_event_mapping_class
  before insert or update on event_criteria_mappings
  for each row execute function validate_event_mapping_class();

create or replace function validate_student_event_links() returns trigger as $$
begin
  if not exists (
    select 1 from student_class_enrollments
    where student_id = new.student_id and class_id = new.class_id and left_at is null
  ) then
    raise exception 'Học sinh không thuộc lớp của sự việc';
  end if;
  if new.criteria_id is not null and not exists (
    select 1 from criteria where id = new.criteria_id and class_id = new.class_id
  ) then
    raise exception 'Tiêu chí không thuộc lớp của sự việc';
  end if;
  if new.week_id is not null and not exists (
    select 1 from competition_weeks
    where id = new.week_id and class_id = new.class_id
      and new.event_date between start_date and end_date
  ) then
    raise exception 'Tuần thi đua không khớp lớp hoặc ngày sự việc';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_student_event_links on student_events;
create trigger trg_validate_student_event_links
  before insert or update on student_events
  for each row execute function validate_student_event_links();

create or replace function validate_score_transaction_event() returns trigger as $$
begin
  if not exists (
    select 1 from student_events e
    where e.id = new.student_event_id
      and e.student_id = new.student_id
      and e.class_id = new.class_id
      and e.week_id is not distinct from new.week_id
  ) then
    raise exception 'Giao dịch điểm không khớp với sự việc nguồn';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_score_transaction_event on score_transactions;
create trigger trg_validate_score_transaction_event
  before insert or update of student_event_id, student_id, class_id, week_id on score_transactions
  for each row execute function validate_score_transaction_event();

create or replace function validate_attendance_student_class() returns trigger as $$
begin
  if not exists (
    select 1
    from attendance_sessions s
    join student_class_enrollments e
      on e.class_id = s.class_id and e.student_id = new.student_id and e.left_at is null
    where s.id = new.session_id
  ) then
    raise exception 'Học sinh không thuộc lớp của phiên điểm danh';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_validate_attendance_student_class on attendance_records;
create trigger trg_validate_attendance_student_class
  before insert or update of session_id, student_id on attendance_records
  for each row execute function validate_attendance_student_class();
