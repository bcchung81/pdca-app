@AGENTS.md

# CLAUDE.md

이 파일은 이 저장소에서 일하는 Claude Code에게 주는 작업 지침입니다. 문서·주석·커밋 메시지는 한국어로 씁니다. 기능별 상세는 `docs/design/`에 있고, 여기에는 요약과 「어기면 깨지는 것」만 둡니다.

## 행동 지침

LLM이 코딩할 때 흔히 하는 실수를 줄이기 위한 지침입니다. 속도보다 신중함 쪽으로 기울어 있으니, 사소한 일은 판단해서 줄여 적용합니다.

**1. 코딩 전에 생각합니다.** 추측하지 않고, 헷갈림을 숨기지 않고, 선택지의 대가를 드러냅니다.
- 가정은 명시합니다. 불확실하면 묻습니다.
- 해석이 여러 개면 조용히 하나를 고르지 말고 제시합니다.
- 더 단순한 방법이 있으면 말하고, 타당하면 반대합니다.
- 불분명하면 멈추고, 무엇이 불분명한지 짚어서 묻습니다.

**2. 단순함이 먼저입니다.** 문제를 푸는 최소한의 코드만 씁니다. 추측으로 넣는 것은 없습니다.
- 요청받지 않은 기능, 한 번만 쓰는 코드의 추상화, 요청하지 않은 "유연성"·설정 항목을 넣지 않습니다.
- 일어날 수 없는 상황의 오류 처리를 넣지 않습니다.
- 200줄을 썼는데 50줄로 되면 다시 씁니다. "시니어 엔지니어가 과하다고 할까?"에 그렇다면 줄입니다.

**3. 외과적으로 고칩니다.** 꼭 필요한 곳만 건드리고, 내가 어지른 것만 치웁니다.
- 인접한 코드·주석·서식을 "개선"하지 않고, 망가지지 않은 것을 리팩터하지 않습니다. 내 취향과 달라도 기존 스타일을 따릅니다.
- 관련 없는 죽은 코드를 보면 지우지 말고 알립니다.
- 내 변경 때문에 안 쓰게 된 import·변수·함수는 지웁니다. 원래 있던 죽은 코드는 요청이 없으면 둡니다.
- 기준: 바뀐 모든 줄이 사용자의 요청으로 거슬러 올라가야 합니다.

**4. 목표를 정하고 검증될 때까지 돕니다.** 일을 검증 가능한 목표로 바꿉니다.
- "검증 추가" → 잘못된 입력 테스트가 통과 / "버그 수정" → 버그를 재현하는 테스트가 통과 / "리팩터" → 전후 테스트가 통과.
- 테스트를 먼저 쓰는 순서(실패 확인 → 구현)는 사용자가 TDD를 요청할 때만 따릅니다. 기본은 구현한 뒤 테스트로 고정하고 검증합니다.
- 여러 단계 작업은 짧은 계획으로 적습니다: `1. [단계] → 검증: [확인]`. 성공 기준이 약하면("되게 해") 계속 되묻게 되니 먼저 강하게 정합니다.
- **완료 보고 전에** `pnpm test`·`npx tsc --noEmit -p .`·`pnpm lint`를 돌리고, 화면이나 설정을 바꿨으면 `pnpm build`·`pnpm e2e`도 돌립니다. 실패는 실패라고 적습니다.

이 지침이 지켜지면 diff의 불필요한 변경과 과복잡해서 다시 쓰는 일이 줄고, 질문이 실수 뒤가 아니라 구현 전에 나옵니다.

## 이 저장소가 무엇인가

KCA 경영평가 PDCA 운영(claude.ai Project 4종 + Notion DB 4개)을 대체하는 **독립 웹앱(운영)** **「경영평가 Sherpa」**(옛 이름 「진짜최종」)입니다. 과제관리카드 원장, 작성지원 AI, 종합점검 AI, 12월 경영실적보고서(HWPX) 작성. Vercel(Next.js 16)·Supabase(Postgres·Auth·Storage)·Claude API.

- 역할은 셋뿐입니다: 부서 담당자(`dept_user`) · 성과관리팀(`pmo`) · 관리자(`admin`). **윗 역할은 아랫 역할의 화면을 모두 봅니다**(`lib/auth/access.ts`의 `atLeast`)
- 범위: **주요사업**(카드 59장)과 **경영관리**(카드 43장 — 카드 원장·한글 현행화·공통 지식·AI 작성지원(지침 08)·월간 점검(지침 13)·경평 초안). 확장 설계 `docs/plan/경영관리-트랙확장-설계.md`
- 「경영평가 Sherpa」는 탭 제목·README 제목의 이름이고 머리띠·로그인 카드 로고(`BrandLogo`)는 「Sherpa / 경영평가 Agent」입니다. 저장소 이름 `pdca-app`, 산출물 제목, AI 프롬프트의 「KCA 경영평가 성과관리 웹앱」 설명 문구는 이름이 아니라 기능 설명이라 그대로 둡니다(프롬프트를 바꾸면 판 해시가 바뀜)

**실행 의존 금지.** 앱은 실행 중에 report-harness, 로컬 파이썬, Claude Code, `../` 경로를 쓰지 않습니다. 필요한 기준은 이 저장소 안의 고정 사본으로, 필요한 도구는 npm 의존성으로만 씁니다.

상세(옛 이름·브랜드·명령 배경): `docs/design/history.md`

## 명령

