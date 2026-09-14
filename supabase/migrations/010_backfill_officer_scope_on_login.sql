-- =========================================================
-- 010_backfill_officer_scope_on_login.sql
-- Trường hợp GVCN chỉ định lớp trưởng/lớp phó/tổ trưởng TRƯỚC khi học
-- sinh đó có tài khoản đăng nhập: trigger ở 002_scope_mapping.sql chỉ
-- chạy tại thời điểm INSERT/UPDATE class_officers, nên nếu lúc đó chưa
-- có student_user_link thì scope bị bỏ qua vĩnh viễn. Trigger này backfill
-- lại toàn bộ scope đang active ngay khi student_user_link được tạo.
-- =========================================================

create or replace function backfill_scope_on_student_login()
returns trigger as $$
declare
  officer record;
begin
  for officer in
    select * from class_officers
    where student_id = new.student_id and status = 'active'
  loop
    if officer.position = 'class_monitor' then
      insert into user_class_scope (user_id, class_id, scope_role)
      values (new.user_id, officer.class_id, 'class_monitor')
      on conflict do nothing;
    elsif officer.position like 'vice_monitor%' then
      insert into user_class_scope (user_id, class_id, scope_role)
      values (new.user_id, officer.class_id, 'vice_monitor')
      on conflict do nothing;
    elsif officer.position = 'group_leader' and officer.group_id is not null then
      insert into user_group_scope (user_id, group_id, scope_role)
      values (new.user_id, officer.group_id, 'group_leader')
      on conflict do nothing;
    end if;
  end loop;
  return new;
end;
$$ language plpgsql;

create trigger trg_backfill_scope_on_student_login
  after insert on student_user_link
  for each row execute function backfill_scope_on_student_login();

comment on function backfill_scope_on_student_login is
  'Đảm bảo thứ tự "chỉ định cán bộ trước, tạo tài khoản sau" vẫn ra đúng quyền, '
  'không cần GVCN phải gán lại chức vụ sau khi học sinh có tài khoản.';
