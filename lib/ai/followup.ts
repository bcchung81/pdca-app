// 보완 점검(지침 09 모드 C — 보완 이행 자가점검)의 순수 함수: 최종 점검표 → 미흡 행 id 목록, 요청 블록, AI 답 검증·집계.
// AI는 id별 판단·인용·남은 할 일만 내고, 빠진 행 채우기·인용 대조·요약 수치는 코드가 합니다(기준은 문서, 셈은 코드).
// 점검표의 판정·문장은 바꾸지 않습니다. 판단어는 공식 판정(충족·미흡)이 아닙니다.
// 이 파일은 writer.ts를 import하지 않습니다(순환 방지) — 카드 글은 호출하는 쪽이 cardOutline(card)로 넘깁니다.

import { type InspectionResult, STAR_ITEMS, TABLE_KEYS, type TableKey, evidenceText, formTablesOf, rowLabel, tally } from "../inspections/model.ts";
import { compactKey } from "../knowledge/normalize.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";

export const FOLLOWUP_JUDGMENTS = ["반영됨", "일부 반영", "미반영", "확인 불가"] as const;
export type FollowupJudgment = (typeof FOLLOWUP_JUDGMENTS)[number];

/** 지침 <보완이행점검> 2단계: 점검표가 없으면 AI 없이 이 말로 안내하고 멈춤 */
export const NO_INSPECTION_MESSAGE = "아직 성과관리팀 점검결과가 없어 자가점검할 기준이 없습니다. 이번 달 실적 정리(모드 A)나 실적 발굴(모드 B)은 도와드릴 수 있습니다.";
export const FOLLOWUP_NOTICE = "자가점검 결과이며 공식 판정은 성과관리팀 점검에서 정해집니다.";
export const MISSING_REMAINING = "AI 답에서 빠졌습니다. 다시 요청해 주세요.";

/** 점검표의 미흡 행 하나 — id = `${표키}.${번호}`(예: axes.4) */
export interface FollowupRow {
  id: string;
  table: TableKey;
  no: number;
  /** 「7대축 4 OutCome 연결」 */
  label: string;
  /** ★핵심 3항목(집중보완 판정) 해당 */
  star: boolean;
  /** 요구받은 보완(▸ 보완) */
  requested: string;
  /** 점검 당시 카드 상태(▸ 카드) */
  cardThen: string;
  /** 질의패턴의 예상 질의 */
  question: string;
  /** 점검표 근거(지식파일명+위치 「원문」) 글들 */
  evidence: string[];
}

/** 기준 미확인·해당 없음이던 행 — 카드 변경으로 이제 성립하게 됐는지만 짚음(구조화·검증 대상 아님) */
export interface FollowupRecheck {
  id: string;
  label: string;
  judgment: "기준 미확인" | "해당 없음";
  note: string;
}

export interface FollowupBasis {
  /** YYYY-MM */
  period: string;
  statusLabel: string;
  /** 집중보완 과제(판정 가능한 ★ 중 2개 이상 미흡) */
  focus: boolean;
  rows: FollowupRow[];
  recheck: FollowupRecheck[];
}

const STATUS_TEXT: Record<string, string> = { draft: "초안", sent: "부서에 보냄", acknowledged: "부서 확인함" };

/**
 * 최종 점검표 → 보완 점검 근거. 점검표가 없으면 null.
 * 미흡 행만 id와 함께 뽑고, 집중보완 과제면 ★핵심 행을 맨 앞에(그 안은 표 순서), 아니면 표 순서(7대축 → 질의패턴 → 정합성).
 */
export function followupBasis(ins: { period: string; status: string; result: InspectionResult } | null): FollowupBasis | null {
  if (!ins) return null;
  const rows: FollowupRow[] = [];
  const recheck: FollowupRecheck[] = [];
  const tables = formTablesOf(ins.result.form);
  for (const k of TABLE_KEYS) {
    tables[k].rows.forEach((f, i) => {
      const r = ins.result[k]?.[i];
      if (!r) return;
      const id = `${k}.${f.no}`;
      if (r.judgment === "미흡") {
        rows.push({
          id,
          table: k,
          no: f.no,
          label: rowLabel(k, f.no, ins.result.form),
          star: STAR_ITEMS.some((s) => s.table === k && s.no === f.no),
          requested: r.fix,
          cardThen: r.card,
          question: r.question,
          evidence: r.evidence.map(evidenceText),
        });
      } else if (r.judgment === "기준 미확인" || r.judgment === "해당 없음") {
        recheck.push({ id, label: rowLabel(k, f.no, ins.result.form), judgment: r.judgment, note: r.note });
      }
    });
  }
  const focus = tally(ins.result).focus;
  if (focus) rows.sort((a, b) => Number(b.star) - Number(a.star)); // 안정 정렬 — ★ 안과 밖은 표 순서 그대로
  return { period: ins.period, statusLabel: STATUS_TEXT[ins.status] ?? ins.status, focus, rows, recheck };
}

/** AI가 행마다 돌려주는 답(writerResultSchema의 followup 항목) */
export interface FollowupAnswer {
  id: string;
  judgment: FollowupJudgment;
  card_quote: string;
  inspection_quote: string;
  remaining: string;
}

