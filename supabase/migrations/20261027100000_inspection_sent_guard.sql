-- 보낸 점검표도 DB에서 잠금(2026-10-27 입력 점검 — docs/plan/입력필수-점검-2026-10-27.md 문제 2).
-- 예전 guard_inspection_ack(20261010110000)는 확인한(acknowledged) 점검표만 막아, 부서에 보낸(sent) 점검표는 서버 액션(inspectionWriteBlock)만 지켰음
-- — 성과관리팀이 직접 호출하면 부서가 보고 있는 점검표 내용을 바꿀 수 있었음.
-- 이제 보낸 점검표는 상태만 바꿀 수 있음: 보내기 취소(sent → draft)와 부서 확인(sent → acknowledged, 누가 할 수 있는지는 RLS inspections_ack·inspections_staff 그대로).
-- 내용 열(card_id·period·card_version_id·result·model·knowledge_keys·created_by — 예전 트리거가 비교하던 목록)은 누구도 못 바꿈(서비스 키 제외).
-- 상태 메타 열은 updated_at뿐이고 inspections_touch가 채움(sent_at 같은 열은 없음). 확인한 점검표는 예전처럼 누구도 못 고침.
-- 보내기 조건(모든 행 판정·미흡 근거 등 — lib/inspections/model.ts readyToSend)은 jsonb 판정이라 DB로 옮기지 않음(서버 액션만).
-- 되돌리기(down): 아래 함수를 20261010110000_report_inspection_guards.sql의 guard_inspection_ack 본문으로 되돌림.

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
    if (new.card_id, new.period, new.card_version_id, new.result, new.model, new.knowledge_keys, new.created_by)
       is distinct from (old.card_id, old.period, old.card_version_id, old.result, old.model, old.knowledge_keys, old.created_by) then
      if not private.is_staff() then
        raise exception '점검 결과 내용은 성과관리팀만 바꿀 수 있습니다';
      end if;
      if old.status = 'sent' then
        raise exception '부서에 보낸 점검표는 보내기를 취소한 뒤 고칠 수 있습니다';
      end if;
    end if;
  end if;
  return new;
end;
$$;
