// 경영관리 카드 밖 표 AI 칸 글자 예산(unit-parts-budget.ts, 2026-10-16) 시험.
// 지키는 것: 2025 표 칸 길이 읽기(지적 병합 빈 칸·비고 뺌, 전년 대비 여러 행 합·개선효과 안 작은 표, 계량 2단 머리·각주 뺌, 장 묶음 쪽) ·
// 행 수가 같으면 행끼리(전년 대비는 평가내용 번호), 다르면 2025 열 합 ÷ 지금 행 수(중앙값 2배까지) · 2025가 없으면 지표 1~11 중앙값 ·
// 쪽 맞춤 — 예산 길이로 채우면 조판 어림(unitPartsOutside + stackOutside)이 2025 쪽 수(90% 여유) 안, 코드·사람 칸이 길면 fits = false이고 AI 칸이 높이를 더하지 않음.

import assert from "node:assert/strict";
import { test } from "node:test";
import { stackOutside } from "./business-layout.ts";
import { unitAiCells } from "./unit-parts-ai.ts";
import { UNIT_BUDGET_DEFAULT, UNIT_BUDGET_FIT, UNIT_BUDGET_MIN, UNIT_BUDGET_ROOM_MM, budgetFilledParts, cols2025, fillerLines, outsidePages, unitAiBudgets } from "./unit-parts-budget.ts";
import { unitPartsOutside } from "./unit-parts-layout.ts";
import type { FindingsPart, OutcomePart, PriorPart, UnitChunk, UnitPart } from "./unit-parts-mg.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = (n: number) => "가".repeat(n);
const chunk = (key: string, text: string, meta: Record<string, unknown>): UnitChunk => ({ chunk_key: `rpt25-mg-08/${key}`, title: key, text, meta: { printed_pages: [72], ...meta } });

/** 2025 표 조각(지적 3행 60·90·93자 — 둘째 행은 병합 빈 칸, 전년 대비 평가내용 1·2, 계량 6행, 비계량·개선계획 3행) */
function report2025(): UnitChunk[] {
  return [
    chunk("findings", `지적/권고 사항 | 조치 및 개선실적 | 비고\n\n∙ ${g(40)} | ∙ ${g(60)} | p.74\n\n∙ ${g(50)} |  | ∙ ${g(50)} / ∙ ${g(40)} |  | p.76\n\n∙ ${g(30)} | ∙ ${g(93)} | p.77`, { chapter: "findings" }),
    chunk("prior/1", `’24년도까지 | ’25년도 | 개선효과\n\n∙ ${g(30)} | ∙ ${g(50)} | ∙ ${g(40)}\n\n∙ ${g(10)} | ∙ ${g(20)} | ∙ ${g(10)} | 표칸가가`, { chapter: "prior", eval_no: 1 }),
    chunk("prior/2", `’24년도까지 | ’25년도 | 개선효과\n\n∙ ${g(30)} | ∙ ${g(60)} | ∙ ${g(66)}`, { chapter: "prior", eval_no: 2 }),
    chunk(
      "outcome/1/가",
      `구분 | ’24년 / 실적 | ’25년 | 성과 분석\n\n〃 | 〃 | 목표 | 실적 | 달성률 | 〃\n\n${[20, 21, 22, 21, 20, 21].map((n, i) => `지표${i} | 1 | 2 | 3 | 100% | ∙ ${g(n)}`).join("\n\n")}\n\n* 각주`,
      { chapter: "outcome", mark: "가", printed_pages: [81] },
    ),
    chunk("outcome/1/나", `구분 | ’25년 실적 | 성과 분석\n\n가 | ∙ ${g(100)} | ∙ ${g(91)}\n\n나 | ∙ ${g(137)} | ∙ ${g(124)}\n\n다 | ∙ ${g(35)} | ∙ ${g(46)}`, { chapter: "outcome", mark: "나", printed_pages: [81] }),
    chunk("outcome/2/body", `구분 | ’25년 자체평가 | ’26년 개선방안\n\n가 | ∙ ${g(78)} | ∙ ${g(79)}\n\n나 | ∙ ${g(77)} | ∙ ${g(84)}\n\n다 | ∙ ${g(18)} | ∙ ${g(23)}`, { chapter: "outcome", printed_pages: [81] }),
  ];
}

