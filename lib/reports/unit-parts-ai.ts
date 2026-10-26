// 경영관리 지표 단위 부분(카드 밖 표)의 AI 문장 칸 채우기(R5c, 순수 — 입출력 없음). 설계 docs/plan/경영관리-R5-지표단위-설계.md §3.7(2026-10-16 승인).
// 지표당 1회: 코드(R5a 코어)가 정한 행·칸 중 ai 칸만 행 열쇠별로 채움 — 지적 「조치 및 개선실적」·전년 대비 「’26 주요실적·개선효과」·계량 「성과 분석」·비계량 「실적·성과 분석」·향후 개선계획 「자체평가·개선방안」.
// ① 쓸 칸 고르기(unitAiTargets — 빈 칸만이 기본, 덮어쓰기는 옵션) ② 요청 글(unitAiPrompt — 문구는 resources/prompts/report-unit-mg/request.md, 조건·반복만 코드)
// ③ 답 정리(applyUnitAiAnswer — 모르는 행·칸 버림, code·human 칸 쓰기 거절, 줄 수 상한, 숫자 대조(knownNumbers 하나로), 【확인】 셈 — 저장할 부분 spec과 경고).
// 칸 글자 예산(2026-10-16 — unit-parts-budget.ts): 요청 글에 칸마다 「약 N자 안팎(최대 M줄)」, 답 칸이 예산의 1.3배를 넘으면 자르지 않고 경고.
// 자료 범위(설계 §3.7 「자료 범위는 기능마다 고정」 줄): 그 지표 활성 카드 원장 + 과제별 초안 글(목차 순) + 부서 계량 실적 입력 + '25 평가위원 지적(원문) + 시정조치 계획(약속 표지) +
// 2025 그 지표 보고서 카드 밖 장 + 핵심공통항목('25) + 편람 지표. 카드 전용 자료·보고서 추가자료 원문은 넣지 않음(금기 4 — 사용자 확인 2026-10-16), 공통 지식 「규칙 범위 전부」도 안 씀.

import { z } from "zod";
import { compareTaskNo } from "../cards/view.ts";
import { inspectionCardText } from "../ai/inspect.ts";
import { revisionNote } from "../knowledge/revision-note.ts";
import { type Descriptions, type PromptSet, type PromptSpec, described, fillFrom } from "../prompts/template.ts";
import type { UnitPartKey } from "../tracks/index.ts";
import { needsIn, stripNeeds } from "./actuals.ts";
import { mgPartLabel } from "./mg-outline.ts";
import { kpiKey, kpiRowsOf } from "./model.ts";
import { knownNumbers, numberTokens } from "./section.ts";
import { sectionMarkdown } from "./section-md.ts";
import { type UnitAiBudgets, UNIT_BUDGET_ROOM_MM, UNIT_BUDGET_WARN, linesLen, unitAiBudgets } from "./unit-parts-budget.ts";
import { applyUnitPartEdits } from "./unit-parts-edit.ts";
import { type MgUnitMaterials, type UnitChunk, type UnitPart, findingRowParts, kpiRate, mergeKpiInputs, unitPartsLabels } from "./unit-parts-mg.ts";

/** AI 칸이 있는 부분(표지는 사람 칸·코드 칸뿐) */
export const UNIT_AI_PARTS = ["findings", "prior", "outcome"] as const satisfies readonly UnitPartKey[];
export type UnitAiPart = (typeof UNIT_AI_PARTS)[number];
export const isUnitAiPart = (k: string): k is UnitAiPart => (UNIT_AI_PARTS as readonly string[]).includes(k);

/** 칸 한 줄 상한(칸 고치기 applyUnitPartEdits와 같음 — 넘으면 거기서 잘림)·칸 줄 수 상한(2025 표 칸은 불릿 1~4줄 — 넘으면 앞 줄만) */
export const UNIT_AI_LINE_MAX = 600;
export const UNIT_AI_LINES_MAX = 6;
/** 긴 줄 경고(2025 표 칸 한 줄은 짧음 — 자르지 않고 알림) */
const LONG_LINE = 120;
/** 경고 머리 — 다시 채우면 앞 AI 경고를 이 머리로 걸러 갈아 끼움 */
export const UNIT_AI_WARN = "AI 채우기:";

// ---------------------------------------------------------------------------
// 프롬프트 절·답 스키마

