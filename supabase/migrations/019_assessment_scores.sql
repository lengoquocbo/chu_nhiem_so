-- =========================================================
-- 019_assessment_scores.sql
-- Điểm dò bài cũ và điểm kiểm tra 15 phút, kèm lịch sử chỉnh sửa.
-- =========================================================

create table assessment_scores (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  week_id uuid not null references competition_weeks(id),
  lesson_id uuid references lesson_book_entries(id) on delete set null,
  assessment_type text not null check (assessment_type in ('oral','fifteen_minute')),
  score numeric(4,2) not null check (score >= 0 and score <= 10),
  assessment_date date not null,
  period int check (period is null or period between 1 and 15),
  teacher_id uuid not null references profiles(id),
  comment text,
  created_by uuid not null references profiles(id),
  updated_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (assessment_type <> 'oral' or lesson_id is not null)
);

create index idx_assessment_scores_class_subject
  on assessment_scores(class_id, subject_id, assessment_date, student_id);
create index idx_assessment_scores_lesson on assessment_scores(lesson_id);
create index idx_assessment_scores_week on assessment_scores(week_id);

create table assessment_score_history (
  id uuid primary key default gen_random_uuid(),
  assessment_score_id uuid not null references assessment_scores(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  subject_id uuid not null references subjects(id),
  action text not null check (action in ('create','update')),
  old_score numeric(4,2),
  new_score numeric(4,2) not null,
  old_comment text,
  new_comment text,
  changed_by uuid not null references profiles(id),
  reason text,
  changed_at timestamptz not null default now()
);

create index idx_assessment_history_score
  on assessment_score_history(assessment_score_id, changed_at desc);

alter table assessment_scores enable row level security;
alter table assessment_score_history enable row level security;

create policy assessment_scores_select on assessment_scores for select
  using (
    is_principal()
    or has_any_class_scope(class_id)
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

create policy assessment_score_history_select on assessment_score_history for select
  using (
    is_principal()
    or has_any_class_scope(class_id)
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

comment on table assessment_scores is
  'Mỗi lần dò bài hoặc kiểm tra 15 phút là một bản ghi riêng; không ghi đè lần trước.';
comment on table assessment_score_history is
  'Lịch sử tạo và chỉnh sửa điểm kiểm tra, gồm người sửa và lý do.';
