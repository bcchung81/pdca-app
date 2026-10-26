"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * 긴 글을 높이 maxPx까지만 보이고 아래를 흐리게 — 넘칠 때만 「전체 보기」(누르면 전부, 「접기」로 되돌림).
 * 넘치는지는 안쪽 내용 높이를 재서 정함(글꼴·폭이 바뀌면 다시 잼). 배경색과 상관없이 흐리게 하려고 mask를 씀
 */
export function Clamp(props: { maxPx: number; children: ReactNode }) {
  const inner = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setOver(el.offsetHeight > props.maxPx + 2));
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.maxPx]);
  const clipped = over && !open;
  return (
    <div className="flex min-w-0 flex-col">
      <div style={open ? undefined : { maxHeight: props.maxPx }} className={`overflow-hidden ${clipped ? "[mask-image:linear-gradient(to_bottom,#000_60%,transparent)]" : ""}`}>
        <div ref={inner}>{props.children}</div>
      </div>
      {over && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="mt-0.5 self-start text-xs font-semibold text-link hover:underline">
          {open ? "접기" : "전체 보기"}
        </button>
      )}
    </div>
  );
}
