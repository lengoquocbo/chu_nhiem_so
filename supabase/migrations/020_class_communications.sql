-- Diễn đàn thông báo lớp, góp ý ẩn danh và trạng thái đã đọc.
create table class_forum_posts (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  content text not null check (char_length(trim(content)) between 1 and 5000),
  author_id uuid not null references profiles(id),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_class_forum_posts_class_created
  on class_forum_posts(class_id, created_at desc);

create table anonymous_class_feedback (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references classes(id) on delete cascade,
  author_id uuid not null references profiles(id),
  content text not null check (char_length(trim(content)) between 1 and 5000),
  status text not null default 'new' check (status in ('new','reviewing','resolved','rejected')),
  response text,
  responded_by uuid references profiles(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_anonymous_feedback_class_created
  on anonymous_class_feedback(class_id, created_at desc);

create table class_content_reads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  content_type text not null check (content_type in ('forum','feedback')),
  content_id uuid not null,
  read_at timestamptz not null default now(),
  unique(user_id, content_type, content_id)
);

create index idx_class_content_reads_user_type
  on class_content_reads(user_id, content_type);

alter table class_forum_posts enable row level security;
alter table anonymous_class_feedback enable row level security;
alter table class_content_reads enable row level security;

-- Các bảng này chỉ được thao tác qua API dùng service role. API chịu trách nhiệm
-- kiểm tra phạm vi lớp và không bao giờ trả author_id góp ý cho học sinh.
comment on table anonymous_class_feedback is
  'Danh tính người gửi chỉ được trả cho GVCN/Hiệu trưởng qua API quản trị.';
