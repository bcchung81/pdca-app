# 설계 상세 문서

CLAUDE.md를 짧게 유지하려고 기능별 상세를 여기로 옮겼습니다(2026-09-28, P1: CLAUDE.md 줄이기). 각 문서는 CLAUDE.md의 해당 절에서 원문 그대로(경로 표기만 최신화) 옮긴 것입니다 — 요약이 아니라 전체 상세입니다. 2026-10-17에 CLAUDE.md를 40KB 이하로 다시 줄이면서 각 문서 끝의 「CLAUDE.md에서 옮긴 상세」 절에 날짜별 결정 배경·실측·이력을 더 옮겼습니다. CLAUDE.md에는 기능별로 3~6줄 요약 + 핵심 규칙 + 이 문서로의 링크만 남아 있습니다.

| 문서 | 내용 |
|---|---|
| [`경평초안-한글변환-글꼴-핸드오프-2026-10-26.md`](./경평초안-한글변환-글꼴-핸드오프-2026-10-26.md) | 경평 초안 한글(HWPX) 화면 동일 변환 — 현재 상태 실측, 글꼴 기준(KoPub 2.0 링크·한컴/윈도 글꼴), 자간 보정 표지, 글꼴 안내 화면, 남은 순서(줄바꿈 실험·경영관리 확장) |
| [`로고-개선-핸드오프-2026-10-26.md`](./로고-개선-핸드오프-2026-10-26.md) | Sherpa 남색·블루 로고와 경영평가 Agent 부제 — 반영 파일·HTML 개선안·검증 결과·후속 QA |
| [`UI-UX-개선-핸드오프-2026-10-21.md`](./UI-UX-개선-핸드오프-2026-10-21.md) | 일반 사용자 관점 UI/UX 개선 제안 — 개인 시작 화면·현황·과제관리카드·경평 초안, 구현 티켓·수용 기준·검증 계획 |
| [`ai-assist.md`](./ai-assist.md) | AI 작성지원(카드 본문: 개선 제안·실적 발굴·실적 반영) · AI 작성지원 「질문」 · 카드 리뷰어(드래그 코멘트) |
| [`cards.md`](./cards.md) | 카드 현행화·보관·한글(HWPX) 내려받기 · 과제관리카드는 원본 그대로(한글 원본 배치 읽기·그리기·쪽 보기·편집기·작성본·고정 영역) |
| [`inspections.md`](./inspections.md) | 월간 점검(점검표 양식·AI 점검 초안·최종 점검현황·취합 보고·★사례제안) |
| [`report-draft.md`](./report-draft.md) | 경평 초안(12월 경영실적보고서) — 과제별 초안, 구성안 승인 단계, 판면 맞추기, 도식·그림 자리, 올해 실적, 서술 품질, 사업 단위 조판, 블록 고치기 등 평가 라운드별 실측 기록 전체 |
| [`knowledge.md`](./knowledge.md) | 공통 지식 적재(문서별 파서·적재 규칙) |
| [`users.md`](./users.md) | 사용자 등록·과제 담당자 — 부서 담당자 계정 추가(개별·일괄 등록), 팀 자동 확정·추천 규칙, 과제 담당자(`card_assignees`), 사용 중지(삭제), 권한 변경 기록 |
| [`screen-frame.md`](./screen-frame.md) | 화면 틀(2026-10-01) — 한 줄 머리(H1)·세그먼트·부제 제거, `StatPanel`(S3), 현황 한 화면(D2), 화면별 이전 기록 |
| [`tracks.md`](./tracks.md) | 트랙 스펙(`lib/tracks`) — 트랙별로 달라지는 값, 공통 지식의 트랙 분리 |
| [`harness-prompts.md`](./harness-prompts.md) | 판단은 기준 문서·실행은 결정론 코드, AI 프롬프트(`resources/prompts/`) 규칙, report-harness 고정 사본 반영 |
| [`auth-db.md`](./auth-db.md) | 데이터베이스(Supabase) 규칙, 로그인(매직링크) |
| [`history.md`](./history.md) | 저장소 개요·명령·작업 방식·저장소 경계에서 CLAUDE.md를 줄이며 옮긴 상세 |
| [`tests.md`](./tests.md) | 「테스트가 지키는 것」 — 테스트별로 막는 회귀 목록 |

## 코드 관례(2026-10-17 품질 향상)

- **넓은 외부 값의 타입**: 모양이 넓은 외부 경계값(카드 JSON `card.data`·kordoc 결과)은 `lib/loose-json.ts`의 `LooseJson`(= `any`)을 쓰고 파일마다 `eslint-disable no-explicit-any`를 두지 않음. 모양을 아는 값은 좁은 타입 — Supabase select 결과는 파일 안 `…DbRow` 인터페이스(조인은 객체·배열 둘 다 올 수 있어 기존 `first()` 방식으로 읽음), 검증 전 jsonb(`inspections.result`·`reports.blocks`·초안 spec·지표 단위 부분)는 `unknown` + 지역 `Raw…` 타입. `LooseJson`은 2026-10-17 394곳 → 264곳(남은 곳은 대부분 카드 JSON — 다음 단계는 읽기 전용 함수부터 `CardData` 인터페이스, 또는 Supabase DB 타입 생성 검토).
- **2-gram Dice는 두 계열**: `lib/knowledge/similarity.ts`의 `dice`는 `compactKey`를 거치는 집합 Dice(공통 지식 닮은 순), `bigramDice`는 정규화 없는 다중집합 Dice(카드 칸 맞춤 `layout-bind`·팀 이름 비교 `team-match`가 씀 — 팀 이름은 빈 글이면 0). 세 벌이던 것을 결과가 같은 둘만 합침(집합 Dice는 결과가 달라 그대로).

상위 문서: [`/CLAUDE.md`](../../CLAUDE.md), 운영 절차는 [`/docs/ops/`](../ops/README.md).
