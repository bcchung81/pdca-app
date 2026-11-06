import "server-only";

import { type SupabaseClient, createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env.ts";
import { needsRefresh } from "./job-token.ts";
import { createClient } from "./server.ts";

/**
 * 백그라운드 작업(after()) 전용 사용자 권한 클라이언트(RLS 적용 — 서비스 키 아님). 서버 액션 안(시작)에서만 부름.
 * Next 문서(after.md)상 서버 액션의 after 안에서도 cookies()는 읽을 수 있지만 응답이 이미 나가 쿠키를 다시 쓸 수 없음 — 쿠키 클라이언트가 after 안에서
 * 토큰을 갱신하면 새 리프레시 토큰이 브라우저에 못 가고 옛 토큰은 재사용으로 처리돼 세션이 끊길 수 있음. 그래서 시작에서 토큰 남은 시간이 작업 최장 시간보다 짧으면
 * 여기서 먼저 갱신(쿠키는 서버 액션 응답으로 나감)하고, 그 접근 토큰을 그대로 싣고 스스로 갱신하지 않는 클라이언트를 돌려줌(lib/supabase/job-token.ts).
 * 세션이 없으면 null
 */
export async function createJobClient(): Promise<SupabaseClient | null> {
  const supabase = await createClient();
  let {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  if (needsRefresh(session.expires_at)) {
    const r = await supabase.auth.refreshSession();
    if (r.data.session) session = r.data.session;
  }
  const { url, publishableKey } = supabaseEnv();
  return createSupabaseClient(url, publishableKey, {
    global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
