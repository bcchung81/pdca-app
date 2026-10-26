드래그 코멘트(card-comment) AI 답의 필드 설명입니다(구조화 출력 JSON 스키마의 description으로 갑니다). 필드 구조·종류 목록은 코드(lib/ai/comments.ts `commentResultSchema`)가 정하고, 여기에는 뜻과 채우는 법만 씁니다.
절 이름(「<!-- @이름 -->」)은 필드 경로입니다(점으로 안쪽 필드). 절을 지우거나 이름을 바꾸면 불러올 때 오류가 납니다.

<!-- @results -->
코멘트마다 하나씩

<!-- @results.comment_id -->
「코멘트」의 id 그대로

<!-- @results.outcome -->
edited = 카드를 고침 / answered = 질문에 답함(카드는 그대로) / declined = 고치지 않음

<!-- @results.edits -->
카드 고치기. 질문·declined면 빈 배열

<!-- @results.edits.path -->
「카드」에 적힌 경로 그대로

<!-- @results.edits.lines -->
replace·insert_after의 새 글(한 줄 = 한 항목). delete는 빈 배열

<!-- @results.reply -->
사용자에게 보일 한두 문장: 무엇을 고쳤는지 / 질문의 답 / 고치지 않은 까닭
