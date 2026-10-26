"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { T } from "../ui/kit";

export interface FilterOption {
  value: string;
  label: string;
  /** 마우스를 올리면 보이는 전체 이름 */
  title?: string;
  n?: number;
  href: string;
}

export interface FilterGroup {
  key: string;
  label: string;
  /** 지금 고른 값(없으면 빈 글 = 전체) */
  current: string;
  /** 이 묶음의 선택만 푸는 주소 */
  allHref: string;
  options: FilterOption[];
}

/**
 * 공통 지식 필터: 문서·유형·지표 선택지가 많아(문서만 50여 개) 한 줄 칩으로 펼치면 화면을 덮으므로,
 * 「필터」 버튼 하나 + 고른 조건만 칩으로 보임(과제 원장의 필터와 같은 방식). 칩은 누르면 그 조건만 풀림.
 * 열린 채로 고르면 소프트 이동이라 상태가 유지되어 문서 → 유형 → 지표를 이어서 고를 수 있음.
 */
export function KnowledgeFilter({ groups, clearHref }: { groups: FilterGroup[]; clearHref: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const active = groups.flatMap((g) => {
    const o = g.options.find((x) => x.value === g.current);
    return g.current ? [{ key: g.key, label: g.label, text: o?.label ?? g.current, href: g.allHref }] : [];
  });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative flex min-w-0 flex-wrap items-center gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-3 text-ui ${open || active.length ? "border-navy bg-paper font-semibold text-navy" : "border-line-strong bg-paper text-muted-2 hover:border-navy hover:text-navy"}`}
      >
        필터{active.length ? ` ${active.length}` : ""}
        <span aria-hidden="true" className="text-xs">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {active.map((a) => (
        <Link key={a.key} href={a.href} scroll={false} title={`${a.label}: ${a.text} — 누르면 풀림`} className="flex h-8 max-w-[420px] min-w-0 items-center gap-1.5 rounded-full border border-navy bg-paper px-3 text-xs text-navy no-underline">
          <span className="shrink-0 text-muted-2">{a.label}</span>
          <span className="truncate font-semibold">{a.text}</span>
          <span aria-hidden="true" className="shrink-0">
            ✕
          </span>
        </Link>
      ))}
      {!active.length && !open && <span className="text-xs text-muted-2">문서·유형·지표로 좁히기</span>}

      {open && (
        <div className="absolute top-full left-0 z-menu mt-1.5 w-[min(960px,92vw)] rounded-lg border border-line bg-paper p-4 shadow-lg">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            {groups.map((g) => (
              <fieldset key={g.key} className="min-w-0">
                <legend className="mb-1.5 flex w-full items-baseline justify-between text-xs font-semibold text-muted">
                  {g.label}
                  <span className="font-mono font-normal">{g.options.length}</span>
                </legend>
                <ul className="flex max-h-[340px] flex-col overflow-y-auto rounded-md border border-row-line p-0.5">
                  {[{ value: "", label: "전체", n: undefined, href: g.allHref, title: undefined }, ...g.options].map((o) => {
                    const on = o.value === g.current;
                    return (
                      <li key={o.value || "all"}>
                        <Link
                          href={o.href}
                          scroll={false}
                          title={o.title ?? o.label}
                          aria-current={on ? "true" : undefined}
                          className={`flex min-w-0 items-center gap-2 rounded px-2 py-1 text-ui no-underline ${on ? "bg-row-hover font-bold text-navy" : "text-ink hover:bg-row-hover"}`}
                        >
                          <span aria-hidden="true" className="w-3 shrink-0 text-xs text-navy">
                            {on ? "✓" : ""}
                          </span>
                          <span className="min-w-0 truncate">{o.label}</span>
                          {o.n !== undefined && <span className="ml-auto shrink-0 font-mono text-xs text-muted">{o.n}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
            <Link href={clearHref} scroll={false} className="flex h-7 items-center text-xs text-link underline">
              필터 모두 지우기
            </Link>
            <button type="button" onClick={() => setOpen(false)} className={T.btnPrimarySm}>
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
