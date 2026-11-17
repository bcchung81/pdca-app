-- 앱 서버 경유 표지를 남은 공개 표의 쓰기 정책 전부에 겁니다(근본책 2·3단계, 2026-11-17).
-- 1단계 B(20261117130000, 경평 초안 표 3개)와 같은 모양입니다. 이 파일은 B·rpc 파일(20261117150000)에 기대지 않습니다.
--   - 행 판정(누가 어느 행)은 바꾸지 않고 `and private.app_write()`만 더합니다.
--     넣기는 WITH CHECK에, 고치기는 WITH CHECK에(USING은 예전 그대로 — 표지 없는 갱신이 0행으로 조용히 지나가지 않고 RLS 오류),
--     지우기는 USING에(표지 없으면 0행).
--   - 명령별 정책(넣기·고치기·지우기)은 이름·역할·명령을 그대로 두고 alter policy로 식만 바꿉니다.
--   - FOR ALL 정책은 남기지 않습니다. ALL의 USING은 읽기에도 쓰이므로 표지를 넣으면 읽기까지 막히고, 안 넣으면 지우기가 표지 없이 통과합니다.
--     그래서 읽기·넣기·고치기·지우기 넷으로 나누고, 읽기 정책은 예전 ALL과 같은 식으로 남겨(다른 읽기 정책이 이미 덮어도) 읽기 동작을 바꾸지 않습니다.
--     teams·knowledge_card_links·card_knowledge_select는 위생(20261117110000)으로 쓰기 권한이 이미 없지만, 쓰기 정책 구조 시험이
--     예외 없이 돌도록 같이 나눕니다.
--   - 표지 없는 요청은 그 사람의 역할과 무관하게(부서·성과관리팀·관리자) 쓰기가 막히고, 읽기는 예전과 같습니다.
--
-- definer·트리거 경로 확인(2026-11-17, PGlite에서 public·private 함수 본문과 트리거 목록을 뽑아 대조):
--   - security definer로 이 표들에 쓰는 것(소유자 권한이라 RLS를 거치지 않음 — 표지와 무관하게 예전대로 동작):
--     private.handle_new_user(auth.users 가입 → profiles 넣기), private.drop_assignees_on_card_team_change·drop_assignees_on_profile_change
--     (cards·profiles 트리거 → card_assignees 지우기), private.prune_ai_results(ai_results 트리거 → 지난 행 지우기),
--     log_*_access_event(→ access_events, 이 파일 대상 아님). 공개 rpc 중 이 표들에 쓰는 것은 없음(report_submit_cards·mg_biz_*·
--     report_outline_context는 읽기만, start/finish_ai_request는 ai_requests만 — rpc 표지는 20261117150000).
--     public 표에 force row level security는 없음.
--   - invoker 트리거가 다른 표에 쓰는 것은 private.report_drafting_on_draft 하나(card_report_drafts 넣기·고치기 → reports 상태를
--     preparing에서 drafting으로). 같은 요청 안이라 머리글(request.headers)이 그대로여서 reports_update의 표지 검사를 통과함
--     — lib/db/migrations.test.ts가 확인. 나머지 invoker 트리거(guard_*·touch_*)는 검사하거나 NEW만 고침.
--   - 카드 영구 삭제의 on delete cascade는 참조 무결성 동작이라 RLS 정책을 거치지 않음. service_role·postgres(스크립트)는 RLS 밖.
--
-- 운영 반영 순서: 앱 코드 변경이 없으므로 배포 없이 db:push만 합니다.
--   전제: 20261117120000(표지 기반)·키 해시 등록·운영에서 public.app_write_probe()가 true(1단계 ①~⑤).
--   사용자가 1단계 B(초안 표)의 실제 저장(초안 저장·블록 고치기·지표 부분 저장)을 화면에서 확인한 뒤에 이 파일을 db:push합니다.
--   반영 뒤 카드 저장·작성본·현행화·첨부·보고서·점검표·사용자 화면의 쓰기를 1회씩 확인합니다.
--
-- 되돌리기(down — 예전 정책으로):
--   alter policy cards_dept_update on public.cards using (private.can_write_card(id)) with check (private.can_write_card(id));
--   alter policy card_versions_insert on public.card_versions with check (private.can_write_card(card_id));
--   alter policy card_versions_update on public.card_versions
--     using (private.can_write_card(card_id) and (status <> 'confirmed' or private.is_staff())) with check (private.can_write_card(card_id));
--   alter policy card_versions_delete on public.card_versions using (private.is_staff() or (private.can_write_card(card_id) and status = 'draft'));
--   alter policy reports_insert on public.reports with check (private.is_staff());
--   alter policy reports_update on public.reports using (private.can_write_report(id)) with check (private.can_write_report(id));
--   alter policy reports_delete on public.reports using (private.is_staff());
--   alter policy card_edits_dept_insert on public.card_edits with check (private.can_write_card(card_id) and edited_by = (select auth.uid()));
--   alter policy card_edits_insert on public.card_edits with check (private.is_staff() and edited_by = (select auth.uid()));
--   alter policy card_edits_update on public.card_edits
--     using (private.is_staff() and edited_by = (select auth.uid())) with check (private.is_staff() and edited_by = (select auth.uid()));
--   alter policy card_imports_insert on public.card_imports
--     with check (created_by = (select auth.uid()) and (private.is_staff() or (scope = 'draft' and private.can_write_card(target_card_id))));
--   alter policy card_imports_update on public.card_imports using (private.can_use_import(id)) with check (private.can_use_import(id));
--   alter policy card_imports_delete on public.card_imports using (private.is_staff());
--   alter policy card_materials_insert on public.card_materials with check (private.can_write_card(card_id));
--   alter policy card_materials_delete on public.card_materials using (private.can_write_card(card_id) and not private.card_material_locked(storage_path));
--   alter policy report_materials_insert on public.report_materials
--     with check (private.can_edit_report_content(report_id) and uploaded_by = (select auth.uid()));
--   alter policy report_materials_delete on public.report_materials using (private.can_edit_report_content(report_id));
--   alter policy report_comments_insert on public.report_comments with check (private.can_read_report(report_id) and author_id = (select auth.uid()));
--   alter policy report_comments_update on public.report_comments
--     using (private.can_write_report(report_id) or author_id = (select auth.uid())) with check (private.can_read_report(report_id));
--   alter policy report_comments_delete on public.report_comments using (author_id = (select auth.uid()) or private.is_staff());
--   alter policy report_material_cards_insert on public.report_material_cards with check (private.can_match_material(material_id, card_id));
--   alter policy report_material_cards_update on public.report_material_cards
--     using (private.can_match_material(material_id, card_id)) with check (private.can_match_material(material_id, card_id));
--   alter policy report_material_cards_delete on public.report_material_cards using (private.can_match_material(material_id, card_id));
--   alter policy ai_results_insert on public.ai_results with check (
--     user_id = (select auth.uid()) and (card_id is null or private.can_read_card(card_id))
--     and exists (select 1 from public.ai_requests r where r.id = request_id and r.user_id = (select auth.uid()) and r.job is not null
--       and r.feature = ai_results.feature and r.card_id is not distinct from ai_results.card_id));
--   alter policy ai_results_delete on public.ai_results using (user_id = (select auth.uid()));
--   alter policy prep_jobs_insert on public.prep_jobs with check (requested_by = (select auth.uid()) and private.can_enqueue_prep(kind, target));
--   alter policy profiles_update on public.profiles
--     using (id = (select auth.uid()) or private.is_admin() or (private.is_staff() and role = 'dept_user'))
--     with check (id = (select auth.uid()) or private.is_admin() or (private.is_staff() and role = 'dept_user'));
--   alter policy inspections_ack on public.inspections
--     using (status = 'sent' and private.can_write_card(card_id)) with check (status = 'acknowledged' and private.can_write_card(card_id));
--   alter policy inspections_staff_insert on public.inspections with check (private.is_staff());
--   alter policy inspections_staff_update on public.inspections using (private.is_staff()) with check (private.is_staff());
--   alter policy inspections_staff_delete on public.inspections using (private.is_staff() and status = 'draft');
--   나눈 FOR ALL 정책(표마다 넷을 지우고 예전 하나를 다시 만듦 — <w>는 아래 판정 식):
--     drop policy <표>_<누구>_read, <표>_insert, <표>_update, <표>_delete on public.<표>;   -- cards는 cards_staff_read·cards_insert·cards_update·cards_delete
--     create policy <예전 이름> on public.<표> for all to authenticated using (<w>) with check (<w>);
--     cards_write·eval_units_write·task_map_write·knowledge_card_links_write·report_outline_write·card_assignees_write·
--     card_knowledge_scope_write·card_knowledge_select_write: <w> = private.is_staff()   (20260925090200·20260925091200·20260930090000·20260930120000·20261026100000)
--     teams_write: <w> = private.is_admin()   (20260925090200)
--     knowledge_documents_write·knowledge_chunks_write: <w> = private.is_admin()   (20261103100000)
--     card_import_items_write: <w> = private.can_use_import(import_id)   (20260925091600)

