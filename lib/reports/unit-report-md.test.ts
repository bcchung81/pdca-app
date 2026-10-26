// 경영관리 지표 한 파일 한글 원고(R5d — unit-report-md.ts) 시험: 장 순서(표지 → Ⅰ → Ⅱ → Ⅲ 과제별 초안 → Ⅳ), 같은 평가내용·대주제 머리 되풀이 안 함(조판의 mgContinuations와 같은 규칙),
// 초안 없는 과제는 자리표시 + 경고, 안 넣은 과제 제외, 예전 출력 불변(sectionMarkdown 옵션 없음), draftToKcaHwpx 변환 → validateHwpx → kordoc 되읽기에 장 제목과 표 글.

import assert from "node:assert/strict";
import { test } from "node:test";
import { parse, validateHwpx } from "kordoc";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { draftToKcaHwpx } from "../hwpx/generate.ts";
import type { BusinessItem } from "./business-layout.ts";
import { sectionMarkdown } from "./section-md.ts";
import { unitReportMarkdown } from "./unit-report-md.ts";
import type { UnitPartsMg } from "./unit-parts-mg.ts";

const bullets = (items: string[]): any => ({ kind: "bullets", label: "추진내용", title: "", variant: "", text: "", items, cells: [], rows: [], series: [], badge: "" });
const mgSpec = (taskNo: string, parts: Array<[number, number, string]>): any => ({
  version: 3,
  card: { id: `경영관리8/${taskNo}`, taskNo, title: `과제 ${taskNo}` },
  sub: { title: "과제 제목", markers: [] },
  business: { no: 0, name: "" },
  task: { no: "", title: "", bp: false },
  blocks: parts.map(([e, , m]) => bullets([`${taskNo} 평가내용${e} 절${m} 추진 내용`])),
  results: [],
  caption: "",
  module: 1,
  mg: { parts: parts.map(([evalNo, themeNo, mark]) => ({ key: `${evalNo}.${themeNo}.${mark}`, evalNo, evalTitle: `평가내용 ${evalNo} 제목`, themeNo, themeTitle: `대주제 ${themeNo} 제목`, mark, title: `절 ${mark} 제목` })), at: parts.map(([e, t, m]) => `${e}.${t}.${m}`) },
});
const item = (id: string, sort: number, section: string, spec: any, over: Partial<BusinessItem> = {}): BusinessItem => ({ cardId: id, uid: id, taskNo: id, title: `과제 ${id}`, section, subsection: null, sort, pages: 1, included: true, spec, sourceRev: null, dataRev: null, ...over });

const parts: UnitPartsMg = {
  unit: "MG-8",
  indicator: "재무예산관리",
  year: 2026,
  cover: { part: "cover", code: { indicator: "재무예산관리", components: [{ chunkKey: "k", label: "비계량", kind: "비계량", method: "9등급 평가", weight: 3, weightBasis: "위탁집행형 준정부기관", definition: "건전한 재무구조를 평가한다.", criteria: ["재무구조의 안정성"], note: "" }] }, human: { contacts: [] } },
  findings: { part: "findings", code: { unmatched: [] }, rows: [{ id: "c1#0", code: { cardId: "c1", taskNo: "8-1", rowIndex: 0, finding: ["영업적자 확대"], plan: [], source: null, differs: false }, ai: { actions: ["손익 분석 체계 구축"] } }] },
  prior: { part: "prior", rows: [{ id: "prior/1", code: { evalNo: 1, title: "재무구조", cards: [] }, human: { upTo: ["지난 실적 정리"] }, ai: { now: ["올해 실적"], effect: ["개선 효과"] } }] },
  outcome: {
    part: "outcome",
    kpi: [{ id: "c1#0", code: { cardId: "c1", taskNo: "8-1", index: 0, name: "부채비율", unit: "%", prev: "31.7%", target: "31%", actual: "30%", match2025: null, polarity2025: null }, human: { checked: true, polarity: "down" }, ai: { analysis: ["목표 달성"] } }],
    qual: [{ id: "qual/1", code: { evalNo: 1, title: "재무구조" }, human: { label: "재무구조" }, ai: { result: ["비계량 실적"], analysis: ["분석"] } }],
    plan: [{ id: "plan/1", code: { evalNo: 1, title: "재무구조" }, human: { label: "재무구조" }, ai: { self: ["자체평가"], plan: ["내년 개선"] } }],
  },
  source: { cards: {}, drafts: {}, inputs: "" },
};

const items = [
  item("8-1", 0, "평가내용 1. a", mgSpec("8-1", [[1, 1, "가"]])),
  item("8-2", 1, "평가내용 1. a", mgSpec("8-2", [[1, 1, "나"]])),
  item("8-3", 2, "평가내용 1. a", mgSpec("8-3", [[1, 2, "가"]])),
  item("8-4", 3, "평가내용 2. b", mgSpec("8-4", [[2, 1, "가"]])),
  item("8-5", 4, "평가내용 2. b", null),
  item("8-6", 5, "평가내용 2. b", mgSpec("8-6", [[2, 1, "나"]]), { included: false }),
];

