// 경평 초안 작성 규칙 점검 C4~C8(순수, 2026-11-09 — docs/plan/경평초안-프레임워크-확장-계획.md P6 §4 R1·R4·R5·R7·R8). 주요사업 집필 verifySection·다시 점검 recheckSection이 부름.
// 글은 고치지 않고 경고 한 줄씩만 냄 — 자동 고치기 사유(shouldFix·composeIssues)·점수에는 넣지 않음. 앞머리 등급은 warning-levels.ts WARNING_HEADS.
//  C4 「제목 수치」(참고, R1): 소항목 제목·블록 제목의 수치가 본문(블록 글)·추진성과에 한 번도 안 나옴
//  C5 「비교 기준」(참고, R4): 추진성과 줄 중 수치는 있는데 비교 기준(전년·기존·목표·대비·→·에서 …로·증가·감소 등)이 없는 줄이 둘 이상
//  C6 「비율 차」(막힘, R5): 「A%에서 B%로 C% 증가」처럼 두 비율의 차(B−A)를 %로 씀 — %p여야 함(C가 증감률 (B−A)/A와 같으면 맞는 표기라 안 봄)
//  C7 「과장 낱말」(참고, R7): 최초·최고·역대·유일·근절·제로·무재해·전무가 초안에 있는데 근거 글(카드·첨부·실사 답변 — knownNumbers와 같은 글)에는 없음
//  C8 「AI 기준선」(참고, R8): 주 틀이 AX 전환형이면 수치 있는 추진성과 줄, 아니면 AI 낱말이 든 수치 있는 추진성과 줄에 기준선(기존·도입 전·대비·→·에서 …로)이 없음
// 【확인: …】 자리표시는 걷고 보며, 자리표시가 든 추진성과 줄은 C5·C8에서 뺌(채울 자리를 이미 밝힘). 경영관리 초안(spec.mg)은 보지 않음.

import { stripNeeds } from "./actuals.ts";
import { blockNumberTexts } from "./blocks.ts";
import { figuresOf } from "./branch-checks.ts";
import type { ReportSectionSpec } from "./section.ts";

