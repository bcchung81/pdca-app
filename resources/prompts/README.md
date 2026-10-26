# AI 프롬프트

이 앱이 Claude에 보내는 지시문입니다. **코드에는 지시문을 쓰지 않고** 이 폴더의 파일을 읽어 씁니다. 이 폴더는 앱 소유라 성과관리팀이 문구를 고쳐도 됩니다(`resources/harness/`의 지침·report-harness 사본은 손으로 고치지 않음).

## 기능별 폴더

| 폴더 | 기능(화면) | 읽는 코드 | 시스템 프롬프트에 채우는 사본 |
|---|---|---|---|
| `card-assist/` | 과제원장 「AI 작성지원」 개선 제안·실적 발굴·실적 반영 | `lib/ai/writer.ts` | 담당자 작성지원 지침(09) · 문체 기준 |
| `card-chat/` | 「AI 작성지원 › 질문」 | `lib/ai/chat.ts` | 지침 09 · 문체 기준 |
| `card-comment/` | 편집기 드래그 「AI 수정 요청」·「질문」 | `lib/ai/comments.ts` | 지침 09 · 문체 기준 |
| `card-assist-mg/`·`card-chat-mg/`·`card-comment-mg/` | 경영관리 카드의 작성지원·질문·코멘트(주요사업 폴더와 같은 절 구성, 글만 경영관리용 — 주요사업 판은 안 바뀜) | `lib/ai/writer.ts`·`chat.ts`·`comments.ts`(호출부가 카드 종류로 고름) | 경영관리 작성지원 지침(08) · 문체 기준 |
| `inspection/` | 월간 점검 AI 초안 | `lib/ai/inspect.ts` | 종합점검 지침(14) |
| `inspection-mg/` | 경영관리 월간 점검 AI 초안(정합성 표가 경영관리용, 사례제안 없음, 내부관리형 보정·자가진단 체크리스트 대조·주요사업 연계 후보(붙임4 자리에 원장 주요사업 카드 발췌)가 더해짐) | `lib/ai/inspect-mg.ts` | 종합점검 지침(경영관리 13) |
| `report-draft/` | 경평 초안 과제별 초안 | `lib/reports/section.ts` | report-harness 문체 기준·보고서 설계·집필 규칙 |
| `report-outline/` | 경평 초안 구성안(재료표·짜임 — 집필 전 사람 승인 단계, 틀 고르기·주 틀 + 보조 틀 2026-10-09) | `lib/reports/composition.ts`·`story-hints.ts`·`lib/ai/run.ts callReportOutline` | report-harness 도식 Pool 판정표(`{{skeleton}}` — `_shared/skeleton.md`) — report-draft의 입력·이야기 틀·블록 사전(`inputs.md`·`stories.md`·`blocks.md`)과 배치 고르기(`blocks.md#layout` — 라벨 사다리·전폭·단 띠·가로 반씩, 2026-10-12: 두 트랙 구성안만 끼우고 집필·블록 고치기는 안 끼움 — 배치는 코드가 구성안에서 초안으로 옮김)를 끼움 |
| `report-outline-mg/`·`report-draft-mg/`·`report-block-mg/` | 경영관리 경평 초안 구성안(평가내용 → 대주제 → 절 + 절마다 블록·재료)·집필(승인된 구성안의 절마다, 카드당 1회)·블록 고치기(2026-10-09 R3 — 주요사업 폴더·판은 안 바뀜) | `lib/reports/mg-outline.ts`·`mg-draft.ts`·`lib/ai/run.ts callReportOutlineMg·callReportDraftMg` | report-harness 문체 기준·집필 규칙(주요사업과 같은 고르기) — 문체·블록 어휘(`report-draft/blocks.md#blocks`)·블록 필드 설명은 report-draft 조각을 끼우고(모양 `block.variant`만 표 모양 4종을 더해 `report-draft-mg/schema.md`에 따로 — 블록 고치기도 이 설명, 2026-10-12), 그림 자리·도식 고르기·표 머리 줄 틀·표 모양은 `report-draft-mg/blocks.md`, 이야기 틀은 `report-draft-mg/stories.md`, 공통 지식 절은 `_shared/knowledge-mg.md`, 구성안은 골격 판정(`_shared/skeleton.md`)·배치 고르기(`report-draft/blocks.md#layout`) |
| `report-unit-mg/` | 경영관리 지표 단위 부분(카드 밖 표 — 지적사항 조치실적·전년 대비·성과분석 및 환류)의 「AI로 문장 채우기」(지표당 1회 — 코드가 정한 행 열쇠·칸만 채움, 2026-10-16 R5c) | `lib/reports/unit-parts-ai.ts`·`lib/ai/run.ts callReportUnitMg` | report-harness 문체 기준·집필 규칙(경평 초안과 같은 고르기) — 문체는 `report-draft/style.md#style`을 끼우고 표 칸 불릿 규칙만 쓰라고 적음 |
| `match-knowledge/` | 백그라운드 「과제 대응」 매칭(카드 × 공통 지식 조각 → 이 과제 해당 조각 — 화면에 「이 과제 해당」으로 표시하는 참고 초안, 확정하지 않아도 AI는 규칙 범위 전부를 봄, light 모델) | `lib/ai/match.ts`·`lib/prep/handlers/match-knowledge.ts` | 없음 |
| `describe-image/` | 첨부 그림 설명(이미지 첨부·글 없는 스캔 PDF → 보이는 글자·수치·장면을 글로, API 전용·light 모델) | `lib/ai/describe.ts`·`lib/ai/read-attachment.ts` | 없음 |
| `rules-digest/` | 공통 규칙 문서(기준류 공통 지식 조각 → 원 조각 key가 달린 근거 메모 — 트랙 공통·평가단위별, 로컬 CLI 스크립트 `scripts/knowledge/rules-digest.ts`만, 앱 요청 경로에서는 아직 안 씀). `request.md`의 `doc.*`는 만든 규칙 문서의 머리 표지·부록 문구 | `lib/knowledge/rules-digest.ts` | 없음 |
| `_shared/` | 여러 기능이 함께 쓰는 조각(`card.md`·`knowledge.md` — 과제원장 3종, `card-mg.md`·`knowledge-mg.md` — 경영관리 3종, `files.md` — 첨부 자료 머리, `skeleton.md` — 경평 구성안 골격 판정) | 끼움으로 | — |

