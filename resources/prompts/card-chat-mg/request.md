질문 요청 글입니다. 코드(lib/ai/chat.ts `chatPrompt`)가 prompt 절을 채우고, 첨부가 있으면 files.head 절과 자료별 <source key="file:N"> 봉투(전체 글), 이전 대화가 있으면 history.* 절, 끝에 question 절을 이어 붙입니다(블록 사이 빈 줄).

<!-- @prompt -->
기준 월: {{period}}

「카드」 — 칸 경로 | 글
{{card}}

「점검결과」
{{inspection}}

「근거 자료」
{{refs}}

<!-- @history.head -->
「이전 대화」

<!-- @history.user -->
담당자: {{text}}

<!-- @history.ai -->
AI: {{text}}

<!-- @question -->
「이번 질문」
{{question}}

<!-- @files.head -->
{{> _shared/files.md#head}}

<!-- @kb.institution -->
{{> _shared/knowledge-mg.md#institution}}

<!-- @kb.common -->
{{> _shared/knowledge-mg.md#common}}

<!-- @kb.business -->
{{> _shared/knowledge-mg.md#business}}

<!-- @kb.list -->
{{> _shared/knowledge-mg.md#list}}

<!-- @kb.taskRow -->
{{> _shared/knowledge-mg.md#taskRow}}

<!-- @kb.none -->
{{> _shared/knowledge-mg.md#none}}
