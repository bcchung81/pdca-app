// 경평 초안 「올해 실적」(결정론, 순수) — 12월 보고서는 올해 한 일을 평가받으므로 올해 실적 재료를 요청 글 앞에 드러내고,
// 올해 값이 근거에 없으면 전년 값·목표로 채우지 않고 【확인: …】 자리표시로 남깁니다(담당자가 채울 자료).
// 평가 세트 기준선(2026-09-27): 핵심 수치 띠 4개 중 올해 실적이 든 것 2개, 추진성과가 모두 예상·목표인 초안 2/8 — AI가 카드의 올해 월별 실적보다 전년·목표 수치를 앞세움.

import type { LooseJson } from "../loose-json.ts";
import { KPI_COVER_MIN, kpiKeyWords, wordCover } from "./kpi-cover.ts";

type Json = LooseJson;

/** 담당자가 채울 자리표시: 【확인: ’26년 누적 판독 건수】 */
export const NEED_RE = /【확인:\s*([^】]{1,80})】/g;

/** 글 안 자리표시 → 채울 자료 이름들(나온 순, 중복 없음) */
export function needsIn(text: string): string[] {
  return [...new Set([...String(text ?? "").matchAll(NEED_RE)].map((m) => m[1].trim()).filter(Boolean))];
}

/** 자리표시를 걷은 글(숫자 대조용 — 자리표시 안의 시점·기간 숫자는 사실이 아님) */
export const stripNeeds = (text: string) => String(text ?? "").replace(NEED_RE, "");

/**
 * 윗첨자 연도 바로 뒤 자리표시 안의 같은 연도를 뺌: 「^{’26년}【확인: ’26년 AI 활용 … 건수】」 → 「^{’26년}【확인: AI 활용 … 건수】」
 * (2026-10-27 — 화면에 「’26년’26년 …」으로 보였음, 기준선 8건 중 주요사업 4건·경영관리 1건). 연도가 다르거나 「’26.4」 같은 월 시점·자리표시가 연도뿐이면 그대로
 */
