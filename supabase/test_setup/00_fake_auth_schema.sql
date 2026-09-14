create schema if not exists auth;
create extension if not exists pgcrypto;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid as $$
  select null::uuid
$$ language sql stable;

create or replace function auth.role() returns text as $$
  select 'authenticated'::text
$$ language sql stable;
