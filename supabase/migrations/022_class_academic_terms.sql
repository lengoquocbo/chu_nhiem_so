-- Lớp thuộc một năm học và được mở trong từng học kỳ của năm đó.
-- Không tạo bản sao lớp 10A1 cho mỗi học kỳ; bảng liên kết này là nền tảng
-- để phân công GVCN/GVBM theo học kỳ ở các bước tiếp theo.

create table if not exists public.class_academic_terms (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  academic_term_id uuid not null references public.academic_terms(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, academic_term_id)
);

create index if not exists idx_class_academic_terms_term
  on public.class_academic_terms(academic_term_id, class_id);

create or replace function public.validate_class_academic_term()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  class_year_id uuid;
  term_year_id uuid;
begin
  select school_year_id into class_year_id from public.classes where id = new.class_id;
  select school_year_id into term_year_id from public.academic_terms where id = new.academic_term_id;

  if class_year_id is null or term_year_id is null then
    raise exception 'Lớp hoặc học kỳ không tồn tại';
  end if;
  if class_year_id <> term_year_id then
    raise exception 'Học kỳ không thuộc năm học của lớp';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_class_academic_term on public.class_academic_terms;
create trigger trg_validate_class_academic_term
  before insert or update on public.class_academic_terms
  for each row execute function public.validate_class_academic_term();

-- Gắn dữ liệu lớp cũ vào học kỳ đang hoạt động; nếu chưa có học kỳ active thì
-- dùng học kỳ đầu tiên của đúng năm học. Không đoán sang một năm học khác.
insert into public.class_academic_terms (class_id, academic_term_id, created_by)
select c.id, selected_term.id, c.created_by
from public.classes c
cross join lateral (
  select t.id
  from public.academic_terms t
  where t.school_year_id = c.school_year_id
  order by case when t.status = 'active' then 0 else 1 end, t.term_number
  limit 1
) selected_term
on conflict (class_id, academic_term_id) do nothing;

alter table public.class_academic_terms enable row level security;

drop policy if exists class_academic_terms_select on public.class_academic_terms;
create policy class_academic_terms_select on public.class_academic_terms for select
  using (public.is_principal() or public.has_any_class_scope(class_id));

drop policy if exists class_academic_terms_write_principal on public.class_academic_terms;
create policy class_academic_terms_write_principal on public.class_academic_terms for all
  using (public.is_principal()) with check (public.is_principal());

comment on table public.class_academic_terms is
  'Liên kết lớp theo năm với từng học kỳ; dùng làm phạm vi phân công và dữ liệu học kỳ.';
