// 경평 초안 HTML 문서(section-html.ts sectionDocument)를 우리 출처에서 화면에 띄울 때(/reports/cards/<uid>/html?for=hwpx — 숨은 iframe 사본)의 CSP.
// 저장된 초안 JSON은 부서 담당자가 고칠 수 있으므로 렌더러의 이스케이프가 빠진 자리가 있어도 스크립트가 돌지 않게 막는 두 번째 울타리.
//  · 스크립트는 문서의 인라인 스크립트 하나(REPORT_DOC_SCRIPT)만 sha256 해시로 허용 — 같은 상수에서 셈(시험: section-html.test.ts)
//  · default-src는 두지 않음(글꼴 local()·그림·<style>을 깨지 않게)
//  · 머리글이 아니라 문서 머리의 meta로 실음: next.config.ts headers()가 모든 경로에 CSP를 먼저 달아서, Next(노드 서버)는 라우트가 같은 이름으로
//    준 머리글을 버림(next/dist/server/send-response.js — 이미 있는 머리글은 덧붙이지 않음). meta CSP는 머리글 CSP와 함께 강제됨

import { createHash } from "node:crypto";
import { REPORT_DOC_SCRIPT } from "./section-html.ts";

/** 인라인 스크립트 하나만 허용하는 CSP 값 */
export const REPORT_DOC_CSP = `script-src 'sha256-${createHash("sha256").update(REPORT_DOC_SCRIPT, "utf8").digest("base64")}'; object-src 'none'; base-uri 'none'`;

/** 문서 머리(<head> 바로 뒤 — 본문보다 앞)에 넣는 CSP meta */
export const REPORT_DOC_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${REPORT_DOC_CSP}">`;
