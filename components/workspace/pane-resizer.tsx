"use client";

// 왼쪽 문서 | 오른쪽 패널 사이 구분선을 끌어 오른쪽 패널 폭을 바꾸는 공용 부품.
// 폭은 이 브라우저에 화면별 열쇠로 기억하고(끌기를 놓을 때만 저장), 두 번 누르거나 Enter면 기본 폭으로 돌아갑니다.

import { useEffect, useRef, useState } from "react";
import { LEFT_MIN, PANE_MAX, PANE_MIN } from "./right-pane.ts";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 이 브라우저에 기억한 오른쪽 패널 폭(storageKey별). 마운트 뒤에 읽고, 끌기를 놓거나 키보드로 조절할 때만 씀 */
export function usePaneWidth(storageKey: string) {
  const [width, setWidthState] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(storageKey));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Number.isFinite(v) && v >= PANE_MIN && v <= PANE_MAX) setWidthState(v);
    } catch {
      // 저장 공간을 못 쓰면 기본 폭
    }
  }, [storageKey]);

  const setWidth = (n: number | null) => {
    setWidthState(n);
    try {
      if (n === null) localStorage.removeItem(storageKey);
      else localStorage.setItem(storageKey, String(n));
    } catch {
      // 기억하지 못해도 이 화면에서는 적용
    }
  };

  // setLive = 끄는 동안 폭만 바꿈(기억하지 않음), setWidth = 기억까지
  return { width, setWidth, setLive: setWidthState, dragging, setDragging };
}

export interface PaneResizerProps {
  /** 지금 폭(px) — null이면 기본 폭 */
  width: number | null;
  /** 끄는 동안 매 프레임 반영(기억하지 않음) */
  onWidth: (n: number | null) => void;
  /** 끌기 시작·끝 알림(왼쪽 문서 배율 재계산을 멈추고 다시 맞추는 데 씀) */
  onDragging: (b: boolean) => void;
  /** 끌기를 놓거나 키보드로 조절한 값을 기억(null = 기본 폭으로 되돌리고 기억 지움) */
  onCommit: (n: number | null) => void;
  label?: string;
}

/**
 * 왼쪽 문서와 오른쪽 패널 사이에 두는 구분선. 오른쪽 패널의 왼쪽 경계선 위에 겹쳐서 그립니다
 * (평소엔 투명 — 오른쪽 패널의 border-l 선이 그대로 보이고, 올리거나 끄는 중일 때만 진하게).
 */
export function PaneResizer({ width, onWidth, onDragging, onCommit, label }: PaneResizerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startW: number; min: number; max: number; raf: number | null; last: number | null } | null>(null);
  const [active, setActive] = useState(false);

  // 끄는 동안 화면 전체 커서·글자 선택을 막음(값 자체는 렌더 바깥, active 상태만 반영)
  useEffect(() => {
    if (!active) return;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [active]);

  /** 지금 오른쪽 패널 폭(작업 공간 행의 오른쪽 끝 − 구분선 자리)과 끌 수 있는 최대 폭 */
  const measure = () => {
    const bar = barRef.current;
    const row = bar?.parentElement;
    if (!bar || !row) return null;
    const rowRect = row.getBoundingClientRect();
    return { cur: rowRect.right - bar.getBoundingClientRect().left, max: Math.max(PANE_MIN, Math.min(PANE_MAX, rowRect.width - LEFT_MIN)) };
  };

  const step = (delta: number) => {
    const m = measure();
    const max = m?.max ?? PANE_MAX;
    const cur = width ?? m?.cur ?? PANE_MIN;
    const next = clamp(Math.round(cur + delta), PANE_MIN, max);
    onWidth(next);
    onCommit(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const m = measure();
    if (!m) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: clamp(m.cur, PANE_MIN, PANE_MAX), min: PANE_MIN, max: m.max, raf: null, last: null };
    // 포인터는 손잡이(이벤트를 받는 요소)에 잡아야 끄는 동안 move·up이 여기로 옴
    e.currentTarget.setPointerCapture(e.pointerId);
    setActive(true);
    onDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const next = Math.round(clamp(d.startW + (d.startX - e.clientX), d.min, d.max));
    d.last = next;
    if (d.raf !== null) return;
    d.raf = requestAnimationFrame(() => {
      if (dragRef.current) {
        dragRef.current.raf = null;
        if (dragRef.current.last !== null) onWidth(dragRef.current.last);
      }
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.raf !== null) cancelAnimationFrame(d.raf);
    const finalW = Math.round(d.last ?? d.startW);
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // 이미 풀렸으면 무시
    }
    setActive(false);
    onDragging(false);
    onCommit(finalW);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(e.shiftKey ? 64 : 16);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(e.shiftKey ? -64 : -16);
    } else if (e.key === "Enter") {
      e.preventDefault();
      onWidth(null);
      onCommit(null);
    }
  };

  return (
    <div ref={barRef} className="relative w-0 shrink-0">
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label ?? "오른쪽 패널 폭 조절"}
        aria-valuemin={PANE_MIN}
        aria-valuemax={PANE_MAX}
        aria-valuenow={width ?? undefined}
        tabIndex={0}
        title="끌어서 폭 조절 · 두 번 누르면 기본 폭"
        style={{ touchAction: "none" }}
        className="group absolute inset-y-0 -left-1 z-sticky flex w-2 cursor-col-resize items-stretch justify-center outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={() => {
          onWidth(null);
          onCommit(null);
        }}
      >
        <span className={`w-px ${active ? "w-0.5 bg-navy/60" : "bg-transparent group-hover:bg-navy/40 group-focus-visible:w-0.5 group-focus-visible:bg-navy/60"}`} />
      </div>
    </div>
  );
}
