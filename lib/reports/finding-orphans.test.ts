import assert from "node:assert/strict";
import { test } from "node:test";
import { orphanFindings } from "./finding-orphans.ts";

const f = (no: number, text: string) => ({ chunkKey: "k", no, label: "", text });
const card = (id: string, taskNo: string, finding: string[]) => ({ id, taskNo, status: "active", data: { findings: { rows: [{ finding, plan: [] }] } } });

const ORIGINAL = "청년 신규채용 확대와 함께 유관기업 연계 취업지원 프로그램의 성과를 정량 지표로 관리할 필요가 있음";

test("카드가 바꿔 쓴 지적과 원문이 짝지어지면 소관 있음(후보 아님)", () => {
  const r = orphanFindings("MG-3", [f(1, ORIGINAL)], [card("a", "경영관리3/3-1", ["∙ 유관기업 연계 취업지원 프로그램의 성과를 정량 지표로 관리 필요"])]);
  assert.deepEqual(r, []);
});

test("어느 카드 지적에도 없는 원문은 소관 카드 없음 후보로 가장 가까운 카드와 점수를 냄", () => {
  const r = orphanFindings("MG-3", [f(2, "공공부문 도급 노동자의 임금체불 예방 점검 체계를 구축할 필요가 있음")], [card("a", "경영관리3/3-1", ["∙ 청년 신규채용 확대 필요"]), card("b", "경영관리3/3-3", ["∙ 지역업체 발주 비중 제고"])]);
  assert.equal(r.length, 1);
  assert.equal(r[0].unit, "MG-3");
  assert.ok(r[0].nearest && r[0].nearest.score < 0.25);
});

test("카드에 지적 행이 없으면 모든 원문이 후보이고 nearest는 null", () => {
  const r = orphanFindings("MG-3", [f(1, ORIGINAL)], [{ id: "a", taskNo: "경영관리3/3-1", status: "active", data: { findings: { rows: [{ finding: ["∙ 경영평가 지적사항 없음"] }] } } }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].nearest, null);
});

test("보관 카드는 소관으로 치지 않음", () => {
  const retired = { ...card("a", "경영관리3/3-1", ["유관기업 연계 취업지원 프로그램의 성과를 정량 지표로 관리"]), status: "retired" };
  assert.equal(orphanFindings("MG-3", [f(1, ORIGINAL)], [retired]).length, 1);
});
