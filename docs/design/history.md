# 저장소 개요·명령·작업 방식 이력

CLAUDE.md의 「이 저장소가 무엇인가」·「명령」·「작업 방식」·「저장소 경계」 절을 줄이며 옮긴 상세입니다. 맞는 기능 문서가 없는 내용을 여기에 둡니다.

## CLAUDE.md에서 옮긴 상세 (2026-10-17)

CLAUDE.md를 40KB 이하로 줄이면서 옮긴 날짜별 결정 배경·실측·이력·긴 근거입니다. 문장은 원문 그대로이고, 줄 앞 **[…]**는 CLAUDE.md 원래 줄의 머리말입니다(같은 줄의 빠진 문장만 모았음).

### 이 저장소가 무엇인가

- **[KCA 경영평가 PDCA 운영]** KCA 경영평가 PDCA 운영(claude.ai Project 4종 + Notion DB 4개)을 대체하는 **독립 웹앱(운영)**입니다. 서비스 이름은 **「경영평가 Sherpa」**(영문 Sherpa
- **[기술 구성]** - 기술 구성: Vercel(Next.js 16), Supabase(Postgres·Auth·Storage), Claude API
- **[기능: 과제관리카드 원장, 작성지원 AI, 종합점검 A]** - 기능: 과제관리카드 원장, 작성지원 AI, 종합점검 AI, 12월 경영실적보고서(HWPX)
- **[지금 PoC 범위는 주요사업]** - 지금 PoC 범위는 **주요사업**(카드 59장)입니다. 경영관리 카드 43장은 2026-10-07에 8월 점검 자료로 원장에 들어 있고 카드 원장·한글 현행화·공통 지식(지표 1~14)·AI 작성지원(지침 08)·월간 점검(지침 13)까지 지원하며(아래 「카드 현행화」·「월간 점검」), 경평 초안은 아직 없습니다. 확장 설계는 `docs/plan/경영관리-트랙확장-설계.md`(승인 전
- **[설계 문서]** - 설계 문서: https://claude.ai/artifact/VXbdXTutbkS8RhGZMN7JUp · 화면 디자인(「v2 역할별 화면」, C3 교정쇄 스튜디오): https://claude.ai/artifact/8AwiGyTBDxAjEmJLvJQCT5

### 명령·작업 방식

- **[pnpm knowledge]** pnpm knowledge:add <파일> --title "제목" --scope <범위> [--dry-run]   # 일반 문서 한 개를 공통 지식에 올림(큰 PDF는 이쪽).
- **[pnpm knowledge]** pnpm knowledge:images <문서 id> [--dry-run]   # 이미 올린 일반 문서(up-…)의 그림을 저장소 원본에서 다시 꺼내 조각 meta.images·버킷에 붙임(글·쪽 불변, 운영 DB에 씀
- **[pnpm knowledge]** pnpm knowledge:prune-images [--doc <문서 id>] [--write]   # 버킷에 있지만 지금 조각이 안 가리키는 공통 지식 그림 정리(기본 드라이런, --write면 운영 버킷에서 지움)
- **[운영 DB 보호(`DB_TARGET`)]** 개발 DB가 생기면 그 `.env.local`에 `DB_TARGET=development`.
- **[운영 배포]** **운영 배포**: Vercel·Supabase·Claude API 설정, 계정·환경변수, 비용 어림, 배포 뒤 점검 순서는 `docs/ops/운영-전환.md`를 따릅니다. 서버 오류는 `instrumentation.ts`(`onRequestError`)가 한 줄 JSON 로그(경로·오류 번호 digest 쿼리·쿠키·헤더 없음, `lib/ops/error-log.ts`)로 남기고, 루트까지 깨지면 `app/global-error.tsx`가 오류 번호를 보여 줌.
