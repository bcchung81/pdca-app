// AI API 오류 분류·안내·재시도 판단(순수, 2026-10-10 개선 계획 P1-3). 예전에는 속도 제한만 따로 안내하고 과부하(529)·시간 초과·연결 끊김을
// 「AI 서비스 오류(?)」로 뭉뚱그렸고, 스트림 도중 과부하가 나면 5~10분·출력 5~7만 토큰 작업을 재시도 없이 잃었음.

import Anthropic from "@anthropic-ai/sdk";
import { isCreditBalanceError, isSpendLimitError } from "./provider.ts";

/** spend = 월 지출 한도(조직 등급 한도 429 enforced_spend_limit_reached · 조직이 정한 한도 400 「specified API usage limits」) — 다음 달 1일까지 재시도해도 실패 */
export type ApiErrorKind = "rate" | "overloaded" | "server" | "timeout" | "connection" | "auth" | "credit" | "spend" | "bad_request";

/** 등급 지출 한도 오류 코드(429 rate_limit_error의 details.error_code — retry-after 없음) */
const SPEND_CODE = "enforced_spend_limit_reached";

/** SDK 오류 → 종류(SDK 오류가 아니면 null). 스트림 도중 오류는 상태 코드 없이 본문 error.type(overloaded_error 등)만 옴 — 지출 한도도 본문(details.error_code·메시지)으로 가름 */
export function apiErrorKind(e: unknown): ApiErrorKind | null {
  // 호출 전체 마감(API_TOTAL_MS)을 signal로 넘겨 멈춘 경우 — 우리 말고는 이 호출을 끊는 이가 없으므로 시간 초과(APIError의 하위 클래스라 APIError 판정보다 먼저)
  if (e instanceof Anthropic.APIUserAbortError) return "timeout";
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (e instanceof Anthropic.APIConnectionError) return "connection";
  if (!(e instanceof Anthropic.APIError)) return null;
  const body = (e.error as { error?: { type?: string; message?: string; details?: { error_code?: string } } } | undefined)?.error;
  const type = body?.type;
  // 월 지출 한도는 속도 제한(429)·요청 거절(400)보다 먼저 — 잠시 뒤 다시 해도 풀리지 않음
  if (body?.details?.error_code === SPEND_CODE || e.message.includes(SPEND_CODE) || isSpendLimitError(body?.message ?? "") || isSpendLimitError(e.message)) return "spend";
  if (e.status === 429 || type === "rate_limit_error") return "rate";
  if (e.status === 529 || type === "overloaded_error") return "overloaded";
  if (e.status === 401 || e.status === 403) return "auth";
  if (e.status === 402 || type === "billing_error") return "credit";
  if (e.status === 400 || type === "invalid_request_error") return isCreditBalanceError(e.message) ? "credit" : "bad_request";
  if ((e.status ?? 0) >= 500 || type === "api_error") return "server";
  return "server";
}

/** 종류별 안내(사용자가 할 일) */
export function apiErrorMessage(kind: ApiErrorKind): string {
  switch (kind) {
    case "rate":
      return "AI 사용량이 몰렸습니다(속도 제한). 1분 뒤 다시 시도해 주세요.";
    case "overloaded":
      return "AI 서비스에 요청이 몰려(과부하) 답을 끝내지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    case "server":
      return "AI 서비스 오류로 답을 받지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    case "timeout":
      return "AI 답이 시간 안에 오지 않았습니다. 다시 만들어 보거나 요청·첨부를 좁혀 주세요.";
    case "connection":
      return "AI 서비스와 연결이 끊겼습니다. 다시 시도해 주세요.";
    case "auth":
      return "AI 키가 올바르지 않습니다. 관리자에게 알려 주세요.";
    case "credit":
      return "AI 사용 크레딧이 부족합니다. 관리자에게 알려 주세요.";
    case "spend":
      return "이번 달 AI API 사용 한도에 닿았습니다 — 관리자에게 알려 주세요(다음 달 1일에 풀리거나 한도를 올려야 함).";
    case "bad_request":
      return "AI 요청이 거절됐습니다(첨부 자료나 요청을 확인해 주세요).";
  }
}

/**
 * 그 키를 소진 표시하고 다음 키(예비 키)로 같은 요청을 보낼 오류인가 — 크레딧 부족·월 지출 한도(둘 다 처리 전에 거절돼 과금 없음, 키마다 조직이 다르면 다른 키는 됨).
 * 속도 제한·과부하 등은 키를 바꾸지 않음(프롬프트 캐시가 조직 단위라 키를 오가면 캐시가 끊김)
 */
export const switchesKey = (kind: ApiErrorKind | null): boolean => kind === "credit" || kind === "spend";

/** 재시도는 과부하·연결 끊김만, 첫 시도에서, 시작 60초 안(그 뒤는 생성이 많이 진행돼 다시 하면 비용·시간이 두 배) */
export const RETRY_WINDOW_MS = 60_000;
export function shouldRetryApi(kind: ApiErrorKind | null, elapsedMs: number, attempt: number): boolean {
  return attempt === 0 && (kind === "overloaded" || kind === "connection") && elapsedMs < RETRY_WINDOW_MS;
}

/**
 * API 호출 한 번의 전체 제한 770초 = 함수 한도(maxDuration 800초) − 자료 읽기·저장 여유 30초(사용자 결정 2026-11-13).
 * SDK의 `timeout`은 응답 머리가 올 때까지만 걸고 fetch가 끝나면 풀려서 스트리밍 생성 시간은 안 묶음 — 그래서 호출 전체(키 교차·재시도 포함)를 이 마감의 AbortSignal로 묶음.
 * 마감을 못 지키면 Vercel이 함수를 끊어 running 행이 20분 뒤에야 실패로 닫힘(AI_LIMITS.staleMs)
 */
export const API_TOTAL_MS = 770_000;

/** 시작(startMs)부터 totalMs 마감까지 남은 시간(ms). 0 이하로 내려가지 않음 */
export function remainingMs(startMs: number, nowMs: number, totalMs: number = API_TOTAL_MS): number {
  return Math.max(0, totalMs - (nowMs - startMs));
}

/** 마감을 넘었나(남은 시간 0) — 넘었으면 다음 키·재시도를 시작하지 않고 시간 초과로 끝냄 */
export const deadlinePassed = (startMs: number, nowMs: number, totalMs: number = API_TOTAL_MS): boolean => remainingMs(startMs, nowMs, totalMs) <= 0;
