"use client";

import { type ReactNode, useState, useTransition } from "react";
import { T } from "../../ui/kit";
import type { BlockDiff, BlockKey } from "../../../lib/cards/hwp/sync.ts";

const STATUS: Record<BlockDiff["status"], { label: string; cls: string }> = {
  same: { label: "유지", cls: "border-field-line text-muted-2" },
  changed: { label: "변경", cls: "border-navy text-navy" },
  added: { label: "추가", cls: "border-link text-link" },
  removed: { label: "⚠️삭제 예정", cls: "border-warn bg-warn-bg text-warn" },
  unknown: { label: "비교 불가", cls: "border-warn text-warn" },
};

/**
 * 현행화 블록별 비교와 승인(지침 14 [3·4단계]). 기본 선택 = 위험 없는 [변경]·[추가].
 * 위험 블록(고정영역·부서·대상사업)과 지우기(파일에 없는 것)는 직접 골라야 반영됩니다.
 */
export function SyncReview(props: {
  blocks: BlockDiff[];
  defaults: BlockKey[];
  risks: string[];
  submitLabel: string;
  disabled?: boolean;
  disabledHint?: string;
  onSubmit: (approval: { blocks: BlockKey[]; removals: BlockKey[] }) => Promise<{ ok: boolean; message: string }>;
  children?: ReactNode;
}) {
  const [blocks, setBlocks] = useState<Set<BlockKey>>(new Set(props.defaults));
  const [removals, setRemovals] = useState<Set<BlockKey>>(new Set());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const changed = props.blocks.filter((b) => b.status !== "same");
  const same = props.blocks.filter((b) => b.status === "same" && !b.note);
  const toggle = (set: Set<BlockKey>, k: BlockKey, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(k);
    else next.delete(k);
    return next;
  };
  const count = changed.filter((b) => !b.locked && ((b.status !== "removed" && blocks.has(b.key)) || removals.has(b.key))).length;

  return (
    <div className="flex flex-col gap-3">
      {props.risks.length > 0 && (
        <div role="note" className="rounded-md border border-warn/50 bg-warn-bg px-3 py-2 text-ui leading-6 text-warn">
          <p className="font-semibold">건별 승인이 필요합니다</p>
          <ul className="list-disc pl-5">
            {props.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}
      {changed.length === 0 && <p className="rounded-md border border-line bg-field px-3 py-3 text-ui text-muted-2">파일과 원장이 같습니다 — 반영할 변경이 없습니다.</p>}
      {changed.map((b) => {
        const isRemoved = b.status === "removed";
        const checked = isRemoved ? removals.has(b.key) : blocks.has(b.key);
        return (
          <section key={b.key} aria-label={b.label} className={`flex min-w-0 flex-col rounded-md border ${b.risk ? "border-warn/50" : "border-line"}`}>
            <label className={`flex min-w-0 items-center gap-2 border-b border-line px-3 py-2 ${b.locked ? "opacity-70" : "cursor-pointer"}`}>
              <input
                type="checkbox"
                disabled={b.locked || props.disabled}
                checked={checked && !b.locked}
                onChange={(e) => (isRemoved ? setRemovals(toggle(removals, b.key, e.target.checked)) : setBlocks(toggle(blocks, b.key, e.target.checked)))}
                aria-label={`${b.label} ${isRemoved ? "지우기" : "반영"}`}
              />
              <span className="min-w-0 truncate text-ui font-semibold text-navy">{b.label}</span>
              <span className={`inline-flex h-5 shrink-0 items-center rounded-chip border px-[5px] text-xs ${STATUS[b.status].cls}`}>{STATUS[b.status].label}</span>
              {b.risk && <span className="inline-flex h-5 min-w-0 items-center truncate rounded-chip border border-warn px-[5px] text-xs text-warn" title={b.risk}>{b.risk}</span>}
              {b.locked && <span className="inline-flex h-5 shrink-0 items-center rounded-chip border border-field-line px-[5px] text-xs text-muted-2">잠김</span>}
            </label>
            {b.note && <p className="border-b border-line bg-field px-3 py-1.5 text-xs text-muted-2">{b.note}</p>}
            {!isRemoved && b.missing.length > 0 && !b.locked && (
              <label className="flex items-center gap-2 border-b border-line px-3 py-1.5 text-xs text-warn">
                <input type="checkbox" disabled={props.disabled} checked={removals.has(b.key)} onChange={(e) => setRemovals(toggle(removals, b.key, e.target.checked))} />
                파일에 없는 {b.missing.length}건({b.missing.join(", ").slice(0, 60)})도 지우기
              </label>
            )}
            {b.lines.length > 0 && (
              <div className="max-h-64 overflow-auto px-1 py-1 font-mono text-xs leading-5">
                {b.lines.map((l, i) => (
                  <div
                    key={i}
                    className={`flex min-w-0 gap-2 rounded-[2px] px-2 ${l.op === "add" ? "bg-info-bg text-ink" : l.op === "del" ? "bg-warn-bg text-muted-2 line-through decoration-warn/60" : "text-muted"}`}
                  >
                    <span className={`w-3 shrink-0 select-none ${l.op === "add" ? "text-link" : l.op === "del" ? "text-warn" : ""}`}>{l.op === "add" ? "+" : l.op === "del" ? "−" : ""}</span>
                    <span className="min-w-0 break-words whitespace-pre-wrap">{l.text}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        );
      })}
      {same.length > 0 && <p className="text-xs leading-5 text-muted">그대로(유지): {same.map((b) => b.label).join(" · ")}</p>}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-line bg-paper pt-3 pb-1">
        <button
          type="button"
          disabled={pending || props.disabled || count === 0}
          title={props.disabled ? props.disabledHint : count === 0 ? "반영할 블록을 골라 주세요" : undefined}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await props.onSubmit({ blocks: [...blocks], removals: [...removals] });
              setMsg({ ok: r.ok, text: r.message });
            })
          }
          className={`flex h-9 items-center rounded-md border border-navy bg-navy px-4 text-sm font-semibold text-white ${T.off}`}
        >
          {pending ? "반영 중…" : `${props.submitLabel}${count ? ` (${count}개 블록)` : ""}`}
        </button>
        {props.children}
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`min-w-0 text-xs ${msg.ok ? "text-muted-2" : "text-error"}`}>
            {msg.text}
          </p>
        )}
      </div>
    </div>
  );
}