export const dedupeNeedYear = (text: string) => text.replace(/(\^\{\s*[’'‘](\d{2})년?\s*\}\s*【확인:\s*)[’'‘](\d{2})년\s*(?=[^】\s])/g, (m, head: string, a: string, b: string) => (a === b ? head : m));

/** 수치(단위가 붙은 숫자)가 든 글인가 — 날짜(7.6.)·시점(’26.7)·목록 번호는 뺌 */
const DATE_RE = /[’']\d{2}(?:\.\d{1,2}){0,2}\.?|\(\s*\d{1,2}\.\s?\d{1,2}\.?\s*\)|\b\d{1,2}\.\s?\d{1,2}\.(?!\d)/g;
const FIGURE_RE = /\d[\d,.]*\s*(?:%|건|명|개소|개|국|종|억|만|천|회|시간|km|곳|배|점|원|대|식|초|분|주|일|MHz|GHz|kW|톤|호)/;
export const hasFigure = (text: string) => FIGURE_RE.test(String(text ?? "").replace(DATE_RE, " "));

/** 목표·계획·예상·전망 표시 — 막대(blocks.ts actualBars)와 수치 띠 칸(actualStatCells)이 같은 낱말 */
export const PLAN_BAR = /목표|계획|예상|전망/;

export interface KpiActual {
  name: string;
  unit: string;
  /** ’25년 실적(카드) */
  prev: string;
  /** ’26년 목표(카드) */
  target: string;
  /** ’26년 실적(예상) — 일부 카드 양식의 칸 */
  expected: string;
  /** ’26년 실적 — 부서가 경평 초안 「계량 실적」에 넣은 값(reports.inputs.kpi) */
  input: string;
  /** 카드 정량 성과 칸(outcome.quantitative)에서 이 지표에 붙인 올해 실적 줄(지표 이름 낱말이 절반 넘게 든 줄 — outcomeActuals). 없으면 빈 글·없음 */
  outcome?: string;
}

export interface YearActuals {
  /** 작성일(YYYY-MM-DD) — 그 뒤 실적은 아직 없음 */
  today: string;
  kpi: KpiActual[];
  /** 올해 월별 실적(카드 do.monthly) 중 수치가 든 줄 */
  monthly: Array<{ period: string; line: string }>;
  /** 카드 정량 성과 칸의 올해 실적 줄 중 어느 계량지표에도 붙지 않은 것(붙은 줄은 KpiActual.outcome). today가 없으면 보지 않음 */
  outcome?: string[];
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * 카드 + 부서 계량 실적 입력 → 올해 실적 재료. inputs 키는 lib/reports/model.ts kpiKey(카드 id#지표 순번).
 * 계량지표는 원본 양식의 빈 자리표시("-") 행을 뺌(model.ts kpiRowsOf와 같은 규칙).
 */
export function yearActuals(card: Json, inputs: Record<string, string> = {}, today = ""): YearActuals {
  const rows: Json[] = Array.isArray(card?.kpi?.rows) ? card.kpi.rows : [];
  const kpi: KpiActual[] = rows
    .map((k, i) => ({ name: str(k?.name), unit: str(k?.unit), prev: str(k?.prev), target: str(k?.target), expected: str(k?.expected), input: str(inputs[`${card?.id}#${i}`]) }))
    .filter((k) => k.name && !/^[-–—·]+$/.test(k.name));
  const monthly: YearActuals["monthly"] = [];
  for (const m of Array.isArray(card?.do?.monthly) ? card.do.monthly : []) {
    for (const line of Array.isArray(m?.items) ? m.items : []) if (typeof line === "string" && hasFigure(line)) monthly.push({ period: str(m?.period), line: line.trim() });
  }
  const year = Number(/^(\d{4})-/.exec(today)?.[1] ?? 0);
  if (!year) return { today, kpi, monthly };
  // 카드 정량 성과 칸의 올해 실적(2026-10-27): 주요사업1/7-가처럼 칸에 「(’26년 목표 2.267일 → ’26년 성과 2.000일)」이 있는데 계량지표 줄이 「없음 → 【확인】」으로 알려
  // 초안이 카드에 있는 실적을 자리표시로 비웠음(블라인드 심사). 지표 이름 낱말이 절반 넘게 든 줄은 그 지표에 붙이고, 나머지는 따로 알림
  const keys = kpiKeyWords(kpi.map((k) => k.name));
  const outcome: string[] = [];
  for (const line of outcomeActuals(card, year)) {
    const i = kpi.findIndex((k, j) => !k.outcome && wordCover(keys[j], line) >= KPI_COVER_MIN);
    if (i >= 0) kpi[i].outcome = line;
    else outcome.push(line);
  }
  return { today, kpi, monthly, outcome };
}

/** 글머리 기호로 시작하는 줄 = 새 항목(아니면 앞 줄에 이어 붙음 — 「∙ … 성과 달성(’26.8)」 다음 줄 「(’26년 목표 … → ’26년 성과 2.000일)」) */
const ITEM_HEAD = /^[∙·•\-－○◦▪□■◆※*]/;

/**
 * 카드 정량 성과 칸(outcome.quantitative)의 올해 실적 줄: 올해 시점(’26·2026년 — 바로 뒤가 목표·예상·계획·전망이 아닌 것)과 목표·계획 값이 아닌 단위 수치(actualFigures)와
 * 성과·실적·달성 낱말이 있고 예정·예상 줄이 아닌 것. 글머리 없이 이어지는 줄은 앞 항목에 붙여 한 줄로 봄. 따옴표 ‘26은 ’26으로 읽음.
 * 운영 102장 중 잡히는 것: 주요사업1/7-가(「’26년 성과 2.000일」). 「목표 100% 초과 달성」(3/6-가)·「목표(40%) 100% 달성」(경영관리3/3-3)은 값이 목표 쪽이라, 「00% 증가(’26.12 예정)」(2/8-가)는 예정이라 뺌
 */
export function outcomeActuals(card: Json, year: number): string[] {
  const items: string[] = [];
  for (const raw of Array.isArray(card?.outcome?.quantitative) ? card.outcome.quantitative : []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const line = raw.trim().replace(/‘(?=\d{2})/g, "’");
    if (items.length && !ITEM_HEAD.test(line)) items[items.length - 1] += ` ${line}`;
    else items.push(line);
  }
  return items.filter((l) => mentionsNow(l, year) && actualFigures(l).length > 0 && /성과|실적|달성/.test(l) && !/예정|예상/.test(l)).map((l) => l.replace(new RegExp(`^${ITEM_HEAD.source.slice(1)}\\s*`), ""));
}

/** 계량지표 중 올해 실적이 아직 없는 것(부서 입력도 카드 예상 칸도 비었음) — 「채울 자료」 목록용 */
export function kpiGaps(a: YearActuals): KpiActual[] {
  return a.kpi.filter((k) => !k.input && !k.expected);
}

export type Timing = "need" | "target" | "now" | "past" | "none";
export const TIMING_LABEL: Record<Timing, string> = { need: "확인 필요", target: "목표·예상", now: "올해 실적", past: "전년 이전", none: "시점 없음" };

const TIME_RE = /[’'](\d{2})(?![\d])|20(\d{2})(?=년|\.)|올해|금년/;

/**
 * 수치 한 칸의 시점 가르기. 먼저 시점 칸(note)의 첫 시점 표현을 보고, 없으면 칸 전체(head·뜻 줄)를 봅니다.
 * 자리표시가 있으면 「확인 필요」, 시점 바로 뒤(12자 안)에 목표·예상·계획이 붙으면 「목표·예상」.
 */
export function timingOf(parts: { note?: string; text: string }, year: number): Timing {
  const whole = `${parts.text} ${parts.note ?? ""}`;
  if (needsIn(whole).length) return "need";
  const yy = year % 100;
  for (const t of [parts.note ?? "", whole]) {
    const m = TIME_RE.exec(t);
    if (!m) continue;
    if (/목표|예상|계획|전망/.test(t.slice(m.index, m.index + m[0].length + 12))) return "target";
    const y = m[1] ?? m[2];
    if (!y) return "now"; // 올해·금년
    return Number(y) >= yy ? "now" : "past";
  }
  return /목표|예상/.test(whole) ? "target" : "none";
}

/** 올해 시점(’26·2026년·올해) 중 바로 뒤에 목표·예상이 붙지 않은 것이 있는가 */
function mentionsNow(line: string, year: number): boolean {
  const yy = String(year % 100).padStart(2, "0");
  const re = new RegExp(`[’']${yy}(?!\\d)|${year}(?=년|\\.)|올해|금년`, "g");
  return [...line.matchAll(re)].some((m) => !/목표|예상|계획|전망/.test(line.slice(m.index, m.index + m[0].length + 12)));
}

/** 전년 이전 시점(’25·2024년 등)과 수치가 함께 든 줄 */
const pastFigure = (line: string, year: number) => hasFigure(line) && [...line.matchAll(/[’'](\d{2})(?!\d)|20(\d{2})(?=년|\.)/g)].some((m) => Number(m[1] ?? m[2]) < year % 100);

/** 추진성과 한 줄이 예상·목표만 말하는가(올해 실적 시점·자리표시 없이) */
export const planOnly = (line: string, year: number) => /예상|목표|계획|전망/.test(line) && !needsIn(line).length && !mentionsNow(line, year);

/**
 * 핵심 수치 띠 칸 중 올해 실적 칸 — 큰 수치(head)에 숫자가 있고, 자리표시(【확인…)가 없고, head·뜻 줄·시점(note)에 목표·계획·예상·전망 표시가 없고,
 * 시점이 올해(timingOf "now")인 칸. 주요사업은 이것이 2개 미만인 수치 띠를 뺌(blocks.ts cleanBlocks statsYear, 2026-10-15 블라인드 심사 「띠가 ’25 실적·’26 목표·자리표시뿐」)
 */
export function actualStatCells<T extends { head: string; bullets: string[]; note: string }>(cells: T[], year: number): T[] {
  return cells.filter((c) => {
    const all = [c.head, c.note, ...c.bullets].join(" ");
    return /\d/.test(c.head) && !/【확인/.test(all) && !PLAN_BAR.test(all) && timingOf({ note: c.note, text: `${c.head} ${c.bullets.join(" ")}` }, year) === "now";
  });
}

/** 주요사업 수치 띠에 있어야 하는 올해 실적 칸 수(막대의 실적 값 2개와 같은 기준) */
export const STATS_ACTUAL_MIN = 2;

/**
 * 올해 실적 재료의 수치(도식 후보 「핵심 수치 띠」 신호 — 주요사업): 월별 실적 줄의 단위 수치(날짜·시점 빼고, 바로 앞에 목표·계획·예상·전망이 붙은 값 빼고)
 * + 부서가 넣은 올해 계량 실적. 중복 없이
 */
export function yearFigures(a: YearActuals): string[] {
  const out: string[] = a.monthly.flatMap((m) => actualFigures(m.line));
  for (const k of a.kpi) if (/\d/.test(k.input)) out.push(`${k.input}${k.unit}`);
  return [...new Set(out)];
}

/** 줄의 단위 수치 중 날짜·시점을 빼고 바로 앞(8자 안)에 목표·계획·예상·전망이 붙지 않은 것(빈칸 걷은 모양) */
export function actualFigures(text: string): string[] {
  const line = text.replace(DATE_RE, " ");
  const out: string[] = [];
  for (const x of line.matchAll(new RegExp(FIGURE_RE.source, "g"))) if (!PLAN_BAR.test(line.slice(Math.max(0, x.index - 8), x.index))) out.push(x[0].replace(/\s+/g, ""));
  return out;
}

/** 자리표시 상한(한 소항목) — 평가 논점에 꼭 필요한 수치에만 */
export const NEEDS_MAX = 4;

/**
 * 초안의 올해 실적 문제(결정론) — 교정 요청과 초안 경고에 같은 문장으로 씀.
 * ① 핵심 수치 띠 칸의 시점 없음 ② 수치 띠에 올해 실적·자리표시 칸이 하나도 없음 ③ 추진성과가 모두 예상·목표 ④ 자리표시가 상한을 넘음.
 * opts.biz(주요사업): ②는 올해 실적 칸(actualStatCells)이 2개 미만일 때 자리표시로 채우라고 하지 않고 수치 띠를 빼고 다른 도식으로 바꾸라고 함 —
 * 경영관리는 수치 띠가 절을 닫는 추진성과인 경우가 많아 예전 문구 그대로
 */
export function yearIssues(blocks: Array<{ kind: string; cells: Array<{ head: string; bullets: string[]; note: string }> }>, results: string[], allText: string, year: number, needsMax: number = NEEDS_MAX, opts: { biz?: boolean } = {}): string[] {
  const out: string[] = [];
  const yy = String(year % 100).padStart(2, "0");
  for (const b of blocks.filter((x) => x.kind === "stats")) {
    const cells = b.cells.map((c) => ({ head: c.head, timing: timingOf({ note: c.note, text: `${c.head} ${c.bullets.join(" ")}` }, year) }));
    const bare = cells.filter((c) => c.timing === "none");
    if (bare.length) out.push(`핵심 수치 띠: 시점이 없는 칸 ${bare.length}개(${bare.map((c) => c.head).join("·")}) — 칸 note에 그 수치의 시점(예: ’${yy}.8 기준·’${Number(yy) - 1}년·’${yy}년 목표)을 적습니다.`);
    if (opts.biz) {
      const actual = actualStatCells(b.cells, year).length;
      if (actual < STATS_ACTUAL_MIN) out.push(`핵심 수치 띠에 올해(’${yy}년) 실적 칸이 ${actual}개뿐입니다(${cells.map((c) => `${c.head} ${TIMING_LABEL[c.timing]}`).join("·")}) — 올해 실적 값이 ${STATS_ACTUAL_MIN}개 이상 없으면 수치 띠를 빼고 다른 도식으로 바꿉니다(목표·예상·전년 값·자리표시로 칸을 채우지 않음).`);
    } else if (!cells.some((c) => c.timing === "now" || c.timing === "need")) out.push(`핵심 수치 띠에 올해(’${yy}년) 실적 칸이 없습니다(${cells.map((c) => `${c.head} ${TIMING_LABEL[c.timing]}`).join("·")}) — 한 칸 이상을 「올해 실적 재료」의 값으로, 없으면 【확인: …】 자리표시로 바꿉니다.`);
  }
  if (results.length && !results.some((r) => mentionsNow(r, year) || needsIn(r).length) && results.some((r) => planOnly(r, year) || pastFigure(r, year)))
    out.push(`추진성과에 올해(’${yy}년) 실적이 없습니다(예상·목표·전년 값뿐이거나 시점이 없음) — 올해 실적은 시점(’${yy}.8 등)과 함께 쓰고, 값이 없으면 【확인: …】 자리표시에 목표를 괄호로 함께 씁니다(예: …【확인: ’${yy}년 누적 건수】 달성(목표 N건)).`);
  const needs = needsIn(allText);
  // needsMax: 경영관리 초안은 절마다 2개(report-draft-mg/inputs.md — 절이 여럿이라 소항목 하나의 4개보다 큼)
  if (needs.length > needsMax) out.push(`자리표시가 ${needs.length}개입니다 — 평가 논점에 꼭 필요한 수치 ${needsMax}개까지만 남깁니다.`);
  return out;
}