```bash
pnpm dev                     # 개발 서버
./run-app.sh [dev|prod|check|stop]   # 실행 전 점검(Node 24·pnpm·의존성·.env.local) 뒤 실행, stop은 이 앱 서버만(PORT로 포트)
pnpm build                   # 운영 빌드(타입 검사 포함)
pnpm lint
pnpm test                    # 단위·통합·DB(PGlite) 테스트 전부 — 끝에 건너뛴 시험(git 밖 원본 없음 등)을 이름·이유로 출력
npx tsc --noEmit -p .

pnpm knowledge:parse [--images|--force|--doc <id>]   # 공통 지식 원본 → kordoc 산출물(`_parsed`, 없는 것만) / 그림만 꺼냄
pnpm knowledge:ingest        # 공통 지식 적재(검산 실패면 종료 코드 1)
pnpm knowledge:add <파일> --title "제목" --scope <범위> [--dry-run]   # 일반 문서 한 개를 공통 지식에 올림(범위: institution·common-kpi·bonus·BZ-1~3·search-only)
pnpm knowledge:images <문서 id> [--dry-run]   # 올린 일반 문서(up-…)의 그림을 원본에서 다시 꺼내 조각 meta.images·버킷에 붙임(운영 DB에 씀 — 먼저 --dry-run)
pnpm knowledge:prune-images [--doc <문서 id>] [--write]   # 조각이 안 가리키는 버킷 그림 정리(기본 드라이런, --write면 운영 버킷에서 지움)
pnpm harness:sync            # report-harness 기준 문서 사본 갱신
pnpm db:seed --dry-run       # 적재 건수 확인(접속 안 함)
pnpm db:seed                 # 카드까지 덮어씀 — 운영 DB에는 쓰지 않음
pnpm db:seed --knowledge-only   # 공통 지식만 — 운영 DB 공통 지식 갱신은 이것으로(`--doc <문서 id>`를 더하면 그 문서만)
pnpm db:push                 # 마이그레이션 적용(.env.local의 SUPABASE_DB_URL, 없으면 link한 프로젝트)
pnpm db:check-search         # 호스티드 한국어 검색 표본 확인
pnpm prep status|enqueue --match|run [--ai]   # 과제 매칭 작업(prep_jobs) — 처리는 --ai가 있어야 돎(운영 DB에 씀, 건수 확인·승인 뒤)
pnpm db:user <메일> --role admin|pmo|dept_user [--team 팀명]   # 초기 관리자 지정용(평소에는 「사용자」 화면)
pnpm db:layout [--dry-run] [--all] [--card 1-가]   # 카드 원본 배치(cards.layout)·그림 채우기(카드 JSON은 안 건드림)
pnpm e2e                     # pnpm dev 대상 역할별 화면·업무 흐름 점검(호스티드 DB에 시험 계정·기록을 잠시 만들고 되돌림)
pnpm e2e:ui                  # 로컬 Chrome(헤드리스)으로 실제 입력·버튼 흐름 + 단계별 캡처(되돌림)
pnpm e2e:shots               # 역할별 주요 화면 캡처 + 브라우저 콘솔 오류(VW·VH로 폭·높이)
```

**운영 DB 보호(`DB_TARGET`)**: `production`|`development`(**비어 있으면 production**). production이면 `pnpm e2e`·`e2e:ui`·`e2e:shots`·전체 `pnpm db:seed`는 실행 전에 멈춥니다(`scripts/lib/db-target.ts` `guardProduction`) — 정말 필요하면 `--allow-production`. 개발 DB의 `.env.local`에는 `DB_TARGET=development`. 운영 관리 명령(db:push·db:user·db:layout·knowledge:*·harness:sync·db:check-search·`db:seed --dry-run|--knowledge-only`)과 읽기만 하는 `scripts/smoke/*`·`scripts/eval/*`는 막지 않습니다.

**운영 배포**: 설정·환경변수·배포 뒤 점검 순서는 `docs/ops/운영-전환.md`를 따릅니다. 서버 오류는 `instrumentation.ts`(`onRequestError`)가 한 줄 JSON 로그로 남깁니다. 앱이 읽는 환경변수는 모두 `.env.example`에 적음(`lib/ops/env-keys.test.ts`).

Node 24가 TypeScript를 빌드 없이 바로 실행합니다(`"type": "module"`, 상대 import는 `.ts` 확장자까지 적음). 열거형·네임스페이스 같은 타입 제거가 안 되는 문법은 쓰지 않습니다.

`pnpm e2e`는 시험 카드(주요사업1/1-가)에 운영 기록이 있거나 그 해 보고서가 이미 있으면 아무것도 바꾸지 않고 멈춥니다. 서버 액션은 개발 빌드의 `server-reference-manifest.json`에서 ID를 찾아 부릅니다.

## 작업 방식(에이전트 분업)

**지시받은 작업은 난이도에 맞춰 서브에이전트로 실행합니다.** 사용자가 지시한 작업은 난이도에 따라 모델과 effort를 정해 서브에이전트(Agent 도구의 `model`·`effort`)로 실행합니다(2026-10-10 사용자 지시 — 예전 「최소 sonnet·haiku 금지」와 「위임하지 않는 일」 목록을 대신함).

| 난이도 | 예 | 모델 · effort |
|---|---|---|
| 쉬움 | 정해진 절차, 한두 파일 수정, 찾기, 규칙이 분명한 변환 | haiku · low |
| 보통 | 여러 파일 수정, 도구·시험 작성, 웹 자료 받기, 규칙이 정해진 대조 | sonnet · medium |
| 어려움 | 외부 API 의미 해석, 재현성·정합성 보장, 여러 시스템을 엮는 설계 판단 | opus · high |
| 매우 어려움 | 운영·데이터에 되돌리기 어려운 영향, 원인 불명 장애 | opus · xhigh |

- 메인 대화는 계획·작업 분할·지시·결과 검토·통합·사용자 보고를 맡습니다. 서브에이전트의 결과는 그대로 믿지 않고 시험·실행으로 확인합니다.
- 서브에이전트는 대화 맥락을 모릅니다. 지시문에 목표, 입력과 출력 경로, 고치면 안 되는 파일, 성공 기준(시험), 보고 형식을 적습니다.
- 서로 독립인 작업은 한 번에 병렬로 띄우고, 앞 결과가 필요한 작업은 그 결과를 본 뒤 띄웁니다. 같은 파일을 두 에이전트에게 맡기지 않습니다.
- ego lite를 쓰는 작업은 한 번에 한 에이전트만 맡깁니다(같은 작업 공간을 다툼).
- 커밋·푸시·배포는 서브에이전트에게 맡기지 않습니다. 메인이 사용자 지시를 받고 합니다.
- 질문에 답하기·짧은 확인처럼 작업이 아닌 것은 메인이 직접 합니다.
- 에이전트 종류(`.claude/agents/` — `pdca-worker` 고치기·`pdca-checker` 점검 실행(고치지 않음)·`pdca-scout` 읽기 전용 찾기)는 도구 묶음으로 고르고, 모델·effort는 위 표대로 Agent 도구의 `model`·`effort`로 줍니다(정의 파일의 모델보다 앞섬).

