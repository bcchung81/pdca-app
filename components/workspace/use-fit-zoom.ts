"use client";

// 왼쪽 문서(카드 원본 배치·경평 초안 종이)가 남는 폭에 맞춰 CSS zoom으로 확대하는 공용 배율 계산.
// 경평 초안(draft-workspace)의 로직을 옮겨 과제관리카드와 함께 씁니다 — 두 화면 모두 반응형 배율(과제관리카드는
// 이전에 오른쪽 패널이 860px 고정이었음)을 씁니다.

import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface ZoomRange {
  min: number;
  max: number;
}
export interface StepZoomRange extends ZoomRange {
  step: number;
}

export interface UseFitZoomOptions {
  /** 이 브라우저에 기억할 열쇠(localStorage) — 손으로 고른 배율 */
  storageKey: string;
  /** 문서 폭(px) — 고정 값(예: 보고서 종이 182mm). 카드처럼 문서마다 폭이 다르면 measureRef를 대신 줌 */
  docWidthPx?: number;
  /** zoom을 건 바로 그 요소(문서 폭을 재는 대상) — docWidthPx가 없을 때만 씀. 지금 배율로 나눠 배율 1일 때 폭을 구함 */
  measureRef?: RefObject<HTMLElement | null>;
  /** 왼쪽 남는 폭 중 문서가 못 쓰는 몫(옆 여백·여백 메모 열 등). 여백 메모 열처럼 남는 폭에 따라 보일지 정해지면 함수로 줌 */
  reservePx: number | ((leftW: number) => number);
  /** 맞춤 확대 범위(남는 폭 ÷ 문서 폭) */
  fitRange?: ZoomRange;
  /** 단추로 고르는 범위 */
  handRange?: StepZoomRange;
  /** true인 동안 왼쪽 남는 폭 재측정을 반영하지 않음(구분선을 끄는 중) — false로 바뀌면 한 번 다시 재서 반영 */
  paused?: boolean;
}

const DEFAULT_FIT: ZoomRange = { min: 0.6, max: 1.6 };
const DEFAULT_HAND: StepZoomRange = { min: 0.5, max: 2, step: 0.1 };
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function useFitZoom(opts: UseFitZoomOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [leftW, setLeftW] = useState(0);
  const [natural, setNatural] = useState<number | null>(opts.docWidthPx ?? null);
  const [hand, setHand] = useState<number | null>(null);
  const fitRange = opts.fitRange ?? DEFAULT_FIT;
  const handRange = opts.handRange ?? DEFAULT_HAND;

  // 왼쪽 스크롤 영역의 남는 폭 — paused인 동안(구분선을 끄는 중)은 재측정을 반영하지 않고,
  // paused가 풀리면(deps에 넣어 effect를 다시 돎) 바로 한 번 다시 재서 반영
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      if (opts.paused) return;
      setLeftW(el.clientWidth);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [opts.paused]);

  // 이 브라우저에 기억한 확대(없으면 맞춤) — 서버 그림에는 없는 값이라 붙은 뒤에 읽음
  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(opts.storageKey));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v >= handRange.min && v <= handRange.max) setHand(v);
    } catch {
      // 저장 공간을 못 쓰면 맞춤
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.storageKey]);

  const reserve = typeof opts.reservePx === "function" ? opts.reservePx(leftW) : opts.reservePx;
  const fit = leftW && natural ? clamp(Math.floor(((leftW - reserve) / natural) * 100) / 100, fitRange.min, fitRange.max) : 1;
  const zoom = hand ?? fit;

  // 문서 폭을 재는 방식(docWidthPx가 없을 때, 예: 카드): 지금 그려진 폭 ÷ 지금 배율 = 배율 1일 때 폭.
  // 값이 크게 바뀌지 않으면 다시 갱신하지 않음(같은 값으로 수렴 — 무한 반복 없음)
  useLayoutEffect(() => {
    if (opts.docWidthPx !== undefined) return;
    const el = opts.measureRef?.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (!w) return;
      const n = w / zoom;
      setNatural((prev) => (prev !== null && Math.abs(prev - n) < 0.5 ? prev : n));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.measureRef, zoom]);

  const setZoom = (v: number | null) => {
    setHand(v);
    try {
      if (v === null) localStorage.removeItem(opts.storageKey);
      else localStorage.setItem(opts.storageKey, String(v));
    } catch {
      // 기억하지 못해도 이 화면에서는 적용
    }
  };

  return { scrollRef, zoom, hand, setZoom, leftW, natural, fitRange, handRange };
}
