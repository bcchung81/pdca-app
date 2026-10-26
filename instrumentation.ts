// 서버 오류를 한 줄 JSON으로 남김(2026-10-10 개선 계획 P1-5 최소안 — 외부 수집기는 사용자 결정 D3). 형식·가리는 것은 lib/ops/error-log.ts
import type { Instrumentation } from "next";
import { errorLogLine } from "./lib/ops/error-log.ts";

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  console.error(errorLogLine(err, request, context));
};
