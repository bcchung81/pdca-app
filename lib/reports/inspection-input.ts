// 경평 구성안의 「월간 점검 보완 요청」(순수, 2026-10-09 — 원장 → 종합점검 → 경평 구성안 흐름).
// 이 과제의 최종 점검표(AI 작성지원 보완 점검과 같은 규칙: 부서에 보낸·확인한 것 중 점검월이 가장 늦은 1건 — lib/ai/followup.ts followupBasis)의
// 미흡 행을 구성안 요청에 넣어, 평가 논점·블록 목적이 성과관리팀이 짚은 약점을 메우게 함. 점검표 글은 판단이지 근거가 아니라
// 사실·숫자 재료로 쓰지 않고(근거 원문 대조에도 안 넣음), 집필은 승인된 구성안을 따르므로 넣지 않음.
// 요청 글은 resources/prompts/report-outline(-mg)/request.md inspection.*

import type { FollowupBasis } from "../ai/followup.ts";
import { type PromptSet, fillFrom } from "../prompts/template.ts";

/** 보완 요청·예상 질의 글 상한(자) */
const TEXT_MAX = 200;
/** 넣을 미흡 행 상한(★핵심이 앞 — followupBasis 순서) */
const ROWS_MAX = 12;

const cut = (s: string) => (s.length > TEXT_MAX ? `${s.slice(0, TEXT_MAX)}…` : s);
/** 2026-09 → ’26.9 */
const periodLabel = (p: string) => {
  const [y, m] = p.split("-");
  return y && m ? `’${y.slice(2)}.${Number(m)}` : p;
};

/** 구성안 요청 「월간 점검 보완 요청」 — 점검표가 없거나 미흡 행이 없으면 빈 글 */
export function outlineInspectionPrompt(p: PromptSet, basis: FollowupBasis | null): string {
  if (!basis?.rows.length) return "";
  const r = (key: string, vars: Record<string, string | number> = {}) => fillFrom(p, "request", key, vars);
  const lines = [r("inspection.head", { period: periodLabel(basis.period), status: basis.statusLabel, count: basis.rows.length, focus: basis.focus ? r("inspection.focus") : "" })];
  for (const x of basis.rows.slice(0, ROWS_MAX)) {
    lines.push(r("inspection.item", { label: `${x.label}${x.star ? " ★" : ""}`, requested: cut(x.requested.trim()) || "—", question: x.question.trim() ? r("inspection.question", { question: cut(x.question.trim()) }) : "" }));
  }
  lines.push(r("inspection.tail"));
  return lines.join("\n");
}

/** 진행 줄 「넣은 근거」 한 줄(화면): ’26.9 점검 · 미흡 2(집중보완) — 미흡이 없으면 null */
export function inspectionSourceLabel(basis: FollowupBasis | null): string | null {
  if (!basis?.rows.length) return null;
  return `${periodLabel(basis.period)} 점검 · 미흡 ${basis.rows.length}${basis.focus ? "(집중보완)" : ""}`;
}
