// 경평 초안 「실적 칸의 계획 표지」 결정론 점검(순수, 2026-10-17 서술 품질 F1).
// 12월 보고서의 추진성과·추진실적 칸은 올해 한 일과 결과를 쓰는 자리인데, 경영관리 초안은 이 칸 줄의 4.5%(운영 51장 측정)에
// 「예정」「할 계획」 같은 계획 표현이나 아직 안 온 시점(’26.11월 시범)이 있었음(2025 보고서 0.5%, 주요사업 초안 0%).
// 이 모듈은 실적 칸의 줄을 모으고 계획 표지를 찾아 경고 한 줄만 만든다 — 글을 고치지 않고, 자동 고치기 사유에도 넣지 않는다(경고 앞머리 「실적 칸」 = 막힘).
// 실적 칸 = 주요사업 추진성과 상자(results·resultCards·resultBand·resultChart)와 라벨 「추진성과/추진실적/성과」 블록,
//           추진실적 열 표(table:result)의 실적 칸(수치·결과 줄)과 구분표의 「추진실적」 열.

import type { LooseJson } from "../loose-json.ts";
import { stripNeeds } from "./actuals.ts";
import type { Block } from "./blocks.ts";
import { plainText } from "./fit.ts";
import { bigramSet } from "./ground.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 기준 시점(집필·점검 날짜) — 이보다 뒤 연·월은 아직 안 온 시점 */
export interface RefMonth {
  year: number;
  month: number;
}

/** 「YYYY-MM-DD」 → 기준 시점. 형식이 다르면 null(시점 점검은 건너뛰고 낱말만 봄) */
export function refMonthOf(today: string | undefined): RefMonth | null {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(today ?? "");
  return m ? { year: Number(m[1]), month: Number(m[2]) } : null;
}

/** 「…할 계획」「…될 것」의 앞 글자 — 받침 ㄹ인 동사 어미만(「9~10월 계획」의 「월」·「일」 같은 명사는 아님) */
const FUTURE_ENDING = "할될낼둘줄갈볼울을질길킬릴칠";

/** 낱말 표지 — 줄 → 맞은 글(경고에 「…」로 보임) 또는 null */
const WORD_MARKERS: Array<{ find: (line: string) => string | null }> = [
  // 「예정」 — 「예정보다 앞당겨」「예정대로」「예정 대비」는 실적을 말함
  { find: (l) => /예정(?!\s?(?:보다|대로|대비|일정|물량|건수))/.exec(l)?.[0] ?? null },
  // 「구축할 계획」 · 「(9월 계획)」 — 「계획 대비 달성」「계획대로」「계획서」는 실적·문서 이름
  { find: (l) => new RegExp(`(?:[${FUTURE_ENDING}]|\\d{1,2}\\s?월)\\s?계획(?!\\s?(?:대비|대로|보다|서|안|표|수립|상))`).exec(l)?.[0] ?? null },
  // 「할 것」「될 것으로」
  { find: (l) => new RegExp(`[${FUTURE_ENDING}]\\s?것(?![가-힣]?\\s?(?:이라는|이란))`).exec(l)?.[0] ?? null },
  { find: (l) => /향후|추후/.exec(l)?.[0] ?? null },
  { find: (l) => /[할될]\s?(?:방침|전망)/.exec(l)?.[0] ?? null },
];

