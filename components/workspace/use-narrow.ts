"use client";

// 좁은 폭 판정(옆 창 있는 상세 화면 — 과제원장 카드·경평 초안 과제별 초안·보고서 검토).
// CSS는 Tailwind 접두(max-lg:·max-md:)로 바꾸고, 배율·시트 열림처럼 스크립트가 알아야 하는 것만 이 값을 씁니다.
// 서버 그림과 첫 하이드레이션은 늘 넓은 폭(false)이라 어긋나지 않고, 붙은 뒤 실제 폭으로 다시 그립니다.

import { useCallback, useSyncExternalStore } from "react";

/** Tailwind `max-lg`(64rem 미만)와 같은 경계 — 이 폭 밑에서는 오른쪽 패널을 아래 시트로 */
export const NARROW_QUERY = "(width < 64rem)";
/** Tailwind `max-md`(48rem 미만)와 같은 경계 — 휴대폰 폭(머리 아이콘 접기·여백 줄이기) */
export const PHONE_QUERY = "(width < 48rem)";

/** 지금 이 폭인지(이벤트 처리기 안에서 — 렌더에는 useMedia) */
export function mediaMatches(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

/** 미디어 질의가 맞는지(폭이 바뀌면 다시 그림). 서버·첫 하이드레이션은 false */
export function useMedia(query: string): boolean {
  const subscribe = useCallback(
    (on: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
