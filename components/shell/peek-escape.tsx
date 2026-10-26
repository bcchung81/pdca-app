"use client";

import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

/** 보이는 초점 가능 요소만(숨김·접힘 제외) */
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden");
}

/**
 * 옆 창의 초점 관리: 열릴 때 창 안으로(제목 → 없으면 창 자체), Tab은 창 안에서만 돌고,
 * 닫히면 연 요소로 되돌림. 열린 <dialog>(⌘K 빠른 찾기 등)가 있으면 그쪽이 스스로 가두므로 건드리지 않음.
 */
export function usePeekFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = root.querySelector<HTMLElement>("h2") ?? root;
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.defaultPrevented || document.querySelector("dialog[open]")) return;
      const items = focusablesIn(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!active || !root.contains(active) || active === root || active === target) {
        // 창 자체·제목에서 시작하면 자연스러운 다음/이전 요소로, 창 밖이면 끝으로 데려옴
        if (!active || !root.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey) {
          e.preventDefault();
          last.focus();
        }
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [ref]);
}

/** 옆 창을 Esc로 닫고, 초점을 창 안에 둡니다(숨은 표지에서 가장 가까운 aside를 옆 창으로 삼음) */
export function PeekEscape({ closeHref }: { closeHref: string }) {
  const router = useRouter();
  const mark = useRef<HTMLSpanElement>(null);
  const aside = useRef<HTMLElement | null>(null);
  // 아래 usePeekFocus 효과보다 먼저 돌아야 하므로 선언 순서를 지킴
  useEffect(() => {
    aside.current = mark.current?.closest("aside") ?? null;
  }, []);
  usePeekFocus(aside);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) router.push(closeHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeHref, router]);
  return <span hidden ref={mark} />;
}
