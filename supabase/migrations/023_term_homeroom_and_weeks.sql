-- Phân công GVCN và tuần thi đua theo đúng lớp - học kỳ.

create table if not exists public.homeroom_term_assignments (
  id uuid primary key default gen_random_uuid(),
  class_academic_term_id uuid not null references public.class_academic_terms(id) on delete cascade,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  assigned_by uuid references public.profiles(id),
  assigned_at timestamptz not null default now(),
  removed_by uuid references public.profiles(id),
  removed_at timestamptz
);

create unique index if not exists uq_active_homeroom_per_class_term
  on public.homeroom_term_assignments(class_academic_term_id)
  where status = 'active';
create index if not exists idx_homeroom_term_teacher
  on public.homeroom_term_assignments(teacher_id, status);

insert into public.homeroom_term_assignments
  (class_academic_term_id, teacher_id, assigned_by)
select cat.id, c.homeroom_teacher_id, c.created_by
from public.class_academic_terms cat
join public.classes c on c.id = cat.class_id
where c.homeroom_teacher_id is not null
  and not exists (
    select 1 from public.homeroom_term_assignments h
    where h.class_academic_term_id = cat.id and h.status = 'active'
  );

create or replace function public.refresh_term_homeroom_scope(p_class_id uuid, p_teacher_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.homeroom_term_assignments h
    join public.class_academic_terms cat on cat.id = h.class_academic_term_id
    where cat.class_id = p_class_id and h.teacher_id = p_teacher_id and h.status = 'active'
  ) then
    insert into public.user_class_scope(user_id, class_id, scope_role)
    values (p_teacher_id, p_class_id, 'homeroom_teacher')
    on conflict do nothing;
  else
    delete from public.user_class_scope
    where user_id = p_teacher_id and class_id = p_class_id and scope_role = 'homeroom_teacher';
  end if;
end;
$$;

create or replace function public.sync_term_homeroom_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  old_class_id uuid;
  new_class_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    select class_id into old_class_id from public.class_academic_terms where id = old.class_academic_term_id;
    perform public.refresh_term_homeroom_scope(old_class_id, old.teacher_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select class_id into new_class_id from public.class_academic_terms where id = new.class_academic_term_id;
    perform public.refresh_term_homeroom_scope(new_class_id, new.teacher_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_sync_term_homeroom_scope on public.homeroom_term_assignments;
create trigger trg_sync_term_homeroom_scope
  after insert or update or delete on public.homeroom_term_assignments
  for each row execute function public.sync_term_homeroom_scope();

alter table public.homeroom_term_assignments enable row level security;
drop policy if exists homeroom_term_assignments_select on public.homeroom_term_assignments;
create policy homeroom_term_assignments_select on public.homeroom_term_assignments for select
  using (public.is_principal() or teacher_id = auth.uid());
drop policy if exists homeroom_term_assignments_write_principal on public.homeroom_term_assignments;
create policy homeroom_term_assignments_write_principal on public.homeroom_term_assignments for all
  using (public.is_principal()) with check (public.is_principal());

alter table public.competition_weeks
  add column if not exists academic_term_id uuid references public.academic_terms(id);

update public.competition_weeks w
set academic_term_id = t.id
from public.academic_terms t
where w.academic_term_id is null
  and t.school_year_id = w.school_year_id
  and w.start_date >= t.start_date
  and w.end_date <= t.end_date;

create index if not exists idx_weeks_class_term
  on public.competition_weeks(class_id, academic_term_id, week_number);

create or replace function public.validate_competition_week_term()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  term_row public.academic_terms%rowtype;
begin
  if new.academic_term_id is null then
    raise exception 'Tuần thi đua phải thuộc một học kỳ';
  end if;
  select * into term_row from public.academic_terms where id = new.academic_term_id;
  if term_row.id is null or term_row.school_year_id <> new.school_year_id then
    raise exception 'Học kỳ không thuộc năm học của tuần';
  end if;
  if new.start_date < term_row.start_date or new.end_date > term_row.end_date then
    raise exception 'Thời gian tuần phải nằm trong học kỳ';
  end if;
  if not exists (
    select 1 from public.class_academic_terms cat
    where cat.class_id = new.class_id and cat.academic_term_id = new.academic_term_id
  ) then
    raise exception 'Lớp chưa được mở trong học kỳ này';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_competition_week_term on public.competition_weeks;
create trigger trg_validate_competition_week_term
  before insert or update of class_id, school_year_id, academic_term_id, start_date, end_date
  on public.competition_weeks
  for each row execute function public.validate_competition_week_term();

