"use client";

import { ChevronUp, GripVertical } from "lucide-react";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { blockEls } from "./draft-review";
import { BlockEditor } from "./outline-block";
import { type OutlineData, type OutlineEdit, rowOf } from "./outline-panel";

/** 메모 사이 간격(과제원장 여백 메모와 같음) */
const NOTE_GAP = 8;
/** 1mm = CSS px */
const PX_PER_MM = 96 / 25.4;

/** 구성안 블록 bi가 가리키는 종이 위 요소들(블록 하나가 여러 요소일 수 있음 — 렌더러가 맨 위 요소마다 data-block을 담). 블록 고치기 메모의 추진성과(-1)는 data-result 상자(blockEls) */
function anchorsOf(box: HTMLElement, at: number | null): HTMLElement[] {
  if (at === null) return [];
  return blockEls(box, at);
}
/** 요소들을 합친 상자(화면 좌표 — 확대(zoom)가 반영된 값) */
function unionRect(els: HTMLElement[]): { top: number; bottom: number } | null {
  if (!els.length) return null;
  let top = Infinity;
  let bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
  }
  return { top, bottom };
}

/**
 * 경평 초안 과제별 초안의 여백 메모(과제원장 카드 리뷰어 여백 메모 — components/cards/review/review-ui.tsx NotesColumn과 같은 방식):
 * 구성안 블록마다 메모 한 장을 그 블록 높이에 세우고(겹치면 NOTE_GAP만큼 아래로, 크기가 바뀌면 다시 잼), 올리면 블록 강조, 누르면 그 블록으로 옮겨 깜박임.
 * 메모는 기본 접힘(한 줄 머리 + 보여 줄 것 한 줄 — 블록보다 커서 아래 메모가 계속 밀리지 않게), 누르거나 키보드 초점이 들어오면 펼침(한 번에 하나).
 * 구성안 판면에서는 구성안 블록 상자에, 초안에서는 짝지은 초안 블록(planMatch)에 섬 — 짝이 없는 블록은 맨 아래 「초안에 없음」,
 * 짝이 하나도 없으면(예전 판 초안) 맨 위 안내 한 장만(누르면 구성안 보기로).
 * 펼친 메모가 블록 편집 칸(components/reports/outline-block.tsx — 도식·라벨·목적·칸·재료·메모·그림·순서)이고 오른쪽 구성안 패널과 같은 상태(useOutlineEdit)를 씀.
 * 메모는 지금 편집 순서대로(구성안 판면의 data-block = 순서 — 고치면 서버 미리보기가 판면을 다시 그림), 초안 보기에서는 저장된 블록 번호로 짝(planMatch).
 * 사람이 더한 블록은 초안에 짝이 없어 아래 「초안에 없거나 뺀 블록」, 뺀 블록은 되살리기만.
 */