## 아키텍처

각 절은 「어기면 깨지는 것」만 둡니다. 날짜별 결정 배경·실측·이력은 절 끝의 상세 문서에 있습니다.

### 트랙 스펙(`lib/tracks`)

트랙(주요사업/경영관리)별로 달라지는 것(공통 지식 조회 트랙·지침 사본·점검표 양식 id)은 코드에 못박지 않고 `TrackSpec`(`BIZ_TRACK`·`MGMT_TRACK`)에서 받습니다. 평가단위 id가 `MG-…`면 경영관리(`trackSpecOfUnit`), 아니면 주요사업, 안 정한 곳은 `DEFAULT_TRACK`.
- 주요사업 값은 예전 리터럴 그대로라 **동작이 바뀌지 않아야** 함(`tracks.test.ts`). 경영관리는 지침 08·13 사본과 `-mg` 프롬프트 폴더를 쓰고 주요사업 프롬프트·판은 그대로. 평가단위 id 타입 `UnitId`, 주요사업 전용은 `BusinessId`
- **공통 지식은 트랙별로 분리**: 층 판정은 평가단위 트랙의 조각만, 크기 보호(40만 자)는 `TrackSpec.sharedUnits`별로, 과제 매칭은 같은 트랙 카드에만, 올릴 때 크기 보호는 모든 트랙 조각(`loadBundleChunks(db, "all")`)을 넘김

상세: `docs/design/tracks.md`

### 판단은 기준 문서, 실행은 결정론 코드

"매번 같은 결과여야 하는가"로 정합니다. LLM이 읽고 판단하는 기준은 `resources/harness/report-harness/*.md`(사본 — 손 수정 금지)와 `resources/prompts/`(고쳐도 됨, 코드에 지시문을 쓰지 않음). 판단이 끼면 안 되는 일(파싱·정규화·조각화·연결·검산·권한·HWPX 양식 정합)은 `lib/`의 코드와 테스트로 둡니다.

### AI 프롬프트(`resources/prompts/`)

- 지시문은 **코드에 쓰지 않고** `<기능>/`의 `system.md`·`request.md`·`schema.md`에 둠(문법·편집 규칙 `resources/prompts/README.md`, 경영관리는 `-mg` 폴더, 공통 조각 `_shared`). 풀이 `lib/prompts/template.ts`·`load.ts`·`sets.ts`, 없는 `{{이름}}`은 오류
- 기능 모듈(`writer`·`chat`·`comments`·`inspect`·`section`)은 순수로 두고 묶음을 인자로 받음(`*_PROMPT_SPEC`). 판 `<기능>@해시8`은 프롬프트를 고치면 바뀜(경평 초안은 `promptVersion`)

### report-harness 반영(고정 사본)

`resources/harness/report-harness/`는 기준 문서 사본(원본 커밋·해시 `SOURCE.json`)이고 `lib/harness/harness.test.ts`가 해시를 대조합니다.
- **사본은 손으로 고치지 않음** — report-harness에서 고치고 커밋한 뒤 `pnpm harness:sync`. 파이썬 스크립트(`audit_style`·`lint_md_profile`·`postprocess_hwpx`)는 들여오지 않고 TypeScript로 옮기며 주석에 규칙 번호
- **pdca 지침 사본(09·14·08·13)은 노션 제외 가공본**(`resources/harness/pdca/PROCESSING.md`, `SOURCE.json` `raw_sha256`). 번호로 참조되는 줄(14의 절대원칙 8·11)은 줄을 지우지 않고 문구만 뺌. **`pnpm harness:sync pdca`는 쓰지 않음**(`../pdca` 9/17판이 가공본을 덮어씀)

상세: `docs/design/harness-prompts.md`

### AI 작성지원(카드 본문)

카드 옆 창 「AI 작성지원」 탭(`lib/ai/writer.ts`·`context.ts`·`run.ts`, 서버 액션 `runCardAssist`). 시스템 프롬프트 = 적응문 + 지침 09 전문 + 문체 기준(지침 본문은 고치지 않고 달라지는 점만 적응문에). 답은 zod 구조화 출력, 인용은 근거와 대조해 「원문 확인/다름」을 표시하고 카드 반영 제안은 실제 있는 칸 경로만 켬.
- 지침 09·14의 '대상사업'(3개뿐)과 카드 '대상사업' 칸은 다른 개념 — 적응문에 구분하고 `cardOutline`에 주요사업 이름을 먼저 적음(공통 지식·월간 점검도)
- 요청 종류는 개선 제안·실적 발굴·실적 반영·보완 점검·질문 다섯뿐(`WRITER_MODES` + 질문, 옛 이름 `LEGACY_MODES`는 옛 기록만). 카드 반영 제안은 8건까지(`SUGGESTION_MAX`)
- **보완 점검**: 최종 점검표 미흡 행을 코드가 id(`axes.4`)로 뽑고 AI는 판단어(반영됨·일부 반영·미반영·확인 불가)·인용·남은 할 일만 냄. 행 채우기·인용 대조·건수는 `lib/ai/followup.ts`, 공식 판정 아님. 점검표 없거나 미흡 0건이면 AI 안 부름
- 카드 전용 자료는 그 카드의 `card_materials` 안에서만 사용자 권한으로 읽음. 첨부는 올릴 때 kordoc으로 읽어 전체 글 저장(`parsed_text`, `PARSER_VERSION`), 요청 때는 **자르지 않음**(`loadMaterialTexts`) — 대신 요청 전체가 `INPUT_BUDGET` 40만을 넘으면 멈춤(`BudgetError`). `ASSIST_TEXT_MAX`는 화면 maxLength와 서버 자르기가 같은 값
- 이미지·스캔 PDF 첨부는 light 모델(`material_describe`)이 적은 그림 설명이 전체 글(표지 「[그림 설명 — AI가 … 적은 글입니다]」, 원문 인용 금지). **API 경로에서만**(CLI·일시 오류는 `pending`)
- Vercel(`VERCEL`)에서는 늘 `api`. 모델·effort·출력 상한은 `lib/ai/models.ts`의 `FEATURE_TIER`·`FEATURE_EFFORT`(월간 점검 `xhigh`)·`FEATURE_MAX_TOKENS`(환경변수 `CLAUDE_MODEL_HEAVY` 등이 앞섬)
- 호출 기록 `ai_requests`는 토큰·오류·소요 시간만. **부르기 전에 running 행**(`startAiRequest`), 제한 1분 5회 + 동시 2건(`AI_LIMITS`). `duration_ms`는 래퍼 `finish`가 계산하고, 래퍼를 안 거치는 직접 insert(`prep_match`·`material_describe`)는 호출부가 잰 ms를 남김
- 진행 줄(`AiProgress`)은 서버가 실제로 넣는 자료와 같게만 적고 지어내지 않음. **카드 배율은 0.6~1.1배까지**

