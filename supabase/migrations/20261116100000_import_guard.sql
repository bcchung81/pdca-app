-- 현행화 묶음·항목 위조 막기(2026-11-16 웹 취약점 점검).
-- 로그인 사용자는 공개 키 + 자기 토큰으로 PostgREST에 직접 쓸 수 있음. 예전 정책 card_imports_update는 private.can_use_import(id)만 봤는데
-- 이 함수(security definer)는 표를 다시 읽어 「바뀌기 전 행」으로 판정하므로, 부서 담당자가 자기 부서 작성본용(draft) 묶음의
-- scope를 'ledger'로·target_card_id를 null로·created_by를 다른 사람으로 바꿀 수 있었음. card_import_items_write도 card_id를 보지 않아
-- draft 묶음에 다른 팀 카드 항목을 넣을 수 있었음. 그 뒤 성과관리팀이 /cards/import에서 「전체 반영」(applySafeImportItems — scope ledger·
-- 확정 매칭·위험 없음이면 반영)을 누르면 다른 팀 카드 원장이 덮어써짐.
--
-- ① card_imports 갱신 가드(before update): 성과관리팀·관리자가 아니면 scope·target_card_id·created_by·created_at을 못 바꿈
--    (앱의 부서 흐름은 files·status만 고침 — app/(app)/cards/import/actions.ts startCardImport·parseCardImport).
-- ② card_import_items 가드(before insert or update):
--    · 성과관리팀·관리자가 아니면 부모 묶음이 draft일 때 card_id는 그 묶음의 target_card_id(또는 null)만.
--      앱은 draft 묶음을 대상 카드 하나로만 매칭하므로(parseCardImport — matchCard(…, [대상 카드]), 다른 과제면 대상 카드로 「불확실」)
--      항목의 card_id는 늘 target_card_id임. null은 카드가 지워질 때 on delete set null이 쓰는 값이라 허용(그 항목은 반영할 카드가 없어 무해).
--    · 누구도(서비스 키·마이그레이션 제외) import_id를 다른 묶음으로 옮기지 못함 — 앱은 import_id를 고치지 않음.
-- 가드는 security invoker(current_user가 호출 역할 — 20260925090200_rls.sql 주석)라 서비스 키(service_role)·마이그레이션(postgres)은 통과.
--
-- 운영 반영 순서: 순서 무관(앱은 막히는 쓰기를 하지 않음). db:push만 하면 됨.
--
-- 되돌리기(down):
--   drop trigger card_import_items_guard on public.card_import_items; drop function private.guard_card_import_item();
--   drop trigger card_imports_guard on public.card_imports; drop function private.guard_card_import();

create or replace function private.guard_card_import()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and not private.is_staff()
     and (new.scope, new.target_card_id, new.created_by, new.created_at) is distinct from (old.scope, old.target_card_id, old.created_by, old.created_at) then
    raise exception '현행화 묶음의 범위·대상 카드·만든 사람은 성과관리팀만 바꿀 수 있습니다';
  end if;
  return new;
end;
$$;
create trigger card_imports_guard before update on public.card_imports
  for each row execute function private.guard_card_import();

create or replace function private.guard_card_import_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_scope text;
  v_target text;
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'UPDATE' and new.import_id is distinct from old.import_id then
      raise exception '현행화 항목을 다른 묶음으로 옮길 수 없습니다';
    end if;
    if not private.is_staff() then
      -- 부모 묶음은 쓰기 정책(can_use_import)상 자기 묶음이라 사용자 권한으로 읽힘
      select i.scope, i.target_card_id into v_scope, v_target from public.card_imports i where i.id = new.import_id;
      if v_scope = 'draft' and new.card_id is not null and new.card_id is distinct from v_target then
        raise exception '부서 작성본용 현행화 항목은 그 묶음의 대상 카드에만 둘 수 있습니다';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger card_import_items_guard before insert or update on public.card_import_items
  for each row execute function private.guard_card_import_item();