const cut = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n)}…` : s);
/** 비교용 글: 자리표시·강조 표시(**)를 걷음 */
const plain = (s: string) => stripNeeds(s).replace(/\*\*/g, "").trim();
const NEED = /【확인:/;

// ---------------------------------------------------------------------------
// C4 제목 수치 = 본문 수치

/** 같은 수치 열쇠: 수 + 단위 첫 글자(figuresOf — 한 자리 정수·연월일은 이미 빠짐) */
const sameFig = (a: { num: string; unit: string }, b: { num: string; unit: string }) => a.num === b.num && (a.unit === b.unit || !a.unit || !b.unit);

/**
 * 월.일 날짜(「7.6 협의」「(10.13)」): 정수부 1~12·소수부 1~31(두 자리까지)이고 단위가 없거나 띄어 쓴 다음 낱말(figuresOf·hasFigure는 띄어 쓴 낱말 첫 글자도 단위로 읽음).
 * 「7.6만」「7.6%」「1.5배」처럼 붙여 쓴 단위는 수치
 */
export function monthDay(int: string, dec: string | undefined, unit: string, spaced: boolean): boolean {
  const day = (dec ?? "").replace(/^\./, "");
  if (!/^\d{1,2}$/.test(day)) return false;
  const m = Number(int);
  const d = Number(day);
  return m >= 1 && m <= 12 && d >= 1 && d <= 31 && (!unit || (spaced && unit !== "%"));
}
const figureDate = (f: { num: string; unit: string; raw: string }) => {
  const [int, dec] = f.num.split(".");
  return monthDay(int, dec, f.unit, /\d\s/.test(f.raw));
};

/** 추진성과 상자 글(줄 단위) */
function resultBoxTexts(spec: ReportSectionSpec): string[] {
  return [
    ...spec.results,
    ...(spec.resultCards ?? []).flatMap((c) => [c.tag, c.headline, c.figure]),
    ...(spec.resultChart ? [spec.resultChart.title, ...spec.resultChart.series.map((s) => `${s.label} ${s.value}`), spec.resultChart.badge] : []),
    spec.resultBand ?? "",
  ].filter(Boolean);
}

/** C4(참고): 소항목 제목·블록 제목의 수치(단위 포함)가 본문 블록 글(제목 빼고)·추진성과에 한 번도 안 나오면 한 줄 */
export function titleFigureWarning(spec: ReportSectionSpec): string | null {
  if (spec.mg) return null;
  const blocks = spec.blocks ?? [];
  const body = [...blocks.flatMap((b) => blockNumberTexts({ ...b, title: "" })), ...resultBoxTexts(spec), spec.caption].map(plain).join("\n");
  const bodyFigs = figuresOf(body);
  const titles: Array<[string, string]> = [["소항목 제목", spec.sub.title], ...blocks.map((b): [string, string] => [`「${cut(b.label || b.kind, 10)}」 블록 제목`, b.title])];
  const misses: string[] = [];
  for (const [where, title] of titles) {
    const lost = figuresOf(plain(title ?? "")).filter((f) => !figureDate(f) && !bodyFigs.some((g) => sameFig(f, g)));
    if (lost.length) misses.push(`${[...new Set(lost.map((f) => f.raw))].join("·")}(${where})`);
  }
  if (!misses.length) return null;
  return `제목 수치: ${misses.slice(0, 3).join(" · ")}가 본문·추진성과에 한 번도 안 나옵니다 — 제목의 수치는 본문 블록·추진성과에 같은 값으로 씁니다`;
}

// ---------------------------------------------------------------------------
// 추진성과 줄(C5·C8 공용)

/** 추진성과 줄: 불릿 + 3칸(칩·결과·수치를 한 줄로). 막대·강조 띠는 값 짝이 비교 자체라 안 봄 */
function resultLinesOf(spec: ReportSectionSpec): string[] {
  return [...spec.results, ...(spec.resultCards ?? []).map((c) => [c.tag, c.headline, c.figure].filter(Boolean).join(" "))].map((s) => String(s ?? "").trim()).filter(Boolean);
}

/** 수치가 있는 줄: 단위 붙은 수(한 자리 포함)·두 자리 이상 수·소수. 연월일(’26.8·11월·7.6 협의)·과제 번호(#72)는 수치가 아님 */
export function hasFigure(line: string): boolean {
  for (const m of line.matchAll(/(?<![’'‘#\d.,])(\d[\d,]*)(\.\d+)?(\s?)(%|[가-힣])?/g)) {
    if (monthDay(m[1], m[2], m[4] ?? "", Boolean(m[3]))) continue;
    if (m[4] ? !/[년월일]/.test(m[4]) : m[1].length > 1 || m[2]) return true;
  }
  return false;
}

/** 줄에 서로 다른 연도(’25·2025년)가 둘 이상 — 「’25년 … ’26년 …」 시점 짝도 비교 기준 */
function twoYears(line: string): boolean {
  const ys = [...line.matchAll(/[’'‘](\d{2})(?!\d)|(?<!\d)20(\d{2})(?=\s?년)/g)].map((m) => m[1] ?? m[2]);
  return new Set(ys).size >= 2;
}

/** 「A에서 B로」: 에서 뒤 30자 안에 조사 「로·으로」 */
const FROM_TO = /에서\s?[^,·･]{1,30}?(?:으로|로)(?![가-힣])/;

/** C5 비교 기준: 기준값(전년·기존·목표·대비·→·에서 …로)이나 기준을 품은 변화 낱말(증가·감소·향상·단축·절감 등·%p·↑↓) */
const COMPARE = /전년|기존|종전|이전|도입\s?전|개선\s?전|적용\s?전|목표|대비|→|⇒|▶|➡|↑|↓|%p|증가|감소|향상|상승|하락|단축|절감|감축|늘어|늘려|줄어|줄여/;
export const hasCompare = (line: string) => COMPARE.test(line) || FROM_TO.test(line) || twoYears(line);

/** C8 기준선: 견준 값이 있는 표지만(증가·향상 같은 변화 낱말은 기준선 수치가 아님) */
const BASELINE = /기존|종전|이전|도입\s?전|개선\s?전|적용\s?전|전년|대비|→|⇒|▶|➡/;
export const hasBaseline = (line: string) => BASELINE.test(line) || FROM_TO.test(line) || twoYears(line);

/** C5(참고): 수치는 있는데 비교 기준이 없는 추진성과 줄이 둘 이상이면 한 줄 */
export function compareBaseWarning(spec: ReportSectionSpec): string | null {
  if (spec.mg) return null;
  const bare = resultLinesOf(spec).filter((l) => !NEED.test(l)).map(plain).filter((l) => hasFigure(l) && !hasCompare(l));
  if (bare.length < 2) return null;
  return `비교 기준: 추진성과 ${bare.length}줄이 수치만 있고 비교 기준(전년·기존·목표·대비·→ 등)이 없습니다(${bare.slice(0, 2).map((l) => `「${cut(l)}」`).join(" / ")}) — 기준 대비 변화로 쓰거나, 기준값이 근거에 없으면 【확인】으로 남깁니다`;
}

// ---------------------------------------------------------------------------
// C6 %p 혼동

/** 두 비율 A → B(「A%에서 B%로」·「A% → B%」 — 사이 14자 안, 사이 글에 %가 없음) 뒤 30자 안의 C%(%p 아님) + 증감 낱말·화살표·부호 */
const PAIR = /(?<![\d.])(\d+(?:\.\d+)?)\s?%\s*(?:에서|→|⇒|▶|➡|->)[^%\n]{0,14}?(?<![\d.])(\d+(?:\.\d+)?)\s?%(?!\s?p|포인트)/g;
const CHANGE = /(?<![\d.])([+△▲▼-]?)(\d+(?:\.\d+)?)\s?%(?!\s?p|포인트)\s?(증가|상승|향상|개선|감소|하락|감축|↑|↓|늘|줄|높|낮|올|떨|단축|절감)?/g;

/** 보고서 글 줄(윗첨자 시점 라벨 ^{…}은 걷음 — 「^{’25년}30% → ^{’26년}45%」) */
function allLines(spec: ReportSectionSpec): string[] {
  const texts = [spec.sub.title, ...(spec.blocks ?? []).flatMap(blockNumberTexts), ...resultBoxTexts(spec)];
  return texts.flatMap((t) => plain(t).replace(/\^\{[^{}]*\}/g, "").split("\n")).filter(Boolean);
}

const decimals = (s: string) => (s.split(".")[1] ?? "").length;

/** C6(막힘): 「A%에서 B%로 C% 증가」의 C가 B−A(반올림 자리 안)이고 증감률 (B−A)/A×100과는 다르면 한 줄 */
export function percentPointWarning(spec: ReportSectionSpec): string | null {
  if (spec.mg) return null;
  const hits: string[] = [];
  for (const line of allLines(spec)) {
    for (const p of line.matchAll(PAIR)) {
      const a = Number(p[1]);
      const b = Number(p[2]);
      const tail = line.slice(p.index + p[0].length, p.index + p[0].length + 30);
      for (const c of tail.matchAll(CHANGE)) {
        if (!c[1] && !c[3]) continue; // 증감 낱말·부호 없는 %는 다른 수치
        const v = Number(c[2]);
        const tol = 0.5 * 10 ** -decimals(c[2]) + 1e-9;
        const diff = Math.abs(b - a);
        const rate = a ? (diff / a) * 100 : NaN;
        if (Math.abs(v - diff) <= tol && !(Math.abs(v - rate) <= tol)) hits.push(`「${p[1]}%→${p[2]}% … ${c[0].trim()}」`);
        break; // 짝 바로 뒤 첫 증감 수치만 봄
      }
    }
  }
  if (!hits.length) return null;
  return `비율 차: ${[...new Set(hits)].slice(0, 3).join(" · ")} — 두 비율의 차이는 %p로 씁니다(증감률이면 (B−A)÷A로 다시 셈)`;
}

// ---------------------------------------------------------------------------
// C7 과장 낱말

/** 과장 낱말과 오탐 막이(직함 최고경영자·전무이사, 「과제로·체제로」 속 제로, 「지역대학」 속 역대, 제로트러스트) */
export const HYPE_WORDS: ReadonlyArray<[string, RegExp]> = [
  ["최초", /최초/],
  ["최고", /최고(?!경영|책임|관리자|위|정보|기술|재무|의사결정|감사)/],
  ["역대", /(?<![가-힣])역대/],
  ["유일", /유일/],
  ["근절", /근절/],
  ["제로", /(?<![가-힣])제로(?!트러스트)/],
  ["무재해", /무재해/],
  ["전무", /(?<![가-힣])전무(?!이사)/],
];

/** C7(참고): 초안 글(자리표시 뺌)의 과장 낱말 중 근거 글(evidence)에 같은 낱말이 없는 것 한 줄 */
export function hypeWordWarning(spec: ReportSectionSpec, evidence: string): string | null {
  if (spec.mg) return null;
  const draft = allLines(spec).join("\n");
  const lost = HYPE_WORDS.filter(([, re]) => re.test(draft) && !re.test(evidence)).map(([w]) => w);
  if (!lost.length) return null;
  return `과장 낱말: ${lost.map((w) => `「${w}」`).join("·")}이(가) 근거 글(카드·첨부·실사 답변)에 없습니다 — 비교 대상·기간·공식 근거가 있을 때만 쓰고, 없으면 사실(건수·대상·기간)로 바꿉니다`;
}

// ---------------------------------------------------------------------------
// C8 AI 성과 기준선

/** AI 낱말(영문 AI는 앞뒤가 영문이 아닐 때만 — 「AICC」·「MAIN」 빼고 「AI판독」은 셈) */
const AI_WORD = /(?<![A-Za-z])AI(?![A-Za-z])|인공지능|머신러닝|딥러닝|생성형|챗봇|LLM|GPT/;

/** C8(참고): AI 성과 줄(주 틀 AX 전환형이면 수치 있는 추진성과 줄 전부, 아니면 AI 낱말이 든 것)에 기준선이 없으면 한 줄 */
export function aiBaselineWarning(spec: ReportSectionSpec): string | null {
  if (spec.mg) return null;
  const ax = spec.story === "AX 전환형";
  const bare = resultLinesOf(spec).filter((l) => !NEED.test(l)).map(plain).filter((l) => hasFigure(l) && (ax || AI_WORD.test(l)) && !hasBaseline(l));
  if (!bare.length) return null;
  return `AI 기준선: AI 성과 ${bare.length}줄에 기준선(기존·도입 전·대비·→)이 없습니다(${bare.slice(0, 2).map((l) => `「${cut(l)}」`).join(" / ")}) — 도입 전 값과 견준 변화로 쓰고, 기준선이 근거에 없으면 【확인: 도입 전 값】으로 남깁니다`;
}

/** 집필·다시 점검에 넣는 작성 규칙 점검 경고 전부(C4·C5·C7·C8 참고, C6 막힘). evidence = 근거 글(카드 글 + 숫자 대조에 쓰는 첨부·전년 절·실사 답변). 해당 없으면 빈 배열 */
export function writingWarnings(spec: ReportSectionSpec, evidence: string): string[] {
  return [titleFigureWarning(spec), compareBaseWarning(spec), percentPointWarning(spec), hypeWordWarning(spec, evidence), aiBaselineWarning(spec)].filter((x): x is string => Boolean(x));
}
