-- Phân công giáo viên bộ môn theo đúng lớp - học kỳ.
-- Các bản ghi cũ được gắn vào học kỳ đang hoạt động (hoặc học kỳ đầu tiên)
-- của lớp để không làm mất dữ liệu hiện hữu.

alter table public.class_subject_teachers
  add column if not exists class_academic_term_id uuid
  references public.class_academic_terms(id) on delete cascade;

update public.class_subject_teachers assignment
set class_academic_term_id = (
  select cat.id
  from public.class_academic_terms cat
  join public.academic_terms term on term.id = cat.academic_term_id
  where cat.class_id = assignment.class_id
  order by case when term.status = 'active' then 0 else 1 end, term.term_number
  limit 1
)
where assignment.class_academic_term_id is null;

alter table public.class_subject_teachers
  drop constraint if exists class_subject_teachers_class_id_teacher_id_subject_id_key;

create unique index if not exists uq_subject_teacher_class_term
  on public.class_subject_teachers(class_academic_term_id, teacher_id, subject_id)
  where class_academic_term_id is not null;

create unique index if not exists uq_subject_teacher_legacy_scope
  on public.class_subject_teachers(class_id, teacher_id, subject_id)
  where class_academic_term_id is null;

create index if not exists idx_subject_teacher_term
  on public.class_subject_teachers(class_academic_term_id, teacher_id, status);

create or replace function public.validate_subject_teacher_term()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  scoped_class_id uuid;
begin
  if new.class_academic_term_id is null then
    raise exception 'Phân công giáo viên bộ môn phải thuộc một học kỳ';
  end if;

  select class_id into scoped_class_id
  from public.class_academic_terms
  where id = new.class_academic_term_id;

  if scoped_class_id is null or scoped_class_id <> new.class_id then
    raise exception 'Học kỳ phân công không thuộc lớp đã chọn';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_subject_teacher_term on public.class_subject_teachers;
create trigger trg_validate_subject_teacher_term
  before insert or update of class_id, class_academic_term_id
  on public.class_subject_teachers
  for each row execute function public.validate_subject_teacher_term();

comment on column public.class_subject_teachers.class_academic_term_id is
  'Phạm vi lớp - học kỳ của phân công GVBM; quyền ghi bị khóa khi học kỳ không active.';
