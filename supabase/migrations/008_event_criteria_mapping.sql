-- =========================================================
-- 008_event_criteria_mapping.sql
-- Cho phép hệ thống TỰ đối chiếu tiêu chí theo event_type mà không cần
-- người ghi nhận (GVBM, tổ trưởng...) tự chọn mã tiêu chí thủ công.
-- GVCN cấu hình: "Đi muộn" (event_type) ứng với tiêu chí nào của lớp mình.
-- =========================================================

create table event_criteria_mappings (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  event_type_id uuid not null references event_types(id),
  criteria_id uuid not null references criteria(id),
  status text not null default 'active' check (status in ('active','inactive')),
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Mỗi lớp chỉ có 1 mapping ACTIVE cho mỗi event_type
create unique index uq_event_criteria_active
  on event_criteria_mappings (class_id, event_type_id)
  where status = 'active';

alter table event_criteria_mappings enable row level security;

create policy event_criteria_mappings_select on event_criteria_mappings for select
  using (is_principal() or has_any_class_scope(class_id));
create policy event_criteria_mappings_write on event_criteria_mappings for all
  using (is_principal() or has_class_scope(class_id, array['homeroom_teacher']))
  with check (is_principal() or has_class_scope(class_id, array['homeroom_teacher']));

comment on table event_criteria_mappings is
  'GVCN cấu hình: loại sự kiện nào (event_type) tự động dùng tiêu chí (criteria) nào. '
  'Người ghi nhận sự việc chỉ chọn event_type, KHÔNG chọn điểm hay tiêu chí thủ công.';
