// 스크립트 출처 제한 CSP — 먼저 Report-Only(막지 않고 위반만 보고, 2026-11-18 보안 점검 「CSP에 script-src 없음」).
// 앱은 서버 렌더러가 만든 HTML을 dangerouslySetInnerHTML로 많이 넣어서 이스케이프가 한 곳이라도 빠지면 <img onerror> 류가 돎 → nonce + strict-dynamic으로 막을 준비.
//  · proxy.ts가 요청마다 nonce를 만들어 이 정책을 요청 머리글 content-security-policy-report-only로 넘기면, Next가 거기서 nonce를 읽어 프레임워크 스크립트에 붙임
//    (node_modules/next/dist/server/app-render/get-script-nonce-from-header.js — content-security-policy가 없으면 report-only를 읽음). 응답에도 같은 값을 실음
//  · 경평 초안 문서(/reports/cards/<uid>/html — 라우트 핸들러라 Next가 nonce를 못 붙임)에는 Report-Only 응답 머리글을 싣지 않음(reportOnlyApplies).
//    그 문서의 인라인 스크립트는 fitTextLines.toString()을 품어 운영 빌드(압축된 서버 코드)에서 문자열이 달라지므로 해시 상수로는 못 맞춤(헛 보고).
//    대신 그 문서는 실행 때 같은 문자열로 해시를 세는 자체 강제 meta CSP(lib/reports/doc-csp.ts — 'self'·nonce 없이 해시 하나만)가 있어 더 엄격함
//  · 'unsafe-inline'은 넣지 않음. 이번 범위는 스크립트만(style-src·img-src·connect-src 등은 안 넣음). 강제 CSP(next.config.ts)는 그대로
//  · 위반 보고는 /api/csp-report(app/api/csp-report/route.ts — 한 줄 JSON 로그)

/** 위반 보고를 받는 경로(로그인 없이 — lib/auth/public-paths.ts) */
export const CSP_REPORT_PATH = "/api/csp-report";

/** 요청마다 새 nonce — 16바이트(128비트) 무작위, base64 */
export function makeNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Report-Only 정책 문자열. dev(NODE_ENV === "development")일 때만 'unsafe-eval'(React 개발 모드가 eval로 오류 스택을 되살림) */
export function reportOnlyCsp(nonce: string, dev: boolean): string {
  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"];
  if (dev) script.push("'unsafe-eval'");
  return `script-src ${script.join(" ")}; object-src 'none'; base-uri 'self'; report-uri ${CSP_REPORT_PATH}`;
}

/** Report-Only 응답 머리글을 실을 경로인지 — 경평 초안 문서(/reports/cards/<uid>/html)만 뺌(자체 강제 meta CSP가 있음, 위 머리 주석). path는 질의 문자열 없는 경로 */
export function reportOnlyApplies(path: string): boolean {
  return !/^\/reports\/cards\/[^/]+\/html$/.test(path);
}
