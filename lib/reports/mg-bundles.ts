// 경영관리 경평 초안 「수치 묶음 재료」 판정(순수, 2026-10-29 스타일 규칙 S2 — docs/plan/경평초안-스타일-메타프롬프트.md).
// 사용자가 고른 기준 작성본은 같은 설정의 다른 생성보다 근거 수치를 담은 데이터 블록(수치 표·막대 표)이 많았고(2개 대 1개) 쪽당 수량 토큰이 25 대 16이었음.
// 근거에 「같은 단위 값 3개 이상」이 묶인 곳(카드 계량지표 행·월별 실적 줄·이 카드에 연결된 공통 지식 조각의 표 행·재료 하나의 글·원문 구절 — 실사 답변 표 행·첨부 표 행을 옮긴 재료 포함)을 코드가 찾아
// 구성안 요청에 후보로 알리고(mg-outline.ts mgBundlePrompt), 구성안 점검이 그 재료를 맡은 절에 데이터 블록이 없으면 알림(mg-outline.ts mgBundleIssues — 참고 경고).
// 값 셈은 반복 수치 점검과 같은 열쇠(repeat-figures.ts figureKeys — 값 + 단위, 날짜·자리표시 안·흔한 값(0·100%·한 자리 개수) 뺌)라 표본 카드·글로 가르는 분기가 없음.

import type { LooseJson as Json } from "../loose-json.ts";
import { type YearActuals, yearActuals } from "./actuals.ts";
import { type RichCell, parseChunkBlocks } from "../knowledge/rich-text.ts";
import { figureKeys, UNITS } from "./repeat-figures.ts";

/**
 * 수치 묶음의 최소 값 수(같은 단위, 서로 다른 값). 3 = 스타일 규칙 S2 「같은 단위 값 3개 이상」 — 값 둘은 전후 한 쌍(문장 안 「A → B」나 막대 둘)으로 충분하고,
 * 셋부터 행·열이 있는 표·막대 묶음이 문장보다 읽기 쉬움(경영관리 표 머리 줄 틀 「성과지표 | ’25년 | ’26년 | 전년대비」가 한 행에 값 셋 — report-draft-mg/blocks.md)
 */
export const BUNDLE_MIN = 3;

/** 수치 묶음 하나: 가장 많은 같은 단위와 그 값(처음 쓴 모양, 나온 순) */
export interface FigureBundle {
  unit: string;
  values: string[];
}

/** 수치 열쇠(값 쉼표 뺌 + 단위) → 단위 */
const unitOf = (key: string) => key.replace(/^\d+(?:\.\d+)?/, "");

/** 글 → 수치 묶음(같은 단위의 서로 다른 값이 BUNDLE_MIN개 이상인 단위 중 값이 가장 많은 것 — 같으면 먼저 나온 단위). 없으면 null */
export function figureBundle(texts: readonly string[]): FigureBundle | null {
  const by = new Map<string, string[]>();
  for (const [key, shown] of figureKeys(texts.join("\n"))) {
    const u = unitOf(key);
    by.set(u, [...(by.get(u) ?? []), shown]);
  }
  let best: FigureBundle | null = null;
  for (const [unit, values] of by) if (values.length >= BUNDLE_MIN && values.length > (best?.values.length ?? 0)) best = { unit, values };
  return best;
}

/** 구성안 재료 하나가 수치 묶음인가(글 + 원문 구절 — 표 행을 옮긴 재료). 자료 필요 재료는 아님 */
export function materialBundle(m: { kind: string; text: string; quote: string }): FigureBundle | null {
  return m.kind === "need" ? null : figureBundle([m.text, m.quote]);
}

/** 수치 묶음 후보(구성안 요청 「수치 묶음 재료」) — 어디서 찾았는지(카드 계량지표·월별 실적·연결된 공통 지식 조각의 표), 묶음, 그 단위 값이 든 줄 */
export interface MgBundle extends FigureBundle {
  from: "kpi" | "monthly" | "linked";
  lines: string[];
  /** 연결 조각 표 묶음만: 조각 키·이름(제목 앞 두 마디)·표 머리(열 머리 글) */
  ref?: { key: string; name: string; head: string };
}

/** 칸 값이 맨 숫자면 지표 단위를 붙임(「46」 + 「건」 → 「46건」), 이미 단위가 붙었거나 숫자가 아니면 그대로 */
const withUnit = (v: string, unit: string) => (/^[\d,]+(?:\.\d+)?$/.test(v) ? `${v}${unit}` : v);

