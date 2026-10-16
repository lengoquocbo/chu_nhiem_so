-- Replace global principal access with school-scoped access. The old policy
-- branches remain syntactically valid but can no longer grant global access.
begin;


create or replace function public.is_principal() returns boolean
language sql stable security definer set search_path = public as $$
  select false;
$$;

create or replace function public.can_read_school(p_school_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
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

-- A reassigned teacher must not retain access through a stale class-scope row.
create or replace function public.has_class_scope(p_class_id uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_class_scope u
    where u.user_id = auth.uid() and u.class_id = p_class_id
      and u.scope_role = any(p_roles)
  ) and (
    not exists (
      select 1 from public.user_roles r where r.user_id = auth.uid()
        and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
    ) or public.is_staff_of_class(auth.uid(), p_class_id)
  );
$$;

create or replace function public.has_any_class_scope(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_class_scope u
    where u.user_id = auth.uid() and u.class_id = p_class_id
  ) and (
    not exists (
      select 1 from public.user_roles r where r.user_id = auth.uid()
        and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
    ) or public.is_staff_of_class(auth.uid(), p_class_id)
  );
$$;

create or replace function public.has_group_scope(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_group_scope u
    where u.user_id = auth.uid() and u.group_id = p_group_id
  ) and (
    not exists (
      select 1 from public.user_roles r where r.user_id = auth.uid()
        and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
    ) or exists (
      select 1 from public.groups_ g
      where g.id = p_group_id and public.is_staff_of_class(auth.uid(), g.class_id)
    )
  );
$$;

create or replace function public.is_principal_of_user(p_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_school_assignments a
    where a.user_id = p_user_id and public.is_principal_of_school(a.school_id)
  ) or exists (
    select 1 from public.student_user_link l
    join public.students s on s.id = l.student_id
    where l.user_id = p_user_id and public.is_principal_of_school(s.school_id)
  ) or exists (
    select 1 from public.parent_student_scope p
    join public.students s on s.id = p.student_id
    where p.parent_id = p_user_id and public.is_principal_of_school(s.school_id)
  );
$$;

create or replace function public.is_principal_of_group(p_group_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.groups_ g where g.id = p_group_id and public.is_principal_of_class(g.class_id));
$$;

create or replace function public.is_principal_of_officer(p_officer_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_officers o where o.id = p_officer_id and public.is_principal_of_class(o.class_id));
$$;

create or replace function public.is_principal_of_week(p_week_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.competition_weeks w where w.id = p_week_id and public.is_principal_of_class(w.class_id));
$$;

create or replace function public.is_principal_of_session(p_session_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.attendance_sessions s where s.id = p_session_id and public.is_principal_of_class(s.class_id));
$$;

create or replace function public.is_principal_of_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lesson_book_entries l where l.id = p_lesson_id and public.is_principal_of_class(l.class_id));
$$;

create or replace function public.is_principal_of_class_term(p_class_term_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_academic_terms t where t.id = p_class_term_id and public.is_principal_of_class(t.class_id));
$$;

drop policy if exists school_years_select on public.school_years;
create policy school_years_select on public.school_years for select
  using (public.can_read_school(school_id));
drop policy if exists grade_blocks_select on public.grade_blocks;
create policy grade_blocks_select on public.grade_blocks for select
  using (public.can_read_school(public.school_of_year(school_year_id)));
drop policy if exists academic_terms_select on public.academic_terms;
create policy academic_terms_select on public.academic_terms for select
  using (public.can_read_school(public.school_of_year(school_year_id)));
drop policy if exists user_class_scope_select on public.user_class_scope;
create policy user_class_scope_select on public.user_class_scope for select using (
  (user_id = auth.uid() and (
    not exists (
      select 1 from public.user_roles r where r.user_id = auth.uid()
        and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
    ) or public.is_staff_of_class(auth.uid(), class_id)
  )) or public.is_principal_of_class(class_id)
);
drop policy if exists user_group_scope_select on public.user_group_scope;
create policy user_group_scope_select on public.user_group_scope for select using (
  (user_id = auth.uid() and (
    not exists (
      select 1 from public.user_roles r where r.user_id = auth.uid()
        and r.role in ('principal', 'homeroom_teacher', 'subject_teacher')
    ) or exists (
      select 1 from public.groups_ g
      where g.id = group_id and public.is_staff_of_class(auth.uid(), g.class_id)
    )
  )) or public.is_principal_of_group(group_id)
);
drop policy if exists homeroom_term_assignments_select on public.homeroom_term_assignments;
create policy homeroom_term_assignments_select on public.homeroom_term_assignments for select using (
  public.is_principal_of_class_term(class_academic_term_id)
  or (teacher_id = auth.uid() and exists (
    select 1 from public.class_academic_terms t
    where t.id = class_academic_term_id and public.is_staff_of_class(auth.uid(), t.class_id)
  ))
);

-- Class-specific ranking rules are private; null class_id means shared
-- seed defaults, readable by everyone but writable only by service role.
drop policy if exists rank_configs_select on public.rank_configs;
create policy rank_configs_select on public.rank_configs for select using (
  class_id is null or public.is_principal_of_class(class_id) or public.has_any_class_scope(class_id)
);

