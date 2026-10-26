import "server-only";

import { createClient } from "@supabase/supabase-js";
import { supabaseEnv } from "./env.ts";

/**
 * 서비스 키 클라이언트(RLS 우회). 계정 만들기·최근 접속 조회처럼 Auth 관리 API가 필요한 곳에서만,
 * 호출 전에 반드시 관리자 확인(requireRole)을 거칩니다. 일반 데이터 조회·수정에는 쓰지 않습니다.
 * 예외 하나: 로그인 사용자 없이 도는 백그라운드 처리기(lib/prep/store.ts)가 씁니다 — 쓸 수 있는 표를
 * 매칭·준비물 표로 한정하고(lib/prep/tables.ts) 작업 등록은 로그인 사용자 권한(RLS)이 확인합니다
 * (docs/reference-materials.md §8, 결정 D13).
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SECRET_KEY가 필요합니다(서버 전용)");
  return createClient(supabaseEnv().url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
