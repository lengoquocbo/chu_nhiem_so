-- =========================================================
-- 003_score_engine.sql
-- Lõi nghiệp vụ: tiêu chí thi đua, tuần thi đua, score transaction,
-- điểm danh, chống trùng. KHÔNG BAO GIỜ cho sửa tổng điểm trực tiếp.
-- =========================================================

-- ---------------------------------------------------------
-- TIÊU CHÍ THI ĐUA (GVCN cấu hình riêng cho lớp mình)
-- ---------------------------------------------------------
create table criteria (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  code text not null,              -- "TC01"
  name text not null,              -- "Tham gia hoạt động"
  description text,
  kind text not null check (kind in ('ADD','DEDUCT')),
  points numeric not null check (points > 0),  -- luôn dương, dấu +/- áp theo `kind`
  category text,                   -- nhóm: "attendance","discipline","achievement","task"...
  effective_from date not null default current_date,
  effective_to date,               -- null = còn hiệu lực
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, code)
);

create index idx_criteria_class_active on criteria(class_id) where status = 'active';

-- Điểm ký hiệu thực tế (dương/âm) dùng khi tính toán
create or replace function criteria_signed_points(c criteria) returns numeric as $$
begin
  return case when c.kind = 'DEDUCT' then -1 * c.points else c.points end;
end;
$$ language plpgsql immutable;

-- ---------------------------------------------------------
-- TUẦN THI ĐUA
-- ---------------------------------------------------------
create table competition_weeks (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  school_year_id uuid not null references school_years(id) on delete cascade,
  week_number int not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open','pending_lock','locked')),
  locked_at timestamptz,
  locked_by uuid references profiles(id),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (class_id, week_number, school_year_id),
  check (end_date >= start_date)
);

create index idx_weeks_class on competition_weeks(class_id);

-- Yêu cầu mở khóa tuần đã LOCKED (phải có lý do, ghi audit)
create table week_unlock_requests (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references competition_weeks(id) on delete cascade,
  requested_by uuid not null references profiles(id),
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------
-- SỰ KIỆN NGUỒN (source events) - điểm danh, vi phạm, thành tích, nhiệm vụ
-- Đây là "sự việc" được nhập vào; KHÔNG chứa điểm số trực tiếp do người dùng nhập.
-- ---------------------------------------------------------
create table event_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,  -- 'ATTENDANCE_LATE','ATTENDANCE_ABSENT_UNEXCUSED','VIOLATION','ACHIEVEMENT','TASK_DONE'
  name text not null,
  requires_criteria boolean not null default true
);

create table student_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  week_id uuid references competition_weeks(id),
  event_type_id uuid not null references event_types(id),
  criteria_id uuid references criteria(id),   -- tiêu chí được đối chiếu tự động
  event_date date not null,
  period int,               -- tiết học (nếu có)
  subject_id uuid references subjects(id),
  note text,
  evidence_url text,
  -- (khóa chống trùng được định nghĩa ở unique index bên dưới, không dùng
  -- generated column vì cast date::text không phải hàm IMMUTABLE trong Postgres)
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  status text not null default 'active' check (status in ('active','void')),
  void_reason text,
  voided_by uuid references profiles(id),
  voided_at timestamptz
);

create index idx_events_student on student_events(student_id);
create index idx_events_class_week on student_events(class_id, week_id);

