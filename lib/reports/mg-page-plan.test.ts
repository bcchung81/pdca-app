// 경영관리 목차·쪽 배정(lib/reports/mg-page-plan.ts)·작성분량(mg-volume.ts) 시험 — 지표 총량은 작성분량(규정, 2026-10-12 사용자 결정), 나누는 비율은 2025 보고서 쪽:
// 2025 지표 보고서의 세부평가내용별 장 쪽 수(인쇄 쪽 — 간지·빈 쪽 제외)를 평가내용마다 나누고(한 쪽에 둘이면 반씩), 본문 예산(작성분량 − 본문 아닌 내용 장)이 2025 본문보다 작으면 비례로 줄이고,
// 카드 ↔ 평가내용 첫 대응으로 과제마다 0.5쪽 단위로 나눔(2026-10-10 사용자 결정 「2안」).

import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { MGMT_INDICATORS } from "../tracks/mgmt-units.ts";
import { type MgPageChunk, buildMgOutline, evalNoOf, halfPage, mgBodyBudget, mgBudgetState, mgCardPages, mgPageRef, withMgVolume } from "./mg-page-plan.ts";
import { MG_VOLUME, mgVolumeLabel } from "./mg-volume.ts";

const ch = (chapter: string, evalNo: number | null, start: number, end: number, evalTitle = ""): MgPageChunk => ({ chapter, evalNo, evalTitle, start, end });
// 표지 1 · 지적사항 3 · 본문 4~8(평가내용 1: 4~5, 평가내용 2: 5~7, 평가내용 3: 8) · 성과분석 9
const chunks = [ch("cover", null, 1, 1), ch("findings", null, 3, 3), ch("prior", 1, 3, 3, "전년 대비 글"), ch("detail_theme", 1, 4, 4, "전략 수립"), ch("detail", 1, 4, 5, "전략 수립"), ch("detail", 2, 5, 7, "조직 운영"), ch("detail", 3, 8, 8, "역량 강화"), ch("outcome", null, 9, 9)];

test("mgPageRef: 전체·본문(세부평가내용별 장)·그 밖 쪽, 한 쪽에 평가내용이 둘이면 반씩 — 평가내용 쪽 합 = 본문 쪽(인쇄 쪽 정보가 없으면 PDF 쪽으로)", () => {
  const ref = mgPageRef(chunks);
  assert.equal(ref.total, 9);
  assert.equal(ref.body, 5);
  assert.equal(ref.common, 4);
  assert.equal(ref.content, 2, "본문 아닌 내용 장 = 지적사항·전년 대비(3쪽) + 성과분석(9쪽) — 표지(1쪽)·빈 쪽(2쪽)은 안 셈");
  assert.deepEqual(ref.evals, [
    { no: 1, title: "전략 수립", pages: 1.5 },
    { no: 2, title: "조직 운영", pages: 2.5 },
    { no: 3, title: "역량 강화", pages: 1 },
  ]);
  assert.equal(ref.evals.reduce((n, e) => n + e.pages, 0), ref.body);
});

test("mgPageRef: 인쇄 쪽이 있으면 인쇄 쪽으로 셈 — 인쇄 쪽 없는 조각(간지·표지·빈 쪽)은 본문·내용 장 어디에도 안 셈, 한 쪽에 평가내용 둘이면 반씩", () => {
  const p = (chapter: string, evalNo: number | null, start: number, end: number, printed: number[]): MgPageChunk => ({ chapter, evalNo, evalTitle: evalNo ? `평가내용 ${evalNo}` : "", start, end, printed });
  // PDF: 표지 1 · 지적사항 3(인쇄 35) · 평가내용 1 4~9(인쇄 36~39 — PDF 8·9는 두 번째 칸 간지·표지) · 두 번째 칸 표지 9 · 평가내용 2 11~15(인쇄 40~44, 40은 평가내용 1과 같이) · 성과분석 16(인쇄 45)
  const ref = mgPageRef([p("cover", null, 1, 1, []), p("findings", null, 3, 3, [35]), p("detail", 1, 4, 7, [36, 37, 38, 39]), p("detail", 1, 7, 9, [39]), p("detail_theme", 1, 9, 9, []), p("detail", 1, 11, 11, [40]), p("detail", 2, 11, 15, [40, 41, 42, 43, 44]), p("outcome", null, 16, 16, [45])]);
  assert.deepEqual([ref.total, ref.body, ref.content, ref.common], [16, 9, 2, 7], "본문 = 인쇄 36~44(9쪽), 내용 장 = 35·45, 전체는 PDF 쪽");
  assert.deepEqual(ref.evals.map((e) => [e.no, e.pages]), [[1, 4.5], [2, 4.5]]);
  const fallback = mgPageRef([p("detail", 1, 4, 9, []), p("findings", null, 3, 3, [])]);
  assert.deepEqual([fallback.body, fallback.content], [6, 1], "인쇄 쪽이 한 조각에도 없으면 PDF 쪽으로");
});

