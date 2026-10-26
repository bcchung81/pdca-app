경영관리 경평 초안 AI 답의 필드 설명입니다(구조화 출력 JSON 스키마의 description). 구조는 코드(lib/reports/mg-draft.ts mgDraftOutSchema)가 정하고, 블록 안 필드(block.*)는 주요사업 report-draft/schema.md를 그대로 끼웁니다(block.variant만 경영관리 표 모양 4종을 더해 따로 씀 — 2026-10-12, 경영관리 블록 고치기 report-block-mg도 이 설명을 씀).

<!-- @parts -->
승인된 구성안의 절마다 하나씩, 구성안에 적힌 순서 그대로

<!-- @part.key -->
절 열쇠 — 구성안에 적힌 [열쇠] 글자 그대로(예: 1.2.가, 1.1.0)

<!-- @part.title -->
절 제목 한 줄(명사구 — 2025 경영관리 절 제목은 공백 포함 중앙 34자·가운데 절반 30~38자, 98%가 명사로 끝남. 절 표지·번호·꼬리표는 적지 않음). 절 표지가 없는 대주제 본문(열쇠 끝이 0)은 빈 문자열

<!-- @part.blocks -->
이 절의 블록(구성안 순서·종류·라벨대로). 절은 요청에 적힌 이 지표의 「닫기 관례」대로 성과로 닫음

<!-- @caption -->
이 초안 도식 설명 한 줄(화면 읽기용)

<!-- @block.kind -->
{{> report-draft/schema.md#block.kind}}

<!-- @block.label -->
{{> report-draft/schema.md#block.label}}

<!-- @block.title -->
{{> report-draft/schema.md#block.title}}

<!-- @block.variant -->
모양: cards=plus|arrow|plain|vs(2칸), compare=table|panels|diag(현황·문제 ▶ 추진방향 짝), steps=row|zigzag, timeline=chevron|dots, table=빈 문자열(구분·수치 표)|result(추진실적 열)|bars(값 옆 막대)|chevron(쉐브론 머리)|ladder(2단 라벨 — 도식 고르기의 「표 모양」대로 칸을 채움), 그 밖은 빈 문자열

<!-- @block.text -->
{{> report-draft/schema.md#block.text}}

<!-- @block.items -->
{{> report-draft/schema.md#block.items}}

<!-- @block.cells -->
{{> report-draft/schema.md#block.cells}}

<!-- @block.rows -->
{{> report-draft/schema.md#block.rows}}

<!-- @block.series -->
{{> report-draft/schema.md#block.series}}

<!-- @block.badge -->
{{> report-draft/schema.md#block.badge}}

<!-- @block.evidence -->
{{> report-draft/schema.md#block.evidence}}

<!-- @block.figures -->
{{> report-draft/schema.md#block.figures}}
