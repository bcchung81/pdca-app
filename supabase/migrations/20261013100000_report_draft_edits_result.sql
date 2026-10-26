-- 경평 초안 추진성과 상자 AI 수정 요청(2026-10-13): 소항목 끝 「추진성과」 상자(spec.results·resultBand)는 블록 목록 밖이라
-- 블록 번호 대신 -1로 이력을 남깁니다(before·after = {results, resultBand}). 그 밖의 규칙(넣기만·권한·가드 트리거)은 그대로.
-- 처음 정의(20260927150000)의 열 check(block_index >= 0)는 이름 없이 만들어 Postgres가 붙인 이름(<표>_<열>_check)입니다.

alter table public.report_draft_edits drop constraint report_draft_edits_block_index_check;
alter table public.report_draft_edits add constraint report_draft_edits_block_index_check check (block_index >= -1);

comment on table public.report_draft_edits is '경평 초안 블록 고치기 이력: 드래그 「AI 수정 요청」으로 바꾼 블록의 전후 JSON·요청·쓴 사람(되돌리기는 kind undo). 넣기만 함. block_index -1 = 추진성과 상자(전후 JSON은 {results, resultBand})';
