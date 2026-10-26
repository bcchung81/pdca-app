"use client";

import { useEffect, useRef } from "react";
import { fitTextLines } from "../../lib/reports/fit-dom";

/**
 * 경평 초안 미리보기: 서버가 그린 소항목 HTML을 넣고, 글꼴이 준비되면 자간 맞춤(1~2글자 넘친 칸 글을 한 줄로 — lib/reports/fit-dom.ts).
 * zoom을 주면 종이에 CSS zoom을 걸고 배율이 바뀔 때마다 자간 맞춤을 다시(줄 수는 실제 글꼴 폭으로 재므로 — 사업 조판). 안 주면 예전 그대로(과제별 초안은 바깥에서 zoom)
 */
export function ReportPreview({ html, zoom }: { html: string; zoom?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let off = false;
    void document.fonts.ready.then(() => {
      if (!off) fitTextLines(el);
    });
    return () => {
      off = true;
    };
  }, [html, zoom]);
  if (zoom === undefined) return <div ref={ref} className="flex justify-center-safe" dangerouslySetInnerHTML={{ __html: html }} />;
  return (
    <div className="flex justify-center-safe">
      <div ref={ref} style={{ zoom }} dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
