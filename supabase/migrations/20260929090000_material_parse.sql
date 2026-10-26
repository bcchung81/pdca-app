-- 참고자료 설계 1단계(docs/reference-materials.md §4.1·§6·§7): 첨부는 올릴 때 kordoc으로 한 번 읽어 전체 글을 저장하고,
-- AI 요청 때는 저장본만 씀(자르지 않음). 저장본이 없거나 파서 판이 다르면 요청 때 읽어 채움.
-- card_materials는 sha256·parsed_text·parse_status가 이미 있음(0925 core) — 판·시각·실패 사유·글자 수를 더함
alter table public.card_materials
  add column parser_version text,
  add column parsed_at timestamptz,
  add column parse_error text,
  add column parsed_chars integer;

alter table public.report_materials
  add column sha256 text,
  add column parsed_text text,
  add column parse_status text not null default 'pending' check (parse_status in ('pending', 'parsed', 'failed')),
  add column parser_version text,
  add column parsed_at timestamptz,
  add column parse_error text,
  add column parsed_chars integer;

-- 로그인 사용자는 읽은 글 칸만 고침(파일 경로·소속 카드·보고서는 못 바꿈). 어느 행인지는 RLS 정책이 정함
-- (card_materials_update = 그 카드를 쓸 수 있는 사람, report_materials_update = 그 보고서 내용을 고칠 수 있는 사람)
revoke update on public.card_materials from authenticated;
grant update (sha256, parsed_text, parse_status, parser_version, parsed_at, parse_error, parsed_chars) on public.card_materials to authenticated;
revoke update on public.report_materials from authenticated;
grant update (sha256, parsed_text, parse_status, parser_version, parsed_at, parse_error, parsed_chars) on public.report_materials to authenticated;
create policy report_materials_update on public.report_materials for update to authenticated
  using (private.can_edit_report_content(report_id)) with check (private.can_edit_report_content(report_id));

-- 캐시 쓰기 중 1시간 캐시 몫(단가가 입력의 2배 — 5분 캐시는 1.25배). cache_write_tokens는 5분+1시간 합계 그대로
alter table public.ai_requests add column cache_write_1h_tokens integer;
