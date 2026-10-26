// (260731) 2026년도 경영평가 관리계획 7월판(plan-2607) — 경영관리 부분(주요사업 쪽은 plan.ts)의 읽기 도구 둘.
//  1) 붙임1 '25 평가보고서 경영관리 평가위원 문단(「1 경영관리」와 「3 공공기관 혁신 노력과 성과 가점」) → evaluator_comment (지적 번호 ①… 추출)
//  2) 붙임2 '26 편람 경영관리 범주(「1. 경영관리 범주」와 「3. 공공기관 혁신 노력과 성과 가점」) → handbook_indicator
// plan.ts의 parseBizEvaluatorComments·parseBizHandbook과 같은 방식(조각 단위·키·메타)이고, 읽는 곳은 겹치지 않는다
// (주요사업 쪽은 「2 주요사업」~「3 공공기관 혁신」, 「2. 주요사업 범주」~「3. 공공기관 혁신」 앞에서 멈춘다).
// 지표 이름 → 지표 단위(MG-N)는 dictionaries-mg.ts의 resolveMgmtUnit. 사전이 모르는 이름이면 추측하지 않고 던진다.
// 순수 모듈(입출력 없음). 통합(parsePlan에 잇기·documents 등록)은 호출하는 쪽이 한다.

import { makeChunk } from "../chunk.ts";
import { resolveMgmtUnit } from "../dictionaries-mg.ts";
import { CIRCLED, cellText, circledToNumber, compactKey, normalizeText, pad2 } from "../normalize.ts";
import type { LineItem } from "../source.ts";
import { parseHtmlTables } from "../table.ts";
import type { Check, KnowledgeChunk, Measure, ParseResult, UnitId } from "../types.ts";
import { mgmtIndicatorByNo } from "../../tracks/mgmt-units.ts";

const DOC = "plan-2607";
const EVAL_EDITION = "2025 평가보고서(최종)";
const BONUS_CATEGORY = "공공기관 혁신 노력과 성과 가점";

/**
 * 검산 기대값. 원문을 직접 센 값(세는 방법은 각 항목 주석).
 * - findings: 지표 단위별 평가위원 의견 속 지적 번호 수. 번호는 ㉮·㉯ 소지표마다 ①부터 다시 시작해서 본문의 ①…을 소지표별로 센 뒤 합했다
 *   (md 2360~2497·2616~2643줄을 읽으며 문단마다 손으로 셈).
 * - summary25: 붙임1 첫 표('25 지적건수) 경영관리 칸의 숫자(md 2325~2358줄). 본문과 다르면 원문 차이라 경고로만 대조.
 * - paragraphs: 등급 문장을 뺀 평가위원 문단 수. md 2360~2497·2616~2643줄에서 「- 」로 시작하는 줄 90 − 등급 문장 줄 17 − 앞 문단에 이어지는 단일 「- 」줄 2(「- ②응급…」·「- ③사업장별…」, 앞 문단이 「또한」으로 끝남) = 71.
 * - grades: 「"X"로 평가한다」 등급 문장 수(소지표 단위, 재무예산관리 ㉯ 중장기재무관리계획은 결측 처리라 등급 없음).
 */
export const MGMT_EVAL_EXPECTED = {
  findings: { "MG-1": 5, "MG-2": 3, "MG-3": 8, "MG-4": 4, "MG-5": 6, "MG-6": 5, "MG-7": 5, "MG-8": 5, "MG-9": 9, "MG-10": 3, "MG-11": 3, "MG-12": 2, "MG-13": 7, "MG-14": 2 } as Record<string, number>,
  summary25: { "MG-1": 5, "MG-2": 3, "MG-3": 8, "MG-4": 4, "MG-5": 6, "MG-6": 5, "MG-7": 5, "MG-8": 5, "MG-9": 8, "MG-10": 3, "MG-11": 6, "MG-12": 2, "MG-13": 7, "MG-14": 2 } as Record<string, number>,
  paragraphs: 71,
  grades: 17,
};

