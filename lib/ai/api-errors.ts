// AI API 오류 분류·안내·재시도 판단(순수, 2026-10-10 개선 계획 P1-3). 예전에는 속도 제한만 따로 안내하고 과부하(529)·시간 초과·연결 끊김을
// 「AI 서비스 오류(?)」로 뭉뚱그렸고, 스트림 도중 과부하가 나면 5~10분·출력 5~7만 토큰 작업을 재시도 없이 잃었음.

import Anthropic from "@anthropic-ai/sdk";
import { isCreditBalanceError } from "./provider.ts";

export type ApiErrorKind = "rate" | "overloaded" | "server" | "timeout" | "connection" | "auth" | "credit" | "bad_request";

/** SDK 오류 → 종류(SDK 오류가 아니면 null). 스트림 도중 오류는 상태 코드 없이 본문 error.type(overloaded_error 등)만 옴 */
export function apiErrorKind(e: unknown): ApiErrorKind | null {
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "timeout";
  if (e instanceof Anthropic.APIConnectionError) return "connection";
  if (!(e instanceof Anthropic.APIError)) return null;
  const type = (e.error as { error?: { type?: string } } | undefined)?.error?.type;
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
    case "bad_request":
      return "AI 요청이 거절됐습니다(첨부 자료나 요청을 확인해 주세요).";
  }
}

/** 재시도는 과부하·연결 끊김만, 첫 시도에서, 시작 60초 안(그 뒤는 생성이 많이 진행돼 다시 하면 비용·시간이 두 배) */
export const RETRY_WINDOW_MS = 60_000;
export function shouldRetryApi(kind: ApiErrorKind | null, elapsedMs: number, attempt: number): boolean {
  return attempt === 0 && (kind === "overloaded" || kind === "connection") && elapsedMs < RETRY_WINDOW_MS;
}
