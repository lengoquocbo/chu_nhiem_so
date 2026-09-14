-- =========================================================
-- Tự tạo public.profiles khi Supabase Auth tạo tài khoản mới.
-- Đồng thời backfill các tài khoản Auth đã tồn tại trước migration này.
-- =========================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Người dùng'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_create_profile_on_auth_user on auth.users;
create trigger trg_create_profile_on_auth_user
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, full_name)
select
  id,
  coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(email, ''), '@', 1), ''),
    'Người dùng'
  )
from auth.users
on conflict (id) do nothing;

comment on function public.handle_new_auth_user() is
  'Tự tạo hồ sơ public.profiles cho tài khoản mới được tạo trong Supabase Auth.';
