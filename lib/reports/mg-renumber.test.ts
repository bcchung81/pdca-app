// 경영관리 평가내용 번호 옮기기(lib/reports/mg-renumber.ts) 시험 — 2026-11-19 사용자 결정 D1 안 2·D2(MG-7 옛 자료 변환).
// 지키는 것: 동시 사상(2 → 3과 3 → 4 — 연쇄 없음) · 제목 대조로 두 번 돌려도 같음 · 새 구성안의 ②(지역업체)는 그대로 · 블록 at·초안 at·finding·coverage 열쇠 ·
// 목차 1단·「걸침」 2단(1단이 안 옮기면 2단도 그대로 + 확인) · 지표 단위 부분 행 id·code.evalNo(사람·AI 칸 그대로) · 사상 없는 지표는 그대로 · 열쇠 겹침은 옮기지 않음

import assert from "node:assert/strict";
import { test } from "node:test";
import { type MgRenumberCtx, renumberComposition, renumberDraftRow, renumberMap, renumberOutlineRow, renumberSpec, renumberUnitPart } from "./mg-renumber.ts";

const T25 = new Map([
  [1, "상생 제목"],
  [2, "기부·봉사 지역경제 제목"],
  [3, "시설 개방 제목"],
]);
const T26 = new Map([
  [1, "상생 제목"],
  [2, "지역업체 발주 제목"],
  [3, "기부·봉사 지역인재 제목"],
  [4, "시설 개방 제목"],
]);
const CTX: MgRenumberCtx = { unit: "MG-7", titles2025: T25, titles26: T26 };

const part = (evalNo: number, evalTitle: string, themeNo: number, mark: string) => ({ key: `${evalNo}.${themeNo}.${mark || "0"}`, evalNo, evalTitle, themeNo, themeTitle: "대주제", mark, title: mark ? "절" : "", story: "", why: "" });

/** 옛 구성안(2025 연번): 7-4 지역공부방(2) + 시설(3) 절이 함께 있는 극단 사례 */
const oldOutline = () => ({
  version: 1,
  blocks: [{ at: "2.2.가", label: "a" }, { at: "2.2.나", label: "b" }, { at: "3.1.가", label: "c" }],
  materials: [],
  mg: { indicator: "상생", parts: [part(2, "기부·봉사 지역경제 제목", 2, "가"), part(2, "기부·봉사 지역경제 제목", 2, "나"), part(3, "시설 개방 제목", 1, "가")] },
});

test("사상: 상생만 {2→3, 3→4}, 다른 지표는 빈 맵", () => {
  assert.deepEqual([...renumberMap("MG-7")], [[2, 3], [3, 4]]);
  assert.equal(renumberMap("MG-3").size, 0);
  assert.equal(renumberMap("BZ-1").size, 0);
});

test("구성안: 동시 사상(2 → 3, 3 → 4 — 3이 다시 4로 밀리지 않음), 블록 at·제목은 '26, 두 번 돌려도 같음", () => {
  const r = renumberComposition(oldOutline(), CTX);
  assert.equal(r.changed, 3);
  assert.deepEqual(r.value.mg.parts.map((p: { key: string; evalTitle: string }) => [p.key, p.evalTitle]), [["3.2.가", "기부·봉사 지역인재 제목"], ["3.2.나", "기부·봉사 지역인재 제목"], ["4.1.가", "시설 개방 제목"]]);
  assert.deepEqual(r.value.blocks.map((b: { at: string }) => b.at), ["3.2.가", "3.2.나", "4.1.가"]);
  const again = renumberComposition(r.value, CTX);
  assert.equal(again.changed, 0, "두 번째는 아무것도 안 바꿈");
  assert.deepEqual(again.value, r.value);
});

test("새 구성안('26 번호)의 ② 지역업체·③ 절은 그대로(제목이 2025 제목과 다름) · 사상 없는 지표·골격 없는 구성안도 그대로", () => {
  const fresh = { version: 1, blocks: [{ at: "2.1.0" }, { at: "3.1.가" }], materials: [], mg: { indicator: "상생", parts: [part(2, "지역업체 발주 제목", 1, ""), part(3, "기부·봉사 지역인재 제목", 1, "가")], coverage: [{ item: 2, state: "씀", part: "2.1.0", why: "" }] } };
  const r = renumberComposition(fresh, CTX);
  assert.equal(r.changed, 0);
  assert.equal(r.value, fresh);
  assert.equal(renumberComposition(oldOutline(), { ...CTX, unit: "MG-3" }).changed, 0);
  assert.equal(renumberComposition({ version: 1, blocks: [], materials: [] }, CTX).changed, 0);
});

test("옮길 열쇠가 남은 절과 겹치면 그 절은 옮기지 않고 확인 줄", () => {
  const mixed = { ...oldOutline(), mg: { indicator: "상생", parts: [part(2, "기부·봉사 지역경제 제목", 2, "가"), part(3, "기부·봉사 지역인재 제목", 2, "가")] } };
  const r = renumberComposition(mixed, CTX);
  assert.equal(r.changed, 0);
  assert.match(r.notes[0], /절 2\.2\.가 → 3\.2\.가: 같은 열쇠의 절이 이미 있어 옮기지 않음/);
});

