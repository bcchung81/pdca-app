-- 업무 규칙 이중화(2026-10-10 개선 계획 P2-5). 서버 액션에만 있던 두 규칙을 DB에서도 지킴 — API로 바로 쓰거나 액션의 읽고-쓰기 사이에 다른 요청이 끼어도.
-- 1) 작성본(card_versions)의 식별 칸: 새 작성본의 카드 JSON id·group·taskNo는 원장(cards.data)과 같아야 하고(원장을 읽을 수 없으면 RLS가 거절하도록 넘김),
--    고칠 때는 card_id와 그 세 칸을 바꿀 수 없음(앱 규칙 lib/cards/edit.ts checkEditable과 같은 뜻 — 성과관리팀·관리자도. 서비스 키·마이그레이션은 예외)
-- 2) 마지막 활성 관리자: 역할을 낮추거나 사용 중지해 활성 관리자가 0명이 되는 변경은 거절(app/(app)/users/actions.ts의 확인은 읽고-쓰기 경쟁이 있었음).
--    두 관리자가 동시에 서로를 낮추는 경쟁은 트랜잭션 잠금으로 줄을 세움. 서비스 키도 지킴(관리자 0명은 db:user로만 되살릴 수 있어서)
--
-- 되돌리기(down): guard_card_version은 20261009100000_mgmt_fixed_areas.sql, guard_profile_update는 20260930120000_users_assignees.sql의 정의로
-- create or replace 하고 private.other_active_admins를 drop.

create or replace function private.guard_card_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ledger jsonb;
  locked timestamptz;
  fixed jsonb;
begin
  if current_user in ('authenticated', 'anon') then
    select c.data, c.fixed_locked_at into ledger, locked from public.cards c where c.id = new.card_id;
    if tg_op = 'INSERT' and ledger is not null
       and (new.data ->> 'id', new.data ->> 'group', new.data ->> 'taskNo') is distinct from (ledger ->> 'id', ledger ->> 'group', ledger ->> 'taskNo') then
      raise exception '작성본의 과제 식별 값(id·group·taskNo)은 원장과 같아야 합니다';
    end if;
    if tg_op = 'UPDATE' and (new.card_id, new.data ->> 'id', new.data ->> 'group', new.data ->> 'taskNo') is distinct from (old.card_id, old.data ->> 'id', old.data ->> 'group', old.data ->> 'taskNo') then
      raise exception '작성본의 과제와 식별 값(id·group·taskNo)은 바꿀 수 없습니다';
    end if;
  end if;
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
      raise exception '작성본 확정은 성과관리팀만 할 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and old.status = 'submitted' and new.data is distinct from old.data then
      raise exception '제출한 작성본은 제출을 취소한 뒤 고칠 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) then
      raise exception '확정 정보는 성과관리팀만 바꿀 수 있습니다';
    end if;
    -- 고정 영역이 확정된 카드: 작성본의 고정 영역은 늘 원장 값(data·base 모두)
    if locked is not null then
      if coalesce(ledger ->> 'group', '') ~ '^경영관리[0-9]+$' then
        fixed := jsonb_build_object('feedback', ledger -> 'feedback', 'findings', ledger -> 'findings', 'kpi', ledger -> 'kpi');
      else
        fixed := jsonb_build_object('act', ledger -> 'act', 'plan', ledger -> 'plan', 'kpi', ledger -> 'kpi');
      end if;
      new.data := new.data || fixed;
      if new.base is not null then
        new.base := new.base || fixed;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- 이 계정 말고 활성 관리자 수(RLS와 상관없이 셈 — 트리거가 보는 사람 권한으로 돌아도 같은 답)
create or replace function private.other_active_admins(p_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from public.profiles p where p.role = 'admin' and p.active and p.id <> p_id
$$;
-- 트리거가 보는 사람 권한으로 부르므로 실행 권한이 필요(private 스키마는 API에 안 열림 — 20260925090200_rls.sql과 같은 방식)
grant execute on function private.other_active_admins(uuid) to authenticated, service_role;

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
  if old.role = 'admin' and old.active and (new.role is distinct from 'admin' or not new.active) then
    perform pg_advisory_xact_lock(hashtext('profiles:last-admin'));
    if private.other_active_admins(old.id) = 0 then
      raise exception '마지막 활성 관리자는 역할을 바꾸거나 사용을 중지할 수 없습니다. 다른 관리자를 먼저 지정해 주세요';
    end if;
  end if;
  return new;
end;
$$;
