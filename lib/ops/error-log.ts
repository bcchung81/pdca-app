// 서버 오류 구조화 로그(순수, 2026-10-10 개선 계획 P1-5 최소안) — instrumentation.ts onRequestError가 한 줄 JSON으로 남겨 Vercel 로그에서 찾게 함
// (예전에는 오류 수집이 없어 긴 AI 작업이 시간 제한에서 끊겨도 로그를 직접 뒤져야 했음). 쿠키·머리글은 남기지 않고 주소 쿼리(로그인 토큰 등)는 지움.

/** onRequestError의 request·context 중 쓰는 것만(Next 16 Instrumentation 형식) */
export interface ErrorRequest {
  path: string;
  method: string;
}
export interface ErrorContext {
  routePath: string;
  routeType: string;
}

/** 오류 한 건 → 한 줄 JSON(kind = request_error) */
export function errorLogLine(err: unknown, request: ErrorRequest, context: ErrorContext, now = Date.now()): string {
  const e = err instanceof Error ? err : null;
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  return JSON.stringify({
    t: new Date(now).toISOString(),
    kind: "request_error",
    path: request.path.split("?")[0],
    method: request.method,
    route: context.routePath,
    type: context.routeType,
    name: e?.name ?? "unknown",
    message: (e ? e.message : String(err)).slice(0, 500),
    ...(digest ? { digest } : {}),
  });
}