/** request.md에 있어야 하는 절 */
export const UNIT_AI_REQUEST_SECTIONS = [
  "header",
  "mode.empty",
  "mode.overwrite",
  "cards.head",
  "cards.item",
  "cards.none",
  "drafts.head",
  "drafts.item",
  "drafts.missing",
  "actuals.head",
  "actuals.item",
  "actuals.none",
  "evaluator.head",
  "evaluator.item",
  "evaluator.none",
  "corrective.head",
  "corrective.item",
  "corrective.none",
  "report2025.head",
  "report2025.item",
  "report2025.none",
  "core.head",
  "core.item",
  "core.none",
  "handbook.head",
  "handbook.item",
  "handbook.none",
  "rows.head",
  "rows.part",
  "row.finding",
  "row.prior",
  "row.kpi",
  "row.qual",
  "row.plan",
  "row.field",
  "row.budget",
  "row.current",
  "row.kept",
  "none",
  "tail",
] as const;
type RequestKey = (typeof UNIT_AI_REQUEST_SECTIONS)[number];

/** AI 답 필드(schema.md 절 이름) */
export const UNIT_AI_OUT_FIELDS = ["cells", "cell.row", "cell.field", "cell.lines", "note"] as const;

/** 프롬프트 파일(resources/prompts/report-unit-mg)에 있어야 하는 절 */
export const UNIT_AI_PROMPT_SPEC: PromptSpec = { system: ["system"], request: UNIT_AI_REQUEST_SECTIONS, schema: UNIT_AI_OUT_FIELDS };

/**
 * 답 스키마: 칸 하나 = 행 열쇠(row — 요청의 [F1] 등)·칸 이름(field)·줄 목록. 행 열쇠·칸 이름은 문자열로 받고 코드가 쓸 칸 목록과 맞춤
 * (한 값 enum·literal로 묶지 않음 — 표기가 조금 달라도 구조화 출력 파싱이 통째로 실패하지 않게, CLAUDE.md 「코드가 이미 정한 값은 답 스키마에서 한 값으로 묶지 않음」)
 */
export function unitAiOutSchema(desc?: Descriptions) {
  const d = <T extends z.ZodType>(s: T, key: (typeof UNIT_AI_OUT_FIELDS)[number]) => described(s, desc, key);
  return z.object({
    cells: d(z.array(z.object({ row: d(z.string(), "cell.row"), field: d(z.string(), "cell.field"), lines: d(z.array(z.string()), "cell.lines") })), "cells"),
    note: d(z.string(), "note"),
  });
}
export const UnitAiOut = unitAiOutSchema();
export type UnitAiOutput = z.infer<typeof UnitAiOut>;

// ---------------------------------------------------------------------------
// 쓸 칸

/** 쓸 칸(또는 이미 쓴 칸) 하나 */
export interface UnitAiCell {
  /** 행 열쇠(요청·답에 쓰는 짧은 이름): F = 지적, P = 전년 대비, K = 계량(목록 번호 — 고르지 않은 행은 빠져 번호가 건너뜀), Q = 비계량, L = 향후 개선계획 */
  row: string;
  /** ai 칸 이름(actions·now·effect·analysis·result·self·plan) */
  field: string;
  part: UnitAiPart;
  /** 부분 spec 안 경로(applyUnitPartEdits 허용 경로) */
  path: string;
  /** 칸 이름(화면·표 머리 — unitPartsLabels) */
  label: string;
  /** 지금 글 */
  current: string[];
}

const hasText = (lines: unknown) => Array.isArray(lines) && lines.some((x) => typeof x === "string" && x.trim());

