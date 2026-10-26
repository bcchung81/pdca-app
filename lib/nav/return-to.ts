// 「연 곳으로 돌아가기」(순수, 2026-09-28 — 화면 이동 점검): 상세 화면(카드 전체 페이지·과제별 초안·보고서 검토 등)을 여는 링크가
// 돌아갈 주소(from — 같은 사이트 경로, 쿼리 포함)를 넘기고, 상세 화면의 목록 아이콘·닫기·앞뒤 이동이 그것을 이어받습니다.
// 예전에는 돌아가기가 역할로만 정해져, 월간 점검·보고서 검토 등에서 연 화면을 닫으면 엉뚱한 목록(과제 원장 등)으로 갔음.
// 열린 리다이렉트 방지: '/'로 시작하는 앱 안 경로만 받음('//'·'/\\'·스킴·제어 문자·너무 긴 값은 버림).

/** from 값 길이 상한(목록 쿼리 — 검색어·필터·정렬 — 를 담을 만큼) */
export const RETURN_MAX = 600;

/** 받은 from이 앱 안 경로면 그대로, 아니면 null */
export function safeReturn(raw: unknown): string | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return isSafeAppPath(s) ? s : null;
}

/**
 * 앱 안 경로인가(열린 리다이렉트 방지 규칙 한 곳 — 「돌아가기」 safeReturn·로그인 뒤 이동 lib/auth/redirect.ts safeNext 공용):
 * '/'로 시작, '//'·'/\\' 아님, 제어 문자 없음(탭은 URL 해석에서 지워져 「/\t/evil.com」이 //evil.com이 됨), '/스킴:' 아님, 길이 상한
 */
export function isSafeAppPath(s: unknown, max = RETURN_MAX): s is string {
  if (typeof s !== "string" || !s || s.length > max) return false;
  if (!s.startsWith("/") || s.startsWith("//") || s.startsWith("/\\")) return false;
  return !/[\u0000-\u001f\u007f]/.test(s) && !/^\/[a-z][a-z0-9+.-]*:/i.test(s);
}

/** href에 from(돌아갈 주소)을 붙임 — from이 안전하지 않으면 href 그대로 */
export function withReturn(href: string, from: string | null | undefined): string {
  const f = safeReturn(from);
  if (!f) return href;
  const [path, hash = ""] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}from=${encodeURIComponent(f)}${hash ? `#${hash}` : ""}`;
}

/** 돌아갈 곳의 이름(목록 아이콘 title) — 경로 앞부분으로 고름, 모르면 「목록」 */
const RETURN_LABELS: Array<[RegExp, string]> = [
  [/^\/cards\/import(\/|\?|$)/, "카드 현행화"],
  [/^\/cards\/archive/, "보관함"],
  [/^\/cards(\?|$)/, "과제 원장"],
  [/^\/my\/inspections/, "점검 결과"],
  [/^\/my\/report/, "경평 초안"],
  [/^\/my(\?|$)/, "내 과제"],
  [/^\/inspections\/summary/, "취합 보고"],
  [/^\/inspections/, "월간 점검"],
  [/^\/dashboard/, "현황"],
  [/^\/links/, "지적·과제 연결"],
  [/^\/knowledge/, "공통 지식"],
  [/^\/reports\/cards(\?|$)/, "과제별 초안"],
  [/^\/reports\/cards\//, "과제별 초안"],
  [/^\/reports\/outline/, "목차·쪽 배정"],
  [/^\/reports\/business/, "사업 조판"],
  [/^\/reports\/\d+/, "보고서 검토"],
  [/^\/reports(\?|$)/, "경평 초안 현황"],
  [/^\/admin\/usage/, "AI 사용량"],
];

export function returnLabel(path: string): string {
  return RETURN_LABELS.find(([re]) => re.test(path))?.[1] ?? "목록";
}

/** 돌아갈 곳: 안전한 from, 없으면 기본값 — { href, label } */
export function returnTarget(raw: unknown, fallback: string): { href: string; label: string } {
  const href = safeReturn(raw) ?? fallback;
  return { href, label: returnLabel(href) };
}