기능 폴더마다 세 파일이 있습니다.
- `system.md` — 시스템 프롬프트. 뼈대는 모두 같습니다: **# 역할 → # 입력(## 근거 쓰는 법) → # 작업 절차 → # 판단 기준 → # 출력 규칙 → # 하지 않는 일** → 지침·기준 사본(자리표시). 해당 없는 제목은 뺍니다.
- `request.md` — 요청 글의 고정 문구(자료 블록 머리·요청 종류별 할 일 등). 조건·반복·셈은 코드가 하고 문구만 여기에.
- `schema.md` — AI 답(구조화 출력 JSON 스키마)의 필드 설명. 필드 구조·종류 목록은 코드가 정하고, 뜻과 채우는 법만 여기에.

`report-draft/`는 시스템 프롬프트가 길어 주제별 파일(`role`·`inputs`·`process`·`style`·`stories`·`blocks`·`output`)로 나누고 `system.md`가 차례로 끼웁니다.

## 파일 쓰는 법

- **절**: `<!-- @이름 -->` 한 줄이 절의 시작이고, 다음 절 표지(또는 파일 끝)까지가 그 절의 글입니다. 첫 절 표지 위의 글은 편집자 메모라 AI에 가지 않습니다.
- 절 글 끝의 빈 줄은 걷습니다(편집기가 넣는 끝 줄바꿈 때문에 글이 달라지지 않게). 줄 끝 빈칸은 걷지 않습니다.
- **자리표시** `{{이름}}`: 코드가 채웁니다. 코드가 주지 않는 이름을 쓰면 불러올 때 오류가 납니다. 채워 넣은 값(카드 글 등)은 다시 훑지 않습니다.
- **끼움** `{{> 파일#절}}`: 다른 파일(이 폴더 기준 경로)의 절 글을 그 자리에 넣습니다. 공통 문구는 `_shared/`에 한 번만 쓰고 끼웁니다. 끼운 글 안의 끼움도 3단계까지 풉니다.
- 기능마다 있어야 하는 절은 코드에 적혀 있습니다(`*_PROMPT_SPEC`). 절을 지우거나 이름을 바꾸면 불러올 때 오류가 나고, 쓰지 않는 절이 남으면 테스트(`lib/prompts/prompts.test.ts`)가 짚습니다.
- 목록·이름이 코드와 같아야 하는 곳: 경평 초안의 이야기 틀·블록 사전(`lib/reports/blocks.ts`) — 테스트가 대조합니다.

## 코드와의 경계

- 파일: 역할·규칙·판단 기준·출력 규칙, 요청 블록 머리와 안내 문구, 답 필드 설명.
- 코드: 언제 어떤 블록을 넣을지(조건), 자료마다 되풀이(반복), 셈(분량 공식·글자 한도·첨부 글 몫·닮은 정도 기준), 데이터를 글로 푸는 일(카드 칸 풀이·근거 자료 태그·점검표 줄·빈 자료 표시), 답 검증(원문 대조·숫자 대조·경로 확인).

## 판·반영

- 판: `<기능>@` + 끼움을 푼 절 글의 해시 앞 8자(`lib/prompts/load.ts`). 편집자 메모만 고치면 판이 그대로이고, `_shared`를 고치면 끼운 기능의 판이 모두 바뀝니다. 경평 초안은 초안 spec `promptVersion`에 남깁니다.
- 개발 서버·테스트는 부를 때마다 파일을 다시 읽습니다(고치면 바로 반영). 운영은 처음 한 번 읽어 둡니다.
- 운영(Vercel)에는 `next.config.ts` `outputFileTracingIncludes`로 함께 실립니다.
- 고친 뒤에는 `pnpm test`로 절·자리표시를 확인하고, 동작은 `scripts/dev/*-smoke.ts`(실제 AI 호출, 저장 안 함)로 봅니다.
