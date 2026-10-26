드래그 코멘트 요청 글입니다. 코드(lib/ai/comments.ts `commentPrompt`)가 prompt 절을 채우고, 코멘트마다 <comment id kind at> 태그 안에 comment.* 절을, 유지할 부분이 있으면 keeps.* 절을, 그다음 refs 절을, 카드 전용 자료가 있으면 끝에 files.head 절과 자료별 <source key="file:N"> 봉투(전체 글)를 이어 붙입니다.
태그 이름·속성(id·kind·at)과 종류 이름(수정·질문)은 코드가 정합니다.

<!-- @prompt -->
기준 월: {{period}}
과제: {{taskNo}} {{title}}

「카드」 — 경로 [줄|칸] | 글
{{card}}

「코멘트」

<!-- @comment.wholeCard -->
카드 전체

<!-- @comment.paths -->
고른 글이 걸친 칸: {{paths}}

<!-- @comment.quote -->
고른 글: 「{{quote}}」

<!-- @comment.text -->
요청: {{text}}

<!-- @comment.emptyEdit -->
(내용 없음 — 고른 글을 지침과 문체 기준에 맞게 다듬어 주세요)

<!-- @comment.empty -->
(내용 없음)

<!-- @keeps.head -->
「유지할 부분」(사용자가 좋다고 표시 — 바꾸지 않음)

<!-- @keeps.item -->
- {{path}} | 「{{quote}}」

<!-- @refs -->
「근거 자료」
{{refs}}

<!-- @files.head -->
{{> _shared/files.md#head}}

<!-- @kb.institution -->
{{> _shared/knowledge.md#institution}}

<!-- @kb.common -->
{{> _shared/knowledge.md#common}}

<!-- @kb.business -->
{{> _shared/knowledge.md#business}}

<!-- @kb.list -->
{{> _shared/knowledge.md#list}}

<!-- @kb.taskRow -->
{{> _shared/knowledge.md#taskRow}}

<!-- @kb.none -->
{{> _shared/knowledge.md#none}}
