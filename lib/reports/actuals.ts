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
 * 카드(과제 원장) → 올해 실적 재료. 올해 계량 실적의 출처는 원장뿐 — 그 과제 첨부의 올해 값은 경평 요청의 첨부 블록에서 모델이 씀(2026-11-02 — 별도 입력 reports.inputs는 앱이 읽지 않음).
 * opts.wide(경영관리): 연도 언급이 없는 증감·「A → B」 성과 줄도 받아 「시점 미기재」 표지를 붙임(outcomeActualItems).
 * 계량지표는 원본 양식의 빈 자리표시("-") 행을 뺌(model.ts kpiRowsOf와 같은 규칙).
 */
export function yearActuals(card: Json, today = "", opts: { wide?: boolean } = {}): YearActuals {
  const rows: Json[] = Array.isArray(card?.kpi?.rows) ? card.kpi.rows : [];
  const kpi: KpiActual[] = rows
    .map((k) => ({ name: str(k?.name), unit: str(k?.unit), prev: str(k?.prev), target: str(k?.target), expected: str(k?.expected) }))
    .filter((k) => k.name && !/^[-–—·]+$/.test(k.name));
  const monthly: YearActuals["monthly"] = [];
  for (const m of Array.isArray(card?.do?.monthly) ? card.do.monthly : []) {
    for (const line of Array.isArray(m?.items) ? m.items : []) {
      if (typeof line === "string") {
        if (hasFigure(line)) monthly.push({ period: str(m?.period), line: line.trim() });
      } else if (opts.wide) for (const t of tableMonthlyLines(line)) monthly.push({ period: str(m?.period), line: t });
    }
  }
  const year = Number(/^(\d{4})-/.exec(today)?.[1] ?? 0);
  if (!year) return { today, kpi, monthly };
  // 카드 정량 성과 칸의 올해 실적(2026-10-27): 주요사업1/7-가처럼 칸에 「(’26년 목표 2.267일 → ’26년 성과 2.000일)」이 있는데 계량지표 줄이 「없음 → 【확인】」으로 알려
  // 초안이 카드에 있는 실적을 자리표시로 비웠음(블라인드 심사). 지표 이름 낱말이 절반 넘게 든 줄은 그 지표에 붙이고, 나머지는 따로 알림
  const keys = kpiKeyWords(kpi.map((k) => k.name));
  const outcome: string[] = [];
  for (const { line: raw, undated } of outcomeActualItems(card, year, Boolean(opts.wide))) {
    const line = undated ? `${raw} ${UNDATED_NOTE}` : raw;
    const i = kpi.findIndex((k, j) => !k.outcome && wordCover(keys[j], line) >= KPI_COVER_MIN);
    if (i >= 0) kpi[i].outcome = line;
    else outcome.push(line);
  }
  return { today, kpi, monthly, outcome };
}

const cellText = (c: Json) => (Array.isArray(c?.lines) ? c.lines.join(" ") : typeof c?.text === "string" ? c.text : "").trim();

/** 머리 칸의 시점 한 곳: 앞 「~」(선택)·따옴표(’·`·'·‘ 무엇이든)·연도 두 자리·월(1~12). 「2026.8」처럼 연도 앞에 숫자·점이 붙으면 시점이 아님 */
const PERIOD_RE = /(?<![\d.])([~∼]?)\s*[’'‘`]?(\d{2})\.(1[0-2]|0?[1-9])(?!\d)/;

/** 머리 칸 글에서 대괄호·백틱을 걷음(원문 링크 형식 「[`26.8.월](진행중)」) */
const stripHeadMarks = (head: string) => head.replace(/[\[\]`]/g, "").replace(/\s+/g, " ").trim();

/** 머리 칸 글의 시점 표기 「’YY.M」(앞 「~」는 유지, 예: 「~’26.7.월」 → 「~’26.7」). 시점이 없으면 null */
export function periodOf(head: string): string | null {
  const m = PERIOD_RE.exec(stripHeadMarks(head));
  return m ? `${m[1]}’${m[2]}.${Number(m[3])}` : null;
}

/** 머리 칸 글을 시점 표기로 정리: 시점이 있으면 「’YY.M」, 없으면 대괄호·백틱만 걷은 머리 글(진행 표지·「월」 꼬리는 시점과 함께 빠짐) */
export function periodLabel(head: string): string {
  return periodOf(head) ?? stripHeadMarks(head);
}

/** 칸 글 끝에 이미 괄호 시점(「(’26.8 기준)」·「(2026년 3월)」)이 있는가 — 있으면 머리 시점을 또 붙이지 않음 */
const TRAILING_PERIOD_RE = /\([^()]*(?:[’'‘`]\d{2}|20\d{2}\s*년?)(?:\.\d{1,2})?[^()]*\)\s*$/;

