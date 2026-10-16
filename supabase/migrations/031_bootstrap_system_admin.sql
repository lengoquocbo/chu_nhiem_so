-- Promote the existing platform owner after 030 has committed. No password
-- is stored here. System admins do not retain school-principal privileges.
begin;

do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id
  from auth.users
  where lower(email) = lower('quocbo303@gmail.com');

  if v_user_id is null then
    raise exception 'Không tìm thấy tài khoản admin cấp hệ thống trong auth.users';
  end if;

  insert into public.profiles (id, full_name)
  select id, coalesce(nullif(raw_user_meta_data->>'full_name', ''), 'Quản trị hệ thống')
  from auth.users where id = v_user_id
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (v_user_id, 'system_admin')
  on conflict (user_id, role) do nothing;

  delete from public.user_roles
  where user_id = v_user_id
    and role in ('principal', 'homeroom_teacher', 'subject_teacher');

  delete from public.staff_school_assignments where user_id = v_user_id;
end;
$$;

commit;
