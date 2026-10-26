"use client";

import { ArrowDown, ArrowUp, ChevronDown, Copy, Ellipsis, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { OutlineCatalog } from "../../lib/reports/outline-view.ts";
import { FULL_KINDS, LAYOUT_LABEL, LAYOUT_USE, SPAN_LABEL, canHalf, layoutGroups } from "../../lib/reports/layout.ts";
import { DropMenu } from "../ui/drop-menu";
import { T } from "../ui/kit";
import { loadOutlineCatalog } from "./outline-catalog";
import { type OutlineEdit, partName, rowOf } from "./outline-panel";
import { SampleHtml } from "./outline-sample";

/** 견본 그림(도식 목록과 같은 것) — 한 번 불러 모든 블록 편집 칸이 같이 씀 */
function useSamples() {
  const [cat, setCat] = useState<OutlineCatalog | null>(null);
  useEffect(() => {
    let live = true;
    loadOutlineCatalog()
      .then((c) => live && setCat(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return cat;
}

/**
 * 구성안 블록 하나의 편집 칸(여백 메모 펼침·좁은 창 목록이 함께 씀 — 2026-09-28 시연 전 단순화: 기호 칩을 걷고 「도식 → 목적 → 재료」만 먼저 보임).
 * 도식: 작은 견본 그림 + 이름(누르면 도식 목록) + AI 대안 이름 칩. 목적: 글칸. 재료: 번호 대신 재료 글 체크 목록(고른 것 위, 나머지는 「재료 더 넣기」).
 * 라벨·칸 수·블록 메모·그림은 「세부」 안에, 위로·아래로·복제·빼기는 「⋯」 메뉴에. 근거 없는 이 과제만의 요소는 도식 목록·서버가 막음.
 * 사람이 쓴 글은 집필에 주는 지시일 뿐 근거가 아님(숫자·원문 대조는 그대로).
 */
export function BlockEditor(props: { ed: OutlineEdit; pos: number; canEdit: boolean; onShowMaterial: (id: string) => void }) {
  const { ed, pos } = props;
  const data = ed.data!;
  const { table, labels, figures: figureNames } = data.names;
  const listId = useId();
  const samples = useSamples();
  const [more, setMore] = useState(false);
  const [detail, setDetail] = useState(false);
  const item = ed.items[pos];
  if (!item) return null;
  const b = item.block;
  const row = rowOf(table, b.kind, b.variant);
  const orig = b.from !== null ? data.outline.blocks[b.from] : null;
  const busy = Boolean(ed.busy);
  const can = props.canEdit && !busy;
  const materials = data.outline.materials;
  const count = ed.items.length;
  const picked = materials.filter((m) => b.materials.includes(m.id));
  // 가로 반씩 짝이 있는지(렌더러와 같은 묶음 — 경영관리는 절을 넘지 않음)
  const paired = layoutGroups(ed.items.map((x) => x.block), ed.items.map((x) => x.block.at ?? "")).some((g) => g.units.some((u) => u.length === 2 && u.includes(pos)));
  const rest = materials.filter((m) => !b.materials.includes(m.id));

  // AI 추천(처음 모양) + 대안 중 지금 모양이 아닌 것
  const alts = [...(orig?.ai ? [{ kind: orig.ai.kind, variant: orig.ai.variant, why: "처음 구성안에서 고른 도식" }] : []), ...(orig?.alts ?? [])]
    .filter((x, i, all) => all.findIndex((y) => y.kind === x.kind && y.variant === x.variant) === i)
    .filter((x) => !(x.kind === b.kind && (x.variant ?? "") === (b.variant ?? "")));
  const sec = "text-xs font-semibold text-muted-2";
  const field = "w-full min-w-0 rounded-md border border-field-line bg-paper px-2 text-ui text-ink disabled:bg-thead";
  const menuItem = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink hover:bg-row-hover disabled:cursor-not-allowed disabled:text-muted";

  const matRow = (m: (typeof materials)[number], on: boolean) => (
    <label key={m.id} className={`flex min-w-0 cursor-pointer items-start gap-1.5 rounded px-1 py-0.5 hover:bg-row-hover ${!can ? "cursor-default" : ""}`} title={`${m.text}${m.when ? ` (${m.when})` : ""}${m.source ? ` · ${data.text.sources[m.id] || m.source}` : ""}${m.kind === "need" ? " — 자료 필요" : m.found ? "" : " — 원문 못 찾음(집필에서 안 씀)"}`}>
      <input type="checkbox" checked={on} disabled={!can} onChange={() => ed.toggleMaterial(pos, m.id)} className="mt-[3px] size-3.5 shrink-0 accent-[#1b1760]" />
      <span className={`line-clamp-2 min-w-0 text-xs leading-[1.45] break-keep ${m.kind === "need" ? "text-warn" : !m.found ? "text-muted-2 line-through decoration-muted-2/50" : on ? "text-ink" : "text-muted"}`}>
        {m.kind === "need" && <span className="font-semibold">자료 필요 · </span>}
        {m.text}
      </span>
    </label>
  );

  return (
    <div className="mt-1 flex min-w-0 flex-col gap-2.5">
      {/* 도식: 견본 그림 + 이름(누르면 도식 목록) */}
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className={sec}>도식</span>
        <button
          type="button"
          disabled={!can}
          onClick={() => ed.setPicker({ pos, mode: "change" })}
          title={props.canEdit ? "누르면 도식 목록(견본·판면 변화)" : row?.use}
          className="group flex min-w-0 items-center gap-2 rounded-lg border border-field-line bg-paper p-1.5 text-left hover:border-navy disabled:cursor-default disabled:hover:border-field-line"
        >
          <span className="h-11 w-16 shrink-0 overflow-hidden rounded bg-thead">{samples && <SampleHtml html={samples.shapes.find((x) => x.code === row?.code)?.html ?? ""} zoom={0.1} center />}</span>
          <span className="flex min-w-0 grow flex-col">
            <span className="truncate text-ui font-semibold text-navy">{row?.name ?? b.kind}</span>
            <span className="truncate text-xs text-muted-2">{row?.use}</span>
          </span>
          {props.canEdit && <span className="shrink-0 text-xs font-semibold text-link group-hover:underline">바꾸기</span>}
        </button>
        {alts.length > 0 && props.canEdit && (
          <div className="flex min-w-0 flex-wrap items-center gap-1">
            <span className="text-xs text-muted-2">AI 대안</span>
            {alts.map((a) => {
              const r = rowOf(table, a.kind, a.variant);
              if (!r) return null;
              return (
                <button key={`${a.kind}:${a.variant}`} type="button" disabled={!can} onClick={() => ed.setShape(pos, r)} title={a.why || r.use} className={`h-6 max-w-full truncate rounded-full border border-field-line bg-paper px-2 text-xs text-ink hover:border-navy ${T.off}`}>
                  {r.name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 배치(2026-10-12): 라벨 사다리 · 전폭 · 단 띠 + 다음 블록과 가로 반씩 — 판면 미리보기·어림이 바로 다시 셈 */}
      <div className="flex min-w-0 flex-col gap-1">
        <span className={sec}>배치</span>
        <div role="radiogroup" aria-label="배치" className="flex min-w-0 flex-wrap items-center gap-1">
          {(["", "full", "stage"] as const).map((v) => {
            const on = (b.layout ?? "") === v;
            // 전폭 종류(띠·인용·우수사례 등)는 늘 전폭이라 「전폭」을 따로 고르지 않음
            const off = v === "full" && FULL_KINDS.has(b.kind);
            return (
              <button key={v || "ladder"} type="button" role="radio" aria-checked={on} disabled={!can || off} onClick={() => ed.setBlock(pos, { layout: v || undefined })} title={LAYOUT_USE[v]} className={`h-6 rounded-full border px-2 text-xs ${T.off} ${on ? "border-navy bg-navy text-white" : "border-field-line bg-paper text-ink hover:border-navy"}`}>
                {LAYOUT_LABEL[v]}
              </button>
            );
          })}
          <label title={LAYOUT_USE.half} className={`ml-1 flex items-center gap-1 text-xs ${canHalf(b.kind) ? "text-ink" : "text-muted-2"}`}>
            <input type="checkbox" checked={b.span === "half"} disabled={!can || !canHalf(b.kind)} onChange={(e) => ed.setBlock(pos, { span: e.target.checked ? "half" : undefined })} className="size-3.5 accent-[#1b1760]" />
            {SPAN_LABEL.half}
          </label>
        </div>
        {b.span === "half" && !paired && <p className="text-xs leading-[1.45] break-keep text-warn">바로 앞이나 뒤 블록도 「가로 반씩」이고 라벨·배치가 같아야 나란히 놓입니다 — 짝이 없으면 저장할 때 지웁니다.</p>}
        {b.layout === "stage" && !b.label && <p className="text-xs leading-[1.45] break-keep text-warn">단 띠는 라벨이 띠 제목입니다 — 세부에서 라벨을 적어 주세요(없으면 전폭).</p>}
      </div>

      {/* 경영관리: 이 블록이 놓일 절(바꾸면 저장 때 절 순서로 다시 섬) */}
      {ed.mg && (
        <label className="flex min-w-0 flex-col gap-1">
          <span className={sec}>절</span>
          <select value={b.at ?? ""} disabled={!can} onChange={(e) => ed.setBlock(pos, { at: e.target.value })} className={`${field} h-7`}>
            {ed.parts.map((p) => {
              const m = data.outline.mg?.parts.find((x) => x.key === p.key);
              return m ? (
                <option key={p.key} value={p.key}>
                  {partName(m, p.title)}
                </option>
              ) : null;
            })}
          </select>
        </label>
      )}

      {/* 목적 */}
      <label className="flex min-w-0 flex-col gap-1">
        <span className={sec}>목적</span>
        <textarea value={b.purpose} maxLength={120} rows={2} disabled={!can} onChange={(e) => ed.setBlock(pos, { purpose: e.target.value })} placeholder="이 블록이 보여 줄 것 한 줄" className={`${field} py-1 leading-[1.5]`} />
      </label>

      {/* 재료: 글 체크 목록 */}
      {materials.length > 0 && (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className={sec}>재료 {picked.length ? `${picked.length}개` : "— 없음"}</span>
          {picked.map((m) => matRow(m, true))}
          {props.canEdit && rest.length > 0 && (
            <>
              <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more} className="flex w-fit items-center gap-1 px-1 py-0.5 text-xs font-semibold text-link hover:underline">
                <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${more ? "rotate-180" : ""}`} />
                재료 더 넣기 {rest.length}
              </button>
              {more && <div className="flex max-h-44 min-w-0 flex-col gap-0.5 overflow-y-auto rounded-md border border-line bg-thead/50 p-1">{rest.map((m) => matRow(m, false))}</div>}
            </>
          )}
        </div>
      )}

      {/* 세부(라벨·칸 수·블록 메모·그림) */}
      <div className="flex min-w-0 flex-col gap-2">
        <button type="button" onClick={() => setDetail((v) => !v)} aria-expanded={detail} className="flex w-fit items-center gap-1 text-xs font-semibold text-muted hover:text-navy">
          <ChevronDown size={12} aria-hidden="true" className={`transition-transform ${detail ? "rotate-180" : ""}`} />
          세부 <span className="font-normal text-muted-2">{[b.label || "전폭", row ? `${row.unit} ${b.cells}` : "", b.memo ? "메모" : "", b.figures.length ? `그림 ${b.figures.length}` : ""].filter(Boolean).join(" · ")}</span>
        </button>
        {detail && (
          <div className="flex min-w-0 flex-col gap-2 rounded-md border border-line p-2">
            <div className="flex min-w-0 items-end gap-2">
              <label className="flex min-w-0 grow flex-col gap-1">
                <span className={sec}>라벨{row?.full && b.layout !== "stage" ? " (전폭 블록은 안 씀)" : b.layout === "stage" ? " (단 띠 제목)" : ""}</span>
                <input list={listId} value={b.label} maxLength={24} disabled={!can || (row?.full && b.layout !== "stage")} onChange={(e) => ed.setBlock(pos, { label: e.target.value })} placeholder="비우면 전폭" className={`${field} h-7`} />
                <datalist id={listId}>
                  {labels.map((l) => (
                    <option key={l} value={l} />
                  ))}
                </datalist>
              </label>
              {row && row.min !== row.max && (
                <div className="flex shrink-0 flex-col gap-1">
                  <span className={sec}>{row.unit} 수</span>
                  <span className="flex h-7 items-center overflow-hidden rounded-md border border-field-line bg-paper">
                    <button type="button" aria-label={`${row.unit} 하나 줄이기`} disabled={!can || b.cells <= row.min} onClick={() => ed.setBlock(pos, { cells: b.cells - 1 })} className="h-full w-7 text-muted hover:bg-row-hover disabled:cursor-not-allowed disabled:text-line">
                      −
                    </button>
                    <span className="w-6 text-center font-mono text-xs text-ink">{b.cells}</span>
                    <button type="button" aria-label={`${row.unit} 하나 늘리기`} disabled={!can || b.cells >= row.max} onClick={() => ed.setBlock(pos, { cells: b.cells + 1 })} className="h-full w-7 text-muted hover:bg-row-hover disabled:cursor-not-allowed disabled:text-line">
                      +
                    </button>
                  </span>
                </div>
              )}
            </div>
            <label className="flex min-w-0 flex-col gap-1">
              <span className={sec}>블록 메모(집필에 전달)</span>
              <input value={b.memo} maxLength={200} disabled={!can} onChange={(e) => ed.setBlock(pos, { memo: e.target.value })} placeholder="예: 기관 이름은 정식 명칭으로" className={`${field} h-7`} />
            </label>
            {b.figures.length > 0 && orig && (
              <div className="flex min-w-0 flex-col gap-1">
                <span className={sec}>그림 자리</span>
                {b.figures.map((f, k) => (
                  <div key={f.index} className="flex min-w-0 items-center gap-1">
                    <select aria-label="그림 종류" disabled={!can} value={f.kind} onChange={(e) => ed.setFigureKind(pos, k, e.target.value)} className="h-6 shrink-0 rounded border border-field-line bg-paper px-1 text-xs">
                      {figureNames.map((x) => (
                        <option key={x.kind} value={x.kind}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                    <span className="min-w-0 truncate text-xs text-muted" title={orig.figures[f.index]?.desc}>
                      {orig.figures[f.index]?.desc}
                    </span>
                    {props.canEdit && (
                      <button type="button" aria-label="그림 자리 빼기" disabled={!can} onClick={() => ed.dropFigure(pos, k)} className="ml-auto shrink-0 text-muted hover:text-error">
                        <X size={12} aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {b.kind === "chart" && <p className="text-xs text-muted-2">앞 블록과 같은 라벨이면 그 행 오른쪽에 붙음</p>}
          </div>
        )}
      </div>

      {/* 블록 더하기 · ⋯(순서·복제·빼기) */}
      {props.canEdit && (
        <div className="flex items-center gap-1 border-t border-line pt-2">
          <button type="button" onClick={() => ed.setPicker({ pos, mode: "add" })} disabled={!can || count >= ed.maxBlocks} className="flex h-7 items-center gap-1 rounded-md px-2 text-xs font-semibold text-link hover:bg-row-hover disabled:cursor-not-allowed disabled:text-muted" title={`이 블록 뒤에 더하기(${ed.maxBlocks}개까지)`}>
            <Plus size={13} aria-hidden="true" /> 블록 더하기
          </button>
          <span className="ml-auto">
            {/* 목록은 화면 맨 위 층(스크롤 영역 끝에서 잘리지 않게 — components/ui/drop-menu.tsx) */}
            <DropMenu label={<Ellipsis size={15} aria-hidden="true" />} ariaLabel={`${pos + 1}번 블록 더보기`} title="순서·복제·빼기" width={144} disabled={!can} buttonClass="flex size-7 items-center justify-center rounded-md text-muted hover:bg-row-hover hover:text-navy disabled:cursor-not-allowed disabled:text-line">
              {(close) => {
                const act = (fn: () => void) => () => {
                  fn();
                  close();
                };
                return (
                  <>
                    <button type="button" role="menuitem" disabled={pos === 0} onClick={act(() => ed.move(pos, -1))} className={menuItem}>
                      <ArrowUp size={13} aria-hidden="true" /> 위로
                    </button>
                    <button type="button" role="menuitem" disabled={pos === count - 1} onClick={act(() => ed.move(pos, 1))} className={menuItem}>
                      <ArrowDown size={13} aria-hidden="true" /> 아래로
                    </button>
                    <button type="button" role="menuitem" disabled={count >= ed.maxBlocks} onClick={act(() => ed.duplicate(pos))} className={menuItem}>
                      <Copy size={13} aria-hidden="true" /> 복제
                    </button>
                    <button type="button" role="menuitem" disabled={count <= 1} onClick={act(() => ed.remove(pos))} className={`${menuItem} text-error`}>
                      <Trash2 size={13} aria-hidden="true" /> 빼기
                    </button>
                  </>
                );
              }}
            </DropMenu>
          </span>
        </div>
      )}
    </div>
  );
}