/**
 * 월별 실적의 표 항목(경영관리 — item.table.rows) → 열마다 「칸 글(’YY.M 기준)」 한 줄, 수치가 든 줄만.
 * 시점을 못 찾은 머리는 「머리 글 칸 글」로 둠. 칸 글 끝에 괄호 시점이 있으면 머리 시점을 겹쳐 붙이지 않음.
 * 데이터 칸 줄 앞에는 그 행의 이름(행 머리 th 또는 그 칸보다 앞에 있는 수치 없는 첫 칸 글)을 「행 이름 · 」으로 붙여 뜻이 서게 함(행 이름이 없으면 그대로).
 * 머리(th) 칸에 「예정」이 든 열은 계획이라 뺌. 열 위치는 colspan을 따라 셈(채점 도구 mg-para-score-core ledgerLines와 같은 규칙)
 */
function tableMonthlyLines(item: Json): string[] {
  const heads = new Map<number, string>();
  const planCols = new Set<number>();
  const out: string[] = [];
  for (const row of Array.isArray(item?.table?.rows) ? item.table.rows : []) {
    let col = 0;
    let rowName = ""; // 이 행에서 지금까지 본, 수치 없는 첫 칸 글(또는 행 머리 th) — 행의 이름
    for (const c of Array.isArray(row) ? row : []) {
      const span = Math.max(1, Number(c?.colspan) || 1);
      const text = cellText(c);
      if (c?.th) {
        if (!rowName && text) rowName = text;
        for (let k = 0; k < span; k++) {
          heads.set(col + k, text);
          if (/예정/.test(text)) planCols.add(col + k);
        }
      } else if (text && !planCols.has(col)) {
        const head = heads.get(col) ?? "";
        const period = periodOf(head);
        const line = period ? (TRAILING_PERIOD_RE.test(text) ? text : `${text}(${period} 기준)`) : [periodLabel(head), text].filter(Boolean).join(" ");
        if (hasFigure(line)) out.push(rowName ? `${rowName} · ${line}` : line);
        if (!rowName && !hasFigure(text)) rowName = text;
      }
      col += span;
    }
  }
  return out;
}

/** 글머리 기호로 시작하는 줄 = 새 항목(아니면 앞 줄에 이어 붙음 — 「∙ … 성과 달성(’26.8)」 다음 줄 「(’26년 목표 … → ’26년 성과 2.000일)」) */
const ITEM_HEAD = /^[∙·•\-－○◦▪□■◆※*]/;

/**
 * 카드 정량 성과 칸(outcome.quantitative)의 올해 실적 줄: 올해 시점(’26·2026년 — 바로 뒤가 목표·예상·계획·전망이 아닌 것)과 목표·계획 값이 아닌 단위 수치(actualFigures)와
 * 성과·실적·달성 낱말이 있고 예정·예상 줄이 아닌 것. 글머리 없이 이어지는 줄은 앞 항목에 붙여 한 줄로 봄. 따옴표 ‘26은 ’26으로 읽음.
 * 운영 102장 중 잡히는 것: 주요사업1/7-가(「’26년 성과 2.000일」). 「목표 100% 초과 달성」(3/6-가)·「목표(40%) 100% 달성」(경영관리3/3-3)은 값이 목표 쪽이라, 「00% 증가(’26.12 예정)」(2/8-가)는 예정이라 뺌
 */
export function outcomeActuals(card: Json, year: number): string[] {
  return outcomeActualItems(card, year, false).map((x) => x.line);
}

