// 경영관리 카드 밖 부분 조판 입력(R5d — unit-parts-layout.ts) 시험: 장 높이 어림(칸 폭·글자 수·빈 칸), 비고 쪽(조판 결과의 절 쪽 → p.N),
// 조판 끼움(layoutBusiness opts.mg.outside) — 지적 + 전년 대비 새 쪽에서 이어 씀·본문 새 쪽·성과분석 새 쪽·표지 쪽 수 안 셈·부분 없으면 출력 그대로·넘침 경고.

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type BusinessItem, layoutBusiness, mgContinuations, sheetsOf, stackOutside } from "./business-layout.ts";
import { outsideSheetHtml, sheetHtml } from "./business-html.ts";
import { PAGE_MM } from "./fit.ts";
import { mgPageRef } from "./mg-page-plan.ts";
import { MG_FRONT_PAGE_2025, findingRemarks, partPageOf, unitPartsOutside } from "./unit-parts-layout.ts";
import { type UnitPartsMg } from "./unit-parts-mg.ts";

const H = PAGE_MM.height;

const bullets = (n: number, label = "추진내용"): any => ({ kind: "bullets", label, title: "", variant: "", text: "", items: Array.from({ length: n }, (_, i) => `경영관리 추진 내용 ${i + 1}번 줄`), cells: [], rows: [], series: [], badge: "" });
const mgSpec = (parts: Array<[number, number, string]>, lines = 2, extra: Record<string, unknown> = {}): any => ({
  version: 3,
  card: { id: "c", taskNo: "8-1", title: "과제" },
  sub: { title: "과제 제목", markers: [] },
  business: { no: 0, name: "" },
  task: { no: "", title: "", bp: false },
  blocks: parts.map(() => bullets(lines)),
  results: [],
  caption: "",
  module: 1,
  mg: { parts: parts.map(([evalNo, themeNo, mark], i) => ({ key: `${evalNo}.${themeNo}.${mark || 0}`, evalNo, evalTitle: `평가내용 ${evalNo} 제목`, themeNo, themeTitle: `대주제 ${themeNo}`, mark, title: mark ? `절 ${i + 1} 제목` : "" })), at: parts.map(([e, t, m]) => `${e}.${t}.${m || 0}`) },
  ...extra,
});
const item = (id: string, sort: number, section: string, spec: any, pages = 1): BusinessItem => ({ cardId: id, uid: id, taskNo: id, title: id, section, subsection: null, sort, pages, included: true, spec, sourceRev: null, dataRev: null });

const long = "카드 밖 부분 칸에 들어가는 문장으로 폭이 좁은 표 칸에서는 여러 줄로 나뉘어 쓰이므로 줄 수 어림에 반영되어야 하는 긴 문장입니다";
const parts = (over: Partial<UnitPartsMg> = {}): UnitPartsMg => ({
  unit: "MG-8",
  indicator: "재무예산관리",
  year: 2026,
  cover: null,
  findings: {
    part: "findings",
    code: { unmatched: [] },
    rows: [
      { id: "c1#0", code: { cardId: "c1", taskNo: "8-1", rowIndex: 0, finding: [long], plan: [], source: null, differs: false }, ai: { actions: [long, long] } },
      { id: "c2#0", code: { cardId: "c2", taskNo: "8-2", rowIndex: 0, finding: ["짧은 지적"], plan: [], source: null, differs: false }, ai: { actions: [] } },
    ],
  },
  prior: { part: "prior", rows: [{ id: "prior/1", code: { evalNo: 1, title: "재무구조", cards: [] }, human: { upTo: [long] }, ai: { now: [long], effect: [] } }] },
  outcome: {
    part: "outcome",
    kpi: [{ id: "c1#0", code: { cardId: "c1", taskNo: "8-1", index: 0, name: "부채비율", unit: "%", prev: "31.7%", target: "31%", actual: "30%", match2025: null, polarity2025: null }, human: { checked: true, polarity: "down" }, ai: { analysis: [long] } }],
    qual: [{ id: "qual/1", code: { evalNo: 1, title: "재무구조" }, human: { label: "재무구조" }, ai: { result: [], analysis: [] } }],
    plan: [{ id: "plan/1", code: { evalNo: 1, title: "재무구조" }, human: { label: "재무구조" }, ai: { self: [], plan: [] } }],
  },
  source: { cards: {}, drafts: {}, inputs: "" },
  ...over,
});

