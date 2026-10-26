// 경평 집필 자동 고치기 판단(순수, 2026-10-10 개선 계획 B2b·B2d — 병목 실측: 평가 라운드 28건 모두 고치기를 한 번 더 돌아 집필 중앙 490초·최대 744초).
// ① 판면·올해 실적·짜임 문제만 고치기를 부름(문장 문제만이면 경고로 남김) ② 남은 시간이 1차 호출 시간 × 1.1보다 짧으면 건너뜀 —
// 함수 시간 제한(maxDuration 800초)에서 끊기면 1차·2차 결과를 모두 잃으므로(1차 초안은 lib/ai/run.ts onFirst로 먼저 저장).

import { fitReport, fitScore } from "../reports/fit.ts";
import type { SectionCheck } from "../reports/section.ts";

/** 고치기를 시작해도 되는 마지막 시각(집필 호출 시작부터 ms) — 800초 함수 제한에서 저장·준비 여유를 뺌 */
export const FIX_DEADLINE_MS = 690_000;

/**
 * 이 환경의 고치기 기한 — 함수 시간 제한이 있는 Vercel에서만 FIX_DEADLINE_MS, 그 밖(로컬 개발·연기 시험)은 제한 없음(Infinity).
 * 2026-10-10 실검증: 로컬 CLI 바로 만들기 1차가 507초라 Vercel용 기한에 걸려 고치기를 건너뛰고 판면 83%·짜임 경고인 초안이 저장됐음(계획서 §10 E1)
 */
export function fixDeadlineMs(env: Record<string, string | undefined> = process.env): number {
  return env.VERCEL ? FIX_DEADLINE_MS : Infinity;
}

/** 1차 호출 시간으로 고치기 호출 시간을 어림하는 배수 */
const FIX_COST = 1.1;

export interface FirstIssues {
  need: string | null;
  year: number;
  compose: number;
  prose: number;
}

export type FixDecision = { fix: true } | { fix: false; reason: "none" | "prose-only" | "time" };

/** elapsedMs = 집필 호출 시작부터 지금까지, firstMs = 1차 호출에 걸린 시간 */
export function shouldFix(issues: FirstIssues, elapsedMs: number, firstMs: number, deadlineMs = FIX_DEADLINE_MS): FixDecision {
  const structural = Boolean(issues.need) || issues.year > 0 || issues.compose > 0;
  if (!structural) return { fix: false, reason: issues.prose > 0 ? "prose-only" : "none" };
  if (!canFixAgain(elapsedMs, firstMs, deadlineMs)) return { fix: false, reason: "time" };
  return { fix: true };
}

/**
 * 한 번 더 부를 시간이 있나 — 지금까지 걸린 시간 + 직전 호출 시간 × 1.1 ≤ 기한. 첫 고치기(shouldFix)와 「판면만 한 번 더」(lib/ai/run.ts)가 같이 씀.
 * 예전 「판면만 한 번 더」는 170초(함수 제한 300초 시절 값) 안일 때만이라 평가 75건 중 2번만 돌았음 — 돌았어야 할 18건(고른 판이 ±4~8% 밖)을 막았음(계획서 §10 E7)
 */
export function canFixAgain(elapsedMs: number, lastCallMs: number, deadlineMs = FIX_DEADLINE_MS): boolean {
  return elapsedMs + lastCallMs * FIX_COST <= deadlineMs;
}

/**
 * 고친 판 고르기 점수(낮을수록 좋음) = 판면 점수 + 문제 하나마다 무게. 기준 사다리(근거 > 판면 > 올해 실적 > 짜임 > 문장)를 따라
 * 없는 숫자 하나 = 50(≈ 넘침 25mm — 2026-10-10 계획서 §10 E3: 예전에는 없는 숫자를 안 셈 — 고치기가 근거 없는 숫자를 새로 만들어도 그 판을 고를 수 있었음),
 * 올해 실적 문제 40(판면이 조금 나빠져도 올해 실적을 고친 쪽), 짜임 문제(이 과제만의 요소 없음) 20, 문장 문제 10
 */
export const SCORE_WEIGHT = { unknown: 50, year: 40, compose: 20, prose: 10 } as const;
export function draftScore(c: Pick<SectionCheck, "spec" | "unknownNumbers" | "yearIssues" | "composeIssues" | "proseIssues">): number {
  return (
    fitScore(fitReport(c.spec)) +
    c.unknownNumbers.length * SCORE_WEIGHT.unknown +
    c.yearIssues.length * SCORE_WEIGHT.year +
    c.composeIssues.length * SCORE_WEIGHT.compose +
    c.proseIssues.length * SCORE_WEIGHT.prose
  );
}

/**
 * 집필 AI 기록(ai_requests.timings)에 남길 값 — 전체·1차·고치기·「판면만 한 번 더」 ms와 고친 횟수, 고치기를 건너뛴 이유(계획서 §10 E5).
 * 없는 값은 키째 뺌(시간이 없는 단계와 0초를 구분)
 */
export function draftTimings(callMs: number, passes: number, trace: { firstMs?: number; fixMs?: number; againMs?: number; skipped?: string }): Record<string, number | string> {
  return {
    call: callMs,
    passes,
    ...(trace.firstMs ? { first: trace.firstMs } : {}),
    ...(trace.fixMs ? { fix: trace.fixMs } : {}),
    ...(trace.againMs ? { again: trace.againMs } : {}),
    ...(trace.skipped ? { skip: trace.skipped } : {}),
  };
}
