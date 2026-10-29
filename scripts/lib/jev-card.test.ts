import assert from "node:assert/strict";
import { test } from "node:test";
import { cardState } from "../../lib/ai/typesafe.ts";
import { jevCard } from "./jev-card.ts";

test("주요사업 카드(지적 칸 없음)는 받은 값 그대로", () => {
  const biz = { title: "과제", act: { findings: ["지적 하나"] } };
  assert.equal(jevCard(biz), biz);
  assert.equal(jevCard(null), null);
});

test("경영관리 지적 칸(줄 목록·문자열 모두)을 act.findings로 옮겨 Jev 상태에 들어감", () => {
  const mg = { title: "과제", findings: { rows: [{ finding: ["∙ 첫 줄", " ", "∙ 둘째 줄"], plan: ["계획"] }, { finding: "∙ 셋째 줄" }] } };
  const out = jevCard(mg) as { act: { findings: string[] } };
  assert.deepEqual(out.act.findings, ["∙ 첫 줄", "∙ 둘째 줄", "∙ 셋째 줄"]);
  assert.deepEqual(cardState(out).task.전년_지적사항, ["∙ 첫 줄", "∙ 둘째 줄", "∙ 셋째 줄"]);
});

test("지적 칸이 비면 그대로", () => {
  const mg = { findings: { rows: [{ finding: [] }, { finding: [""] }] } };
  assert.equal(jevCard(mg), mg);
});
