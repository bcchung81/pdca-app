-- 경영관리 카드의 고정 영역(2026-10-09, 지침 08 「고정영역」): 전년도 환류(feedback)·지적 및 개선방안(findings)·계량 성과지표(kpi).
-- 주요사업 카드는 그대로 Act·Plan·계량지표(act·plan·kpi). 카드 종류는 카드 JSON의 묶음 id(group = 경영관리N)로 가름 —
-- 앱의 isMgmtCard(lib/cards/mgmt-card.ts)·fixedSectionsOf(lib/cards/fixed.ts)와 같은 기준. 예전 정의는 경영관리 작성본에 빈 act·plan 키를 덮어썼음.
-- 나머지 동작(부서 확정 금지·제출본 수정 금지·확정 정보 보호)은 20260925091400_concurrency.sql 그대로.

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
    select c.data, c.fixed_locked_at into ledger, locked from public.cards c where c.id = new.card_id;
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
