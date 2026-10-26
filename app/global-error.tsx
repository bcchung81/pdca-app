"use client";

import Link from "next/link";

/**
 * 루트 레이아웃까지 깨졌을 때의 전역 오류 화면(2026-10-10 개선 계획 P1-5). 앱 CSS가 안 들어오므로(Next 16 global-error 규약) 글꼴·색을 직접 적음.
 * 서버 쪽 오류는 instrumentation.ts가 한 줄 로그로 남기고, 화면에는 오류 번호(digest)만 보여 줌(로그에서 찾는 열쇠)
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#f4f2ee", color: "#1d2433", fontFamily: "system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif" }}>
        <title>오류 · 경영평가 Sherpa</title>
        <main style={{ maxWidth: 560, margin: "15vh auto 0", padding: "0 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h1 style={{ fontSize: 22, margin: 0, color: "#193d35" }}>화면을 불러오지 못했습니다</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "#4b5160" }}>
            잠시 뒤 다시 시도해 주세요. 같은 문제가 계속되면 관리자에게 알려 주세요{error.digest ? ` (오류 번호 ${error.digest})` : ""}.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => retry()} style={{ height: 36, padding: "0 16px", borderRadius: 6, border: 0, background: "#193d35", color: "#fff", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>
              다시 시도
            </button>
            <Link href="/" style={{ height: 36, padding: "0 16px", borderRadius: 6, border: "1px solid #c9c6bf", background: "#fff", color: "#1d2433", fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", textDecoration: "none" }}>
              첫 화면
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
