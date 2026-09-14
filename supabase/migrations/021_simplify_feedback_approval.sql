-- Đơn giản hóa góp ý: GVCN chỉ duyệt hoặc không duyệt, không xử lý/phản hồi.
alter table anonymous_class_feedback drop constraint if exists anonymous_class_feedback_status_check;

update anonymous_class_feedback set status = case
  when status in ('reviewing', 'resolved') then 'approved'
  when status = 'new' then 'pending'
  else status
end;

alter table anonymous_class_feedback alter column status set default 'pending';
alter table anonymous_class_feedback
  add constraint anonymous_class_feedback_status_check
  check (status in ('pending', 'approved', 'rejected'));
