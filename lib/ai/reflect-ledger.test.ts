// 실적 반영(모드 A)의 계량지표 올해 실적 줄(2026-11-02): 첨부 증빙의 값으로 정량 성과 칸에 지표별 줄을 넣으면
// 경평 초안이 그 줄을 그 지표의 올해 실적으로 읽는지(lib/reports/actuals.ts outcomeActualItems + kpi-cover.ts) — 가상 카드 두 장(주요사업·경영관리).
import assert from "node:assert/strict";
import { test } from "node:test";
import { applySuggestion } from "../cards/edit.ts";
import { isMgmtCard } from "../cards/mgmt-card.ts";
import { assistPrompts, assistPromptsMg } from "../prompts/sets.ts";
import { outcomeActualItems } from "../reports/actuals.ts";
import { KPI_COVER_MIN, kpiKeyWords, wordCover } from "../reports/kpi-cover.ts";
import { type WriterResult, userPrompt, verifyResult } from "./writer.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const biz: any = {
  id: "주요사업9/9-가", group: "주요사업9", taskNo: "9-가", title: "가상 과제",
  overview: { cells: [] }, strategy: {}, act: { findings: [], selfAssessment: [] }, plan: { lines: [] }, check: { items: [] },
  do: { lines: ["∙ 추진내용"], monthly: [] },
  kpi: { rows: [{ name: "무선국 검사 자동화율", unit: "%", prev: "60", target: "80", nameRaw: "무선국 검사 자동화율(%)" }, { name: "민원 처리 기간", unit: "일", prev: "5", target: "4", nameRaw: "민원 처리 기간(일)" }] },
  outcome: { quantitative: ["∙ 검사 체계 고도화로 처리 효율 개선", "∙ 민원 처리 기간 : ’26.6 기준 실적 4.5일 (출처: 상반기 보고)"], qualitative: [] },
};
const mg: any = {
  id: "경영관리9/9-1", group: "경영관리9", taskNo: "9-1", title: "가상 경영관리 과제", indicatorNo: 9, indicatorName: "가상 지표",
  overview: { cells: [] }, feedback: { rows: [] }, findings: { rows: [] }, do: { lines: [], monthly: [] },
  kpi: { rows: [{ name: "청렴 교육 이수율", unit: "%", prev: "95", target: "100", nameRaw: "청렴 교육 이수율(%)" }, { name: "내부 신고 처리 건수", unit: "건", prev: "10", target: "12", nameRaw: "내부 신고 처리 건수(건)" }] },
  outcome: { quantitative: [], qualitative: [] },
};

const line = (name: string, value: string, src = "10월 실적보고") => `∙ ${name} : ’26.10 기준 실적 ${value} (출처: ${src})`;
const result = (suggestions: Array<{ kind: "replace" | "insert_after"; path: string; text: string }>): WriterResult => ({
  headline: "h", summary: "s", citations: [], monthly_row: null, need_input: null, followup: null,
  suggestions: suggestions.map((s) => ({ kind: s.kind, target_path: s.path, period: null, proposed: [s.text], reason: "r", source_keys: [] })),
});

/** 제안을 검증·반영한 카드 → 정량 성과 칸의 올해 실적 줄마다 붙는 지표 이름(없으면 null) */
function apply(card: any, suggestions: Parameters<typeof result>[0]) {
  const v = verifyResult(result(suggestions), card, []);
  let c = card;
  for (const s of v.suggestions) c = applySuggestion(c, s).card;
  const names = c.kpi.rows.map((r: any) => r.name);
  const keys = kpiKeyWords(names);
  const items = outcomeActualItems(c, 2026, isMgmtCard(c));
  return { v, card: c, items, matched: items.map((x) => names.find((_: string, i: number) => wordCover(keys[i], x.line) >= KPI_COVER_MIN) ?? null) };
}

