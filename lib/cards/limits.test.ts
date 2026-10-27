import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMENT_LIMITS } from "../ai/comments.ts";
import { ARCHIVE_REASON_MAX, COMMENT_TEXT_MAX, MATERIAL_MAX_BYTES, RETURN_NOTE_MAX, SKIP_REASON_MAX, materialNameProblem } from "./limits.ts";

test("카드 전용 자료: AI 창 첨부와 같은 11종만 받고(대소문자 무관) 나머지는 거절", () => {
  for (const n of ["a.pdf", "a.HWP", "a.hwpx", "a.docx", "a.xlsx", "a.xls", "a.jpg", "a.jpeg", "a.PNG", "a.webp", "a.gif"]) assert.equal(materialNameProblem(n), null, n);
  for (const n of ["a.zip", "a.pptx", "a.txt", "noext"]) assert.match(materialNameProblem(n) ?? "", /파일만 올릴 수 있습니다/, n);
});

test("서버가 자르는 칸의 한도 상수", () => {
  assert.deepEqual([RETURN_NOTE_MAX, ARCHIVE_REASON_MAX, SKIP_REASON_MAX, COMMENT_TEXT_MAX, MATERIAL_MAX_BYTES], [1000, 300, 300, 2000, 50 * 1024 * 1024]);
  assert.equal(COMMENT_LIMITS.text, COMMENT_TEXT_MAX);
});
