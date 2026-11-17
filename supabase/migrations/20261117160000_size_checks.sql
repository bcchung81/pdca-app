-- 큰 JSON·글 열의 크기 상한과 jsonb 모양 검사(근본책 4단계 — 안전망, 2026-11-17).
--
-- 무엇을: 카드·작성본·현행화·경평 초안·점검표·AI 결과·보고서 원고의 큰 jsonb 열과 원본 양식 조각(text)에 바이트 상한 CHECK,
--   jsonb 열에 기대 모양(object/array) CHECK, 프로필 이름에 글자 수 상한 CHECK를 겁니다. 크기는 octet_length(열::text)(UTF-8 바이트)로 잽니다.
-- 왜: 서버 액션의 입력 검증에 빈틈이 있거나 서비스 키 스크립트가 실수하면 아주 큰 값·엉뚱한 모양이 저장되고,
--   그 행을 읽는 화면·변환(한글 내려받기·쪽 나누기·다시 세기)이 메모리·시간을 다 씁니다. CHECK는 역할과 무관하게(로그인 사용자·서비스 키·postgres 모두)
--   걸리므로 앱 밖 마지막 안전망이 됩니다. 판정값 위조(없는 숫자·경고)는 못 막습니다 — 그건 읽을 때 다시 셈(lib/reports/draft-recount.ts)의 몫.
--   쓰기 정책·권한·트리거는 바꾸지 않습니다(lib/db/grants.test.ts 구조 시험 영향 없음).
--
-- 상한 정하는 법: 「운영 최대 × 넉넉한 배수」이면서 앱이 정상적으로 만들 수 있는 최대보다 확실히 큼. 정상 데이터를 막으면 운영 장애이므로 의심되면 크게 잡았습니다.
--   (운영 최대 = 2026-11-17 20:10 읽기 조회, 바이트 = octet_length(x::text). 로컬 = data/cards/261103 한글 파일을 앱과 같은 함수로 읽어 잰 값 — JSON.stringify라 ::text보다 조금 작음)
--   한 칸은 1 MiB = 1,048,576 바이트.
--
--   [카드 JSON — 4 MiB, object]
--   cards.data                  운영 최대 42,121(p99 38,766) · 로컬 최대 39,098 · 앱 상한 lib/cards/edit.ts checkEditable JSON.stringify 50만 자
--                               (한글 3바이트 + ::text가 넣는 공백까지 쳐도 2 MiB 안) → 4 MiB(운영 최대의 약 100배)
--   card_versions.data          운영 최대 15,109(3행) · 같은 카드 JSON → 4 MiB
--   card_versions.base          (null 허용) 작성본을 시작할 때의 원장 카드 JSON → 4 MiB
--   card_edits.before / after   원장 카드 JSON 통째(lib/cards/confirm.ts·app/(app)/cards/actions.ts·archive-actions.ts) → 4 MiB
--   card_import_items.parsed    한글 파일에서 읽은 카드 JSON 한 장(현행화 — 파일 30MB 한도 CARD_FILE_MAX) → 4 MiB
--   [원본 배치 — 16 MiB, object, null 허용]
--   cards.layout · card_import_items.layout   운영 미조회 · 로컬 최대 318,755(주요사업 56장 중앙값 196,235, 경영관리 최대 145,866).
--                               앱 상한 없음(한글 파일에서 코드가 만듦 — 그림은 버킷에 따로) → 16 MiB(로컬 최대의 약 50배)
--   [원본 양식 조각 — 8 MiB, text, null 허용]
--   cards.original_html         운영 미조회 · 로컬 최대 19,885(renderCard(data) — 카드 JSON의 절반 정도). 카드 JSON 4 MiB의 2배 → 8 MiB
--   [경평 초안 — 4 MiB, object(null 허용 열은 null 허용)]
--   card_report_drafts.spec     운영 최대 25,537(p99 22,950, 경영관리 여러 쪽 초안 포함) · 앱 읽기 상한 lib/reports/draft-recount.ts
--                               SPEC_TEXT_MAX 30만 자·SPEC_NODES_MAX 5만 개(합쳐 2 MiB 안팎 — 넘으면 화면이 그리지 않는 값) → 4 MiB(약 160배)
--   card_report_drafts.outline  운영 최대 30,719(p99 29,545) · 앱 상한 없음 → 4 MiB(약 135배)
--   eval_unit_report_parts.spec 운영 0행 · 초안과 같은 크기대 → 4 MiB(not null)
--   report_draft_edits.before / after   운영 0행 · 블록 하나 또는 추진성과 칸(object — 초안 spec의 일부) → 4 MiB
--   [점검표·AI 결과·보고서 원고 — 8 MiB]
--   inspections.result          운영 미조회 · 칸마다 INSPECTION_TEXT_MAX(lib/inspections/model.ts, 최대 2,000자), 행 수는 양식이 정함 → 8 MiB, object
--   ai_results.result           운영 미조회 · AI 작업 결과(lib/ai/background.ts JobOutcome — 출력 상한 FEATURE_MAX_TOKENS 최대 12.8만 토큰) → 8 MiB, object
--   reports.blocks              운영 최대 2(48행 모두 빈 목록) · 앱 상한 lib/reports/model.ts BLOCK_LIMITS 블록 300개 × 문단 5,000자(한글 4.5MB 안팎) → 8 MiB, array
--                               (표 블록을 60행×12칸×1,000자로 300개 채우면 넘지만 정상 사용이 아님 — 그 값은 화면도 못 그림)
--   [작은 것 — 1 MiB, object]
--   reports.inputs              운영 최대 2(앱은 더 읽지 않음, lib/reports/model.ts) → 1 MiB
--   prep_jobs.payload           과제 매칭 작업 인자 { docIds }(lib/prep/queue.ts) — 로그인 사용자가 넣을 수 있는 열 → 1 MiB
--   [글자 수]
--   profiles.display_name       운영 최대 6자(p99 3) · 앱 상한 lib/users/name.ts NAME_MAX 40자 → 100자(char_length).
--                               가입 트리거(private.handle_new_user)가 넣는 이름에도 걸림 — 앱·db:user는 40자 안만 넘김
--
-- 넣지 않은 열(판단): knowledge_chunks·knowledge_documents(관리자만 쓰고 올릴 때 크기 보호 40만 자 — lib/knowledge/guard.ts가 따로 지킴),
--   card_materials·report_materials.parsed_text(서버만 씀 — 20261117100000), access_events·ai_requests(트리거·rpc만 씀),
--   경고 목록(warnings·outline_warnings)·card_import_items.result·candidates·card_imports.files·prep_jobs.progress(앱이 만든 짧은 목록 — 위험 작음).
--
-- 기존 행: 운영 최대가 상한보다 한참 작아 위반이 없다고 보지만, 운영 미조회 열(layout·original_html·base·card_edits·import·inspections·ai_results)이 있어
--   not valid로 걸어 새 쓰기부터 막은 뒤 같은 파일에서 validate constraint로 기존 행을 확인합니다. 기존 행이 어기면 db:push가 이 파일에서 멈추고
--   (마이그레이션은 한 트랜잭션이라 아무것도 남지 않음) — 그때는 아래 확인 SQL로 그 행을 찾아 보고, 필요하면 해당 validate 줄만 빼고 반영합니다.
--   반영 전 확인(읽기만 — 결과가 모두 0행이면 통과):
--     select 'cards.data' c, id::text from public.cards where octet_length(data::text) > 4194304 or jsonb_typeof(data) <> 'object'
--     union all select 'cards.layout', id::text from public.cards where octet_length(layout::text) > 16777216 or jsonb_typeof(layout) <> 'object'
--     union all select 'cards.original_html', id::text from public.cards where octet_length(original_html) > 8388608
--     union all select 'card_versions', id::text from public.card_versions where octet_length(data::text) > 4194304 or jsonb_typeof(data) <> 'object' or octet_length(base::text) > 4194304 or jsonb_typeof(base) <> 'object'
--     union all select 'card_edits', id::text from public.card_edits where octet_length(before::text) > 4194304 or octet_length(after::text) > 4194304 or jsonb_typeof(before) <> 'object' or jsonb_typeof(after) <> 'object'
--     union all select 'card_import_items', id::text from public.card_import_items where octet_length(parsed::text) > 4194304 or jsonb_typeof(parsed) <> 'object' or octet_length(layout::text) > 16777216 or jsonb_typeof(layout) <> 'object'
--     union all select 'card_report_drafts', card_id from public.card_report_drafts where octet_length(spec::text) > 4194304 or jsonb_typeof(spec) <> 'object' or octet_length(outline::text) > 4194304 or jsonb_typeof(outline) <> 'object'
--     union all select 'eval_unit_report_parts', eval_unit_id from public.eval_unit_report_parts where octet_length(spec::text) > 4194304 or jsonb_typeof(spec) <> 'object'
--     union all select 'report_draft_edits', id::text from public.report_draft_edits where octet_length(before::text) > 4194304 or octet_length(after::text) > 4194304 or jsonb_typeof(before) <> 'object' or jsonb_typeof(after) <> 'object'
--     union all select 'inspections', id::text from public.inspections where octet_length(result::text) > 8388608 or jsonb_typeof(result) <> 'object'
--     union all select 'ai_results', request_id::text from public.ai_results where octet_length(result::text) > 8388608 or jsonb_typeof(result) <> 'object'
--     union all select 'reports', id::text from public.reports where octet_length(blocks::text) > 8388608 or jsonb_typeof(blocks) <> 'array' or octet_length(inputs::text) > 1048576 or jsonb_typeof(inputs) <> 'object'
--     union all select 'prep_jobs', id::text from public.prep_jobs where octet_length(payload::text) > 1048576 or jsonb_typeof(payload) <> 'object'
--     union all select 'profiles', id::text from public.profiles where char_length(display_name) > 100;
--
-- 앱이 위반을 받으면: PostgREST 23514(check_violation) → 서버 액션은 이미 있는 일반 실패 문구(「저장하지 못했습니다」 등, 예: lib/reports/draft-store.ts saveDraftRow의
--   오류 → 호출부 「…저장하지 못했습니다(권한을 확인해 주세요)」)를 보이고 원문은 서버 로그에만 남깁니다. 정상 사용에서는 일어나지 않습니다.
-- 비용: CHECK는 행을 쓸 때마다 그 행의 열을 글로 바꿔 잼(카드 한 장 수십~수백 KB — 쓰기 한 번에 수 ms 안). 읽기에는 영향 없음.
--
-- 운영 반영 순서: 앱 배포와 무관(앱 코드 변경 없음) — 위 확인 SQL(읽기) 뒤 pnpm db:push만.
--
-- 되돌리기(down):
--   alter table public.cards drop constraint if exists cards_data_size, drop constraint if exists cards_data_shape,
--     drop constraint if exists cards_layout_size, drop constraint if exists cards_layout_shape, drop constraint if exists cards_original_html_size;
--   alter table public.card_versions drop constraint if exists card_versions_data_size, drop constraint if exists card_versions_data_shape,
--     drop constraint if exists card_versions_base_size, drop constraint if exists card_versions_base_shape;
--   alter table public.card_edits drop constraint if exists card_edits_before_size, drop constraint if exists card_edits_before_shape,
--     drop constraint if exists card_edits_after_size, drop constraint if exists card_edits_after_shape;
--   alter table public.card_import_items drop constraint if exists card_import_items_parsed_size, drop constraint if exists card_import_items_parsed_shape,
--     drop constraint if exists card_import_items_layout_size, drop constraint if exists card_import_items_layout_shape;
--   alter table public.card_report_drafts drop constraint if exists card_report_drafts_spec_size, drop constraint if exists card_report_drafts_spec_shape,
--     drop constraint if exists card_report_drafts_outline_size, drop constraint if exists card_report_drafts_outline_shape;
--   alter table public.eval_unit_report_parts drop constraint if exists eval_unit_report_parts_spec_size, drop constraint if exists eval_unit_report_parts_spec_shape;
--   alter table public.report_draft_edits drop constraint if exists report_draft_edits_before_size, drop constraint if exists report_draft_edits_before_shape,
--     drop constraint if exists report_draft_edits_after_size, drop constraint if exists report_draft_edits_after_shape;
--   alter table public.inspections drop constraint if exists inspections_result_size, drop constraint if exists inspections_result_shape;
--   alter table public.ai_results drop constraint if exists ai_results_result_size, drop constraint if exists ai_results_result_shape;
--   alter table public.reports drop constraint if exists reports_blocks_size, drop constraint if exists reports_blocks_shape,
--     drop constraint if exists reports_inputs_size, drop constraint if exists reports_inputs_shape;
--   alter table public.prep_jobs drop constraint if exists prep_jobs_payload_size, drop constraint if exists prep_jobs_payload_shape;
--   alter table public.profiles drop constraint if exists profiles_display_name_length;
--
-- 이름 규칙: <표>_<열>_size(바이트 상한) · <표>_<열>_shape(jsonb 모양) · profiles_display_name_length(글자 수). null 열은 CHECK가 null을 통과시키므로 따로 적지 않음.
-- 시험: lib/db/size-checks.test.ts(열마다 상한 바로 아래 통과·바로 위 위반·모양 위반·운영 최대 크기 통과, postgres로 넣어도 걸림).

