-- 부서 담당자가 직접 확정(2026-10-27 사용자 결정 — 과제 원장의 제출·성과관리팀 확정 단계와 보고서 제출 단계를 부서 「확정」 하나로).
-- ① 과제 원장(cards): 부서 담당자도 자기 담당(can_write_card — 지정된 활성 카드) 카드를 고칠 수 있게 하되, 트리거(guard_card)가
--    내용(data)과 그에 따르는 칸(title·data_rev·updated_by·original_html)만 바뀌게 지킴. 나머지 열(id·uid·task_no·eval_unit_id·team_id·hq·edition·
--    status·retired_*·fixed_locked_*·layout·stage·progress·work_status·created_at·updated_at …)은 못 바꿈 — 열 이름을 나열하지 않고 「허용한 열을 뺀 나머지 전부」를
--    비교하므로 나중에 열이 늘어도 막힌 쪽. data의 식별 칸(id·group·taskNo)도 못 바꿈(lib/cards/edit.ts checkEditable과 같은 뜻).
--    data_rev는 내용이 바뀔 때 정확히 1 오르고(성과관리팀 저장의 개정 번호 대조가 깨지지 않게), updated_by는 본인.
--    고정 영역이 확정된 카드는 그 영역(주요사업 act·plan·kpi / 경영관리 feedback·findings·kpi — guard_card_version과 같은 규칙)을 못 바꿈.
--    original_html(원본 양식 조각)은 부서가 값을 넣지 못하고(다른 값이면 거절 — 저장형 XSS 차단), 내용이 바뀌면 트리거가 비움(null = 낡음 —
--    화면은 data를 같은 렌더러로 그려 쓰고 lib/cards/queries.ts getCardForEdit, 성과관리팀이 원장을 저장하면 다시 채워짐).
-- ② 작성본(card_versions): 부서 담당자도 자기 작성 중(draft) 작성본을 확정(confirmed)으로 — 확정자 = 본인, 확정 시각 채움.
--    처음부터 확정으로 넣기·제출한 작성본 확정·남의 이름 확정·확정 정보만 바꾸기는 여전히 거절. 확정한 작성본은 RLS(card_versions_update)가 부서 쓰기를 막음.
-- ③ 수정 이력(card_edits): 쓸 수 있는 카드(can_write_card)에 본인 이름으로 넣기(부서 확정 기록 — 성과관리팀은 원장 이력에서 봄).
-- ④ 보고서(reports): 전이 표에 작성 중 → 승인(부서 「확정」)·승인 → 작성 중(부서 「확정 취소」 — 메모 없음)을 모두에게 더함(TS lib/reports/model.ts canMove와 같은 목록).
--    작성 중 → 제출·제출 → 작성 중·제출 → 승인(성과관리팀)은 남은 제출 행과 예전 흐름을 위해 그대로 둠(화면은 더 이상 제출을 권하지 않음).
--    부서는 확정 때 승인자 = 본인·승인 시각을 함께 남기고, 확정 취소 때 둘 다 비움 — 그 밖의 승인 정보 변경과 검토 정보(review_*)는 여전히 성과관리팀만.
--    확정(승인)한 보고서의 내용(inputs·blocks)은 부서가 못 고침(확정 취소 뒤 고침 — 과제별 초안 잠금 report_locked는 예전처럼 제출·승인 둘 다).
-- 과제 매칭 작업 등록(can_enqueue_prep = can_write_card)은 부서 확정에서도 이미 통과하므로 바꾸지 않음.
--
-- 되돌리기(down):
--   drop trigger cards_guard on public.cards; drop function private.guard_card();
--   drop policy cards_dept_update on public.cards; drop policy card_edits_dept_insert on public.card_edits;
--   guard_card_version은 20261010120000_card_version_ids_last_admin.sql, report_transition_ok·guard_report는 20261010110000_report_inspection_guards.sql의 정의로 create or replace.
--   (부서가 확정한 작성본·이력·원장 내용·승인 보고서 행은 그대로 남음 — 지우지 않음. 비운 original_html은 성과관리팀이 그 카드를 저장하면 다시 채워짐)

-- ① 과제 원장
create policy cards_dept_update on public.cards for update to authenticated
  using (private.can_write_card(id))
  with check (private.can_write_card(id));

