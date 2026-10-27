# 데이터베이스(Supabase)·로그인(매직링크)

CLAUDE.md의 「데이터베이스(Supabase)」·「로그인(Supabase 매직링크)」 절 원문입니다(2026-10-17에 CLAUDE.md를 줄이며 옮김).

## 데이터베이스(Supabase)

- 스키마는 `supabase/migrations/`에만 씁니다. 대시보드에서 직접 바꾸지 않습니다.
- 모든 테이블에 RLS를 켭니다. 권한 판정은 `private` 스키마 함수(`can_read_card` 등)로 합니다. 새 테이블·정책을 만들면 `lib/db/migrations.test.ts`에 역할별 사례를 더합니다.
- 저장소 키에는 한글을 쓰지 않습니다(카드는 `uid`).
- 비밀 키(`SUPABASE_SECRET_KEY`)는 서버·스크립트에서만 씁니다. `NEXT_PUBLIC_*`로 내보내지 않습니다. 서비스 키 클라이언트(`lib/supabase/admin.ts`)는 Auth 관리 API가 필요할 때만, 관리자 확인(`requireRole`) 뒤에 씁니다. 데이터 수정은 로그인 사용자 권한으로 해서 RLS가 판정하게 합니다.
- 업무 규칙은 서버 액션과 DB 트리거 둘 다에 둡니다(API로 바로 쓰거나 읽고-쓰기 사이에 끼어들어도): 보고서 전이 표·확인한 점검표 잠금(`20261010110000`), 작성본 식별 칸(새 작성본의 id·group·taskNo = 원장, 고칠 때 과제·식별 칸 불변 — 성과관리팀도)·마지막 활성 관리자(`20261010120000`). **부서 직접 확정(`20261027110000`, 2026-10-27)**: 부서 담당자도 자기 담당 활성 카드(`can_write_card`)의 원장을 고치되 트리거 `guard_card`가 내용(`data`·`title`·`data_rev`+1·`updated_by` 본인·`original_html` 비움)만 허용하고 그 밖의 열·식별 칸·잠긴 고정 영역은 거절(정책 `cards_dept_update`), 작성본 트리거 `guard_card_version`은 부서의 작성 중 → 확정(확정자 본인)을 허용, 이력 `card_edits`는 부서 insert 정책(`card_edits_dept_insert`), 보고서 전이 표 `report_transition_ok`에 작성 중 → 승인(부서 확정)·승인 → 작성 중(확정 취소)을 더하고 `guard_report`가 승인자·승인 시각을 지킴(확정한 보고서의 내용은 확정 취소 뒤 고침). 보낸 점검표 잠금 `20261027100000`은 성과관리팀의 내용 변경도 거절. 이 둘은 운영 반영 순서가 있음(`docs/ops/운영-전환.md` 「부서 확정 반영」). 트리거 메시지와 서버 문구를 맞춥니다. 이 둘과 `20261010100000`(AI 호출 진행 중 기록)은 운영 반영 2026-10-10 — 새 코드가 의존하므로 새 DB에도 코드보다 먼저 `pnpm db:push`. 지표 단위 부분 표 `eval_unit_report_parts`(`20261016100000` — 경영관리 R5b 뒷단, 권한·가드는 `docs/design/report-draft.md` 「R5b 뒷단」)는 운영 반영 2026-10-16(사용자 승인) — 화면 `/reports/business/<지표>/parts`가 의존.
- PGroonga 검색(`*_search*.sql`)은 PGlite에 없어서 호스티드에서 `pnpm db:check-search`로 확인합니다.
- 검색 질의는 반드시 `lib/knowledge/search-query.ts`의 `buildSearchQuery`로 만듭니다. 질의 전체를 정규화하면 `OR`가 낱말 `or`가 됩니다. 긴 실사 답변이 점수를 가져가므로 지적을 찾을 때는 `unit_types`로 거릅니다.
- DB 연결은 Session pooler 주소를 씁니다. 직접 연결(`db.<ref>.supabase.co`)은 IPv6 전용이라 이 네트워크에서 붙지 않습니다.

## 로그인(Supabase 매직링크)

- 기관 메일(`ALLOWED_EMAIL_DOMAINS`, 기본 `kca.kr`)은 처음 로그인할 때 계정이 생깁니다(`dept_user`·부서 미지정 → 팀이 정해지기 전에는 카드가 안 보임). 그 밖의 주소는 관리자가 미리 만든 계정만 로그인합니다(`otpPolicy`).
- **사용 중지된 계정**(`profiles.active = false`)은 `requireUser`가 안내가 붙은 `/login?blocked=1`로 보내고(앱 틀·첫 화면도 메뉴를 안 그림), DB는 `my_role()`이 비어 데이터를 막으며, 로그인 링크는 Supabase auth ban으로 막습니다(`setUserActive`).
- **메일 링크가 돌아올 주소는 호출한 주소 기준**(2026-10-12 — `lib/auth/redirect.ts requestOrigin`): 요청 호스트가 이 앱의 주소(`NEXT_PUBLIC_SITE_URL`·Vercel이 넣는 `VERCEL_URL`·`VERCEL_BRANCH_URL`·`VERCEL_PROJECT_PRODUCTION_URL`·localhost)일 때만 그 주소, 아니면 `NEXT_PUBLIC_SITE_URL`(호스트 헤더로 로그인 링크를 남의 주소로 돌리는 것 방지). Supabase Redirect URLs 허용 목록에 그 주소가 있어야 하고(없으면 Site URL 루트로 `/?code=`가 옴 — `proxy.ts`가 `authCallbackSearch`로 `/auth/confirm`에 넘김). 운영 주소·허용 목록은 `docs/ops/운영-전환.md` §2
- 메일 링크는 `/auth/confirm`에서 **버튼을 눌러야** 로그인합니다. 기관 메일 보안 검사기가 링크를 미리 열어도 일회용 토큰이 소모되지 않게 하려는 것입니다. `token_hash`(권장 메일 양식)와 `code`(기본 양식, PKCE) 둘 다 받습니다.
- 세션 갱신과 로그인 전 차단은 `proxy.ts`가 하고(Next 16에서 middleware 대신 proxy — 로그인 없이 열리는 경로는 `lib/auth/public-paths.ts`의 `/login`·`/auth/…`·`/api/prep/run`뿐, 로그인 뒤 돌아갈 주소는 `safeNext`(`lib/nav/return-to.ts isSafeAppPath` — 앱 안 경로만)), 사용자·역할 조회는 `lib/auth/dal.ts`의 `getCurrentUser`·`requireUser`로 데이터 가까이에서 합니다. 권한의 최종 판정은 RLS입니다.
- 서버 액션은 공개 API처럼 다룹니다. 액션 안에서 사용자를 다시 확인합니다.

