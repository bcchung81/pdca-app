경영관리 경평 초안 AI 답의 필드 설명입니다(구조화 출력 JSON 스키마의 description). 구조는 코드(lib/reports/mg-draft.ts mgDraftOutSchema)가 정하고, 블록 안 필드(block.*)는 주요사업 report-draft/schema.md를 그대로 끼웁니다(block.variant만 경영관리 표 모양 4종을 더해 따로 씀 — 2026-10-12, 경영관리 블록 고치기 report-block-mg도 이 설명을 씀. block.title도 따로 씀 — 2026-10-29 2025 경영관리 도식 위 제목 띠는 표 설명 이름이 아니라 성과·주장 한 줄).

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
{{> report-draft/schema.md#block.label}}. 경영관리는 구성안에 적힌 라벨 그대로 씁니다 — 2025 관례대로 왼쪽 라벨이 그 행의 주제 이름이어도 단계 이름으로 바꾸지 않습니다

<!-- @block.title -->
블록 머리(없으면 빈 문자열 — 도식 위 연회색 띠에 굵게 한 줄로 그려짐). define은 탭 글(「…란?」「왜 …?」), case는 사례 제목. 그 밖의 머리는 표·도식이 무엇인지 설명하는 이름(「…양식」·「…현황」·「…구성」)이 아니라 그 묶음이 보여 주는 성과·주장 한 줄이고, 근거에 수치가 있으면 그 수치를 넣습니다. 표(table — 기본·result·bars·chevron·ladder)는 머리 행·라벨이 내용을 말하면 빈 문자열이 기본이고, 라벨·표 머리(기존·개선·As-Is·To-Be)가 이미 전후를 말해도 빈 문자열입니다. 「A → B」는 양쪽이 같은 대상을 가리킬 때만 쓰고, 대상이 다른 두 말을 화살표로만 잇거나 화살표 뒤에 「전환」을 겹쳐 쓰지 않습니다

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
