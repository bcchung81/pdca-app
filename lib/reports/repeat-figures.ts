// 경평 초안 「같은 수치 반복」 결정론 점검(순수, 2026-10-27 품질 측정 후속).
// 기준선 8건(주요사업 5·경영관리 3) 블라인드 심사가 「같은 산출 수치(1,922곳·4,780곳)를 개선 경과·추진내용·수치 띠·표·추진성과에 4~5번 되풀이」처럼
// 한 수치를 여러 블록에 반복해 판면을 낭비한다고 4건 짚음. 이 모듈은 값+단위로 정규화한 수치가 서로 다른 블록 몇 개에 나오는지 세어 경고 한 줄만 만든다 —
// 글을 고치지 않고, 자동 고치기 사유·점수에도 넣지 않는다(경고 앞머리 「반복 수치」 = 참고).
// 셈 단위: 주요사업 = 블록 하나씩 + 추진성과 상자(줄·3칸·막대·강조 띠) 하나 — 서로 다른 블록 3개 이상이면 경고.
// 경영관리 = 카드 초안 전체의 블록 — 블록 3개 이상이거나 서로 다른 절 2개 이상이면 경고. 기준선 경영관리 3건의 심사 지적(TF 31명·포상 12→22명·교육 20→25명·12명)은
// 모두 두 절에 한 번씩 나온 반복이라 「블록 3개」만으로는 하나도 안 잡혔음(절 2개 규칙: 지적 3건 모두 + 뜻이 다른 5% 한 건).
// 2026-10-29 「되풀이되는 구간 하이라이트」: 경고와 같은 기준의 반복 수치 열쇠(repeatMarks)와 글 속 수치 자리(figureSpans), 서로 다른 블록의 같은 문장
// (textSimilarity ≥ SAME_TEXT_MIN — 사업 조판의 같은 문장 규칙)을 화면 렌더러(section-html.ts k-rep)에 넘김. 경고 「반복 문장」도 참고.

import { type Block, blockTexts } from "./blocks.ts";
import { NEED_RE, stripNeeds } from "./actuals.ts";
import { SUP_RE, plainText } from "./fit.ts";
import { bigramSet, textSimilarity } from "./ground.ts";
import { SAME_TEXT_MIN, SAME_TEXT_MIN_BIGRAMS } from "./same-text.ts";
import type { ReportSectionSpec } from "./section.ts";

/** 같은 수치가 이 수 이상의 서로 다른 블록에 나오면 경고 */
export const REPEAT_MIN_BLOCKS = 3;

/** 수치 단위(긴 것 먼저) — 단위 없는 맨 숫자는 세지 않음(표 칸 번호·순번·산식 숫자가 섞임) */
export const UNITS = ["백만원", "억원", "만원", "천원", "만건", "만명", "만회", "만국", "시간", "개소", "개사", "%p", "MHz", "GHz", "㎒", "kW", "km", "%", "건", "명", "곳", "개", "국", "종", "억", "만", "천", "회", "점", "원", "배", "초", "분", "일", "톤", "호", "대"];
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

/** 단위마다 수치를 세어 기준을 넘은 것만(열쇠·모양·블록 수·묶음 수), 블록 수 많은 순 */
function repeatedEntries(units: FigureUnit[], minBlocks: number, minGroups: number) {
  const seen = new Map<string, { key: string; shown: string; n: number; groups: Set<string> }>();
  for (const u of units) {
    for (const [key, shown] of figureKeys(u.texts.join("\n"))) {
      const x = seen.get(key) ?? { key, shown, n: 0, groups: new Set<string>() };
      x.n += 1;
      x.groups.add(u.group);
      seen.set(key, x);
    }
  }
  return [...seen.values()].filter((x) => x.n >= minBlocks || x.groups.size >= minGroups).sort((a, b) => b.n - a.n);
}

