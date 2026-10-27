// 경평 초안 화면 입력 한도(순수) — 서버 액션이 조용히 자르는 길이를 화면 maxLength·저장 전 검사와 한 곳에서 맞춤.
// 서버(actions.ts·edit-actions.ts·unit-parts-edit.ts)와 화면(components/reports/*)이 모두 여기서 import함.

/** 보고서 코멘트 본문(addComment) */
export const COMMENT_BODY_MAX = 4000;
/** 계량 실적 잠정치 값 하나(saveReportInputs) */
export const KPI_VALUE_MAX = 200;
/** 경평 글 직접 고침 한 칸(saveDraftTexts)과 한 번에 보내는 건수 */
export const DRAFT_TEXT_MAX = 600;
export const DRAFT_TEXT_EDITS_MAX = 60;
/** 카드 밖 부분: 목록 칸의 한 줄·줄 수, 짧은 글 칸, 담당자 칸 */
export const UNIT_PART_LINE_MAX = 600;
export const UNIT_PART_LINES_MAX = 40;
export const UNIT_PART_TEXT_MAX = 200;
export const UNIT_PART_CONTACT_MAX = 100;