### AI 작성지원 「질문」·카드 리뷰어(코멘트)

「질문」(`runCardChat`, `lib/ai/chat.ts`)은 카드를 고치지 않고 답 `{answer}`(마크다운)만 냄. 점검결과를 물으면 판단·문장을 바꾸지 않고(요약·수정·재판정 금지) 배치만 정리, 계산값은 계산값이라고 밝힘. 서버는 대화 본문을 저장하지 않고(sessionStorage, `card_chat`은 토큰만) 최근 8턴·2.4만 자만 받음(`cleanHistory`).
카드 리뷰어(`runCardComments`): 한 번에 최대 12개, 합치기는 「보낼 때 값 = 지금 값」일 때만(아니면 「충돌」). 서버는 카드를 직접 저장하지 않고 `saveCard`·`saveDraft` 경로로만 반영하며, 부서 작성본의 잠긴 고정 영역은 AI가 못 고침(`fixedSectionsOf`, `editTargets(card, locked)`). 삭제는 AI 없이 바로(「되돌리기」), 「좋음」은 다음 요청의 「유지할 부분」.

상세: `docs/design/ai-assist.md`

### 카드 현행화·보관·한글 내려받기

성과관리팀이 부서의 한글 파일을 `/cards/import`에 올리면 kordoc으로 카드 JSON으로 바꿔 원장과 맞추고, 검토 화면에서 구역마다 사람이 골라 반영합니다. 한글 내려받기(`/cards/<uid>/hwpx`)는 원본 배치가 있으면 원본 모양, 없으면 9.16 서식.
- 내려받은 한글 파일을 다시 올리면 같은 카드로 읽혀야 함(59장 왕복 테스트). AI는 원장을 자동으로 덮어쓰지 않고, 부서 담당자의 「한글 파일로 작성본 채우기」는 작성본에만 반영
- 카드 삭제는 항상 보관(`cards.status = retired`), 완전 삭제는 관리자만 + 과제번호 확인. 월별 실적은 기간별로 합쳐 잃지 않음(빈 상자도)
- 비교 관용: 줄 끝 공백은 같은 글, 수식(`$…$`)만·그림만 빠진 블록은 [유지]. 렌더러가 던지면 「비교 불가」(`BlockStatus` `unknown`) — 기본 유지, 일괄 반영 제외. `next.config.ts`의 `serverExternalPackages: ["kordoc"]`·`outputFileTracingExcludes`를 지우지 않음
- 경영관리 카드(`경영관리N/N-M`, `MG-1`~`MG-14`): 파서 `lib/cards/hwp/parse-mgmt.ts`, 렌더러 `render-mgmt.ts`(`isMgmtCard`), 올리기 `pnpm db:cards-mg [--dry-run|--write]`. 계량지표 부칸 글은 `kpi.rows[].sub`. 고정 영역(환류·지적 및 개선방안·계량지표)은 `fixedSectionsOf`·`fixedLabelOf`(`lib/cards/fixed.ts`) + DB 트리거 `guard_card_version`이 같이 잠금. 주요사업 현행화는 경영관리 파일을 거절(`looksLikeMgmtFile`). 지적/환류 행 추가·삭제는 원장 편집(성과관리팀 이상)만 — `edit.ts insertPairRow`·`deletePairRow`, 원본 배치는 행을 글로 맞춰 복제·뺌(`layout-render.ts`, 한글 내려받기와 같은 함수 — 43장 왕복 같은 행 수)

### 과제관리카드는 원본 그대로(한글 원본 배치)

카드 화면은 한글 원본 배치 그대로 그립니다(`lib/hwp/`의 `hwp5.ts`·`hwpx.ts`·`hwpx-write.ts`·`html.ts`·`fit.ts`·`pages.ts`·`layout.ts`는 입출력 없는 순수 변환). 배치가 없거나 못 맞추는 카드만 9.16 양식(`lib/cards/render.ts` + `card.css`).
- 문서·글꼴별 상수(글꼴 폭 표 등)를 두지 않고 글꼴 파일을 앱에 넣지 않음 — 파일에 적힌 값 + 한글의 일반 규칙 + 화면에서 잰 글꼴 폭만(금기 3·5·6)
- `render.ts` 보기 모드 출력은 정적 조각 59개와 바이트까지 같음(`render.test.ts`). 편집 칸(`[data-p]`) `innerText` = 카드 JSON 값(`applyText`, 편집 칸 4,347개 왕복 불변)
- 카드 JSON 비교는 `canonicalJson`(`lib/cards/fixed.ts`)으로(jsonb가 키 순서를 바꿈). 쪽 보기(`lib/hwp/pages.ts`)는 한글 인쇄와 같은 자리에서 나눔(`pages.test.ts`)

상세: `docs/design/cards.md`

### 자료 범위는 기능마다 고정

