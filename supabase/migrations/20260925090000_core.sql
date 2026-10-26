-- 기본 스키마: 부서·사용자·평가 단위·과제관리카드(원장·월별 작성본·카드 전용 자료)·월간 점검
-- 역할은 3개뿐입니다: 부서 담당자(dept_user) / 성과관리팀(pmo) / 관리자(admin)

create type public.app_role as enum ('dept_user', 'pmo', 'admin');
comment on type public.app_role is '부서 담당자 / 성과관리팀 / 관리자';

create schema if not exists private;
comment on schema private is '권한 판정·트리거 함수. Data API에 노출하지 않음';

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 부서(팀). 카드·사용자가 팀 단위로 묶입니다.
create table public.teams (
  id bigint generated always as identity primary key,
  name text not null unique,
  hq text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.teams is '부서(팀). hq는 본부';

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  email text,
  role public.app_role not null default 'dept_user',
  team_id bigint references public.teams (id),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is '사용자. 역할·부서는 관리자만 바꿈';
create index profiles_team_idx on public.profiles (team_id);
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();

-- 평가 단위: 주요사업(BZ-1~3), 공통지표(BZ-4), 경영관리 지표(MG-…), 가점(GA-n)
create table public.eval_units (
  id text primary key,
  track text not null check (track in ('주요사업', '경영관리', '가점')),
  card_group text unique,
  name text not null,
  name_2025 text,
  lead_team_id bigint references public.teams (id),
  sort integer not null default 0
);
comment on table public.eval_units is '평가 단위. lead_team_id는 주요사업 주관 부서(사업 공통 부분 작성)';

-- 과제관리카드 원장: 확정본 1장. 월별 작성은 card_versions
create table public.cards (
  id text primary key,
  uid uuid not null unique default gen_random_uuid(),
  eval_unit_id text not null references public.eval_units (id),
  task_no text not null,
  title text not null,
  team_id bigint references public.teams (id),
  hq text,
  edition text not null,
  data jsonb not null,
  original_html text,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  unique (eval_unit_id, task_no)
);
comment on column public.cards.id is '예: 주요사업1/1-가';
comment on column public.cards.uid is '파일 저장 경로용 ASCII 키(저장소 키에 한글을 쓰지 않음)';
comment on column public.cards.data is '구조화 카드(seed/cards/260916 biz-260916.json 한 장)';
comment on column public.cards.original_html is '9.16 원본 양식 조각(.kca-card). 화면은 항상 이 양식 그대로';
create index cards_team_idx on public.cards (team_id);
create trigger cards_touch before update on public.cards
  for each row execute function private.touch_updated_at();

create table public.card_versions (
  id bigint generated always as identity primary key,
  card_id text not null references public.cards (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft', 'submitted', 'confirmed')),
  data jsonb not null,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  confirmed_by uuid references auth.users (id),
  confirmed_at timestamptz,
  unique (card_id, period, version)
);
comment on table public.card_versions is '월별 작성본. 확정(confirmed)은 성과관리팀만';

create table public.card_materials (
  id uuid primary key default gen_random_uuid(),
  card_id text not null references public.cards (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  mime_type text,
  bytes bigint,
  sha256 text,
  parsed_text text,
  parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  uploaded_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
comment on table public.card_materials is '카드 전용 자료: 그 카드 안에서만 씀. 경로는 card-materials/{cards.uid}/{id}';
create index card_materials_card_idx on public.card_materials (card_id);

create table public.inspections (
  id bigint generated always as identity primary key,
  card_id text not null references public.cards (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  card_version_id bigint references public.card_versions (id),
  status text not null default 'draft' check (status in ('draft', 'sent', 'acknowledged')),
  result jsonb not null default '{}'::jsonb,
  model text,
  knowledge_keys text[] not null default '{}',
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (card_id, period)
);
comment on table public.inspections is '월간 종합점검 결과. 근거는 확정 카드 + 종합점검 자료(knowledge_keys)만';
create trigger inspections_touch before update on public.inspections
  for each row execute function private.touch_updated_at();

-- 가입하면 프로필을 만듭니다(역할 dept_user, 부서 미지정 → 관리자가 지정)
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();
