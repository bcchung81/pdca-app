"use client";

import { Check, Lock, X } from "lucide-react";
import { T } from "../ui/kit";
import { useEffect, useRef, useState } from "react";
import { outlineShapeChoices } from "../../app/(app)/reports/cards/outline-actions";
import type { CompositionEdit, ShapeChoice } from "../../lib/reports/composition.ts";
import type { ShapeGroup } from "../../lib/reports/frameworks.ts";
import type { ShapeRow } from "../../lib/reports/outline-view.ts";
import { loadOutlineCatalog } from "./outline-catalog";
import { SampleHtml } from "./outline-sample";

/** 도식 무리 표시 순서·이름(lib/reports/frameworks.ts SHAPE_GROUP_LABEL과 같은 글 — 값은 가져오지 않고 그대로 적음) */
const GROUPS: Array<{ key: ShapeGroup; label: string; hint: string }> = [
  { key: "base", label: "기본 도식", hint: "내용 모양(전후·차례·나란함·시기·수치)에 맞춤" },
  { key: "own", label: "이 과제만의 요소", hint: "근거 재료(인용·사례·기관·수치)가 있어야 씀" },
  { key: "text", label: "글·띠", hint: "도식으로 안 되는 글·절 나눔" },
];
type Filter = "all" | ShapeGroup;

/** 판면 한도(넘침으로 보는 비율 — 구성안 판면 어림 칩과 같음) */
const OVER = 1.02;

/** 견본 그림 배율(종이 182mm ≈ 688px): 목록 카드 약 190px, 자세히 보기 약 260px — 가운데에 놓음 */
const ZOOM_CARD = 0.28;
const ZOOM_DETAIL = 0.36;

/**
 * 도식 목록 대화 창(구성안 블록의 모양 바꾸기·더하기): 왼쪽 목록(무리 필터 · 판면 안에 드는 것만) → 오른쪽 자세히 보기(큰 견본·쓰임·판면 변화·못 쓰는 이유)
 * → 아래 확인 줄(고른 도식 · 판면 어림 전후 · 더하기/바꾸기). 한 번 누르면 고르고, 두 번 누르거나 Enter면 바로 넣음.
 * 스크롤은 목록 한 곳만 — 창은 고정 높이·overflow hidden(예전에는 창과 목록이 둘 다 스크롤됐음).
 * 열릴 때 서버 액션(outlineShapeChoices)으로 모양마다 판면 어림 차이·근거 조건을 한 번에 받음.
 */
