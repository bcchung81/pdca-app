// 경영관리 경평 초안 「수치 묶음 재료」 판정(순수, 2026-10-29 스타일 규칙 S2 — docs/plan/경평초안-스타일-메타프롬프트.md).
// 사용자가 고른 기준 작성본은 같은 설정의 다른 생성보다 근거 수치를 담은 데이터 블록(수치 표·막대 표)이 많았고(2개 대 1개) 쪽당 수량 토큰이 25 대 16이었음.
// 근거에 「같은 단위 값 3개 이상」이 묶인 곳(카드 계량지표 행·월별 실적 줄·재료 하나의 글·원문 구절 — 실사 답변 표 행·첨부 표 행을 옮긴 재료 포함)을 코드가 찾아
// 구성안 요청에 후보로 알리고(mg-outline.ts mgBundlePrompt), 구성안 점검이 그 재료를 맡은 절에 데이터 블록이 없으면 알림(mg-outline.ts mgBundleIssues — 참고 경고).
// 값 셈은 반복 수치 점검과 같은 열쇠(repeat-figures.ts figureKeys — 값 + 단위, 날짜·자리표시 안·흔한 값(0·100%·한 자리 개수) 뺌)라 표본 카드·글로 가르는 분기가 없음.

import type { LooseJson as Json } from "../loose-json.ts";
import { type YearActuals, yearActuals } from "./actuals.ts";
import { figureKeys } from "./repeat-figures.ts";

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

/** 카드 원장에서 찾은 수치 묶음 후보(구성안 요청 「수치 묶음 재료」) — 어느 칸인지, 묶음, 그 단위 값이 든 줄 */
export interface MgBundle extends FigureBundle {
  from: "kpi" | "monthly";
  lines: string[];
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
