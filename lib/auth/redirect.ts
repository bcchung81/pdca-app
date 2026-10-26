import { isSafeAppPath } from "../nav/return-to.ts";

/** 로그인 뒤 돌아갈 경로. 같은 사이트의 절대 경로만 받습니다(열린 리다이렉트 방지 — 규칙은 isSafeAppPath 한 곳, 제어 문자·스킴 거부 2026-10-10) */
export function safeNext(next: unknown, fallback = "/"): string {
  return isSafeAppPath(next) ? next : fallback;
}

/** 로그인에 쓸 수 있는 메일 도메인(ALLOWED_EMAIL_DOMAINS, 쉼표 구분. 기본 kca.kr) */
export function allowedEmailDomains(): string[] {
  return (process.env.ALLOWED_EMAIL_DOMAINS ?? "kca.kr")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isAllowedEmail(email: string, domains = allowedEmailDomains()): boolean {
  const m = /^[^\s@]+@([^\s@]+\.[^\s@]+)$/.exec(email.trim().toLowerCase());
  return Boolean(m && domains.includes(m[1]));
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

/**
 * 매직링크 요청 정책: 기관 메일은 처음이면 계정을 만들고(부서 담당자·부서 미지정),
 * 그 밖의 주소는 관리자가 미리 만든 계정(`pnpm db:user`)만 로그인합니다.
 */
export function otpPolicy(email: string, domains = allowedEmailDomains()): { valid: boolean; createUser: boolean } {
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  return { valid, createUser: valid && isAllowedEmail(email, domains) };
}
