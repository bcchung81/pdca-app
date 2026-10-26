"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** 목록이 단추에서 떨어지는 틈·화면 가장자리 여백(px) */
const GAP = 4;
const EDGE = 8;

/**
 * 단추를 누르면 펼치는 작은 목록(첨부할 카드 자료 고르기 등). 목록은 body 포털 + position: fixed로 화면 맨 위 층에 그려
 * 부모 상자의 overflow(요청 입력줄의 높이 제한 스크롤 등)에 잘리지 않음 — 예전에는 요청 입력줄 안에서 위로 펼쳐 윗부분이 잘렸음(2026-09-28).
 * 단추 위쪽 공간이 넉넉하면 위로, 아니면 아래로 펼치고, 바깥 누르기·Esc·바깥 스크롤·창 크기 바뀜이면 닫힘.
 */
export function DropMenu(props: {
  /** 단추 안 글 */
  label: ReactNode;
  buttonClass: string;
  /** 목록 폭(px) */
  width?: number;
  disabled?: boolean;
  title?: string;
  /** 아이콘만 있는 단추의 이름 */
  ariaLabel?: string;
  /** 목록 항목 — close를 불러 닫음 */
  children: (close: () => void) => ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; maxH: number } | null>(null);
  const width = props.width ?? 288;
  const close = () => setPos(null);

  /** 단추 자리를 재서 펼칠 방향·높이를 정함(누를 때 한 번 — 효과 안에서 setState하지 않음) */
  const toggle = () => {
    if (pos) return close();
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - width - EDGE));
    const above = r.top - GAP - EDGE;
    const below = window.innerHeight - r.bottom - GAP - EDGE;
    setPos(above >= Math.min(240, below) ? { left, bottom: window.innerHeight - r.top + GAP, maxH: Math.min(240, above) } : { left, top: r.bottom + GAP, maxH: Math.min(240, below) });
  };

  // 바깥 누르기·Esc·바깥 스크롤·창 크기 바뀜이면 닫음(목록 안 스크롤은 그대로)
  useEffect(() => {
    if (!pos) return;
    const inside = (t: EventTarget | null) => t instanceof Node && (menu.current?.contains(t) || btn.current?.contains(t));
    const down = (e: MouseEvent) => {
      if (!inside(e.target)) setPos(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPos(null);
        btn.current?.focus();
      }
    };
    const scroll = (e: Event) => {
      if (!(e.target instanceof Node && menu.current?.contains(e.target))) setPos(null);
    };
    const resize = () => setPos(null);
    document.addEventListener("mousedown", down, true);
    document.addEventListener("keydown", key, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("keydown", key, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", resize);
    };
  }, [pos]);

  return (
    <>
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={Boolean(pos)} aria-label={props.ariaLabel} disabled={props.disabled} title={props.title} onClick={toggle} className={props.buttonClass}>
        {props.label}
      </button>
      {pos &&
        createPortal(
          <span
            ref={menu}
            role="menu"
            style={{ position: "fixed", left: pos.left, top: pos.top, bottom: pos.bottom, width, maxHeight: pos.maxH }}
            className="z-float flex flex-col overflow-y-auto rounded-md border border-line-strong bg-paper py-1 shadow-menu"
          >
            {props.children(close)}
          </span>,
          document.body,
        )}
    </>
  );
}
