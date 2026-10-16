-- System administrators are distinct from school principals.
-- Keep this migration separate from 031: PostgreSQL cannot use a newly
-- added enum label until the transaction adding it has committed.
alter type public.app_role add value if not exists 'system_admin';
