-- Multi-school foundation. Apply after 027; existing rows belong to one legacy school.
begin;

create table public.schools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.schools (slug, name)
values ('legacy-school', 'Trường hiện tại')
on conflict (slug) do nothing;

create table public.staff_school_assignments (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  school_id uuid not null references public.schools(id) on delete restrict,
  assigned_at timestamptz not null default now()
);
create index idx_staff_school_assignments_school on public.staff_school_assignments(school_id);

insert into public.staff_school_assignments (user_id, school_id)
select distinct ur.user_id, s.id
from public.user_roles ur
cross join public.schools s
where s.slug = 'legacy-school'
  and ur.role in ('principal', 'homeroom_teacher', 'subject_teacher')
on conflict (user_id) do nothing;

alter table public.school_years add column school_id uuid references public.schools(id);
update public.school_years set school_id = (select id from public.schools where slug = 'legacy-school')
where school_id is null;
alter table public.school_years alter column school_id set not null;
create index idx_school_years_school on public.school_years(school_id);
alter table public.school_years drop constraint if exists school_years_name_key;
alter table public.school_years add constraint school_years_school_name_key unique (school_id, name);
drop index if exists public.one_active_school_year;
create unique index one_active_school_year_per_school
  on public.school_years(school_id) where status = 'active';

-- A student has one current school. Cross-school transfer needs an explicit
-- transfer workflow; simply enrolling the same student elsewhere is rejected.
alter table public.students add column school_id uuid references public.schools(id);
alter table public.students add column created_by uuid references public.profiles(id);
update public.students set school_id = (select id from public.schools where slug = 'legacy-school')
where school_id is null;
alter table public.students alter column school_id set not null;
create index idx_students_school on public.students(school_id);

alter table public.audit_logs add column school_id uuid references public.schools(id);
update public.audit_logs set school_id = (select id from public.schools where slug = 'legacy-school')
where school_id is null;
create index idx_audit_logs_school on public.audit_logs(school_id, created_at desc);

create or replace function public.set_audit_school() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.school_id is null then
    select a.school_id into new.school_id
    from public.staff_school_assignments a where a.user_id = new.actor_id;
  end if;
  if new.school_id is null then
    select s.school_id into new.school_id
    from public.student_user_link l
    join public.students s on s.id = l.student_id
    where l.user_id = new.actor_id;
  end if;
  return new;
end;
$$;
create trigger trg_set_audit_school before insert on public.audit_logs
  for each row execute function public.set_audit_school();

create or replace function public.set_student_creator() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger trg_set_student_creator before insert on public.students
  for each row execute function public.set_student_creator();

create or replace function public.prevent_implicit_school_move() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.school_id is distinct from old.school_id then
    raise exception 'Không thể đổi trường trực tiếp; cần quy trình chuyển trường riêng';
  end if;
  return new;
end;
$$;
create trigger trg_prevent_year_school_move
  before update of school_id on public.school_years
  for each row execute function public.prevent_implicit_school_move();
create trigger trg_prevent_student_school_move
  before update of school_id on public.students
  for each row execute function public.prevent_implicit_school_move();