drop policy if exists class_subject_teachers_insert_self on public.class_subject_teachers;
create policy class_subject_teachers_insert_self on public.class_subject_teachers for insert
  with check (
    teacher_id = auth.uid() and public.has_app_role('subject_teacher')
    and public.is_staff_of_class(auth.uid(), class_id)
  );

-- The UI creates a student before its first enrollment. Permit that insert
-- only in the actor's own school; subsequent enrollment is class-scoped.
create policy students_staff_insert on public.students for insert with check (
  exists (
    select 1 from public.staff_school_assignments a
    join public.user_roles r on r.user_id = a.user_id
    where a.user_id = auth.uid() and a.school_id = school_id
      and r.role in ('principal', 'homeroom_teacher')
  )
);
create policy students_creator_select on public.students for select using (
  created_by = auth.uid() and public.can_read_school(school_id)
);
create policy students_creator_cleanup on public.students for delete using (
  created_by = auth.uid() and public.can_read_school(school_id)
  and not exists (select 1 from public.student_class_enrollments e where e.student_id = id)
);

-- Read/write grants below mirror only the former principal branches. Every
-- expression is row-scoped; generic SELECT permissions do not escape schools.
do $$
declare
  p record;
begin
  for p in
    select * from (values
      ('profiles', 'public.is_principal_of_user(id)', false),
      ('user_roles', 'public.is_principal_of_user(user_id)', true),
      ('school_years', 'public.is_principal_of_school(school_id)', true),
      ('grade_blocks', 'public.is_principal_of_year(school_year_id)', true),
      ('classes', 'public.is_principal_of_year(school_year_id)', true),
      ('class_subject_teachers', 'public.is_principal_of_class(class_id)', false),
      ('students', 'public.is_principal_of_school(school_id)', true),
      ('student_class_enrollments', 'public.is_principal_of_class(class_id)', true),
      ('groups_', 'public.is_principal_of_class(class_id)', true),
      ('group_members', 'public.is_principal_of_group(group_id)', true),
      ('class_officers', 'public.is_principal_of_class(class_id)', true),
      ('officer_permissions', 'public.is_principal_of_officer(class_officer_id)', true),
      ('user_class_scope', 'public.is_principal_of_class(class_id)', false),
      ('user_group_scope', 'public.is_principal_of_group(group_id)', false),
      ('parent_student_scope', 'public.is_principal_of_student(student_id)', false),
      ('student_user_link', 'public.is_principal_of_student(student_id)', false),
      ('criteria', 'public.is_principal_of_class(class_id)', true),
      ('competition_weeks', 'public.is_principal_of_class(class_id)', false),
      ('week_unlock_requests', 'public.is_principal_of_week(week_id)', false),
      ('student_events', 'public.is_principal_of_class(class_id)', false),
      ('score_transactions', 'public.is_principal_of_class(class_id)', false),
      ('weekly_score_summary', 'public.is_principal_of_class(class_id)', false),
      ('period_score_summary', 'public.is_principal_of_class(class_id)', false),
      ('rank_configs', 'class_id is not null and public.is_principal_of_class(class_id)', true),
      ('attendance_sessions', 'public.is_principal_of_class(class_id)', false),
      ('attendance_records', 'public.is_principal_of_session(session_id)', false),
      ('audit_logs', 'public.is_principal_of_school(school_id)', false),
      ('notification_configs', 'public.is_principal_of_class(class_id)', true),
      ('notifications', 'public.is_principal_of_student(student_id)', false),
      ('event_criteria_mappings', 'public.is_principal_of_class(class_id)', true),
      ('academic_terms', 'public.is_principal_of_year(school_year_id)', true),
      ('competition_week_criteria', 'public.is_principal_of_class(class_id)', false),
      ('timetable_entries', 'public.is_principal_of_class(class_id)', false),
      ('lesson_book_entries', 'public.is_principal_of_class(class_id)', false),
      ('lesson_individual_criteria', 'public.is_principal_of_lesson(lesson_id)', false),
      ('assessment_scores', 'public.is_principal_of_class(class_id)', false),
      ('assessment_score_history', 'public.is_principal_of_class(class_id)', false),
      ('class_academic_terms', 'public.is_principal_of_class(class_id)', true),
      ('homeroom_term_assignments', 'public.is_principal_of_class_term(class_academic_term_id)', true),
      ('parent_report_configs', 'public.is_principal_of_class(class_id)', true),
      ('parent_weekly_reports', 'public.is_principal_of_class(class_id)', false)
    ) as scoped(table_name, scope_expr, can_write)
  loop
    execute format('create policy school_principal_read on public.%I for select using (%s)', p.table_name, p.scope_expr);
    if p.can_write then
      execute format('create policy school_principal_write on public.%I for all using (%s) with check (%s)', p.table_name, p.scope_expr, p.scope_expr);
    end if;
  end loop;
end;
$$;

create policy school_principal_insert on public.competition_weeks for insert
  with check (public.is_principal_of_class(class_id));

-- Existing homeroom/subject/student policies are retained. The global
-- is_principal() branch is now false; access is reintroduced per school above.
commit;
