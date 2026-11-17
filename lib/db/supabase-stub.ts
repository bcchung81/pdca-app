// 마이그레이션 시험(PGlite)용 Supabase 최소 흉내: 역할·auth·storage 스키마·public 기본 권한. 호스티드 Supabase가 기본으로 제공하는 것만 담음

export const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
create schema storage;
create table storage.buckets (id text primary key, name text not null, public boolean not null default false, file_size_limit bigint);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id), name text not null, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable
  as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
-- 호스티드 Supabase의 public 스키마 기본 권한(마이그레이션을 돌리는 postgres가 만드는 표·함수·시퀀스에 anon·authenticated·service_role 전부).
-- 이것이 없으면 시험이 운영보다 좁은 권한에서 돌아, 마이그레이션이 회수를 빠뜨려도 시험이 잡지 못함(2026-11-17 근본책 0단계 — 운영과 같게)
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;
