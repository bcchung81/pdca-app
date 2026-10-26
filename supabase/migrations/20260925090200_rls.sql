-- 권한(RLS)
--  부서 담당자: 자기 부서 카드(주관 부서면 그 주요사업 카드 전체 읽기)와 그 카드의 작성본·전용 자료·보낸 점검 결과
--  성과관리팀·관리자: 전부. 역할·부서 지정은 관리자만
--  공통 지식: 로그인 사용자 읽기, 쓰기는 성과관리팀·관리자
-- 판정 함수는 private 스키마의 security definer 함수로 둡니다(profiles 정책의 재귀를 피함).

create or replace function private.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active
$$;

create or replace function private.my_team()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select p.team_id from public.profiles p where p.id = (select auth.uid()) and p.active
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() in ('pmo', 'admin'), false)
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.my_role() = 'admin', false)
$$;

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
    where c.id = p_card_id and private.my_team() is not null and c.team_id = private.my_team()
  )
$$;

-- 역할·부서·활성은 관리자만 바꿉니다(본인은 이름만).
-- 가드는 security invoker라 current_user가 호출 역할입니다: 앱 사용자 요청은 authenticated,
-- 적재 스크립트(서비스 키)는 service_role, SQL 편집기·마이그레이션은 postgres → 사용자 요청만 막습니다.
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and (new.role, new.team_id, new.active, new.id) is distinct from (old.role, old.team_id, old.active, old.id)
     and not private.is_admin() then
    raise exception '역할·부서·활성 상태는 관리자만 바꿀 수 있습니다';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile_update();

-- 작성본 확정은 성과관리팀·관리자만
create or replace function private.guard_card_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.status = 'confirmed'
     and (tg_op = 'INSERT' or old.status is distinct from 'confirmed')
     and not private.is_staff() then
    raise exception '작성본 확정은 성과관리팀만 할 수 있습니다';
  end if;
  return new;
end;
$$;

create trigger card_versions_guard before insert or update on public.card_versions
  for each row execute function private.guard_card_version();

-- 부서가 점검 결과를 '확인'할 때는 상태만 바꿉니다.
create or replace function private.guard_inspection_ack()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon')
     and not private.is_staff()
     and (new.card_id, new.period, new.card_version_id, new.result, new.model, new.knowledge_keys, new.created_by)
         is distinct from (old.card_id, old.period, old.card_version_id, old.result, old.model, old.knowledge_keys, old.created_by) then
    raise exception '점검 결과 내용은 성과관리팀만 바꿀 수 있습니다';
  end if;
  return new;
end;
$$;

create trigger inspections_guard before update on public.inspections
  for each row execute function private.guard_inspection_ack();

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- 권한 부여: anon은 없음, authenticated는 정책으로 거름, service_role은 적재용
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

alter table public.teams enable row level security;
alter table public.profiles enable row level security;
alter table public.eval_units enable row level security;
alter table public.cards enable row level security;
alter table public.card_versions enable row level security;
alter table public.card_materials enable row level security;
alter table public.inspections enable row level security;
alter table public.knowledge_documents enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_card_links enable row level security;
alter table public.task_map enable row level security;

-- 부서·평가 단위: 모두 읽기, 부서는 관리자·평가 단위(주관 부서 지정)는 성과관리팀도 씀
create policy teams_read on public.teams for select to authenticated using (true);
create policy teams_write on public.teams for all to authenticated using (private.is_admin()) with check (private.is_admin());
create policy eval_units_read on public.eval_units for select to authenticated using (true);
create policy eval_units_write on public.eval_units for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- 사용자
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin())
  with check (id = (select auth.uid()) or private.is_admin());

-- 카드 원장: 읽기는 카드 권한, 쓰기는 성과관리팀·관리자
create policy cards_read on public.cards for select to authenticated using (private.can_read_card(id));
create policy cards_write on public.cards for all to authenticated using (private.is_staff()) with check (private.is_staff());

-- 월별 작성본: 자기 부서 카드면 작성·제출, 확정은 트리거가 막음
create policy card_versions_read on public.card_versions for select to authenticated using (private.can_read_card(card_id));
create policy card_versions_insert on public.card_versions for insert to authenticated with check (private.can_write_card(card_id));
create policy card_versions_update on public.card_versions for update to authenticated
  using (private.can_write_card(card_id) and (status <> 'confirmed' or private.is_staff()))
  with check (private.can_write_card(card_id));
create policy card_versions_delete on public.card_versions for delete to authenticated
  using (private.is_staff() or (private.can_write_card(card_id) and status = 'draft'));

-- 카드 전용 자료: 그 카드 권한으로만
create policy card_materials_read on public.card_materials for select to authenticated using (private.can_read_card(card_id));
create policy card_materials_insert on public.card_materials for insert to authenticated with check (private.can_write_card(card_id));
create policy card_materials_delete on public.card_materials for delete to authenticated using (private.can_write_card(card_id));
create policy card_materials_update on public.card_materials for update to authenticated
  using (private.can_write_card(card_id)) with check (private.can_write_card(card_id));

-- 월간 점검: 성과관리팀이 만들고 보냄. 부서는 보낸 것만 보고 '확인'으로 바꿈
create policy inspections_staff on public.inspections for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy inspections_read on public.inspections for select to authenticated
  using (status <> 'draft' and private.can_read_card(card_id));
create policy inspections_ack on public.inspections for update to authenticated
  using (status = 'sent' and private.can_write_card(card_id))
  with check (status = 'acknowledged' and private.can_write_card(card_id));

-- 공통 지식
create policy knowledge_documents_read on public.knowledge_documents for select to authenticated using (true);
create policy knowledge_documents_write on public.knowledge_documents for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy knowledge_chunks_read on public.knowledge_chunks for select to authenticated using (true);
create policy knowledge_chunks_write on public.knowledge_chunks for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy knowledge_card_links_read on public.knowledge_card_links for select to authenticated using (private.can_read_card(card_id));
create policy knowledge_card_links_write on public.knowledge_card_links for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy task_map_read on public.task_map for select to authenticated using (private.can_read_card(card_id));
create policy task_map_write on public.task_map for all to authenticated using (private.is_staff()) with check (private.is_staff());