test("장 높이 어림: 앞 = 지적사항 조치실적 + 전년 대비, 뒤 = 성과분석 및 환류(표지는 안 셈) · 긴 문장은 칸 폭에서 줄이 늘어 더 큼 · 빈 칸은 수로 알림", () => {
  const o = unitPartsOutside(parts(), { pages2025: 2, wholeTarget: 10 });
  assert.deepEqual(o.front.map((c) => c.key), ["findings", "prior"]);
  assert.deepEqual(o.back.map((c) => c.key), ["outcome"]);
  assert.equal(o.front[0].title, "Ⅰ. 2025년도 경영실적평가 지적사항 조치실적");
  assert.ok(o.front.every((c) => c.mm > 20) && o.back[0].mm > 60);
  assert.deepEqual([o.pages2025, o.wholeTarget], [2, 10]);
  // 비어 있는 AI·사람 칸: 지적 2행 중 조치 1 + 전년 대비 effort 1 + 비계량 2 + 개선계획 2 = 6
  assert.equal(o.emptyCells, 6);
  const shorter = unitPartsOutside(parts({ findings: { ...parts().findings!, rows: [parts().findings!.rows[1]] } }));
  assert.ok(shorter.front[0].mm < o.front[0].mm, "행이 적으면 낮음");
  const filled = parts();
  filled.findings!.rows[1].ai.actions = [long];
  assert.ok(unitPartsOutside(filled).front[0].mm > o.front[0].mm, "빈 칸에 글이 들어오면 높아짐(빈 칸 높이로 어림했으므로)");
});

test("계량 표는 체크한 행만 · 행이 없으면 빈 행 하나 · 부분이 없으면 장도 없음(혁신가점은 표지만)", () => {
  const p = parts();
  const base = unitPartsOutside(p).back[0].mm;
  p.outcome!.kpi[0].human.checked = false;
  assert.ok(unitPartsOutside(p).back[0].mm < base);
  const none = unitPartsOutside(parts({ findings: null, prior: null, outcome: null }));
  assert.deepEqual([none.front, none.back], [[], []]);
});

test("쪽 쌓기: 한 쪽 안이면 같은 쪽에 이어 쓰고, 넘으면 장이 쪽 끝에서 다음 쪽으로 이어짐 · 어림 보정(판면의 110%)까지는 한 쪽", () => {
  const one = stackOutside([{ key: "a", title: "a", mm: 100 }, { key: "b", title: "b", mm: 120 }], 1);
  assert.deepEqual([one.pages, one.chapters.map((c) => [c.startPage, c.endPage])], [1, [[1, 1], [1, 1]]]);
  const two = stackOutside([{ key: "a", title: "a", mm: 200 }, { key: "b", title: "b", mm: 120 }], 4);
  assert.deepEqual([two.firstPage, two.pages, two.chapters.map((c) => [c.startPage, c.endPage])], [4, 2, [[4, 4], [4, 5]]]);
  assert.equal(stackOutside([{ key: "a", title: "a", mm: H * 1.09 }], 1).pages, 1, "표 줄 수 어림이 실측보다 큰 만큼(110%)은 한 쪽 — 2025 MG-8 앞 장 어림 266mm ↔ 실측 253mm");
  assert.equal(stackOutside([{ key: "a", title: "a", mm: H * 1.12 }], 1).pages, 2);
  assert.equal(stackOutside([], 1).pages, 0);
});

test("조판 끼움: 지적 + 전년 대비는 1쪽에서 이어 쓰고, 본문은 그 뒤 새 쪽에서 시작하며, 성과분석은 본문 뒤 새 쪽 — 쪽 번호는 지표 안 쪽, 표지는 쪽 수에 안 셈", () => {
  const items = [item("8-1", 0, "평가내용 1. a", mgSpec([[1, 1, "가"]])), item("8-2", 1, "평가내용 2. b", mgSpec([[2, 1, "가"]]))];
  const lay = layoutBusiness(items, { mg: { budget: 2, outside: { front: [{ key: "findings", title: "지적", mm: 100 }, { key: "prior", title: "전년 대비", mm: 120 }], back: [{ key: "outcome", title: "성과분석", mm: 200 }] } } });
  const out = lay.outside!;
  assert.deepEqual(out.front.chapters.map((c) => [c.key, c.startPage, c.endPage]), [["findings", 1, 1], ["prior", 1, 1]], "같은 쪽에 이어 씀");
  assert.deepEqual(lay.pages.map((p) => p.no), [2, 3], "본문 쪽 번호는 앞 쪽(1) 뒤");
  assert.deepEqual(lay.sections.map((s) => [s.startPage, s.endPage]), [[2, 2], [3, 3]]);
  assert.equal(out.back.firstPage, 4, "성과분석은 본문 뒤 새 쪽");
  assert.deepEqual([out.front.pages, out.back.pages, out.pages, out.whole], [1, 1, 2, 4]);
  assert.equal(lay.summary.laid, 2, "본문 쪽 수는 그대로(본문 예산과 견줌)");
  assert.equal(lay.summary.state, "ok");
  // 쪽 묶음 HTML: 본문 쪽 번호가 지표 안 쪽 번호로 그려짐
  const html = sheetsOf(lay.pages).map((sh) => sheetHtml(sh, lay)).join("");
  assert.match(html, /- 2 -/);
  assert.match(html, /- 3 -/);
});