const findingRow = (i: number, finding = "짧은 지적 글"): FindingsPart["rows"][number] => ({ id: `c#${i}`, code: { cardId: "c", taskNo: "8-1", rowIndex: i, finding: [finding], plan: [], source: null, differs: false }, ai: { actions: [] } });
const priorRow = (evalNo: number, upTo: string[] = ["앞 값"]): PriorPart["rows"][number] => ({ id: `prior/${evalNo}`, code: { evalNo, title: `평가내용 ${evalNo}`, cards: [] }, human: { upTo }, ai: { now: [], effect: [] } });
const evalRow = (no: number) => ({ id: `x/${no}`, code: { evalNo: no, title: `평가내용 ${no}` }, human: { label: `구분${no}` } });
function parts(o: { findings?: number; evals?: number; kpi?: number; upTo?: string[]; finding?: string } = {}): Partial<Record<"findings" | "prior" | "outcome", UnitPart>> {
  const evals = o.evals ?? 3;
  const findings: FindingsPart = { part: "findings", code: { unmatched: [] }, rows: Array.from({ length: o.findings ?? 4 }, (_, i) => findingRow(i, o.finding)) };
  const prior: PriorPart = { part: "prior", rows: Array.from({ length: evals }, (_, i) => priorRow(i + 1, o.upTo)) };
  const outcome: OutcomePart = {
    part: "outcome",
    kpi: Array.from({ length: o.kpi ?? 3 }, (_, i) => ({
      id: `c#${i}`,
      code: { cardId: "c", taskNo: "8-1", index: i, name: `지표${i}`, unit: "%", prev: "1", target: "2", actual: "", match2025: null, polarity2025: null },
      human: { checked: i < 2, polarity: "up" as const },
      ai: { analysis: [] },
    })),
    qual: Array.from({ length: evals }, (_, i) => ({ ...evalRow(i + 1), ai: { result: [], analysis: [] } })),
    plan: Array.from({ length: evals }, (_, i) => ({ ...evalRow(i + 1), ai: { self: [], plan: [] } })),
  };
  return { findings, prior, outcome };
}
const budgetsOf = (p: ReturnType<typeof parts>, r = report2025()) => unitAiBudgets(p, r, unitAiCells(p, 2026, "MG-8"), 2026, "MG-8");

test("2025 표 칸 길이 읽기: 지적 병합 빈 칸·비고 뺌 · 전년 대비 여러 행 합(개선효과 안 작은 표 칸 포함) · 계량 2단 머리·각주 뺌 · 장 묶음 쪽", () => {
  const c = cols2025(report2025());
  assert.deepEqual(c.actions, [60, 90, 93], "둘째 행은 「 | 」로 쪼개진 빈 칸을 건너 두 불릿(50 + 40)");
  assert.deepEqual(c.prior.get(1), [70, 54], "’25 = 50 + 20, 개선효과 = 40 + 10 + 작은 표 칸 4");
  assert.deepEqual(c.prior.get(2), [60, 66]);
  assert.deepEqual(c.kpi, [20, 21, 22, 21, 20, 21]);
  assert.deepEqual([c.result, c.qualAnalysis, c.self, c.plan], [[100, 137, 35], [91, 124, 46], [78, 77, 18], [79, 84, 23]]);
  assert.deepEqual([c.frontPages, c.backPages], [1, 1]);
});

test("출발값: 행 수가 같으면 행끼리(전년 대비는 평가내용 번호), 다르면 2025 열 합 ÷ 지금 행 수(중앙값 2배까지) · 없는 평가내용은 열 중앙값", () => {
  const b = budgetsOf(parts()).cells;
  // 지적: 2025 3행 합 243 → 4행이면 61(지적은 해마다 달라 행끼리 짝짓지 않음)
  for (const r of ["F1", "F2", "F3", "F4"]) assert.equal(b[`${r}|actions`].base, 61);
  // 계량: 2025 6행 합 125 → 고른 2행이면 62.5지만 중앙값(21)의 2배 42까지
  assert.equal(b["K1|analysis"].base, 42);
  assert.equal(b["K3|analysis"], undefined, "고르지 않은 계량 행은 쓸 칸이 아님");
  // 비계량·개선계획: 행 수가 같아(3) 행끼리
  assert.deepEqual(["Q1|result", "Q2|result", "Q3|result", "L3|self"].map((k) => b[k].base), [100, 137, 35, 18]);
  // 전년 대비: 평가내용 1·2는 그 조각, 3은 2025에 없어 열 중앙값((70 + 60) / 2 = 65)
  assert.deepEqual(["P1|now", "P1|effect", "P2|now", "P3|now"].map((k) => b[k].base), [70, 54, 60, 65]);
  assert.ok(Object.values(b).every((x) => x.from2025));
  // 비계량 행이 2025보다 적으면 다시 나눔: 2행이면 합 272 ÷ 2 = 136(중앙값 100의 2배 안)
  assert.equal(budgetsOf(parts({ evals: 2 })).cells["Q1|result"].base, 136);
});

