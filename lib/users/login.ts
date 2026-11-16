import { isNotRegisteredError } from "../auth/redirect.ts";

// 로그인 메일 보내기의 답(app/login/actions.ts sendMagicLink). Supabase 클라이언트를 받아 시험에서 가짜로 바꿀 수 있게 둠.

export type LoginState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string; email?: string };

type OtpError = { status?: number; code?: string; message: string };
export interface OtpSender {
  signInWithOtp(credentials: { email: string; options: { emailRedirectTo: string; shouldCreateUser: boolean } }): Promise<{ error: OtpError | null }>;
}

const isRateLimited = (error: OtpError) => error.status === 429 || /rate limit/i.test(error.message);

/**
 * 로그인 메일 요청. 계정은 만들지 않음(「사용자」 화면·pnpm db:user로만 — Supabase 가입은 꺼 둠, 2026-11-10 보안 점검 T4 H1).
 * 화면의 답은 계정이 있는지 알려 주지 않음: 등록 안 된 주소(T4 L1)와 발송 한도(429 — 주소별 재발송 간격은 등록된 주소에만 걸림,
 * 2026-11-16 시큐어 코딩 2차 점검)는 보낸 것과 같은 답. 한도에 걸린 사람을 위한 안내는 보낸 화면 문구가 함께 함(login-form.tsx).
 */
export async function requestMagicLink(auth: OtpSender, email: string, emailRedirectTo: string): Promise<LoginState> {
  const { error } = await auth.signInWithOtp({ email, options: { emailRedirectTo, shouldCreateUser: false } });
  if (!error || isNotRegisteredError(error)) return { status: "sent", email };
  // 운영 로그에는 메일 주소를 남기지 않음(상태·코드·Supabase 문구만)
  console.error("signInWithOtp", error.status, error.code ?? "", error.message);
  // 운영은 Supabase 사용자 지정 SMTP(Gmail, 시간당 60통)로 보냅니다 — docs/ops/운영-전환.md §2. 한도를 넘으면 429
  if (isRateLimited(error)) return { status: "sent", email };
  // 발송 설정 문제(기본 SMTP는 팀원 주소에만 보냄) — 운영(사용자 지정 SMTP)에서는 나오지 않고, 관리자가 알아야 하므로 그대로 알림
  const message = /not authorized/i.test(error.message)
    ? "이 주소로는 아직 로그인 메일을 보낼 수 없습니다. 메일 발송 설정이 필요하니 관리자에게 알려 주세요."
    : "로그인 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요.";
  return { status: "error", email, message };
}
