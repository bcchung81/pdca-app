"use client";

// 좁은 폭(64rem 미만 — Tailwind max-lg)의 오른쪽 패널(과제원장 AI 작성지원·점검 결과·자료·수정 이력, 경평 초안 AI 초안·점검 결과·근거 자료,
// 보고서 검토 코멘트)을 아래에서 올라오는 시트로 여는 부품. 넓은 폭(lg 이상)에서는 감싼 상자가 모두 display:contents라
// 패널이 예전처럼 작업 공간 행의 자식으로 옆에 붙고(폭·구분선·접기 그대로), 시트 머리·바탕 막·떠 있는 단추는 그리지 않습니다.

import { X } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { NARROW_QUERY, mediaMatches } from "./use-narrow.ts";

/**
 * 감싼 패널을 좁은 폭에서만 시트로(높이 88dvh — 주소창·키보드에 따라 줄어드는 동적 높이 기준이라 아래 입력창이 덜 가림).
 * 처음엔 닫힘(본문이 전체 폭). ✕·바탕 막 누르기·Esc로 닫힘. 패널 폭(RIGHT_PANE·기억한 폭 인라인 스타일)은 시트 안에서만 !important로 전체 폭.
 * 패널은 닫혀도 언마운트하지 않음(숨김만 — AI 요청 진행·입력 중인 글이 남음).
 */
export function NarrowSheet({ open, onClose, label, closeLabel, children }: { open: boolean; onClose: () => void; label: string; /** 닫기 단추의 aria-label(없으면 「<label> 닫기」) — label에 개수처럼 바뀌는 글이 들 때 일정하게 */ closeLabel?: string; children: ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Esc: 좁은 폭에서 시트가 열려 있으면 시트부터 닫음(capture — 안쪽 패널 Esc·옆 창 닫기보다 먼저). 대화 상자·메뉴 안의 Esc는 그쪽에 맡김
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || !mediaMatches(NARROW_QUERY)) return;
      if (e.target instanceof Element && e.target.closest("dialog,[role=menu]")) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  // 열면 시트의 닫기 단추로 초점(좁은 폭에서만 — 넓은 폭에는 시트 머리가 없음)
  useEffect(() => {
    if (open && mediaMatches(NARROW_QUERY)) closeRef.current?.focus({ preventScroll: true });
  }, [open]);
  return (
    <div className={`lg:contents ${open ? "max-lg:flex" : "max-lg:hidden"} max-lg:fixed max-lg:inset-0 max-lg:z-peek max-lg:flex-col max-lg:justify-end`}>
      <div aria-hidden onClick={onClose} className="min-h-0 grow bg-black/30 lg:hidden" />
      {/* 가로 모드(높이가 낮음)는 시트를 화면 높이 전체로 — 88dvh(약 340px)에서는 입력창·보내기가 시트 밖으로 밀렸음(2026-10-29 점검) */}
      <div className="lg:contents max-lg:flex max-lg:h-[88dvh] max-lg:shrink-0 max-lg:flex-col max-lg:overflow-hidden max-lg:rounded-t-xl max-lg:bg-paper max-lg:shadow-pop max-lg:landscape:h-dvh max-lg:landscape:rounded-none">
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-line pr-1.5 pl-4 lg:hidden">
          <span className="min-w-0 truncate text-sm font-bold text-navy">{label}</span>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={closeLabel ?? `${label} 닫기`} title="닫기 (Esc)" className="flex size-10 shrink-0 items-center justify-center rounded-md text-muted hover:bg-row-hover hover:text-navy">
            <X size={18} aria-hidden />
          </button>
        </div>
        {/* 본문이 시트 높이보다 길면(가로 모드·키보드가 올라온 때) 시트 안에서 스크롤 — 입력창·보내기 단추가 늘 닿게 */}
        <div className="lg:contents max-lg:flex max-lg:min-h-0 max-lg:grow max-lg:flex-col max-lg:overflow-y-auto max-lg:*:min-h-0 max-lg:*:max-w-none! max-lg:*:grow max-lg:*:border-l-0 max-lg:*:w-full!">{children}</div>
      </div>
    </div>
  );
}

/**
 * 좁은 폭에서 시트를 여는 떠 있는 단추(화면 오른쪽 아래 — 시트가 열려 있으면 그리지 않음, 넓은 폭에서는 숨김).
 * 휴대폰 폭(md 미만)에서는 본문을 덜 가리게 작은 원형(높이 40px) + 짧은 글(short — 없으면 label)
 */
export function SheetButton({ open, onOpen, label, short, icon, badge }: { open: boolean; onOpen: () => void; label: string; short?: string; icon: ReactNode; badge?: number }) {
  if (open) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label} 열기`}
      className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-bar flex h-11 items-center gap-1.5 rounded-full bg-navy px-4 text-sm font-semibold whitespace-nowrap text-white shadow-pop lg:hidden max-md:right-3 max-md:bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:h-10 max-md:gap-1 max-md:px-3 max-md:text-xs"
    >
      {icon}
      {short ? (
        <>
          <span className="max-md:hidden">{label}</span>
          <span className="md:hidden">{short}</span>
        </>
      ) : (
        label
      )}
      {typeof badge === "number" && badge > 0 && <span className="rounded-full bg-paper px-1.5 font-mono text-xs leading-[18px] text-navy">{badge > 99 ? "99+" : badge}</span>}
    </button>
  );
}
