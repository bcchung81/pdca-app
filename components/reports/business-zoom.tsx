"use client";

import { type ReactNode, createContext, useContext } from "react";
import { type StepZoomRange, useFitZoom } from "../workspace/use-fit-zoom.ts";
import { ZoomControl } from "../workspace/zoom-control";
import { ReportPreview } from "./report-preview";

/** 종이 폭(본문 170mm + 좌우 여백 6mm = 182mm) CSS px — 과제별 초안(draft-workspace)과 같음 */
const PAPER_PX = (182 * 96) / 25.4;
/** 맞춤 확대 범위(쪽 보기 열 폭 ÷ 종이 폭) */
const FIT_ZOOM = { min: 0.6, max: 1.6 } as const;
/** 단추로 고르는 범위 */
const HAND_ZOOM: StepZoomRange = { min: 0.5, max: 2, step: 0.1 };
/** 손으로 고른 배율을 기억할 곳(과제별 초안 report-zoom과 따로 — 쪽 보기 열 폭이 달라 맞춤 배율도 다름) */
const ZOOM_KEY = "business-zoom";

type Zoom = ReturnType<typeof useFitZoom>;
const ZoomContext = createContext<Zoom | null>(null);
function useZoom(): Zoom {
  const z = useContext(ZoomContext);
  if (!z) throw new Error("BusinessZoom 안에서만 씁니다");
  return z;
}

/**
 * 경평 초안 사업 조판의 보고서 확대(2026-09-29 사용자 요구 — 과제별 초안처럼): 쪽 보기 열 폭에 맞춰 CSS zoom(기본 맞춤),
 * 요약 막대의 − % +로 고르면 이 브라우저에 기억. 페이지는 서버 부품이라 배율 상태를 이 공급자가 들고,
 * 단추(BusinessZoomControl) · 폭을 재는 열(BusinessZoomColumn) · 종이(BusinessZoomSheet)가 함께 씀
 */
export function BusinessZoom({ children }: { children: ReactNode }) {
  const z = useFitZoom({ storageKey: ZOOM_KEY, docWidthPx: PAPER_PX, reservePx: 4, fitRange: FIT_ZOOM, handRange: HAND_ZOOM });
  return <ZoomContext.Provider value={z}>{children}</ZoomContext.Provider>;
}

/** 확대 −·%·+(가운데를 누르면 맞춤으로) */
export function BusinessZoomControl() {
  const { zoom, hand, setZoom } = useZoom();
  return <ZoomControl zoom={zoom} fitted={hand === null} range={HAND_ZOOM} onZoom={setZoom} />;
}

/** 쪽 보기 열 — 이 폭으로 맞춤 배율을 셈 */
export function BusinessZoomColumn({ children }: { children: ReactNode }) {
  const { scrollRef } = useZoom();
  return (
    <div ref={scrollRef} className="flex min-w-0 flex-col gap-6">
      {children}
    </div>
  );
}

/** 쪽 종이(서버가 그린 HTML) — 지금 배율로 */
export function BusinessZoomSheet({ html }: { html: string }) {
  const { zoom } = useZoom();
  return <ReportPreview html={html} zoom={zoom} />;
}
