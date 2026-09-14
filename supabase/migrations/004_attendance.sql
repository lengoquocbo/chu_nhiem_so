-- =========================================================
-- 004_attendance.sql
-- Điểm danh theo tiết học. GVBM chỉ ghi trạng thái, hệ thống
-- tự tạo student_events tương ứng (KHÔNG để GVBM nhập điểm).
-- =========================================================

create table attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  teacher_id uuid not null references profiles(id),
  session_date date not null,
  period int not null,
  status text not null default 'draft' check (status in ('draft','confirmed')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (class_id, subject_id, session_date, period)
);

create index idx_attendance_sessions_class_date on attendance_sessions(class_id, session_date);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references attendance_sessions(id) on delete cascade,
  student_id uuid not null references students(id),
  attendance_status text not null check (attendance_status in (
    'present','excused_absent','unexcused_absent','late','left_early'
  )),
  note text,
  -- liên kết tới student_event được tự tạo (nếu trạng thái này cần trừ/cộng điểm)
  student_event_id uuid references student_events(id),
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index idx_attendance_records_student on attendance_records(student_id);

-- Map trạng thái điểm danh -> event_type code (dùng khi tự sinh sự kiện)
-- 'present' và 'excused_absent' KHÔNG tạo sự kiện trừ điểm.
comment on table attendance_records is
  'Khi attendance_status là late/unexcused_absent/left_early, backend (Python) sẽ '
  'tự tạo bản ghi student_events tương ứng và đối chiếu criteria - không tính điểm ở đây.';
