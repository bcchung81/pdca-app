"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useCallback, useState } from "react";
import type { NavSection } from "./nav-items";
import { activeHref } from "./nav-items";
import { NavLinks, SHAPES } from "./side-nav";

/**
 * 좁은 폭(md 768px 미만, 휴대폰)의 메뉴: 머리띠 왼쪽 메뉴 단추 → 왼쪽에서 나오는 서랍(네이티브 dialog — 초점 가두기·Esc·배경을 브라우저가 맡음).
 * 항목은 왼쪽 레일과 같은 NavLinks(펼친 모양)이고, 머리띠에서 숨긴 계정·도움말·로그아웃(account)을 아래에 둡니다.
 * 서랍 내용은 열 때만 그려 데스크톱 DOM에 같은 이름의 링크가 겹치지 않게 합니다(단추는 md 이상에서 숨김).
 */
export function NavDrawer({ roleLabel, sections, badges, account }: { roleLabel: string; sections: NavSection[]; badges: Record<string, number>; account: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  // 그려지면 바로 모달로 띄움(이미 열린 dialog에 다시 부르지 않음)
  const show = useCallback((el: HTMLDialogElement | null) => {
    if (el && !el.open) el.showModal();
  }, []);
  const active = activeHref(pathname, sections);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="메뉴 열기"
        aria-expanded={open}
        className="flex size-10 shrink-0 items-center justify-center rounded-md text-navy hover:bg-paper md:hidden"
      >
        <Menu size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
      {open && (
        <dialog
          ref={show}
          aria-label="메뉴"
          onClose={close}
          onClick={(e) => e.target === e.currentTarget && close()}
          className="fixed inset-y-0 left-0 m-0 h-dvh max-h-none w-[min(288px,86vw)] max-w-none border-r border-line-strong bg-nav p-0 text-ink shadow-peek backdrop:bg-navy/20 md:hidden"
        >
          <nav aria-label="주 메뉴" className="flex h-full flex-col gap-0.5 overflow-y-auto px-3 py-3">
            <div className="mb-1.5 flex items-center justify-between gap-2 border-b border-line-strong pb-3">
              <span className="truncate pl-1 text-xs font-semibold tracking-[0.12em] text-muted">{roleLabel}</span>
              <button type="button" onClick={close} aria-label="메뉴 닫기" className="flex size-10 shrink-0 items-center justify-center rounded-md border border-field-line bg-desk text-navy">
                <X size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </div>
            <NavLinks sections={sections} badges={badges} active={active} shape={SHAPES.open} expanded onPick={close} />
            {/* 계정 묶음 안의 링크(도움말)를 눌러도 닫힘 */}
            <div className="mt-auto flex flex-col gap-1 border-t border-line-strong pt-3" onClick={(e) => (e.target as HTMLElement).closest("a") && close()}>
              {account}
            </div>
          </nav>
        </dialog>
      )}
    </>
  );
}
