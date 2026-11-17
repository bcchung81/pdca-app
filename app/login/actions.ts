"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, requestOrigin, safeNext } from "../../lib/auth/redirect.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { type LoginState, requestMagicLink, waitAtLeast } from "../../lib/users/login.ts";

/** 앱 주소: 호출한 주소 기준(이 앱의 주소일 때만 — lib/auth/redirect.ts requestOrigin) */
async function siteOrigin(): Promise<string> {
  return requestOrigin(await headers());
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (!isValidEmail(email)) return { status: "error", email, message: "메일 주소를 확인해 주세요." };
  const started = Date.now();
  const supabase = await createClient();
  const state = await requestMagicLink(supabase.auth, email, `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`);
  // 등록 여부가 응답 시간으로 드러나지 않게 최소 시간까지 채움(lib/users/login.ts LOGIN_MIN_MS)
  await waitAtLeast(started);
  return state;
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