/** 연도 언급 없이 받은 성과 줄 뒤에 붙는 표지(요청 글·부서 확인 요청이 같은 글을 알아봄) */
export const UNDATED_NOTE = "(시점 미기재 — 부서 확인)";

/** 증감·달성 낱말(「배」는 숫자 바로 뒤일 때만 — 배포·배치 제외) 또는 「A → B」 */
const CHANGE_RE = /상승|증가|확대|달성|감소|단축|향상|\d\s*배|[^\s→]\s*(?:→|->)\s*\S/;
/** 연도·시점 언급(’26·2026년 등) */
const YEAR_RE = /[’']\d{2}(?!\d)|20\d{2}\s*(?:년|\.)/;

/**
 * outcomeActuals의 본체. wide(경영관리)이면 연도 언급이 없는 줄(올해 시점도 전년 시점도 없음)도 증감·달성 낱말이나 「A → B」와 단위 수치가 있고
 * 예정·예상·목표가 없으면 받아 undated 표지를 켬(원장 정량 성과 칸 값을 부서가 적은 성과로 쓰되 시점은 부서에 확인 — 2026-10-29)
 */
export function outcomeActualItems(card: Json, year: number, wide = false): Array<{ line: string; undated: boolean }> {
  const items: string[] = [];
  for (const raw of Array.isArray(card?.outcome?.quantitative) ? card.outcome.quantitative : []) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    const line = raw.trim().replace(/‘(?=\d{2})/g, "’");
    if (items.length && !ITEM_HEAD.test(line)) items[items.length - 1] += ` ${line}`;
    else items.push(line);
  }
  const strip = (l: string) => l.replace(new RegExp(`^${ITEM_HEAD.source.slice(1)}\\s*`), "");
  const out: Array<{ line: string; undated: boolean }> = [];
  for (const l of items) {
    if (mentionsNow(l, year) && actualFigures(l).length > 0 && /성과|실적|달성/.test(l) && !/예정|예상/.test(l)) out.push({ line: strip(l), undated: false });
    else if (wide && !YEAR_RE.test(l) && !/예정|예상|목표/.test(l) && CHANGE_RE.test(l) && hasFigure(l)) out.push({ line: strip(l), undated: true });
  }
  return out;
}

/** 시점 미기재로 받은 원장 성과 줄(경영관리 — 부서 자료 요청·채울 것 모음이 「기준 시점·출처 확인」으로 올림) */
export function undatedOutcomeLines(card: Json, year: number): string[] {
  return outcomeActualItems(card, year, true).filter((x) => x.undated).map((x) => x.line);
}

/** 계량지표 중 원장에 올해 실적이 없는 것(정량 성과 칸에 붙은 줄도 카드 예상 칸도 비었음) — 「채울 자료」 목록용 */
export function kpiGaps(a: YearActuals): KpiActual[] {
  return a.kpi.filter((k) => !k.outcome && !k.expected);
}

/**
 * 원장 줄(KpiActual.outcome)에서 그 지표의 올해 값 하나(원문 표기, 단위 포함) — 카드 밖 성과분석 표의 ’26 실적 칸·전후 비교·숫자 근거용.
 * 줄의 실적 수치(actualFigures — 목표·계획·예상·전망 바로 뒤가 아니고 날짜·시점이 아닌 것) 중 지표 단위가 맞는 것만 보고(단위가 비면 전부), 같은 값은 하나로 셉니다.
 * 정확히 하나일 때만 그 값, 시점 미기재 줄(UNDATED_NOTE)·값 여럿·없음이면 빈 글(사람이 원장 줄을 보고 고름). 예상 칸(expected)은 실적이 아니라서 보지 않음.
 * 단위 비교는 숫자 바로 뒤 원문이 지표 단위로 시작하는가로 함(FIGURE_RE는 「30억원」을 「30억」까지만 잡음) — 「%」 지표에 「%p」 값은 맞지 않음.
 * 지표 단위는 빈칸을 걷고 「/」·「(」 앞까지만 봄(「건/편」 → 「건」)
 */