-- ① 부서도 쓰는 표 — 명령별 정책에 표지

-- 카드 원장(성과관리팀 ALL은 ④에서 나눔, 부서 확정 고치기 — 20261027110000)
alter policy cards_dept_update on public.cards
  using (private.can_write_card(id)) with check (private.can_write_card(id) and private.app_write());

-- 작성본(20260925090200)
alter policy card_versions_insert on public.card_versions
  with check (private.can_write_card(card_id) and private.app_write());
alter policy card_versions_update on public.card_versions
  using (private.can_write_card(card_id) and (status <> 'confirmed' or private.is_staff()))
  with check (private.can_write_card(card_id) and private.app_write());
alter policy card_versions_delete on public.card_versions
  using ((private.is_staff() or (private.can_write_card(card_id) and status = 'draft')) and private.app_write());

-- 경평 보고서(20260925091000) — 초안 저장 트리거(report_drafting_on_draft)가 같은 요청 안에서 reports_update를 거침
alter policy reports_insert on public.reports
  with check (private.is_staff() and private.app_write());
alter policy reports_update on public.reports
  using (private.can_write_report(id)) with check (private.can_write_report(id) and private.app_write());
alter policy reports_delete on public.reports
  using (private.is_staff() and private.app_write());

-- 카드 편집 기록(20260925090800·20260925090900·20261027110000)
alter policy card_edits_dept_insert on public.card_edits
  with check (private.can_write_card(card_id) and edited_by = (select auth.uid()) and private.app_write());
