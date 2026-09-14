-- =========================================================
-- 026_parent_weekly_email_reports.sql
-- Cấu hình và lịch sử báo cáo tuần gửi phụ huynh qua email.
-- =========================================================

create table parent_report_configs (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  academic_term_id uuid not null references academic_terms(id) on delete cascade,
  send_mode text not null default 'manual' check (send_mode in ('manual', 'auto_on_lock')),
  configured_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, academic_term_id)
);

create table parent_weekly_reports (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  academic_term_id uuid not null references academic_terms(id) on delete cascade,
  week_id uuid not null references competition_weeks(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  recipient_email text,
  start_score numeric not null default 100,
  total_add numeric not null default 0,
  total_deduct numeric not null default 0,
  final_score numeric not null default 100,
  rank_label text,
  achievements jsonb not null default '[]'::jsonb,
  violations jsonb not null default '[]'::jsonb,
  homeroom_comment text,
  subject_snapshot text,
  message_snapshot text,
  status text not null default 'draft' check (
    status in ('draft', 'sending', 'queued', 'sent', 'failed', 'missing_email')
  ),
  provider_message_id text,
  error_reason text,
  attempt_count integer not null default 0,
  generated_by uuid references profiles(id),
  last_attempted_by uuid references profiles(id),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (week_id, student_id)
);

create index idx_parent_reports_class_week on parent_weekly_reports(class_id, week_id);
create index idx_parent_reports_status on parent_weekly_reports(status);

alter table parent_report_configs enable row level security;
alter table parent_weekly_reports enable row level security;

create policy parent_report_configs_select on parent_report_configs for select
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));
create policy parent_report_configs_write on parent_report_configs for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

create policy parent_weekly_reports_select on parent_weekly_reports for select
  using (
    is_principal()
    or has_class_scope(class_id, array['homeroom_teacher'])
    or is_self_student(student_id)
    or is_parent_of(student_id)
  );

comment on table parent_weekly_reports is
  'Bản chụp bất biến theo lần gửi báo cáo tuần; không tính lại nội dung email đã gửi.';

