// 경평 초안 「같은 수치 반복」 결정론 점검(순수, 2026-10-27 품질 측정 후속).
// 기준선 8건(주요사업 5·경영관리 3) 블라인드 심사가 「같은 산출 수치(1,922곳·4,780곳)를 개선 경과·추진내용·수치 띠·표·추진성과에 4~5번 되풀이」처럼
// 한 수치를 여러 블록에 반복해 판면을 낭비한다고 4건 짚음. 이 모듈은 값+단위로 정규화한 수치가 서로 다른 블록 몇 개에 나오는지 세어 경고 한 줄만 만든다 —
// 글을 고치지 않고, 자동 고치기 사유·점수에도 넣지 않는다(경고 앞머리 「반복 수치」 = 참고).
// 셈 단위: 주요사업 = 블록 하나씩 + 추진성과 상자(줄·3칸·막대·강조 띠) 하나 — 서로 다른 블록 3개 이상이면 경고.
// 경영관리 = 카드 초안 전체의 블록 — 블록 3개 이상이거나 서로 다른 절 2개 이상이면 경고. 기준선 경영관리 3건의 심사 지적(TF 31명·포상 12→22명·교육 20→25명·12명)은
// 모두 두 절에 한 번씩 나온 반복이라 「블록 3개」만으로는 하나도 안 잡혔음(절 2개 규칙: 지적 3건 모두 + 뜻이 다른 5% 한 건).

import { blockTexts } from "./blocks.ts";
import { stripNeeds } from "./actuals.ts";
import { plainText } from "./fit.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 같은 수치가 이 수 이상의 서로 다른 블록에 나오면 경고 */
export const REPEAT_MIN_BLOCKS = 3;

