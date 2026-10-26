import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseEnv } from "./env.ts";

/**
 * 요청마다 새로 만드는 서버용 Supabase 클라이언트(로그인 사용자 권한 = RLS 적용).
 * 서버 컴포넌트에서는 쿠키를 쓸 수 없으므로 세션 갱신은 proxy.ts가 맡고, 여기서 쓰기 실패는 무시합니다.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = supabaseEnv();
  return createServerClient(url, publishableKey, {
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
