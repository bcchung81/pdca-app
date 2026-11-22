-- QA 라운드(2026-11-22) DB 고침 — 앱 코드 변경 없음.
--
-- ① 카드 영구 삭제 정책(cards_delete — 20261117140000)을 서버 규칙과 같게 좁힘(QA Q1-03).
--   예전 식(private.is_staff() and private.app_write())은 성과관리팀 이상이면 상태와 무관하게 카드 행을 지우게 해서,
--   「완전 삭제는 관리자만 + 보관한 카드만」(CLAUDE.md 카드 현행화·보관)을 서버 purgeCard(app/(app)/cards/archive-actions.ts)만 지켰음.
--   카드 행이 지워지면 작성본·점검표·이력·자료 행이 on delete cascade로 같이 사라져 되돌릴 수 없으므로 DB도 같은 규칙으로 막음:
--   관리자(private.is_admin())의 보관 카드(status = 'retired')만, 앱 서버 경유 표지(private.app_write())는 그대로 맨 위 AND 항.
--   앱에서 카드 행을 지우는 곳은 purgeCard 하나(관리자·보관 확인 뒤 .eq("status", "retired")로 지움)라 앱 동작은 같음.
--   서비스 키·직접 연결(스크립트)은 RLS 밖이라 영향 없음. 연쇄 삭제는 참조 무결성 동작이라 다른 표의 정책을 거치지 않음(예전과 같음).
--   grant·트리거는 바꾸지 않음. 역할별 사례는 lib/db/migrations.test.ts 「카드 영구 삭제 정책(20261122120000)」.
--
-- 운영 반영 순서: 앱 코드 변경이 없으므로 순서 무관 — 배포 없이 pnpm db:push만.
-- 확인: select qual from pg_policies where schemaname = 'public' and tablename = 'cards' and policyname = 'cards_delete';
-- 되돌리기(down):
--   alter policy cards_delete on public.cards using (private.is_staff() and private.app_write());

alter policy cards_delete on public.cards
  using (private.is_admin() and status = 'retired' and private.app_write());
