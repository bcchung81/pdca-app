"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compactKey } from "../../lib/knowledge/normalize.ts";

export interface FindItem {
  uid: string;
  taskNo: string;
  title: string;
  group: string;
  team: string;
}

/** 과제 빠른 찾기(⌘K / Ctrl+K): 과제번호·과제명·부서로 찾아 카드 옆 창을 바로 엽니다 */
export function QuickFind({ items, base }: { items: FindItem[]; base: "/cards" | "/my" }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);

  const shown = useMemo(() => {
    const terms = q.split(/\s+/).map(compactKey).filter(Boolean);
    const hay = (i: FindItem) => compactKey(`${i.group} ${i.taskNo} ${i.title} ${i.team}`);
    return (terms.length ? items.filter((i) => terms.every((t) => hay(i).includes(t))) : items).slice(0, 12);
  }, [items, q]);

  const open = useCallback(() => {
    setQ("");
    setCursor(0);
    dialog.current?.showModal();
    requestAnimationFrame(() => input.current?.focus());
  }, []);
  const close = useCallback(() => dialog.current?.close(), []);
  const go = (i: FindItem | undefined) => {
    if (!i) return;
    close();
    router.push(`${base}?peek=${i.uid}`, { scroll: false });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) close();
        else open();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-keyshortcuts="Meta+K Control+K"
        aria-label="과제 찾기 (⌘K)"
        title="과제 찾기 (⌘K / Ctrl+K)"
        className="flex h-8 shrink-0 items-center gap-2 rounded-md border border-line-strong bg-field px-2.5 text-ui whitespace-nowrap text-muted hover:border-navy"
      >
        <Search size={15} strokeWidth={1.8} aria-hidden="true" />
        <span className="hidden lg:inline">과제 찾기</span>
        <kbd className="hidden rounded border border-line-strong px-1 font-mono text-xs whitespace-nowrap xl:inline">⌘K</kbd>
      </button>
      <dialog
        ref={dialog}
        aria-label="과제 찾기"
        onClick={(e) => e.target === dialog.current && close()}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          }
        }}
        className="fixed top-[12vh] mx-auto w-[640px] max-w-[92vw] rounded-lg border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-navy/20"
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-muted" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, shown.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(shown[cursor]);
              }
            }}
            placeholder="과제번호·과제명·부서 (예: 1-가, 안테나, 검사기획)"
            aria-label="찾을 과제"
            aria-controls="quick-find-list"
            aria-activedescendant={shown[cursor] ? `qf-${shown[cursor].uid}` : undefined}
            className="h-12 min-w-0 grow border-0 bg-transparent text-base outline-none"
          />
          <kbd className="shrink-0 rounded border border-line-strong px-1 font-mono text-xs text-muted">Esc</kbd>
        </div>
        <ul id="quick-find-list" role="listbox" aria-label="찾은 과제" className="max-h-[52vh] overflow-y-auto py-1">
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">찾은 과제가 없습니다.</li>}
          {shown.map((i, n) => (
            <li
              key={i.uid}
              id={`qf-${i.uid}`}
              role="option"
              aria-selected={n === cursor}
              onMouseEnter={() => setCursor(n)}
              onClick={() => go(i)}
              className={`flex min-w-0 cursor-pointer items-center gap-3 px-4 py-2.5 ${n === cursor ? "bg-row-hover" : ""}`}
            >
              <span className="w-[112px] shrink-0 truncate font-mono text-xs text-muted">
                {i.group} {i.taskNo}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold text-navy" title={i.title}>
                {i.title}
              </span>
              <span className="ml-auto shrink-0 truncate text-xs text-muted-2">{i.team}</span>
            </li>
          ))}
        </ul>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">↑↓ 고르기 · Enter 열기 · {items.length}개 과제 중</p>
      </dialog>
    </>
  );
}
