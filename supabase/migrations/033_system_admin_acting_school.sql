-- System admins may act as a principal only within the school explicitly
-- selected on each PostgREST request. A forged header is harmless for other roles.
begin;

create or replace function public.acting_school_id() returns uuid
language plpgsql stable security definer set search_path = public as $$
declare
  selected text;
begin
  selected := current_setting('request.headers', true)::jsonb ->> 'x-acting-school-id';
  if selected is null or selected = '' or selected !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  return selected::uuid;
end;
$$;

create or replace function public.is_principal_of_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_school_id is not null and (
    exists (
      select 1 from public.staff_school_assignments a
      join public.user_roles r on r.user_id = a.user_id and r.role = 'principal'
      where a.user_id = auth.uid() and a.school_id = p_school_id
    ) or (
      p_school_id = public.acting_school_id()
      and public.has_app_role('system_admin')
      and exists (select 1 from public.schools s where s.id = p_school_id)
    )
  );
$$;

create or replace function public.can_read_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_principal_of_school(p_school_id) or exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id
    where a.user_id = auth.uid() and a.school_id = p_school_id
      and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
  ) or exists (
    select 1 from public.user_class_scope u
    join public.classes c on c.id = u.class_id
    join public.school_years y on y.id = c.school_year_id
    where u.user_id = auth.uid() and y.school_id = p_school_id
      and not exists (
        select 1 from public.user_roles r where r.user_id = auth.uid()
          and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
      )
  ) or exists (
    select 1 from public.student_user_link l
    join public.students s on s.id = l.student_id
    where l.user_id = auth.uid() and s.school_id = p_school_id
  ) or exists (
    select 1 from public.parent_student_scope p
    join public.students s on s.id = p.student_id
    where p.parent_id = auth.uid() and s.school_id = p_school_id
  );
$$;

drop policy if exists students_staff_insert on public.students;
create policy students_staff_insert on public.students for insert with check (
  public.is_principal_of_school(school_id) or exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id
    where a.user_id = auth.uid() and a.school_id = school_id
      and r.role in ('principal', 'homeroom_teacher')
  )
);

drop policy if exists schools_read_member on public.schools;
create policy schools_read_member on public.schools for select using (
  public.is_principal_of_school(id) or exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id
    where a.user_id = auth.uid() and a.school_id = id
      and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
  )
);

commit;