/** 수치 단위(긴 것 먼저) — 단위 없는 맨 숫자는 세지 않음(표 칸 번호·순번·산식 숫자가 섞임) */
const UNITS = ["백만원", "억원", "만원", "천원", "만건", "만명", "만회", "만국", "시간", "개소", "개사", "%p", "MHz", "GHz", "㎒", "kW", "km", "%", "건", "명", "곳", "개", "국", "종", "억", "만", "천", "회", "점", "원", "배", "초", "분", "일", "톤", "호", "대"];
const UNIT_SRC = UNITS.join("|");
const NUM_SRC = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?`;
/** 값 + 단위(뒤에 한글이 바로 붙어도 됨 — 「1,922곳을」). 앞이 숫자·점·작은따옴표(’26)면 아님 */
const FIGURE_RE = new RegExp(String.raw`(?<![\d.,’'‘])(${NUM_SRC})\s?(${UNIT_SRC})(?![A-Za-z])`, "g");
/** 「12 → 22명」처럼 화살표 앞 맨 숫자는 뒤 값의 단위를 받음 */
const ARROW_RE = new RegExp(String.raw`(?<![\d.,’'‘])(${NUM_SRC})(\s?(?:→|⇒|->)\s?)(?=(?:${NUM_SRC})\s?(${UNIT_SRC}))`, "g");
/** 날짜·시점(’26.8·7.6.·(6.23.)) — actuals.ts DATE_RE와 같은 모양 */
const DATE_RE = /[’'‘]\d{2}(?:\.\d{1,2}){0,2}\.?|\(\s*\d{1,2}\.\s?\d{1,2}\.?\s*\)|\b\d{1,2}\.\s?\d{1,2}\.(?!\d)/g;

/**
 * 흔한 값이라 반복을 세지 않는 수치: 0(무재해 0건·0명), 100%(준수율·달성률), 한 자리 개수(3명·7건·5대 — 구성 설명·작은 건수에 흔함, %·점·배·억은 셈).
 * 기준선 8건에서 이 셋을 빼지 않으면 5대·100%·0명·3명·7건이 더 잡혔고 심사가 짚은 반복은 하나도 없었음
 */
function common(value: string, unit: string): boolean {
  const n = Number(value.replace(/,/g, ""));
  if (n === 0) return true;
  if (unit === "%" && n === 100) return true;
  if (/^\d$/.test(value) && !["%", "%p", "억", "억원", "점", "배"].includes(unit)) return true;
  return false;
}

/** 글 → 수치 열쇠(값 쉼표 뺌 + 단위) → 처음 쓴 모양. 자리표시 【확인: …】 안·날짜는 뺌 */
export function figureKeys(text: string): Map<string, string> {
  const out = new Map<string, string>();
  const t = plainText(stripNeeds(text)).replace(DATE_RE, " ").replace(ARROW_RE, (_m, num: string, arrow: string, unit: string) => `${num}${unit}${arrow}`);
  for (const m of t.matchAll(FIGURE_RE)) {
    const [, value, unit] = m;
    if (common(value, unit)) continue;
    const key = `${value.replace(/,/g, "")}${unit}`;
    if (!out.has(key)) out.set(key, `${value}${unit}`);
  }
  return out;
}

/** 경영관리: 같은 수치가 서로 다른 절 이 수 이상에 나오면 경고(블록 수와 별개) */
export const REPEAT_MIN_PARTS = 2;

/** 셈 단위 하나 — group = 경영관리 절 열쇠(주요사업은 단위마다 다른 값) */
export interface FigureUnit {
  group: string;
  texts: string[];
}

/** 단위마다 수치를 세어 [모양, 블록 수, 절(묶음) 수] — 블록 수 minBlocks 이상이거나 묶음 수 minGroups 이상인 것만, 블록 수 많은 순 */
export function repeatedFigures(units: FigureUnit[], minBlocks = REPEAT_MIN_BLOCKS, minGroups = Infinity): Array<[string, number, number]> {
  const seen = new Map<string, { shown: string; n: number; groups: Set<string> }>();
  for (const u of units) {
    for (const [key, shown] of figureKeys(u.texts.join("\n"))) {
      const x = seen.get(key) ?? { shown, n: 0, groups: new Set<string>() };
      x.n += 1;
      x.groups.add(u.group);
      seen.set(key, x);
    }
  }
  return [...seen.values()]
    .filter((x) => x.n >= minBlocks || x.groups.size >= minGroups)
    .sort((a, b) => b.n - a.n)
    .map((x) => [x.shown, x.n, x.groups.size]);
}

/** 초안의 셈 단위: 블록마다 글(경영관리는 절 열쇠를 묶음으로) + (주요사업) 추진성과 상자 하나 */
export function figureUnits(spec: ReportSectionSpec): FigureUnit[] {
  const at = spec.mg?.at;
  const units: FigureUnit[] = (spec.blocks ?? []).map((b, i) => ({ group: at ? (at[i] ?? "") : `b${i}`, texts: blockTexts(b) }));
  const box = [...spec.results, ...(spec.resultCards ?? []).flatMap((c) => [c.tag, c.headline, c.figure]), ...(spec.resultChart ? [spec.resultChart.title, ...spec.resultChart.series.map((s) => `${s.label} ${s.value}`), spec.resultChart.badge] : []), spec.resultBand ?? ""].filter(Boolean);
  if (box.length) units.push({ group: "results", texts: box });
  return units;
}

/** 경고 한 줄(참고 — warning-levels.ts 「반복 수치」). 반복이 없으면 null. 수치 4개까지 보임 */
export function figureRepeatWarning(spec: ReportSectionSpec): string | null {
  const mg = Boolean(spec.mg);
  const hits = repeatedFigures(figureUnits(spec), REPEAT_MIN_BLOCKS, mg ? REPEAT_MIN_PARTS : Infinity);
  if (!hits.length) return null;
  const shown = hits.slice(0, 4).map(([f, n, g]) => `${f}(블록 ${n}개${mg ? `·절 ${g}개` : ""})`);
  const more = hits.length > 4 ? ` 외 ${hits.length - 4}개` : "";
  return `반복 수치: ${shown.join("·")}${more} — 같은 수치를 여러 블록에 되풀이함 — 한 블록에만 두고 남는 자리에는 다른 실적·효과를`;
}
