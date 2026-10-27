import { ATTACH_LABEL, isAttachableName } from "../ai/writer.ts";

// 서버가 말없이 자르는 글 칸의 한도 — 서버 액션과 화면 maxLength가 같은 값을 씀(순수 파일: 「use server」 파일은 상수를 export할 수 없음)

/** 작성본 돌려보내기 메모 */
export const RETURN_NOTE_MAX = 1000;
/** 과제 삭제(보관) 까닭 */
export const ARCHIVE_REASON_MAX = 300;
/** 현행화 건너뛰기 사유 */
export const SKIP_REASON_MAX = 300;
/** 카드 코멘트 한 건의 글 */
export const COMMENT_TEXT_MAX = 2000;

/** 카드 전용 자료 파일당 크기 한도 */
export const MATERIAL_MAX_BYTES = 50 * 1024 * 1024;

/** 카드 전용 자료 파일 이름이 받는 형식이 아니면 거절 문구, 맞으면 null(AI 창 첨부와 같은 11종) */
export function materialNameProblem(name: string): string | null {
  return isAttachableName(name) ? null : `「${name}」 — ${ATTACH_LABEL} 파일만 올릴 수 있습니다.`;
}