alter policy card_edits_insert on public.card_edits
  with check (private.is_staff() and edited_by = (select auth.uid()) and private.app_write());
alter policy card_edits_update on public.card_edits
  using (private.is_staff() and edited_by = (select auth.uid()))
  with check (private.is_staff() and edited_by = (select auth.uid()) and private.app_write());

-- 카드 현행화 묶음(20260925091600)
alter policy card_imports_insert on public.card_imports
  with check (
    created_by = (select auth.uid())
    and (private.is_staff() or (scope = 'draft' and private.can_write_card(target_card_id)))
    and private.app_write()
  );
alter policy card_imports_update on public.card_imports
  using (private.can_use_import(id)) with check (private.can_use_import(id) and private.app_write());
alter policy card_imports_delete on public.card_imports
  using (private.is_staff() and private.app_write());

-- 카드 전용 자료(20260925090200·20261104100000)
alter policy card_materials_insert on public.card_materials
  with check (private.can_write_card(card_id) and private.app_write());
alter policy card_materials_delete on public.card_materials
  using (private.can_write_card(card_id) and not private.card_material_locked(storage_path) and private.app_write());

-- 보고서 추가자료(20260925091300)
alter policy report_materials_insert on public.report_materials
  with check (private.can_edit_report_content(report_id) and uploaded_by = (select auth.uid()) and private.app_write());
alter policy report_materials_delete on public.report_materials
  using (private.can_edit_report_content(report_id) and private.app_write());

-- 보고서 검토 코멘트(20260925091000)
alter policy report_comments_insert on public.report_comments
  with check (private.can_read_report(report_id) and author_id = (select auth.uid()) and private.app_write());
alter policy report_comments_update on public.report_comments
  using (private.can_write_report(report_id) or author_id = (select auth.uid()))
  with check (private.can_read_report(report_id) and private.app_write());
alter policy report_comments_delete on public.report_comments
  using ((author_id = (select auth.uid()) or private.is_staff()) and private.app_write());