test("초안 spec: parts·at·finding 열쇠, coverage 열쇠(구성안) · 초안 행 하나(판 되돌리기 공용)는 바뀐 칸만", () => {
  const spec = { blocks: [{}, {}, {}], mg: { indicator: "상생", parts: [part(1, "상생 제목", 1, "가"), part(2, "기부·봉사 지역경제 제목", 2, "가"), part(3, "시설 개방 제목", 1, "가")], at: ["1.1.가", "2.2.가", "3.1.가"], finding: ["2.2.가"] } };
  const r = renumberSpec(spec, CTX);
  assert.equal(r.changed, 2);
  assert.deepEqual(r.value.mg.at, ["1.1.가", "3.2.가", "4.1.가"]);
  assert.deepEqual(r.value.mg.finding, ["3.2.가"]);
  assert.deepEqual(r.value.mg.parts.map((p: { evalNo: number }) => p.evalNo), [1, 3, 4]);
  const row = renumberDraftRow({ outline: oldOutline(), spec }, CTX);
  assert.equal(row.changed, 5);
  assert.ok(row.outline && row.spec);
  assert.deepEqual(renumberDraftRow({ outline: renumberComposition(oldOutline(), CTX).value, spec: r.value }, CTX), { changed: 0, notes: [] }, "옮긴 행은 아무 칸도 안 돌려줌");
});

test("목차 행: 「평가내용 2. 2025 제목」 → 「평가내용 3. '26 제목」, 그 행의 「2·3에 걸침」 → 「3·4에 걸침」(동시) · 두 번째는 그대로 · 1단이 안 옮기면 2단도 그대로 + 확인", () => {
  const r = renumberOutlineRow({ section: "평가내용 2. 기부·봉사 지역경제 제목", subsection: "평가내용 2·3에 걸침" }, CTX);
  assert.deepEqual(r, { section: "평가내용 3. 기부·봉사 지역인재 제목", subsection: "평가내용 3·4에 걸침", changed: true, notes: [] });
  assert.equal(renumberOutlineRow({ section: r.section, subsection: r.subsection }, CTX).changed, false, "두 번 돌려도 같음");
  assert.deepEqual(renumberOutlineRow({ section: "평가내용 3. 시설 개방 제목", subsection: null }, CTX), { section: "평가내용 4. 시설 개방 제목", subsection: null, changed: true, notes: [] });
  const keep = renumberOutlineRow({ section: "평가내용 1. 상생 제목", subsection: "평가내용 1·2에 걸침" }, CTX);
  assert.equal(keep.changed, false);
  assert.match(keep.notes[0], /1단\(「평가내용 1\. 상생 제목」\)이 옮길 평가내용이 아니라 바꾸지 않음/);
  assert.equal(renumberOutlineRow({ section: "평가내용 2. 기부·봉사 지역경제 제목", subsection: null }, { ...CTX, unit: "MG-1" }).changed, false);
});

test("지표 단위 부분: 전년 대비 행 id·code.evalNo·제목만 '26으로(’25까지·’26 칸 글은 그대로), 성과분석 qual·plan도 · 두 번 돌려도 같음 · 표지·지적은 그대로", () => {
  const row = (no: number, title: string) => ({ id: `prior/${no}`, code: { evalNo: no, title, cards: [] }, human: { upTo: [`’25 ${no}`] }, ai: { now: [`’26 ${no}`], effect: [] } });
  const prior = { part: "prior", rows: [row(1, "상생 제목"), row(2, "기부·봉사 지역경제 제목"), row(3, "시설 개방 제목")] };
  const r = renumberUnitPart(prior, CTX);
  assert.equal(r.changed, 2);
  assert.deepEqual(r.value.rows.map((x: { id: string; code: { evalNo: number }; human: { upTo: string[] } }) => [x.id, x.code.evalNo, x.human.upTo[0]]), [["prior/1", 1, "’25 1"], ["prior/3", 3, "’25 2"], ["prior/4", 4, "’25 3"]]);
  assert.equal(renumberUnitPart(r.value, CTX).changed, 0);
  const er = (k: string, no: number, title: string) => ({ id: `${k}/${no}`, code: { evalNo: no, title }, human: { label: "구분" }, ai: {} });
  const outcome = { part: "outcome", kpi: [], qual: [er("qual", 2, "기부·봉사 지역경제 제목"), er("qual", 3, "시설 개방 제목")], plan: [er("plan", 3, "시설 개방 제목")] };
  const o = renumberUnitPart(outcome, CTX);
  assert.equal(o.changed, 3);
  assert.deepEqual([...o.value.qual, ...o.value.plan].map((x: { id: string }) => x.id), ["qual/3", "qual/4", "plan/4"]);
  assert.equal(renumberUnitPart({ part: "cover", code: {} }, CTX).changed, 0);
});
