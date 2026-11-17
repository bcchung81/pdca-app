import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { appWriteHeaders } from "./app-write.ts";
import { AUTH_COOKIE_OPTIONS } from "./cookie-options.ts";
import { supabaseEnv } from "./env.ts";

/**
 * 요청마다 새로 만드는 서버용 Supabase 클라이언트(로그인 사용자 권한 = RLS 적용).
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없으므로 세션 갱신은 proxy.ts가 맡고, 여기서 쓰기 실패는 무시합니다.
 * 세션 쿠키는 httpOnly(로그인 확인·로그아웃·작업 클라이언트 갱신이 여기서 쿠키를 씀 — lib/supabase/cookie-options.ts).
 * 앱 서버 경유 표지(x-app-write — APP_WRITE_KEY가 있을 때만, lib/supabase/app-write.ts)를 실음: DB 쓰기 정책이 앱 밖 요청과 가름
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();
  return createServerClient(url, publishableKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    global: { headers: appWriteHeaders() },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // 서버 컴포넌트 렌더 중 호출 — proxy.ts가 갱신된 쿠키를 씁니다.
        }
      },
    },
  });
}
