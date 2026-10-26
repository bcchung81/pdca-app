# 판단·AI 프롬프트·report-harness 반영

CLAUDE.md의 「판단은 기준 문서, 실행은 결정론 코드」·「AI 프롬프트」·「report-harness 반영(고정 사본)」 절 원문입니다(2026-10-17에 CLAUDE.md를 줄이며 옮김).

## 판단은 기준 문서, 실행은 결정론 코드

새 기능은 **"매번 같은 결과여야 하는가"**로 어느 쪽에 넣을지 정합니다.

- **LLM이 읽고 판단하는 기준**: `resources/harness/report-harness/*.md`(사본 — 손 수정 금지)와 앱 소유 AI 프롬프트 `resources/prompts/`(고쳐도 됨, 코드에 지시문을 쓰지 않음)
- **판단이 끼면 안 되는 일**: 파싱·정규화·조각화·연결·검산·권한·HWPX 양식 정합 — `lib/`의 코드와 테스트로 둡니다.

## AI 프롬프트(`resources/prompts/`)

AI에 보내는 지시문은 **코드에 쓰지 않고** `resources/prompts/<기능>/`의 파일에 둡니다. 편집 규칙은 `resources/prompts/README.md`.
- 기능 폴더: `card-assist`(작성지원) · `card-chat`(질문) · `card-comment`(드래그 코멘트) · `inspection`(월간 점검) · `card-assist-mg`·`card-chat-mg`·`card-comment-mg`(경영관리 카드의 작성지원·질문·코멘트, 지침 08 — 같은 절 구성에 글만 경영관리용, 공통 조각 `_shared/card-mg.md`·`knowledge-mg.md`) · `inspection-mg`(경영관리 월간 점검, 지침 13) · `report-draft`(경평 초안) · `report-outline`(구성안) · `report-block`(블록 고치기·질문) · `report-outline-mg`·`report-draft-mg`·`report-block-mg`(경영관리 경평 초안 — 평가내용 → 대주제 → 절, 2026-10-09) · `report-unit-mg`(경영관리 지표 단위 부분 — 카드 밖 표의 문장 칸, R5c 2026-10-16) · `_shared`(공통 조각)
- 파일: `system.md`(# 역할 → # 입력 → # 작업 절차 → # 판단 기준 → # 출력 규칙 → # 하지 않는 일 → 지침·기준 사본 자리표시) · `request.md`(요청 글 고정 문구) · `schema.md`(답 필드 설명 — 구조는 코드)
- 문법: 절 `<!-- @이름 -->`(첫 표지 위는 편집자 메모), 자리표시 `{{이름}}`(없는 이름은 오류), 끼움 `{{> 파일#절}}`(3단계까지). 풀이 `lib/prompts/template.ts`, 읽기 `load.ts`, 기능별 묶음 `sets.ts`. 운영은 한 번 읽어 두고 개발·테스트는 부를 때마다 읽음.
- 기능 모듈(`writer`·`chat`·`comments`·`inspect`·`section`)은 순수로 두고 묶음을 인자로 받습니다. 필요한 절은 각 모듈의 `*_PROMPT_SPEC`. 답 스키마는 설명 없이(타입·검증용) 또는 `schema.md` 설명을 붙여(모델용) 만듭니다(`writerResultSchema(desc?)`).
- 코드에 남는 것: 조건·반복·셈, 데이터를 글로 푸는 일(카드 칸 풀이·근거 자료 태그·점검표 줄), 답 검증.
- 판: `<기능>@해시8`(끼움을 푼 절 글) — 프롬프트를 고치면 판이 바뀝니다. 경평 초안은 spec `promptVersion`.

## report-harness 반영(고정 사본)

`resources/harness/report-harness/`는 report-harness의 기준 문서 사본입니다(원본 커밋·파일별 해시는 `SOURCE.json`).

| 사본 | 이 앱에서 쓰는 곳 |
|---|---|
| `rules.md`(`[draft]`·`[export]` 86건) | 카드 개선·초안 프롬프트와 초안 점검 — `lib/harness/rules.ts`의 `selectRules`가 단계 태그별로 고르고 대체된 규칙은 뺌. **경평 초안**은 태그별 선택 대신 `REPORT_HARNESS.rules`(`lib/reports/section.ts`) 7건만 `pickRules`로 번호 순서대로 씀(없는 번호·대체된 규칙이면 오류) |
| `style-guide.md` | 작성지원 문체 — 전문. **경평 초안**은 `REPORT_HARNESS.style`(§4·§11)만 `pickSections`로 씀(없는 절 번호면 오류) |
| `md-profile.md` | 초안 표기(계층 기호·표 병합). HWPX 변환의 입력 형식 |
| `table-pool.md`·`diagram-pool.md` | 보고서 표·도식 카탈로그(HTML과 HWPX가 같은 명세) |
| `factcheck.md` | 초안의 수치·인용 검증, 월간 점검 근거 확인 |
| `resources/harness/pdca/09-assist-guide-biz.md` | **담당자 작성지원 지침** — 카드 AI 작성지원의 시스템 프롬프트 |
| `resources/harness/pdca/14-inspection-guide-biz.md` | **성과관리팀 종합점검 지침** — 월간 점검표 양식과 AI 점검·취합 보고 기준(`lib/inspections/model.ts`·`lib/ai/inspect.ts`·`lib/inspections/summary.ts`가 따름). 붙임2(유관기관 평가보고서 정리)는 관리 화면에서 올리면 적재(`peer_case`) — 그 전에는 사례제안이 「기준 미확인 — 붙임2 미확보」 |

- **사본은 손으로 고치지 않습니다.** report-harness에서 고치고 커밋한 뒤 `pnpm harness:sync`로 다시 들여옵니다. `lib/harness/harness.test.ts`가 해시를 대조합니다.
- **예외 — pdca 지침 사본(09·14와 경영관리 08·13, 260929·260930판)은 노션 관련 내용을 뺀 가공본입니다**(14는 뭉개진 줄바꿈 복원 포함). 내역·검증은 `resources/harness/pdca/PROCESSING.md`, 원본 해시는 `SOURCE.json`의 `raw_sha256`. 번호로 참조되는 줄(14의 절대원칙 — 앱 코드가 「절대원칙 8·11」로 읽음)은 줄을 지우지 않고 문구만 뺐습니다. **`pnpm harness:sync pdca`는 쓰지 않습니다** — `../pdca`(9/17판)에서 복사해 가공본을 덮어씁니다. 새 판은 같은 규칙으로 다시 가공합니다. 08·13은 앱이 아직 읽지 않습니다(경영관리 트랙 확장용).
- report-harness의 파이썬 스크립트(`audit_style`·`lint_md_profile`·`postprocess_hwpx`)는 들여오지 않습니다. 필요한 점검은 TypeScript로 옮기고 옮긴 코드 주석에 규칙 번호를 적습니다. 리뷰어도 report-harness 코드를 가져오지 않고 이 앱 안에 새로 만듭니다.