- **카드 개선**(요청 종류 넷·리뷰어 코멘트): 현재 카드(부서는 작성본) + 그 카드의 카드 전용 자료 전부 + 공통 지식 규칙 범위 전부(① 기관 공통 ② 공통지표(BZ-4)·사업 미지정 ③ 이 사업 공통, `buildBundle`) + 과제 기준 목록표(알리는 용도, 거르지 않음)
- **질문**: 위 + 최종 점검표(보낸·확인한 것 중 점검월이 가장 늦은 1건, 초안 제외) + 앞 요청·답. **보완 점검**: 카드 개선 + 최종 점검표의 미흡·기준 미확인·해당 없음 행
- **월간 점검**: **확정 카드(원장)** + 관리계획 발췌(지침 14 붙임1) + 붙임2 사례만. 경영관리는 그 지표 발췌·핵심공통항목 + 붙임4 자리에 원장 주요사업 카드 발췌. 카드 전용 자료·검색 결과는 주지 않음
- **경평 초안**: 카드 + 카드 전용 자료 + 보고서 추가자료(같은 사업·부서·연도) + 공통 지식 규칙 범위 전부(+ 작성 방법론 — 사실 근거 아님) + 2025 같은 과제 절(`rpt25-biz`) + 평가 관점(`lib/reports/lens.ts`) + 올해 계량 실적. **숫자 근거**는 사람이 고른 추가자료·실사 답변·연결된 2025 절뿐(`draftEvidence` linked — `relevantRefs(kb)`). **구성안만** 최종 점검표 미흡 행을 논점 참고로 받음(근거 아님)

카드 전용 자료는 그 카드 밖에서 쓰지 않습니다(DB 권한과 저장 경로 `card-materials/{cards.uid}/…`가 막음).

### 월간 점검

점검표는 지침 14의 양식(`inspections.result.form = "biz14"`, `lib/inspections/model.ts`)입니다. AI 점검 초안(`runInspectionDraft`)은 「자료 범위」의 근거만 받고 셈(충족 수·미흡·집중보완·판정 상태)은 모두 코드가 합니다. 「최종」은 보낸·확인한 것 중 점검월이 가장 늦은 1건이고 취합 보고(`lib/inspections/summary.ts`)는 그 달 판정만 집계(AI 재판정 없음).
- 양식 문구는 지침 14 <출력구조> 그대로 — `model.test.ts`가 글자까지 대조. 판정 상태는 점검완료·보완요청·재점검필요 셋뿐
- **집중보완**은 ★핵심 3항목(7대축 4 OutCome 연결·질의패턴 5 계량 수치의 함정·질의패턴 3 성과확산·지속성) 중 판정 가능한 것 2개 이상 미흡일 때만
- 판단(충족·미흡, 기준 미확인·해당 없음)만 AI·사람이 쓰고 집계는 코드(기준 미확인·해당 없음은 어떤 숫자에도 안 넣음). ★사례제안의 기관명·사업명·등급은 코드가 붙임2 조각에서 채움
- 부서에 보내면 성과관리팀도 고칠 수 없음(서버 `inspectionWriteBlock` + DB 트리거 `guard_inspection_ack`: 확인한 점검표는 누구도, 보낸 점검표는 보내기 취소만). 운영 알림은 성과관리팀 화면에만. 일괄 점검 동시 2건(`BATCH_CONCURRENCY`, `lib/ai/pool.ts`)
- **경영관리 점검표(`mgmt13`, 지침 13)**: 정합성 표 이름·정의만 다름(`MGMT_FORM_TABLES`·`formTablesOf(form)`, `model.test.ts`가 글자까지 대조). 끝의 □ 자가진단 체크리스트(`result.checklist`)는 판정·집계·집중보완에 안 넣고 결과 미정 행은 `sendProblems`로 보내기만 막음. 붙임4는 원장 주요사업 카드 발췌로 대체(`lib/inspections/biz-links.ts`, AI는 `links`만), ’25 지적의 소관은 각 카드의 「지적 및 개선방안」 행(`mgSiblingsOf`). 프롬프트 `inspection-mg`, 코드 `lib/ai/inspect-mg.ts`

상세: `docs/design/inspections.md`

### 경평 초안(12월 경영실적보고서)

메뉴 「경평 초안」(`/reports`·부서 `/my/report`). 집필은 2단계 — 「구성안 만들기」(`runReportOutline`) → 사람이 짜임 사전(`lib/reports/frameworks.ts`)에서 고쳐 「승인하고 집필」(`callReportSectionFitted`). 대상사업 번호·마커·숫자 대조·판면(mm)·도식 후보·올해 실적 자리표시는 결정론 코드(`lib/reports/*.ts`)가 계산하고 AI는 문장·짜임만 만듭니다.

