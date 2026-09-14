-- =========================================================
-- 001_core_schema.sql
-- Cấu trúc cốt lõi: năm học, khối, lớp, học sinh, giáo viên, tổ
-- =========================================================

-- Bật extension cần thiết
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- ROLES (danh mục vai trò hệ thống)
-- ---------------------------------------------------------
create type app_role as enum (
  'principal',        -- Hiệu trưởng/BGH
  'homeroom_teacher',  -- GVCN
  'subject_teacher',   -- GVBM
  'class_monitor',     -- Lớp trưởng
  'vice_monitor',      -- Lớp phó
  'group_leader',      -- Tổ trưởng
  'student',
  'parent'
);

-- ---------------------------------------------------------
-- PROFILES (mở rộng từ auth.users của Supabase)
-- ---------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Vai trò hệ thống của user (1 user có thể có nhiều role, ví dụ GVCN kiêm GVBM)
create table user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

-- ---------------------------------------------------------
-- NĂM HỌC
-- ---------------------------------------------------------
create table school_years (
  id uuid primary key default gen_random_uuid(),
  name text not null,               -- "2026-2027"
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft','active','closed')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (name)
);

-- Đảm bảo chỉ 1 năm học active tại một thời điểm
create unique index one_active_school_year
  on school_years ((status = 'active'))
  where status = 'active';

-- ---------------------------------------------------------
-- KHỐI
-- ---------------------------------------------------------
create table grade_blocks (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references school_years(id) on delete cascade,
  name text not null,   -- "Khối 10"
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (school_year_id, name)
);

-- ---------------------------------------------------------
-- LỚP
-- ---------------------------------------------------------
create table classes (
  id uuid primary key default gen_random_uuid(),
  grade_block_id uuid not null references grade_blocks(id) on delete cascade,
  school_year_id uuid not null references school_years(id) on delete cascade,
  name text not null,          -- "10A1"
  class_code text not null unique,  -- mã lớp tự sinh, dùng cho GVBM join: "A1X8K2"
  homeroom_teacher_id uuid references profiles(id),  -- GVCN được phân công
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (grade_block_id, name)
);

create index idx_classes_school_year on classes(school_year_id);
create index idx_classes_homeroom on classes(homeroom_teacher_id);

-- Hàm sinh mã lớp ngẫu nhiên (6 ký tự chữ+số, viết hoa)
create or replace function generate_class_code() returns text as $$
declare
  chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
  end loop;
  return result;
end;
$$ language plpgsql;

-- Trigger tự sinh mã lớp khi tạo lớp mới (nếu không truyền sẵn)
create or replace function set_class_code() returns trigger as $$
declare
  new_code text;
  tries int := 0;
begin
  if new.class_code is null or new.class_code = '' then
    loop
      new_code := generate_class_code();
      exit when not exists (select 1 from classes where class_code = new_code);
      tries := tries + 1;
      if tries > 20 then
        raise exception 'Không thể sinh mã lớp duy nhất sau 20 lần thử';
      end if;
    end loop;
    new.class_code := new_code;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_class_code
  before insert on classes
  for each row execute function set_class_code();

-- ---------------------------------------------------------
-- GVBM THAM GIA LỚP (join bằng mã lớp)
-- ---------------------------------------------------------
create table class_subject_teachers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  teacher_id uuid not null references profiles(id) on delete cascade,
  subject_id uuid,  -- FK tới bảng subjects, thêm ở migration sau
  status text not null default 'active' check (status in ('active','inactive')),
  joined_at timestamptz not null default now(),
  unique (class_id, teacher_id, subject_id)
);

-- ---------------------------------------------------------
-- HỌC SINH
-- ---------------------------------------------------------
-- Mã học sinh ổn định, KHÔNG phụ thuộc lớp và KHÔNG đổi qua các năm học
create sequence student_code_seq start 1;

