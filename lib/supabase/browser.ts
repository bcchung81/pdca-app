"use client";

import { createBrowserClient } from "@supabase/ssr";

/** 브라우저용 Supabase 클라이언트(공개 키). 서명 업로드 주소로 파일을 저장소에 바로 올릴 때만 씁니다 */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase 공개 설정이 없습니다");
  return createBrowserClient(url, key);
}
