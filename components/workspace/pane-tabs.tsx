"use client";

import { type KeyboardEvent, useRef } from "react";

export interface PaneTabItem<K extends string = string> {
  key: K;
  label: string;
  /** 탭 오른쪽 숫자 배지(0이거나 없으면 안 보임) */
  badge?: number;
  /** 배지 색: warn(기본 — 예전 그대로) · handoff(받는 쪽 차례 — 사람이 채울 몫이 대부분인 할 일, 경고색 아님) */
  badgeTone?: "warn" | "handoff";
  title?: string;
}

/**
 * 오른쪽 패널 머리 탭(과제원장 「AI 작성지원 | 점검 결과」·경평 초안 「AI 초안 | 점검 결과」 — 같은 모양, 좌우 화살표 키로 이동).
 * 탭 목록(role=tablist)만 그리고, 감싸는 h-14 머리 줄은 부르는 쪽이 그립니다(자리마다 옆에 다른 단추가 있어서).
 */
export function PaneTabs<K extends string>(props: { id?: string; ariaLabel: string; tabs: ReadonlyArray<PaneTabItem<K>>; active: K; onChange: (k: K) => void }) {
  const refs = useRef<Partial<Record<K, HTMLButtonElement | null>>>({});
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const { tabs, active } = props;
    const i = tabs.findIndex((t) => t.key === active);
    if (i < 0) return;
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].key;
    props.onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={props.ariaLabel} onKeyDown={onKeyDown} className="flex min-w-0 items-stretch gap-1">
      {props.tabs.map((t) => (
        <button
          key={t.key}
          ref={(el) => {
            refs.current[t.key] = el;
          }}
          id={props.id ? `${props.id}-${t.key}-tab` : undefined}
          type="button"
          role="tab"
          aria-selected={props.active === t.key}
          aria-controls={props.id ? `${props.id}-${t.key}` : undefined}
          tabIndex={props.active === t.key ? 0 : -1}
          title={t.title}
          onClick={() => props.onChange(t.key)}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-2 text-sm font-bold whitespace-nowrap ${props.active === t.key ? "border-navy text-navy" : "border-transparent text-muted-2 hover:text-navy"}`}
        >
          {t.label}
          {typeof t.badge === "number" && t.badge > 0 && <span className={`rounded-full ${t.badgeTone === "handoff" ? "bg-st-handoff" : "bg-warn"} px-1.5 font-mono text-xs leading-[18px] font-semibold text-white`}>{t.badge > 99 ? "99+" : t.badge}</span>}
        </button>
      ))}
    </div>
  );
}
