-- 과제관리카드 현행화(한글 파일 → 원장)와 카드 보관(삭제)
-- 1) card_imports: 올린 한글 파일 묶음(원본은 비공개 버킷 card-imports/{id}/{n}.{hwp|hwpx})
--    scope ledger = 성과관리팀이 원장에 반영 / draft = 부서가 자기 카드 작성본에 반영
-- 2) card_import_items: 파일에서 읽은 카드 한 장씩(매칭 결과·반영 상태). 비교(diff)는 화면에서 원장과 다시 계산
-- 3) 카드 보관: cards.status = 'retired'(목록·부서·AI·점검에서 빠짐, 성과관리팀이 복원). 부서는 보관 카드를 못 봄
-- 4) 현행화로 들어온 그림: card-originals/{cards.uid}/imp{묶음}-{파일}. 부서도 자기 카드 작성본용으로 올릴 수 있음

create table public.card_imports (
  id bigint generated always as identity primary key,
  scope text not null default 'ledger' check (scope in ('ledger', 'draft')),
  target_card_id text references public.cards (id) on delete cascade,
  files jsonb not null default '[]'::jsonb,
  status text not null default 'uploading' check (status in ('uploading', 'parsed', 'closed')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (scope = 'ledger' or target_card_id is not null)
);
comment on table public.card_imports is '카드 현행화용으로 올린 한글 파일 묶음. files = [{n, name, type, bytes, path, cards, error}]';
create index card_imports_created_idx on public.card_imports (created_at desc);

create table public.card_import_items (
  id bigint generated always as identity primary key,
  import_id bigint not null references public.card_imports (id) on delete cascade,
  file_n integer not null,
  seq integer not null,
  task_no text,
  title text,
  group_id text,
  parsed jsonb not null,
  match text not null check (match in ('exact', 'uncertain', 'none')),
  match_reason text,
  card_id text references public.cards (id) on delete set null,
  candidates jsonb not null default '[]'::jsonb,
  new_uid uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'applied', 'skipped', 'failed')),
  result jsonb,
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  unique (import_id, file_n, seq)
);
comment on table public.card_import_items is '현행화 파일에서 읽은 카드. parsed = 카드 JSON(그림은 card-originals 경로), new_uid = 원장에 없어 새로 등록할 때 쓸 uid';
create index card_import_items_card_idx on public.card_import_items (card_id);

-- 카드 보관(삭제)
alter table public.cards
  add column retired_at timestamptz,
  add column retired_by uuid references auth.users (id),
  add column retired_reason text;

-- 부서는 보관한 카드를 읽고 쓰지 못함(성과관리팀·관리자는 보관함에서 봄)
create or replace function private.can_read_card(p_card_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1
    from public.cards c
    join public.eval_units u on u.id = c.eval_unit_id
    where c.id = p_card_id
      and c.status = 'active'
      and private.my_team() is not null
      and (c.team_id = private.my_team() or u.lead_team_id = private.my_team())
  )
$$;

create or replace function private.can_write_card(p_card_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1 from public.cards c
    where c.id = p_card_id and c.status = 'active' and private.my_team() is not null and c.team_id = private.my_team()
  )
$$;

-- 현행화 묶음을 쓸 수 있나: 성과관리팀·관리자, 또는 자기가 만든 부서 작성본용 묶음
create or replace function private.can_use_import(p_import_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or exists (
    select 1 from public.card_imports i
    where i.id = p_import_id and i.created_by = auth.uid() and i.scope = 'draft' and private.can_write_card(i.target_card_id)
  )
$$;

create or replace function private.import_id_from_path(p_name text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when (storage.foldername(p_name))[1] ~ '^\d{1,18}$' then ((storage.foldername(p_name))[1])::bigint end
$$;

alter table public.card_imports enable row level security;
alter table public.card_import_items enable row level security;

create policy card_imports_read on public.card_imports for select to authenticated
  using (private.is_staff() or created_by = (select auth.uid()));
create policy card_imports_insert on public.card_imports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (private.is_staff() or (scope = 'draft' and private.can_write_card(target_card_id)))
  );
create policy card_imports_update on public.card_imports for update to authenticated
  using (private.can_use_import(id))
  with check (private.can_use_import(id));
create policy card_imports_delete on public.card_imports for delete to authenticated
  using (private.is_staff());

create policy card_import_items_read on public.card_import_items for select to authenticated
  using (private.can_use_import(import_id));
create policy card_import_items_write on public.card_import_items for all to authenticated
  using (private.can_use_import(import_id))
  with check (private.can_use_import(import_id));

-- 원본 파일 버킷: card-imports/{묶음 id}/{n}.{hwp|hwpx}
insert into storage.buckets (id, name, public, file_size_limit)
values ('card-imports', 'card-imports', false, 31457280)
on conflict (id) do nothing;

create policy card_imports_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'card-imports' and private.can_use_import(private.import_id_from_path(name)));
create policy card_imports_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'card-imports' and private.can_use_import(private.import_id_from_path(name)));
create policy card_imports_objects_delete on storage.objects for delete to authenticated
  using (bucket_id = 'card-imports' and private.is_staff());

-- 현행화 그림: 부서도 자기 카드 폴더에 imp로 시작하는 새 파일만 올림(덮어쓰기·지우기는 성과관리팀)
create policy card_originals_objects_import on storage.objects for insert to authenticated
  with check (
    bucket_id = 'card-originals'
    and storage.filename(name) like 'imp%'
    and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1]))
  );

grant execute on all functions in schema private to authenticated, service_role;
revoke all on public.card_imports, public.card_import_items from anon;
grant select, insert, update, delete on public.card_imports, public.card_import_items to authenticated;
grant all on public.card_imports, public.card_import_items to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
