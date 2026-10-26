"use client";

import { Minus, Plus } from "lucide-react";
import type { StepZoomRange } from "./use-fit-zoom.ts";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const zoomBtn = "flex h-8 w-7 items-center justify-center bg-paper text-ink hover:text-navy disabled:cursor-not-allowed disabled:text-muted";

/** 확대 −·%·+ 단추(경평 초안 도구줄과 같은 모양). 가운데를 누르면 맞춤 배율로 되돌림 */
export function ZoomControl(props: { zoom: number; fitted: boolean; range: StepZoomRange; onZoom: (v: number | null) => void }) {
  const { range } = props;
  const step = (dir: 1 | -1) => clamp(Math.round((props.zoom + dir * range.step) * 10) / 10, range.min, range.max);
  return (
    <span role="group" aria-label="확대 비율" className="inline-flex items-center overflow-hidden rounded-md border border-field-line">
      <button type="button" aria-label="축소" title="축소" disabled={props.zoom <= range.min} onClick={() => props.onZoom(step(-1))} className={zoomBtn}>
        <Minus size={13} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => props.onZoom(null)}
        title={props.fitted ? "남는 폭에 맞춤" : "누르면 남는 폭에 맞춤"}
        className="flex h-8 min-w-[52px] items-center justify-center border-x border-field-line bg-paper px-1.5 font-mono text-xs text-ink"
      >
        {Math.round(props.zoom * 100)}%
      </button>
      <button type="button" aria-label="확대" title="확대" disabled={props.zoom >= range.max} onClick={() => props.onZoom(step(1))} className={zoomBtn}>
        <Plus size={13} aria-hidden />
      </button>
    </span>
  );
}
