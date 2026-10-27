// 경평 초안 부서 제출(순수) — 부서 보고서(사업 × 부서 × 연도)는 「과제별 초안 묶음 + 계량 실적 + 추가자료」를 내는 단위
// (2026-09-27 사용자 결정 「직접 쓰기는 부서 흐름에서 뺌 · 초안 필수 + 나머지 경고 · 잠금은 DB 트리거 + 액션 + 화면」).
// 제출 조건: 목차에 든(제외 아닌) 과제 모두 과제별 초안(spec)이 있음 — 필수. 다시 만들기 권장·채울 자료·없는 숫자·판면 넘침은 확인 목록(막지 않음).
// 부서 화면 표·제출 확인 창·서버 제출 검사·성과관리팀 제출 관리판이 같은 셈을 씀.

import { needsIn } from "./actuals.ts";
import { figuresOf } from "./blocks.ts";
import { SUBMIT_OVER } from "./fit.ts";
import { type ReportSectionSpec, sectionText } from "./section.ts";

/** 성과관리팀 검토 메모 상한(DB check reports.review_note와 같음) */
export const REVIEW_NOTE_MAX = 2000;

/** 판면 넘침 경고 기준(초안 어림 ÷ 예산 1.04) — 값은 판면 판정(fitVerdict)과 함께 fit.ts에 둠(fit.ts가 이 파일을 읽으면 순환), 예전 import 그대로 쓰게 다시 내보냄 */
export { SUBMIT_OVER };

export interface SubmitCard {
  id: string;
  /** 카드 uid(화면 링크) */
  uid: string;
  taskNo: string;
  title: string;
  /** 목차에서 뺀 과제(report_outline.included = false)는 제출 조건에서 빠짐. 목차 줄이 없으면 든 것으로 봄 */
  included: boolean;
  /** 목차·쪽 배정 쪽수(없으면 null) */
  pages: number | null;
  /** 원장 개정 번호(cards.data_rev) */
  dataRev: number | null;
  draft: {
    spec: ReportSectionSpec | null;
    /** 초안을 만들 때 원장 개정 번호 — 지금과 다르면 다시 만들기 권장 */
    sourceRev: number | null;
    unknownNumbers: string[];
    /** 구성안만 있음(outline 있고 spec 없음) */
    outlineOnly?: boolean;
    /** 구성안 원자료(card_report_drafts.outline) — 「자료 요청」(lib/reports/material-requests.ts)이 재료표의 자료 필요를 뽑음 */
    outline?: unknown;
  } | null;
}

export type DraftState = "none" | "outline" | "draft" | "stale";
export const DRAFT_STATE_LABEL: Record<DraftState, string> = { none: "초안 없음", outline: "구성안만", draft: "초안 있음", stale: "다시 만들기 권장" };

/** 과제 하나의 초안 상태·확인할 것 수(부서 화면 표 한 줄) */
export interface CardSubmitRow {
  id: string;
  uid: string;
  taskNo: string;
  title: string;
  included: boolean;
  pages: number | null;
  state: DraftState;
  /** 판면 어림 ÷ 예산(%) — 초안이 없거나 어림이 없으면 null */
  fitPct: number | null;
  /** 【확인: …】 자리표시 수 */
  needs: number;
  /** 그림 자리표시 수 */
  figures: number;
  unknown: number;
  /** 사람이 고친 블록 수 */
  humanEdits: number;
}

export function cardSubmitRow(c: SubmitCard): CardSubmitRow {
  const spec = c.draft?.spec ?? null;
  const state: DraftState = !c.draft || (!spec && !c.draft.outlineOnly) ? "none" : !spec ? "outline" : c.draft.sourceRev !== null && c.dataRev !== null && c.draft.sourceRev !== c.dataRev ? "stale" : "draft";
  const fit = spec?.fit;
  return {
    id: c.id,
    uid: c.uid,
    taskNo: c.taskNo,
    title: c.title,
    included: c.included,
    pages: c.pages,
    state,
    fitPct: fit?.budget ? Math.round((fit.total / fit.budget) * 100) : null,
    needs: spec ? needsIn(sectionText(spec)).length : 0,
    figures: spec?.blocks ? figuresOf(spec.blocks).length : 0,
    unknown: spec ? c.draft?.unknownNumbers.length ?? 0 : 0,
    humanEdits: spec?.humanEdits?.length ?? 0,
  };
}

export interface SubmitReadiness {
  /** 제출할 수 있음(목차에 든 과제 모두 초안 있음) */
  ready: boolean;
  /** 목차에 든 과제 수 · 그중 초안(spec) 있는 수 */
  total: number;
  drafted: number;
  /** 초안이 없는 과제(구성안만 있는 과제 포함) — 제출을 막음 */
  missing: Array<{ taskNo: string; title: string; state: DraftState }>;
  /** 확인할 것(막지 않음) — 제출 확인 창·제출 관리판 */
  checks: string[];
  rows: CardSubmitRow[];
}

const list = (rows: CardSubmitRow[]) => rows.map((r) => r.taskNo).join("·");

/** 부서 보고서 제출 조건 — 과제별 초안이 모두 있어야 제출, 나머지는 확인 목록 */
export function submitReadiness(cards: SubmitCard[]): SubmitReadiness {
  const rows = cards.map(cardSubmitRow);
  const inc = rows.filter((r) => r.included);
  const missing = inc.filter((r) => r.state === "none" || r.state === "outline").map((r) => ({ taskNo: r.taskNo, title: r.title, state: r.state }));
  const drafted = inc.filter((r) => r.state === "draft" || r.state === "stale");
  const checks: string[] = [];
  const stale = drafted.filter((r) => r.state === "stale");
  if (stale.length) checks.push(`다시 만들기 권장 ${stale.length}건(초안 뒤 원장이 바뀜): ${list(stale)}`);
  const needs = drafted.filter((r) => r.needs);
  if (needs.length) checks.push(`채울 올해 값 【확인】 ${needs.reduce((n, r) => n + r.needs, 0)}곳: ${list(needs)}`);
  const figs = drafted.filter((r) => r.figures);
  if (figs.length) checks.push(`그림 자리 ${figs.reduce((n, r) => n + r.figures, 0)}곳(사진·삽화를 넣을 곳): ${list(figs)}`);
  const unknown = drafted.filter((r) => r.unknown);
  if (unknown.length) checks.push(`근거에 없는 숫자 ${unknown.reduce((n, r) => n + r.unknown, 0)}개: ${list(unknown)}`);
  const over = drafted.filter((r) => r.fitPct !== null && r.fitPct > SUBMIT_OVER * 100);
  if (over.length) checks.push(`판면 넘침 ${over.length}건: ${over.map((r) => `${r.taskNo} ${r.fitPct}%`).join("·")}`);
  return { ready: inc.length > 0 && missing.length === 0, total: inc.length, drafted: drafted.length, missing, checks, rows };
}

/** 확정(·남은 제출)을 막는 까닭 한 줄(서버 액션·화면 단추 title) — 2026-10-27부터 부서는 제출 대신 확정 */
export function submitBlockedReason(r: SubmitReadiness): string | null {
  if (r.ready) return null;
  if (!r.total) return "확정할 과제가 없습니다(목차에서 모두 빠짐).";
  return `과제별 초안이 없는 과제 ${r.missing.length}건이 있어 확정할 수 없습니다: ${r.missing.map((m) => `${m.taskNo}${m.state === "outline" ? "(구성안만)" : ""}`).join("·")}`;
}
