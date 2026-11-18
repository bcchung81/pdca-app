"use client";

import { useEffect, useState, useTransition } from "react";
import { type HistoryEntry, type RevertMark, type RevertResult, getCardHistory, revertCard } from "../../app/(app)/cards/actions";
import type { RevertBlock, RevertSide } from "../../lib/cards/revert.ts";
import { fmtDateTime } from "../../lib/format.ts";
import { useAsk } from "../ui/confirm-dialog";
import { T } from "../ui/kit";

/** 원장 되돌리기(성과관리팀 원장 편집에서만 — 부서 작성본·부서 화면 보기·읽기 전용에는 안 넘김) */
export interface HistoryRevert {
  /** 편집기에 남은 변경을 먼저 저장(못 하면 되돌리지 않음) */
  flush: () => Promise<boolean>;
  /** 되돌린 뒤: 편집기를 새 내용·개정 번호로, 화면 새로 고침 */
  onDone: (r: Extract<RevertResult, { ok: true }>) => void;
}

/** 흐린 단추 옆 짧은 까닭(전체 문장은 title) — same(지금과 같음)은 단추를 안 그림 */
const SHORT: Record<RevertBlock, string> = {
  same: "지금과 같음",
  sync: "현행화 앞 시점",
  empty: "등록 전 내용 없음",
  retired: "보관한 과제",
  identity: "식별 값이 다름",
  invalid: "원장에 쓸 수 없음",
};

/** 카드 수정 이력: 원장 변경·작성본 확정을 최근 순으로, 칸별 전후 비교. revert가 있으면 행마다 「이 시점으로」(가장 오래된 행은 「이 수정 전으로」도) */
export function HistoryPanel({ uid, onClose, version, revert }: { uid: string; onClose: () => void; version: number; revert?: HistoryRevert }) {
  const [state, setState] = useState<{ loading: boolean; items: HistoryEntry[]; rev: number | null; error: string | null }>({ loading: true, items: [], rev: null, error: null });
  const [reload, setReload] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const { ask, dialog } = useAsk();
  useEffect(() => {
    let alive = true;
    getCardHistory(uid).then((r) => {
      if (alive) setState({ loading: false, items: r.items ?? [], rev: r.rev ?? null, error: r.ok ? null : (r.message ?? "이력을 읽지 못했습니다.") });
    });
    return () => {
      alive = false;
    };
  }, [uid, version, reload]);

  const go = (h: HistoryEntry, side: RevertSide) => {
    if (!revert || state.rev === null) return;
    const rev = state.rev;
    ask(
      [
        {
          title: side === "after" ? "이 시점으로 되돌릴까요?" : "이 수정 전으로 되돌릴까요?",
          body: [`${fmtDateTime(h.at)} · ${h.who} · ${h.summary}`, "이 시점의 카드 내용으로 되돌립니다. 원본 배치·팀·단계는 그대로입니다.", "되돌린 일도 수정 이력에 남아 다시 되돌릴 수 있습니다."],
          confirmLabel: "되돌리기",
        },
      ],
      () =>
        startTransition(async () => {
          setNote(null);
          if (!(await revert.flush())) {
            setNote({ ok: false, text: "고친 내용을 저장하지 못해 되돌리지 않았습니다." });
            return;
          }
          const r = await revertCard(uid, h.id, side, rev);
          setNote({ ok: r.ok, text: r.message });
          if (r.ok) revert.onDone(r);
          else setReload((n) => n + 1);
        }),
    );
  };

  const button = (h: HistoryEntry, side: RevertSide, mark: RevertMark | undefined) => {
    if (!mark || (!mark.ok && mark.code === "same")) return null;
    const label = side === "after" ? "이 시점으로" : "이 수정 전으로";
    return (
      <span key={side} className="flex min-w-0 items-center gap-1.5">
        <button type="button" className={T.btnSm} disabled={!mark.ok || pending} title={mark.ok ? undefined : mark.reason} onClick={() => go(h, side)}>
          {label}
        </button>
        {!mark.ok && <span className="truncate text-xs text-muted">{SHORT[mark.code]}</span>}
      </span>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h3 className="text-sm font-bold text-navy">수정 이력</h3>
        <button type="button" onClick={onClose} aria-label="수정 이력 닫기" className="flex size-7 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
          ✕
        </button>
      </div>
      {revert && (pending || note) && (
        <p role={note && !note.ok ? "alert" : "status"} className={`shrink-0 border-b border-row-line px-4 py-2 text-xs leading-5 ${note && !note.ok ? "text-error" : "text-muted"}`}>
          {pending ? "되돌리는 중…" : note?.text}
        </p>
      )}
      <div className="min-h-0 grow overflow-y-auto">
        {state.loading && <p className="px-4 py-6 text-center text-ui text-muted">불러오는 중…</p>}
        {state.error && (
          <p role="alert" className="px-4 py-6 text-center text-ui text-error">
            {state.error}
          </p>
        )}
        {!state.loading && !state.error && state.items.length === 0 && <p className="px-4 py-8 text-center text-ui leading-6 text-muted">아직 수정 이력이 없습니다.</p>}
        <ol className="flex flex-col">
          {state.items.map((h) => {
            const actions = revert ? [button(h, "after", h.revertAfter), button(h, "before", h.revertBefore)].filter(Boolean) : [];
            return (
              <li key={h.id} className="border-b border-row-line px-4 py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-muted">{fmtDateTime(h.at)}</span>
                      <span className="truncate font-semibold text-navy">{h.who}</span>
                      <span className="ml-auto shrink-0 text-muted-2">칸 {h.changes.length + h.more}개</span>
                    </span>
                    <span className="truncate text-ui text-ink">{h.summary}</span>
                  </summary>
                  <ol className="mt-2 flex flex-col gap-2">
                    {h.changes.map((c) => (
                      <li key={c.path} className="flex flex-col gap-0.5 rounded-md bg-field px-2.5 py-1.5 text-xs leading-5">
                        <span className="font-semibold text-muted">{c.section}</span>
                        {c.before && <span className="text-muted line-through decoration-muted/60">{c.before}</span>}
                        {c.after ? <span className="text-ink">{c.after}</span> : <span className="text-warn">(삭제)</span>}
                      </li>
                    ))}
                    {h.more > 0 && <li className="text-xs text-muted">그 밖에 {h.more}칸</li>}
                  </ol>
                </details>
                {actions.length > 0 && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">{actions}</div>}
              </li>
            );
          })}
        </ol>
      </div>
      {revert && dialog}
    </div>
  );
}
