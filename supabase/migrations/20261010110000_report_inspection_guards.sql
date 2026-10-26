-- 보고서 상태 전이·점검표 확인 뒤 잠금을 DB에서도(2026-10-10 개선 계획 P1-1·P1-2 — docs/plan/코드-개선-계획.md).
-- ① 보고서: 예전 guard_report는 부서의 승인·식별값만 막아 성과관리팀은 아무 전이나(준비 → 승인처럼 제출을 건너뛰는 것까지) 할 수 있었음.
--    이제 로그인 사용자(성과관리팀 포함)는 전이 표 안에서만 — TS lib/reports/model.ts canMove와 같은 목록(준비 → 작성 중은 첫 초안 트리거 report_drafting_on_draft가 씀,
--    성과관리팀만 제출 → 승인·승인 → 작성 중(승인 취소)). 서비스 키(적재·관리 스크립트)는 막지 않음.
-- ② 점검표: 예전 guard_inspection_ack는 부서의 내용 변경만 막아, 부서가 확인한 점검표도 성과관리팀이 직접 호출로 고칠 수 있었음. 이제 확인한 점검표는 누구도(서비스 키 제외).
-- 되돌리기(down): 아래 두 함수를 20260927170000_report_dept_submit.sql·20260925090200_rls.sql의 본문으로 되돌리고 private.report_transition_ok를 지움.

create or replace function private.report_transition_ok(p_old text, p_new text, p_staff boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_old, p_new) in (('preparing', 'drafting'), ('drafting', 'submitted'), ('submitted', 'drafting'))
      or (p_staff and (p_old, p_new) in (('submitted', 'approved'), ('approved', 'drafting')));
$$;

create or replace function private.guard_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not private.is_staff() then
      if (new.eval_unit_id, new.year, new.team_id, new.approved_at, new.approved_by, new.created_by, new.review_note, new.reviewed_at, new.reviewed_by)
         is distinct from (old.eval_unit_id, old.year, old.team_id, old.approved_at, old.approved_by, old.created_by, old.review_note, old.reviewed_at, old.reviewed_by) then
        raise exception '보고서 식별 값·승인·검토 정보는 성과관리팀만 바꿀 수 있습니다';
      end if;
      if old.status = 'approved' or new.status = 'approved' then
        raise exception '승인은 성과관리팀만 합니다';
      end if;
      if old.status = 'submitted' and (new.inputs, new.blocks) is distinct from (old.inputs, old.blocks) then
        raise exception '제출한 보고서는 제출을 취소한 뒤 고칠 수 있습니다';
      end if;
    end if;
    -- 전이 표(부서용 안내가 먼저 나오게 뒤에서 — 성과관리팀도 표 밖 전이는 거절)
    if new.status is distinct from old.status and not private.report_transition_ok(old.status, new.status, private.is_staff()) then
      raise exception '보고서를 이 단계로 바꿀 수 없는 상태입니다(% → %)', old.status, new.status;
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.guard_inspection_ack()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if old.status = 'acknowledged' then
      raise exception '부서가 확인한 점검표는 고칠 수 없습니다';
    end if;
    if not private.is_staff()
       and (new.card_id, new.period, new.card_version_id, new.result, new.model, new.knowledge_keys, new.created_by)
           is distinct from (old.card_id, old.period, old.card_version_id, old.result, old.model, old.knowledge_keys, old.created_by) then
      raise exception '점검 결과 내용은 성과관리팀만 바꿀 수 있습니다';
    end if;
  end if;
  return new;
end;
$$;