/**
 * 편람 검산 기대값(md 2648~2905·3014~3021줄을 직접 셈).
 * - sections: 「(N) 지표」 절 15개(전략기획·윤리경영·국민소통 / 일자리·안전·친환경·창업·상생 / 재무예산관리·재무예산성과·효율성 관리 / 조직·노사·보수·총인건비) + 가점 표 1개
 * - components: 표 안 「지표정의-적용대상(배점)-세부평가내용」 3줄 묶음 수(계량·비계량 구성요소) 25개 + 가점 ①②③ 3개
 * - weights: 위탁집행형 준정부기관(없으면 「공기업 및 준정부기관」) 배점 합. 비계량 합은 붙임1 요약표 '25 배점 칸과 일치(편람과 같은 값)
 */
export const MGMT_HANDBOOK_EXPECTED = {
  sections: 15,
  components: 25,
  bonusComponents: 3,
  bonusPoints: 5,
  /** 단위별 구성요소 수 */
  byUnit: { "MG-1": 1, "MG-2": 2, "MG-3": 2, "MG-4": 4, "MG-5": 2, "MG-6": 1, "MG-7": 2, "MG-8": 1, "MG-9": 2, "MG-10": 1, "MG-11": 2, "MG-12": 1, "MG-13": 1, "MG-14": 1 } as Record<string, number>,
  /** 단위 없는 항목(국민소통·재무예산성과·효율성 관리·총인건비 관리) 구성요소 수: 2+1+1+1 */
  noUnit: 5,
  /** 비계량 배점 합(단위별) */
  nonQuant: { "MG-1": 2, "MG-2": 1.5, "MG-3": 1, "MG-4": 3, "MG-5": 2, "MG-6": 1.5, "MG-7": 1.5, "MG-8": 3, "MG-9": 2.5, "MG-10": 2.5, "MG-11": 3 } as Record<string, number>,
  /** 계량 배점 합(단위별, 단위 없는 항목은 "none": 국민소통 0.5+0.5, 재무예산성과 3, 효율성 관리 2, 총인건비 관리 3) */
  quant: { "MG-2": 1, "MG-3": 2, "MG-4": 2, "MG-5": 0.5, "MG-7": 2, none: 9 } as Record<string, number>,
};

function indexOfItem(items: LineItem[], test: (it: LineItem) => boolean, from = 0): number {
  for (let i = from; i < items.length; i++) if (test(items[i])) return i;
  return -1;
}
const lineIs = (re: RegExp) => (it: LineItem) => it.kind === "line" && re.test(it.text);
const tableIs = (re: RegExp) => (it: LineItem) => it.kind === "table" && re.test(it.text);

// ---------------------------------------------------------------------------
// 1) 붙임1 '25 평가보고서 — 경영관리 평가위원 문단

const GRADE = /이상의 결과를 종합하여 볼 때.*?[“"]\s*([A-E][0-9+⁺]*)\s*[”"]\s*로\s*평가/;
const SUB_MARKS = "㉮㉯㉰㉱㉲㉳㉴㉵㉶㉷㉸㉹㉺㉻";
const SUB_CODE: Record<string, string> = { "㉮": "a", "㉯": "b", "㉰": "c", "㉱": "d" };

interface MgScope {
  /** 원문 지표 이름(연결 줄 포함) */
  label: string;
  sub: { mark: string; label: string } | null;
  category: string;
  bonus: boolean;
}
interface MgParagraph extends MgScope {
  scopeKey: string;
  text: string;
  page: number;
  pageEnd: number;
}