export function OutlineNotes(props: {
  /** 종이(확대된) 상자 */
  box: RefObject<HTMLDivElement | null>;
  /** 종이가 다시 그려질 때마다 바뀌는 값(보기·확대) */
  layoutKey: string;
  view: "outline" | "draft";
  /** 구성안(없으면 블록 고치기 메모만) */
  data: OutlineData | null;
  /** 구성안 메모를 이 열에 세울지(좁은 창이면 오른쪽 구성안 목록 — 블록 고치기 메모만) */
  showOutline: boolean;
  ed: OutlineEdit;
  canEdit: boolean;
  /** 구성안 블록마다 초안 블록 순번(planMatch) — 초안 보기에서 씀 */
  match: Array<number | null>;
  zoom: number;
  onShowMaterial: (id: string) => void;
  /** 구성안 판으로 바꾸기(짝이 하나도 없을 때 안내) */
  onShowOutline: () => void;
  /** 블록 고치기 작성 카드(data-composer·data-at — 그 블록 높이에 먼저 세우고 다른 메모는 피함) */
  composer?: ReactNode;
  /** 블록 고치기 결과 메모(data-rnote·data-at) */
  reviewNotes?: ReactNode;
  reviewCount?: number;
}) {
  const { box, view, ed, match, zoom } = props;
  const data = props.showOutline ? props.data : null;
  const outlineView = ed.view ?? data?.view ?? null;
  const col = useRef<HTMLDivElement>(null);
  // 크기가 바뀌면 다시 그려 자리를 다시 잼(값은 쓰지 않음)
  const [, setTick] = useState(0);
  // 펼친 메모(한 번에 하나 — 블록 열쇠, 종이 블록 누르기·좁은 창 목록과 같은 상태)
  const open = ed.openKey;
  const setOpen = ed.setOpenKey;
  // 끌어서 순서 바꾸기: 끄는 메모 자리 → 놓을 메모 자리
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** 편집 순서 pos의 종이 위 자리: 구성안 판면은 순서 그대로, 초안은 저장된 블록 번호의 짝 */
  const at = (pos: number) => {
    if (view === "outline") return pos;
    const from = ed.items[pos]?.block.from;
    return from === null || from === undefined ? null : (match[from] ?? null);
  };
  const noMatch = Boolean(data) && view === "draft" && match.every((x) => x === null);
  // 보일 메모: 지금 순서의 블록 + (쓸 수 있으면) 뺀 블록(되살리기). 짝이 하나도 없으면 안내만
  const positions = !data || noMatch ? [] : ed.items.map((_, i) => i);
  const dropped = data && props.canEdit && !noMatch ? ed.dropped : [];
  const hasComposer = Boolean(props.composer);

  // 종이·메모 크기가 바뀌면 다시 잼(자간 맞춤·글꼴 적재·확대·펼침 뒤)
  useEffect(() => {
    const b = box.current;
    const cl = col.current;
    if (!b || !cl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setTick((t) => t + 1));
    ro.observe(b);
    cl.querySelectorAll("[data-note],[data-rnote],[data-composer],[data-guide]").forEach((x) => ro.observe(x));
    return () => ro.disconnect();
  }, [box, positions.length, dropped.length, view, props.reviewCount, hasComposer]);

  useLayoutEffect(() => {
    const cl = col.current;
    const b = box.current;
    if (!cl || !b) return;
    const top0 = cl.getBoundingClientRect().top;
    const yOf = (els: HTMLElement[]) => {
      const r = unionRect(els);
      return r ? r.top - top0 - 4 : null;
    };
    // 작성 카드(블록 고치기)는 제자리 우선 — 다른 메모는 그 자리를 피함(과제원장 여백 메모와 같음)
    const comp = cl.querySelector<HTMLElement>("[data-composer]");
    let cTop: number | null = null;
    let cBot = 0;
    if (comp) {
      cTop = Math.max(0, yOf(anchorsOf(b, Number(comp.dataset.at))) ?? 0);
      comp.style.top = `${cTop}px`;
      cBot = cTop + comp.offsetHeight;
    }
    const items: Array<{ el: HTMLElement; y: number | null }> = [];
    // 짝이 하나도 없을 때 안내 한 장은 맨 위
    const guide = cl.querySelector<HTMLElement>("[data-guide]");
    if (guide) items.push({ el: guide, y: 0 });
    for (const el of cl.querySelectorAll<HTMLElement>("[data-note]")) {
      // 뺀 블록(data-drop)은 자리 없이 아래에
      const r = el.dataset.drop !== undefined ? null : unionRect(anchorsOf(b, at(Number(el.dataset.note))));
      // 초안 보기: 그 블록 상자를 재서 「실제 Nmm」(확대를 걷어 mm로), 예산을 넘으면 경고 톤 — 글은 React가 비워 둔 칸에만 씀
      el.querySelectorAll<HTMLElement>("[data-real]").forEach((real) => {
        const budget = Number(real.dataset.real) || 0;
        const mm = r && view === "draft" && budget ? Math.round((r.bottom - r.top) / zoom / PX_PER_MM) : null;
        real.textContent = mm === null ? "" : ` / 실제 ${mm}mm`;
        real.classList.toggle("text-warn", mm !== null && mm > budget);
      });
      items.push({ el, y: r ? r.top - top0 - 4 : null });
    }
    // 블록 고치기 결과 메모는 그 초안 블록 높이에(블록이 없어졌으면 맨 아래)
    for (const el of cl.querySelectorAll<HTMLElement>("[data-rnote]")) items.push({ el, y: yOf(anchorsOf(b, Number(el.dataset.at))) });
    // 자리가 있는 메모는 블록 높이 순(자기 블록 top에서 시작, 겹치면 아래 메모만 밀림), 자리가 없는 메모(초안에 없음)는 그 뒤에
    const placed = items.filter((x) => x.y !== null).sort((x, y) => x.y! - y.y!);
    const loose = items.filter((x) => x.y === null);
    let prev = -1e9;
    let bottom = cBot;
    for (const it of placed) {
      const h = it.el.offsetHeight;
      let y = Math.max(it.y!, prev + NOTE_GAP);
      if (cTop !== null && y < cBot + NOTE_GAP && y + h > cTop - NOTE_GAP) y = cBot + NOTE_GAP;
      it.el.style.top = `${y}px`;
      prev = y + h;
      bottom = Math.max(bottom, prev);
    }
    const head = cl.querySelector<HTMLElement>("[data-loose-head]");
    let y = Math.max(bottom + (placed.length ? 16 : 0), 0);
    if (head) {
      head.style.top = `${y}px`;
      head.style.display = loose.length ? "" : "none";
      if (loose.length) y += head.offsetHeight + 4;
    }
    for (const it of loose) {
      it.el.style.top = `${y}px`;
      y += it.el.offsetHeight + NOTE_GAP;
    }
    cl.style.minHeight = `${Math.max(bottom, y) + 16}px`;
  });

  const hover = (bi: number, on: boolean) => {
    const b = box.current;
    if (!b) return;
    b.querySelectorAll(".kc-anchor-hot").forEach((x) => x.classList.remove("kc-anchor-hot"));
    if (on) anchorsOf(b, at(bi)).forEach((x) => x.classList.add("kc-anchor-hot"));
  };
  const goto = (bi: number) => {
    const b = box.current;
    if (!b) return;
    const els = anchorsOf(b, at(bi));
    if (!els.length) return;
    els[0].scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "nearest" });
    for (const el of els) {
      el.classList.remove("kc-flash");
      void el.offsetWidth;
      el.classList.add("kc-flash");
      setTimeout(() => el.classList.remove("kc-flash"), 2600);
    }
  };

  const busy = Boolean(ed.busy);
  const table = data?.names.table ?? [];

  return (
    <div ref={col} role="complementary" aria-label="여백 메모" className="relative w-[272px] shrink-0">
      {noMatch && (
        <button type="button" data-guide onClick={props.onShowOutline} className="absolute right-0 left-0 flex flex-col gap-1 rounded-bubble bg-paper px-3 py-2.5 text-left shadow-note hover:ring-1 hover:ring-navy/30">
          <span className="text-ui leading-[1.5] font-semibold break-keep text-navy">이 초안은 지금 구성안과 짝이 맞지 않습니다</span>
          <span className="text-xs leading-[1.5] break-keep text-muted-2">「구성안」 보기에서 블록을 보세요 — 누르면 구성안 판면으로 바꿉니다.</span>
        </button>
      )}
      {props.composer}
      {props.reviewNotes}
      <p data-loose-head className="absolute right-0 left-0 rounded-md bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn" style={{ display: "none" }}>
        {view === "draft" ? "초안에 없음 — 짝지은 초안 블록이 없거나 새로 더한 블록, 뺀 블록" : "뺀 블록 — 저장하면 사라짐"}
      </p>
      {dropped.map((from) => {
        const orig = data!.edit.blocks[from];
        if (!orig) return null;
        return (
          <div key={`d${from}`} data-note={from} data-drop="" className="absolute right-0 left-0 transition-[top] duration-200">
            <div className="flex min-w-0 items-center gap-2 rounded-bubble bg-paper/70 px-3 py-1.5 text-xs text-muted-2">
              <span className="min-w-0 truncate line-through" title={orig.purpose}>
                {orig.label || "전폭"} · {rowOf(table, orig.kind, orig.variant)?.name ?? orig.kind}
              </span>
              <button type="button" disabled={busy} onClick={() => ed.restore(from)} className="ml-auto shrink-0 font-semibold text-link hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline">
                되살리기
              </button>
            </div>
          </div>
        );
      })}
      {positions.map((pos) => {
        const item = ed.items[pos];
        if (!item) return null;
        const b = item.block;
        const row = rowOf(table, b.kind, b.variant);
        const budget = outlineView?.budgets[pos] ?? 0;
        const label = b.label || "전폭";
        const isOpen = open === item.key;
        const human = b.from === null || (b.from !== null && data!.outline.blocks[b.from]?.by === "human");
        // 크기 줄: 칸·예산(초안 보기는 「예산 / 실제 mm」 — 실제는 잰 뒤 채움)
        const size = (
          <>
            {row?.unit ?? "칸"} {b.cells} · {budget ? `예산 ${budget}mm` : b.kind === "chart" ? "앞 행 막대" : "—"}
            <span data-real={budget} className="font-semibold" />
          </>
        );
        const canDrag = props.canEdit && !busy && ed.items.length > 1;
        const dropping = dragFrom !== null && dropAt === pos && dragFrom !== pos;
        // 머리 단추는 접힘·펼침 모두 같은 요소(펼칠 때 초점이 사라지지 않게): 누르면 펼치고 그 블록을 강조, 키보드 초점이 들어와도 펼침
        const header = (
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => {
              setOpen(item.key);
              goto(pos);
            }}
            onFocus={() => setOpen(item.key)}
            title={`${human ? "담당자가 고친 블록 · " : ""}${row?.unit ?? "칸"} ${b.cells}${budget ? ` · 예산 ${budget}mm` : ""}`}
            className="flex min-w-0 grow flex-col gap-0.5 text-left"
          >
            <span className="flex w-full min-w-0 items-baseline gap-1.5">
              <span className="shrink-0 font-mono text-xs font-bold text-navy">{pos + 1}</span>
              <span className="min-w-0 truncate text-ui font-semibold text-navy">{label}</span>
              <span className="min-w-0 shrink-0 truncate text-xs text-muted-2">{row?.name ?? b.kind}</span>
            </span>
            {!isOpen && (b.purpose ? <span className="line-clamp-2 w-full min-w-0 text-xs leading-[1.45] break-keep text-ink">{b.purpose}</span> : <span className="text-xs text-warn">목적 비어 있음</span>)}
          </button>
        );
        return (
          <div
            key={item.key}
            data-note={pos}
            className="absolute right-0 left-0 transition-[top] duration-200"
            onMouseEnter={() => hover(pos, true)}
            onMouseLeave={() => hover(pos, false)}
            // 끌어 온 메모를 이 자리에 놓으면 순서가 바뀜(놓으면 판면을 바로 다시 그림)
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              if (dropAt !== pos) setDropAt(pos);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) ed.moveTo(dragFrom, pos);
              setDragFrom(null);
              setDropAt(null);
            }}
            // 키보드 초점이 메모 밖으로 나가면 접음(도식 목록 대화 창으로 가는 초점은 접지 않음)
            onBlur={(e) => {
              const to = e.relatedTarget as Node | null;
              if (!to || e.currentTarget.contains(to) || (to instanceof Element && to.closest("dialog"))) return;
              setOpen((o) => (o === item.key ? null : o));
            }}
          >
            {dropping && <div aria-hidden="true" className={`absolute right-2 left-2 h-0.5 rounded bg-navy ${dragFrom !== null && dragFrom > pos ? "-top-1" : "-bottom-1"}`} />}
            <div
              className={`flex flex-col gap-1 rounded-bubble border-l-[3px] bg-paper py-1.5 pr-2.5 pl-1.5 ${human ? "border-navy" : "border-transparent"} ${isOpen ? "shadow-note ring-1 ring-navy/20" : "shadow-[0_3px_10px_rgba(30,28,20,0.08)] hover:ring-1 hover:ring-navy/25"} ${dragFrom === pos ? "opacity-50" : ""}`}
            >
              <div className="flex min-w-0 items-start gap-0.5">
                {canDrag ? (
                  <span
                    draggable
                    role="button"
                    tabIndex={-1}
                    aria-label={`${pos + 1}번 블록 끌어서 순서 바꾸기`}
                    title="끌어서 순서 바꾸기"
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(pos));
                      setDragFrom(pos);
                    }}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDropAt(null);
                    }}
                    className="mt-0.5 flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-muted-2 hover:text-navy active:cursor-grabbing"
                  >
                    <GripVertical size={13} aria-hidden="true" />
                  </span>
                ) : (
                  <span className="w-1 shrink-0" />
                )}
                {header}
                {isOpen && (
                  <button type="button" aria-label="메모 접기" title="접기" onClick={() => setOpen(null)} className="flex size-6 shrink-0 items-center justify-center rounded text-muted hover:bg-row-hover">
                    <ChevronUp size={13} aria-hidden="true" />
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="pl-4">
                  {view === "draft" && (
                    <p className="text-xs text-muted-2" title="높이 예산 = 구성안 블록 영역의 95%를 블록마다 나눈 값 · 초안 보기에서는 그 블록 상자를 잰 실제 높이">
                      {size}
                    </p>
                  )}
                  <BlockEditor ed={ed} pos={pos} canEdit={props.canEdit} onShowMaterial={props.onShowMaterial} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
