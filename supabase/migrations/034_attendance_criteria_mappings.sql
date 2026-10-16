-- Điểm danh phải có tiêu chí tự động để GVBM không phải tick thêm checkbox.
-- Áp dụng cho cả lớp đã tồn tại và lớp được tạo sau migration này.

create or replace function seed_default_criteria_for_class(target_class_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into criteria (class_id, code, category, name, severity, kind, points)
  values
    (target_class_id, 'TC08', 'Điểm danh', 'Vắng có phép', null, 'ADD', 0),
    (target_class_id, 'TC09', 'Điểm danh', 'Về sớm có phép', null, 'ADD', 0),
    (target_class_id, 'TC10', 'Điểm danh', 'Về sớm không phép', 'Nhẹ', 'DEDUCT', 1),
    (target_class_id, 'TC11', 'Học tập', 'Không xây dựng bài', 'Nhẹ', 'DEDUCT', 1),
    (target_class_id, 'TC12', 'Học tập', 'Không thuộc bài', 'Vừa', 'DEDUCT', 2),
    (target_class_id, 'TC13', 'Nề nếp', 'Nói chuyện trong giờ', 'Nhẹ', 'DEDUCT', 1),
    (target_class_id, 'TC14', 'Nề nếp', 'Không mặc đúng đồng phục', 'Nhẹ', 'DEDUCT', 2),
    (target_class_id, 'TC15', 'Lao động', 'Không trực nhật', 'Vừa', 'DEDUCT', 3),
    (target_class_id, 'TC16', 'Nề nếp', 'Làm việc riêng trong giờ', 'Vừa', 'DEDUCT', 2),
    (target_class_id, 'TC17', 'Nề nếp', 'Mang điện thoại trái quy định', 'Nhẹ', 'DEDUCT', 2),
    (target_class_id, 'TC18', 'Nề nếp', 'Sử dụng điện thoại trong giờ', 'Vừa', 'DEDUCT', 5),
    (target_class_id, 'TC19', 'Học tập', 'Giơ tay phát biểu xây dựng bài', 'Tích cực', 'ADD', 1),
    (target_class_id, 'TC20', 'Học tập', 'Trả lời đúng/xây dựng bài tốt', 'Tích cực', 'ADD', 2),
    (target_class_id, 'TC21', 'Học tập', 'Đạt một hoa điểm 10', 'Thành tích', 'ADD', 2),
    (target_class_id, 'TC22', 'Học tập', 'Đạt từ 3 hoa điểm 10 trong tuần', 'Thành tích', 'ADD', 5),
    (target_class_id, 'TC23', 'Nề nếp', 'Có tiến bộ rõ rệt trong tuần', 'Tích cực', 'ADD', 3),
    (target_class_id, 'TC24', 'Tập thể', 'Hoàn thành tốt nhiệm vụ được giao', 'Tích cực', 'ADD', 2),
    (target_class_id, 'TC25', 'Tập thể', 'Tích cực hỗ trợ lớp hoặc bạn bè', 'Tích cực', 'ADD', 2),
    (target_class_id, 'TC26', 'Điểm danh', 'Đi muộn', 'Nhẹ', 'DEDUCT', 1),
    (target_class_id, 'TC27', 'Điểm danh', 'Vắng không phép', 'Vừa', 'DEDUCT', 3),
    (target_class_id, 'TC28', 'Điểm danh', 'Bỏ tiết', 'Vừa', 'DEDUCT', 3)
  on conflict (class_id, code) do nothing;

  insert into event_criteria_mappings (class_id, event_type_id, criteria_id)
  select target_class_id, event_type.id, criteria.id
  from (values
    ('ATTENDANCE_LATE', 'TC26'),
    ('ATTENDANCE_ABSENT_UNEXCUSED', 'TC27'),
    ('ATTENDANCE_LEFT_EARLY', 'TC10')
  ) as mapping(event_code, criteria_code)
  join event_types event_type on event_type.code = mapping.event_code
  join criteria on criteria.class_id = target_class_id and criteria.code = mapping.criteria_code
  on conflict do nothing;
end;
$$;

select seed_default_criteria_for_class(id) from classes;
