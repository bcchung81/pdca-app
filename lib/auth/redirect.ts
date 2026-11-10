import { isSafeAppPath } from "../nav/return-to.ts";

/** 로그인 뒤 돌아갈 경로. 같은 사이트의 절대 경로만 받습니다(열린 리다이렉트 방지 — 규칙은 isSafeAppPath 한 곳, 제어 문자·스킴 거부 2026-10-10) */
export function safeNext(next: unknown, fallback = "/"): string {
  return isSafeAppPath(next) ? next : fallback;
}

/** 기관 메일 도메인(ALLOWED_EMAIL_DOMAINS, 쉼표 구분. 기본 kca.kr) — 성과관리팀이 「사용자」에서 등록할 수 있는 주소·로그인 화면 예시 주소. 로그인 자체는 등록된 계정만(도메인과 무관) */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "kca.kr")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}


/** NEXT_PUBLIC_SITE_URL·VERCEL_URL·VERCEL_BRANCH_URL·VERCEL_PROJECT_PRODUCTION_URL만 읽음(process.env를 그대로 받으려고 넓은 타입) */
type OriginEnv = Record<string, string | undefined>;
const HOST_RE = /^[a-z0-9.-]+(?::\d{1,5})?$/;
const LOCAL_RE = /^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/;
const firstValue = (v: string | null) => (v ?? "").split(",")[0]!.trim().toLowerCase();
const hostOf = (u: string | undefined) => {
  if (!u) return "";
  try {
    return new URL(u.includes("://") ? u : `https://${u}`).host.toLowerCase();
  } catch {
    return "";
  }
};

/**
 * 로그인 메일 링크가 돌아올 앱 주소 — 호출한 주소(요청 호스트) 기준이라 운영·미리보기·로컬이 각자 자기 주소로 돌아옴(2026-10-12).
 * 이 앱의 주소일 때만 받음: NEXT_PUBLIC_SITE_URL·Vercel이 넣는 배포 주소(VERCEL_URL·VERCEL_BRANCH_URL·VERCEL_PROJECT_PRODUCTION_URL)·localhost.
 * 그 밖의 호스트 헤더는 NEXT_PUBLIC_SITE_URL로(호스트 헤더를 바꿔 로그인 링크를 남의 주소로 돌리는 것 방지 — Supabase 허용 Redirect URL이 한 번 더 막음)
 */
export function requestOrigin(h: { get(name: string): string | null }, env: OriginEnv = process.env): string {
  const host = firstValue(h.get("x-forwarded-host")) || firstValue(h.get("host"));
  const ours = new Set([env.NEXT_PUBLIC_SITE_URL, env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL].map(hostOf).filter(Boolean));
  if (HOST_RE.test(host) && (ours.has(host) || LOCAL_RE.test(host))) {
    const proto = firstValue(h.get("x-forwarded-proto"));
    return `${proto === "http" || proto === "https" ? proto : LOCAL_RE.test(host) ? "http" : "https"}://${host}`;
  }
  return env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "http://localhost:3000";
}

/**
 * 루트(/)로 온 메일 링크 인자(code, 또는 token_hash + type)를 확인 화면(/auth/confirm) 쿼리로 — Supabase가 돌아올 주소를
 * 허용 목록에 없다고 Site URL(루트)로 바꿔 보냈을 때도 로그인이 되게. 해당 없으면 null
 */
export function authCallbackSearch(pathname: string, sp: URLSearchParams): string | null {
  if (pathname !== "/") return null;
  const out = new URLSearchParams();
  for (const k of ["code", "token_hash", "type", "next"]) {
    const v = sp.get(k);
    if (v) out.set(k, v);
  }
  return out.has("code") || (out.has("token_hash") && out.has("type")) ? `?${out}` : null;
}

/** 로그인 메일을 요청할 수 있는 메일 모양인가. 계정은 「사용자」 화면(성과관리팀·관리자)이나 `pnpm db:user`로만 만듦 — 로그인으로는 만들지 않음(Supabase 가입 꺼 둠, 2026-11-10 보안 점검 T4 H1) */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * 등록 안 된 주소라서 난 매직링크 오류인가(가입을 끈 Supabase가 shouldCreateUser:false 요청에 돌려줌 — 코드 otp_disabled·「Signups not allowed for otp」).
 * 이 경우 화면은 보낸 것과 같은 답을 함 — 계정이 있는지 알려 주지 않음(T4 L1).
 * 사용 중지(auth ban) 계정: GoTrue(커밋 2550341)는 메일 보내기(otp·magic_link)에서 밴을 안 보고 보냄 — 밴은 링크 확인(verify)·토큰 갱신에서 막힘.
 * 운영이 다른 판이라 보내기에서 user_banned를 돌려줘도 같은 답(사용 중지 여부도 알리지 않음 — 2026-11-10 T3 리뷰 T4-R3)
 */
export const LINK_FAILED_MSG = "로그인 링크가 만료됐거나 이미 쓰였습니다. 로그인 메일을 다시 받아 주세요.";
export const BANNED_MSG = "사용이 중지된 계정입니다 — 성과관리팀에 문의하세요.";

/**
 * 메일 링크 확인(/auth/confirm) 실패 문구. 사용 중지(auth ban) 계정은 GoTrue가 링크 확인(verify)·코드 교환(token)에서 user_banned로 거절하므로 그렇다고 알림 —
 * 이 단계는 그 메일함의 주인만 오므로 계정·사용 중지 여부가 남에게 새지 않음(보내기 단계는 isNotRegisteredError로 같은 답). 나머지는 만료·이미 쓰임(2026-11-10 T4 9단계)
 */
export function confirmErrorMessage(error: { code?: string; message: string } | null): string {
  return error && (error.code === "user_banned" || /user is banned/i.test(error.message)) ? BANNED_MSG : LINK_FAILED_MSG;
}

export function isNotRegisteredError(error: { code?: string; message: string }): boolean {
  return error.code === "otp_disabled" || error.code === "user_banned" || /signups? not allowed|user not found|user is banned/i.test(error.message);
}
