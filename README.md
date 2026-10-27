# 경영AI비서 — KCA 경영평가 PDCA 웹앱 (pdca-app)

> 로고: Summit Guide(정상으로 안내하는 길) — 심볼 `components/shell/brand-mark.tsx`·탭 아이콘 `app/icon.svg`, 시안 `public/sherpa-logos.html`

과제관리카드 원장, 작성지원 AI, 종합점검 AI, 12월 경영실적보고서(HWPX) 작성을 한 곳에서 처리하는 독립 웹앱입니다.
기존 claude.ai Project 4종과 Notion DB를 대체합니다. 실행 환경은 Vercel(Next.js), Supabase, Claude API입니다.

- 설계 문서: [KCA 경영평가 PDCA 웹앱 설계](https://claude.ai/artifact/VXbdXTutbkS8RhGZMN7JUp)
- 화면 디자인: [KCA 성과관리 웹앱 화면 디자인](https://claude.ai/artifact/8AwiGyTBDxAjEmJLvJQCT5) — 「v2 역할별 화면」 페이지

## 화면과 권한

역할은 부서 담당자 · 성과관리팀 · 관리자 셋이고, 윗 역할은 아랫 역할의 화면을 모두 봅니다(관리자 > 성과관리팀 > 부서 담당자). 성과관리팀·관리자는 부서 화면에서 부서를 골라 그 담당자에게 보이는 그대로 확인할 수 있습니다(읽기 전용). 자세한 표는 앱의 「도움말」(`/help`)에 있습니다.

| 역할 | 화면 |
| --- | --- |
| 부서 담당자 | 내 과제(이달 작성본 편집·제출) · 점검 결과 · 12월 보고서 초안 |
| 성과관리팀 | 현황 · 과제 원장(바로 편집·리뷰어 코멘트, 작성본 확정, 고정 영역 확정) · 카드 현행화(한글 파일) · 보관함 · 월간 점검 · 지적·과제 연결 · 12월 보고서(현황·목차·쪽 배정·리뷰) · 공통 지식 |
| 관리자 | 공통 자료·틀 · 사용자·권한 · AI 사용량 |

매월 흐름: 담당자가 카드에 이달 실적을 반영해 제출 → 성과관리팀이 원장과 비교해 확정 → 성과관리팀이 월간 점검표를 보냄 → 담당자가 확인하고 보완합니다.

### 과제관리카드 고치기

- 카드는 늘 9.16 원본 양식 그대로 보이고, 글을 누르면 그 자리에서 고칩니다(자동 저장, 수정 이력에 남음).
- 글을 끌어 고르면 도구줄이 뜹니다: **AI 수정 요청**(적은 대로 AI가 카드를 직접 고침) · **질문**(AI가 답만) · **삭제**(바로 지움, 되돌리기) · **좋음**(AI가 바꾸지 않게 표시). 코멘트는 여백에 메모로 붙고, 보낸 뒤 5초 안에는 되돌릴 수 있으며, 모인 코멘트를 AI가 한 번에 처리해 바뀐 곳을 노랗게 보여 줍니다. 반영은 코멘트마다 되돌릴 수 있습니다.
- 옆 창 「AI 작성지원」은 개선 제안(지적사항 환류·전략연계·점검 기준)·실적 발굴·실적 반영을 제안하고 「질문」으로 이어서 묻습니다. 실적 자료 파일은 창에 끌어 놓아 첨부합니다.
- 「더보기」: 한글(HWPX)로 내려받기(9.16 원본 서식 그대로 — 고쳐서 다시 올리면 바뀐 곳만 반영) · 한글 파일로 현행화(성과관리팀) · 한글 파일로 작성본 채우기(부서) · 과제 삭제(보관).

## 폴더

| 경로 | 내용 |
| --- | --- |
| `app/` | Next.js App Router. `(app)/`에 로그인한 화면들(역할별), `login`·`auth/confirm`에 매직링크 로그인 |
| `components/` | 화면 부품: `ui/kit.tsx`(공용), `shell/`(머리띠·메뉴·과제 찾기), `cards/`(원본 양식 편집기·옆 창), `inspections/`, `reports/`, `links/` |
| `lib/` | 순수 로직과 서버 조회: `auth/`(역할 계층·부서 범위), `cards/`(렌더러·편집·작성본·비교·고정 영역), `inspections/`, `reports/`, `ai/`, `knowledge/` |
| `seed/cards/260916/`(git 밖) | 2026.9.16 과제관리카드(주요사업 59개) 변환 결과(JSON·kordoc 소스·정적 조각). 담당자 실명이 있어 공개 저장소에는 없음 — 없으면 카드 원문 시험은 건너뜀 |
| `data/cards/260916/`(git 밖) | 과제관리카드 원본(hwp·pdf). 카드 변환의 입력 |
| `data/templates/`(git 밖) | 보고서 틀: 경영관리프레임워크 12개, (첨부5) 주요사업 프레임워크, 표준보고서 양식, 도식 Pool, KCA 머리 배너 |
| `resources/knowledge/` | 공통 지식 원본과 kordoc 산출물(`_parsed/`), 적재 결과(`_chunks/`). **git 제외**(운영에서는 관리자가 올림) |
| `lib/knowledge/` | 공통 지식 적재 로직(정규화·표 읽기·문서별 파서·카드 연결). 앱 서버에서도 그대로 씀 |
| `scripts/knowledge/` | 적재 CLI |
| `resources/harness/report-harness/` | report-harness 기준 문서 고정 사본(집필 규칙·문체·표·도식·팩트체크). `SOURCE.json`에 원본 커밋 |
| `resources/harness/pdca/`(git 밖) | 기관 내부 지침 사본(09·14·08·13). 앱이 실행 중에 읽음 — 공개 저장소에는 없어 받은 사본에서는 AI 작성지원·월간 점검이 동작하지 않음 |
| `lib/harness/` | 사본 목록과 규칙 읽기(`selectRules`) |
| `supabase/` | Supabase 설정과 마이그레이션(스키마·권한·저장소·한국어 검색) |
| `lib/db/`, `scripts/db/` | Supabase 적재 행 만들기와 적재 스크립트, 마이그레이션·권한 테스트(PGlite) |
| `docs/analysis/`(git 밖) | 2025 주요사업 보고서 분석, 공통 지식 5종 분석 |

## 과제관리카드 데이터 다시 만들기

`seed/cards/260916/`(git 밖, 로컬에만)에 2026.9.16 변환 결과(JSON·kordoc 소스·정적 조각)가 있습니다. 이 결과를 만든 초기 변환 파이썬(`parse_cards.py`·`render_static.py`·`build_viewer.py`)과 뷰어(`biz-260916.html`)·원본 대조 결과(`VERIFY.md`)는 2026-09-28에 지웠습니다(git 이력에만 남음). 다시 만들어야 하면 같은 3단계(kordoc 원천 파싱 → 정적 렌더 → 단일 파일 뷰어)를 python3(표준 라이브러리)와 kordoc(`npx kordoc`)으로 새로 짭니다.

## 공통 지식 적재

`resources/knowledge/_parsed/`의 kordoc 산출물을 조각(JSONL)과 검토용 CSV로 만듭니다. Node 24가 TypeScript를 바로 실행하므로 빌드 단계가 없습니다.

```bash
pnpm knowledge:ingest   # 검산에 실패하면 종료 코드 1
pnpm test               # 단위 테스트 + 원본이 있으면 통합 테스트(원본이 없어 건너뛴 시험은 끝에 목록으로 출력)
```

- 이번 범위는 주요사업입니다: 관리계획(주요사업 부분), 첨부3 실사 답변자료, 붙임5 중간보고서 지적사항. 참고1·참고3(경영관리)은 보류입니다.
- 출력은 `resources/knowledge/_chunks/`에 생깁니다.
  - `<문서>.jsonl`: 조각
  - `card-finding-links.jsonl`: 카드 지적사항 연결
  - `manifest.json`: 문서 등록 정보와 검산
  - `REPORT.md`: 요약
  - `review/*.csv`: 성과관리팀 검토용. 엑셀에서 바로 열립니다.
- 규칙의 근거는 `docs/analysis/공통지식-5종-분석.md`에 있습니다.

## Supabase

```bash
pnpm db:push                                 # 마이그레이션 적용(.env.local의 SUPABASE_DB_URL = Session pooler 주소)
pnpm knowledge:ingest && pnpm db:seed        # 카드 59장 + 공통 지식 적재
pnpm db:check-search                         # 한국어 검색 표본 확인
```

- 환경변수 이름은 `.env.example`에 있습니다.
- 첫 관리자: `pnpm db:user <메일> --role admin`. 그다음부터는 `/login`에서 기관 메일로 매직링크를 받아 들어옵니다.
- 마이그레이션과 권한은 Docker 없이 `pnpm test`가 PGlite로 확인합니다. 단, 한국어 검색(PGroonga)은 호스티드 Supabase에서만 확인할 수 있습니다.

## 개발

```bash
pnpm install
pnpm dev
pnpm test && npx tsc --noEmit -p . && pnpm lint && pnpm build
pnpm e2e        # 개발 서버를 띄운 상태에서: 역할별 화면·업무 흐름 점검(시험 계정·기록을 만들고 끝나면 되돌림)
pnpm e2e:ui     # 설치된 Chrome으로 실제 입력·버튼 흐름 + 화면 캡처
pnpm e2e:shots  # 역할별 주요 화면 캡처(디자인 검토용)
```

- AI(작성지원·리뷰어 코멘트)는 `AI_PROVIDER`로 부를 곳을 정합니다. `api`는 `ANTHROPIC_API_KEY`(모델·생각 수준은 등급별 `CLAUDE_MODEL_HEAVY`·`CLAUDE_EFFORT_HEAVY`·`CLAUDE_MODEL_LIGHT`·`CLAUDE_EFFORT_LIGHT`, 기본은 모두 `claude-sonnet-5-5` — `.env.example` 참고), `cli`는 이 컴퓨터에 로그인된 Claude Code CLI(API 키를 받기 전 임시 연결, `CLAUDE_CLI_*`로 모델·시간 조정)입니다. 비우면 키가 있으면 api, 없으면 cli입니다.

## Vercel 배포

- 별도 서버 없이 Next.js 하나로 배포합니다. 한글 파일 읽기·쓰기(kordoc)도 서버 함수 안에서 돕니다(`next.config.ts`의 `serverExternalPackages`·`outputFileTracingExcludes` 유지).
- 운영은 `AI_PROVIDER=api` + `ANTHROPIC_API_KEY`입니다(Vercel에는 Claude Code CLI가 없음).
- 서버 함수 본문은 4.5MB 한도라 큰 파일(카드 전용 자료·현행화 한글 파일)은 브라우저가 Supabase 저장소에 바로 올리고 서버가 거기서 읽습니다.

Next.js 16을 씁니다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 안내를 먼저 확인합니다(AGENTS.md). 작업 지침은 `CLAUDE.md`에 있습니다.
