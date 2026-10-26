// 작업 대기열의 순수 규칙: 새 작업 펼치기, 멈춘 작업 판정, 재시도 횟수. 입출력 없음.

import type { NewJob } from "./types.ts";

/** 실행 중인 채 이 시간이 지나면 멈춘 것으로 보고 대기로 되돌린다 */
export const STUCK_LIMIT_MS = 15 * 60_000;
/** 한 작업의 최대 시도 횟수(첫 시도 포함). 넘으면 실패로 둔다 */
export const MAX_ATTEMPTS = 2;

/** 카드마다 공통 지식 매칭 작업 하나씩. docIds를 주면 그 문서만(새 판이 온 문서), 없으면 전체 문서 */
export function fanOutMatch(cardIds: string[], docIds?: string[]): NewJob[] {
  return [...new Set(cardIds)].map((id) => ({ kind: "match_knowledge" as const, target: id, payload: docIds?.length ? { docIds: [...docIds] } : {} }));
}

/** 시작한 지 limitMs가 지났으면 멈춘 작업 */
export function isStuck(startedAt: Date | string | null, now: Date, limitMs = STUCK_LIMIT_MS): boolean {
  if (!startedAt) return false;
  return now.getTime() - new Date(startedAt).getTime() > limitMs;
}

/** 처리기가 던졌을 때: attempts(이번 시도 포함)가 최대 미만이면 다시 대기, 아니면 실패 */
export function stateAfterError(attempts: number): "queued" | "failed" {
  return attempts < MAX_ATTEMPTS ? "queued" : "failed";
}

/**
 * 멈춘(running인 채 STUCK_LIMIT_MS 넘은) 작업을 되돌릴 상태 — 예외 없이 함수가 시간 초과로 죽은 작업도 시도 횟수 상한을 지킴(2026-10-10:
 * 예전에는 무조건 다시 대기라 같은 작업이 끝없이 돌아 AI 비용이 반복될 수 있었음). 규칙은 stateAfterError와 같음
 */
export function reclaimState(attempts: number): "queued" | "failed" {
  return stateAfterError(attempts);
}