-- 카드 JSON(4 MiB, object)
alter table public.cards
  add constraint cards_data_size check (octet_length(data::text) <= 4194304) not valid,
  add constraint cards_data_shape check (jsonb_typeof(data) = 'object') not valid,
  add constraint cards_layout_size check (octet_length(layout::text) <= 16777216) not valid,
  add constraint cards_layout_shape check (jsonb_typeof(layout) = 'object') not valid,
  add constraint cards_original_html_size check (octet_length(original_html) <= 8388608) not valid;

alter table public.card_versions
  add constraint card_versions_data_size check (octet_length(data::text) <= 4194304) not valid,
  add constraint card_versions_data_shape check (jsonb_typeof(data) = 'object') not valid,
  add constraint card_versions_base_size check (octet_length(base::text) <= 4194304) not valid,
  add constraint card_versions_base_shape check (jsonb_typeof(base) = 'object') not valid;

alter table public.card_edits
  add constraint card_edits_before_size check (octet_length(before::text) <= 4194304) not valid,
  add constraint card_edits_before_shape check (jsonb_typeof(before) = 'object') not valid,
  add constraint card_edits_after_size check (octet_length(after::text) <= 4194304) not valid,
  add constraint card_edits_after_shape check (jsonb_typeof(after) = 'object') not valid;

