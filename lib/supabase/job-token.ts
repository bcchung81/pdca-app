// 백그라운드 작업(after())이 쓰는 로그인 토큰의 남은 시간 판정(순수 — lib/supabase/job-client.ts가 씀, 시험 job-token.test.ts).
// after()는 응답을 보낸 뒤 돌아 새 쿠키를 브라우저에 보낼 수 없음. 그 안에서 토큰이 만료돼 갱신(리프레시 토큰 교체)이 일어나면 브라우저는 옛 리프레시 토큰을 들고 있다가
// 다음 갱신 때 「재사용」으로 세션이 끊길 수 있음. 그래서 시작(서버 액션 — 쿠키를 쓸 수 있음)에서 남은 시간이 작업 최장 시간보다 짧으면 먼저 갱신하고,
// after 안에서는 갱신하지 않는 클라이언트(그 토큰을 그대로 실음)를 씀.

import { AI_LIMITS } from "../ai/request-log.ts";

/** 작업 클라이언트 토큰이 남아 있어야 할 시간(가장 긴 작업 staleMs 20분 + 여유 5분) */
export const JOB_TOKEN_MIN_MS = AI_LIMITS.staleMs + 5 * 60_000;

/** expiresAt(초 — Supabase 세션 expires_at)까지 남은 시간이 min보다 짧으면 먼저 갱신. 모르면 갱신 */
export function needsRefresh(expiresAt: number | null | undefined, now = Date.now(), min = JOB_TOKEN_MIN_MS): boolean {
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return true;
  return expiresAt * 1000 - now < min;
}
