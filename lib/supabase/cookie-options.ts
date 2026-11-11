// 로그인 세션 쿠키(sb-…-auth-token) 옵션(순수 — 2026-11-10 보안 점검 T4 M3, 시험 auth-cookie.test.ts).
// @supabase/ssr 기본값은 httpOnly:false라 화면에 XSS가 하나라도 생기면 스크립트가 세션 토큰을 읽어 갈 수 있음.
// 브라우저는 세션이 필요 없음: 브라우저 Supabase 클라이언트(lib/supabase/browser.ts)는 서명 업로드(uploadToSignedUrl)에만 쓰고,
// 서명 업로드는 주소의 token으로 인증함(세션이 없으면 supabase-js가 공개 키를 Bearer로 보냄). 세션을 쓰는 곳은 서버(proxy.ts·server.ts)뿐.
// secure는 Vercel(늘 https)에서만 켬 — 로컬 http(pnpm dev·run-app.sh prod)에 붙이면 Safari 등에서 쿠키가 버려짐.
// 라이브러리가 { 기본값(path=/·sameSite=lax·maxAge), ...이 값 }으로 합쳐 쿠키 쓰기·지우기 모두에 씀.

/** 환경(VERCEL 유무)에 따른 세션 쿠키 옵션 — 시험이 환경을 바꿔 다시 계산할 수 있게 함수로 둠 */
export function authCookieOptions(env: Record<string, string | undefined> = process.env): { httpOnly: true; secure: boolean } {
  return { httpOnly: true, secure: Boolean(env.VERCEL) };
}

export const AUTH_COOKIE_OPTIONS = authCookieOptions();
