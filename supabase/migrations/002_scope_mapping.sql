-- =========================================================
-- 002_scope_mapping.sql
-- Bảng scope phẳng: tránh RLS phải subquery nhiều tầng mỗi lần check quyền.
-- Các bảng này được ĐỒNG BỘ TỰ ĐỘNG bằng trigger mỗi khi:
--   - Hiệu trưởng phân công GVCN
--   - GVBM tham gia lớp
--   - GVCN chỉ định tổ trưởng / lớp trưởng / lớp phó
--   - Học sinh được ghi danh vào lớp (để phụ huynh xem được theo con)
-- =========================================================

-- user_id có quyền gì trên class_id nào
create table user_class_scope (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  scope_role text not null,  -- 'homeroom_teacher' | 'subject_teacher' | 'class_monitor' | 'vice_monitor' | 'principal'
  created_at timestamptz not null default now(),
  unique (user_id, class_id, scope_role)
);

create index idx_user_class_scope_user on user_class_scope(user_id);
create index idx_user_class_scope_class on user_class_scope(class_id);

-- user_id có quyền gì trên group_id (tổ) nào
create table user_group_scope (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  group_id uuid not null references groups_(id) on delete cascade,
  scope_role text not null,  -- 'group_leader'
  created_at timestamptz not null default now(),
  unique (user_id, group_id, scope_role)
);

create index idx_user_group_scope_user on user_group_scope(user_id);
create index idx_user_group_scope_group on user_group_scope(group_id);

-- parent_id xem được student_id nào
create table parent_student_scope (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  relationship text,  -- "father","mother","guardian"
  created_at timestamptz not null default now(),
  unique (parent_id, student_id)
);

create index idx_parent_scope_parent on parent_student_scope(parent_id);

-- student user_id ứng với student_id nào (nếu học sinh có tài khoản đăng nhập riêng)
create table student_user_link (
  student_id uuid primary key references students(id) on delete cascade,
  user_id uuid not null unique references profiles(id) on delete cascade
);

-- =========================================================
-- TRIGGERS đồng bộ scope tự động
-- =========================================================

-- 1) Khi Hiệu trưởng phân công GVCN (classes.homeroom_teacher_id thay đổi)
create or replace function sync_homeroom_scope() returns trigger as $$
begin
  -- Xóa scope GVCN cũ cho lớp này (nếu có)
  delete from user_class_scope
    where class_id = new.id and scope_role = 'homeroom_teacher';

  if new.homeroom_teacher_id is not null then
    insert into user_class_scope (user_id, class_id, scope_role)
    values (new.homeroom_teacher_id, new.id, 'homeroom_teacher')
    on conflict do nothing;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_homeroom_scope
  after insert or update of homeroom_teacher_id on classes
  for each row execute function sync_homeroom_scope();

-- 2) Khi GVBM tham gia lớp (class_subject_teachers)
create or replace function sync_subject_teacher_scope() returns trigger as $$
begin
  if (tg_op = 'INSERT' and new.status = 'active') then
    insert into user_class_scope (user_id, class_id, scope_role)
    values (new.teacher_id, new.class_id, 'subject_teacher')
    on conflict do nothing;
  elsif (tg_op = 'UPDATE') then
    if new.status = 'inactive' and old.status = 'active' then
      -- Chỉ xóa nếu GVBM không còn dạy môn nào khác active trong lớp này
      if not exists (
        select 1 from class_subject_teachers
        where class_id = new.class_id and teacher_id = new.teacher_id
          and status = 'active' and id != new.id
      ) then
        delete from user_class_scope
          where user_id = new.teacher_id and class_id = new.class_id
            and scope_role = 'subject_teacher';
      end if;
    elsif new.status = 'active' then
      insert into user_class_scope (user_id, class_id, scope_role)
      values (new.teacher_id, new.class_id, 'subject_teacher')
      on conflict do nothing;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_subject_teacher_scope
  after insert or update on class_subject_teachers
  for each row execute function sync_subject_teacher_scope();

-- 3) Khi GVCN chỉ định cán bộ lớp (class_officers) -> đồng bộ quyền lớp trưởng/lớp phó
--    và quyền tổ trưởng (user_group_scope)
create or replace function sync_officer_scope() returns trigger as $$
declare
  officer_user_id uuid;
begin
  -- Lấy user_id gắn với student_id (nếu học sinh có tài khoản)
  select user_id into officer_user_id
    from student_user_link where student_id = new.student_id;

  if officer_user_id is null then
    return new; -- học sinh chưa có tài khoản đăng nhập, bỏ qua đồng bộ scope
  end if;

  if new.status = 'active' then
    if new.position = 'class_monitor' then
      insert into user_class_scope (user_id, class_id, scope_role)
      values (officer_user_id, new.class_id, 'class_monitor')
      on conflict do nothing;
    elsif new.position like 'vice_monitor%' then
      insert into user_class_scope (user_id, class_id, scope_role)
      values (officer_user_id, new.class_id, 'vice_monitor')
      on conflict do nothing;
    elsif new.position = 'group_leader' and new.group_id is not null then
      insert into user_group_scope (user_id, group_id, scope_role)
      values (officer_user_id, new.group_id, 'group_leader')
      on conflict do nothing;
    end if;
  elsif new.status = 'removed' then
    delete from user_class_scope
      where user_id = officer_user_id and class_id = new.class_id
        and scope_role = case
          when new.position = 'class_monitor' then 'class_monitor'
          when new.position like 'vice_monitor%' then 'vice_monitor'
          else scope_role
        end;
    if new.position = 'group_leader' and new.group_id is not null then
      delete from user_group_scope
        where user_id = officer_user_id and group_id = new.group_id
          and scope_role = 'group_leader';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_sync_officer_scope
  after insert or update on class_officers
  for each row execute function sync_officer_scope();

-- 4) Khi phụ huynh được liên kết với học sinh -> đồng bộ parent_student_scope
--    (bảng parent_student_scope được ghi trực tiếp qua API khi tạo liên kết,
--     không cần trigger riêng vì đây đã là bảng scope)

comment on table user_class_scope is 'Bảng scope phẳng - RLS đọc bảng này thay vì subquery nhiều tầng để đảm bảo tốc độ';
comment on table user_group_scope is 'Bảng scope phẳng cho tổ trưởng';
comment on table parent_student_scope is 'Phụ huynh chỉ xem được student_id có trong bảng này';
