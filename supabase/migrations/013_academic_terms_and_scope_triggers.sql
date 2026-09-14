-- =========================================================
-- Học kỳ theo năm học + sửa quyền cho trigger đồng bộ scope.
-- =========================================================

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  school_year_id uuid not null references public.school_years(id) on delete cascade,
  name text not null,
  term_number smallint not null check (term_number between 1 and 3),
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint academic_term_dates_valid check (start_date <= end_date),
  unique (school_year_id, term_number),
  unique (school_year_id, name)
);

create index if not exists idx_academic_terms_school_year
  on public.academic_terms(school_year_id, term_number);

create unique index if not exists one_active_term_per_school_year
  on public.academic_terms(school_year_id)
  where status = 'active';

create or replace function public.validate_academic_term_dates()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  year_start date;
  year_end date;
begin
  select start_date, end_date into year_start, year_end
  from public.school_years where id = new.school_year_id;

  if year_start is null then
    raise exception 'Năm học không tồn tại';
  end if;
  if new.start_date < year_start or new.end_date > year_end then
    raise exception 'Thời gian học kỳ phải nằm trong năm học';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_validate_academic_term_dates on public.academic_terms;
create trigger trg_validate_academic_term_dates
  before insert or update on public.academic_terms
  for each row execute function public.validate_academic_term_dates();

alter table public.academic_terms enable row level security;

drop policy if exists academic_terms_select on public.academic_terms;
create policy academic_terms_select on public.academic_terms for select
  using (auth.role() = 'authenticated');

drop policy if exists academic_terms_write_principal on public.academic_terms;
create policy academic_terms_write_principal on public.academic_terms for all
  using (public.is_principal()) with check (public.is_principal());

-- Các bảng scope không cho client ghi trực tiếp. Trigger phải chạy bằng quyền
-- owner để có thể đồng bộ scope sau một thao tác hợp lệ trên bảng nghiệp vụ.
alter function public.sync_homeroom_scope() security definer;
alter function public.sync_homeroom_scope() set search_path = public;

alter function public.sync_subject_teacher_scope() security definer;
alter function public.sync_subject_teacher_scope() set search_path = public;

alter function public.sync_officer_scope() security definer;
alter function public.sync_officer_scope() set search_path = public;

alter function public.rebuild_student_officer_scopes(uuid, uuid) security definer;
alter function public.rebuild_student_officer_scopes(uuid, uuid) set search_path = public;

alter function public.backfill_scope_on_student_login() security definer;
alter function public.backfill_scope_on_student_login() set search_path = public;

comment on table public.academic_terms is
  'Danh sách học kỳ thuộc từng năm học, do Hiệu trưởng/Admin quản lý.';