/** 단위마다 수치를 세어 [모양, 블록 수, 절(묶음) 수] — 블록 수 minBlocks 이상이거나 묶음 수 minGroups 이상인 것만, 블록 수 많은 순 */
export function repeatedFigures(units: FigureUnit[], minBlocks = REPEAT_MIN_BLOCKS, minGroups = Infinity): Array<[string, number, number]> {
  return repeatedEntries(units, minBlocks, minGroups).map((x) => [x.shown, x.n, x.groups.size]);
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

// ───────────────────────── 화면 표시(2026-10-29 「되풀이되는 구간 하이라이트」)

/** 글 → 표기를 걷은 글 + 글자마다 원래 자리. re에 맞은 조각은 빼고, keep이 돌려준 [시작, 끝)만 남김(위첨자 ^{…}의 안 글) */
function cut(s: string, at: number[], re: RegExp, keep?: (m: RegExpMatchArray) => [number, number]): [string, number[]] {
  let out = "";
  const map: number[] = [];
  let last = 0;
  const take = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      out += s[i];
      map.push(at[i]);
    }
  };
  for (const m of s.matchAll(re)) {
    take(last, m.index);
    if (keep) {
      const [a, b] = keep(m);
      take(m.index + a, m.index + b);
    }
    last = m.index + m[0].length;
  }
  take(last, s.length);
  return [out, map];
}

/**
 * 원래 글(**강조**·^{위첨자}·【확인】 표기가 섞인 글)에서 수치 자리 [시작, 끝)와 열쇠 — figureKeys와 같은 규칙(자리표시 안·날짜·흔한 값 뺌,
 * 화살표 앞 맨 숫자는 뒤 단위를 받아 그 숫자만). 표기를 사이에 낀 수치(「**12**명」)는 원래 글에서 이어지지 않아 자리를 내지 않음(감싸면 태그가 엇갈림)
 */
export function figureSpans(text: string): Array<{ start: number; end: number; key: string }> {
  const s = String(text ?? "");
  let [t, at] = cut(s, Array.from({ length: s.length }, (_, i) => i), NEED_RE);
  [t, at] = cut(t, at, /\*\*/g);
  [t, at] = cut(t, at, SUP_RE, (m) => [2, 2 + m[1].length]);
  t = t.replace(DATE_RE, (d) => " ".repeat(d.length));
  const hits: Array<{ from: number; to: number; key: string }> = [];
  for (const m of t.matchAll(ARROW_RE)) {
    const [, value, , unit] = m;
    if (!common(value, unit)) hits.push({ from: m.index, to: m.index + value.length, key: `${value.replace(/,/g, "")}${unit}` });
  }
  for (const m of t.matchAll(FIGURE_RE)) {
    const [, value, unit] = m;
    if (!common(value, unit)) hits.push({ from: m.index, to: m.index + m[0].length, key: `${value.replace(/,/g, "")}${unit}` });
  }
  return hits
    .filter((h) => at[h.to - 1] - at[h.from] === h.to - 1 - h.from)
    .map((h) => ({ start: at[h.from], end: at[h.to - 1] + 1, key: h.key }))
    .sort((a, b) => a.start - b.start);
}

/** 반복 문장을 세는 글(불릿·칸 글·전후 비교 줄·블록 본문) — 라벨·제목·칸 머리·막대 값은 뺌 */
const sentenceTexts = (b: Block) => [b.text, ...b.items, ...b.cells.flatMap((c) => [...c.bullets, c.note]), ...b.rows.flatMap((r) => [...r.before, ...r.after])].filter(Boolean);

/** 셈 단위(블록 = spec.blocks 순번, 추진성과 상자 = -1)와 화면·경고에 쓰는 이름. 경영관리는 절 표지를 앞에(「나. 추진내용」) */
function sentenceUnits(spec: ReportSectionSpec): Array<{ at: number; name: string; texts: string[] }> {
  const parts = new Map((spec.mg?.parts ?? []).map((p) => [p.key, p]));
  const units = (spec.blocks ?? []).map((b, i) => {
    const base = plainText(b.label || b.title).trim() || `블록 ${i + 1}`;
    const mark = parts.get(spec.mg?.at[i] ?? "")?.mark;
    return { at: i, name: mark ? `${mark}. ${base}` : base, texts: sentenceTexts(b) };
  });
  const box = [...spec.results, ...(spec.resultCards ?? []).flatMap((c) => [c.headline, c.figure]), spec.resultBand ?? ""].filter(Boolean);
  if (box.length) units.push({ at: -1, name: "추진성과", texts: box });
  return units;
}

