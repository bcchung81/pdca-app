// 요청마다 Supabase 세션 쿠키를 갱신하고, 로그인하지 않은 요청은 로그인 화면으로 보냅니다(낙관적 확인).
// 실제 권한 판정은 DB(RLS)와 lib/auth/dal.ts가 합니다.

import { createServerClient } from "@supabase/ssr";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "./lib/supabase/env.ts";
import { AUTH_COOKIE_OPTIONS } from "./lib/supabase/cookie-options.ts";
import { isPublicPath } from "./lib/auth/public-paths.ts";
import { authCallbackSearch } from "./lib/auth/redirect.ts";
import { SEEN_COOKIE, SEEN_COOKIE_OPTIONS, isDocumentVisit, seenToday, seenValue } from "./lib/ops/access-log-core.ts";
import { logAccessFrom } from "./lib/ops/access-log.ts";
import { makeNonce, reportOnlyApplies, reportOnlyCsp } from "./lib/security/csp.ts";


export async function proxy(request: NextRequest, event: NextFetchEvent) {
  // 스크립트 CSP(Report-Only — lib/security/csp.ts): 요청 머리글로 넘기면 Next가 nonce를 읽어 프레임워크 스크립트에 붙임.
  // 사본은 NextResponse.next를 만들 때마다 그 시점의 request.headers로 새로 만듦(setAll이 갱신 쿠키를 request에 반영한 뒤여야 서버 컴포넌트까지 감)
  const csp = reportOnlyCsp(makeNonce(), process.env.NODE_ENV === "development");
  const withCsp = () => {
    const headers = new Headers(request.headers);
    headers.set("content-security-policy-report-only", csp);
    return { request: { headers } };
  };
  let response = NextResponse.next(withCsp());
  const { url, publishableKey } = supabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    // 세션 쿠키는 httpOnly(스크립트가 못 읽음 — lib/supabase/cookie-options.ts)
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next(withCsp());
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // 응답을 만들기 전에 세션을 읽어야 갱신된 토큰이 쿠키로 나갑니다.
  const { data } = await supabase.auth.getClaims();
  const path = request.nextUrl.pathname;
  // 루트로 온 메일 링크(?code= 등 — Supabase가 Site URL로 보냄)는 확인 화면으로
  const callback = authCallbackSearch(path, request.nextUrl.searchParams);
  if (callback) {
    const confirm = request.nextUrl.clone();
    confirm.pathname = "/auth/confirm";
    confirm.search = callback;
    const redirect = NextResponse.redirect(confirm);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  // 로그인·메일 링크 확인·크론 처리기(/api/prep/run — 라우트 안에서 CRON_SECRET으로 인증)만 — lib/auth/public-paths.ts
  const isPublic = isPublicPath(path);

  if (!data?.claims && !isPublic) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = path === "/" ? "" : `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    const redirect = NextResponse.redirect(login);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  // 하루 첫 접속 기록(접속 기록 visit — 20261118140000): 로그인 상태 + 공개 경로 아님 + 화면 문서를 여는 GET(lib/ops/access-log-core.ts isDocumentVisit —
  // RSC 갱신·미리 불러오기·서버 액션 POST·/api·내려받기 라우트는 빼고)이고, 표식 쿠키가 「오늘(서울) + 이 사용자」가 아니면 한 줄 남기고 쿠키를 심음.
  // 기록은 응답 뒤(waitUntil)라 화면을 늦추지 않고, 실패해도 응답은 그대로(한 줄 로그). 쿠키는 결과를 기다리지 않고 심음 — DB가 실패해도 탐색마다 다시 시도하지 않게.
  // 이 클라이언트에는 표지 머리글이 없어 logAccessFrom이 이 rpc 요청에만 실음(lib/ops/access-log.ts)
  const sub = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (sub && !isPublic && isDocumentVisit(request.method, path, request.headers)) {
    const now = Date.now();
    if (!seenToday(request.cookies.get(SEEN_COOKIE)?.value, sub, now)) {
      event.waitUntil(logAccessFrom(supabase, { action: "visit", target: path.slice(0, 200) }, request.headers));
      response.cookies.set(SEEN_COOKIE, seenValue(sub, now), SEEN_COOKIE_OPTIONS);
    }
  }
  if (reportOnlyApplies(path)) response.headers.set("Content-Security-Policy-Report-Only", csp);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)"],
};
