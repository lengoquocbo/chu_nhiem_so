-- =========================================================
-- 017_electronic_lesson_book.sql
-- Sổ đầu bài: thời khóa biểu, tiết học, đánh giá cá nhân và duyệt phát sinh.
-- =========================================================

create table timetable_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  weekday int not null check (weekday between 1 and 7),
  period int not null check (period between 1 and 15),
  subject_id uuid not null references subjects(id),
  teacher_id uuid not null references profiles(id),
  effective_from date not null default current_date,
  effective_to date,
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (class_id, weekday, period, effective_from)
);

create index idx_timetable_class_day on timetable_entries(class_id, weekday, period);

create table lesson_book_entries (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  week_id uuid not null references competition_weeks(id) on delete cascade,
  timetable_entry_id uuid references timetable_entries(id),
  lesson_date date not null,
  period int not null check (period between 1 and 15),
  subject_id uuid not null references subjects(id),
  teacher_id uuid not null references profiles(id),
  source text not null default 'scheduled' check (source in ('scheduled','extra')),
  extra_reason text,
  approval_status text not null default 'approved' check (approval_status in ('pending','approved','rejected')),
  approval_note text,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  lecture_content text,
  collective_rating text check (collective_rating in ('Tốt','Khá','Đạt','Chưa đạt')),
  collective_comment text,
  notes text,
  attendance_status text not null default 'not_started' check (attendance_status in ('not_started','completed')),
  attendance_completed_at timestamptz,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index uq_scheduled_lesson_slot
  on lesson_book_entries(class_id, lesson_date, period)
  where source = 'scheduled';
create index idx_lesson_book_class_week on lesson_book_entries(class_id, week_id, lesson_date, period);
create index idx_lesson_book_teacher on lesson_book_entries(teacher_id, lesson_date);

alter table attendance_sessions add column if not exists lesson_id uuid references lesson_book_entries(id) on delete cascade;
create unique index if not exists uq_attendance_session_lesson on attendance_sessions(lesson_id) where lesson_id is not null;
alter table attendance_records add column if not exists updated_at timestamptz not null default now();
alter table attendance_records drop constraint if exists attendance_records_attendance_status_check;
alter table attendance_records add constraint attendance_records_attendance_status_check check (
  attendance_status in ('present','excused_absent','unexcused_absent','late','left_early','skipped')
);

alter table student_events add column if not exists lesson_id uuid references lesson_book_entries(id) on delete set null;
create index if not exists idx_student_events_lesson on student_events(lesson_id);

create table lesson_individual_criteria (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lesson_book_entries(id) on delete cascade,
  student_id uuid not null references students(id),
  criteria_id uuid not null references criteria(id),
  transaction_id uuid references score_transactions(id),
  status text not null default 'active' check (status in ('active','removed')),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  removed_by uuid references profiles(id),
  removed_at timestamptz
);

create unique index uq_lesson_student_criteria_active
  on lesson_individual_criteria(lesson_id, student_id, criteria_id)
  where status = 'active';
create index idx_lesson_criteria_lesson on lesson_individual_criteria(lesson_id);

alter table timetable_entries enable row level security;
alter table lesson_book_entries enable row level security;
alter table lesson_individual_criteria enable row level security;

create policy timetable_entries_select on timetable_entries for select
  using (is_principal() or has_any_class_scope(class_id));
create policy lesson_book_entries_select on lesson_book_entries for select
  using (is_principal() or has_any_class_scope(class_id));
create policy lesson_individual_criteria_select on lesson_individual_criteria for select
  using (
    is_principal()
    or exists (
      select 1 from lesson_book_entries l
      where l.id = lesson_id and has_any_class_scope(l.class_id)
    )
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

comment on table lesson_book_entries is
  'Mỗi dòng là một tiết trong sổ đầu bài của lớp; tiết thời khóa biểu được sinh tự động khi xem tuần.';