test("buildMgOutline: 평가내용 쪽을 대응 카드 수로 나눠 더하고 0.5쪽 단위, 목차 1단 = 첫 평가내용·2단 = 둘 이상 걸칠 때, 첫 평가내용 → 과제번호 순", () => {
  const ref = mgPageRef(chunks);
  // 9-1 → 평가내용 1, 9-2 → 2, 9-3 → 3·4(4는 2025에 없으니 3만), 9-4 → 5(없음 → 모두) — MG_CARD_EVALS 대응
  const plan = buildMgOutline("MG-9", ref, [
    { id: "c4", taskNo: "9-4" },
    { id: "c1", taskNo: "9-1" },
    { id: "c2", taskNo: "9-2" },
    { id: "c3", taskNo: "9-3" },
  ]);
  assert.deepEqual(
    plan.rows.map((r) => [r.card_id, r.section, r.subsection, r.pages]),
    [
      // 평가내용 1(1.5쪽)은 9-1·9-4, 2(2.5쪽)는 9-2·9-4, 3(1쪽)은 9-3·9-4가 나눔 → 0.75·1.25·0.5·2.5 → 반쪽 단위(나머지가 같으면 과제번호 순)
      ["c1", "평가내용 1. 전략 수립", null, 1],
      ["c4", "평가내용 1. 전략 수립", "평가내용 1·2·3에 걸침", 2.5],
      ["c2", "평가내용 2. 조직 운영", null, 1],
      ["c3", "평가내용 3. 역량 강화", null, 0.5],
    ],
  );
  assert.deepEqual(plan.rows.map((r) => r.sort), [0, 1, 2, 3]);
  assert.equal(plan.rows.reduce((n, r) => n + r.pages, 0), ref.body, "합은 본문 쪽(반올림)");
  assert.deepEqual(plan.orphan, []);
  assert.ok(plan.rows.every((r) => r.eval_unit_id === "MG-9" && r.pages >= 0.5 && Number.isInteger(r.pages * 2)));
});

test("buildMgOutline: 대응 카드가 없는 평가내용은 orphan(참고), 혁신가점처럼 대응표에 없는 카드는 그 지표 평가내용 모두, 카드마다 최소 0.5쪽", () => {
  const ref = mgPageRef(chunks);
  const four = buildMgOutline("MG-4", ref, [{ id: "a", taskNo: "4-1" }, { id: "b", taskNo: "4-2" }]);
  assert.deepEqual(four.orphan.map((e) => e.no), [2, 3], "4-1·4-2는 평가내용 1뿐 — 2·3은 카드 없음");
  assert.deepEqual(four.rows.map((r) => r.pages), [1, 0.5], "1.5쪽을 둘이 나눔(0.75씩 → 1 + 0.5, 합 1.5)");
  assert.equal(mgBudgetState(1.5, ref, four.orphan), "ok", "카드가 맡은 본문(5 − 3.5 = 1.5쪽)과 비교");
  const bonus = buildMgOutline("MG-13", ref, [{ id: "x", taskNo: "13-1" }]);
  assert.equal(bonus.rows[0].subsection, "평가내용 1·2·3에 걸침");
  assert.equal(bonus.rows[0].pages, 5);
  const many = buildMgOutline("MG-11", { total: 3, body: 1, common: 2, content: 0, evals: [{ no: 1, title: "t", pages: 1 }] }, ["11-1", "11-2", "11-3", "11-4"].map((t) => ({ id: t, taskNo: t })).map((c) => ({ ...c, taskNo: "13-" + c.taskNo.slice(3) })));
  assert.ok(many.rows.every((r) => r.pages === 0.5), "1쪽을 넷이 나눠도 카드마다 0.5쪽(합이 넘을 수 있음)");
});