-- 추가자료 ↔ 과제 연결(20260930090000)
alter policy report_material_cards_insert on public.report_material_cards
  with check (private.can_match_material(material_id, card_id) and private.app_write());
alter policy report_material_cards_update on public.report_material_cards
  using (private.can_match_material(material_id, card_id))
  with check (private.can_match_material(material_id, card_id) and private.app_write());
alter policy report_material_cards_delete on public.report_material_cards
  using (private.can_match_material(material_id, card_id) and private.app_write());

-- AI 답 보관(20261106100000) — 지난 행 정리 트리거(prune_ai_results)는 definer라 영향 없음
alter policy ai_results_insert on public.ai_results
  with check (
    user_id = (select auth.uid())
    and (card_id is null or private.can_read_card(card_id))
    and exists (
      select 1 from public.ai_requests r
      where r.id = request_id and r.user_id = (select auth.uid()) and r.job is not null
        and r.feature = ai_results.feature and r.card_id is not distinct from ai_results.card_id
    )
    and private.app_write()
  );
alter policy ai_results_delete on public.ai_results
  using (user_id = (select auth.uid()) and private.app_write());

-- 과제 매칭 작업 요청(20260930090000)
alter policy prep_jobs_insert on public.prep_jobs
  with check (requested_by = (select auth.uid()) and private.can_enqueue_prep(kind, target) and private.app_write());

-- 프로필(20260930120000) — 가입 트리거(handle_new_user)는 definer라 영향 없음
alter policy profiles_update on public.profiles
  using (id = (select auth.uid()) or private.is_admin() or (private.is_staff() and role = 'dept_user'))
  with check ((id = (select auth.uid()) or private.is_admin() or (private.is_staff() and role = 'dept_user')) and private.app_write());

-- ② 점검표(20260925090200·20261103100000) — 부서 확인(ack)과 성과관리팀 정책 모두
alter policy inspections_ack on public.inspections
  using (status = 'sent' and private.can_write_card(card_id))
  with check (status = 'acknowledged' and private.can_write_card(card_id) and private.app_write());
alter policy inspections_staff_insert on public.inspections
  with check (private.is_staff() and private.app_write());
alter policy inspections_staff_update on public.inspections
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
alter policy inspections_staff_delete on public.inspections
  using (private.is_staff() and status = 'draft' and private.app_write());

-- ③·④ FOR ALL 정책 → 읽기(예전 식 그대로)·넣기·고치기·지우기

-- 카드 원장 — 성과관리팀(20260925090200)
drop policy cards_write on public.cards;
create policy cards_staff_read on public.cards for select to authenticated using (private.is_staff());
create policy cards_insert on public.cards for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy cards_update on public.cards for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy cards_delete on public.cards for delete to authenticated
  using (private.is_staff() and private.app_write());

-- 현행화 항목(20260925091600)
drop policy card_import_items_write on public.card_import_items;
create policy card_import_items_use_read on public.card_import_items for select to authenticated using (private.can_use_import(import_id));
create policy card_import_items_insert on public.card_import_items for insert to authenticated
  with check (private.can_use_import(import_id) and private.app_write());
create policy card_import_items_update on public.card_import_items for update to authenticated
  using (private.can_use_import(import_id)) with check (private.can_use_import(import_id) and private.app_write());
create policy card_import_items_delete on public.card_import_items for delete to authenticated
  using (private.can_use_import(import_id) and private.app_write());

-- 과제 담당자(20260930120000) — 담당자 정리 트리거(drop_assignees_*)·감사 기록 트리거는 definer라 영향 없음
drop policy card_assignees_write on public.card_assignees;
create policy card_assignees_staff_read on public.card_assignees for select to authenticated using (private.is_staff());
create policy card_assignees_insert on public.card_assignees for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy card_assignees_update on public.card_assignees for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy card_assignees_delete on public.card_assignees for delete to authenticated
  using (private.is_staff() and private.app_write());