/** 부분들의 ai 칸 전부(행 순서). 계량은 표에 넣기로 고른 행(human.checked)만 — 고르지 않은 행은 표에 안 나감 */
export function unitAiCells(parts: Partial<Record<UnitAiPart, UnitPart>>, year: number, unit: string): UnitAiCell[] {
  const L = unitPartsLabels(year, unit);
  const out: UnitAiCell[] = [];
  const f = parts.findings;
  if (f?.part === "findings") f.rows.forEach((r, i) => out.push({ row: `F${i + 1}`, field: "actions", part: "findings", path: `rows.${i}.ai.actions`, label: L.findings.cols[1], current: r.ai.actions }));
  const p = parts.prior;
  if (p?.part === "prior")
    p.rows.forEach((r, i) => {
      out.push({ row: `P${i + 1}`, field: "now", part: "prior", path: `rows.${i}.ai.now`, label: L.prior.cols[1], current: r.ai.now });
      out.push({ row: `P${i + 1}`, field: "effect", part: "prior", path: `rows.${i}.ai.effect`, label: L.prior.cols[2], current: r.ai.effect });
    });
  const o = parts.outcome;
  if (o?.part === "outcome") {
    o.kpi.forEach((r, i) => {
      if (r.human.checked) out.push({ row: `K${i + 1}`, field: "analysis", part: "outcome", path: `kpi.${i}.ai.analysis`, label: L.outcome.kpiCols.analysis, current: r.ai.analysis });
    });
    o.qual.forEach((r, i) => {
      out.push({ row: `Q${i + 1}`, field: "result", part: "outcome", path: `qual.${i}.ai.result`, label: L.outcome.qualCols[1], current: r.ai.result });
      out.push({ row: `Q${i + 1}`, field: "analysis", part: "outcome", path: `qual.${i}.ai.analysis`, label: L.outcome.qualCols[2], current: r.ai.analysis });
    });
    o.plan.forEach((r, i) => {
      out.push({ row: `L${i + 1}`, field: "self", part: "outcome", path: `plan.${i}.ai.self`, label: L.outcome.planCols[1], current: r.ai.self });
      out.push({ row: `L${i + 1}`, field: "plan", part: "outcome", path: `plan.${i}.ai.plan`, label: L.outcome.planCols[2], current: r.ai.plan });
    });
  }
  return out;
}

/** 부분들에 있는 행 열쇠 전부(계량은 고르지 않은 행도 — 답의 「모르는 행」과 「쓸 수 없는 칸」을 가름) */
function rowKeys(parts: Partial<Record<UnitAiPart, UnitPart>>): Set<string> {
  const keys = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);
  const f = parts.findings?.part === "findings" ? parts.findings.rows.length : 0;
  const p = parts.prior?.part === "prior" ? parts.prior.rows.length : 0;
  const o = parts.outcome?.part === "outcome" ? parts.outcome : null;
  return new Set([...keys("F", f), ...keys("P", p), ...keys("K", o?.kpi.length ?? 0), ...keys("Q", o?.qual.length ?? 0), ...keys("L", o?.plan.length ?? 0)]);
}

/** 쓸 칸: 덮어쓰기면 ai 칸 전부, 아니면 빈 칸만(글이 있는 칸은 요청에 「이미 쓴 칸」으로만 보임) */
export function unitAiTargets(cells: UnitAiCell[], overwrite: boolean): UnitAiCell[] {
  return overwrite ? cells : cells.filter((c) => !hasText(c.current));
}

/** 칸 글자 예산(unit-parts-budget.ts unitAiBudgets — 2025 같은 표 칸 길이 + 2025 쪽 수 맞춤). 요청 글·답 정리가 같은 값을 씀 */
export function unitAiBudgetsOf(input: { materials: Pick<MgUnitMaterials, "report2025" | "year" | "unit">; parts: Partial<Record<UnitAiPart, UnitPart>> }): UnitAiBudgets {
  const { year, unit } = input.materials;
  return unitAiBudgets(input.parts, input.materials.report2025, unitAiCells(input.parts, year, unit), year, unit);
}

// ---------------------------------------------------------------------------
// 요청 글

/** 요청 재료(서버 액션·연기 시험 공용) — materials는 R5b loadUnitMaterials 그대로, 더하는 것은 시정조치 계획·핵심공통항목(loadUnitAiExtras) */
export interface UnitAiInput {
  materials: MgUnitMaterials;
  corrective: UnitChunk[];
  core: UnitChunk[];
  indicator: string;
  /** 채울 부분(저장된 spec, 없으면 재료로 만든 것) */
  parts: Partial<Record<UnitAiPart, UnitPart>>;
  overwrite: boolean;
}

const yy = (y: number) => String(y % 100).padStart(2, "0");
const oneLine = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();
const joinLines = (a: string[]) => a.map(oneLine).filter(Boolean).join(" / ");
/** 2025 보고서의 카드 밖 장(세부평가내용별 본문은 과제별 초안 자리라 뺌) */
const OUT_OF_CARD = new Set(["cover", "findings", "prior", "outcome"]);

