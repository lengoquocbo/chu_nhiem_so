-- =========================================================
-- 009_profile_notification_links.sql
-- Phụ huynh cần liên kết tài khoản Zalo OA (qua OAuth follow) hoặc
-- Telegram (qua lệnh /start bot) trước khi nhận được thông báo qua kênh đó.
-- =========================================================

alter table profiles add column if not exists zalo_user_id text;
alter table profiles add column if not exists telegram_chat_id text;

comment on column profiles.zalo_user_id is 'Zalo OA user_id sau khi phụ huynh follow OA và xác thực (webhook follow event)';
comment on column profiles.telegram_chat_id is 'Telegram chat_id lấy được khi phụ huynh gõ /start với bot (webhook Telegram)';
