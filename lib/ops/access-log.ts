import "server-only";

// 접속 기록 보내기(rpc log_access — supabase/migrations/20261118140000_access_logs_ai_switch.sql). 순수 부분은 access-log-core.ts.
// 기록이 실패해도 사용자 일을 막지 않음: 던지지 않고 console.error 한 줄(accessFailLine)만 남김.
// 앱 서버 경유 표지: 이 rpc 요청에만 표지 머리글(appWriteHeaders)을 다시 실음(setHeader). 서버 액션·라우트의 createClient는 이미 싣고 있어 같은 값이 한 번 더 붙을 뿐이고,
// proxy.ts의 클라이언트(세션 갱신용 — 표지 없음)는 하루 첫 접속 기록 요청에만 표지가 실림(다른 요청은 그대로).

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { appWriteHeaders } from "../supabase/app-write.ts";
import { type AccessInput, type HeaderGet, accessArgs, accessFailLine } from "./access-log-core.ts";

/** 요청 머리글을 직접 받아 기록(proxy.ts — request.headers). 실패는 한 줄 로그만 */
export async function logAccessFrom(db: SupabaseClient, input: AccessInput, h: HeaderGet): Promise<void> {
  try {
    let q = db.rpc("log_access", accessArgs(input, h));
    for (const [k, v] of Object.entries(appWriteHeaders())) q = q.setHeader(k, v);
    const { error } = await q;
    if (error) console.error(accessFailLine(input.action, error.message));
  } catch (e) {
    console.error(accessFailLine(input.action, e instanceof Error ? e.message : String(e)));
  }
}

/** 서버 액션·라우트 안에서 기록(머리글은 next/headers). db는 그 요청의 사용자 권한 클라이언트(lib/supabase/server.ts createClient) */
export async function logAccess(db: SupabaseClient, input: AccessInput): Promise<void> {
  let h: HeaderGet;
  try {
    h = await headers();
  } catch {
    h = { get: () => null };
  }
  await logAccessFrom(db, input, h);
}