- 기준이 부딪힐 때 순서: ① 근거 ② 판면 ③ 올해 실적 ④ 평가 논점 ⑤ 이 과제만의 요소 ⑥ 칸 채우기 ⑦ 문체(`resources/prompts/report-draft/role.md`). 시스템 프롬프트에는 harness 사본 전체가 아니라 `REPORT_HARNESS.style`(§4·§11)·`REPORT_HARNESS.rules`(R044·R047·R057·R065·R080·R091·R093)만(`lib/reports/section.ts`)
- AI가 쓴 숫자는 카드 글·첨부·전년 절·실사 답변에 있는 것만 인정 — 없으면 「없는 숫자」 경고 + 붉은 점선(`k-unv`). 근거 숫자 목록은 `knownNumbers` 하나(두 트랙·다시 점검 공용). 올해 값이 근거에 없으면 전년·목표로 채우지 않고 `【확인: …】`
- 도식은 「이 과제만의 요소」(근거가 있어야 씀, 신호는 카드·첨부 글로만)와 「기본 도식」으로 나눠 고르고 시각 블록 하나 이상은 이 과제만의 요소 후보에서. 지적 인용은 1칸까지, 전후 비교 괄호 표기는 두 값이 모두 근거에 있을 때만
- **코드가 이미 정한 값(이야기 틀 등)은 답 스키마에서 literal/한 값 enum으로 묶지 않음**(구조화 출력 파싱이 통째로 실패) — 문자열로 받아 코드가 덮어 씀(`withPlanStory`·`withFixedStory`)
- 자동 고치기(`shouldFix`·`draftScore`, `lib/ai/fix-policy.ts`): 문장 문제만이면 안 고침. Vercel에서만 `FIX_DEADLINE_MS` 690초 안일 때(`fixDeadlineMs`·`canFixAgain`), 1차 먼저 저장(`onFirst`), 키 `report_fix`. 상자 채움 경고(`hollowBoxes`)는 고치기 사유가 아님
- **쓰기·상태**: 초안·구성안 쓰기는 `saveDraftRow`(`lib/reports/draft-store.ts`, `updated_at` 조건)로만. 보고서 상태는 전이 표 `canMove`(`lib/reports/model.ts`)만이고 DB `report_transition_ok`가 같은 표
- 구성안 승인 뒤 근거 없는 이 과제만의 요소는 화면·서버 둘 다 막힘. 사람이 쓴 라벨·메모는 집필 지시일 뿐 근거가 아님
- 블록 고치기는 고른 글이 든 블록 하나만 다시 씀(이력 `report_draft_edits`; 추진성과 상자 `block_index` -1). 모양 바꾸기는 `previewBlockShapes`(저장 안 함) → 고른 안만 `applyBlockShape`(`lib/reports/block-shape.ts`). 직접 고침은 `data-t`·`data-raw`와 `saveDraftTexts`(`lib/reports/draft-text.ts`)
- 배치 필드는 구성안이 정하고 `applyPlanLayout`이 옮기며 폭·판면 어림은 `layoutGroups`(`lib/reports/layout.ts`) 하나만 씀. **배치 필드·제목 앞 칩이 없으면 출력·높이는 예전과 바이트까지 같아야 함**
- **경고 등급(2026-10-17)**: 경고는 글을 바꾸지 않고 `lib/reports/warning-levels.ts`가 막힘/참고로 갈라 점검 결과·사업 조판 검사 레일(`WarningList`)에 막힘 전부 + 참고 합쳐 3개까지만 보임. 경고 앞머리를 새로 만들면 `WARNING_HEADS`에 등급을 더해야 시험이 통과
- **재료 결손 모음(2026-10-17)**: 「채울 것 모아 보기」(성과관리팀)와 「입력할 것」(부서)은 `lib/reports/todo-board.ts buildTodoBoard` 하나가 계량 미입력·【확인】·초안 없는 과제·없는 숫자를 평가단위 × 부서로 모음. 부서 쪽은 자기 팀 줄만, `?team=`에서도 읽기 전용

**경영관리 경평 초안**(`docs/plan/경영관리-경평초안-설계.md` §10): 지표 하나가 보고서 한 건, 「평가내용 → 대주제 → 절」 3단 — 카드 위치는 구성안이 정함(`MG_CARD_EVALS`는 추천 기본값).
- 구성안 블록 목록은 한 줄 그대로 두고 블록마다 절 열쇠(`PlanBlock.at`)·골격(`Composition.mg`), 초안은 `spec.mg`. 블록은 늘 절 순서(`sortByParts`). 이야기 틀은 절마다 주 틀 + 보조 틀(`MgPart.subStory`), `regenerateMgPart` → `replaceMgPart`는 그 절 블록만 바꿈
- **판면 맞추기·자동 고치기는 없음**(경고까지만). 쪽 수는 작성분량(규정) `lib/reports/mg-volume.ts MG_VOLUME`, 카드 쪽수(`loadMgCardPages`)가 「분량 목표」이고 `mgSpecHeight`가 ±25% 밖이면 경고만. 바로 만들기 없음(구성안부터, 서버도 막음), 집필은 카드당 1회, 절은 성과로 닫음(`mgCloseRule`)
- 숫자 근거 = 카드·첨부·실사 답변·계량 실적 입력 + 연결된 공통 지식 조각(`relevantRefs(kb)`) + 그 지표 2025 보고서(`loadMgNumberEvidence`; 평가위원 지적 수치는 인용 대조에만)
- **지표 단위 카드 밖 부분(R5)**: 표지·지적사항 조치실적·전년 대비·성과분석 및 환류는 지표 × 연도 × 부분 한 행(`eval_unit_report_parts`) — 표 틀·숫자는 코드(`lib/reports/unit-parts-mg.ts`, 칸마다 code·ai·human, 「재료로 다시 채우기」는 code 칸만 바꿈), 칸 문장은 AI(`report_unit_mg`, 로컬 CLI로만). **카드 전용 자료·보고서 추가자료 원문은 AI에 주지 않고**(금기 4 해석) 숫자 근거는 `unitAiKnownNumbers`뿐(평가위원 지적·시정조치 계획·편람 수치는 근거 아님). 화면 `/reports/business/<지표>/parts`, 한글 내려받기는 `sectionMarkdown`(과제별)·`unit-report-md.ts`(지표 한 파일)

상세: `docs/design/report-draft.md`

### 공통 지식 적재

