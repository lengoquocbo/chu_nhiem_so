-- Principals manage their own school's teachers through the trusted API.
-- They must not be able to grant principal/system_admin directly with an
-- authenticated Supabase client. The service role still bypasses RLS.
begin;

drop policy if exists school_principal_write on public.user_roles;

commit;