alter table public.card_import_items
  add constraint card_import_items_parsed_size check (octet_length(parsed::text) <= 4194304) not valid,
  add constraint card_import_items_parsed_shape check (jsonb_typeof(parsed) = 'object') not valid,
  add constraint card_import_items_layout_size check (octet_length(layout::text) <= 16777216) not valid,
  add constraint card_import_items_layout_shape check (jsonb_typeof(layout) = 'object') not valid;

-- 경평 초안(4 MiB, object)
alter table public.card_report_drafts
  add constraint card_report_drafts_spec_size check (octet_length(spec::text) <= 4194304) not valid,
  add constraint card_report_drafts_spec_shape check (jsonb_typeof(spec) = 'object') not valid,
  add constraint card_report_drafts_outline_size check (octet_length(outline::text) <= 4194304) not valid,
  add constraint card_report_drafts_outline_shape check (jsonb_typeof(outline) = 'object') not valid;

alter table public.eval_unit_report_parts
  add constraint eval_unit_report_parts_spec_size check (octet_length(spec::text) <= 4194304) not valid,
  add constraint eval_unit_report_parts_spec_shape check (jsonb_typeof(spec) = 'object') not valid;

alter table public.report_draft_edits
  add constraint report_draft_edits_before_size check (octet_length(before::text) <= 4194304) not valid,
  add constraint report_draft_edits_before_shape check (jsonb_typeof(before) = 'object') not valid,
  add constraint report_draft_edits_after_size check (octet_length(after::text) <= 4194304) not valid,
  add constraint report_draft_edits_after_shape check (jsonb_typeof(after) = 'object') not valid;