/** 종결부호·「다」로 끝난 글인가(쪽 넘김으로 끊겨 다음 줄이 이어지는 경우 판별) */
const SENTENCE_END = /(?:[.다])["”’']?$/;

/**
 * 지적 번호인가. 번호는 소지표 안에서 ①부터 차례대로 하나씩 늘어난다.
 * 주요사업 쪽 isFindingMarker(바로 뒤 글자로 판정)와 달리 경영관리 문단은
 *  - 「세부평가내용 ①과 관련하여」처럼 편람 번호를 가리키는 말(지적이 아님)과
 *  - 「② 이해충돌방지 전략…」처럼 번호 뒤를 띄어 쓴 지적이 섞여 있어, 앞뒤 문맥으로 가른다.
 */
function isMgmtFinding(chars: string[], i: number, n: number, next: number): boolean {
  if (n !== next) return false;
  const before = chars.slice(Math.max(0, i - 12), i).join("");
  if (/세부평가내용\s*$/.test(before)) return false;
  // 문장 속 열거 「① 공공성, ② 효율성」: 바로 앞이 쉼표이고 그 앞 25자 안에 다른 원문자가 있고 마침표가 끼지 않음
  const near = chars.slice(Math.max(0, i - 32), i).join("");
  if (/[①-⑳][^.①-⑳]{0,25},\s*$/.test(near)) return false;
  return true;
}

export function parseMgmtEvaluatorComments(items: LineItem[]): ParseResult {
  const anchor = indexOfItem(items, tableIs(/^\|\s*붙임1\s*\|/));
  const startA = indexOfItem(items, lineIs(/^1 경영관리$/), Math.max(0, anchor));
  const endA = indexOfItem(items, lineIs(/^2 주요사업$/), startA);
  const startB = indexOfItem(items, lineIs(/^3 공공기관 혁신/), endA);
  const endB = indexOfItem(items, tableIs(/^\|\s*붙임2\s*\|/), startB);
  if (anchor < 0 || startA < 0 || endA < 0 || startB < 0 || endB < 0) throw new Error("관리계획: 붙임1 경영관리 범위를 찾지 못했습니다");

  const paragraphs: MgParagraph[] = [];
  const grades: Record<string, string> = {};
  let category = "";
  let indicator: { label: string; bonus: boolean } | null = null;
  let sub: { mark: string; label: string } | null = null;
  let cont: "indicator" | "sub" | null = null;

  const scopeKeyOf = (): string => `${indicator!.label}|${sub?.mark ?? ""}`;
  const scopeOf = (): MgScope => ({ label: indicator!.label, sub, category, bonus: indicator!.bonus });

  const walk = (from: number, to: number, bonus: boolean) => {
    for (let i = from; i < to; i++) {
      const it = items[i];
      if (it.kind !== "line") continue;
      const text = it.text.trim();
      if (/^!\[/.test(text)) continue;

      let m: RegExpExecArray | null;
      if ((m = /^##\s+(.+)$/.exec(text))) {
        if (bonus) {
          category = BONUS_CATEGORY;
          indicator = { label: normalizeText(m[1]), bonus: true };
        } else {
          category = normalizeText(m[1]);
          indicator = null;
        }
        sub = null;
        cont = bonus ? "indicator" : null;
        continue;
      }
      if (!bonus && (m = /^\((\d)\)\s*(.+)$/.exec(text))) {
        indicator = { label: normalizeText(m[2]), bonus: false };
        sub = null;
        cont = "indicator";
        continue;
      }
      if (!bonus && indicator && SUB_MARKS.includes(text[0] ?? "") && /^\S\s+\S/.test(text)) {
        sub = { mark: text[0], label: normalizeText(text.slice(1)) };
        cont = "sub";
        continue;
      }
      // 제목이 줄바꿈으로 끊긴 이음 줄(「(2) 안전」 + 「및 재난관리」)
      if (cont && !/^-/.test(text) && text.length <= 25 && !SENTENCE_END.test(text)) {
        if (cont === "indicator" && indicator) indicator = { ...indicator, label: normalizeText(`${indicator.label} ${text}`) };
        else if (cont === "sub" && sub) sub = { mark: sub.mark, label: normalizeText(`${sub.label} ${text}`) };
        cont = null;
        continue;
      }
      cont = null;
      if (!indicator) continue;

      const body = normalizeText(text.replace(/^(?:-\s)+/, ""));
      const key = scopeKeyOf();
      if (GRADE.test(body)) {
        grades[key] = GRADE.exec(body)![1];
        continue;
      }
      const prev = paragraphs.at(-1);
      const samePrev = prev && prev.scopeKey === key;
      const startsParagraph = /^-\s-\s/.test(text) || (/^-\s/.test(text) && !(samePrev && !SENTENCE_END.test(prev!.text)));
      if (samePrev && !startsParagraph) {
        prev!.text = `${prev!.text} ${body}`;
        prev!.pageEnd = it.page;
      } else {
        paragraphs.push({ ...scopeOf(), scopeKey: key, text: body, page: it.page, pageEnd: it.page });
      }
    }
  };
  walk(startA + 1, endA, false);
  category = "";
  indicator = null;
  sub = null;
  cont = null;
  walk(startB + 1, endB, true);

  // 지표 이름 → 단위(소지표가 달라도 같은 지표면 같은 단위)
  const unitCache = new Map<string, string | null>();
  const unitOf = (label: string): string => {
    if (!unitCache.has(label)) {
      const r = resolveMgmtUnit(label);
      if (!r.known) throw new Error(`붙임1: 경영관리 지표 이름을 풀 수 없습니다(dictionaries-mg.ts에 더해야 함): ${label}`);
      unitCache.set(label, r.unit);
    }
    const u = unitCache.get(label);
    if (!u) throw new Error(`붙임1: 카드가 없는 항목의 평가위원 문단입니다(처리 방법 미정): ${label}`);
    return u;
  };

  const expected: Record<string, number> = {};
  const unexpected: Record<string, number> = {};
  const counters: Record<string, number> = {};
  const chunks: KnowledgeChunk[] = [];
  const findingsByUnit: Record<string, number> = {};
  const paragraphsByUnit: Record<string, number> = {};

  for (const p of paragraphs) {
    const unit = unitOf(p.label);
    const no = Number(unit.slice(3));
    const ind = mgmtIndicatorByNo(no);
    const segs: Array<{ no: number | null; text: string }> = [{ no: null, text: "" }];
    const chars = Array.from(p.text);
    for (let i = 0; i < chars.length; i++) {
      const ch = chars[i];
      const n = CIRCLED.includes(ch) ? circledToNumber(ch) : null;
      const next = (expected[p.scopeKey] ?? 0) + 1;
      if (n !== null && isMgmtFinding(chars, i, n, next)) {
        expected[p.scopeKey] = n;
        segs.push({ no: n, text: ch });
      } else {
        if (n !== null) unexpected[unit] = (unexpected[unit] ?? 0) + 1;
        segs[segs.length - 1].text += ch;
      }
    }
    const blocks = segs.map((s) => s.text.trim()).filter(Boolean);
    const findings = segs.filter((s) => s.no !== null).map((s) => ({ no: s.no!, text: s.text.trim() }));
    findingsByUnit[unit] = (findingsByUnit[unit] ?? 0) + findings.length;
    paragraphsByUnit[unit] = (paragraphsByUnit[unit] ?? 0) + 1;

    const subCode = p.sub ? (SUB_CODE[p.sub.mark] ?? p.sub.mark) : "main";
    const counterKey = `${unit}/${subCode}`;
    counters[counterKey] = (counters[counterKey] ?? 0) + 1;
    const subLabel = p.sub ? ` · ${p.sub.label}` : "";
    const findingMarks = findings.map((f) => CIRCLED[f.no - 1]).join("");
    const criterion = /^세부평가내용\s*([①-⑩])/.exec(p.text);

    chunks.push(
      makeChunk({
        chunk_key: `${DOC}/eval25/${counterKey}/p${pad2(counters[counterKey])}`,
        doc_id: DOC,
        unit_type: "evaluator_comment",
        track: "경영관리",
        business: unit as UnitId,
        eval_item: null,
        measure: p.bonus ? "가점" : "비계량",
        q_type: findings.length ? ["평가보고서지적"] : ["평가보고서"],
        title: `'25 평가보고서 · ${ind?.name ?? p.label}${subLabel}${findingMarks ? ` ${findingMarks}` : ""}`,
        context_prefix: `2025 경영실적 평가보고서(최종) 평가위원 의견 · 경영관리 · ${p.category} · ${ind?.name ?? p.label}${subLabel}`,
        blocks,
        pdf_page_start: p.page,
        pdf_page_end: p.pageEnd,
        meta: {
          edition: EVAL_EDITION,
          category: p.category,
          indicator_label: p.label,
          sub_label: p.sub?.label ?? null,
          sub_mark: p.sub?.mark ?? null,
          criterion_no: criterion ? circledToNumber(criterion[1]) : null,
          prior_year_followup: /^전년도 경영평가 지적사항/.test(p.text),
          finding_nos: findings.map((f) => f.no),
          findings,
          page_basis: "pdf-start",
        },
      }),
    );
  }
  // 등급은 소지표 단위로 모든 문단에 붙입니다.
  const scopeOfChunk = new Map<KnowledgeChunk, string>();
  paragraphs.forEach((p, i) => scopeOfChunk.set(chunks[i], p.scopeKey));
  for (const c of chunks) {
    const g = grades[scopeOfChunk.get(c)!];
    c.meta.grade_2025 = g ?? null;
    if (g) c.context_prefix += ` · 등급 ${g}`;
  }

  const checks: Check[] = [];
  const units = Object.keys(MGMT_EVAL_EXPECTED.findings);
  const foundFindings: Record<string, number> = {};
  for (const u of units) foundFindings[u] = findingsByUnit[u] ?? 0;
  checks.push({
    name: "붙임1 경영관리 지적 번호(지표 단위별, 소지표마다 ①부터 연속)",
    level: "error",
    ok: units.every((u) => foundFindings[u] === MGMT_EVAL_EXPECTED.findings[u]),
    expected: MGMT_EVAL_EXPECTED.findings,
    actual: foundFindings,
    note: "소지표(㉮·㉯)마다 ①부터 끊김 없이 이어진 번호만 셉니다. 「세부평가내용 ①과」·문장 속 열거는 지적이 아님",
  });
  checks.push({
    name: "붙임1 경영관리 지적 건수 요약표와 대조",
    level: "warn",
    ok: units.every((u) => foundFindings[u] === MGMT_EVAL_EXPECTED.summary25[u]),
    expected: MGMT_EVAL_EXPECTED.summary25,
    actual: foundFindings,
    note: "요약표('25 지적건수)와 본문 번호 수가 다르면 원문 차이(조직 및 인적자원관리는 본문이 1건 더 많고, 보수 및 복리후생은 ㉮ 직무중심 보수체계 문단이 원문에 없음). 본문 번호를 기준으로 적재",
  });
  const gradeScopes = new Set(paragraphs.map((p) => p.scopeKey));
  const noGrade = [...gradeScopes].filter((k) => !grades[k]);
  checks.push({
    name: "붙임1 경영관리 등급 문장",
    level: "error",
    ok: Object.keys(grades).length === MGMT_EVAL_EXPECTED.grades && noGrade.length === 1 && /^재무예산관리\|㉯$/.test(noGrade[0]),
    expected: MGMT_EVAL_EXPECTED.grades,
    actual: { grades: Object.keys(grades).length, 등급_없는_소지표: noGrade },
    note: "등급 없는 소지표는 재무예산관리 ㉯ 중장기재무관리계획(결측 처리) 하나뿐이어야 함",
  });
  checks.push({ name: "붙임1 경영관리 평가위원 문단 수", level: "error", ok: chunks.length === MGMT_EVAL_EXPECTED.paragraphs, expected: MGMT_EVAL_EXPECTED.paragraphs, actual: chunks.length });
  checks.push({
    name: "붙임1 경영관리 지표 단위 14개 모두 문단이 있음",
    level: "error",
    ok: units.every((u) => (paragraphsByUnit[u] ?? 0) > 0),
    actual: paragraphsByUnit,
  });
  checks.push({ name: "붙임1 경영관리 번호 순서 밖 원문자(참고)", level: "warn", ok: true, actual: unexpected, note: "지적으로 보지 않은 원문자 수(문장 속 열거·편람 번호 인용)" });
  return { chunks, checks, extras: { grades, findings: foundFindings } };
}

// ---------------------------------------------------------------------------
// 2) 붙임2 '26 편람 — 경영관리 범주(+ 공공기관 혁신 가점)

interface HbComponent {
  def: string;
  target: string;
  detail: string;
}

/** 산식 분수 표(- 부채비율 = | 부채 / 자기자본) → "- 부채비율 = 부채 / 자기자본" (plan.ts flattenInline과 같은 방식) */
function flattenInline(tableHtml: string): string {
  const t = parseHtmlTables(tableHtml)[0];
  if (!t) return cellText(tableHtml);
  return t.rows.map((r) => r.cells.map((c) => c.text).filter(Boolean).join(" ")).join(" / ");
}

function valueText(html: string): string {
  const flat = html.replace(/<table[\s\S]*?<\/table>/gi, (t) => `<br>${flattenInline(t)}<br>`);
  return cellText(flat, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

interface PointPick {
  measure: "계량" | "비계량";
  points: number;
  by: string;
}

/**
 * 적용대상(배점) 글에서 준정부기관 배점을 고른다. 위탁집행형 준정부기관이 따로 적힌 곳(재무예산관리 등)은 그 값,
 * 「공기업 및 준정부기관」·「준정부기관」은 그 값. 기금관리형은 뺀다. 못 읽으면 null.
 * (기관 유형 판단 근거: 붙임1 요약표의 '25 배점이 위탁집행형 준정부기관 값과 일치 — 재무예산관리 3점)
 */
export function pickQuasiGovPoints(target: string): PointPick | null {
  const re = /((?:위탁집행형|기금관리형)?\s*준정부기관)\s*[:：]?\s*(비계량|계량)\s*([\d.]+)\s*점/g;
  const found: PointPick[] = [];
  for (let m = re.exec(target); m; m = re.exec(target)) {
    const by = m[1].replace(/\s+/g, " ").trim();
    if (by.startsWith("기금관리형")) continue;
    found.push({ measure: m[2] as "계량" | "비계량", points: Number(m[3]), by });
  }
  return found.find((f) => f.by.startsWith("위탁집행형")) ?? found[0] ?? null;
}

/** 표 한 개의 지표정의·적용대상·세부평가내용 3줄 묶음들을 읽는다 */
function readComponents(table: ReturnType<typeof parseHtmlTables>[number]): HbComponent[] {
  const out: HbComponent[] = [];
  for (const r of table.rows) {
    if (r.cells.length < 2) continue;
    const label = compactKey(cellText(r.cells.at(-2)!.html));
    const value = valueText(r.cells.at(-1)!.html);
    if (label === "지표정의") out.push({ def: value, target: "", detail: "" });
    else if (label.startsWith("적용대상") && out.length) out.at(-1)!.target = value;
    else if (label === "세부평가내용" && out.length) out.at(-1)!.detail = value;
  }
  return out;
}

interface HbSection {
  no: number;
  label: string;
  category: string;
  page: number;
  components: HbComponent[];
}

export function parseMgmtHandbook(items: LineItem[]): ParseResult {
  const anchor = indexOfItem(items, tableIs(/^\|\s*붙임2\s*\|/));
  const start = indexOfItem(items, lineIs(/^1\. 경영관리 범주$/), Math.max(0, anchor));
  const end = indexOfItem(items, lineIs(/^2\. 주요사업 범주$/), start);
  const bonusStart = indexOfItem(items, lineIs(/^3\. 공공기관 혁신/), end);
  const bonusEnd = indexOfItem(items, tableIs(/^\|\s*붙임3\s*\|/), bonusStart);
  if (anchor < 0 || start < 0 || end < 0 || bonusStart < 0 || bonusEnd < 0) throw new Error("관리계획: 붙임2 경영관리 범주를 찾지 못했습니다");

  const sections: HbSection[] = [];
  let category = "";
  let cur: { no: number; label: string; page: number } | null = null;
  let cont = false;
  for (let i = start + 1; i < end; i++) {
    const it = items[i];
    if (it.kind === "line") {
      const t = it.text.trim();
      let m: RegExpExecArray | null;
      if ((m = /^##\s+(.+)$/.exec(t))) {
        category = normalizeText(m[1]);
        cur = null;
        cont = false;
      } else if ((m = /^###\s*\((\d)\)\s*(.+)$/.exec(t))) {
        cur = { no: Number(m[1]), label: normalizeText(m[2]), page: it.page };
        cont = true;
      } else if (cont && cur && (m = /^###\s*(.+)$/.exec(t))) {
        cur.label = normalizeText(`${cur.label} ${m[1]}`); // 「(4) 창업」 + 「### 및 경제활성화」
        cont = false;
      } else cont = false;
      continue;
    }
    cont = false;
    if (!cur) continue;
    const table = parseHtmlTables(it.text)[0];
    if (!table) continue;
    sections.push({ no: cur.no, label: cur.label, category, page: it.page, components: readComponents(table) });
    cur = null;
  }

  const chunks: KnowledgeChunk[] = [];
  const unitCounters: Record<string, number> = {};
  const weights: Record<string, { 비계량: number; 계량: number }> = {};
  const compCountByUnit: Record<string, number> = {};
  let noUnitCount = 0;
  const unreadable: string[] = [];
  const catIndex = new Map<string, number>();

  for (const s of sections) {
    const r = resolveMgmtUnit(s.label);
    if (!r.known) throw new Error(`붙임2: 경영관리 지표 이름을 풀 수 없습니다(dictionaries-mg.ts에 더해야 함): ${s.label}`);
    const unit = r.unit;
    const ind = unit ? mgmtIndicatorByNo(Number(unit.slice(3))) : null;
    const display = ind?.name ?? s.label;
    if (!catIndex.has(s.category)) catIndex.set(s.category, catIndex.size + 1);
    const m = s.components.length;
    s.components.forEach((c, idx) => {
      const pick = pickQuasiGovPoints(c.target);
      const measureMatch = /(비계량|계량)/.exec(c.target);
      const measure = (pick?.measure ?? measureMatch?.[1] ?? null) as "계량" | "비계량" | null;
      if (!pick || !measure) unreadable.push(`${display} ${idx + 1}/${m}`);
      const wKey = unit ?? "none";
      weights[wKey] ??= { 비계량: 0, 계량: 0 };
      if (pick) weights[wKey][pick.measure] += pick.points;
      let key: string;
      if (unit) {
        unitCounters[unit] = (unitCounters[unit] ?? 0) + 1;
        compCountByUnit[unit] = unitCounters[unit];
        key = `${DOC}/handbook26/${unit}/k${unitCounters[unit]}`;
      } else {
        noUnitCount += 1;
        key = `${DOC}/handbook26/MG/${catIndex.get(s.category)}-${s.no}/k${idx + 1}`;
      }
      const criteria = c.detail.split("\n").filter((l) => /^[①-⑩]\s/.test(l)).length;
      chunks.push(
        makeChunk({
          chunk_key: key,
          doc_id: DOC,
          unit_type: "handbook_indicator",
          track: "경영관리",
          business: unit as UnitId | null,
          eval_item: null,
          measure: (measure ?? null) as Measure | null,
          q_type: ["편람"],
          title: `'26 편람 · ${display} · ${measure ?? "구분 미확인"}${m > 1 ? ` (${idx + 1}/${m})` : ""}`,
          context_prefix: `2026 경영평가편람('26.1.29) · 경영관리 범주 · ${s.category} · (${s.no}) ${display}${m > 1 ? ` · 구성요소 ${idx + 1}/${m}` : ""} · 적용대상 ${c.target.replace(/\s+/g, " ")}`,
          blocks: [`지표정의: ${c.def}`, `적용대상(배점): ${c.target}`, `세부평가내용: ${c.detail}`],
          pdf_page_start: s.page,
          meta: {
            edition: "2026 경영평가편람('26.1.29)",
            category: s.category,
            indicator_no: s.no,
            indicator_label: s.label,
            component_no: idx + 1,
            component_count: m,
            applies_to: c.target.replace(/\s+/g, " "),
            weight_quasi_gov: pick?.points ?? null,
            weight_basis: pick?.by ?? null,
            criteria_count: criteria,
            no_card_indicator: unit === null,
            page_basis: "pdf-start",
          },
        }),
      );
    });
  }

  // 가점 표: 지표정의·적용대상 + ①②③ 세부평가내용(안전한 일터 1.5·AI 1.5·국정과제 2)
  const bonusChunks: KnowledgeChunk[] = [];
  let bonusSum = 0;
  let bonusTable: ReturnType<typeof parseHtmlTables>[number] | undefined;
  let bonusPage = 0;
  for (let i = bonusStart + 1; i < bonusEnd; i++) {
    if (items[i].kind === "table" && (bonusTable = parseHtmlTables(items[i].text)[0])) {
      bonusPage = items[i].page;
      break;
    }
  }
  const bonusComp = bonusTable ? readComponents(bonusTable)[0] : undefined;
  if (bonusComp) {
    const parts = bonusComp.detail.split(/\n(?=[①-⑨]\s)/).map((s) => s.trim()).filter(Boolean);
    parts.forEach((part, idx) => {
      const w = /\((\d+(?:\.\d+)?)점\)/.exec(part);
      const headText = part.slice(0, w ? w.index : 60);
      const r = resolveMgmtUnit(headText);
      if (!r.known || !r.unit) throw new Error(`붙임2: 가점 지표 이름을 풀 수 없습니다: ${headText}`);
      const points = w ? Number(w[1]) : null;
      bonusSum += points ?? 0;
      const ind = mgmtIndicatorByNo(Number(r.unit.slice(3)));
      bonusChunks.push(
        makeChunk({
          chunk_key: `${DOC}/handbook26/${r.unit}/k1`,
          doc_id: DOC,
          unit_type: "handbook_indicator",
          track: "경영관리",
          business: r.unit as UnitId,
          eval_item: null,
          measure: "가점",
          q_type: ["편람"],
          title: `'26 편람 · ${ind?.name ?? headText} · 가점${points !== null ? ` ${points}점` : ""}`,
          context_prefix: `2026 경영평가편람('26.1.29) · 공공기관 혁신 노력과 성과 가점 · ${ind?.name ?? headText} · 적용대상 ${bonusComp.target.replace(/\s+/g, " ")}`,
          blocks: [`지표정의: ${bonusComp.def}`, `적용대상(배점): ${bonusComp.target}`, `세부평가내용: ${part}`],
          pdf_page_start: bonusPage,
          meta: {
            edition: "2026 경영평가편람('26.1.29)",
            category: BONUS_CATEGORY,
            component_no: idx + 1,
            component_count: parts.length,
            applies_to: bonusComp.target.replace(/\s+/g, " "),
            weight_quasi_gov: points,
            weight_basis: "공공기관 혁신가점(준정부기관 5점 중)",
            page_basis: "pdf-start",
          },
        }),
      );
    });
  }
  chunks.push(...bonusChunks);

  const keys = chunks.map((c) => c.chunk_key);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  const nonQuant: Record<string, number> = {};
  const quant: Record<string, number> = {};
  for (const [u, w] of Object.entries(weights)) {
    if (u !== "none" && w.비계량 > 0) nonQuant[u] = Math.round(w.비계량 * 100) / 100;
    if (w.계량 > 0) quant[u] = Math.round(w.계량 * 100) / 100;
  }
  const same = (a: Record<string, number>, b: Record<string, number>) => Object.keys({ ...a, ...b }).every((k) => a[k] === b[k]);
  const checks: Check[] = [
    { name: "편람 경영관리 지표 절 수", level: "error", ok: sections.length === MGMT_HANDBOOK_EXPECTED.sections, expected: MGMT_HANDBOOK_EXPECTED.sections, actual: sections.length },
    {
      name: "편람 경영관리 구성요소(지표정의-적용대상-세부평가내용 묶음) 수",
      level: "error",
      ok: chunks.length - bonusChunks.length === MGMT_HANDBOOK_EXPECTED.components && same(compCountByUnit, Object.fromEntries(Object.entries(MGMT_HANDBOOK_EXPECTED.byUnit).filter(([u]) => Number(u.slice(3)) <= 11))) && noUnitCount === MGMT_HANDBOOK_EXPECTED.noUnit,
      expected: { total: MGMT_HANDBOOK_EXPECTED.components, byUnit: MGMT_HANDBOOK_EXPECTED.byUnit, noUnit: MGMT_HANDBOOK_EXPECTED.noUnit },
      actual: { total: chunks.length - bonusChunks.length, byUnit: compCountByUnit, noUnit: noUnitCount },
    },
    { name: "편람 경영관리 적용대상(배점) 모두 읽힘", level: "error", ok: unreadable.length === 0, actual: unreadable },
    {
      name: "편람 비계량 배점 합 = 붙임1 요약표 '25 배점(단위별)",
      level: "error",
      ok: same(nonQuant, MGMT_HANDBOOK_EXPECTED.nonQuant),
      expected: MGMT_HANDBOOK_EXPECTED.nonQuant,
      actual: nonQuant,
      note: "배점은 위탁집행형 준정부기관(없으면 「공기업 및 준정부기관」) 기준",
    },
    { name: "편람 계량 배점 합(단위별)", level: "error", ok: same(quant, MGMT_HANDBOOK_EXPECTED.quant), expected: MGMT_HANDBOOK_EXPECTED.quant, actual: quant },
    {
      name: "편람 공공기관 혁신 가점 ①②③ 배점 합 = 5점",
      level: "error",
      ok: bonusChunks.length === MGMT_HANDBOOK_EXPECTED.bonusComponents && bonusSum === MGMT_HANDBOOK_EXPECTED.bonusPoints,
      expected: { parts: MGMT_HANDBOOK_EXPECTED.bonusComponents, points: MGMT_HANDBOOK_EXPECTED.bonusPoints },
      actual: { parts: bonusChunks.length, points: bonusSum },
    },
    { name: "편람 경영관리 조각 키 중복 없음", level: "error", ok: dupKeys.length === 0, actual: dupKeys },
  ];
  return { chunks, checks, extras: { weights } };
}