/** 활성 카드를 목차 순으로(목차 sort, 목차에 없거나 같으면 과제번호 순) */
export function orderedCards(m: Pick<MgUnitMaterials, "cards" | "outline">): MgUnitMaterials["cards"] {
  const sort = new Map((m.outline ?? []).filter((r) => r.sort !== null && r.sort !== undefined).map((r) => [r.card_id, Number(r.sort)]));
  const key = (id: string) => sort.get(id) ?? Number.MAX_SAFE_INTEGER;
  return m.cards.filter((c) => c.status === "active").sort((a, b) => key(a.id) - key(b.id) || compareTaskNo(a.taskNo, b.taskNo));
}

/** 과제별 초안 글(카드 id → 개조식 글). 초안이 없으면 없음 */
function draftTexts(m: Pick<MgUnitMaterials, "drafts">): Map<string, string> {
  return new Map(m.drafts.filter((d) => d.spec).map((d) => [d.cardId, sectionMarkdown(d.spec!).md.trim()]));
}

/** 합친 계량 실적 입력(카드 계량 행 키 → 값) */
const kpiInputs = (m: Pick<MgUnitMaterials, "kpiInputs">) => mergeKpiInputs(m.kpiInputs).inputs;

/** 평가내용 → 대응 카드 과제번호(전년 대비 부분 행 — 없으면 빈 목록) */
function evalCards(parts: UnitAiInput["parts"]): Map<number, string[]> {
  const p = parts.prior;
  return new Map(p?.part === "prior" ? p.rows.map((r) => [r.code.evalNo, r.code.cards.map((c) => c.taskNo)]) : []);
}

/**
 * AI 요청 글: 머리(지표·부분·채우는 방식) → 카드 원장 → 과제별 초안(목차 순) → 올해 계량 실적 입력 → '25 평가위원 지적 → 시정조치 계획(약속 표지) →
 * 2025 같은 장 → 핵심공통항목 → 편람 → 쓸 칸(행마다 앱이 정한 칸 글·쓸 칸·이미 쓴 칸) → 끝맺음. 문구는 request.md, 여기는 고르기·되풀이뿐
 */