export interface VerifiedFollowupItem {
  id: string;
  label: string;
  star: boolean;
  judgment: FollowupJudgment;
  requested: string;
  cardThen: string;
  cardQuote: string;
  /** 현재 카드 글과 대조: true 원문 확인 · false 다름 · null 인용 없음 */
  cardQuoteOk: boolean | null;
  inspectionQuote: string;
  /** 점검표(요구·카드·질의·근거) 글과 대조 */
  inspectionQuoteOk: boolean | null;
  remaining: string;
  /** AI 답에서 빠져 코드가 채운 행 */
  missing: boolean;
}

export interface VerifiedFollowup {
  period: string;
  statusLabel: string;
  focus: boolean;
  counts: Record<FollowupJudgment, number> & { total: number };
  items: VerifiedFollowupItem[];
  recheckCount: number;
  notice: string;
}

const stripQuote = (q: string) => q.replace(/[「」]/g, "").trim();
const idKey = (s: string) => s.trim().toLowerCase();

/**
 * 인용 대조: 글자·숫자만 남겨 원문에 들어 있어야 확인. 지침이 허용하는 줄인 인용(「… 」로 가운데·끝을 생략)은 「…」로 나눈 조각이
 * 모두 원문에 순서대로 들어 있으면 확인(compactKey가 「…」를 지우므로 나눈 뒤에 정리). 글자 합이 6자 미만이면 확인 아님, 빈 인용은 null
 */
function quoteOk(quote: string, haystack: string): boolean | null {
  const parts = stripQuote(quote)
    .split(/…|\.{3}/)
    .map(compactKey)
    .filter(Boolean);
  if (!parts.length) return null;
  if (parts.join("").length < 6) return false;
  const hay = compactKey(haystack);
  let at = 0;
  for (const p of parts) {
    const i = hay.indexOf(p, at);
    if (i < 0) return false;
    at = i + p.length;
  }
  return true;
}

/**
 * AI 답 → 검증된 대조표. 점검표 행을 기준으로 맞춘다 — 빠진 행은 「확인 불가」로 채우고, 중복 id는 첫 건만 쓰고, 모르는 id는 버린다.
 * 반영됨이면 남은 할 일을 비운다. 요약 수치(counts)는 코드가 센다.
 */
export function verifyFollowup(answer: FollowupAnswer[] | null | undefined, basis: FollowupBasis, cardText: string): VerifiedFollowup {
  const byId = new Map<string, FollowupAnswer>();
  for (const a of answer ?? []) {
    const k = idKey(a.id);
    if (!byId.has(k)) byId.set(k, a);
  }
  const items = basis.rows.map((r): VerifiedFollowupItem => {
    const a = byId.get(idKey(r.id));
    const base = { id: r.id, label: r.label, star: r.star, requested: r.requested, cardThen: r.cardThen };
    if (!a) return { ...base, judgment: "확인 불가", cardQuote: "", cardQuoteOk: null, inspectionQuote: "", inspectionQuoteOk: null, remaining: MISSING_REMAINING, missing: true };
    const hay = [r.requested, r.cardThen, r.question, ...r.evidence].join(" ");
    return {
      ...base,
      judgment: a.judgment,
      cardQuote: stripQuote(a.card_quote),
      cardQuoteOk: quoteOk(a.card_quote, cardText),
      inspectionQuote: stripQuote(a.inspection_quote),
      inspectionQuoteOk: quoteOk(a.inspection_quote, hay),
      remaining: a.judgment === "반영됨" ? "" : a.remaining.trim(),
      missing: false,
    };
  });
  const counts = { 반영됨: 0, "일부 반영": 0, 미반영: 0, "확인 불가": 0, total: items.length };
  for (const it of items) counts[it.judgment] += 1;
  return { period: basis.period, statusLabel: basis.statusLabel, focus: basis.focus, counts, items, recheckCount: basis.recheck.length, notice: FOLLOWUP_NOTICE };
}

/** 칸 글의 줄바꿈·구분 기호( | )를 풀어 한 줄로. 빈 칸은 — */
const oneLine = (s: string) => s.replace(/\s*\n\s*/g, " / ").replace(/\s\|\s/g, " / ").trim() || "—";

/** 요청에 붙이는 「점검표 보완 요구」 블록(문구는 request.md followup.* 절) */
export function followupBlock(p: PromptSet, b: FollowupBasis): string {
  const parts = [fillFrom(p, "request", "followup.head", { period: b.period, status: b.statusLabel, count: b.rows.length, focus: b.focus ? "예" : "아니오" })];
  for (const r of b.rows) {
    parts.push(
      fillFrom(p, "request", "followup.row", {
        id: r.id,
        label: r.label,
        star: r.star ? "★" : "",
        requested: oneLine(r.requested),
        cardThen: oneLine(r.cardThen),
        question: oneLine(r.question),
        evidence: oneLine(r.evidence.join(" + ")),
      }),
    );
  }
  if (b.recheck.length) {
    parts.push(fillFrom(p, "request", "followup.recheck", { items: b.recheck.map((x) => `${x.label} — ${x.judgment}${x.note ? `(${oneLine(x.note)})` : ""}`).join(" / ") }));
  }
  return parts.join("\n");
}
