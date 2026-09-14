-- Tài khoản học sinh do nhà trường cấp phải đổi mật khẩu ở lần đăng nhập đầu.
alter table public.profiles
  add column if not exists must_change_password boolean not null default false;

-- Áp dụng cả với các tài khoản học sinh đã được tạo trước migration này.
update public.profiles p
set must_change_password = true
where exists (
  select 1
  from public.user_roles ur
  where ur.user_id = p.id and ur.role = 'student'
);

-- Client chỉ được đổi thông tin hồ sơ thông thường. Cờ bảo mật này chỉ backend
-- service_role được phép cập nhật sau khi đổi mật khẩu Auth thành công.
create or replace function public.protect_must_change_password()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
     and new.must_change_password is distinct from old.must_change_password then
    raise exception 'Không được tự thay đổi trạng thái bắt buộc đổi mật khẩu';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_must_change_password on public.profiles;
create trigger trg_protect_must_change_password
  before update of must_change_password on public.profiles
  for each row execute function public.protect_must_change_password();

comment on column public.profiles.must_change_password is
  'Bắt buộc tài khoản đổi mật khẩu trước khi truy cập chức năng nghiệp vụ.';

-- Khóa cả đường truy cập Supabase trực tiếp: khi cờ còn bật, các policy dùng
-- is_self_student() sẽ chưa cho tài khoản học sinh đọc dữ liệu nghiệp vụ.
create or replace function public.is_self_student(p_student_id uuid) returns boolean as $$
  select exists (
    select 1
    from public.student_user_link sul
    join public.profiles p on p.id = sul.user_id
    where sul.student_id = p_student_id
      and sul.user_id = auth.uid()
      and p.must_change_password = false
  );
$$ language sql stable security definer set search_path = public;