-- 과제 대응표(20260930090000)
drop policy card_knowledge_scope_write on public.card_knowledge_scope;
create policy card_knowledge_scope_staff_read on public.card_knowledge_scope for select to authenticated using (private.is_staff());
create policy card_knowledge_scope_insert on public.card_knowledge_scope for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy card_knowledge_scope_update on public.card_knowledge_scope for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy card_knowledge_scope_delete on public.card_knowledge_scope for delete to authenticated
  using (private.is_staff() and private.app_write());

-- 평가단위(20260925090200)
drop policy eval_units_write on public.eval_units;
create policy eval_units_staff_read on public.eval_units for select to authenticated using (private.is_staff());
create policy eval_units_insert on public.eval_units for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy eval_units_update on public.eval_units for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy eval_units_delete on public.eval_units for delete to authenticated
  using (private.is_staff() and private.app_write());

-- 공통 지식 문서·조각 — 관리자(20261103100000)
drop policy knowledge_documents_write on public.knowledge_documents;
create policy knowledge_documents_admin_read on public.knowledge_documents for select to authenticated using (private.is_admin());
create policy knowledge_documents_insert on public.knowledge_documents for insert to authenticated
  with check (private.is_admin() and private.app_write());
create policy knowledge_documents_update on public.knowledge_documents for update to authenticated
  using (private.is_admin()) with check (private.is_admin() and private.app_write());
create policy knowledge_documents_delete on public.knowledge_documents for delete to authenticated
  using (private.is_admin() and private.app_write());

drop policy knowledge_chunks_write on public.knowledge_chunks;
create policy knowledge_chunks_admin_read on public.knowledge_chunks for select to authenticated using (private.is_admin());
create policy knowledge_chunks_insert on public.knowledge_chunks for insert to authenticated
  with check (private.is_admin() and private.app_write());
create policy knowledge_chunks_update on public.knowledge_chunks for update to authenticated
  using (private.is_admin()) with check (private.is_admin() and private.app_write());
create policy knowledge_chunks_delete on public.knowledge_chunks for delete to authenticated
  using (private.is_admin() and private.app_write());

-- 보고서 목차(20260925091200)
drop policy report_outline_write on public.report_outline;
create policy report_outline_staff_read on public.report_outline for select to authenticated using (private.is_staff());
create policy report_outline_insert on public.report_outline for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy report_outline_update on public.report_outline for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy report_outline_delete on public.report_outline for delete to authenticated
  using (private.is_staff() and private.app_write());

-- 과제 기준 목록표(20260925090200)
drop policy task_map_write on public.task_map;
create policy task_map_staff_read on public.task_map for select to authenticated using (private.is_staff());
create policy task_map_insert on public.task_map for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy task_map_update on public.task_map for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy task_map_delete on public.task_map for delete to authenticated
  using (private.is_staff() and private.app_write());

-- 쓰기 권한이 이미 없는 표(위생 20261117110000) — 구조 시험이 예외 없이 돌도록 같은 모양으로
drop policy teams_write on public.teams;
create policy teams_admin_read on public.teams for select to authenticated using (private.is_admin());
create policy teams_insert on public.teams for insert to authenticated
  with check (private.is_admin() and private.app_write());
create policy teams_update on public.teams for update to authenticated
  using (private.is_admin()) with check (private.is_admin() and private.app_write());
create policy teams_delete on public.teams for delete to authenticated
  using (private.is_admin() and private.app_write());

drop policy knowledge_card_links_write on public.knowledge_card_links;
create policy knowledge_card_links_staff_read on public.knowledge_card_links for select to authenticated using (private.is_staff());
create policy knowledge_card_links_insert on public.knowledge_card_links for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy knowledge_card_links_update on public.knowledge_card_links for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy knowledge_card_links_delete on public.knowledge_card_links for delete to authenticated
  using (private.is_staff() and private.app_write());

drop policy card_knowledge_select_write on public.card_knowledge_select;
create policy card_knowledge_select_staff_read on public.card_knowledge_select for select to authenticated using (private.is_staff());
create policy card_knowledge_select_insert on public.card_knowledge_select for insert to authenticated
  with check (private.is_staff() and private.app_write());
create policy card_knowledge_select_update on public.card_knowledge_select for update to authenticated
  using (private.is_staff()) with check (private.is_staff() and private.app_write());
create policy card_knowledge_select_delete on public.card_knowledge_select for delete to authenticated
  using (private.is_staff() and private.app_write());
