"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isNotRegisteredError, isValidEmail, requestOrigin, safeNext } from "../../lib/auth/redirect.ts";
import { createClient } from "../../lib/supabase/server.ts";

export type LoginState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string; email?: string };

/** 앱 주소: 호출한 주소 기준(이 앱의 주소일 때만 — lib/auth/redirect.ts requestOrigin) */
async function siteOrigin(): Promise<string> {
  return requestOrigin(await headers());
}

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeNext(formData.get("next"));
  if (!isValidEmail(email)) return { status: "error", email, message: "메일 주소를 확인해 주세요." };
  const supabase = await createClient();
  // 계정은 만들지 않음(「사용자」 화면·pnpm db:user로만 — Supabase 가입은 꺼 둠, 2026-11-10 보안 점검 T4 H1)
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`, shouldCreateUser: false },
  });
  // 등록 안 된 주소도 보낸 것과 같은 답 — 계정이 있는지 알려 주지 않음(T4 L1). 안내는 보낸 화면 문구가 함께 함(login-form.tsx)
  if (error && isNotRegisteredError(error)) return { status: "sent", email };
  if (error) {
    // 운영은 Supabase 사용자 지정 SMTP(Gmail, 시간당 60통)로 보냅니다 — docs/ops/운영-전환.md §2. 한도를 넘으면 429
    const message =
      error.status === 429 || /rate limit/i.test(error.message)
        ? "메일을 너무 자주 요청했습니다. 잠시 뒤 다시 시도해 주세요."
        : /not authorized/i.test(error.message)
          ? "이 주소로는 아직 로그인 메일을 보낼 수 없습니다. 메일 발송 설정이 필요하니 관리자에게 알려 주세요."
          : "로그인 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
    console.error("signInWithOtp", error.status, error.message);
    return { status: "error", email, message };
  }
  return { status: "sent", email };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
