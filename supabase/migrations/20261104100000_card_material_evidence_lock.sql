-- 확정된 보고서의 근거 파일은 지우지 못하게(2026-11-04).
-- 보고서 추가자료는 이미 잠김(report_materials 지우기 = can_edit_report_content — 제출·승인 보고서는 부서가 못 지움)인데,
-- 카드 전용 자료(card_materials·버킷 card-materials)의 지우기는 카드 쓰기 권한(can_write_card)만 보아 보고서 확정과 무관했음.
-- 그래서 확정(제출·승인)한 보고서 초안이 근거로 쓴 카드 전용 자료를 지우면, 확정본의 숫자 근거 파일이 사라질 수 있었음.
--
-- 규칙: 자료가 「잠긴 보고서의 초안 근거」면 누구도(부서·성과관리팀·관리자) 지우지 못함 — 보고서 확정을 풀면 다시 지움.
--   잠김 = private.report_locked(카드, 연도)(20260927170000 — 그 카드 평가단위 × 팀 × 연도 보고서가 submitted·approved).
--   근거 = 그 카드 그 연도 card_report_drafts의 spec.sources 안 {"kind":"card","id":"<자료 id>"}
--          또는 구성안 outline.sources.card 배열 안의 자료 id(lib/reports/section.ts ReportSource·composition.ts Composition.sources).
-- private.card_material_locked(저장 경로)가 판정하고(storage_path는 unique — 행 정책과 저장소 객체 정책이 같은 함수를 씀),
-- card_materials_delete·card_materials_objects_delete 정책에 「잠긴 근거가 아님」을 더함. 서버 액션(deleteCardMaterial)도 같은 규칙으로 먼저 거절함
-- (lib/cards/material-lock.ts — 거절 문구·목록의 삭제 단추 끄기).
-- 관리자의 과제 영구 삭제(purgeCard → cards 삭제 → card_materials.card_id on delete cascade)는 RLS가 연쇄 삭제에 적용되지 않아 그대로 됨
-- (행 트리거를 쓰지 않은 까닭 — 20261103100000과 같음). lib/db/migrations.test.ts가 역할별로 확인함.
--
-- 운영 반영 순서: db:push를 배포보다 먼저(어느 쪽이 먼저여도 깨지지는 않음).
--   정책만 먼저 생기면 옛 코드의 삭제는 잠긴 근거일 때 0행으로 끝나 「지우지 못했습니다(자기 부서 카드만)」로 보임 — 잘못된 문구지만 자료는 지켜짐.
--   배포가 먼저면 새 코드가 서버에서 먼저 거절하므로 화면은 맞지만, 그 사이 API 직접 호출은 막히지 않음. 그래서 db:push 먼저.
--
-- 되돌리기(down):
--   drop policy card_materials_delete on public.card_materials;
--   create policy card_materials_delete on public.card_materials for delete to authenticated using (private.can_write_card(card_id));
--   drop policy card_materials_objects_delete on storage.objects;
--   create policy card_materials_objects_delete on storage.objects for delete to authenticated
--     using (bucket_id = 'card-materials' and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1])));
--   drop function private.card_material_locked(text);

create or replace function private.card_material_locked(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.card_materials m
    join public.card_report_drafts d on d.card_id = m.card_id
    where m.storage_path = p_storage_path
      and (
        coalesce(d.spec -> 'sources', '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('kind', 'card', 'id', m.id::text))
        or coalesce(d.outline -> 'sources' -> 'card', '[]'::jsonb) @> jsonb_build_array(to_jsonb(m.id::text))
      )
      and private.report_locked(d.card_id, d.year)
  )
$$;

comment on function private.card_material_locked(text) is '카드 전용 자료(저장 경로)가 잠긴(제출·승인) 보고서 초안·구성안의 근거인가 — 그러면 지우기 거절';
grant execute on function private.card_material_locked(text) to authenticated, service_role;

drop policy card_materials_delete on public.card_materials;
create policy card_materials_delete on public.card_materials for delete to authenticated
  using (private.can_write_card(card_id) and not private.card_material_locked(storage_path));

drop policy card_materials_objects_delete on storage.objects;
create policy card_materials_objects_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'card-materials'
    and private.can_write_card(private.card_id_by_uid((storage.foldername(name))[1]))
    and not private.card_material_locked(name)
  );
