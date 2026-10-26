경평 초안 「블록 고치기」 요청 글입니다. 코드(lib/reports/block-edit.ts blockEditPrompt)가 edit 또는 ask 절 → block 절 → evidence 절 순서로 붙입니다.
「다른 모양으로」(2026-10-12 — blockShapesPrompt)는 shapes 절 → block 절 → evidence 절. 추진성과 상자(2026-10-13 — resultEditPrompt)는 result 또는 resultAsk 절 → evidence 절(주요사업만 — 경영관리 report-block-mg에는 없음). 바꿀 수 있는 모양 목록(shapes)·쓸 수 없는 모양(blocked)은 코드가 트랙·근거 조건으로 셈(lib/reports/block-shape.ts — 경영관리 전용 표 모양은 주요사업이면 적지 않음).

<!-- @edit -->
「이번 요청 — 블록 고치기」 소항목 「{{title}}」(이야기 틀 {{story}})의 {{n}}번 블록(전체 {{total}}개)을 담당자 요청대로 고칩니다.
- 블록 자리: {{around}}
- 판면: 초안 어림 {{fitTotal}}mm / 예산 {{budget}}mm — 이 블록 어림 높이 약 {{rowMm}}mm
- 글 한도(코드가 칸 폭으로 셈 — 반드시 지킴): {{room}}
- 고른 글: {{quote}}
- 요청: {{request}}
- 모양 바꾸기(요청이 모양을 말할 때만 — 아니면 지금 모양 그대로): 바꿀 수 있는 모양 {{shapes}} / 쓸 수 없는 모양 {{blocked}}

<!-- @ask -->
「이번 요청 — 질문」 소항목 「{{title}}」(이야기 틀 {{story}})의 {{n}}번 블록(전체 {{total}}개)에 대한 담당자 질문입니다. 초안은 고치지 않고 답만 합니다.
- 블록 자리: {{around}}
- 판면: 초안 어림 {{fitTotal}}mm / 예산 {{budget}}mm · 이 블록 약 {{rowMm}}mm
- 글 한도: {{room}}
- 고른 글: {{quote}}
- 질문: {{request}}

<!-- @shapes -->
「이번 요청 — 다른 모양으로」 소항목 「{{title}}」(이야기 틀 {{story}})의 {{n}}번 블록(전체 {{total}}개)의 같은 내용을 지금 모양({{current}})과 다른 모양 {{count}}안으로 다시 씁니다. 안마다 모양이 서로 달라야 합니다.
- 블록 자리: {{around}}
- 판면: 초안 어림 {{fitTotal}}mm / 예산 {{budget}}mm — 이 블록 어림 높이 약 {{rowMm}}mm
- 지금 모양의 글 한도: {{room}}
- 바꿀 수 있는 모양(모양마다 칸 수 · 새 모양의 칸 폭으로 코드가 센 한 줄 글자 수): {{shapes}}
- 쓸 수 없는 모양(근거 없음 — 고르지 않음): {{blocked}}
- 원하는 모양: {{want}}
- 덧붙인 요청: {{request}}

<!-- @result -->
「이번 요청 — 추진성과 고치기」 소항목 「{{title}}」(이야기 틀 {{story}})의 끝 「추진성과」 상자를 담당자 요청대로 고칩니다. 블록이 아니라 소항목의 올해 결과·성과 수치를 모은 칸입니다.
- 고치는 칸: 추진성과 줄(results — {{lines}}줄까지, 한 줄 약 {{perLine}}자 · 줄 수를 늘리지 않는 쪽으로) · 강조 띠(band — {{band}})
- 3칸(resultCards)·막대(resultChart)는 고치지 않습니다(답에 넣지 않음 — 그대로 남음)
- 수치는 근거에 있는 것만 씁니다. 올해 값이 근거에 없으면 지어내지 않고 【확인: …】 자리표시로 두며, 이미 있는 【확인: …】 자리표시는 지우지 않습니다
- 판면: 초안 어림 {{fitTotal}}mm / 예산 {{budget}}mm
- 고른 글: {{quote}}
- 요청: {{request}}

「지금 추진성과(JSON)」
{{result}}

<!-- @resultAsk -->
「이번 요청 — 질문」 소항목 「{{title}}」(이야기 틀 {{story}})의 끝 「추진성과」 상자(올해 결과·성과 수치 칸 — 줄 {{lines}}줄까지, 한 줄 약 {{perLine}}자, 강조 띠 {{band}})에 대한 담당자 질문입니다. 초안은 고치지 않고 답만 합니다.
- 판면: 초안 어림 {{fitTotal}}mm / 예산 {{budget}}mm
- 고른 글: {{quote}}
- 질문: {{request}}

「지금 추진성과(JSON)」
{{result}}

<!-- @block -->
「지금 블록(JSON)」
{{block}}

<!-- @evidence -->
「근거 — 카드」
{{card}}

「근거 — 첨부·전년 보고서 절·실사 답변·계량 실적 입력」
{{extra}}
