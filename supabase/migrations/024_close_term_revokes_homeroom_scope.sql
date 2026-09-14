-- Khi học kỳ đóng, thu hồi ngay scope GVCN của học kỳ đó. Khi kích hoạt lại,
-- scope được khôi phục từ bản phân công còn hiệu lực.

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
    join public.academic_terms t on t.id = cat.academic_term_id
    where cat.class_id = p_class_id
      and h.teacher_id = p_teacher_id
      and h.status = 'active'
      and cat.status = 'active'
      and t.status = 'active'
  ) then
    insert into public.user_class_scope(user_id, class_id, scope_role)
    values (p_teacher_id, p_class_id, 'homeroom_teacher')
    on conflict do nothing;
  else
    delete from public.user_class_scope
    where user_id = p_teacher_id
      and class_id = p_class_id
      and scope_role = 'homeroom_teacher';
  end if;
end;
$$;

create or replace function public.sync_homeroom_scope_on_term_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assignment record;
begin
  if old.status is distinct from new.status then
    for assignment in
      select distinct cat.class_id, h.teacher_id
      from public.class_academic_terms cat
      join public.homeroom_term_assignments h on h.class_academic_term_id = cat.id
      where cat.academic_term_id = new.id and h.status = 'active'
    loop
      perform public.refresh_term_homeroom_scope(assignment.class_id, assignment.teacher_id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_homeroom_scope_on_term_status on public.academic_terms;
create trigger trg_sync_homeroom_scope_on_term_status
  after update of status on public.academic_terms
  for each row execute function public.sync_homeroom_scope_on_term_status();

-- Đồng bộ lại dữ liệu hiện hữu ngay khi chạy migration.
do $$
declare
  assignment record;
begin
  for assignment in
    select distinct cat.class_id, h.teacher_id
    from public.class_academic_terms cat
    join public.homeroom_term_assignments h on h.class_academic_term_id = cat.id
  loop
    perform public.refresh_term_homeroom_scope(assignment.class_id, assignment.teacher_id);
  end loop;
end;
$$;

