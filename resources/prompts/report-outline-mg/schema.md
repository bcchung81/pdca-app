경영관리 경평 초안 구성안 AI 답의 필드 설명입니다(구조화 출력 JSON 스키마의 description). 구조·종류 목록은 코드(lib/reports/mg-outline.ts)가 정하고, 재료·블록 필드는 주요사업 구성안 설명(report-outline/schema.md)을 끼웁니다.

<!-- @message -->
이 카드의 핵심 메시지 한 문장(60자 안팎 — 평가 논점을 모은 것, 이 과제가 낸 변화·가치로 쓰고 '25 지적 문구로 세우지 않음, 새 사실·수치 없이)

<!-- @points -->
평가 논점 2~3개(이 지표 편람 세부평가내용의 어느 항목·전년 대비 개선·'25 지적 해소 중 근거가 있는 것, 각 60자 안팎 한 줄). 1번은 이 과제가 낸 변화·가치이고, '25 지적 해소는 넣더라도 1번이 아님

<!-- @parts -->
이 카드가 맡는 절 목록(평가내용 → 대주제 → 절 순서). 절 표지가 없는 대주제 본문도 한 칸

<!-- @part.evalNo -->
평가내용 번호(요청의 「전년도 보고서 구성」에 있는 2025 연번)

<!-- @part.themeNo -->
대주제 번호(그 평가내용 안의 1·2·3 — 2025 구성의 번호를 쓰고, 올해 새 대주제면 다음 번호)

<!-- @part.themeTitle -->
대주제 제목 한 줄(2025 구성에 같은 대주제가 있으면 그 이름, 없으면 카드 사실로)

<!-- @part.mark -->
절 표지 한 글자(가·나·다 …). 절 없이 대주제 본문만 쓰면(전략수립 대주제 등) 빈 글

<!-- @part.title -->
절 제목 한 줄(카드 사실로 쓴 명사구 — 2025 경영관리 절 제목은 공백 포함 중앙 34자·가운데 절반 30~38자, 98%가 명사로 끝남). 대주제 본문이면 빈 글

<!-- @part.story -->
이 절의 주 틀(뼈대) — 시스템 프롬프트의 경영관리 이야기 틀 12종 중 하나(목록에 적힌 이름 글자 그대로, 섞음 없음 — 전략수립 대주제는 전략수립형)

<!-- @part.subStory -->
보조 틀(선택) — 주 틀 말고 이 절에서 한 행·한 블록만 빌려 오는 틀 하나(12종 중, 주 틀과 다르게). 빌려 오는 틀이 없으면 빈 글

<!-- @part.why -->
이 절을 둔 이유 한 줄(카드의 어느 추진내용이 2025 어느 절과 이어지는지, 추천 평가내용과 다르게 골랐으면 그 이유, 카드·첨부의 같은 항목 값이 다르면 「값 어긋남: 두 값·출처·시점 → 쓴 값」, 담당자가 고른 짜임이 있으면 그 짜임을 어떻게 따랐는지)

<!-- @part.chip -->
갈래 칩(선택) — 이 절이 맡는 갈래 축(splitAxis) 값 하나(12자 안, 대괄호 없이). 그 축의 표준 값이거나 카드·근거에 있는 낱말만. 축이 없거나 대주제 본문(표지 없음)이면 빈 글

<!-- @materials -->
재료표(m1부터 번호) — 이 카드의 절에 실제로 쓸 사실·수치·원문 인용·사례와 필요한데 근거에 없는 자료(need). 블록이 가리키는 것만, 절마다 6개 안팎 — 모두 「절 수 × 6개」까지(절이 셋 이하면 20개, 많아도 40개)

<!-- @material.kind -->
{{> report-outline/schema.md#material.kind}}

<!-- @material.text -->
{{> report-outline/schema.md#material.text}}

<!-- @material.when -->
{{> report-outline/schema.md#material.when}}

<!-- @material.source -->
{{> report-outline/schema.md#material.source}}

<!-- @material.quote -->
{{> report-outline/schema.md#material.quote}}

<!-- @blocks -->
블록 목록(절 순서대로, 절 안은 라벨 사다리 순서 — 절은 요청에 적힌 이 지표의 「닫기 관례」대로 성과로 닫음)

<!-- @block.part -->
이 블록이 놓일 절 — parts 목록에서 몇 번째인지(1부터)

<!-- @block.kind -->
{{> report-outline/schema.md#block.kind}}

<!-- @block.variant -->
모양: cards=plus|arrow|plain|vs(2칸), compare=table|panels|diag(현황·문제 ▶ 추진방향 짝), steps=row|zigzag, timeline=chevron|dots, table=빈 글(구분·수치 표)|result(추진실적 열)|bars(값 옆 막대)|chevron(쉐브론 머리)|ladder(2단 라벨 — 도식 고르기의 「표 모양」), 그 밖은 빈 글

<!-- @block.label -->
왼쪽 라벨 = 라벨 사다리 단계 이름(추진배경·추진내용·추진성과·환경분석·전략체계·성과지표 등 10자 안팎). 전폭 블록은 빈 글

<!-- @block.purpose -->
{{> report-outline/schema.md#block.purpose}}

<!-- @block.cells -->
{{> report-outline/schema.md#block.cells}}

<!-- @block.materials -->
{{> report-outline/schema.md#block.materials}}

<!-- @block.figures -->
{{> report-outline/schema.md#block.figures}}

<!-- @block.alts -->
{{> report-outline/schema.md#block.alts}}

<!-- @block.layout -->
{{> report-outline/schema.md#block.layout}}

<!-- @block.span -->
{{> report-outline/schema.md#block.span}}

<!-- @splitAxis -->
갈래 축(선택) — 이 카드의 절을 나누는 축 하나, 요청 「갈래 축」 사전의 축 이름 글자 그대로. 절들이 실제로 다른 단계·국면·대상을 맡을 때만, 아니면 빈 글(절 다시 짜기에서는 늘 빈 글)