test("evalNoOf·halfPage·mgBudgetState", () => {
  assert.equal(evalNoOf("평가내용 12. 제목"), 12);
  assert.equal(evalNoOf("대상사업 미지정"), null);
  assert.equal(halfPage(1.26), 1.5);
  assert.equal(halfPage(1.24), 1);
  const ref = { total: 10, body: 6, common: 4, content: 2, evals: [] };
  assert.equal(mgBudgetState(4.5, ref, []), "under");
  assert.equal(mgBudgetState(7, ref, []), "ok");
  assert.equal(mgBudgetState(7.5, ref, []), "over");
});

test("작성분량 상수: 비계량 지표 1~11 합 108·혁신가점 12~14 합 20, 두 칸 지표는 칸 합 = 작성분량, 앱 지표 14개와 같은 id", () => {
  const sum = (from: number, to: number) => MGMT_INDICATORS.filter((x) => x.no >= from && x.no <= to).reduce((n, x) => n + MG_VOLUME[x.id].pages, 0);
  assert.deepEqual(Object.keys(MG_VOLUME), MGMT_INDICATORS.map((x) => x.id));
  assert.equal(sum(1, 11), 108);
  assert.equal(sum(12, 14), 20);
  for (const v of Object.values(MG_VOLUME)) if (v.parts) assert.equal(v.parts.reduce((n, p) => n + p.pages, 0), v.pages);
  assert.equal(mgVolumeLabel(MG_VOLUME["MG-4"]), "11쪽(산업재해 5 + 재난 6)");
  assert.equal(mgVolumeLabel(MG_VOLUME["MG-9"]), "14쪽(조직 11 + 일·가정 3)");
  assert.equal(mgVolumeLabel(MG_VOLUME["MG-1"]), "14쪽");
});

test("mgBodyBudget: 작성분량 − 내용 장, 2025 본문보다 크면 2025 본문 그대로, 작으면 그 값, 0 이하면 min(2025 본문, 작성분량)", () => {
  assert.equal(mgBodyBudget(14, 9, 5), 9, "같음(전략기획 2025)");
  assert.equal(mgBodyBudget(14, 7, 5), 7, "여유가 있어도 늘리지 않음");
  assert.equal(mgBodyBudget(11, 11, 2), 9, "작으면 줄임(안전 및 재난관리 2025)");
  assert.equal(mgBodyBudget(5, 4, 6), 4, "음수 → min(본문, 작성분량)");
  assert.equal(mgBodyBudget(3, 4, 3), 3, "0 → min(본문, 작성분량)");
});

test("withMgVolume: 예산이 2025 본문 이상이면 평가내용 그대로, 작으면 비례로 줄여 0.5쪽 단위(합 = 예산), 작성분량이 없으면 그대로 — 배정·카드 몫도 예산을 따름", () => {
  const ref = mgPageRef(chunks); // 본문 5(평가내용 1.5·2.5·1), 내용 장 2
  assert.equal(withMgVolume(ref, undefined), ref);
  const same = withMgVolume(ref, 9);
  assert.deepEqual([same.body, same.volume, same.body2025], [5, 9, 5]);
  assert.deepEqual(same.evals, ref.evals, "작성분량 9 − 내용 장 2 = 7 ≥ 본문 5 → 2025 그대로(늘리지 않음)");
  const cut = withMgVolume(ref, 6); // 예산 4 → 1.2·2·0.8 → 반쪽 내림 2·4·1(=7) + 나머지가 큰 평가내용 3에 1
  assert.deepEqual([cut.body, cut.volume, cut.body2025], [4, 6, 5]);
  assert.deepEqual(cut.evals.map((e) => [e.no, e.pages, e.pages2025]), [[1, 1, 1.5], [2, 2, 2.5], [3, 1, 1]]);
  assert.equal(cut.evals.reduce((n, e) => n + e.pages, 0), 4);
  assert.ok(cut.evals.every((e) => Number.isInteger(e.pages * 2)));
  assert.equal(mgCardPages(cut, []), 4);
  const plan = buildMgOutline("MG-9", cut, ["9-1", "9-2", "9-3"].map((t) => ({ id: t, taskNo: t })));
  assert.equal(plan.rows.reduce((n, r) => n + r.pages, 0), 4, "기본 배정 합 = 본문 예산");
  assert.equal(mgBudgetState(4, cut, []), "ok");
  assert.equal(withMgVolume(ref, 2).body, 2, "식이 0 이하(2 − 2) → min(본문 5, 작성분량 2)");
  assert.equal(withMgVolume({ total: 1, body: 0, common: 1, content: 0, evals: [] }, 6).volume, undefined, "본문이 없으면 그대로");
});

