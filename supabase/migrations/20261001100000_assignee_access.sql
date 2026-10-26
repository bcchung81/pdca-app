-- 과제 접근 범위를 「팀 기준」에서 「담당자 지정(card_assignees) 기준」으로 (2026-10-01)
--  · 성과관리팀·관리자: 모든 과제(그대로)
--  · 부서 담당자: 자기에게 지정된 과제만 읽고 씀(같은 팀이어도 지정되지 않은 과제는 안 보임)
--  · 주관 부서(eval_units.lead_team_id)의 「그 사업 카드 전체 읽기」 예외는 없앰 — 경평 초안의 사업 목차 줄은 별도 함수(report_outline_context)라 그대로 보임
--  · 기존 지정은 그대로 둔다(팀 전체 자동 채움을 되풀이하지 않음 — 일부러 줄인 지정을 되살리지 않기 위함).
--    그래서 이 마이그레이션을 적용하면 지정이 없는 부서 담당자는 과제가 안 보인다 → 적용 전 「사용자」 화면에서 담당 과제를 확인할 것
-- 카드에 딸린 표(작성본·점검 결과·전용 자료·과제별 초안 등)는 모두 can_read_card·can_write_card를 거치므로 함께 좁아진다.
-- 보고서(reports: 사업 × 부서)는 팀 단위 그대로.

create or replace function private.can_read_card(p_card_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or coalesce(
    private.my_role() = 'dept_user' and exists (
      select 1
      from public.card_assignees a
      join public.cards c on c.id = a.card_id
      where a.card_id = p_card_id
        and a.user_id = (select auth.uid())
        and c.status = 'active'
        and c.team_id = private.my_team()
    ),
    false
  )
$$;

create or replace function private.can_write_card(p_card_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff() or coalesce(
    private.my_role() = 'dept_user' and exists (
      select 1
      from public.card_assignees a
      join public.cards c on c.id = a.card_id
      where a.card_id = p_card_id
        and a.user_id = (select auth.uid())
        and c.status = 'active'
        and c.team_id = private.my_team()
    ),
    false
  )
$$;

comment on table public.card_assignees is '과제 담당자(과제 × 부서 담당자, n:m). 같은 팀 안에서만 지정. 부서 담당자는 여기 지정된 과제만 읽고 쓴다(can_read_card·can_write_card). 성과관리팀·관리자는 지정과 상관없이 모든 과제';
