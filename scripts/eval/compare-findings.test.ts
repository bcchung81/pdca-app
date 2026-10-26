// compare-report의 findings.html 끼우기: 조각이 있으면 section으로 감싸 넣고, 없으면 빈 문자열(출력 바이트 불변).
import assert from "node:assert/strict";
import test from "node:test";
import { findingsSection } from "./compare-report-core.ts";

test("조각이 있으면 cmp-findings 절로 그대로 감싸고 이스케이프하지 않음", () => {
  const frag = `<table><tr><td>a &amp; <b>굵게</b></td></tr></table>`;
  assert.equal(findingsSection(frag), `<section class="cmp-findings" id="findings">${frag}</section>\n`);
});

test("조각이 없거나 공백뿐이면 빈 문자열 — 끼운 출력이 원래와 같음", () => {
  assert.equal(findingsSection(null), "");
  assert.equal(findingsSection(undefined), "");
  assert.equal(findingsSection("  \n\t "), "");
  assert.equal(findingsSection(""), "");
});

import { filterRound, flawTable, agreements, judgedByName, type JudgeFile, type Manifest } from "./compare-report-core.ts";

const mf = (name: string, arm: string) => ({ name, arm, card: "c", run: 1 });
const manifest: Manifest = { arms: [{ id: "x", label: "X" }, { id: "y", label: "Y" }], drafts: [mf("x1", "x"), mf("x2", "x"), mf("y1", "y"), mf("y2", "y")] };
const key = { D1: "x1", D2: "x2", D3: "y1", D4: "y2" };
const jf = (judge: string, ov: number[], ranking: string[], flaws: JudgeFile["commonFlaws"]): JudgeFile => ({
  judge,
  drafts: ["D1", "D2", "D3", "D4"].map((id, i) => ({ id, scores: {}, overall: ov[i] })),
  ranking,
  commonFlaws: flaws,
});
const judges = [
  jf("a", [5, 4, 3, 2], ["D1", "D2", "D3", "D4"], [{ flaw: "y만", drafts: ["D3", "D4"], cause: "" }, { flaw: "섞임", drafts: ["D1", "D3"], cause: "" }]),
  jf("b", [4, 5, 1, 2], ["D2", "D1", "D4", "D3"], []),
];

test("팔을 거르면 일치도·결함표·심사 집계에서 그 팔 초안이 빠짐", () => {
  const r = filterRound(manifest, judges, key, ["x"]);
  assert.deepEqual(r.dropped, ["y"]);
  assert.equal(r.manifest.drafts.length, 2);
  assert.deepEqual([...judgedByName(r.judges, r.key).keys()].sort(), ["x1", "x2"]);
  assert.equal(agreements(r.judges, r.key)[0].common, 2);
  const flaws = flawTable(r.judges, r.key, r.manifest.drafts.map((d) => ({ name: d.name, arm: d.arm }) as never), r.manifest.arms);
  assert.deepEqual(flaws.map((f) => [f.flaw, f.byArm.x, f.total]), [["섞임", 1, 1]]);
});

test("--arms 없음 = 입력 그대로", () => {
  const r = filterRound(manifest, judges, key, null);
  assert.equal(r.manifest, manifest);
  assert.equal(r.judges, judges);
  assert.deepEqual(r.dropped, []);
});

test("없는 팔 id는 오류", () => {
  assert.throws(() => filterRound(manifest, judges, key, ["z"]));
});
