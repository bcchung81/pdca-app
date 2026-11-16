"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isValidEmail, requestOrigin, safeNext } from "../../lib/auth/redirect.ts";
import { createClient } from "../../lib/supabase/server.ts";
import { type LoginState, requestMagicLink } from "../../lib/users/login.ts";

/** 앱 주소: 호출한 주소 기준(이 앱의 주소일 때만 — lib/auth/redirect.ts requestOrigin) */
async function siteOrigin(): Promise<string> {
  return requestOrigin(await headers());
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (!isValidEmail(email)) return { status: "error", email, message: "메일 주소를 확인해 주세요." };
  const supabase = await createClient();
  return requestMagicLink(supabase.auth, email, `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`);
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
