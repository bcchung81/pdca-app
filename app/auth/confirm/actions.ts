"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { safeNext } from "../../../lib/auth/redirect.ts";
import { createClient } from "../../../lib/supabase/server.ts";

export type ConfirmState = { status: "idle" } | { status: "error"; message: string };

const OTP_TYPES: EmailOtpType[] = ["email", "magiclink", "signup", "invite", "recovery", "email_change"];

/**
 * 메일 링크 확인. 링크를 여는 것만으로는 로그인하지 않고 버튼을 눌러야 하므로,
 * 메일 보안 검사기가 링크를 미리 열어도 일회용 토큰이 소모되지 않습니다.
 *  - token_hash + type: 메일 양식이 앱 주소로 오는 경우(권장)
 *  - code: 기본 메일 양식(PKCE). 요청한 브라우저에서만 됨
 */
export async function confirmLogin(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const tokenHash = String(formData.get("token_hash") ?? "");
  const type = String(formData.get("type") ?? "") as EmailOtpType;
  const code = String(formData.get("code") ?? "");
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();

  let failed: string | null = null;
  if (tokenHash && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) failed = error.message;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) failed = error.message;
  } else {
    failed = "missing token";
  }
  if (failed) {
    console.error("confirmLogin", failed);
    return { status: "error", message: "로그인 링크가 만료됐거나 이미 쓰였습니다. 로그인 메일을 다시 받아 주세요." };
  }
  redirect(next);
}
