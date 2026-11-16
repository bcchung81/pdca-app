// 저장된 과제별 초안의 「없는 숫자」 다시 세기(순수, 2026-11-16 시큐어 코딩 2차 점검 후속).
// card_report_drafts의 unknown_numbers·warnings는 초안을 쓸 수 있는 사람이 앱 밖에서도 바꿀 수 있는 저장값이라(쓰기 RLS = can_write_card),
// 검토 화면·HTML 내려받기·보고서 검토는 그 값을 그대로 믿지 않고 저장 경로(edit-actions.ts recheck)와 같은 다시 점검으로 셉니다. 근거 글 읽기는 draft-recount-queries.ts.
// 보이는 값 = 저장값 ∪ 다시 센 값: 저장값을 지워도 다시 센 숫자는 남고, 저장 뒤 근거가 늘어 다시 센 값에서 빠진 숫자는 예전처럼 남음(정상 초안은 화면·내려받기가 그대로)

import type { LooseJson } from "../loose-json.ts";
import { recheckMgSection } from "./mg-draft.ts";
import { type ReportSectionSpec, recheckSection } from "./section.ts";

/** 저장 경로와 같은 다시 점검(트랙별)으로 센 근거에 없는 숫자. known = 숫자 근거 글(카드 글은 함수가 따로 셈) */
export function recountUnknown(spec: ReportSectionSpec, card: unknown, known: string): string[] {
  return (spec.mg ? recheckMgSection(spec, card as LooseJson, known) : recheckSection(spec, card as LooseJson, known)).unknownNumbers;
}

export interface UnknownView {
  /** 칠하고 셀 숫자 = 저장값 ∪ 다시 센 값(저장값 순서 먼저) */
  unknown: string[];
  /** 다시 셌더니 저장값에 없던 숫자 — 저장 뒤 근거가 줄었거나 초안을 앱 밖에서 고친 흔적 */
  added: string[];
}

/** 저장값(배열이 아니면 빈 값)과 다시 센 값을 합침 */
export function unknownView(stored: unknown, fresh: readonly string[]): UnknownView {
  const base = [...new Set(Array.isArray(stored) ? stored.map(String) : [])];
  const have = new Set(base);
  const added = [...new Set(fresh)].filter((x) => !have.has(x));
  return { unknown: [...base, ...added], added };
}

/** 초안 경고의 없는 숫자 줄(section.ts·mg-draft.ts 「…에 없는 숫자 N개 — …」, 등급은 warning-levels.ts 글 규칙으로 막힘) */
const UNKNOWN_LINE = /에 없는 숫자 \d+개/;

/**
 * 다시 센 숫자가 저장값에 없으면 경고의 없는 숫자 줄을 보이는 값으로 바꿈(줄이 없으면 맨 앞에 더함). 저장값과 같으면 경고 그대로.
 * 앞머리 없이 같은 글 모양이라 등급(막힘)·경고 표가 그대로 받음. where = 숫자 근거가 있으면 「카드·첨부 자료」, 없으면 「카드」(다시 점검과 같은 말)
 */
export function unknownWarnings(warnings: readonly string[], v: UnknownView, where: string): string[] {
  if (!v.added.length) return [...warnings];
  const rest = v.unknown.filter((x) => !v.added.includes(x));
  const line = `${where}에 없는 숫자 ${v.unknown.length}개(저장된 점검 결과에 없던 ${v.added.length}개를 다시 셈 — 저장 뒤 근거가 바뀌었거나 초안을 앱 밖에서 고쳤을 수 있음) — 원자료로 확인하거나 지워 주세요: ${[...v.added, ...rest].slice(0, 8).join(", ")}`;
  const at = warnings.findIndex((w) => UNKNOWN_LINE.test(w));
  return at < 0 ? [line, ...warnings] : warnings.map((w, i) => (i === at ? line : w));
}

/** 저장된 초안 하나를 다시 셈: 칠할 숫자·경고(저장값 그대로 넘기면 됨) */
export function recountDraft(spec: ReportSectionSpec, card: unknown, known: string, stored: { unknown: unknown; warnings: readonly string[] }): UnknownView & { warnings: string[] } {
  const v = unknownView(stored.unknown, recountUnknown(spec, card, known));
  return { ...v, warnings: unknownWarnings(stored.warnings, v, known.trim() ? "카드·첨부 자료" : "카드") };
}
