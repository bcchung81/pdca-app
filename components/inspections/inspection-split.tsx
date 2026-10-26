"use client";

import { Fragment, type ReactNode } from "react";
import type { CardLayout } from "../../lib/hwp/layout.ts";
import { CardEditor } from "../cards/card-editor";
import { PaneResizer, usePaneWidth } from "../workspace/pane-resizer";
import { paneWidthStyle } from "../workspace/right-pane.ts";

/** 점검표 쪽 기본 폭(점검표 표가 5열이라 과제관리카드 작업 공간 오른쪽 패널보다 넓게) — 구분선으로 바꾸면 이 브라우저에 기억 */
const INSPECT_PANE = "w-[clamp(520px,48vw,860px)] shrink-0";

/**
 * 월간 점검 옆 창(2026-09-28 사용자 요구 「과제관리카드를 누르면 과제 원문도 왼쪽에 같이」): 왼쪽 = 확정 카드(원장) 원문(원본 배치 그대로, 읽기 전용 —
 * 과제관리카드 편집기의 읽기 모드: 이어 보기·쪽 보기·확대, 끌어 고르는 AI 도구줄은 없음), 오른쪽 = 점검표(상태 띠 + 점검표 편집기). 가운데 구분선으로 폭을 바꿈.
 * 월간 점검의 근거가 확정 카드이므로 작성본이 아니라 원장을 보여 줌. 카드를 고치려면 머리의 「원장에서 고치기」(카드 전체 페이지).
 */
export function InspectionSplit(props: { card: { uid: string; data: unknown; imageUrls: Record<string, string>; layout: CardLayout | null }; defaultPeriod: string; strip: ReactNode; children: ReactNode }) {
  const { width, setWidth, setLive, dragging, setDragging } = usePaneWidth("inspect-pane-w");
  return (
    <div className="flex min-h-0 min-w-0 grow">
      <section aria-label="과제 원문" className="flex min-w-0 grow flex-col">
        <CardEditor uid={props.card.uid} initial={props.card.data} imageUrls={props.card.imageUrls} layout={props.card.layout} readOnly preview defaultPeriod={props.defaultPeriod} zoomPaused={dragging} />
      </section>
      <PaneResizer width={width} onWidth={setLive} onDragging={setDragging} onCommit={setWidth} label="점검표 폭 조절" />
      <section aria-label="점검표" className={`flex min-h-0 flex-col border-l border-line bg-paper ${width === null ? INSPECT_PANE : "shrink-0"}`} style={paneWidthStyle(width)}>
        {/* 서버에서 만든 요소(strip)를 형제와 나란히 놓으면 개발 모드에서 「Each child in a list should have a unique key」 경고가 나므로 키 있는 Fragment로 감쌈 */}
        <Fragment key="strip">{props.strip}</Fragment>
        <div className="min-h-0 grow overflow-y-auto">{props.children}</div>
      </section>
    </div>
  );
}
