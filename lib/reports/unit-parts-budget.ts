// 경영관리 지표 단위 부분(카드 밖 표)의 AI 칸 글자 예산(R5c 보강, 2026-10-16 — 순수, 입출력 없음).
// 왜: MG-8 실측에서 AI가 칸에 2025 표보다 긴 글을 써(지적 조치 93~202자 ↔ 2025 68~102자, 계량 성과 분석 64~67자 ↔ 2025 20~22자) 카드 밖 어림이 4쪽(앞 2 + 뒤 2)으로
// 2025 2쪽(앞 1 + 뒤 1)을 넘었음. 그래서 칸마다 「약 N자 안팎(최대 M줄)」을 요청에 알리고, 1.3배를 넘으면 경고만 함(자르지 않음 — unit-parts-ai.ts).
//  ① 출발값: 그 지표 2025 같은 표의 실제 칸 길이(R5a가 읽는 2025 카드 밖 장 조각 — 불릿 글자 합, 「∙」·줄바꿈 표기 뺌).
//     전년 대비는 평가내용 번호로, 비계량·향후 개선계획은 행 순서로 짝짓고(행 수가 같을 때), 지적·계량은 행끼리 짝이 없어(지적·지표가 해마다 다름)
//     2025 열 합을 지금 행 수로 다시 나눔(2025 행당 중앙값의 2배까지 — 칸 하나가 2025 짜임보다 크게 부풀지 않게). 행 수가 다른 비계량·개선계획도 같음.
//     2025 칸 길이를 못 읽는 지표·칸은 지표 1~11 중앙값(UNIT_BUDGET_DEFAULT).
//  ② 쪽 맞춤: 칸마다 예산 길이의 채움 글을 넣어 조판 어림(unit-parts-layout.ts unitPartsOutside + business-layout.ts stackOutside — 같은 함수를 그대로 씀)이
//     앞 장(지적 + 전년 대비)·뒤 장(성과분석) 각각 2025 쪽 수의 90%(UNIT_BUDGET_FIT — AI가 예산을 조금 넘겨 쓰는 만큼 여유) 안에 들 때까지 그 장 AI 칸 예산을 같은 비율로 줄임(5%씩, UNIT_BUDGET_SCALE_MIN까지).
//     코드·사람 칸(지적 글·’25까지 출발값·구분)은 지금 글 그대로 셈 — 그 칸이 길어 못 맞추면 fits = false(사람 칸을 줄여야 함).
//  어림은 판정이 아니라 신호: 판형·글자 규격(서식) 자료가 없어(CLAUDE.md — 경영관리 판면 자동 맞추기 없음) 표 칸 폭·글자 수로 줄 수를 센 어림이고, 2025 대리 자료로
//  재도 앞 장 5/11·뒤 장 7/11만 2025 쪽 수와 맞음(OUTSIDE_FILL_MAX 주석). 예산은 「대략 이만큼」이지 상한 규칙이 아님.

import type { MgOutside } from "./business-layout.ts";
import { OUTSIDE_FILL_MAX, stackOutside } from "./business-layout.ts";
import { PAGE_MM } from "./fit.ts";
import { unitPartsOutside } from "./unit-parts-layout.ts";
import { type UnitChunk, type UnitPart, type UnitPartsMg, cellBullets, table2025Rows } from "./unit-parts-mg.ts";
import type { LooseJson } from "../loose-json.ts";


/** 예산을 매길 칸(unit-parts-ai.ts UnitAiCell과 같은 열쇠 — 타입 순환을 피하려 필요한 필드만) */
export interface BudgetCell {
  row: string;
  field: string;
  /** 부분 spec 안 경로(rows.0.ai.actions · kpi.3.ai.analysis · qual.1.ai.result · plan.2.ai.self) */
  path: string;
}

/** 칸 하나의 예산 */
export interface CellBudget {
  /** 예산(글자 수 — 줄 글자 합, 공백 포함) */
  chars: number;
  /** 최대 줄(불릿) 수 */
  lines: number;
  /** 2025 출발값(쪽 맞춤 전) */
  base: number;
  /** 출발값이 이 지표 2025 표에서 왔나(false면 지표 1~11 중앙값) */
  from2025: boolean;
}

