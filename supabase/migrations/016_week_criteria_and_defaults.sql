-- =========================================================
-- 016_week_criteria_and_defaults.sql
-- Bộ tiêu chí mặc định cho từng lớp và phạm vi tiêu chí theo tuần thi đua.
-- =========================================================

-- Cho phép các tiêu chí chỉ dùng để theo dõi, không cộng/trừ điểm.
alter table criteria drop constraint if exists criteria_points_check;
alter table criteria add constraint criteria_points_check check (points >= 0);

alter table criteria add column if not exists severity text;

-- Sự kiện kỹ thuật chung khi giáo viên ghi nhận trực tiếp một tiêu chí.
-- Tên/mức điểm nghiệp vụ vẫn lấy từ criteria, người dùng không phải ánh xạ.
insert into event_types (code, name, requires_criteria)
values ('CRITERIA_RECORD', 'Ghi nhận tiêu chí thi đua', true)
on conflict (code) do nothing;

create or replace function seed_default_criteria_for_class(target_class_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into criteria (class_id, code, category, name, severity, kind, points)
  values
    (target_class_id, 'TC08', 'Điểm danh', 'Vắng có phép',                      null,         'ADD',    0),
    (target_class_id, 'TC09', 'Điểm danh', 'Về sớm có phép',                  null,         'ADD',    0),
    (target_class_id, 'TC10', 'Điểm danh', 'Về sớm không phép',               'Nhẹ',        'DEDUCT', 1),
    (target_class_id, 'TC11', 'Học tập',   'Không xây dựng bài',              'Nhẹ',        'DEDUCT', 1),
    (target_class_id, 'TC12', 'Học tập',   'Không thuộc bài',                 'Vừa',        'DEDUCT', 2),
    (target_class_id, 'TC13', 'Nề nếp',    'Nói chuyện trong giờ',            'Nhẹ',        'DEDUCT', 1),
    (target_class_id, 'TC14', 'Nề nếp',    'Không mặc đúng đồng phục',        'Nhẹ',        'DEDUCT', 2),
    (target_class_id, 'TC15', 'Lao động',  'Không trực nhật',                 'Vừa',        'DEDUCT', 3),
    (target_class_id, 'TC16', 'Nề nếp',    'Làm việc riêng trong giờ',        'Vừa',        'DEDUCT', 2),
    (target_class_id, 'TC17', 'Nề nếp',    'Mang điện thoại trái quy định',   'Nhẹ',        'DEDUCT', 2),
    (target_class_id, 'TC18', 'Nề nếp',    'Sử dụng điện thoại trong giờ',    'Vừa',        'DEDUCT', 5),
    (target_class_id, 'TC19', 'Học tập',   'Giơ tay phát biểu xây dựng bài',  'Tích cực',   'ADD',    1),
    (target_class_id, 'TC20', 'Học tập',   'Trả lời đúng/xây dựng bài tốt',   'Tích cực',   'ADD',    2),
    (target_class_id, 'TC21', 'Học tập',   'Đạt một hoa điểm 10',             'Thành tích', 'ADD',    2),
    (target_class_id, 'TC22', 'Học tập',   'Đạt từ 3 hoa điểm 10 trong tuần', 'Thành tích', 'ADD',    5),
    (target_class_id, 'TC23', 'Nề nếp',    'Có tiến bộ rõ rệt trong tuần',    'Tích cực',   'ADD',    3),
    (target_class_id, 'TC24', 'Tập thể',   'Hoàn thành tốt nhiệm vụ được giao','Tích cực',  'ADD',    2),
    (target_class_id, 'TC25', 'Tập thể',   'Tích cực hỗ trợ lớp hoặc bạn bè', 'Tích cực',   'ADD',    2)
  on conflict (class_id, code) do nothing;
$$;

-- Bổ sung cho các lớp đang tồn tại.
select seed_default_criteria_for_class(id) from classes;

-- Tự bổ sung khi có lớp mới.
create or replace function seed_default_criteria_after_class_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform seed_default_criteria_for_class(new.id);
  return new;
end;
$$;

drop trigger if exists trg_seed_default_criteria on classes;
create trigger trg_seed_default_criteria
after insert on classes
for each row execute function seed_default_criteria_after_class_insert();

revoke execute on function seed_default_criteria_for_class(uuid) from public, anon, authenticated;

create table competition_week_criteria (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references competition_weeks(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  criteria_id uuid not null references criteria(id),
  created_at timestamptz not null default now(),
  unique (week_id, criteria_id)
);

create index idx_week_criteria_week on competition_week_criteria(week_id);
create index idx_week_criteria_criteria on competition_week_criteria(criteria_id);

-- Các tuần cũ tiếp tục hoạt động với toàn bộ tiêu chí đang có của lớp.
insert into competition_week_criteria (week_id, class_id, criteria_id)
select w.id, w.class_id, c.id
from competition_weeks w
join criteria c on c.class_id = w.class_id and c.status = 'active'
on conflict (week_id, criteria_id) do nothing;

create or replace function validate_competition_week_criteria_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from competition_weeks w
    join criteria c on c.id = new.criteria_id
    where w.id = new.week_id
      and w.class_id = new.class_id
      and c.class_id = new.class_id
  ) then
    raise exception 'Tuần và tiêu chí phải thuộc cùng một lớp.';
  end if;
  return new;
end;
$$;

create trigger trg_validate_week_criteria_scope
before insert or update on competition_week_criteria
for each row execute function validate_competition_week_criteria_scope();

alter table competition_week_criteria enable row level security;

create policy competition_week_criteria_select on competition_week_criteria for select
  using (is_principal() or has_any_class_scope(class_id));

-- Tạo/sửa tuần thực hiện qua Python API để kiểm tra quyền và ghi audit.
comment on table competition_week_criteria is
  'Danh sách tiêu chí được phép áp dụng trong từng tuần thi đua.';
