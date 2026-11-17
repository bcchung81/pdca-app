-- 앱 서버 경유 표지를 경평 초안 표 3개의 쓰기 정책에 겁니다(근본책 1단계 B, 2026-11-17).
--   card_report_drafts(과제별 초안·구성안 — 없는 숫자·경고·판면 같은 판정값이 함께 저장됨)
--   report_draft_edits(블록 고치기 이력 — 되돌리기가 이력 행으로 블록을 되씀)
--   eval_unit_report_parts(지표 단위 부분 — 칸 글과 출처 표시)
-- 이 표의 쓰기는 모두 서버 액션(lib/reports/draft-store.ts saveDraftRow·saveUnitPartRow, app/(app)/reports/cards/edit-actions.ts)이
-- 검증·다시 점검한 뒤에 하므로, 표지(private.app_write())가 없는 쓰기 = 앱 밖 직접 쓰기로 보고 거절합니다.
-- 읽기 정책은 그대로입니다. FOR ALL 정책은 삽입·갱신·삭제로 나눕니다(행 판정은 예전과 같은 함수).
--   갱신은 WITH CHECK에 표지를 넣어 표지 없는 갱신이 0행으로 조용히 지나가지 않고 RLS 오류로 거절되게 합니다. 삭제는 USING(0행).
--
-- definer·트리거 경로 확인(2026-11-17): 이 세 표에 쓰는 security definer 함수·트리거는 없습니다
--   (마이그레이션 전부에서 insert·update·delete 대상으로 나오지 않음 — card_report_drafts_drafting 트리거는 reports를 씀).
--   카드를 영구 삭제할 때의 on delete cascade(card_report_drafts·report_draft_edits)는 참조 무결성 동작이라 RLS 정책을 거치지 않으므로
--   표지와 무관하게 그대로 지워집니다(카드 삭제 자체의 권한은 cards 정책). service_role·postgres(스크립트)는 RLS 밖이라 영향 없음.
--
-- 운영 반영 순서(중요 — 어기면 경평 초안 저장·구성안·블록 고치기·지표 부분 저장이 모두 거절됨):
--   1. 20261117120000(표지 기반) db:push, 앱 머리글(APP_WRITE_KEY) 배포
--   2. 키 해시 등록(private.app_write_key)
--   3. 배포된 서버에서 public.app_write_probe()가 true인지 확인(운영 관문이 x-app-write를 DB까지 넘기는지)
--   4. 그 뒤에만 이 파일을 db:push → 화면에서 초안 저장·블록 고치기·지표 부분 저장을 1회씩 확인
--   이 파일은 위 1~3과 독립 커밋입니다(20261117120000·위생 마이그레이션은 이 파일에 기대지 않음).
--
-- 되돌리기(down — 예전 정책으로):
--   drop policy card_report_drafts_insert on public.card_report_drafts;
--   drop policy card_report_drafts_update on public.card_report_drafts;
--   drop policy card_report_drafts_delete on public.card_report_drafts;
--   create policy card_report_drafts_write on public.card_report_drafts for all to authenticated
--     using (private.can_write_card(card_id)) with check (private.can_write_card(card_id));
--   drop policy report_draft_edits_insert on public.report_draft_edits;
--   create policy report_draft_edits_insert on public.report_draft_edits for insert to authenticated
--     with check (private.can_write_card(card_id) and edited_by = auth.uid());
--   drop policy eval_unit_report_parts_insert on public.eval_unit_report_parts;
--   drop policy eval_unit_report_parts_update on public.eval_unit_report_parts;
--   drop policy eval_unit_report_parts_delete on public.eval_unit_report_parts;
--   create policy eval_unit_report_parts_insert on public.eval_unit_report_parts for insert to authenticated
--     with check (private.can_write_unit_parts(eval_unit_id));
--   create policy eval_unit_report_parts_update on public.eval_unit_report_parts for update to authenticated
--     using (private.can_write_unit_parts(eval_unit_id)) with check (private.can_write_unit_parts(eval_unit_id));
--   create policy eval_unit_report_parts_delete on public.eval_unit_report_parts for delete to authenticated
--     using (private.is_staff());

-- 과제별 초안(예전: card_report_drafts_write FOR ALL — 20260926100000)
drop policy card_report_drafts_write on public.card_report_drafts;
create policy card_report_drafts_insert on public.card_report_drafts for insert to authenticated
  with check (private.can_write_card(card_id) and private.app_write());
create policy card_report_drafts_update on public.card_report_drafts for update to authenticated
  using (private.can_write_card(card_id)) with check (private.can_write_card(card_id) and private.app_write());
create policy card_report_drafts_delete on public.card_report_drafts for delete to authenticated
  using (private.can_write_card(card_id) and private.app_write());

-- 블록 고치기 이력(넣기만 — 20260927150000)
drop policy report_draft_edits_insert on public.report_draft_edits;
create policy report_draft_edits_insert on public.report_draft_edits for insert to authenticated
  with check (private.can_write_card(card_id) and edited_by = auth.uid() and private.app_write());

-- 지표 단위 부분(20261016100000)
drop policy eval_unit_report_parts_insert on public.eval_unit_report_parts;
drop policy eval_unit_report_parts_update on public.eval_unit_report_parts;
drop policy eval_unit_report_parts_delete on public.eval_unit_report_parts;
create policy eval_unit_report_parts_insert on public.eval_unit_report_parts for insert to authenticated
  with check (private.can_write_unit_parts(eval_unit_id) and private.app_write());
create policy eval_unit_report_parts_update on public.eval_unit_report_parts for update to authenticated
  using (private.can_write_unit_parts(eval_unit_id)) with check (private.can_write_unit_parts(eval_unit_id) and private.app_write());
create policy eval_unit_report_parts_delete on public.eval_unit_report_parts for delete to authenticated
  using (private.is_staff() and private.app_write());