test("주요사업: 새 지표 줄은 마지막 줄 뒤에, 있던 올해 실적 줄은 replace — 둘 다 그 지표의 올해 실적으로 잡힘", () => {
  const r = apply(biz, [
    { kind: "insert_after", path: "outcome.quantitative.1", text: line("무선국 검사 자동화율", "87.5%") },
    { kind: "replace", path: "outcome.quantitative.1", text: line("민원 처리 기간", "3.8일") },
  ]);
  assert.deepEqual(r.v.suggestions.map((s) => s.applicable), [true, true]);
  assert.equal(r.card.outcome.quantitative.length, 3);
  assert.equal(r.card.outcome.quantitative[0], biz.outcome.quantitative[0], "다른 줄은 그대로");
  assert.deepEqual(r.items.map((x) => x.undated), [false, false]);
  assert.deepEqual(r.matched.sort(), ["무선국 검사 자동화율", "민원 처리 기간"]);
  assert.ok(!r.card.outcome.quantitative.some((l: string) => l.includes("4.5일")), "옛 값은 바뀜");
  assert.deepEqual(r.card.kpi, biz.kpi, "계량지표 표(고정 영역)는 그대로");
});

test("경영관리(빈 정량 칸): outcome.quantitative.0 replace·insert_after 모두 반영 가능, 지표에 붙음", () => {
  assert.ok(isMgmtCard(mg));
  for (const kind of ["replace", "insert_after"] as const) {
    const r = apply(mg, [{ kind, path: "outcome.quantitative.0", text: line("청렴 교육 이수율", "98.2%") }]);
    assert.equal(r.v.suggestions[0].applicable, true, kind);
    assert.deepEqual(r.card.outcome.quantitative, [line("청렴 교육 이수율", "98.2%")], kind);
    assert.deepEqual(r.matched, ["청렴 교육 이수율"], kind);
  }
  // 두 지표를 이어서(첫 줄 replace → 그 뒤 insert_after)
  const once = apply(mg, [{ kind: "replace", path: "outcome.quantitative.0", text: line("청렴 교육 이수율", "98.2%") }]).card;
  const r = apply(once, [{ kind: "insert_after", path: "outcome.quantitative.0", text: line("내부 신고 처리 건수", "14건") }]);
  assert.deepEqual(r.matched, ["청렴 교육 이수율", "내부 신고 처리 건수"]);
  assert.deepEqual(r.items.map((x) => x.undated), [false, false], "시점이 있어 「시점 미기재」 아님");
});

test("빈 줄 하나뿐인 칸은 그 줄을 replace, 없는 줄·빈 목록의 둘째 줄은 반영 불가", () => {
  const blank = { ...mg, outcome: { quantitative: [""], qualitative: [] } };
  const r = apply(blank, [{ kind: "replace", path: "outcome.quantitative.0", text: line("내부 신고 처리 건수", "14건") }]);
  assert.equal(r.v.suggestions[0].applicable, true);
  assert.deepEqual(r.card.outcome.quantitative, [line("내부 신고 처리 건수", "14건")]);
  assert.deepEqual(r.matched, ["내부 신고 처리 건수"]);
  assert.equal(verifyResult(result([{ kind: "insert_after", path: "outcome.quantitative.1", text: "x" }]), mg, []).suggestions[0].applicable, false);
  assert.equal(verifyResult(result([{ kind: "insert_after", path: "outcome.quantitative.5", text: "x" }]), biz, []).suggestions[0].applicable, false);
});

test("줄 모양을 어기면 실적으로 안 읽힘(값 앞 목표·예상 표시) — 프롬프트가 정한 모양이 필요한 이유", () => {
  const card = { ...mg, outcome: { quantitative: [`∙ 청렴 교육 이수율 : ’26.10 기준 목표 100%`, `∙ 내부 신고 처리 건수 : ’26년 14건 달성 예상`], qualitative: [] } };
  assert.deepEqual(outcomeActualItems(card, 2026, false), []);
});

test("두 트랙 실적 반영 할 일에 정량 성과 칸 지표 줄 지시가 들어감", () => {
  for (const [P, card] of [[assistPrompts().prompts, biz], [assistPromptsMg().prompts, mg]] as const) {
    const p = userPrompt(P, card, "", { mode: "reflect", note: "", periodLabel: "2026년 10월", attachmentText: "10월 실적", files: [] });
    assert.match(p, /’YY\.M 기준 실적 <값·단위> \(출처: <자료 이름>\)/);
    assert.match(p, /칸이 비었으면 outcome\.quantitative\.0을 replace/);
    assert.match(p, /kpi\.rows/);
  }
});