create table students (
  id uuid primary key default gen_random_uuid(),
  student_code text not null unique,  -- "HS20260001" - sinh 1 lần duy nhất, giữ nguyên vĩnh viễn
  full_name text not null,
  gender text check (gender in ('male','female','other')),
  date_of_birth date,
  parent_phone text,
  address text,
  status text not null default 'active' check (status in ('active','inactive','transferred','graduated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Hàm sinh mã học sinh: HS + năm hiện tại + số thứ tự, nhưng mã này KHÔNG đổi
-- dù học sinh học qua nhiều năm học sau đó (chỉ sinh 1 lần lúc tạo record).
create or replace function generate_student_code() returns text as $$
declare
  yr text := to_char(now(), 'YYYY');
  seq_val int;
begin
  seq_val := nextval('student_code_seq');
  return 'HS' || yr || lpad(seq_val::text, 4, '0');
end;
$$ language plpgsql;

create or replace function set_student_code() returns trigger as $$
begin
  if new.student_code is null or new.student_code = '' then
    new.student_code := generate_student_code();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger trg_set_student_code
  before insert on students
  for each row execute function set_student_code();

-- Ghi danh học sinh vào lớp theo TỪNG NĂM HỌC (1 học sinh có thể đổi lớp qua các năm,
-- hoặc chuyển lớp giữa năm -> lưu lịch sử, không ghi đè)
create table student_class_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  school_year_id uuid not null references school_years(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  left_at timestamptz,  -- null = đang học tại lớp này; có giá trị = đã rời lớp (chuyển lớp)
  status text not null default 'active' check (status in ('active','transferred_out','graduated')),
  created_by uuid references profiles(id)
);

create index idx_enrollment_student on student_class_enrollments(student_id);
create index idx_enrollment_class_active on student_class_enrollments(class_id) where left_at is null;

-- Đảm bảo 1 học sinh chỉ có 1 enrollment ACTIVE tại 1 thời điểm
create unique index one_active_enrollment_per_student
  on student_class_enrollments (student_id)
  where left_at is null;

-- ---------------------------------------------------------
-- TỔ
-- ---------------------------------------------------------
create table groups_ ( -- tên "groups" trùng từ khóa SQL nên đặt groups_
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  name text not null,       -- "Tổ 1"
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  unique (class_id, name)
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups_(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  is_leader boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (group_id, student_id, left_at)
);

create index idx_group_members_active on group_members(group_id) where left_at is null;

-- Đảm bảo 1 học sinh chỉ thuộc 1 tổ active trong cùng 1 lớp
create unique index one_active_group_per_student
  on group_members (student_id)
  where left_at is null;

-- ---------------------------------------------------------
-- BAN CÁN SỰ LỚP (lớp trưởng, lớp phó, tổ trưởng)
-- Quyền được GVCN cấu hình linh hoạt qua permission_key (không hard-code)
-- ---------------------------------------------------------
create table class_officers (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  position text not null,   -- "class_monitor" | "vice_monitor_academic" | "vice_monitor_labor" | "group_leader" ...
  group_id uuid references groups_(id),  -- chỉ set nếu position = tổ trưởng
  assigned_by uuid references profiles(id),
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  status text not null default 'active' check (status in ('active','removed'))
);

create index idx_class_officers_class on class_officers(class_id) where status = 'active';

-- Quyền chi tiết cấp cho từng cán bộ lớp (linh hoạt, không hard-code)
create table officer_permissions (
  id uuid primary key default gen_random_uuid(),
  class_officer_id uuid not null references class_officers(id) on delete cascade,
  permission_key text not null,  -- ví dụ: "record_violation", "record_achievement", "record_task", "view_full_class"
  granted_by uuid references profiles(id),
  granted_at timestamptz not null default now(),
  unique (class_officer_id, permission_key)
);

-- ---------------------------------------------------------
-- MÔN HỌC
-- ---------------------------------------------------------
create table subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

alter table class_subject_teachers
  add constraint fk_subject foreign key (subject_id) references subjects(id);

comment on table profiles is 'Hồ sơ user, mở rộng từ auth.users của Supabase Auth';
comment on table students is 'student_code sinh 1 lần duy nhất, ổn định vĩnh viễn không phụ thuộc lớp/năm học';
comment on table student_class_enrollments is 'Lịch sử ghi danh theo năm học; left_at null = đang active; hỗ trợ chuyển lớp giữa năm';
