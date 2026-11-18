// 로그인 없이 여는 경로(proxy.ts 낙관적 확인 — 실제 권한은 RLS·lib/auth/dal.ts). 2026-10-10 개선 계획 P2-9:
// 크론 처리기는 정확한 경로 하나만(예전 /api/prep/ 접두사 전체 → 그 아래 새 라우트가 인증 없이 열릴 수 있었음). 처리기는 라우트 안에서 CRON_SECRET(Bearer)으로 인증.

/** 정확히 같은 경로만 */
const EXACT = new Set(["/login", "/api/prep/run"]);
/** 이 접두사 아래 전부(메일 링크 확인 /auth/confirm 등) */
const PREFIX = ["/auth/"];

export function isPublicPath(path: string): boolean {
  return EXACT.has(path) || PREFIX.some((p) => path.startsWith(p));
}