test("지표 한 파일 원고: 표지 → Ⅰ 지적 → Ⅱ 전년 대비 → Ⅲ 세부평가내용별(목차 순 과제별 초안) → Ⅳ 성과분석 — 장 제목은 unitPartsLabels, 비고는 받은 값", () => {
  const { md, warnings } = unitReportMarkdown(parts, items, { remarks: { "c1#0": "p.73" } });
  const lines = md.split("\n");
  assert.equal(lines[0], "재무예산관리 2026년도 경영실적보고서 초안");
  const order = ["평가방법", "□ Ⅰ. 2025년도 경영실적평가 지적사항 조치실적", "□ Ⅱ. 전년 대비 주요 추진실적", "□ Ⅲ. 세부평가내용별 2026년도 추진실적 및 성과", "8-1 평가내용1 절가 추진 내용", "8-4 평가내용2 절가 추진 내용", "□ Ⅳ. 성과분석 및 환류"];
  const at = order.map((x) => md.indexOf(x));
  assert.ok(at.every((i) => i >= 0), JSON.stringify(order.filter((_, i) => at[i] < 0)));
  assert.deepEqual([...at].sort((a, b) => a - b), at, "장 순서");
  assert.ok(lines.includes("| ∙ 영업적자 확대 | ∙ 손익 분석 체계 구축 | p.73 |"), "지적 행 비고");
  assert.ok(md.indexOf("8-3 평가내용1 절가") < md.indexOf("8-4 평가내용2 절가"), "목차 순");
  assert.ok(!md.includes("8-6 평가내용"), "목차에서 뺀 과제는 안 씀");
  assert.deepEqual(warnings, ["초안 없음: 8-5 과제 8-5"]);
  assert.ok(lines.includes("ㅇ 【확인: 8-5 과제 8-5 과제별 초안 없음】"));
});

test("머리 되풀이 안 함: 앞 과제와 같은 평가내용이면 평가내용 머리 표, 같은 대주제면 대주제 머리도 생략(절 제목은 늘 씀) — 조판의 mgCont와 같은 규칙", () => {
  const { md } = unitReportMarkdown(parts, items);
  const count = (s: string) => md.split("\n").filter((l) => l.startsWith(s)).length;
  assert.equal(count("| 평가내용1 | 평가내용 1 제목"), 1, "8-1 · 8-2 · 8-3은 같은 평가내용 1 (전년 대비 표의 「평가내용1 | 재무구조」 머리는 다른 줄)");
  assert.equal(count("| 평가내용2 | 평가내용 2 제목"), 1);
  assert.equal(count("| 대주제 1 |"), 2, "평가내용 1의 대주제 1(8-1 · 8-2 한 번)과 평가내용 2의 대주제 1");
  assert.equal(count("| 대주제 2 |"), 1);
  assert.equal(count("| 가. |") + count("| 나. |"), 4, "절 제목은 과제마다 모두(8-1 가 · 8-2 나 · 8-3 가 · 8-4 가)");
});

test("sectionMarkdown의 옵션이 없거나 이어짐이 아니면 예전 출력과 같음 · 이어짐이면 머리 표만 줄어듦", () => {
  const s = mgSpec("8-2", [[1, 1, "나"]]);
  const base = sectionMarkdown(s).md;
  assert.equal(sectionMarkdown(s, {}).md, base);
  assert.equal(sectionMarkdown(s, { mgCont: { eval: false, theme: false } }).md, base);
  const cont = sectionMarkdown(s, { mgCont: { eval: true, theme: true } }).md;
  assert.ok(base.includes("| 평가내용1 |") && base.includes("| 대주제 1 |"));
  assert.ok(!cont.includes("| 평가내용1 |") && !cont.includes("| 대주제 1 |") && cont.includes("| 나. |"));
  assert.ok(sectionMarkdown(s, { mgCont: { eval: true, theme: false } }).md.includes("| 대주제 1 |"), "같은 평가내용 다른 대주제는 대주제 머리를 씀");
});

test("한글 변환: draftToKcaHwpx → validateHwpx 통과 → kordoc으로 다시 읽으면 장 제목과 표 글이 있음", async () => {
  const { md } = unitReportMarkdown(parts, items, { remarks: { "c1#0": "p.73" } });
  const { bytes, warnings } = await draftToKcaHwpx(md);
  assert.ok(warnings.every((w) => w.includes("요약박스")), JSON.stringify(warnings));
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const back: any = await parse(Buffer.from(bytes));
  assert.ok(back.success);
  for (const x of ["Ⅰ. 2025년도 경영실적평가 지적사항 조치실적", "Ⅱ. 전년 대비 주요 추진실적", "Ⅲ. 세부평가내용별 2026년도 추진실적 및 성과", "Ⅳ. 성과분석 및 환류", "영업적자 확대", "p.73", "평가내용 1 제목", "8-4 평가내용2 절가 추진 내용", "부채비율", "과제별 초안 없음"]) {
    assert.ok(back.markdown.includes(x), `「${x}」가 한글 파일에 없음`);
  }
  assert.equal((back.markdown.match(/평가내용 1 제목/g) ?? []).length, 1, "머리 되풀이 없음");
});