-- Chặn trùng ở tầng DB: không cho 2 sự kiện ACTIVE trùng
-- (cùng học sinh + ngày + tiết + loại sự kiện + tiêu chí).
-- Dùng coalesce với giá trị sentinel để period/criteria_id NULL vẫn được
-- coi là trùng khi các trường còn lại giống nhau (Postgres unique index
-- mặc định coi NULL <> NULL nên phải quy về 1 giá trị cụ thể).
create unique index uq_events_no_duplicate
  on student_events (
    student_id,
    event_date,
    coalesce(period, -1),
    event_type_id,
    coalesce(criteria_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'active';

-- ---------------------------------------------------------
-- SCORE TRANSACTION - đây là nguồn DUY NHẤT quyết định điểm học sinh.
-- Workflow: DRAFT -> SUBMITTED -> CLASS_LEADER_CHECK -> CLASS_LEADER_CONFIRMED
--           -> HOMEROOM_REVIEW -> APPROVED/ADJUSTED -> LOCKED
-- ---------------------------------------------------------
create table score_transactions (
  id uuid primary key default gen_random_uuid(),
  student_event_id uuid not null unique references student_events(id) on delete cascade,
  student_id uuid not null references students(id),
  class_id uuid not null references classes(id),
  week_id uuid references competition_weeks(id),

  -- Điểm hệ thống tự tính tại thời điểm tạo (SNAPSHOT - không tham chiếu động tới criteria
  -- để tránh việc sửa criteria sau này làm thay đổi điểm của transaction cũ)
  system_points numeric not null,
  criteria_code_snapshot text,
  criteria_name_snapshot text,

  -- Điểm sau điều chỉnh (nếu GVCN ADJUST); nếu null = dùng system_points
  adjusted_points numeric,
  adjust_reason text,
  adjusted_by uuid references profiles(id),
  adjusted_at timestamptz,

  status text not null default 'DRAFT' check (status in (
    'DRAFT','SUBMITTED','CLASS_LEADER_CHECK','CLASS_LEADER_CONFIRMED',
    'HOMEROOM_REVIEW','APPROVED','ADJUSTED','LOCKED','REJECTED'
  )),

  submitted_by uuid references profiles(id),
  submitted_at timestamptz,
  checked_by uuid references profiles(id),
  checked_at timestamptz,
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  locked_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_score_tx_student on score_transactions(student_id);
create index idx_score_tx_week on score_transactions(week_id);
create index idx_score_tx_class_week_status on score_transactions(class_id, week_id, status);

-- Hàm lấy điểm hiệu lực của 1 transaction (ưu tiên adjusted_points nếu có)
create or replace function effective_points(t score_transactions) returns numeric as $$
begin
  return coalesce(t.adjusted_points, t.system_points);
end;
$$ language plpgsql immutable;

-- ---------------------------------------------------------
-- WEEKLY SUMMARY - bảng tổng hợp sẵn, tránh quét raw transaction mỗi lần báo cáo
-- Chỉ tính từ transaction đã APPROVED/ADJUSTED/LOCKED
-- ---------------------------------------------------------
create table weekly_score_summary (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  week_id uuid not null references competition_weeks(id) on delete cascade,
  start_score numeric not null default 100,
  total_add numeric not null default 0,
  total_deduct numeric not null default 0,
  final_score numeric not null default 100,
  rank_label text,  -- "Tốt"/"Khá"/"Đạt"/"Chưa đạt", tính theo cấu hình xếp loại
  computed_at timestamptz not null default now(),
  unique (student_id, week_id)
);

create index idx_weekly_summary_class_week on weekly_score_summary(class_id, week_id);

-- Bảng tổng hợp tháng/kỳ/năm - tổng hợp TỪ weekly_score_summary, không quét lại raw data
create table period_score_summary (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  school_year_id uuid not null references school_years(id) on delete cascade,
  period_type text not null check (period_type in ('month','semester','year')),
  period_label text not null,  -- "Tháng 9/2026", "Học kỳ 1", "Năm học 2026-2027"
  avg_score numeric,
  total_add numeric,
  total_deduct numeric,
  rank_label text,
  computed_at timestamptz not null default now(),
  unique (student_id, school_year_id, period_type, period_label)
);

-- ---------------------------------------------------------
-- XẾP LOẠI (cấu hình được, không hard-code)
-- ---------------------------------------------------------
create table rank_configs (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references classes(id) on delete cascade,  -- null = áp dụng mặc định toàn trường
  min_score numeric not null,
  max_score numeric not null,
  label text not null,   -- "Tốt","Khá","Đạt","Chưa đạt"
  order_index int not null default 0,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

comment on table score_transactions is 'Nguồn DUY NHẤT quyết định điểm. Không có cột student.score - luôn tính từ transaction đã duyệt';
comment on table student_events is 'Sự việc được ghi nhận; dedup_key chặn trùng ở tầng DB';
comment on column score_transactions.system_points is 'Snapshot điểm tại thời điểm tạo - sửa criteria sau này KHÔNG ảnh hưởng transaction cũ';
