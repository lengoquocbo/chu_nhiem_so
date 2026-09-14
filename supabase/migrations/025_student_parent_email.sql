-- Email nhận thông báo của phụ huynh được lưu cùng hồ sơ học sinh.
-- Cho phép null để không làm hỏng các hồ sơ cũ chưa bổ sung email.
alter table students
  add column if not exists parent_email text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_parent_email_format_check'
      and conrelid = 'students'::regclass
  ) then
    alter table students
      add constraint students_parent_email_format_check
      check (
        parent_email is null
        or parent_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      );
  end if;
end
$$;

comment on column students.parent_email is
  'Email phụ huynh/người giám hộ dùng để nhận báo cáo và thông báo của học sinh.';