/** 연·월이 든 시점: ’26.11월 · ’26.11. · ’26년 11월 · 2026.11월 · 2026년 11월 (앞 글자가 숫자·범위 기호인 월은 제외, 뒤가 「기준」이면 기준일 표기라 제외) */
const YM_RE = /(?<![\d~∼\-–])(?:[’'‘]|20)(\d{2})(?:년\s?|\.)\s?(\d{1,2})(?:월|\.)(?!\d)(?!\s?(?:말\s?)?기준)/g;

/** 아직 안 온 시점이 든 줄인가 — 기준 시점보다 뒤인 연·월(’26.11월). 연도만 있는 ’27년은 목표·장기 계획 표기가 많아 안 봄. 맞은 글을 돌려줌 */
export function futureTime(line: string, ref: RefMonth | null): string | null {
  if (!ref) return null;
  const yy = ref.year % 100;
  for (const m of line.matchAll(YM_RE)) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (mo < 1 || mo > 12) continue;
    if (y > yy || (y === yy && mo > ref.month)) return m[0];
  }
  return null;
}

/** 줄에서 계획 표지 하나를 찾음(자리표시 【확인: …】는 걷고 봄). 없으면 null. 맞은 글은 경고에 「…」로 보임 */
export function planMarker(line: string, ref: RefMonth | null = null): string | null {
  const t = stripNeeds(line);
  for (const w of WORD_MARKERS) {
    const hit = w.find(t);
    if (hit) return hit;
  }
  return futureTime(t, ref);
}

const RESULT_LABEL = /^(?:추진성과|추진실적|성과)$/;
const RESULT_HEAD = /추진\s?(?:성과|실적)|^성과$/;
const compact = (s: string) => s.replace(/\s/g, "");

/** 블록 하나의 실적 칸 줄(없으면 빈 배열): 라벨이 추진성과·추진실적·성과인 블록은 전부, 추진실적 열 표는 수치·결과 줄, 구분표는 「추진실적」 열 */
export function resultLinesOfBlock(b: Block): string[] {
  const all = () => [b.title, b.text, ...b.items, ...b.cells.flatMap((c) => [c.head, c.tag, ...c.bullets, c.note]), ...b.rows.flatMap((r) => [r.key, ...r.before, ...r.after]), ...b.series.map((s) => `${s.label} ${s.value}`), b.badge];
  let out: string[];
  if (RESULT_LABEL.test(compact(b.label))) out = all();
  else if (b.kind === "table" && b.variant === "result") out = [b.text, ...b.series.map((s) => `${s.label} ${s.value}`)];
  else if (b.kind === "table" && b.variant !== "ladder") {
    // 구분표: items[0] = 구분 열 머리, items[k+1] = k번째 값 열 머리 → 「추진실적」 머리의 열만
    const cols = b.items.map((h, i) => (i > 0 && RESULT_HEAD.test(h) ? i - 1 : -1)).filter((i) => i >= 0);
    out = cols.length ? b.cells.flatMap((c) => cols.map((k) => c.bullets[k] ?? "")) : [];
  } else out = [];
  return out.map((s) => s.trim()).filter(Boolean);
}

/** 초안의 실적 칸 줄 모음(주요사업 추진성과 상자 + 실적 블록) */
export function resultLines(spec: ReportSectionSpec): string[] {
  const out = [
    ...spec.results,
    ...(spec.resultCards ?? []).flatMap((c) => [c.tag, c.headline, c.figure]),
    ...(spec.resultChart ? [spec.resultChart.title, ...spec.resultChart.series.map((s) => `${s.label} ${s.value}`), spec.resultChart.badge] : []),
    spec.resultBand ?? "",
    ...(spec.blocks ?? []).flatMap(resultLinesOfBlock),
  ];
  return out.map((s) => String(s ?? "").trim()).filter(Boolean);
}

/** 계획 표지가 든 실적 칸 줄: [줄, 표지] */
export function planInResult(spec: ReportSectionSpec, today?: string): Array<[string, string]> {
  const ref = refMonthOf(today);
  const out: Array<[string, string]> = [];
  for (const line of resultLines(spec)) {
    const hit = planMarker(line, ref);
    if (hit) out.push([line, hit]);
  }
  return out;
}

const around = (line: string, hit: string) => {
  const i = line.indexOf(hit);
  if (line.length <= 36) return line;
  const from = Math.max(0, Math.min(i - 12, line.length - 36));
  return `${from > 0 ? "…" : ""}${line.slice(from, from + 36)}${from + 36 < line.length ? "…" : ""}`;
};

/** 경고 한 줄(막힘 — warning-levels.ts 「실적 칸」). 계획 표지가 든 줄이 없으면 null. 줄 3개까지 보이고 나머지는 「외 N줄」 */
export function resultPlanWarning(spec: ReportSectionSpec, today?: string): string | null {
  const hits = planInResult(spec, today);
  if (!hits.length) return null;
  const shown = hits.slice(0, 3).map(([line, hit]) => `「${around(line, hit)}」`);
  const more = hits.length > 3 ? ` 외 ${hits.length - 3}줄` : "";
  const marks = [...new Set(hits.map(([, hit]) => hit))].slice(0, 4).map((h) => `「${h}」`);
  return `실적 칸: ${shown.join(" / ")}${more} — 계획(${marks.join("·")})이 실적 칸에 있음 — 올해 한 일·결과로 바꾸거나 계획은 추진내용으로`;
}

// ---------------------------------------------------------------------------
// 계획을 실적처럼 쓴 줄(2026-10-27 품질 측정 후속 — 참고 경고, 자동 고치기 사유·점수에는 안 넣음).
// 블라인드 심사: 주요사업1/1-가 추진성과 「성과 산출 기준을 기존 20분 → 개선 25분으로 바꿔 실질 투입 시간 기준 확립」은 카드 [Plan] 조치 및 개선방향의 계획일 뿐
// 적용을 마쳤다는 실행 근거가 없음. 표지 낱말(예정·할 계획)이 없어 위 「실적 칸」 점검은 못 잡음 → 실적 칸 줄이 카드 계획 줄 하나와 많이 겹치고
// 카드의 실행 근거(추진내용·월별 실적·성과 칸·넘겨받은 자료)와는 적게 겹치면 알림.

/** 줄의 글자 두 개 묶음 중 계획 줄 하나에 있는 비율이 이 값 이상 */
export const PLAN_OVERLAP_MIN = 0.5;
/** 줄의 글자 두 개 묶음 중 실행 근거에 있는 비율이 이 값 미만(기준선 8건: 1-가 위 줄 0.48, 계획 겹침 0.5 이상인 다른 줄은 0.71 이상) */
export const DO_OVERLAP_MAX = 0.6;
/** 판단할 최소 글자 두 개 묶음 수 — 표 머리·지표 이름 같은 짧은 줄(「국정과제 이행지수(%)」)은 판단하지 않음 */
const PLAN_LINE_MIN = 8;

/** 값 안의 글 전부(배열·객체를 따라 내려감, 그림 칸은 뺌) */
function textsOf(v: LooseJson): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(textsOf);
  if (v && typeof v === "object" && !("image" in v)) return Object.values(v).flatMap(textsOf);
  return [];
}