export function ShapePicker(props: {
  open: boolean;
  uid: string;
  edit: CompositionEdit;
  target: { pos: number; mode: "change" | "add" } | null;
  table: ShapeRow[];
  current?: string | null;
  aiCodes?: string[];
  /** AI 대안 이유(모양 코드 → 한 줄) */
  aiReasons?: Record<string, string>;
  /** 지금 구성안 판면 어림(고치는 중이면 미리보기 값) */
  fit?: { total: number; budget: number } | null;
  /** 대상 블록 이름(예: 「3번 효율·개선」) */
  context?: string;
  onPick: (row: ShapeRow, cells: number) => void;
  onClose: () => void;
}) {
  const { open, uid, edit, target, table, current, aiCodes, aiReasons, fit, context, onPick, onClose } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const [choices, setChoices] = useState<ShapeChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [samples, setSamples] = useState<{ css: string; html: Record<string, string> } | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [fitOnly, setFitOnly] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  // 열 때마다(또는 대상 블록이 바뀔 때) 이전 목록·고른 것을 비움 — 렌더 중에 정리(효과 안에서 바로 setState하지 않음)
  const targetKey = open && target ? `${target.pos}:${target.mode}` : null;
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (targetKey !== seenKey) {
    setSeenKey(targetKey);
    if (targetKey) {
      setChoices(null);
      setError(null);
      setFilter("all");
      setFitOnly(false);
      setSelected(target?.mode === "change" ? (current ?? null) : null);
    }
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open || !target) return;
    let live = true;
    outlineShapeChoices(uid, edit, target)
      .then((r) => {
        if (!live) return;
        if (r.ok) setChoices(r.choices);
        else setError(r.message);
      })
      .catch(() => live && setError("판면을 어림하지 못했습니다. 잠시 뒤 다시 열어 주세요."));
    return () => {
      live = false;
    };
    // edit는 열 때의 값을 한 번만 보내면 됨(열려 있는 동안 편집 화면이 바뀌어도 다시 부르지 않음)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target, uid]);

  useEffect(() => {
    if (!open) return;
    let live = true;
    loadOutlineCatalog()
      .then((c) => {
        if (live) setSamples({ css: c.css, html: Object.fromEntries(c.shapes.map((s) => [s.code, s.html])) });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open]);

  if (!target) return null;
  const add = target.mode === "add";
  const title = add ? "블록 더하기" : "도식 바꾸기";
  const choiceOf = (code: string) => choices?.find((c) => c.code === code) ?? null;
  const totalWith = (c: ShapeChoice | null) => (fit && c ? Math.round(fit.total + c.deltaMm) : null);
  const fits = (c: ShapeChoice | null) => !fit || !c || fit.total + c.deltaMm <= fit.budget * OVER;
  const ai = new Set(aiCodes ?? []);
  const usable = (r: ShapeRow) => Boolean(choiceOf(r.code)?.ok);
  // 목록: 무리 필터 → 판면 필터 → 무리마다 고를 수 있는 것 먼저
  const rowsOf = (g: ShapeGroup) =>
    table
      .filter((r) => r.group === g && (!fitOnly || (usable(r) && fits(choiceOf(r.code)))))
      .sort((a, b) => Number(usable(b)) - Number(usable(a)) || Number(ai.has(b.code)) - Number(ai.has(a.code)));
  const groups = GROUPS.filter((g) => filter === "all" || filter === g.key);
  const countOf = (g: ShapeGroup) => table.filter((r) => r.group === g && usable(r)).length;
  const sel = selected ? (table.find((r) => r.code === selected) ?? null) : null;
  const selChoice = sel ? choiceOf(sel.code) : null;
  const canPick = Boolean(sel && selChoice?.ok && !(!add && sel.code === current));
  const pick = (row: ShapeRow) => {
    const c = choiceOf(row.code);
    if (!c?.ok || (!add && row.code === current)) return;
    onPick(row, c.cells);
  };
  const pct = (n: number | null) => (fit && n !== null && fit.budget ? Math.round((n / fit.budget) * 100) : null);
  const now = fit ? Math.round(fit.total) : null;
  const next = totalWith(selChoice);
  const tone = (n: number | null) => (fit && n !== null && n > fit.budget * OVER ? "text-warn" : "text-ink");

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="fixed top-1/2 left-1/2 h-[min(720px,88vh)] w-[min(1040px,94vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-line bg-paper p-0 text-ink shadow-pop backdrop:bg-ink/30"
    >
      {/* 견본 그림 CSS는 창에 한 번만 */}
      {samples && <style>{samples.css}</style>}
      <div className="flex h-full min-h-0 flex-col">
        {/* 머리: 무엇을 하는지 · 지금 판면 · 닫기 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-line px-5 py-3">
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate font-serif text-base font-bold text-navy">{title}</h3>
            <p className="truncate text-xs text-muted-2">
              {context ? (add ? `${context} 뒤에 넣습니다` : `${context}의 도식을 바꿉니다`) : ""}
              {!add && current ? ` · 지금 ${table.find((r) => r.code === current)?.name ?? current}` : ""}
            </p>
          </div>
          {fit && (
            <span className={`ml-auto shrink-0 rounded-md border px-2 py-1 text-xs ${now !== null && now > fit.budget * OVER ? "border-warn text-warn" : "border-field-line text-muted"}`} title="지금 구성안 판면 어림 / 쪽 예산">
              지금 판면 {now}/{fit.budget}mm · {pct(now)}%
            </span>
          )}
          <button type="button" onClick={() => ref.current?.close()} aria-label="닫기" className={`${fit ? "" : "ml-auto"} flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-row-hover hover:text-navy`}>
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        {/* 거르기: 무리 · 판면 안 */}
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-5 py-2">
          {(["all", ...GROUPS.map((g) => g.key)] as Filter[]).map((f) => {
            const on = filter === f;
            const label = f === "all" ? "전체" : GROUPS.find((g) => g.key === f)!.label;
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => setFilter(f)} className={`h-7 rounded-full border px-3 text-xs ${on ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-muted hover:border-navy"}`}>
                {label}
                {f !== "all" && choices && <span className={`ml-1 ${on ? "text-white/80" : "text-muted-2"}`}>{countOf(f)}</span>}
              </button>
            );
          })}
          {fit && (
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={fitOnly} onChange={(e) => setFitOnly(e.target.checked)} className="size-3.5 accent-[#1b1760]" />
              판면 안에 드는 것만
            </label>
          )}
        </div>

        <div className="flex min-h-0 grow">
          {/* 목록(이 창의 유일한 스크롤) */}
          <div className="min-h-0 min-w-0 grow overflow-y-auto px-5 py-4">
            {error && <p className="text-sm text-warn">{error}</p>}
            {!error && !choices && <p className="text-sm text-muted-2">모양마다 판면을 어림하는 중…</p>}
            {!error && choices && (
              <div className="flex flex-col gap-5">
                {groups.map((g) => {
                  const rows = rowsOf(g.key);
                  if (!rows.length) return null;
                  return (
                    <section key={g.key} aria-label={g.label} className="flex flex-col gap-2">
                      <h4 className="flex items-baseline gap-2 text-xs font-semibold text-muted">
                        {g.label}
                        <span className="font-normal text-muted-2">{g.hint}</span>
                      </h4>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
                        {rows.map((row) => {
                          const c = choiceOf(row.code);
                          const ok = c?.ok ?? false;
                          const isCur = current === row.code;
                          const isSel = selected === row.code;
                          const over = ok && !fits(c);
                          return (
                            <button
                              key={row.code}
                              type="button"
                              aria-pressed={isSel}
                              aria-label={`${row.name}${c ? ` · 판면 ${c.deltaMm >= 0 ? "+" : "−"}${Math.abs(c.deltaMm)}mm` : ""}${ok ? "" : ` · 못 씀: ${c?.why ?? ""}`}`}
                              onClick={() => setSelected(row.code)}
                              onDoubleClick={() => pick(row)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (isSel) pick(row);
                                  else setSelected(row.code);
                                }
                              }}
                              className={`group flex min-w-0 flex-col overflow-hidden rounded-lg border text-left transition-colors ${isSel ? "border-navy ring-2 ring-navy/25" : "border-field-line hover:border-navy/60"} ${ok ? "bg-paper" : "bg-thead"}`}
                            >
                              <div className={`relative h-[92px] w-full overflow-hidden bg-thead px-1 ${ok ? "" : "opacity-40 grayscale"}`}>
                                {samples && <SampleHtml html={samples.html[row.code] ?? ""} zoom={ZOOM_CARD} center />}
                                <span className="absolute top-1 right-1 flex gap-1">
                                  {isCur && <span className="rounded-chip bg-navy px-1 text-xs text-white">지금</span>}
                                  {ai.has(row.code) && !isCur && <span className="rounded-chip border border-link bg-paper px-1 text-xs text-link">AI</span>}
                                </span>
                                {!ok && (
                                  <span className="absolute inset-0 flex items-center justify-center">
                                    <Lock size={16} aria-hidden="true" className="text-muted" />
                                  </span>
                                )}
                              </div>
                              <div className="flex min-w-0 items-center gap-1.5 px-2 py-1.5">
                                <span className={`min-w-0 grow truncate text-ui font-semibold ${ok ? "text-ink" : "text-muted-2"}`} title={row.name}>
                                  {row.name}
                                </span>
                                {c && ok && (
                                  <span className={`shrink-0 font-mono text-xs ${over ? "text-warn" : c.deltaMm < 0 ? "text-link" : "text-muted-2"}`} title="바꾸면 판면이 달라지는 양(칸을 채운 보통 모양 어림)">
                                    {c.deltaMm === 0 ? "±0" : `${c.deltaMm > 0 ? "+" : "−"}${Math.abs(c.deltaMm)}mm`}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
                {fitOnly && groups.every((g) => !rowsOf(g.key).length) && <p className="text-sm text-muted-2">판면 안에 드는 도식이 없습니다 — 다른 블록을 줄이거나 빼고 다시 보세요.</p>}
              </div>
            )}
          </div>

          {/* 자세히 보기(스크롤 없음) */}
          <aside aria-label="고른 도식" className="flex w-[300px] shrink-0 flex-col gap-3 border-l border-line bg-thead/40 px-4 py-4">
            {sel ? (
              <>
                <div className={`h-[170px] w-full overflow-hidden rounded-lg border border-line bg-paper ${selChoice?.ok ? "" : "opacity-50 grayscale"}`}>{samples && <SampleHtml html={samples.html[sel.code] ?? ""} zoom={ZOOM_DETAIL} center />}</div>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="flex min-w-0 items-center gap-1.5">
                    <b className="truncate text-base text-navy">{sel.name}</b>
                    <span className="shrink-0 text-xs text-muted-2">{GROUPS.find((g) => g.key === sel.group)?.label}</span>
                  </p>
                  <p className="text-ui leading-[1.5] break-keep text-ink">{sel.use}</p>
                  {aiReasons?.[sel.code] && <p className="text-xs leading-[1.5] break-keep text-link">AI: {aiReasons[sel.code]}</p>}
                </div>
                {selChoice?.ok ? (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {fit && (
                      <>
                        <dt className="text-muted">판면 어림</dt>
                        <dd className={tone(next)}>
                          {now} → <b>{next}</b>/{fit.budget}mm ({pct(next)}%){next !== null && next > fit.budget * OVER ? " — 넘침" : ""}
                        </dd>
                      </>
                    )}
                    <dt className="text-muted">{sel.unit} 수</dt>
                    <dd className="text-ink">
                      {selChoice.cells}개로 {add ? "넣음" : "바꿈"}
                      <span className="text-muted-2"> · 블록에서 {sel.min}~{sel.max} 조절</span>
                    </dd>
                    {sel.full && (
                      <>
                        <dt className="text-muted">자리</dt>
                        <dd className="text-ink">전폭(라벨 없이)</dd>
                      </>
                    )}
                  </dl>
                ) : (
                  selChoice && (
                    <p className="flex items-start gap-1.5 rounded-md border border-warn/40 bg-warn-bg px-2.5 py-2 text-xs leading-[1.5] break-keep text-warn">
                      <Lock size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
                      {selChoice.why}
                    </p>
                  )
                )}
                {!add && sel.code === current && <p className="flex items-center gap-1 text-xs text-muted"><Check size={13} aria-hidden="true" /> 지금 쓰는 도식입니다.</p>}
              </>
            ) : (
              <p className="text-ui leading-[1.6] break-keep text-muted-2">
                왼쪽에서 도식을 고르면 큰 견본과 판면 변화가 여기에 보입니다.
                <br />두 번 누르면 바로 {add ? "더합니다" : "바꿉니다"}.
              </p>
            )}
          </aside>
        </div>

        {/* 확인 줄 */}
        <footer className="flex shrink-0 items-center gap-3 border-t border-line px-5 py-3">
          <span className="min-w-0 truncate text-xs text-muted-2">{sel ? `고른 도식: ${sel.name}` : "도식을 골라 주세요"}</span>
          <div className="ml-auto flex shrink-0 gap-2">
            <button type="button" onClick={() => ref.current?.close()} className="flex h-8 items-center rounded-md border border-field-line bg-paper px-3 text-xs font-semibold text-ink hover:border-navy">
              취소
            </button>
            <button type="button" disabled={!canPick} onClick={() => sel && pick(sel)} className={`flex h-8 items-center rounded-md border border-navy bg-navy px-4 text-xs font-semibold text-white ${T.off}`}>
              {add ? "이 도식 더하기" : "이 도식으로 바꾸기"}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
