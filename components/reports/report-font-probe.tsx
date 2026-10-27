"use client";

import { useEffect } from "react";
import { FONT_PROBES, markReportFonts } from "../../lib/reports/report-fonts.ts";

// 경평 초안 글꼴 표지(<html data-kfont>): 진짜 원본 글꼴이 그려지는 갈래만 Noto 흉내 자간 보정을 끔(lib/reports/report-fonts.ts).
// 한 번만 재고 그 약속을 같이 씀 — 자간 맞춤(fitTextLines)은 표지가 달린 뒤에 돌아야 줄 수가 맞으므로 이것을 기다림.
let ready: Promise<string> | null = null;
export function reportFontsReady(): Promise<string> {
  ready ??= markReportFonts(document, FONT_PROBES).catch(() => "");
  return ready;
}

/** 로그인한 앱 틀(app/(app)/layout.tsx)에 한 번 — 그리는 것 없음 */
export function ReportFontProbe() {
  useEffect(() => {
    void reportFontsReady();
  }, []);
  return null;
}