-- 점검표·AI 결과·보고서 원고(8 MiB) · 작은 것(1 MiB)
alter table public.inspections
  add constraint inspections_result_size check (octet_length(result::text) <= 8388608) not valid,
  add constraint inspections_result_shape check (jsonb_typeof(result) = 'object') not valid;

alter table public.ai_results
  add constraint ai_results_result_size check (octet_length(result::text) <= 8388608) not valid,
  add constraint ai_results_result_shape check (jsonb_typeof(result) = 'object') not valid;

alter table public.reports
  add constraint reports_blocks_size check (octet_length(blocks::text) <= 8388608) not valid,
  add constraint reports_blocks_shape check (jsonb_typeof(blocks) = 'array') not valid,
  add constraint reports_inputs_size check (octet_length(inputs::text) <= 1048576) not valid,
  add constraint reports_inputs_shape check (jsonb_typeof(inputs) = 'object') not valid;

alter table public.prep_jobs
  add constraint prep_jobs_payload_size check (octet_length(payload::text) <= 1048576) not valid,
  add constraint prep_jobs_payload_shape check (jsonb_typeof(payload) = 'object') not valid;

-- 프로필 이름(글자 수)
alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) <= 100) not valid;

-- 기존 행 확인(위반이 있으면 여기서 멈춤 — 머리 주석 「기존 행」)
alter table public.cards validate constraint cards_data_size;
alter table public.cards validate constraint cards_data_shape;
alter table public.cards validate constraint cards_layout_size;
alter table public.cards validate constraint cards_layout_shape;
alter table public.cards validate constraint cards_original_html_size;
alter table public.card_versions validate constraint card_versions_data_size;
alter table public.card_versions validate constraint card_versions_data_shape;
alter table public.card_versions validate constraint card_versions_base_size;
alter table public.card_versions validate constraint card_versions_base_shape;
alter table public.card_edits validate constraint card_edits_before_size;
alter table public.card_edits validate constraint card_edits_before_shape;
alter table public.card_edits validate constraint card_edits_after_size;
alter table public.card_edits validate constraint card_edits_after_shape;
alter table public.card_import_items validate constraint card_import_items_parsed_size;
alter table public.card_import_items validate constraint card_import_items_parsed_shape;
alter table public.card_import_items validate constraint card_import_items_layout_size;
alter table public.card_import_items validate constraint card_import_items_layout_shape;
alter table public.card_report_drafts validate constraint card_report_drafts_spec_size;
alter table public.card_report_drafts validate constraint card_report_drafts_spec_shape;
alter table public.card_report_drafts validate constraint card_report_drafts_outline_size;
alter table public.card_report_drafts validate constraint card_report_drafts_outline_shape;
alter table public.eval_unit_report_parts validate constraint eval_unit_report_parts_spec_size;
alter table public.eval_unit_report_parts validate constraint eval_unit_report_parts_spec_shape;
alter table public.report_draft_edits validate constraint report_draft_edits_before_size;
alter table public.report_draft_edits validate constraint report_draft_edits_before_shape;
alter table public.report_draft_edits validate constraint report_draft_edits_after_size;
alter table public.report_draft_edits validate constraint report_draft_edits_after_shape;
alter table public.inspections validate constraint inspections_result_size;
alter table public.inspections validate constraint inspections_result_shape;
alter table public.ai_results validate constraint ai_results_result_size;
alter table public.ai_results validate constraint ai_results_result_shape;
alter table public.reports validate constraint reports_blocks_size;
alter table public.reports validate constraint reports_blocks_shape;
alter table public.reports validate constraint reports_inputs_size;
alter table public.reports validate constraint reports_inputs_shape;
alter table public.prep_jobs validate constraint prep_jobs_payload_size;
alter table public.prep_jobs validate constraint prep_jobs_payload_shape;
alter table public.profiles validate constraint profiles_display_name_length;