test("조판 끼움: 부분이 없거나 장이 비면 출력이 예전과 똑같음(outside 키도 없음) · 본문 없이 카드 밖 부분만 있어도 뒤는 앞 뒤 쪽", () => {
  const items = [item("8-1", 0, "평가내용 1. a", mgSpec([[1, 1, "가"]]))];
  const plain = layoutBusiness(items, { mg: { budget: 1 } });
  assert.deepEqual(layoutBusiness(items, { mg: { budget: 1, outside: { front: [], back: [] } } }), plain);
  assert.ok(!("outside" in plain));
  const empty = layoutBusiness([], { mg: { budget: 0, outside: { front: [{ key: "findings", title: "x", mm: 50 }], back: [{ key: "outcome", title: "y", mm: 50 }] } } });
  assert.equal(empty.outside!.back.firstPage, 2);
  assert.equal(empty.outside!.wholeState, null, "본문이 없으면 전체 쪽 비교 안 함");
});

test("카드 밖 부분 넘침 경고: 어림이 2025 카드 밖 쪽보다 길면 「카드 밖 부분 N쪽 넘침」, 지표 전체가 작성분량 ±1쪽 밖이면 경고 — 본문 쪽 수·예산은 그대로", () => {
  const items = [item("8-1", 0, "평가내용 1. a", mgSpec([[1, 1, "가"]]))];
  const lay = layoutBusiness(items, { mg: { budget: 1, outside: { front: [{ key: "findings", title: "지적", mm: 400 }], back: [{ key: "outcome", title: "성과분석", mm: 100 }], pages2025: 2, wholeTarget: 4, emptyCells: 3 } } });
  const o = lay.outside!;
  assert.deepEqual([o.front.pages, o.back.pages, o.pages, o.overflow], [2, 1, 3, 1]);
  assert.ok(o.warnings.some((w) => w.startsWith("카드 밖 부분 1쪽 넘침")), o.warnings.join("|"));
  assert.deepEqual([o.whole, o.wholeTarget, o.wholeState], [4, 4, "ok"]);
  assert.ok(o.warnings.some((w) => w.includes("비어 있는 칸 3개")));
  assert.equal(lay.summary.laid, 1);
  const wide = layoutBusiness(items, { mg: { budget: 1, outside: { front: [{ key: "findings", title: "지적", mm: 100 }], back: [], pages2025: 2, wholeTarget: 8 } } });
  assert.equal(wide.outside!.wholeState, "under");
  assert.ok(wide.outside!.warnings.some((w) => w.includes("작성분량 8쪽(±1쪽)보다 적음")));
  assert.equal(wide.outside!.overflow, 0);
});

test("MgPageRef.direction: 지표관리 방향 쪽(MG-1 3쪽 — 본문과 겹치지 않는 인쇄 쪽)을 내용 장에서 따로 알림, 없는 지표는 키 없음", () => {
  const chunk = (chapter: string, printed: number[], evalNo: number | null = null) => ({ chapter, evalNo, evalTitle: evalNo ? "t" : "", start: printed[0], end: printed.at(-1)!, printed });
  const ref = mgPageRef([chunk("direction", [1, 2, 3]), chunk("findings", [4]), chunk("prior", [4]), chunk("detail", [5, 6, 7], 1), chunk("outcome", [8])]);
  assert.deepEqual([ref.content, ref.direction], [5, 3]);
  const none = mgPageRef([chunk("findings", [4]), chunk("detail", [5, 6], 1), chunk("outcome", [7])]);
  assert.ok(!("direction" in none));
});

