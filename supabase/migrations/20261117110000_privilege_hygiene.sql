-- 권한 위생(2026-11-17 근본책 0단계 — .team 설계 「앱 서버 경유 표지」의 바닥 정리). 앱이 쓰지 않는 권한만 거둠.
--
-- 왜: 호스티드 Supabase는 public 스키마의 새 표·함수·시퀀스에 anon·authenticated·service_role 전부를 기본으로 줌
--   (alter default privileges … grant all). 그래서 운영에는 마이그레이션이 명시하지 않은 권한이 더 있었음:
--   모든 표의 TRUNCATE·REFERENCES·TRIGGER, 정책 없는 갱신·삭제(아래 ③), 시퀀스 UPDATE, anon의 시퀀스 USAGE.
--   정책이 없는 명령은 RLS가 막고 PostgREST는 TRUNCATE를 부를 길이 없어 지금 노출은 없지만, 정책 하나만 잘못 더해도 열리는 바닥이라 닫음.
--
-- 거두는 것(로그인 사용자 authenticated·비로그인 anon):
--   ① 모든 공개 표의 TRUNCATE·REFERENCES·TRIGGER, anon의 표 쓰기 전부(anon 정책 없음), 시퀀스는 authenticated에 USAGE만·anon은 전부
--   ② 앱이 쓰지 않는 표의 쓰기: teams·knowledge_card_links·card_knowledge_select(스크립트는 서비스 키 — 영향 없음)
--   ③ 정책 없는 명령: ai_requests 삭제(쓰기는 rpc만), ai_results 갱신, card_edits 삭제(카드 삭제 연쇄는 권한 검사 없이 됨),
--      profiles 넣기·삭제(가입 트리거·서비스 키), report_draft_edits 갱신·삭제
--   ④ 앞으로 만드는 표·시퀀스·함수는 기본으로 닫힘: public의 기본 권한에서 anon·authenticated를 빼고,
--      함수의 전역 기본 실행 권한(PUBLIC)도 뺌 — 새 표·rpc는 마이그레이션이 필요한 만큼 명시적으로 grant 해야 함.
--      private 스키마 함수(RLS 정책·저장소 정책이 부르는 판정 함수)는 로그인 사용자가 실행해야 하므로 private의 기본 실행 권한을 authenticated에 줌.
--      트리거 함수는 실행 권한 검사 없이 불림. service_role의 기본 권한은 그대로(적재 스크립트·처리기).
--   정책(teams_write 등)은 그대로 둠 — 권한이 없어 쓰이지 않음(지우는 것은 3단계 구조 시험 때 함께 판단).
--   기대 목록은 lib/db/grants.test.ts가 고정함(권한을 넓히는 마이그레이션은 그 시험부터 고쳐야 함).
--
-- 쓰는 곳 대조: 위 표·명령을 사용자 권한으로 쓰는 앱 경로 0곳(2026-11-17 grep — app·lib·components). 스크립트(scripts/db/mgmt-cards.ts teams,
--   scripts/knowledge/select-build.ts card_knowledge_select, e2e profiles)는 서비스 키.
--
-- 운영 반영 순서: 순서 무관(앱이 쓰지 않는 권한만) — 배포와 상관없이 pnpm db:push.
--   기본 권한(④)은 마이그레이션을 돌리는 역할(postgres)의 것만 바뀜. 대시보드 SQL 편집기 등 다른 역할이 만드는 표는 해당 없음(스키마는 마이그레이션에만 씀).
--
-- 되돌리기(down):
--   grant truncate, references, trigger on all tables in schema public to authenticated;
--   grant insert, update, delete on public.teams, public.knowledge_card_links, public.card_knowledge_select to authenticated;
--   grant delete on public.ai_requests, public.card_edits to authenticated;
--   grant update on public.ai_results to authenticated;
--   grant insert, delete on public.profiles to authenticated;
--   grant update, delete on public.report_draft_edits to authenticated;
--   grant select, update on all sequences in schema public to authenticated;
--   alter default privileges in schema public grant all on tables to anon, authenticated;
--   alter default privileges in schema public grant all on sequences to anon, authenticated;
--   alter default privileges in schema public grant all on functions to anon, authenticated;
--   alter default privileges grant execute on functions to public;
--   alter default privileges in schema private revoke execute on functions from authenticated;
--   (anon 쪽은 되돌리지 않음 — 원래 anon 정책이 없어 쓸 데가 없음)

-- ── ① 모든 공개 표·시퀀스 ───────────────────────────────────────────────────────────────────
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke select, update on all sequences in schema public from authenticated;

-- ── ② 앱이 쓰지 않는 표 ────────────────────────────────────────────────────────────────────
revoke insert, update, delete on public.teams, public.knowledge_card_links, public.card_knowledge_select from authenticated;

-- ── ③ 정책 없는 명령 ───────────────────────────────────────────────────────────────────────
revoke delete on public.ai_requests from authenticated;
revoke update on public.ai_results from authenticated;
revoke delete on public.card_edits from authenticated;
revoke insert, delete on public.profiles from authenticated;
revoke update, delete on public.report_draft_edits from authenticated;

-- ── ④ 앞으로 만드는 것은 기본으로 닫힘 ─────────────────────────────────────────────────────
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;
alter default privileges revoke execute on functions from public;
alter default privileges in schema private grant execute on functions to authenticated;
