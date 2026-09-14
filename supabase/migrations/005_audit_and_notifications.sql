-- =========================================================
-- 005_audit_and_notifications.sql
-- Audit log toàn hệ thống + cấu hình/gửi thông báo phụ huynh
-- =========================================================

-- ---------------------------------------------------------
-- AUDIT LOG - không được xóa tùy tiện (không cấp quyền DELETE cho ai ngoài service_role)
-- ---------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles(id),
  action text not null,         -- 'CREATE','UPDATE','APPROVE','ADJUST','LOCK','UNLOCK',...
  entity text not null,         -- 'score_transactions','competition_weeks','criteria',...
  entity_id uuid not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index idx_audit_entity on audit_logs(entity, entity_id);
create index idx_audit_actor on audit_logs(actor_id);

-- ---------------------------------------------------------
-- CẤU HÌNH LOẠI SỰ KIỆN CẦN THÔNG BÁO PHỤ HUYNH (GVCN cấu hình theo lớp)
-- ---------------------------------------------------------
create table notification_configs (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  event_type_id uuid not null references event_types(id),
  notify_parent boolean not null default false,
  notify_channels text[] not null default '{}',  -- ['zalo','telegram','in_app']
  configured_by uuid references profiles(id),
  updated_at timestamptz not null default now(),
  unique (class_id, event_type_id)
);

-- ---------------------------------------------------------
-- LỊCH SỬ GỬI THÔNG BÁO
-- ---------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id),
  recipient_parent_id uuid references profiles(id),
  channel text not null check (channel in ('zalo','telegram','in_app')),
  content text not null,
  related_transaction_id uuid references score_transactions(id),
  status text not null default 'pending' check (status in ('pending','sent','failed')),
  error_reason text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notifications_student on notifications(student_id);
create index idx_notifications_status on notifications(status) where status = 'pending';