`lib/knowledge/`는 입출력 없는 순수 로직(정규화·표 읽기·문서별 파서·카드 연결)이고 `scripts/knowledge/ingest.ts`는 파일 읽기·쓰기만 합니다. 전용 파서가 조각(`knowledge_chunks`)을 만들고 검산 기대값(`*_EXPECTED`)이 회귀를 막습니다. 적재 순서: `pnpm knowledge:parse` → `knowledge:ingest` → 운영 DB는 `pnpm db:seed --knowledge-only`.
- **AI가 읽는 묶음**: 규칙 범위 전부를 세 층으로 요청 앞에 붙이고 조각 글은 자르지 않음. 과제 연결·대응표는 거르는 데 쓰지 않고 목록표로만 알림(`buildBundle`, `lib/ai/context.ts` `loadCardBundle`). **공통지표(BZ-4) 조각은 소속 사업을 알면 그 사업의 ③에만**(`common-kpi-owner.ts`, 적재 때 `meta.related_business`를 기록해야 하며 없으면 `scope-check.ts`가 적재를 멈춤 — 새 지표 이름은 `dictionaries.ts` `METRICS_2025`에 먼저), 모르면 ②. 모델이 읽는 글은 `sharedBlock`(`compact.ts`)으로 정리하되 조각 글(refs)과 인용 대조는 그대로
- 과제 대응표 `card_knowledge_scope`는 처리기(`prep_jobs`·`pnpm prep`·`/api/prep/run`, `PREP_AUTORUN=off`)가 light 모델로 채우는 **참고 표시**일 뿐 자료를 거르지 않음
- **일반 문서 올리기**(관리자 화면 또는 `pnpm knowledge:add`): `generic.ts`(범용 조각기)·`upload.ts`·`save.ts`를 모두 공유. 사업마다 요청 앞 공통 지식이 `SHARED_CHARS_LIMIT` 40만 자를 넘으면 저장하지 않고 멈춤(`guard.ts`), 읽기·검산·크기 보호 중 하나라도 실패하면 DB에 아무것도 안 쓰고 파일도 지움. 검색 전용(`meta.search_only`)은 `layerOf`가 범위 밖으로 돌림. 작성 방법론(`meta.usage = report_method`)은 `layerOf(c, unit, purpose)`의 목적이 `report`일 때만 ①에 들어가고 「근거가 아님」 표지(`revision-note.ts`), 숫자·인용 대조에는 안 씀
- 클라이언트 컴포넌트는 `upload.ts`(kordoc)가 아니라 순수 `upload-scope.ts`·`limits.ts`만 import. 조각 캐시(`chunk-cache.ts`)는 저장·삭제 때 비우고 올리기 크기 보호는 `fresh: true`. 공통 조각과 카드 전용 자료 표는 합치지 않음(D4 — 금기 4 누출 통로)
- 파일 번호와 지침 번호가 다름(Pool=붙임4·중장기=붙임3·기관장=붙임2·AX=붙임6) — 조각 제목·적응문은 이름으로 적음. 관리계획 발췌는 따로 적재하지 않음. 새 판의 문서가 오면 기대값을 먼저 원문으로 확인
- 문서 판이 다르면 최신본이 유효: `plan-2607.pdf`(관리계획 7월판)가 최종본(`_shared/knowledge.md#rules`·`revision-note.ts`). 조각 글은 원문 그대로 두고 결함은 요청 때 처리(`flattenHtmlTables`, `SOURCE_ERRATA`, `meta.duplicate_of`) — 원문을 고쳐 적거나 단정하지 않음
- 지적사항 시정조치 계획(`corr25-2610`)은 **약속이지 이행 실적이 아니라서** `PLAN_NOTE` 표지를 붙이고 숫자·사실 근거로 안 씀. 붙임2는 관리자가 화면에서 올림(기관명·사업명·등급은 코드가 채우고 AI는 지어내지 않음). 올린 일반 문서(`up-…`)를 지우면 조각과 대응표 행(확정 포함)이 연쇄 삭제
- **경영관리 지식**: 조각은 `track = 경영관리`·`business = MG-N`, 이름 → 지표는 `resolveMgmtUnit`(`dictionaries-mg.ts`) — **모르는 이름은 추측하지 않고 멈춤**. 5.22판 체크리스트(`checklist-2605`)는 적재 안 함. 전년 보고서 `rpt25-mg-NN`·실사 답변 `qa25-mg-NN`은 전용 파서(`parsers/report25-mg.ts`·`qa-mg.ts`)로 문서 하나씩 적재(`--doc <문서 id>`)

상세: `docs/design/knowledge.md`

### 데이터베이스(Supabase)

- 스키마는 `supabase/migrations/`에만 씀(대시보드 직접 변경 금지). **모든 테이블에 RLS**, 판정은 `private` 함수(`can_read_card` 등), 새 테이블·정책은 `lib/db/migrations.test.ts`에 역할별 사례. 저장소 키에 한글 금지(카드는 `uid`)
- `SUPABASE_SECRET_KEY`는 서버·스크립트만(`NEXT_PUBLIC_*` 금지). 서비스 키(`lib/supabase/admin.ts`)는 Auth 관리 API 때만 `requireRole` 뒤에, 데이터 수정은 사용자 권한(RLS)
- 업무 규칙은 서버 액션과 DB 트리거 둘 다에(전이 표·점검표 잠금 `20261010110000`·`20261027100000`, 작성본·마지막 관리자 `20261010120000`, 부서 확정(원장 내용만) `20261027110000`). 운영 반영 순서는 마이그레이션 머리 주석대로
- 검색 질의는 반드시 `lib/knowledge/search-query.ts`의 `buildSearchQuery`로(전체 정규화하면 `OR`가 낱말 `or`가 됨). PGroonga는 `pnpm db:check-search`. DB 연결은 Session pooler(직접 연결은 IPv6 전용)

### 로그인(Supabase 매직링크)

- 기관 메일(`ALLOWED_EMAIL_DOMAINS`)은 첫 로그인에 `dept_user`·부서 미지정으로 생성, 그 밖은 관리자가 만든 계정만(`otpPolicy`). 사용 중지(`profiles.active = false`)는 `requireUser`→`/login?blocked=1`·DB `my_role()`·auth ban(`setUserActive`)
- 메일 링크 돌아올 주소는 호출한 주소 기준(`lib/auth/redirect.ts requestOrigin`, `docs/ops/운영-전환.md` §2). `/auth/confirm`에서 **버튼을 눌러야** 로그인(`token_hash`·`code` 둘 다)
- 로그인 전 차단은 `proxy.ts`(공개 경로 `lib/auth/public-paths.ts`뿐, `safeNext`), 사용자 조회는 `lib/auth/dal.ts` `requireUser`. 최종 판정은 RLS, **서버 액션은 공개 API처럼** 안에서 사용자를 다시 확인

상세: `docs/design/auth-db.md`

### 사용자 등록·과제 담당자

「사용자」 메뉴에서 부서 담당자 계정을 만듭니다(개별·일괄 등록 `/users/import`). 코어 `lib/users/`, 서버 액션 `app/(app)/users/actions.ts`, DB `20260930120000_users_assignees.sql`.
- 성과관리팀은 **부서 담당자만**(기관 메일만) 만들고 관리자는 「권한」 열로 성과관리팀도 등록(`role-denied`)
- 팀 표기는 **틀리게 자동 확정하지 않음**(접근 범위가 곧 팀): 자동 확정은 전체 일치·조각 일치·본부명+팀명 셋뿐, 나머지는 추천만. 글자 유사도로 팀을 고르지 않음. 서버는 반영 때 처음부터 다시 판정(`planRows`), 한 번에 300줄
- **접근 범위는 담당자 지정 기준**(`20261001100000_assignee_access.sql`): 부서 담당자는 `card_assignees`에 지정된 과제만(같은 팀이어도 예외 없음), 성과관리팀·관리자는 전체. **보고서·추가자료·검토 코멘트는 팀 단위**(`private.can_read_report`, 일부러 둠). 지정은 같은 팀 안에서만(`guard_card_assignee`)
- **삭제 = 사용 중지**. 성과관리팀은 부서 담당자만, 본인·마지막 활성 관리자는 못 함(DB 트리거도), DB 갱신이 성공한 뒤에만 auth ban. 권한 변경은 `access_events`에 남김