/** 줄 중 그 단위 값이 든 것만 */
const linesWith = (lines: string[], unit: string) => lines.filter((l) => [...figureKeys(l).keys()].some((k) => unitOf(k) === unit));

/**
 * 카드 원장의 수치 묶음 후보(결정론): ① 계량지표 표(kpi.rows — 행마다 ’25 실적·’26 목표·예상·부서 입력 값, 지표 이름은 셈하지 않음) 전체에서 같은 단위 값 BUNDLE_MIN개 이상
 * ② 월별 실적의 수치 줄(표 칸 포함 — actuals.ts yearActuals wide, 추진성과 보강 mg-close.ts ledgerOutcomeItems와 같은 줄) 전체에서 같은 단위 값 BUNDLE_MIN개 이상.
 * actuals = 요청에 준 올해 실적 재료(부서 계량 실적 입력 포함, 없으면 카드만으로 셈)
 */
export function cardBundles(card: Json, actuals?: YearActuals): MgBundle[] {
  const a = actuals ?? yearActuals(card, {}, "", { wide: true });
  const out: MgBundle[] = [];
  const rows = a.kpi.map((k) => ({ name: k.name, values: [k.prev, k.target, k.expected, k.input].filter(Boolean).map((v) => withUnit(v, k.unit)).join(" · ") })).filter((r) => r.values);
  const kpi = figureBundle(rows.map((r) => r.values));
  if (kpi) out.push({ from: "kpi", ...kpi, lines: rows.filter((r) => linesWith([r.values], kpi.unit).length).map((r) => `${r.name}: ${r.values}`) });
  const monthly = a.monthly.map((m) => m.line);
  const mb = figureBundle(monthly);
  if (mb) out.push({ from: "monthly", ...mb, lines: linesWith(monthly, mb.unit) });
  return out;
}

// ---------------------------------------------------------------------------
// 연결된 공통 지식 조각의 표(2026-10-29 S2 보강): 이 카드에 연결된 조각(lib/knowledge/bundle.ts relevantRefs — 경평 초안 숫자 근거 draftEvidence linked와 같은 범위)만 봄.
// 지표 하나의 실사 답변 전체는 수십~백여 쪽이라 다른 카드의 표가 섞이지만, 연결된 조각만 보면 이 과제의 표뿐임. 연결 안 된 조각으로 넓히지 않음.

const UNIT_ALT = UNITS.join("|");
/** 표 값 칸 = 칸 글 전체가 값 하나(맨 숫자 또는 숫자 + 단위 — 「90」「90점」「1,234건」「12.5%」). 글 속 숫자(「① 10대 이하」·「46건(전년 40건)」)는 값 칸이 아님 — 설문 문항의 보기 같은 글 칸이 묶음으로 잡히지 않게 */
const VALUE_CELL = new RegExp(String.raw`^[\d,]+(?:\.\d+)?\s?(?:${UNIT_ALT})?$`);
/** 머리 글의 괄호 단위 — 「실적(건)」「(단위: 백만원)」 */
const HEAD_PAREN = new RegExp(String.raw`[(（]\s*(?:단위\s*[:：]?\s*)?(${UNIT_ALT})\s*[)）]`);
/**
 * 단위를 뜻하는 머리 낱말(괄호 단위가 없을 때) — 점수 이름(총점·배점·득점·평점·점수)·건수·인원(수)·횟수. 낱말 끝 글자만으로 고르지 않음
 * (「구분」의 분·「기관명」의 명·「인원」의 원처럼 단위와 같은 글자로 끝나는 머리가 흔함). 그 밖의 머리는 단위를 주지 않음(추측하지 않음)
 */
const HEAD_WORDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:총|배|득|평)점$|점수$/, "점"],
  [/건수$/, "건"],
  [/인원수?$/, "명"],
  [/횟수$/, "회"],
];

/** 표 머리 글(열 머리·행 머리 칸) → 그 열·행 맨 숫자의 단위(괄호 단위 먼저, 없으면 머리 낱말), 없으면 빈 글 */
export function headUnit(text: string): string {
  const p = HEAD_PAREN.exec(text);
  if (p) return p[1];
  for (const w of text.split(/[\s/･·,|]+/)) for (const [re, unit] of HEAD_WORDS) if (re.test(w)) return unit;
  return "";
}

