-- 담당자 계정 관리·과제 담당자 매칭 (2026-09-30)
--  1) 성과관리팀이 부서 담당자 계정의 부서·활성(사용 중지)·이름을 관리 — 역할, 성과관리팀·관리자 행은 관리자만
--  2) 과제 담당자 card_assignees: 과제 × 담당자 n:m, 같은 팀 안에서만. 접근 범위는 여전히 팀 기준(can_read_card·can_write_card 그대로)
--  3) 권한 변경 기록 access_events
--  4) 데이터 정정: 방송콘텐츠진흥팀의 본부 표기(방송미디어부 → 방송미디어본부)

-- ── 1) 프로필 ──────────────────────────────────────────────────────────────────────────────
-- 정책: 본인 · 관리자 · (성과관리팀이 부서 담당자 행). 바꾼 뒤에도 부서 담당자로 남아야 함(with check)
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or private.is_admin() or (private.is_staff() and role = 'dept_user'))
  with check (id = (select auth.uid()) or private.is_admin() or (private.is_staff() and role = 'dept_user'));

-- 가드(security invoker — current_user가 호출 역할): 앱 사용자 요청(authenticated·anon)만 막고
-- 서비스 키(service_role)·마이그레이션(postgres)은 종전대로 통과.
--  · id·메일은 누구도 못 바꿈(메일은 엑셀 등록·계정 찾기의 열쇠)
--  · 역할·부서·활성은 관리자, 또는 성과관리팀이 「부서 담당자로 남는 부서 담당자(본인 아님)」의 부서·활성을 바꿀 때만
create or replace function private.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id is distinct from old.id or new.email is distinct from old.email then
      raise exception '계정 식별 값(id·메일)은 바꿀 수 없습니다';
    end if;
    if (new.role, new.team_id, new.active) is distinct from (old.role, old.team_id, old.active) and not private.is_admin() then
      if not (private.is_staff() and old.role = 'dept_user' and new.role = 'dept_user' and old.id <> (select auth.uid())) then
        raise exception '역할·부서·활성 상태는 관리자만 바꿀 수 있습니다(성과관리팀은 부서 담당자의 부서·활성만)';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on table public.profiles is '사용자. 역할은 관리자만, 부서 담당자의 부서·활성(사용 중지)은 성과관리팀도 바꿈';

-- ── 2) 과제 담당자 ─────────────────────────────────────────────────────────────────────────
create table public.card_assignees (
  card_id text not null references public.cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  assigned_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);
comment on table public.card_assignees is '과제 담당자(과제 × 부서 담당자, n:m). 같은 팀 안에서만 지정. 접근 권한은 팀 기준이고 이 표는 「누가 그 과제의 담당인가」';
create index card_assignees_user_idx on public.card_assignees (user_id);

-- 지정 조건: 활성 부서 담당자, 사용자의 팀 = 카드의 팀 (서비스 키로 쓸 때도 지킴)
create or replace function private.guard_card_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_active boolean;
  v_team bigint;
  v_card_team bigint;
begin
  select p.role, p.active, p.team_id into v_role, v_active, v_team from public.profiles p where p.id = new.user_id;
  select c.team_id into v_card_team from public.cards c where c.id = new.card_id;
  if v_role is distinct from 'dept_user' then
    raise exception '담당자는 부서 담당자 계정만 지정할 수 있습니다';
  end if;
  if v_active is not true then
    raise exception '사용 중지된 계정은 담당자로 지정할 수 없습니다';
  end if;
  if v_team is null or v_team is distinct from v_card_team then
    raise exception '담당자는 같은 부서(팀)의 과제에만 지정할 수 있습니다';
  end if;
  return new;
end;
$$;
create trigger card_assignees_guard before insert or update on public.card_assignees
  for each row execute function private.guard_card_assignee();

-- 사용자의 팀·역할이 바뀌거나 카드의 팀이 바뀌면 어긋난 지정은 지움(새 팀 기준 지정은 앱이 다시 채움)
create or replace function private.drop_assignees_on_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id or new.role is distinct from old.role then
    delete from public.card_assignees where user_id = new.id;
  end if;
  return null;
end;
$$;
create trigger profiles_drop_assignees after update of team_id, role on public.profiles
  for each row execute function private.drop_assignees_on_profile_change();

create or replace function private.drop_assignees_on_card_team_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.team_id is distinct from old.team_id then
    delete from public.card_assignees where card_id = new.id;
  end if;
  return null;
end;
$$;
create trigger cards_drop_assignees after update of team_id on public.cards
  for each row execute function private.drop_assignees_on_card_team_change();

-- ── 3) 권한 변경 기록 ──────────────────────────────────────────────────────────────────────
create table public.access_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  target_user_id uuid references auth.users (id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
comment on table public.access_events is '누가 누구의 계정·부서·활성·과제 담당을 바꿨나. action: user_added · user_updated · user_deactivated · user_restored · assigned · unassigned';
create index access_events_target_idx on public.access_events (target_user_id, created_at desc);

-- ── 권한·RLS ───────────────────────────────────────────────────────────────────────────────
alter table public.card_assignees enable row level security;
alter table public.access_events enable row level security;

-- 담당자 표: 성과관리팀·관리자는 전부 읽고 쓰고, 담당자는 자기 행만 읽음
create policy card_assignees_read on public.card_assignees for select to authenticated
  using (private.is_staff() or user_id = (select auth.uid()));
create policy card_assignees_write on public.card_assignees for all to authenticated
  using (private.is_staff()) with check (private.is_staff());

-- 기록: 성과관리팀·관리자가 읽고, 자기 이름으로만 남김(고치기·지우기 없음)
create policy access_events_read on public.access_events for select to authenticated using (private.is_staff());
create policy access_events_insert on public.access_events for insert to authenticated
  with check (private.is_staff() and actor_id = (select auth.uid()));

revoke all on public.card_assignees, public.access_events from anon, authenticated;
grant select, insert, delete on public.card_assignees to authenticated;
grant select, insert on public.access_events to authenticated;
grant all on public.card_assignees, public.access_events to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

-- ── 4) 데이터 정정 ─────────────────────────────────────────────────────────────────────────
-- 방송콘텐츠진흥팀의 본부는 「방송미디어본부」가 맞음(원본 표기 오기). 카드 본문·cards.hq는 원본이라 건드리지 않음. 여러 번 돌려도 같음
update public.teams set hq = '방송미디어본부' where name = '방송콘텐츠진흥팀' and hq = '방송미디어부';