상세: `docs/design/users.md`

### 화면

- `requireAtLeast(최소 역할)`로 막고(`NoAccess`) 데이터 범위는 RLS가 정함. 새 화면은 `components/ui/kit.tsx` 부품(`Screen`·`PageHeader`·`Toolbar`·`StatPanel`·`Peek`·`Panel`·`Tag`·`LinkTabs`·`Empty`·`T`)으로 짬
- **트랙 전환**: 머리띠 스위치(`components/shell/track-switch.tsx`)가 쿠키 `pdca_track`에 보기 선택을 기억(권한 아님), 서버는 `getTrack()`(`lib/tracks/current.ts`). 지원 안 하는 화면은 `TrackNotReady`
- **트랙 간 화면 통일**: 같은 화면은 같은 틀·부품·모양이고 달라지는 것은 데이터와 문구뿐 — 개수·트랙으로 부품 모양을 갈아끼우거나 트랙마다 화면 구현을 따로 두지 않음(`트랙 === …` 분기는 데이터·문구에만). 칩 이름은 `lib/tracks/board-units.ts`에서만, 평가단위 id 정렬은 `compareUnitId`(`localeCompare` 금지). 선택지 많은 필터는 칩 줄로 펼치지 않음. 화면을 바꾸면 `pdca_track` 쿠키를 바꿔 두 트랙을 캡처로 확인
- **화면 틀**: 한 줄 머리 56px(`<Screen header={<PageHeader title="…">…</PageHeader>}>`), **머리 아래 부제는 두지 않음**. 통계는 `StatPanel`(범례 라벨은 e2e가 글자로 찾음), 현황 `/dashboard`는 스크롤 없는 한 화면
- **부서 화면 보기**: 성과관리팀·관리자가 `/my…`를 `?team=<id>`로 열면 읽기 전용(`lib/auth/scope.ts deptScope`) — 카드 전체 페이지·`/reports/cards/<uid>`·`/reports/<id>`도 이어받고 **`?team=`이 있으면 팀을 못 찾아도 읽기 전용**, AI 입력줄·드래그 도구줄을 안 그림. 서버 쓰기 액션은 Referer가 부서 화면 보기(`isPreviewUrl`)면 거절(`previewWriteBlocked`) — 새 쓰기 액션도 맨 앞에서 부름
- 상세 화면의 목록 이동은 머리 오른쪽 위 목록 아이콘, 상세 링크는 `from`을 넘김(`lib/nav/return-to.ts` `withReturn`·`returnTarget`, 앱 안 경로만). 전체 보기는 `isFullView`
- 파일 올리기는 `components/ui/file-drop.tsx`(서명 업로드, Vercel 4.5MB 한도 회피). URL에는 `cards.uid`, 원본 그림은 비공개 버킷 `card-originals`(서명 URL). `public/`에 기관 자료를 두지 않음
- 글자 넘침 방지(`min-width: 0`, `table-layout: fixed`, `word-break: keep-all`). `#0080C0`는 글자에 쓰지 않음(링크 `#00699E`). `useEffect(() => el.scrollIntoView())`처럼 값을 돌려주면 React가 정리 함수로 불러 깨짐 — 효과 본문은 중괄호로

상세: `docs/design/screen-frame.md`

## 저장소 경계

- 저장소 `bcchung81/pdca-app`는 **공개** — 코드만 넣고 기관 자료·개인정보는 로컬에만(`.gitignore`):
  - `data/`(카드 HWP·PDF `data/cards/260916`, 틀 `data/templates`)·`resources/knowledge/`: 운영은 관리자가 올림
  - 카드 원문 `seed/cards/260916/`·지침 사본 `resources/harness/pdca/`·분석·시안 문서. 시험·코드에 실명·실제 메일 금지
  - `.env*`(`.env.example`만)·`supabase/.temp`
- 공통 지식에 넣을 파일은 **사용자가 지정한 것만** 복사합니다. 원본 폴더(Downloads 등)에서 옮기지 않습니다.
- **코드가 경로로 읽는 파일은 영문 이름**(소문자·숫자·하이픈)을 씁니다 — 한글 파일명은 macOS 디스크에서 NFD로 저장돼 리눅스(Vercel)의 코드 문자열(NFC)과 어긋날 수 있습니다. 기관 원본 이름은 데이터(`original_name` 등)로만 남깁니다.
- 커밋·푸시는 요청이 있을 때만 합니다.

## 테스트가 지키는 것

테스트별로 어떤 회귀를 막는지는 `docs/design/tests.md`에 있습니다. git 밖 원본(`data/`·`resources/knowledge/`)이 필요한 시험은 원본이 없으면 이유를 적고 건너뛰고(`{ skip: !있음 && "무엇이 없음" }`), `pnpm test`가 끝에 건너뛴 목록을 출력합니다(통과가 아님 — 같은 문서 「원본 필요 시험」). 새 테이블·정책·기능을 추가하면 해당 표에 사례를 더합니다.

## 금기

1. 앱 실행 경로에서 report-harness나 로컬 파일 경로를 읽지 않습니다.
2. RLS 없는 테이블을 만들지 않습니다.
3. 과제관리카드를 앱 양식으로 다시 그리지 않습니다.
4. 카드 전용 자료를 다른 카드나 월간 점검에 넣지 않습니다.
5. 한글 원본 그리기에 문서·글꼴별 상수(글꼴 폭 표 등)를 두지 않습니다. 파일에 적힌 값 + 한글의 일반 규칙 + 화면에서 잰 실제 글꼴 폭만 씁니다.
6. 글꼴 파일을 앱에 넣거나 배포하지 않습니다(검증용으로 PDF에서 꺼낸 글꼴은 이 컴퓨터 임시 폴더에서만).