/** 서로 다른 블록의 같은 문장 쌍(닮음 textSimilarity ≥ SAME_TEXT_MIN, 양쪽 다 글자 두 개 묶음 SAME_TEXT_MIN_BIGRAMS 이상 — 사업 조판 같은 문장과 같은 규칙). 닮음 큰 순 */
export function repeatedSentences(spec: ReportSectionSpec): Array<{ a: { at: number; name: string; text: string }; b: { at: number; name: string; text: string }; score: number }> {
  // 한 블록 안에 같은 글이 두 번 있어도 한 번만(같은 쌍이 겹쳐 나오지 않게)
  const sents = sentenceUnits(spec).flatMap((u) => [...new Set(u.texts)].map((text) => ({ at: u.at, name: u.name, text, size: bigramSet(plainText(stripNeeds(text))).size })).filter((x) => x.size >= SAME_TEXT_MIN_BIGRAMS));
  const out: ReturnType<typeof repeatedSentences> = [];
  for (let x = 0; x < sents.length; x++) {
    for (let y = x + 1; y < sents.length; y++) {
      const [a, b] = [sents[x], sents[y]];
      if (a.at === b.at) continue;
      const score = textSimilarity(stripNeeds(a.text), stripNeeds(b.text));
      if (score >= SAME_TEXT_MIN) out.push({ a: { at: a.at, name: a.name, text: a.text }, b: { at: b.at, name: b.name, text: b.text }, score });
    }
  }
  return out.sort((p, q) => q.score - p.score);
}

/** 화면 표시 재료: figures = 반복 수치 열쇠 → 블록 수(경고와 같은 기준), sentences = 원래 글 → 블록 순번(추진성과 -1) → 같은 문장이 있는 다른 블록 이름 */
export interface RepeatMarks {
  figures: Map<string, number>;
  sentences: Map<string, Map<number, string[]>>;
}

export function repeatMarks(spec: ReportSectionSpec): RepeatMarks {
  const mg = Boolean(spec.mg);
  const figures = new Map(repeatedEntries(figureUnits(spec), REPEAT_MIN_BLOCKS, mg ? REPEAT_MIN_PARTS : Infinity).map((x) => [x.key, x.n]));
  const sentences = new Map<string, Map<number, string[]>>();
  const add = (from: { at: number; text: string }, to: { name: string }) => {
    const byAt = sentences.get(from.text) ?? new Map<number, string[]>();
    const names = byAt.get(from.at) ?? [];
    if (!names.includes(to.name)) names.push(to.name);
    byAt.set(from.at, names);
    sentences.set(from.text, byAt);
  };
  for (const p of repeatedSentences(spec)) {
    add(p.a, p.b);
    add(p.b, p.a);
  }
  return { figures, sentences };
}

/** 경고 한 줄(참고 — warning-levels.ts 「반복 문장」). 같은 문장 쌍이 없으면 null. 쌍 3개까지 보임 */
export function sentenceRepeatWarning(spec: ReportSectionSpec): string | null {
  const pairs = repeatedSentences(spec);
  if (!pairs.length) return null;
  const clip = (t: string) => {
    const c = plainText(stripNeeds(t)).replace(/\s+/g, " ").trim();
    return c.length > 24 ? `${c.slice(0, 24).trimEnd()}…` : c;
  };
  const shown = pairs.slice(0, 3).map((p) => `「${clip(p.a.text)}」(${p.a.name}·${p.b.name})`);
  const more = pairs.length > 3 ? ` 외 ${pairs.length - 3}쌍` : "";
  return `반복 문장: ${shown.join(" / ")}${more} — 비슷한 문장을 여러 블록에 되풀이함 — 한 블록에만 두고 남는 자리에는 다른 실적·효과를`;
}
