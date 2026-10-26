// 요청마다 Supabase 세션 쿠키를 갱신하고, 로그인하지 않은 요청은 로그인 화면으로 보냅니다(낙관적 확인).
// 실제 권한 판정은 DB(RLS)와 lib/auth/dal.ts가 합니다.

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { supabaseEnv } from "./lib/supabase/env.ts";
import { isPublicPath } from "./lib/auth/public-paths.ts";
import { authCallbackSearch } from "./lib/auth/redirect.ts";


export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { url, publishableKey } = supabaseEnv();
  const supabase = createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
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
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)"],
};