export function unitAiPrompt(p: PromptSet, input: UnitAiInput): string {
  const r = (key: RequestKey, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const m = input.materials;
  const year = m.year;
  const none = r("none");
  const cells = unitAiCells(input.parts, year, m.unit);
  const targets = new Set(unitAiTargets(cells, input.overwrite).map((c) => `${c.row}|${c.field}`));
  const budgets = unitAiBudgetsOf(input).cells;
  // 칸 예산 「약 N자 안팎(최대 M줄 · 한 줄 K자 안팎)」 — 첫 실측(2026-10-16 MG-8)에서 줄 수는 지켰으나 줄이 길어 한 줄 글자도 적음
  const budgetText = (b: UnitAiBudgets["cells"][string] | undefined) => (b ? r("row.budget", { chars: b.chars, lines: b.lines, per: Math.round(b.chars / b.lines) }) : "");
  const partNames: Record<UnitAiPart, string> = { findings: "지적사항 조치실적", prior: "전년 대비 주요 추진실적", outcome: "성과분석 및 환류" };
  const out: string[] = [
    r("header", { year, indicator: input.indicator, unit: m.unit, parts: UNIT_AI_PARTS.filter((k) => input.parts[k]).map((k) => partNames[k]).join(" · ") }),
    r(input.overwrite ? "mode.overwrite" : "mode.empty"),
  ];
  // 카드 원장(작성본 아님)
  const cards = orderedCards(m);
  out.push("", r("cards.head", { count: cards.length }));
  if (cards.length) for (const c of cards) out.push(r("cards.item", { taskNo: c.taskNo, title: c.title, rev: Number(c.dataRev ?? 0), text: inspectionCardText(c.data) }));
  else out.push(r("cards.none"));
  // 과제별 초안(목차 순)
  const drafts = draftTexts(m);
  out.push("", r("drafts.head"));
  for (const c of cards) out.push(drafts.has(c.id) ? r("drafts.item", { taskNo: c.taskNo, text: drafts.get(c.id)! }) : r("drafts.missing", { taskNo: c.taskNo }));
  // 계량 실적 입력(그 지표 모든 부서 보고서 — 카드 계량 행 키)
  const inputs = kpiInputs(m);
  const kpiLines = cards.flatMap((c) =>
    kpiRowsOf(c.data?.kpi?.rows).flatMap((k) => {
      const v = inputs[kpiKey(c.id, k.i)];
      return v ? [r("actuals.item", { taskNo: c.taskNo, name: k.name, actual: v })] : [];
    }),
  );
  out.push("", r("actuals.head", { yy: yy(year) }), ...(kpiLines.length ? kpiLines : [r("actuals.none")]));
  // '25 평가위원 지적(원문 — 인용 대조용, 숫자 근거 아님)
  out.push("", r("evaluator.head", { prevYY: yy(year - 1) }), ...(m.evaluator.length ? m.evaluator.map((c) => r("evaluator.item", { title: oneLine(c.title ?? c.chunk_key), text: c.text })) : [r("evaluator.none")]));
  // 시정조치 계획(약속 표지 — revisionNote의 PLAN_NOTE 그대로)
  out.push(
    "",
    r("corrective.head"),
    ...(input.corrective.length ? input.corrective.map((c) => r("corrective.item", { title: oneLine(c.title ?? c.chunk_key), note: revisionNote({ chunk_key: c.chunk_key, unit_type: c.unit_type ?? "corrective_action", meta: c.meta }) ?? "", text: c.text })) : [r("corrective.none")]),
  );
  // 2025 같은 장(카드 밖 장만)
  const same = m.report2025.filter((c) => OUT_OF_CARD.has(String(c.meta?.chapter ?? "")));
  out.push("", r("report2025.head"), ...(same.length ? same.map((c) => r("report2025.item", { title: oneLine(c.title ?? c.chunk_key), text: c.text })) : [r("report2025.none")]));
  out.push("", r("core.head"), ...(input.core.length ? input.core.map((c) => r("core.item", { title: oneLine(c.title ?? c.chunk_key), text: c.text })) : [r("core.none")]));
  out.push(
    "",
    r("handbook.head"),
    ...(m.handbook.length ? m.handbook.map((c) => r("handbook.item", { title: oneLine(c.title ?? c.chunk_key), note: revisionNote({ chunk_key: c.chunk_key, unit_type: c.unit_type ?? "handbook_indicator", meta: c.meta }) ?? "", text: c.text })) : [r("handbook.none")]),
  );
  // 쓸 칸(행마다)
  out.push("", r("rows.head"));
  const fieldLines = (row: string) =>
    cells
      .filter((c) => c.row === row)
      .map((c) =>
        targets.has(`${c.row}|${c.field}`)
          ? r("row.field", {
              field: c.field,
              label: c.label,
              budget: budgetText(budgets[`${c.row}|${c.field}`]),
              current: hasText(c.current) ? r("row.current", { text: joinLines(c.current) }) : "",
            })
          : r("row.kept", { label: c.label, text: joinLines(c.current) }),
      );
  const byEval = evalCards(input.parts);
  const cardsText = (evalNo: number) => (byEval.get(evalNo) ?? []).join("·") || none;
  const L = unitPartsLabels(year, m.unit);
  const f = input.parts.findings;
  if (f?.part === "findings") {
    out.push("", r("rows.part", { title: L.findings.title }));
    if (!f.rows.length) out.push(none);
    const specOf = new Map(m.drafts.filter((d) => d.spec).map((d) => [d.cardId, d.spec!]));
    const cardOf = new Map(m.cards.map((c) => [c.id, c.data]));
    f.rows.forEach((row, i) => {
      const spec = specOf.get(row.code.cardId) ?? null;
      const keys = findingRowParts(spec, cardOf.get(row.code.cardId), row.code.rowIndex, row.code.finding);
      const labels = keys.map((k) => spec?.mg?.parts.find((x) => x.key === k)).filter((x) => !!x).map((x) => mgPartLabel(x!));
      const src = row.code.source;
      out.push(
        r("row.finding", {
          key: `F${i + 1}`,
          taskNo: row.code.taskNo,
          n: row.code.rowIndex + 1,
          finding: joinLines(row.code.finding),
          plan: joinLines(row.code.plan) || none,
          source: src ? `${src.label ? `(${src.label}) ` : ""}지적 ${src.no}: ${src.text}` : none,
          parts: labels.join(" / ") || none,
        }),
        ...fieldLines(`F${i + 1}`),
      );
    });
  }
  const pr = input.parts.prior;
  if (pr?.part === "prior") {
    out.push("", r("rows.part", { title: L.prior.title }));
    if (!pr.rows.length) out.push(none);
    pr.rows.forEach((row, i) =>
      out.push(r("row.prior", { key: `P${i + 1}`, evalNo: row.code.evalNo, title: row.code.title, cards: row.code.cards.map((c) => c.taskNo).join("·") || none, upToLabel: L.prior.cols[0], upTo: joinLines(row.human.upTo) || none }), ...fieldLines(`P${i + 1}`)),
    );
  }
  const o = input.parts.outcome;
  if (o?.part === "outcome") {
    out.push("", r("rows.part", { title: L.outcome.title }));
    o.kpi.forEach((row, i) => {
      if (!row.human.checked) return;
      out.push(
        r("row.kpi", {
          key: `K${i + 1}`,
          name: row.code.name,
          unit: row.code.unit || none,
          taskNo: row.code.taskNo,
          prevLabel: L.outcome.kpiCols.prev,
          prev: row.code.prev || none,
          yearLabel: L.outcome.kpiCols.year,
          target: row.code.target || none,
          actual: row.code.actual || none,
          rate: kpiRate(row).text,
          polarity: row.human.polarity === "down" ? "낮을수록 좋음" : "높을수록 좋음",
        }),
        ...fieldLines(`K${i + 1}`),
      );
    });
    o.qual.forEach((row, i) => out.push(r("row.qual", { key: `Q${i + 1}`, label: row.human.label, evalNo: row.code.evalNo, title: row.code.title, cards: cardsText(row.code.evalNo) }), ...fieldLines(`Q${i + 1}`)));
    o.plan.forEach((row, i) => out.push(r("row.plan", { key: `L${i + 1}`, label: row.human.label, evalNo: row.code.evalNo, title: row.code.title, cards: cardsText(row.code.evalNo) }), ...fieldLines(`L${i + 1}`)));
  }
  out.push("", r("tail", { count: targets.size }));
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 숫자 근거

/**
 * 숫자 근거 글(설계 §3.7 — 기존 경영관리 규칙과 같게): 카드 원장(활성 카드 전부) · 과제별 초안 글 · 부서 계량 실적 입력 · 앱이 셈한 달성률 · 2025 그 지표 보고서 전 장 · 핵심공통항목('25).
 * '25 평가위원 지적 원문·시정조치 계획·편람의 수치는 넣지 않음(인용 대조에만 — 지적 내용·약속·기준이지 KCA 실적이 아님)
 */
export function unitAiKnownNumbers(input: Pick<UnitAiInput, "materials" | "core" | "parts">): Set<string> {
  const m = input.materials;
  const cards = orderedCards(m);
  const o = input.parts.outcome;
  const rates = o?.part === "outcome" ? o.kpi.map((k) => kpiRate(k).text) : [];
  const extra = [
    ...cards.slice(1).map((c) => inspectionCardText(c.data)),
    ...draftTexts(m).values(),
    ...Object.values(kpiInputs(m)),
    ...rates,
    ...m.report2025.map((c) => c.text),
    ...input.core.map((c) => c.text),
  ].join("\n");
  // knownNumbers(카드, 근거 글) 하나로 — 첫 카드는 카드 자리, 나머지 카드 글은 근거 글에(같은 풀이 inspectionCardText)
  return knownNumbers(cards[0]?.data ?? {}, extra);
}

const numKey = (tok: string) => tok.replace(/,/g, "").replace(/\s+/g, "").replace(/퍼센트/, "%");

/** 근거에 없는 숫자(【확인: …】 자리표시 안은 뺌 — 경영관리 초안 검증과 같은 셈) */
export function unknownNumbersIn(text: string, known: Set<string>): string[] {
  return [...new Set(numberTokens(stripNeeds(text)).filter((t) => !known.has(numKey(t)) && !known.has(numKey(t).replace(/(%|배)$/, ""))))];
}

// ---------------------------------------------------------------------------
// 답 정리

/** 칸 글 한 줄: 태그 꺾쇠·앞 불릿 기호(∙•·□○▪◦)를 걷고 공백 한 칸(「- 」 하위 줄 표기는 그대로 — 칸 고치기와 같은 표기) */
const cleanLine = (s: unknown) =>
  String(s ?? "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[∙•·□○▪◦■]\s*/, "")
    .trim();

export interface UnitAiApplied {
  /** 고친 부분 spec(쓸 칸이 있던 부분만 — 바뀐 칸이 없으면 들어온 것 그대로) */
  parts: Partial<Record<UnitAiPart, UnitPart>>;
  /** 부분마다 채운 칸 수 */
  filled: Partial<Record<UnitAiPart, number>>;
  /** 부분마다 AI 경고(UNIT_AI_WARN 머리 — 저장된 경고에서 앞 AI 경고를 갈아 끼움) */
  warnings: Partial<Record<UnitAiPart, string[]>>;
  /** 부분에 매이지 않는 알림(모르는 행·거절한 칸·AI 메모) */
  notes: string[];
  unknownNumbers: string[];
  /** 남은 【확인: …】 수(채운 칸 글 안) */
  needs: number;
}

/**
 * AI 답 → 부분 spec(순수). 쓸 칸(targets)에 있는 행·칸만 받음: 모르는 행 열쇠는 버리고, 있는 행이라도 쓸 칸이 아닌 칸(code·human 칸 — 지적 글·숫자·’25까지·구분, 또는 빈 칸만 모드에서 이미 쓴 칸)은 거절.
 * 줄은 정리하고 칸마다 UNIT_AI_LINES_MAX줄까지(넘으면 앞 줄만 — 경고), 빈 답 칸은 쓰지 않음(덮어쓰기에서도 지우지 않음). 적용은 칸 고치기와 같은 경로 허용 목록(applyUnitPartEdits).
 * 숫자 대조는 known(unitAiKnownNumbers — knownNumbers 하나로), 없는 숫자·【확인】·안 채운 칸은 부분 경고로.
 * budgets(unitAiBudgetsOf)를 주면 칸 글이 예산의 UNIT_BUDGET_WARN배를 넘는 칸을 자르지 않고 부분 경고로 알리고, 칸 예산으로도 장이 2025 쪽에 안 드는(코드·사람 칸이 긴) 장도 알림
 */
export function applyUnitAiAnswer(parts: Partial<Record<UnitAiPart, UnitPart>>, targets: UnitAiCell[], answer: UnitAiOutput, known: Set<string>, budgets?: UnitAiBudgets): UnitAiApplied {
  const want = new Map(targets.map((c) => [`${c.row}|${c.field}`, c]));
  const allRows = rowKeys(parts);
  const seen = new Set<string>();
  let unknownRows = 0;
  const rejected: string[] = [];
  let dup = 0;
  const edits: Partial<Record<UnitAiPart, Array<{ path: string; value: string[] }>>> = {};
  const texts: Partial<Record<UnitAiPart, string[]>> = {};
  const over: Partial<Record<UnitAiPart, string[]>> = {};
  let cut = 0;
  let long = 0;
  for (const cell of answer.cells ?? []) {
    const row = String(cell?.row ?? "").replace(/[[\]\s]/g, "").toUpperCase();
    const field = String(cell?.field ?? "").trim();
    const key = `${row}|${field}`;
    const t = want.get(key);
    if (!t) {
      if (allRows.has(row)) rejected.push(`${row}.${field || "?"}`);
      else unknownRows += 1;
      continue;
    }
    if (seen.has(key)) {
      dup += 1;
      continue;
    }
    seen.add(key);
    let lines = (Array.isArray(cell.lines) ? cell.lines : []).map(cleanLine).filter(Boolean).map((x) => x.slice(0, UNIT_AI_LINE_MAX));
    if (!lines.length) continue;
    if (lines.length > UNIT_AI_LINES_MAX) {
      cut += 1;
      lines = lines.slice(0, UNIT_AI_LINES_MAX);
    }
    long += lines.filter((x) => x.length > LONG_LINE).length;
    const b = budgets?.cells[key];
    const len = linesLen(lines);
    if (b && len > b.chars * UNIT_BUDGET_WARN) (over[t.part] ??= []).push(`${t.row} ${t.label} ${len}자 / 예산 ${b.chars}자`);
    (edits[t.part] ??= []).push({ path: t.path, value: lines });
    (texts[t.part] ??= []).push(...lines);
  }
  const out: UnitAiApplied = { parts: { ...parts }, filled: {}, warnings: {}, notes: [], unknownNumbers: [], needs: 0 };
  for (const part of UNIT_AI_PARTS) {
    const spec = parts[part];
    const mine = targets.filter((c) => c.part === part);
    if (!spec || !mine.length) continue;
    const list = edits[part] ?? [];
    const applied = applyUnitPartEdits(spec, list);
    // 경로는 쓸 칸 목록(unitAiCells)에서 왔으므로 거절될 수 없음 — 거절되면 그 부분은 그대로 두고 알림
    if (!applied.ok) {
      out.warnings[part] = [`${UNIT_AI_WARN} 답을 적용하지 못함(${applied.message})`];
      continue;
    }
    out.parts[part] = applied.part;
    out.filled[part] = list.length;
    const text = (texts[part] ?? []).join("\n");
    const unknown = unknownNumbersIn(text, known);
    const needs = needsIn(text).length;
    out.unknownNumbers.push(...unknown);
    out.needs += needs;
    const missing = mine.length - list.length;
    const w: string[] = [];
    if (unknown.length) w.push(`${UNIT_AI_WARN} 근거에 없는 숫자 ${unknown.length}개 — 카드·과제별 초안·실적 입력·2025 보고서·핵심공통항목에 없음, 원자료로 확인하거나 지워 주세요: ${unknown.slice(0, 8).join(", ")}`);
    if (needs) w.push(`${UNIT_AI_WARN} 【확인】 ${needs}곳 — 근거가 없어 채울 자료를 적어 둔 자리`);
    if (missing > 0) w.push(`${UNIT_AI_WARN} 쓸 칸 ${mine.length}개 중 ${missing}개를 채우지 않음`);
    const o = over[part] ?? [];
    if (o.length) w.push(`${UNIT_AI_WARN} 칸 글이 길어 쪽이 넘칠 수 있음: ${o.slice(0, 6).join(" · ")}${o.length > 6 ? ` 외 ${o.length - 6}칸` : ""}`);
    const fit = budgets ? (part === "outcome" ? budgets.back : budgets.front) : null;
    // 앞 장 알림은 한 번만(전년 대비가 있으면 그 부분에, 없으면 지적)
    const frontHere = part === "prior" || (part === "findings" && !targets.some((c) => c.part === "prior"));
    if (fit && !fit.fits && (part === "outcome" || frontHere))
      w.push(
        `${UNIT_AI_WARN} ${part === "outcome" ? "뒤 장(성과분석 및 환류)" : "앞 장(지적사항 조치실적 + 전년 대비)"}은 AI 칸을 비워도 어림 ${(fit.fixedMm / UNIT_BUDGET_ROOM_MM).toFixed(1)}쪽이라 2025 ${fit.pages2025}쪽에 들지 않음 — ${part === "outcome" ? "구분·계량 행(앱·사람 칸)" : "지적 글·’25까지 칸(앱·사람 칸)"}을 줄여야 함(칸 예산은 행 높이를 늘리지 않는 만큼만)`,
      );
    out.warnings[part] = w;
  }
  out.unknownNumbers = [...new Set(out.unknownNumbers)];
  if (unknownRows) out.notes.push(`모르는 행 ${unknownRows}개를 버림(요청에 없는 행 열쇠)`);
  if (rejected.length) out.notes.push(`쓸 수 없는 칸 ${rejected.length}개를 거절(재료·사람 칸 또는 이미 쓴 칸): ${rejected.slice(0, 6).join(", ")}`);
  if (dup) out.notes.push(`같은 칸을 두 번 적은 답 ${dup}개는 앞 것만 씀`);
  if (cut) out.notes.push(`줄이 ${UNIT_AI_LINES_MAX}개를 넘는 칸 ${cut}개는 앞 ${UNIT_AI_LINES_MAX}줄만 씀`);
  if (long) out.notes.push(`${LONG_LINE}자를 넘는 긴 줄 ${long}개 — 표 칸에 맞게 줄여 주세요`);
  const note = oneLine(answer.note).slice(0, 300);
  if (note) out.notes.push(`AI 메모: ${note}`);
  return out;
}

/** 저장된 경고에서 앞 AI 경고(UNIT_AI_WARN 머리)를 빼고 새 AI 경고를 붙임 */
export function withAiWarnings(saved: string[], ai: string[]): string[] {
  return [...saved.filter((w) => !w.startsWith(UNIT_AI_WARN)), ...ai];
}