export function ledgerFigure(k: KpiActual): string {
  if (!k.outcome || k.outcome.includes(UNDATED_NOTE)) return "";
  const unit = k.unit.replace(/\s+/g, "").split(/[/(]/)[0];
  const values = new Set<string>();
  for (const h of actualFigureHits(k.outcome)) {
    const tail = h.rest.replace(/^\d[\d,.]*\s*/, "");
    if (unit && !(tail.startsWith(unit) && !(unit.endsWith("%") && /^p/i.test(tail.slice(unit.length))))) continue;
    const num = /^\d[\d,.]*/.exec(h.rest)![0];
    values.add(unit ? num + unit : h.figure);
  }
  return values.size === 1 ? [...values][0] : "";
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
 * 시점이 올해(timingOf "now")인 칸. 주요사업은 이것이 2개 미만인 수치 띠를 뺐음(2026-10-15 블라인드 심사 「띠가 ’25 실적·’26 목표·자리표시뿐」 — 2026-10-28부터 새 초안은 띠를 모두 뺌,
 * 이 셈은 저장된 초안 다시 점검의 yearIssues에 남음)
 */
export function actualStatCells<T extends { head: string; bullets: string[]; note: string }>(cells: T[], year: number): T[] {
  return cells.filter((c) => {
    const all = [c.head, c.note, ...c.bullets].join(" ");
    return /\d/.test(c.head) && !/【확인/.test(all) && !PLAN_BAR.test(all) && timingOf({ note: c.note, text: `${c.head} ${c.bullets.join(" ")}` }, year) === "now";
  });
}

/** 주요사업 수치 띠에 있어야 하는 올해 실적 칸 수(막대의 실적 값 2개와 같은 기준) */
export const STATS_ACTUAL_MIN = 2;

/** 줄의 단위 수치 중 날짜·시점을 빼고 바로 앞(8자 안)에 목표·계획·예상·전망이 붙지 않은 것(빈칸 걷은 모양) */
export function actualFigures(text: string): string[] {
  return actualFigureHits(text).map((h) => h.figure);
}

/** actualFigures의 본체 — 수치(빈칸 걷은 모양)와 그 수치부터 줄 끝까지의 원문(날짜·시점을 걷은 줄 기준, ledgerFigure의 단위 비교용) */
function actualFigureHits(text: string): Array<{ figure: string; rest: string }> {
  const line = text.replace(DATE_RE, " ");
  const out: Array<{ figure: string; rest: string }> = [];
  for (const x of line.matchAll(new RegExp(FIGURE_RE.source, "g"))) if (!PLAN_BAR.test(line.slice(Math.max(0, x.index - 8), x.index))) out.push({ figure: x[0].replace(/\s+/g, ""), rest: line.slice(x.index) });
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
    } else if (!cells.some((c) => c.timing === "now" || c.timing === "need")) out.push(`핵심 수치 띠에 올해(’${yy}년) 실적 칸이 없습니다(${cells.map((c) => `${c.head} ${TIMING_LABEL[c.timing]}`).join("·")}) — 한 칸 이상을 「올해 실적 재료」나 수치를 근거로 쓰는 첨부(이 과제 카드 전용 자료·연결 확정한 보고서 추가자료)의 올해 값으로, 둘 다 없으면 【확인: …】 자리표시로 바꿉니다.`);
  }
  if (results.length && !results.some((r) => mentionsNow(r, year) || needsIn(r).length) && results.some((r) => planOnly(r, year) || pastFigure(r, year)))
    out.push(`추진성과에 올해(’${yy}년) 실적이 없습니다(예상·목표·전년 값뿐이거나 시점이 없음) — 올해 실적은 시점(’${yy}.8 등)과 함께 쓰고, 값이 없으면 【확인: …】 자리표시에 목표를 괄호로 함께 씁니다(예: …【확인: ’${yy}년 누적 건수】 달성(목표 N건)).`);
  const needs = needsIn(allText);
  // needsMax: 경영관리 초안은 절마다 2개(report-draft-mg/inputs.md — 절이 여럿이라 소항목 하나의 4개보다 큼)
  if (needs.length > needsMax) out.push(`자리표시가 ${needs.length}개입니다 — 평가 논점에 꼭 필요한 수치 ${needsMax}개까지만 남깁니다.`);
  return out;
}
