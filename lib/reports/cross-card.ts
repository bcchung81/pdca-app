// C2 실적 중복 계상 후보(순수, 입출력 없음) — 같은 실적이 서로 다른 카드의 월별 실적·정량 성과에 함께 적힌 경우를 찾음.
// 경영관리 외부 컨설팅 2차(2026.11)에서 되풀이된 지적: 보고서에서 같은 행사·인증을 두 번 셀 수 있음. 카드 한 장 안에서는 안 보여 성과관리팀 화면에만 둠.
// 판단은 참고용(막힘 아님) — 글을 바꾸지 않고 사람이 두 카드를 열어 확인한다.

import type { LooseJson } from "../loose-json.ts";
import { compareTaskNo } from "../cards/view.ts";
import { bigramDice } from "../knowledge/similarity.ts";

type Json = LooseJson;

/** 이름이 닮았다고 보는 글자 두 개 겹침 문턱(실제 글 모양: 같은 행사를 두 카드가 다르게 쓴 줄 0.5~0.8, 날짜만 같은 다른 일 0.1 아래) */
export const DUP_SIMILARITY = 0.4;
/** 날짜·흔한 낱말을 걷고 남은 글이 이보다 짧으면 비교하지 않음(「운영」 같은 한 낱말만 겹치는 오탐 방지) */
export const DUP_MIN_CHARS = 5;
/** 화면에 내는 묶음 상한 */
export const DUP_LIMIT = 30;

/** 흔한 낱말 — 이것만 겹치면 같은 실적이라 보지 않음(행사 이름이 아니라 업무 동사·명사) */
const COMMON = [
  "교육", "회의", "추진", "실시", "운영", "개최", "진행", "참여", "참석", "지원", "시행", "수행", "개선", "점검", "협의", "실적", "계획", "결과", "성과", "완료", "달성", "구축", "확대", "강화",
  "관련", "대상", "통해", "위해", "대한", "등을", "하여", "하고", "함", "및", "관리", "사업", "과제", "기관", "공단", "부서", "전체",
];
const COMMON_RE = new RegExp(COMMON.join("|"), "g");

/** 월.일 날짜: 「7.12.」「7. 12」「7월 12일」 — 월·일 둘 다 있어야 함(월만 있는 줄은 후보로 삼지 않음) */
const DATE_RE = /(?:[’']\d{2}\s*[.년]\s*)?(\d{1,2})\s*(?:\.\s?|월\s*)(\d{1,2})\s*(?:\.|일)?(?!\d)/g;

export interface CrossCardLine {
  taskNo: string;
  cardId: string;
  /** 줄 글(월별 실적 줄·정량 성과 줄 그대로) */
  text: string;
}

export interface DuplicateCandidate {
  /** 같은 날짜 「M.D」 */
  date: string;
  /** 서로 다른 카드의 줄들(과제번호 순) */
  lines: CrossCardLine[];
  /** 묶음 안 가장 닮은 두 줄의 글자 두 개 겹침(0~1, 소수 둘째 자리) */
  score: number;
}

export interface CrossCardInput {
  id: string;
  taskNo: string;
  status?: string;
  data: Json;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** 카드에서 월별 실적 줄(do.monthly[].items 글줄)과 정량 성과 줄(outcome.quantitative 글줄)을 그대로 모음 — 표 형태 항목은 보지 않음 */
export function cardActualLines(card: Json): string[] {
  const out: string[] = [];
  for (const m of Array.isArray(card?.do?.monthly) ? card.do.monthly : []) for (const it of Array.isArray(m?.items) ? m.items : []) if (typeof it === "string" && str(it)) out.push(str(it));
  for (const q of Array.isArray(card?.outcome?.quantitative) ? card.outcome.quantitative : []) if (typeof q === "string" && str(q)) out.push(str(q));
  return out;
}

/** 줄 글의 월.일 날짜들(「M.D」, 중복 없음) */
export function datesOf(text: string): string[] {
  const set = new Set<string>();
  for (const m of text.matchAll(DATE_RE)) {
    const mo = Number(m[1]);
    const d = Number(m[2]);
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) set.add(`${mo}.${d}`);
  }
  return [...set];
}

/** 이름 비교용 글: 날짜·괄호 안 부연·숫자·기호·흔한 낱말을 걷고 한글·영문만 남김 */
export function nameKey(text: string): string {
  return text
    .replace(DATE_RE, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(COMMON_RE, " ")
    .replace(/[^가-힣A-Za-z]+/g, "");
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * 후보 묶음: 날짜가 같고 이름이 닮은 줄이 서로 다른 카드에 있을 때. 한 카드 안의 중복·날짜만 같은 줄·흔한 낱말만 겹치는 줄은 뺌.
 * 같은 입력이면 같은 출력(점수 내림차순 → 날짜 → 과제번호), 상한 DUP_LIMIT.
 */
export function crossCardDuplicates(cards: CrossCardInput[], limit = DUP_LIMIT): DuplicateCandidate[] {
  const items: Array<CrossCardLine & { date: string; key: string }> = [];
  for (const c of cards) {
    if (c.status && c.status !== "active") continue;
    const seen = new Set<string>();
    for (const text of cardActualLines(c.data)) {
      if (seen.has(text)) continue;
      seen.add(text);
      const key = nameKey(text);
      if ([...key].length < DUP_MIN_CHARS) continue;
      for (const date of datesOf(text)) items.push({ taskNo: c.taskNo, cardId: c.id, text, date, key });
    }
  }
  const byDate = new Map<string, typeof items>();
  for (const it of items) byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  const out: DuplicateCandidate[] = [];
  for (const [date, list] of byDate) {
    // 서로 다른 카드의 닮은 쌍을 이어 묶음으로(같은 행사가 세 카드에 있으면 한 묶음)
    const parent = list.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const best = new Map<number, number>();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].cardId === list[j].cardId) continue;
        const s = bigramDice(list[i].key, list[j].key);
        if (s < DUP_SIMILARITY) continue;
        parent[find(i)] = find(j);
        best.set(i, Math.max(best.get(i) ?? 0, s));
        best.set(j, Math.max(best.get(j) ?? 0, s));
      }
    }
    const groups = new Map<number, number[]>();
    for (const i of best.keys()) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
    for (const idx of groups.values()) {
      const lines = idx
        .map((i) => ({ taskNo: list[i].taskNo, cardId: list[i].cardId, text: list[i].text }))
        .sort((a, b) => compareTaskNo(a.taskNo, b.taskNo) || a.text.localeCompare(b.text, "ko"));
      out.push({ date, lines, score: round(Math.max(...idx.map((i) => best.get(i) ?? 0))) });
    }
  }
  return out
    .sort((a, b) => b.score - a.score || compareDate(a.date, b.date) || compareTaskNo(a.lines[0].taskNo, b.lines[0].taskNo))
    .slice(0, limit);
}

function compareDate(a: string, b: string): number {
  const [am, ad] = a.split(".").map(Number);
  const [bm, bd] = b.split(".").map(Number);
  return am - bm || ad - bd;
}