/** 장 묶음(앞·뒤) 쪽 맞춤 결과 */
export interface BudgetFit {
  /** 2025 그 장 묶음 쪽 수(조각 printed_pages — 없으면 1) */
  pages2025: number;
  /** 예산대로 채웠을 때 어림 높이(mm)·쪽 수 */
  mm: number;
  pages: number;
  /** AI 칸을 모두 비웠을 때(코드·사람 칸만) 어림 높이(mm) — 이것만으로 2025 쪽을 넘으면 AI 예산으로는 못 맞춤 */
  fixedMm: number;
  /** 출발값에 곱한 비율(1이면 줄이지 않음) */
  scale: number;
  /** 2025 쪽 수(× UNIT_BUDGET_FIT) 안에 들었나(최소 비율까지 줄여도 넘으면 false — 코드·사람 칸이 긺) */
  fits: boolean;
}

export interface UnitAiBudgets {
  /** `행|칸`(F1|actions) → 예산 */
  cells: Record<string, CellBudget>;
  front: BudgetFit;
  back: BudgetFit;
}

/**
 * 2025 칸 길이를 못 읽을 때의 기본 출발값(글자) — 2025 지표 1~11 카드 밖 표의 칸 길이 중앙값(2026-10-16 운영 DB rpt25-mg-01~11 조각 실측:
 * 지적 조치 36칸·전년 대비 ’25 주요실적·개선효과 각 33평가내용(같은 평가내용의 여러 행은 합)·계량 성과 분석 73칸·비계량 실적·성과 분석 각 43칸·향후 개선계획 자체평가·개선방안 각 34칸)
 */
export const UNIT_BUDGET_DEFAULT = { actions: 82, now: 85, effect: 84, kpi: 28, result: 41, analysis: 41, self: 41, plan: 42 } as const;
/** 줄(불릿) 하나의 글자 — 2025 같은 칸들의 불릿 길이 중앙값(같은 실측: AI 칸 불릿 589개, 중앙값 32자·평균 31.4자) — 「최대 M줄」 = 예산 ÷ 이 값 올림(4줄까지) */
export const UNIT_BUDGET_LINE_CHARS = 32;
/** 칸 예산 최소(글자 — 【확인: ’26년 실적】 한 줄과 요지 몇 낱말) */
export const UNIT_BUDGET_MIN = 20;
/** 최대 줄 수(시스템 프롬프트 「칸마다 1~4줄」과 같음 — 답 정리의 상한 UNIT_AI_LINES_MAX 6은 그대로) */
const LINES_MAX = 4;
/** 쪽 맞춤에서 줄이는 최소 비율(2025 길이의 절반 — 그 아래로는 칸이 요지만 남아 표가 빈약해짐) */
export const UNIT_BUDGET_SCALE_MIN = 0.5;
/** 쪽 하나의 높이(mm) — 조판 쌓기와 같은 값(판면 × OUTSIDE_FILL_MAX) */
export const UNIT_BUDGET_ROOM_MM = PAGE_MM.height * OUTSIDE_FILL_MAX;
/**
 * 쪽 맞춤 목표 = 2025 쪽 수 × 쪽 높이 × 이 비율. AI 답은 칸 예산을 조금 넘겨 써서(2026-10-16 MG-8 로컬 CLI 2회차 — 한 줄 글자까지 알려도 답 합계가 예산의 1.14배,
 * 뒤 장 어림 281mm로 한 쪽 280.5mm를 0.5mm 넘음) 그만큼 여유를 둠
 */
export const UNIT_BUDGET_FIT = 0.9;
/** 경고 문턱: 답 칸 글이 예산의 이 배를 넘으면 「쪽이 넘칠 수 있음」(자르지 않음) */
export const UNIT_BUDGET_WARN = 1.3;