/**
 * 표 하나(rich-text.ts parseChunkBlocks의 행·칸) → 표 머리(머리 행마다 칸 「 | 」, 행 사이 「 / 」)와 자료 행(행 줄 「칸 | 칸」, 값 칸만 이은 글). 머리 = 앞쪽의 머리 칸(th)이 있거나 숫자가 없는 행들(두 줄 머리 포함).
 * 병합 칸은 열 자리를 맞춰(colspan은 덮는 열 모두, rowspan은 아래 행의 그 열 자리) 값 칸이 맨 숫자면 그 열 머리의 단위를, 없으면 행 첫 칸(행 머리)의 단위를 붙임 — 계량지표의 「지표 단위 붙이기」와 같은 생각
 */
function readTable(rows: RichCell[][]): { head: string; rows: Array<{ line: string; values: string }> } {
  const heads: string[] = []; // 열마다 머리 글(위 머리 행부터 이음)
  const headRows: string[] = [];
  const below: number[] = []; // 열마다 위 행의 rowspan 칸이 더 차지하는 행 수
  const out: Array<{ line: string; values: string }> = [];
  let inHead = true;
  for (const row of rows) {
    if (inHead && !row.some((c) => c.head) && row.some((c) => /\d/.test(c.text))) inHead = false;
    const rowUnit = inHead ? "" : headUnit(row[0]?.text ?? "");
    const cells: string[] = [];
    const values: string[] = [];
    let col = 0;
    for (const cell of row) {
      while ((below[col] ?? 0) > 0) {
        below[col] -= 1;
        col += 1;
      }
      const cols = Array.from({ length: cell.colspan }, (_, i) => col + i);
      if (cell.rowspan > 1) for (const c of cols) below[c] = cell.rowspan - 1;
      const text = cell.text.replace(/\n/g, " / ").trim();
      if (inHead) {
        for (const c of cols) heads[c] = [heads[c], text].filter(Boolean).join(" ");
      } else if (VALUE_CELL.test(text)) {
        const v = withUnit(text, cols.map((c) => headUnit(heads[c] ?? "")).find(Boolean) || rowUnit);
        cells.push(v);
        values.push(v);
      } else if (text) cells.push(text);
      col += cell.colspan;
    }
    for (let c = col; c < below.length; c++) if (below[c] > 0) below[c] -= 1;
    if (inHead) headRows.push(row.map((c) => c.text.replace(/\n/g, " / ").trim()).filter(Boolean).join(" | "));
    else if (cells.length) out.push({ line: cells.join(" | "), values: values.join(" · ") });
  }
  return { head: headRows.filter(Boolean).join(" / "), rows: out };
}

/**
 * 연결 조각 묶음 줄·표 머리 글자 상한 — 목록은 후보를 알리는 짧은 표지이고 표 전체는 같은 요청의 공통 지식(③ 이 평가단위)에 있음.
 * 값 칸 몇 개 + 이름 칸이면 120자 안에 들고, 넘는 것은 설명 글 칸(묶음 값이 아님)
 */
const LINKED_LINE_MAX = 120;
const LINKED_HEAD_MAX = 80;
const clip = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * 연결된 공통 지식 조각 표의 수치 묶음 후보(결정론): 조각마다 표(HTML·마크다운 파이프 표)를 행 단위로 읽어(readTable) 표 하나의 값 칸 전체에서 같은 단위 값 BUNDLE_MIN개 이상이면
 * 그 단위 값이 든 행만 줄로. refs = 이 카드에 연결된 조각(relevantRefs(kb)), 나온 순(조각 순 → 표 순). 단위·값이 같은 묶음은 처음 것만(실사 질문 답과 요청 자료가 같은 표를 되풀이해 싣는 일이 흔함)
 */
export function linkedBundles(refs: ReadonlyArray<{ key: string; title: string; text: string }>): MgBundle[] {
  const out: MgBundle[] = [];
  const seen = new Set<string>();
  for (const r of refs) {
    for (const b of parseChunkBlocks(r.text)) {
      if (b.kind !== "table") continue;
      const t = readTable(b.rows);
      const g = figureBundle(t.rows.map((x) => x.values));
      if (!g || seen.has(`${g.unit}:${g.values.join("·")}`)) continue;
      seen.add(`${g.unit}:${g.values.join("·")}`);
      const lines = t.rows.filter((x) => linesWith([x.values], g.unit).length).map((x) => clip(x.line, LINKED_LINE_MAX));
      out.push({ from: "linked", ...g, lines, ref: { key: r.key, name: r.title.split(" · ").slice(0, 2).join(" · "), head: clip(t.head, LINKED_HEAD_MAX) } });
    }
  }
  return out;
}