test("비고 쪽: 지적개선 절이 조판에서 놓인 쪽 → 지표 시작 쪽 + 쪽 − 1(앞 쪽이 1이므로 본문은 시작 + 1부터, 여러 쪽에 걸친 카드는 절의 블록 위치만큼 내려감) · 초안이 없으면 빈 글 · 시작 쪽 기본은 2025 지적 장 인쇄 쪽", () => {
  const spec = mgSpec([[1, 1, "가"], [1, 1, "나"]], 80);
  spec.sub.markers = ["지적개선"];
  spec.mg.parts[0].title = "밴드형 위험관리 체계";
  spec.mg.parts[1].title = "자금운용 전문성 강화";
  spec.blocks[0].items = spec.blocks[0].items.map((x: string, i: number) => `밴드형 위험수준 월별 모니터링 ${i}`);
  spec.blocks[1].items = spec.blocks[1].items.map((x: string, i: number) => `자금운용 전담 검토 규정 전문가 자문 ${i}`);
  const items = [item("c1", 0, "평가내용 1. a", spec), item("c2", 1, "평가내용 1. a", null, 1)];
  const lay = layoutBusiness(items, { mg: { budget: 2, outside: { front: [{ key: "findings", title: "지적", mm: 100 }], back: [] } } });
  assert.deepEqual([lay.sections[0].startPage, lay.sections[0].endPage > 3], [2, true], "본문은 앞 쪽 뒤 2쪽에서 시작해 여러 쪽에 걸침");
  assert.equal(partPageOf(lay, "c1", "1.1.가"), 2, "첫 절 = 카드 시작 쪽");
  assert.equal(partPageOf(lay, "c1", "1.1.나"), 3, "둘째 절은 카드 높이의 절반쯤 아래 = 다음 쪽");
  assert.equal(partPageOf(lay, "c1", "9.9.가"), null, "없는 절");
  assert.equal(partPageOf(lay, "c2", "1.1.가"), null, "초안 없음");
  const row = (id: string, cardId: string, rowIndex: number) => ({ id, code: { cardId, taskNo: "x", rowIndex, finding: ["x"], plan: [], source: null, differs: false }, ai: { actions: [] } });
  const findings = { part: "findings" as const, code: { unmatched: [] }, rows: [row("c1#0", "c1", 0), row("c1#1", "c1", 1), row("c2#0", "c2", 0)] };
  const card = { findings: { rows: [{ finding: ["∙ 밴드형 위험수준 월별 모니터링 미흡"], plan: [] }, { finding: ["∙ 자금운용 전담 검토 규정 없고 전문가 자문 임의"], plan: [] }] } };
  const r = findingRemarks(findings, { start: 72, layout: lay, cards: { c1: card, c2: card }, specs: { c1: spec, c2: null } });
  assert.deepEqual(r, { "c1#0": "p.73", "c1#1": "p.74", "c2#0": "" }, "시작 72 + 쪽 − 1");
  assert.equal(MG_FRONT_PAGE_2025["MG-8"], 72, "MG-8 지적사항 조치실적 2025 인쇄 72쪽(성과분석 81쪽)");
  assert.equal(MG_FRONT_PAGE_2025["MG-1"], 4, "MG-1은 지표관리 방향(1~3쪽) 뒤");
  assert.deepEqual(Object.keys(MG_FRONT_PAGE_2025).length, 11, "지표 1~11 (혁신가점은 카드 밖 장 없음)");
});

test("경영관리 이어짐 규칙: 조판(layoutBusiness)과 같은 함수 — 같은 평가내용이면 eval, 같은 대주제까지면 theme", () => {
  const items = [item("a", 0, "평가내용 1. x", mgSpec([[1, 1, "가"]])), item("b", 1, "평가내용 1. x", mgSpec([[1, 1, "나"]])), item("c", 2, "평가내용 1. x", mgSpec([[1, 2, "가"]])), item("d", 3, "평가내용 2. y", mgSpec([[2, 1, "가"]]))];
  assert.deepEqual(mgContinuations(items), [{ eval: false, theme: false }, { eval: true, theme: true }, { eval: true, theme: false }, { eval: false, theme: false }]);
  assert.deepEqual(layoutBusiness(items, { mg: { budget: 3 } }).sections.map((s) => s.mgCont), mgContinuations(items));
});

test("카드 밖 쪽 묶음 HTML: 첫 쪽 번호·쪽 경계 선·판면 끝 선, 쪽 수 0이면 빈 글", () => {
  const html = outsideSheetHtml(3, 2, "<p>본문</p>");
  assert.match(html, /--bz-n:2/);
  assert.match(html, /3쪽 끝 · 4쪽/);
  assert.match(html, /- 3~4 -/);
  assert.equal(outsideSheetHtml(1, 0, "<p>x</p>"), "");
});