const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);
const median = (a: number[]) => {
  const s = a.filter((x) => x > 0).sort((x, y) => x - y);
  if (!s.length) return 0;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
/** 칸 글자 수(불릿 글자 합 — AI 답의 줄 글자 합과 같은 셈) */
const cellLen = (c: string) => sum(cellBullets(c ?? "").map((x) => x.length));
/** 칸 줄 목록 → 글자 수 */
export const linesLen = (lines: string[]) => sum((lines ?? []).map((x) => String(x ?? "").trim().length));
/** 빈 칸(병합 칸이 「 | 」로 쪼개져 생긴 빈 조각·「〃」)을 뺀 칸 */
const nonEmpty = (r: string[]) => r.filter((c) => cellLen(c) > 0);

/** 2025 표의 열 길이들(행 순서) — 장마다 조각을 골라 열 하나를 뽑음 */
interface Cols2025 {
  actions: number[];
  /** 평가내용 번호 → [’25 주요실적, 개선효과] */
  prior: Map<number, [number, number]>;
  kpi: number[];
  result: number[];
  qualAnalysis: number[];
  self: number[];
  plan: number[];
  frontPages: number;
  backPages: number;
}

const isPlanChunk = (c: UnitChunk) => c.meta?.chapter === "outcome" && c.meta?.mark !== "가" && c.meta?.mark !== "나" && /자체평가/.test(String(c.text ?? "").split(/\n\s*\n/)[0] ?? "");

/** 2025 카드 밖 장 조각 → 열 길이·장 묶음 쪽 수 */
export function cols2025(report2025: UnitChunk[]): Cols2025 {
  const out: Cols2025 = { actions: [], prior: new Map(), kpi: [], result: [], qualAnalysis: [], self: [], plan: [], frontPages: 0, backPages: 0 };
  const front = new Set<number>();
  const back = new Set<number>();
  for (const c of report2025) {
    const ch = c.meta?.chapter;
    const pp: number[] = Array.isArray(c.meta?.printed_pages) ? c.meta.printed_pages.map(Number).filter((n: number) => n > 0) : [];
    if (ch === "findings" || ch === "prior") pp.forEach((p) => front.add(p));
    if (ch === "outcome") pp.forEach((p) => back.add(p));
    const rows = table2025Rows(c.text);
    if (ch === "findings") {
      // 지적 칸이 「∙」로 시작하는 행만(위와 같음·빈 행 뺌), 조치 = 첫 칸(지적)·끝 칸(비고 p.N) 사이
      for (const r of rows) {
        if (!/^[∙•]/.test(r[0] ?? "")) continue;
        const ne = nonEmpty(r);
        const mid = /^p\.|^-$/.test((ne.at(-1) ?? "").trim()) ? ne.slice(1, -1) : ne.slice(1);
        const n = sum(mid.map(cellLen));
        if (n > 0) out.actions.push(n);
      }
    } else if (ch === "prior" && Number(c.meta?.eval_no) > 0) {
      // 평가내용 하나 = 조각 하나(행이 여럿이면 합) · 칸 = ’24까지 | ’25 | 개선효과(개선효과 안 작은 표가 칸으로 쪼개진 곳은 뒤 칸을 모두 개선효과로)
      let now = 0;
      let effect = 0;
      for (const r of rows) {
        const ne = nonEmpty(r);
        now += cellLen(ne[1] ?? "");
        effect += sum(ne.slice(2).map(cellLen));
      }
      out.prior.set(Number(c.meta.eval_no), [now, effect]);
    } else if (ch === "outcome" && c.meta?.mark === "가") {
      // 계량 표: 2단 머리(〃)·각주(한 칸) 뺌 — 성과 분석 = 6번째 칸
      for (const r of rows) if (r.length >= 6 && r[0] && r[0] !== "〃" && !/^[*※-]/.test(r[0]) && cellLen(r[5]) > 0) out.kpi.push(cellLen(r[5]));
    } else if (ch === "outcome" && c.meta?.mark === "나") {
      for (const r of rows) {
        if (r.length < 3) continue;
        out.result.push(cellLen(r[1]));
        out.qualAnalysis.push(cellLen(r[2]));
      }
    } else if (isPlanChunk(c)) {
      for (const r of rows) {
        if (r.length < 3) continue;
        out.self.push(cellLen(r[1]));
        out.plan.push(cellLen(r[2]));
      }
    }
  }
  out.frontPages = front.size;
  out.backPages = back.size;
  return out;
}

/**
 * 열 하나의 행별 출발값: 2025 값이 없으면 기본값, 행끼리 짝지을 수 있고(matched) 행 수가 같으면 그 행 값(빈 칸은 열 중앙값),
 * 아니면 2025 열 합 ÷ 지금 행 수(2025 행당 중앙값의 2배까지)
 */
function column(values: number[], n: number, def: number, matched: boolean): Array<{ base: number; from2025: boolean }> {
  const med = median(values);
  if (!n) return [];
  if (!med) return Array.from({ length: n }, () => ({ base: def, from2025: false }));
  if (matched && values.length === n) return values.map((v) => ({ base: v > 0 ? v : med, from2025: true }));
  const per = Math.round(Math.min(sum(values) / n, 2 * med));
  return Array.from({ length: n }, () => ({ base: per, from2025: true }));
}

const key = (c: Pick<BudgetCell, "row" | "field">) => `${c.row}|${c.field}`;
/** 경로 → [모음, 행 번호, 칸] (rows.0.ai.actions → ["rows", 0, "actions"]) */
const splitPath = (p: string): [string, number, string] => {
  const [coll, i, , field] = p.split(".");
  return [coll, Number(i), field];
};

/** 칸마다 출발값(쪽 맞춤 전) */
function bases(parts: Partial<Record<string, UnitPart>>, cells: BudgetCell[], c25: Cols2025): Map<string, { base: number; from2025: boolean }> {
  const out = new Map<string, { base: number; from2025: boolean }>();
  const f = parts.findings?.part === "findings" ? parts.findings : null;
  const pr = parts.prior?.part === "prior" ? parts.prior : null;
  const o = parts.outcome?.part === "outcome" ? parts.outcome : null;
  const actions = column(c25.actions, f?.rows.length ?? 0, UNIT_BUDGET_DEFAULT.actions, false);
  const checked = o ? o.kpi.map((k, i) => (k.human.checked ? i : -1)).filter((i) => i >= 0) : [];
  const kpi = column(c25.kpi, checked.length, UNIT_BUDGET_DEFAULT.kpi, false);
  const qn = o?.qual.length ?? 0;
  const pn = o?.plan.length ?? 0;
  const result = column(c25.result, qn, UNIT_BUDGET_DEFAULT.result, true);
  const qualAnalysis = column(c25.qualAnalysis, qn, UNIT_BUDGET_DEFAULT.analysis, true);
  const self = column(c25.self, pn, UNIT_BUDGET_DEFAULT.self, true);
  const plan = column(c25.plan, pn, UNIT_BUDGET_DEFAULT.plan, true);
  const priorAll = [...c25.prior.values()];
  const nowMed = median(priorAll.map((x) => x[0]));
  const effMed = median(priorAll.map((x) => x[1]));
  for (const c of cells) {
    const [coll, i, field] = splitPath(c.path);
    let b: { base: number; from2025: boolean } | undefined;
    if (coll === "rows" && field === "actions") b = actions[i];
    else if (coll === "rows" && pr && (field === "now" || field === "effect")) {
      const hit = c25.prior.get(pr.rows[i]?.code.evalNo ?? -1);
      const at = field === "now" ? 0 : 1;
      const med = field === "now" ? nowMed : effMed;
      const def = field === "now" ? UNIT_BUDGET_DEFAULT.now : UNIT_BUDGET_DEFAULT.effect;
      b = hit && hit[at] > 0 ? { base: hit[at], from2025: true } : med ? { base: med, from2025: true } : { base: def, from2025: false };
    } else if (coll === "kpi") b = kpi[checked.indexOf(i)];
    else if (coll === "qual") b = (field === "result" ? result : qualAnalysis)[i];
    else if (coll === "plan") b = (field === "self" ? self : plan)[i];
    out.set(key(c), b ?? { base: UNIT_BUDGET_DEFAULT.analysis, from2025: false });
  }
  return out;
}

/** 예산 길이의 채움 글(줄마다 같은 길이 — 4글자 낱말 + 빈칸, 한글 폭이라 숫자·기호가 섞인 실제 글보다 조금 넓게 셈) */
export function fillerLines(chars: number, lines: number): string[] {
  const n = Math.max(1, lines);
  const each = Math.ceil(chars / n);
  const line = (len: number) => "가나다라 ".repeat(Math.ceil(len / 5) + 1).slice(0, len).trim();
  return Array.from({ length: n }, (_, i) => line(Math.min(each, chars - each * i))).filter(Boolean);
}

const linesOf = (chars: number) => Math.min(LINES_MAX, Math.max(1, Math.ceil(chars / UNIT_BUDGET_LINE_CHARS)));
const budgetOf = (base: number, scale: number) => Math.max(UNIT_BUDGET_MIN, Math.round(base * scale));

/** 부분들의 지정 칸을 채움 글로 바꾼 복사본(쪽 맞춤 어림용) */
function filled(parts: Partial<Record<string, UnitPart>>, cells: BudgetCell[], charsOf: (c: BudgetCell) => number): Partial<Record<string, UnitPart>> {
  const out: Partial<Record<string, LooseJson>> = {};
  for (const [k, p] of Object.entries(parts)) if (p) out[k] = structuredClone(p);
  for (const c of cells) {
    const part = c.path.startsWith("rows.") ? (c.field === "actions" ? out.findings : out.prior) : out.outcome;
    if (!part) continue;
    const [coll, i, field] = splitPath(c.path);
    const row = part[coll]?.[i];
    if (row?.ai) {
      const n = charsOf(c);
      row.ai[field] = fillerLines(n, linesOf(n));
    }
  }
  return out;
}

/** 부분들 → 조판 어림(앞·뒤 장 묶음 mm·쪽 — 사업 조판과 같은 함수) */
export function outsidePages(parts: Partial<Record<string, UnitPart>>, year: number, unit: string): { front: { mm: number; pages: number }; back: { mm: number; pages: number }; outside: MgOutside } {
  const view: UnitPartsMg = {
    unit,
    indicator: "",
    year,
    cover: null,
    findings: parts.findings?.part === "findings" ? parts.findings : null,
    prior: parts.prior?.part === "prior" ? parts.prior : null,
    outcome: parts.outcome?.part === "outcome" ? parts.outcome : null,
    source: { cards: {}, drafts: {}, inputs: "" },
  };
  const outside = unitPartsOutside(view);
  const f = stackOutside(outside.front, 1);
  const b = stackOutside(outside.back, 1);
  return { front: { mm: f.mm, pages: f.pages }, back: { mm: b.mm, pages: b.pages }, outside };
}

/** 쪽 맞춤에서 비율을 줄이는 단계 */
const SCALE_STEP = 0.05;

/**
 * 칸마다 글자 예산(순수, 결정론): 2025 같은 표 칸 길이(없으면 지표 1~11 중앙값)에서 출발해, 예산 길이로 모든 AI 칸을 채웠을 때 앞 장·뒤 장 어림이
 * 각각 2025 쪽 수(판면 × OUTSIDE_FILL_MAX × 쪽 × UNIT_BUDGET_FIT)에 들 때까지 그 장의 AI 칸을 같은 비율로 줄임(5%씩). 최소 비율로도 안 들면(코드·사람 칸이 이미 김 — fits = false)
 * 최소 비율일 때 높이를 넘지 않는 가장 큰 비율 — 행 높이는 칸 중 가장 긴 칸이 정하므로 같은 행의 긴 코드·사람 칸보다 짧은 AI 칸은 높이를 더하지 않음.
 * 지금 글이 있는 AI 칸도 예산 길이로 셈(빈 칸만 모드에서도 같은 예산). cells = unit-parts-ai.ts unitAiCells(부분들) — 부분이 일부만 오면(「지금 부분만」) 없는 장은 높이에 안 셈
 */
export function unitAiBudgets(parts: Partial<Record<string, UnitPart>>, report2025: UnitChunk[], cells: BudgetCell[], year: number, unit: string): UnitAiBudgets {
  const c25 = cols2025(report2025);
  const base = bases(parts, cells, c25);
  const isFront = (c: BudgetCell) => c.path.startsWith("rows.");
  const scale = { front: 1, back: 1 };
  const charsOf = (c: BudgetCell) => budgetOf(base.get(key(c))!.base, isFront(c) ? scale.front : scale.back);
  const room = UNIT_BUDGET_ROOM_MM;
  const pages2025 = { front: c25.frontPages || 1, back: c25.backPages || 1 };
  const measure = () => outsidePages(filled(parts, cells, charsOf), year, unit);
  const fixed = outsidePages(filled(parts, cells, () => 0), year, unit);
  const fit = { front: false, back: false };
  const steps = Math.round((1 - UNIT_BUDGET_SCALE_MIN) / SCALE_STEP);
  // 앞·뒤를 따로 줄임(서로의 높이에 영향 없음): 목표 = 2025 쪽 수, 최소 비율로도 안 들면 최소 비율일 때 높이
  for (const side of ["front", "back"] as const) {
    scale[side] = UNIT_BUDGET_SCALE_MIN;
    const floor = measure()[side].mm;
    const limit = pages2025[side] * room * UNIT_BUDGET_FIT;
    fit[side] = floor <= limit + 1e-9;
    const target = Math.max(limit, floor);
    for (let k = 0; k <= steps; k++) {
      scale[side] = Math.round((1 - k * SCALE_STEP) * 100) / 100;
      if (measure()[side].mm <= target + 1e-9) break;
    }
  }
  const m = measure();
  const out: Record<string, CellBudget> = {};
  for (const c of cells) {
    const b = base.get(key(c))!;
    const chars = charsOf(c);
    out[key(c)] = { chars, lines: linesOf(chars), base: b.base, from2025: b.from2025 };
  }
  const side = (s: "front" | "back"): BudgetFit => ({ pages2025: pages2025[s], mm: m[s].mm, pages: m[s].pages, fixedMm: fixed[s].mm, scale: scale[s], fits: fit[s] });
  return { cells: out, front: side("front"), back: side("back") };
}

/** 예산을 매긴 칸을 예산 길이 채움 글로 바꾼 부분들(시험·연기 시험의 「예산대로면 몇 쪽」) */
export function budgetFilledParts(parts: Partial<Record<string, UnitPart>>, cells: BudgetCell[], budgets: UnitAiBudgets): Partial<Record<string, UnitPart>> {
  return filled(parts, cells, (c) => budgets.cells[key(c)]?.chars ?? UNIT_BUDGET_MIN);
}
