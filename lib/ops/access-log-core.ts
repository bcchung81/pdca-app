// 접속 기록(access_logs — supabase/migrations/20261118140000_access_logs_ai_switch.sql)의 순수 부분: IP 고르기·기기 요약·하루 첫 접속 표식·문서 탐색 판정·값 자르기.
// 입출력이 없어 시험(access-log-core.test.ts)이 직접 부름. 기록 보내기(rpc)는 lib/ops/access-log.ts.

import { AUTH_COOKIE_OPTIONS } from "../supabase/cookie-options.ts";

/** 남기는 행위 — DB 허용 목록과 같음(마이그레이션 check·log_access) */
export const ACCESS_ACTIONS = ["login", "visit", "download", "user_manage", "ai_switch"] as const;
export type AccessAction = (typeof ACCESS_ACTIONS)[number];

/** 칸 상한(DB 상한 이하 — target 200자·ip 100자·ua 200자·detail 4 KiB). 앱은 이보다 길면 잘라 보냄(기록이 거절되지 않게) */
export const ACCESS_LIMITS = { target: 200, ip: 100, ua: 80, detailBytes: 2048 } as const;

/** 내려받기 종류(detail.kind) — 화면이 한국어로 풀어 씀(lib/ops/access-log-view.ts) */
export type DownloadKind = "card_hwpx" | "card_hwpx_screen" | "report_hwpx" | "report_hwpx_screen" | "report_html" | "unit_hwpx" | "inspection_summary_md" | "cards_csv" | "inspections_csv";

export interface AccessInput {
  action: AccessAction;
  target?: string | null;
  detail?: Record<string, unknown> | null;
}

/** 머리글 읽기(Headers·ReadonlyHeaders 공통) */
export type HeaderGet = { get(name: string): string | null };

/** 접속지: x-forwarded-for 첫 값(Vercel이 실제 접속 주소를 맨 앞에 둠), 없으면 x-real-ip. 공백 걷고 100자까지 */
export function pickIp(h: HeaderGet): string | null {
  const first = (h.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const ip = first || (h.get("x-real-ip") ?? "").trim();
  return ip ? ip.slice(0, ACCESS_LIMITS.ip) : null;
}

/** 기기 요약 「브라우저 · OS」(예: 「Chrome · Windows」). 모르면 「기타」, 비었으면 null. 원문 user-agent는 남기지 않음 */
export function deviceSummary(ua: string | null | undefined): string | null {
  const s = (ua ?? "").trim();
  if (!s) return null;
  const browser =
    /Edg(e|A|iOS)?\//.test(s) ? "Edge" :
    /Whale\//.test(s) ? "Whale" :
    /SamsungBrowser\//.test(s) ? "Samsung Internet" :
    /(OPR|Opera)\//.test(s) ? "Opera" :
    /Firefox\/|FxiOS\//.test(s) ? "Firefox" :
    /Chrome\/|CriOS\//.test(s) ? "Chrome" :
    /Safari\//.test(s) && /Version\//.test(s) ? "Safari" :
    "기타";
  const os =
    /iPhone|iPad|iPod/.test(s) ? "iOS" :
    /Android/.test(s) ? "Android" :
    /Windows/.test(s) ? "Windows" :
    /CrOS/.test(s) ? "ChromeOS" :
    /Mac OS X|Macintosh/.test(s) ? "macOS" :
    /Linux/.test(s) ? "Linux" :
    "기타";
  return `${browser} · ${os}`.slice(0, ACCESS_LIMITS.ua);
}

/** 서울 날짜 「YYYYMMDD」 */
export function kstDay(now: number): string {
  return new Date(now + 9 * 3_600_000).toISOString().slice(0, 10).replace(/-/g, "");
}

/** 하루 첫 접속 표식 쿠키(httpOnly) — 값은 「서울 날짜.사용자 id」, 만료 2일. secure는 세션 쿠키와 같게 Vercel에서만(lib/supabase/cookie-options.ts — 로컬 http에서 버려지지 않게) */
export const SEEN_COOKIE = "pdca_seen";
export const SEEN_MAX_AGE = 2 * 86_400;
export const SEEN_COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", secure: AUTH_COOKIE_OPTIONS.secure, maxAge: SEEN_MAX_AGE, path: "/" } as const;
export const seenValue = (userId: string, now: number) => `${kstDay(now)}.${userId}`;
/** 오늘(서울)·이 사용자로 이미 남겼나 */
export const seenToday = (cookie: string | null | undefined, userId: string, now: number) => cookie === seenValue(userId, now);

/** 내려받기 라우트 꼴(첫 접속으로 세지 않음 — 내려받기는 따로 남김): …/hwpx·…/html·…/md·…/export */
const DOWNLOAD_PATH = /\/(hwpx|html|md|export)$/;

/**
 * 하루 첫 접속으로 셀 요청인가 — 브라우저가 화면 문서를 여는 GET만(주소창·링크·새로고침).
 * 빼는 것: GET이 아닌 것(서버 액션 POST 등) · sec-fetch-dest가 document가 아닌 것(RSC 화면 갱신·fetch·그림 — 브라우저가 붙이는 머리글이고
 * 화면 안 탐색의 RSC 요청은 empty) · 미리 불러오기(sec-purpose·purpose: prefetch) · /api/ · 내려받기 라우트(따로 download로 남김).
 * sec-fetch-dest가 없는 오래된 브라우저·도구는 세지 않음(빠뜨리는 쪽이 안전 — 로그인 기록은 따로 남음)
 */
export function isDocumentVisit(method: string, path: string, h: HeaderGet): boolean {
  if (method !== "GET") return false;
  if (h.get("sec-fetch-dest") !== "document") return false;
  if (/prefetch/i.test(h.get("sec-purpose") ?? "") || /prefetch/i.test(h.get("purpose") ?? "")) return false;
  if (path.startsWith("/api/")) return false;
  return !DOWNLOAD_PATH.test(path);
}

/** rpc 인자 — 길이를 앱 상한으로 자르고, detail이 너무 크면 kind·op만 남김 */
export function accessArgs(input: AccessInput, h: HeaderGet): { p_action: AccessAction; p_target: string | null; p_ip: string | null; p_ua: string | null; p_detail: Record<string, unknown> | null } {
  let detail = input.detail ?? null;
  if (detail && new TextEncoder().encode(JSON.stringify(detail)).length > ACCESS_LIMITS.detailBytes) {
    const keep: Record<string, unknown> = { truncated: true };
    for (const k of ["kind", "op", "count"]) if (k in detail) keep[k] = typeof detail[k] === "string" ? String(detail[k]).slice(0, 100) : detail[k];
    detail = keep;
  }
  const target = input.target ? input.target.slice(0, ACCESS_LIMITS.target) : null;
  return { p_action: input.action, p_target: target, p_ip: pickIp(h), p_ua: deviceSummary(h.get("user-agent")), p_detail: detail };
}

/** 기록 실패 한 줄(JSON — lib/ops/error-log.ts와 같은 꼴, 개인정보·머리글 없음) */
export function accessFailLine(action: AccessAction, message: string, now = Date.now()): string {
  return JSON.stringify({ t: new Date(now).toISOString(), kind: "access_log_error", action, message: message.slice(0, 300) });
}