create or replace function public.school_of_year(p_year_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select school_id from public.school_years where id = p_year_id;
$$;

create or replace function public.school_of_class(p_class_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select y.school_id from public.classes c
  join public.school_years y on y.id = c.school_year_id
  where c.id = p_class_id;
$$;

create or replace function public.is_principal_of_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id and r.role = 'principal'
    where a.user_id = auth.uid() and a.school_id = p_school_id
  );
$$;

create or replace function public.is_principal_of_year(p_year_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_principal_of_school(public.school_of_year(p_year_id));
$$;

create or replace function public.is_principal_of_class(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_principal_of_school(public.school_of_class(p_class_id));
$$;

create or replace function public.is_principal_of_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and public.is_principal_of_school(s.school_id)
  );
$$;

create or replace function public.is_staff_of_class(p_user_id uuid, p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id
    where a.user_id = p_user_id and a.school_id = public.school_of_class(p_class_id)
      and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
  );
$$;

create or replace function public.guard_class_school_integrity() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.school_year_id is distinct from new.school_year_id then
    raise exception 'Không thể đổi năm học của lớp đã tạo';
  end if;
  if (select school_year_id from public.grade_blocks where id = new.grade_block_id) is distinct from new.school_year_id then
    raise exception 'Khối không thuộc năm học của lớp';
  end if;
  if new.homeroom_teacher_id is not null
     and not public.is_staff_of_class(new.homeroom_teacher_id, new.id) then
    -- The row may not exist yet on INSERT, so compare via the chosen year.
    if not exists (
      select 1 from public.staff_school_assignments a
      join public.school_years y on y.school_id = a.school_id
      where a.user_id = new.homeroom_teacher_id and y.id = new.school_year_id
    ) then
      raise exception 'GVCN không thuộc trường của lớp';
    end if;
  end if;
  if new.homeroom_teacher_id is not null and not exists (
    select 1 from public.user_roles r
    where r.user_id = new.homeroom_teacher_id and r.role = 'homeroom_teacher'
  ) then
    raise exception 'Tài khoản chưa có vai trò GVCN';
  end if;
  return new;
end;
$$;
create trigger trg_guard_class_school_integrity
  before insert or update of grade_block_id, school_year_id, homeroom_teacher_id on public.classes
  for each row execute function public.guard_class_school_integrity();

create or replace function public.guard_enrollment_school() returns trigger
language plpgsql set search_path = public as $$
begin
  if public.school_of_class(new.class_id) is distinct from (select school_id from public.students where id = new.student_id)
     or (select school_year_id from public.classes where id = new.class_id) is distinct from new.school_year_id then
    raise exception 'Học sinh, lớp và năm học phải cùng một trường';
  end if;
  return new;
end;
$$;
create trigger trg_guard_enrollment_school
  before insert or update of student_id, class_id, school_year_id on public.student_class_enrollments
  for each row execute function public.guard_enrollment_school();

create or replace function public.guard_staff_class() returns trigger
language plpgsql set search_path = public as $$
begin
  if not public.is_staff_of_class(new.teacher_id, new.class_id) then
    raise exception 'Giáo viên không thuộc trường của lớp';
  end if;
  return new;
end;
$$;
create trigger trg_guard_subject_teacher_school
  before insert or update of teacher_id, class_id on public.class_subject_teachers
  for each row execute function public.guard_staff_class();
create trigger trg_guard_timetable_teacher_school
  before insert or update of teacher_id, class_id on public.timetable_entries
  for each row execute function public.guard_staff_class();
create trigger trg_guard_lesson_teacher_school
  before insert or update of teacher_id, class_id on public.lesson_book_entries
  for each row execute function public.guard_staff_class();

create or replace function public.guard_homeroom_term_school() returns trigger
language plpgsql set search_path = public as $$
declare v_class_id uuid;
begin
  select class_id into v_class_id from public.class_academic_terms where id = new.class_academic_term_id;
  if not public.is_staff_of_class(new.teacher_id, v_class_id)
     or not exists (
       select 1 from public.user_roles r
       where r.user_id = new.teacher_id and r.role = 'homeroom_teacher'
     ) then
    raise exception 'GVCN không thuộc trường của lớp';
  end if;
  return new;
end;
$$;
create trigger trg_guard_homeroom_term_school
  before insert or update of teacher_id, class_academic_term_id on public.homeroom_term_assignments
  for each row execute function public.guard_homeroom_term_school();

alter table public.schools enable row level security;
alter table public.staff_school_assignments enable row level security;
create policy schools_read_member on public.schools for select using (
  exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id
    where a.user_id = auth.uid() and a.school_id = id
      and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
  )
);
create policy staff_school_assignments_read on public.staff_school_assignments for select using (
  user_id = auth.uid() or public.is_principal_of_school(school_id)
);

-- Provisioning additional schools and their first principal is a trusted
-- service-role operation; no ordinary client gets INSERT on these two tables.
commit;