// 실제 2025 경영관리 보고서 조각(git 밖 — 있을 때만): 14개 지표 모두 평가내용 쪽 합 = 본문 쪽, 배정 + 카드 없는 평가내용 ≈ 본문
const DIR = resolve(import.meta.dirname, "../../resources/knowledge/_chunks");
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^rpt25-mg-\d+\.jsonl$/.test(f)) : [];
test("실제 2025 조각: 14개 지표 평가내용 쪽 합 = 본문 쪽, 전체 = 본문 + 그 밖", { skip: files.length !== 14 && "2025 경영관리 보고서 조각(resources/knowledge/_chunks/rpt25-mg-*.jsonl — git 밖) 14개가 없음" }, () => {
  for (const f of files) {
    const cs = readFileSync(resolve(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const ref = mgPageRef(cs.map((c) => ({ chapter: c.meta?.chapter ?? "", evalNo: c.meta?.eval_no ?? null, evalTitle: c.meta?.eval_title ?? "", start: c.pdf_page_start, end: c.pdf_page_end, printed: c.meta?.printed_pages })));
    assert.ok(ref.body > 0 && ref.evals.length > 0, f);
    assert.ok(Math.abs(ref.evals.reduce((n, e) => n + e.pages, 0) - ref.body) < 0.01, `${f} 평가내용 쪽 합 ${ref.evals.map((e) => e.pages)} ≠ 본문 ${ref.body}`);
    assert.equal(ref.body + ref.common, ref.total, f);
    assert.ok(ref.evals.every((e) => e.title), `${f} 평가내용 제목`);
  }
});

// 본문 예산(2026-10-12): 작성분량 − 본문 아닌 내용 장. 2025 본문 = 인쇄 쪽 기준(간지·빈 쪽 제외)이라 14개 모두 예산 = 2025 본문(축소 없음) —
// PDF 쪽으로 세던 때는 안전 및 재난관리·조직 및 인적자원관리의 두 번째 칸 간지·표지 2쪽이 본문에 섞여 11·13쪽이었음
const BUDGET: Record<string, number> = { "MG-1": 9, "MG-2": 8, "MG-3": 8, "MG-4": 9, "MG-5": 5, "MG-6": 6, "MG-7": 8, "MG-8": 8, "MG-9": 11, "MG-10": 7, "MG-11": 3, "MG-12": 6, "MG-13": 6, "MG-14": 8 };
const EVALS: Record<string, number[]> = { "MG-4": [4, 5], "MG-9": [3, 2, 3, 1, 2] };
test("실제 2025 조각: 지표별 2025 본문(인쇄 쪽) = 본문 예산(작성분량 − 내용 장) — 축소 없음, 두 칸 지표의 평가내용 쪽 = 인쇄 쪽", { skip: files.length !== 14 && "2025 경영관리 보고서 조각(resources/knowledge/_chunks/rpt25-mg-*.jsonl — git 밖) 14개가 없음" }, () => {
  for (const f of files) {
    const cs = readFileSync(resolve(DIR, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const unit = cs[0].business as string;
    const ref = withMgVolume(mgPageRef(cs.map((c) => ({ chapter: c.meta?.chapter ?? "", evalNo: c.meta?.eval_no ?? null, evalTitle: c.meta?.eval_title ?? "", start: c.pdf_page_start, end: c.pdf_page_end, printed: c.meta?.printed_pages }))), MG_VOLUME[unit].pages);
    assert.deepEqual([ref.body, ref.body2025], [BUDGET[unit], BUDGET[unit]], `${unit} 예산 = 2025 본문`);
    assert.equal(ref.body, MG_VOLUME[unit].pages - ref.content, `${unit} 식(작성분량 − 내용 장)이 그대로 예산`);
    assert.ok(ref.evals.every((e) => e.pages2025 === undefined), `${unit} 비례 축소 없음`);
    assert.ok(Math.abs(ref.evals.reduce((n, e) => n + e.pages, 0) - ref.body) < 0.01, `${unit} 평가내용 쪽 합 = 예산`);
    if (EVALS[unit]) assert.deepEqual(ref.evals.map((e) => e.pages), EVALS[unit], `${unit} 평가내용별 인쇄 쪽`);
  }
});
