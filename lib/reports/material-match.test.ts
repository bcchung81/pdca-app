import assert from "node:assert/strict";
import { test } from "node:test";
import { type MaterialMatch, fileRelation, initialSelection, materialSummary, planMaterialSelection, suggestCards } from "./material-match.ts";

const m = (cardId: string, method: MaterialMatch["method"] = "human", basis: string | null = null): MaterialMatch => ({ cardId, method, basis });
const cards = [
  { id: "주요사업1/1-가", taskNo: "1-가" },
  { id: "주요사업1/1-나", taskNo: "1-나" },
  { id: "주요사업1/11-가", taskNo: "11-가" },
  { id: "주요사업1/2-다", taskNo: "2-다" },
];

test("파일 이름 제안: 이름에 과제번호가 있는 과제만(본문은 안 봄), 여러 번호도 모두", () => {
  assert.deepEqual(suggestCards("1-가_현장사진.pdf", cards), ["주요사업1/1-가"]);
  assert.deepEqual(suggestCards("(1-가, 1-나) 언론보도 모음.hwpx", cards), ["주요사업1/1-가", "주요사업1/1-나"]);
  assert.deepEqual(suggestCards("보도자료.pdf", cards), []);
  assert.deepEqual(suggestCards("", cards), []);
});

test("파일 이름 제안: 11-가를 1-가로, 「1-가지」를 1-가로 잘못 보지 않고, 자모 분리(NFD) 파일 이름도 알아봄", () => {
  assert.deepEqual(suggestCards("11-가_실적.xlsx", cards), ["주요사업1/11-가"], "앞에 숫자가 붙은 번호는 다른 번호");
  assert.deepEqual(suggestCards("1-가지 방법.pdf", cards), [], "뒤에 글자가 이어지면 다른 말");
  assert.deepEqual(suggestCards("2-다 사진".normalize("NFD") + ".jpg", cards), ["주요사업1/2-다"], "macOS NFD 이름");
  assert.deepEqual(suggestCards("1-가.pdf", [{ id: "x", taskNo: "" }]), [], "번호가 빈 카드는 제안하지 않음");
});

test("첫 선택: 사람이 확정한 것이 있으면 그것만(파일 이름 제안은 무시), 없으면 파일 이름 제안을 미리 체크", () => {
  assert.deepEqual(initialSelection([m("A"), m("B")], ["C"]), ["A", "B"]);
  assert.deepEqual(initialSelection([], ["C"]), ["C"]);
  assert.deepEqual(initialSelection([]), []);
});

test("연결 요약: 확정이 있으면 confirmed, 확정 없이 제안만 있으면 suggested(저장해야 확정), 둘 다 없으면 none", () => {
  assert.deepEqual(materialSummary([m("A"), m("B")], ["C"]), { state: "confirmed", confirmed: 2, suggested: 0 });
  assert.deepEqual(materialSummary([], ["C", "D"]), { state: "suggested", confirmed: 0, suggested: 2 });
  assert.deepEqual(materialSummary([]), { state: "none", confirmed: 0, suggested: 0 });
});

test("저장 계획: 체크한 과제는 확정(이미 있던 행은 method·근거 유지), 뺀 과제는 연결 삭제, 이 보고서 과제가 아닌 것은 invalid", () => {
  const plan = planMaterialSelection([m("A", "ai", "안테나 판독"), m("B", "ai", "애매"), m("C", "human")], ["A", "D", "X", "A"], new Set(["A", "B", "C", "D"]));
  assert.deepEqual(plan.invalid, ["X"]);
  assert.deepEqual(plan.upsert, [{ cardId: "A", method: "ai", basis: "안테나 판독" }, { cardId: "D", method: "human", basis: null }]);
  assert.deepEqual(plan.remove, ["B", "C"]);
});

test("하나도 안 고르면 연결이 모두 지워져 「같은 보고서 자료」가 된다", () => {
  const plan = planMaterialSelection([m("A"), m("B")], [], new Set(["A", "B"]));
  assert.deepEqual(plan, { invalid: [], upsert: [], remove: ["A", "B"] });
});

test("자료 관계: 카드 전용은 늘 숫자 근거, 보고서 추가자료는 이 과제에 확정한 연결이 있을 때만(파일 이름 제안만으로는 아님)", () => {
  const confirmed = new Set(["R1"]);
  assert.deepEqual(fileRelation({ id: "K1", kind: "card" }, confirmed), { relation: "card", numberEvidence: true });
  assert.deepEqual(fileRelation({ id: "R1", kind: "report" }, confirmed), { relation: "matched", numberEvidence: true });
  assert.deepEqual(fileRelation({ id: "R2", kind: "report" }, confirmed), { relation: "same-report", numberEvidence: false });
  assert.deepEqual(fileRelation({ id: "R1", kind: "report" }, new Set()), { relation: "same-report", numberEvidence: false }, "확정이 없으면 같은 보고서 자료");
});
