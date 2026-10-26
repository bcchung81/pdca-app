/**
 * 코멘트를 쓰는 동안 고른 글의 칠(CSS Custom Highlight, ::highlight(kc-pick)).
 * CSS 파일에 두지 못하는 이유: Turbopack CSS 파서가 ::highlight()를 몰라 pnpm build마다 경고가 남음 —
 * 그래서 문자열로 두고 쓰는 화면(카드 편집기·경평 초안 작업 공간)이 <style>로 주입함.
 */
export const PICK_HIGHLIGHT_CSS = "::highlight(kc-pick){background-color:var(--hl-pick)}";
