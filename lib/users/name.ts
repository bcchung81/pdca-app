// 사용자 이름(이름·직위) 규칙 — 계정 만들기·수정(옆 창)과 일괄 등록이 같은 판정을 씁니다(입출력 없음).
// 화면은 같은 한도로 required·maxLength를 걸고, 서버는 넘는 이름을 자르지 않고 거절합니다.

import { cleanCell } from "./paste.ts";

export const NAME_MAX = 40;

/** 이름 정리(공백·보이지 않는 글자 정돈) 뒤 판정. 문제가 없으면 정리된 이름, 있으면 까닭(끝 마침표 없음) */
export function checkDisplayName(raw: string): { ok: true; name: string } | { ok: false; name: string; message: string } {
  const name = cleanCell(raw);
  if (!name) return { ok: false, name, message: "이름이 비어 있습니다" };
  if (name.length > NAME_MAX) return { ok: false, name, message: `이름이 ${NAME_MAX}자를 넘습니다` };
  return { ok: true, name };
}
