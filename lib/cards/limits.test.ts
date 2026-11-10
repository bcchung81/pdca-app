import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMENT_LIMITS } from "../ai/comments.ts";
import { ARCHIVE_REASON_MAX, COMMENT_TEXT_MAX, MATERIAL_MAX_BYTES, RETURN_NOTE_MAX, SKIP_REASON_MAX, isMaterialPath, materialNameProblem } from "./limits.ts";

test("카드 전용 자료: AI 창 첨부와 같은 11종만 받고(대소문자 무관) 나머지는 거절", () => {
  for (const n of ["a.pdf", "a.HWP", "a.hwpx", "a.docx", "a.xlsx", "a.xls", "a.jpg", "a.jpeg", "a.PNG", "a.webp", "a.gif"]) assert.equal(materialNameProblem(n), null, n);
  for (const n of ["a.zip", "a.pptx", "a.txt", "noext"]) assert.match(materialNameProblem(n) ?? "", /파일만 올릴 수 있습니다/, n);
});

test("서버가 자르는 칸의 한도 상수", () => {
  assert.deepEqual([RETURN_NOTE_MAX, ARCHIVE_REASON_MAX, SKIP_REASON_MAX, COMMENT_TEXT_MAX, MATERIAL_MAX_BYTES], [1000, 300, 300, 2000, 50 * 1024 * 1024]);
  assert.equal(COMMENT_LIMITS.text, COMMENT_TEXT_MAX);
});

test("카드 전용 자료 경로: 「카드 uid/새 uuid.확장자」만 받고, 다른 카드·하위 폴더·되돌아가기·이상한 확장자는 거절", () => {
  const uid = "24acfaa8-f66a-49c3-9495-948aaf774730";
  const other = "0e698bcc-a0f4-4ccd-82c6-08dd736e91f8";
  const file = "5b3f0c1e-7d2a-4c8e-9f10-2a3b4c5d6e7f";
  for (const p of [`${uid}/${file}.pdf`, `${uid}/${file}.hwpx`, `${uid}/${file}`]) assert.equal(isMaterialPath(uid, p), true, p);
  for (const p of [`${other}/${file}.pdf`, `${uid}/../${other}/${file}.pdf`, `${uid}/${other}/${file}.pdf`, `${uid}/${file}.PDF`, `${uid}/${file}.pdf.exe1234`, `${uid}/x.pdf`, `${uid}/`, `${uid}`])
    assert.equal(isMaterialPath(uid, p), false, p);
  assert.equal(isMaterialPath("../x", `../x/${file}.pdf`), false);
});