create or replace function private.guard_card()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed constant text[] := array['data', 'title', 'data_rev', 'updated_by', 'original_html'];
  locked_new jsonb;
  locked_old jsonb;
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff() then
    if (to_jsonb(new) - allowed) is distinct from (to_jsonb(old) - allowed) then
      raise exception '부서 담당자는 카드 내용만 바꿀 수 있습니다(과제 식별·상태·팀·보관·고정 영역 잠금·원본 배치·운영 값은 성과관리팀)';
    end if;
    if (new.data ->> 'id', new.data ->> 'group', new.data ->> 'taskNo') is distinct from (old.data ->> 'id', old.data ->> 'group', old.data ->> 'taskNo') then
      raise exception '카드의 과제 식별 값(id·group·taskNo)은 바꿀 수 없습니다';
    end if;
    if new.updated_by is distinct from (select auth.uid()) then
      raise exception '원장을 고친 사람(updated_by)은 본인이어야 합니다';
    end if;
    if new.data_rev is distinct from (case when new.data is distinct from old.data then old.data_rev + 1 else old.data_rev end) then
      raise exception '원장 개정 번호(data_rev)는 내용이 바뀔 때 1만 오릅니다';
    end if;
    -- 고정 영역이 확정된 카드: 그 영역은 원장 값 그대로(성과관리팀이 확정·관리)
    if old.fixed_locked_at is not null then
      if coalesce(old.data ->> 'group', '') ~ '^경영관리[0-9]+$' then
        locked_new := jsonb_build_object('feedback', new.data -> 'feedback', 'findings', new.data -> 'findings', 'kpi', new.data -> 'kpi');
        locked_old := jsonb_build_object('feedback', old.data -> 'feedback', 'findings', old.data -> 'findings', 'kpi', old.data -> 'kpi');
      else
        locked_new := jsonb_build_object('act', new.data -> 'act', 'plan', new.data -> 'plan', 'kpi', new.data -> 'kpi');
        locked_old := jsonb_build_object('act', old.data -> 'act', 'plan', old.data -> 'plan', 'kpi', old.data -> 'kpi');
      end if;
      if locked_new is distinct from locked_old then
        raise exception '고정 영역이 확정된 카드입니다 — 고정 영역은 성과관리팀만 바꿀 수 있습니다';
      end if;
    end if;
    -- 원본 양식 조각: 부서는 값을 넣지 못함(화면에 HTML로 쓰일 수 있는 칸), 내용이 바뀌면 낡은 조각을 비움
    if new.original_html is distinct from old.original_html and new.original_html is not null then
      raise exception '원본 양식 조각(original_html)은 부서 담당자가 넣을 수 없습니다';
    end if;
    if new.data is distinct from old.data then
      new.original_html := null;
    end if;
  end if;
  return new;
end;
$$;

-- 수정일자 트리거(cards_touch)보다 먼저 돎(같은 시점 트리거는 이름 순) — 부서가 보낸 updated_at을 그대로 비교해 직접 바꾸기를 막음
create trigger cards_guard before update on public.cards
  for each row execute function private.guard_card();

-- ② 작성본: 20261010120000의 정의에서 「부서 확정」만 더함
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
      -- 부서 확정(2026-10-27): 작성 중인 자기 카드 작성본만, 확정자 = 본인·확정 시각 채움
      if tg_op = 'INSERT' or old.status is distinct from 'draft' then
        raise exception '부서 확정은 작성 중인 작성본에서만 합니다(새 작성본을 확정으로 넣거나 제출한 작성본을 확정하는 일은 성과관리팀)';
      end if;
      if new.confirmed_by is distinct from (select auth.uid()) or new.confirmed_at is null then
        raise exception '작성본을 확정할 때는 확정자(본인)와 확정 시각을 함께 남깁니다';
      end if;
    elsif tg_op = 'UPDATE' and (new.confirmed_by, new.confirmed_at) is distinct from (old.confirmed_by, old.confirmed_at) then
      raise exception '확정 정보는 성과관리팀만 바꿀 수 있습니다';
    end if;
    if tg_op = 'UPDATE' and old.status = 'submitted' and new.data is distinct from old.data then
      raise exception '제출한 작성본은 제출을 취소한 뒤 고칠 수 있습니다';
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

-- ③ 수정 이력: 부서 확정 기록(성과관리팀 정책 card_edits_insert는 그대로)
create policy card_edits_dept_insert on public.card_edits for insert to authenticated
  with check (private.can_write_card(card_id) and edited_by = (select auth.uid()));

-- ④ 보고서 전이 표·가드
create or replace function private.report_transition_ok(p_old text, p_new text, p_staff boolean)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_old, p_new) in (('preparing', 'drafting'), ('drafting', 'submitted'), ('submitted', 'drafting'), ('drafting', 'approved'), ('approved', 'drafting'))
      or (p_staff and (p_old, p_new) in (('submitted', 'approved')));
$$;

create or replace function private.guard_report()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if not private.is_staff() then
      if (new.eval_unit_id, new.year, new.team_id, new.created_by, new.review_note, new.reviewed_at, new.reviewed_by)
         is distinct from (old.eval_unit_id, old.year, old.team_id, old.created_by, old.review_note, old.reviewed_at, old.reviewed_by) then
        raise exception '보고서 식별 값·검토 정보는 성과관리팀만 바꿀 수 있습니다';
      end if;
      -- 부서 확정(작성 중 → 승인): 승인자 = 본인·승인 시각을 함께. 확정 취소(승인 → 작성 중): 둘 다 비움. 그 밖에는 승인 정보를 못 바꿈
      if old.status = 'drafting' and new.status = 'approved' then
        if new.approved_by is distinct from (select auth.uid()) or new.approved_at is null then
          raise exception '보고서를 확정할 때는 승인자(본인)와 승인 시각을 함께 남깁니다';
        end if;
      elsif old.status = 'approved' and new.status = 'drafting' then
        if new.approved_at is not null or new.approved_by is not null then
          raise exception '확정을 취소할 때는 승인 정보를 비웁니다';
        end if;
      elsif (new.approved_at, new.approved_by) is distinct from (old.approved_at, old.approved_by) then
        raise exception '승인 정보는 부서 확정·확정 취소 때만 바뀝니다(그 밖에는 성과관리팀)';
      end if;
      if old.status = 'submitted' and (new.inputs, new.blocks) is distinct from (old.inputs, old.blocks) then
        raise exception '제출한 보고서는 제출을 취소한 뒤 고칠 수 있습니다';
      end if;
      if old.status = 'approved' and (new.inputs, new.blocks) is distinct from (old.inputs, old.blocks) then
        raise exception '확정(승인)한 보고서는 확정을 취소한 뒤 고칠 수 있습니다';
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
