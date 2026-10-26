경영관리 경평 초안 「블록 고치기」 요청 글입니다. 「다른 모양으로」(2026-10-12)는 shapes 절 → block 절 → evidence 절(바꿀 수 있는 모양에 경영관리 표 모양 4종이 들어감). 코드(lib/reports/block-edit.ts blockEditPrompt)가 edit 또는 ask 절 → block 절 → evidence 절 순서로 붙입니다(판면 값 fitTotal·budget은 넘기지만 주요사업 판면이라 쓰지 않음). 글 한도(room)는 경영관리면 배정 쪽 × 판면 높이 − 경영관리 높이 어림(초안 spec.mg.pages — 없으면 「지금 줄 수 안팎」)으로 셈(2026-10-12).

<!-- @edit -->
「이번 요청 — 블록 고치기」 과제 「{{title}}」 초안의 {{n}}번 블록(전체 {{total}}개)을 담당자 요청대로 고칩니다.
- 블록 자리: {{around}}
- 글 한도(코드가 칸 폭으로 셈 — 반드시 지킴): {{room}}
- 고른 글: {{quote}}
- 요청: {{request}}
- 모양 바꾸기(요청이 모양을 말할 때만 — 아니면 지금 모양 그대로): 바꿀 수 있는 모양 {{shapes}} / 쓸 수 없는 모양 {{blocked}}

<!-- @ask -->
「이번 요청 — 질문」 과제 「{{title}}」 초안의 {{n}}번 블록(전체 {{total}}개)에 대한 담당자 질문입니다. 초안은 고치지 않고 답만 합니다.
- 블록 자리: {{around}}
- 글 한도: {{room}}
- 고른 글: {{quote}}
- 질문: {{request}}

<!-- @shapes -->
「이번 요청 — 다른 모양으로」 과제 「{{title}}」 초안의 {{n}}번 블록(전체 {{total}}개)의 같은 내용을 지금 모양({{current}})과 다른 모양 {{count}}안으로 다시 씁니다. 안마다 모양이 서로 달라야 합니다.
- 블록 자리: {{around}}
- 지금 모양의 글 한도: {{room}}
- 바꿀 수 있는 모양(모양마다 칸 수 · 새 모양의 칸 폭으로 코드가 센 한 줄 글자 수): {{shapes}}
- 쓸 수 없는 모양(근거 없음 — 고르지 않음): {{blocked}}
- 원하는 모양: {{want}}
- 덧붙인 요청: {{request}}

<!-- @block -->
{{> report-block/request.md#block}}

<!-- @evidence -->
{{> report-block/request.md#evidence}}