test("2025 칸 길이를 못 읽으면 지표 1~11 중앙값(기본값) — from2025 false", () => {
  const b = budgetsOf(parts(), []).cells;
  assert.equal(b["F1|actions"].base, UNIT_BUDGET_DEFAULT.actions);
  assert.equal(b["P1|now"].base, UNIT_BUDGET_DEFAULT.now);
  assert.equal(b["K1|analysis"].base, UNIT_BUDGET_DEFAULT.kpi);
  assert.equal(b["L1|plan"].base, UNIT_BUDGET_DEFAULT.plan);
  assert.ok(Object.values(b).every((x) => !x.from2025));
});

test("쪽 맞춤: 예산 길이로 채우면 조판 어림(unitPartsOutside + stackOutside)이 2025 쪽 수 안 — 넘치면 장마다 같은 비율로 줄임", () => {
  // 2025 지적 칸이 아주 길고 행이 많으면 앞 장이 한 쪽을 넘어 비율이 1보다 작아짐
  const big = report2025().map((c) => (c.meta.chapter === "findings" ? { ...c, text: `머리 | 조치 | 비고\n\n${Array.from({ length: 3 }, () => `∙ ${g(40)} | ∙ ${g(150)} | p.1`).join("\n\n")}` } : c));
  const p = parts({ findings: 4 });
  const cells = unitAiCells(p, 2026, "MG-8");
  const b = unitAiBudgets(p, big, cells, 2026, "MG-8");
  assert.ok(b.front.fits && b.front.scale < 1, `앞 장 비율 ${b.front.scale}`);
  assert.equal(b.cells["F1|actions"].chars, Math.max(UNIT_BUDGET_MIN, Math.round(b.cells["F1|actions"].base * b.front.scale)));
  // 어림 함수와 같은 결과: 예산 길이 채움 글을 조판 어림에 넣으면 2025 쪽 수 안이고 mm도 같음
  const view: any = { unit: "MG-8", indicator: "", year: 2026, cover: null, ...budgetFilledParts(p, cells, b), source: { cards: {}, drafts: {}, inputs: "" } };
  const o = unitPartsOutside(view);
  const front = stackOutside(o.front, 1);
  const back = stackOutside(o.back, 1);
  assert.ok(front.pages <= b.front.pages2025 && back.pages <= b.back.pages2025, `${front.pages}·${back.pages}쪽`);
  assert.deepEqual([front.mm, back.mm], [b.front.mm, b.back.mm]);
  assert.ok(b.front.mm <= UNIT_BUDGET_ROOM_MM * UNIT_BUDGET_FIT, "AI가 예산을 조금 넘겨 쓰는 만큼 여유(90%)");
  assert.deepEqual(unitAiBudgets(p, big, cells, 2026, "MG-8"), b, "결정론 — 같은 입력이면 같은 예산");
});

test("코드·사람 칸이 길어 못 맞추면 fits = false — AI 칸 예산은 행 높이를 늘리지 않는 만큼(최소 비율일 때 높이 이하)", () => {
  // ’25까지(사람 칸) 출발값·지적 글(앱 칸)이 아주 길면 AI 칸을 비워도 앞 장이 한 쪽을 넘음
  const p = parts({ upTo: [g(300), g(300)], finding: g(200) });
  const b = budgetsOf(p);
  assert.equal(b.front.fits, false);
  assert.ok(b.front.fixedMm > UNIT_BUDGET_ROOM_MM);
  assert.ok(b.front.mm <= b.front.fixedMm + 1, "AI 칸이 높이를 더하지 않음(같은 행의 긴 사람 칸 안)");
  assert.equal(b.back.fits, true, "뒤 장은 따로 셈");
});

test("채움 글: 예산 글자 수만큼 줄 수대로 나눔", () => {
  const lines = fillerLines(70, 3);
  assert.equal(lines.length, 3);
  assert.ok(Math.abs(lines.join("").length - 70) <= 3);
  assert.deepEqual(fillerLines(0, 1), []);
  const o = outsidePages({}, 2026, "MG-8");
  assert.deepEqual([o.front.pages, o.back.pages], [0, 0]);
});