/** 카드의 계획 줄: [Plan] 조치 및 개선방향(plan.lines) + 환류·지적 행의 개선방안 칸(경영관리 feedback·findings rows[].plan) */
export function cardPlanLines(card: LooseJson): string[] {
  const rows = (x: LooseJson) => (Array.isArray(x?.rows) ? x.rows : []).flatMap((r: LooseJson) => textsOf(r?.plan));
  return [...textsOf(card?.plan?.lines), ...rows(card?.feedback), ...rows(card?.findings)].map((s) => s.trim()).filter(Boolean);
}

/** 카드의 실행 근거 글: 추진내용(do.lines)·월별 실적(do.monthly 항목, 표 칸 포함)·성과 칸(outcome 정량·정성) */
export function cardDoText(card: LooseJson): string {
  const monthly = (Array.isArray(card?.do?.monthly) ? card.do.monthly : []).flatMap((m: LooseJson) => textsOf(m?.items));
  return [...textsOf(card?.do?.lines), ...monthly, ...textsOf(card?.outcome?.quantitative), ...textsOf(card?.outcome?.qualitative)].join("\n");
}

/** 묶음 a 중 b에 있는 비율 */
const share = (a: Set<string>, b: Set<string>) => {
  let hit = 0;
  for (const g of a) if (b.has(g)) hit += 1;
  return hit / a.size;
};

/**
 * 계획을 실적처럼 쓴 실적 칸 줄: [줄, 가장 많이 겹친 카드 계획 줄]. 계획 표지(planMarker)가 있는 줄은 이미 「실적 칸」 경고가 잡으므로 뺌.
 * evidence: 카드 밖 실행 근거 글(카드 전용 자료 등 — 있으면 실행 근거에 더함)
 */
export function planAsResult(spec: ReportSectionSpec, card: LooseJson, evidence = ""): Array<[string, string]> {
  const plans = cardPlanLines(card).map((p) => [p, bigramSet(p)] as const);
  if (!plans.length) return [];
  const done = bigramSet(`${cardDoText(card)}\n${evidence}`);
  const out: Array<[string, string]> = [];
  for (const line of resultLines(spec)) {
    if (planMarker(line)) continue;
    const bg = bigramSet(plainText(stripNeeds(line)));
    if (bg.size < PLAN_LINE_MIN) continue;
    let best: readonly [string, number] = ["", 0];
    for (const [p, pb] of plans) {
      const v = share(bg, pb);
      if (v > best[1]) best = [p, v];
    }
    if (best[1] >= PLAN_OVERLAP_MIN && share(bg, done) < DO_OVERLAP_MAX) out.push([line, best[0]]);
  }
  return out;
}

const short = (s: string, n = 40) => {
  const t = plainText(s).replace(/^[\s∙·•\-→★]+/, "").trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};

/** 괄호 밖 쉼표·쌍반점으로 나눈 마디 */
function clausesOf(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "（") depth += 1;
    else if ((ch === ")" || ch === "）") && depth > 0) depth -= 1;
    if (depth === 0 && /[,，;]/.test(ch)) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  return [...out, cur].map((c) => c.trim()).filter(Boolean);
}

/** 계획 줄에서 초안 줄과 가장 많이 겹치는 마디 — 경고에 짧게 보일 부분 */
function closestClause(plan: string, line: string): string {
  const bg = bigramSet(plainText(stripNeeds(line)));
  const clauses = clausesOf(plan).filter((c) => bigramSet(c).size > 0);
  let best: readonly [string, number] = [plan, -1];
  for (const c of clauses) {
    const cb = bigramSet(c);
    let hit = 0;
    for (const g of cb) if (bg.has(g)) hit += 1;
    if (hit > best[1]) best = [c, hit];
  }
  return best[0];
}

/** 경고 한 줄(참고 — warning-levels.ts 「계획→실적」). 없으면 null. 줄 2개까지 보이고 나머지는 「외 N줄」 */
export function planAsResultWarning(spec: ReportSectionSpec, card: LooseJson, evidence = ""): string | null {
  const hits = planAsResult(spec, card, evidence);
  if (!hits.length) return null;
  const shown = hits.slice(0, 2).map(([line, plan]) => `「${short(line)}」(카드 계획 「${short(closestClause(plan, line))}」)`);
  const more = hits.length > 2 ? ` 외 ${hits.length - 2}줄` : "";
  return `계획→실적: ${shown.join(" / ")}${more} — 카드에서는 계획인데 실행 근거(추진내용·월별 실적·성과 칸)가 적음 — 한 일이 맞으면 근거를 붙이고, 아니면 계획으로 표시`;
}
