"use client";

import { Plus, Trash2 } from "lucide-react";
import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { PAIR_SIDES, type PairKey } from "../../lib/cards/edit.ts";

/** 짝 칸 표 이름(단추 글·알림) */
export const PAIR_LABEL: Record<PairKey, string> = { feedback: "전년도 환류", findings: "지적 및 개선방안" };

/**
 * 경영관리 카드 원장 편집: 짝 칸 표(전년도 환류·지적 및 개선방안) 행마다 카드 오른쪽 여백에 「아래에 행 추가」·「행 삭제」 단추.
 * 카드 HTML(편집 칸 글 = 카드 JSON)은 건드리지 않고 카드 밖(wrap 위)에 띄워 그 행 칸의 위쪽에 맞춤(코멘트 메모 열 NotesColumn과 같은 방식 — 자리는 스타일로 직접).
 * 행이 없는 표(현행화에서 글을 지운 표)는 머리 칸 옆에 「행 추가」 하나
 */
export function PairRowTools(props: {
  box: RefObject<HTMLDivElement | null>;
  /** 카드가 다시 그려질 때마다 바뀌는 값(자리 다시 재기) */
  layoutKey: string;
  zoom: number;
  keys: PairKey[];
  counts: Record<PairKey, number>;
  onAdd: (key: PairKey, after: number) => void;
  onDelete: (key: PairKey, row: number) => void;
}) {
  const col = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const { box, layoutKey, zoom, keys, counts } = props;

  // 글을 쳐서 행 높이가 바뀌거나 화면 폭이 바뀌면(카드가 가운데로 옮김) 다시 잼
  useEffect(() => {
    const b = box.current;
    const c = col.current;
    if (!b || !c || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(b);
    ro.observe(c);
    return () => ro.disconnect();
  }, [box]);

  useLayoutEffect(() => {
    const c = col.current;
    const b = box.current;
    if (!c || !b) return;
    const c0 = c.getBoundingClientRect();
    const left = b.getBoundingClientRect().right - c0.left + 4;
    c.querySelectorAll<HTMLElement>("[data-pair-row]").forEach((el) => {
      const [key, n] = el.dataset.pairRow!.split(":") as [PairKey, string];
      const row = Number(n);
      const sel = row < 0 ? `[data-p="${key}.headers.${PAIR_SIDES[key][0]}"]` : `[data-p^="${key}.rows.${row}."]`;
      const tops = [...b.querySelectorAll<HTMLElement>(sel)].map((x) => (x.closest("td") ?? x).getBoundingClientRect().top);
      el.hidden = !tops.length;
      if (!tops.length) return;
      el.style.top = `${Math.min(...tops) - c0.top + 2}px`;
      el.style.left = `${left}px`;
    });
  }, [box, layoutKey, zoom, tick, keys, counts]);

  const btn = "pointer-events-auto flex size-[18px] items-center justify-center rounded border border-field-line bg-paper text-muted-2 hover:border-navy hover:text-navy";
  return (
    <div ref={col} data-review-ui className="pointer-events-none absolute inset-0">
      {keys.flatMap((key) => {
        const n = counts[key];
        if (!n)
          return [
            <span key={`${key}:-1`} data-pair-row={`${key}:-1`} hidden className="absolute flex">
              <button type="button" className={btn} onClick={() => props.onAdd(key, -1)} aria-label={`${PAIR_LABEL[key]} 행 추가`} title={`${PAIR_LABEL[key]} 행 추가`}>
                <Plus size={11} aria-hidden="true" />
              </button>
            </span>,
          ];
        return Array.from({ length: n }, (_, i) => (
          <span key={`${key}:${i}`} data-pair-row={`${key}:${i}`} hidden className="absolute flex gap-0.5">
            <button type="button" className={btn} onClick={() => props.onAdd(key, i)} aria-label={`${PAIR_LABEL[key]} ${i + 1}행 아래에 행 추가`} title={`${PAIR_LABEL[key]} ${i + 1}행 아래에 행 추가`}>
              <Plus size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={btn}
              onClick={() => props.onDelete(key, i)}
              aria-label={`${PAIR_LABEL[key]} ${i + 1}행 ${n === 1 ? "비우기" : "삭제"}`}
              title={n === 1 ? `${PAIR_LABEL[key]} ${i + 1}행 비우기(마지막 행은 지우지 않고 글만 비움)` : `${PAIR_LABEL[key]} ${i + 1}행 삭제`}
            >
              <Trash2 size={11} aria-hidden="true" />
            </button>
          </span>
        ));
      })}
    </div>
  );
}
