작성지원(card-assist) AI 답의 필드 설명입니다(구조화 출력 JSON 스키마의 description으로 갑니다). 필드 구조·종류 목록은 코드(lib/ai/writer.ts `writerResultSchema`)가 정하고, 여기에는 뜻과 채우는 법만 씁니다.
절 이름(「<!-- @이름 -->」)은 필드 경로입니다(점으로 안쪽 필드). 절을 지우거나 이름을 바꾸면 불러올 때 오류가 납니다.

<!-- @headline -->
한 줄 결론(두괄식)

<!-- @summary -->
개조식 본문. 출력기호 ◆ ▸ □ ○, 공식 경어체, 인용은 「」

<!-- @citations -->
인용한 근거

<!-- @citations.key -->
근거 자료·첨부 자료 key(첨부는 file:N)

<!-- @citations.quote -->
그 자료의 원문 구절 그대로(200자 이내)

<!-- @suggestions -->
카드에 바로 반영할 수 있는 제안

<!-- @suggestions.target_path -->
카드에 적힌 칸 경로 그대로. monthly면 null

<!-- @suggestions.period -->
monthly일 때 기간(예: 9월)

<!-- @suggestions.proposed -->
바꿀·넣을 글 줄들(카드 글머리 표기 유지)

<!-- @suggestions.reason -->
왜 이렇게 고치는지 한두 문장

<!-- @suggestions.source_keys -->
근거 자료·첨부 자료 key

<!-- @monthly_row -->
모드 A 월별 실적 6열(월·추진실적·정량성과·정성성과·진도율·리스크). 다른 모드는 null

<!-- @need_input -->
자료가 모자라 되물어야 할 때의 질문. 없으면 null

<!-- @followup -->
보완 점검에서만 채움(다른 요청 종류는 null). 요청의 「점검표 보완 요구」 행마다 하나씩

<!-- @followup.id -->
요청에 준 행 id 그대로(예: axes.4)

<!-- @followup.judgment -->
반영됨 · 일부 반영 · 미반영 · 확인 불가 중 하나(공식 판정이 아님)

<!-- @followup.card_quote -->
판단 근거가 된 현재 카드 칸의 글 한 문장 이내, 원문 그대로. 확인 불가면 빈 문자열

<!-- @followup.inspection_quote -->
점검표 보완 요구의 원문 한 문장 이내, 원문 그대로

<!-- @followup.remaining -->
남은 할 일 한 줄('어느 칸에 무엇을'). 반영됨이면 빈 문자열
