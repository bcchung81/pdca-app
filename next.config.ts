import type { NextConfig } from "next";

/**
 * 모든 응답에 붙이는 보안 머리글(2026-11-10 보안 점검 T4 — 시험 lib/auth/security-headers.test.ts).
 *  · 액자(frame): 같은 출처만 — 「한글(화면 그대로)」이 같은 출처 숨은 iframe(/cards/<uid>/hwpx-copy·/reports/cards/<uid>/html?for=hwpx)을 씀. 남의 사이트가 앱을 액자로 감싸 단추를 누르게 하는 것(클릭재킹) 방지
 *  · CSP는 화면을 깨지 않는 지시어만 강제(frame-ancestors·base-uri·object-src). 스크립트·스타일 출처 제한은 화면 확인 뒤(보고서 .team/T4-report.md 제안)
 *  · Referrer-Policy: 같은 출처에는 전체 주소를 보냄 — 부서 화면 보기 쓰기 막기(lib/auth/preview.ts previewWriteBlocked)가 Referer의 ?team=을 읽음. 다른 사이트에는 출처만
 *  · HSTS는 Vercel이 붙임(운영 응답에서 확인) — 겹치지 않게 여기서는 안 붙임
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
];

const nextConfig: NextConfig = {
  // 응답에 Next.js 판 정보를 싣지 않음(공격 표면 안내 줄이기)
  poweredByHeader: false,
  // 앱은 next/image를 쓰지 않음(<img> + 서명 주소). 이미지 최적화 경로(/_next/image)를 닫아 그 경로의 취약점(SSRF·SVG 처리 등)이 닿지 않게 — 켜면 404 대신 최적화기가 돎
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  // kordoc(한글·PDF 읽기, HWPX 만들기)은 선택 의존성(OCR 등)을 동적으로 불러서 번들하지 않고 Node가 그대로 불러오게
  serverExternalPackages: ["kordoc"],
  // 서버가 실행 중에 읽는 파일 — Vercel 배포본에 함께 싣습니다.
  outputFileTracingIncludes: {
    // AI 프롬프트(resources/prompts — 코드에 지시문을 쓰지 않음)와 기준 문서 사본(resources/harness)
    // AI 작성지원·질문·드래그 코멘트(서버 액션)는 카드 옆 창이 열리는 화면(과제 원장·내 과제)의 함수에서 돕니다.
    "/cards": ["./resources/harness/**/*.md", "./resources/prompts/**/*.md"],
    "/cards/*": ["./resources/harness/**/*.md", "./resources/prompts/**/*.md"],
    "/my": ["./resources/harness/**/*.md", "./resources/prompts/**/*.md"],
    // 월간 점검 AI 초안(종합점검 지침 14)
    "/inspections": ["./resources/harness/**/*.md", "./resources/prompts/**/*.md"],
    // 경평 초안 과제별 초안(서버 액션은 /reports/cards/<uid> 화면의 함수).
    // 빌드의 자동 추적(process.cwd() 경로 읽기)으로도 실리지만(2026-09-27 nft 확인), 읽는 코드가 바뀌어도 빠지지 않게 적어 둠
    "/reports/cards/*": ["./resources/harness/report-harness/*.md", "./resources/prompts/**/*.md"],
    // 경영관리 지표 단위 부분 「AI로 문장 채우기」(R5c — 서버 액션은 /reports/business/<지표>/parts 화면의 함수, 운영 방식은 로컬 CLI뿐이지만 경로는 같게)
    "/reports/business/*/parts": ["./resources/harness/report-harness/*.md", "./resources/prompts/**/*.md"],
    "/admin/library": ["./resources/harness/**/SOURCE.json"],
    // 과제 매칭 백그라운드 처리(참고자료 3단계, lib/prep) — 서버 액션 뒤 after()는 그 액션이 놓인 화면의 함수에서 돌므로,
    // 등록 계기가 있는 화면(카드 저장·확정·현행화·보관 해제 — 3-5 재정의로 /links·/my/report는 등록하지 않음)과 처리 라우트에도 프롬프트를 실음
    "/cards/import/*": ["./resources/prompts/**/*.md"],
    "/api/prep/run": ["./resources/prompts/**/*.md"],
  },
  // kordoc의 선택 의존성(OCR·이미지 변환·PDF 그림 렌더)은 앱이 쓰지 않음 — 동적 import 추적으로 함수 번들에 딸려 오는 것을 뺌
  // (카드 현행화·HWPX 경로 46MB → 약 15MB, Vercel 함수 한도 250MB). PDF 글 읽기(pdfjs-dist)는 씀
  outputFileTracingExcludes: {
    "/**": [
      "./node_modules/**/@img/**",
      "./node_modules/**/sharp/**",
      "./node_modules/**/@huggingface/transformers/**",
      "./node_modules/**/onnxruntime-node/**",
      "./node_modules/**/onnxruntime-common/**",
      "./node_modules/**/@hyzyla/pdfium/**",
      "./node_modules/**/puppeteer-core/**",
    ],
  },
  experimental: {
    serverActions: {
      // 카드 작성지원에 실적 PDF(4MB 이하)를 붙일 수 있게. Vercel 함수 본문 한도가 4.5MB라 그 이상은 저장소 직접 업로드로
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
