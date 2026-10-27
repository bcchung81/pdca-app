import type { Metadata } from "next";
import { Hahmlet, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// 제목 글꼴. Next 글꼴 목록에 한글 하위 집합이 없어 미리 받기는 끄고 전체 범위를 씁니다.
const hahmlet = Hahmlet({ weight: ["500", "600", "700"], variable: "--font-hahmlet", preload: false, display: "swap" });
const plexMono = IBM_Plex_Mono({ weight: ["400", "500"], subsets: ["latin"], variable: "--font-plex-mono", display: "swap" });

export const metadata: Metadata = {
  title: "경영AI비서",
  description: "경영AI비서 — 과제관리카드 · 월간 점검 · 경영실적보고서 작성 지원",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`h-full antialiased ${hahmlet.variable} ${plexMono.variable}`}>
      <body className="flex min-h-full flex-col">
        <link
          rel="stylesheet"
          precedence="default"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-gov-dynamic-subset.min.css"
        />
        {children}
      </body>
    </html>
  );
}
