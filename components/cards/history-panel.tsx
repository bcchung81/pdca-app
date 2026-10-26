"use client";

import { useEffect, useState } from "react";
import { type HistoryEntry, getCardHistory } from "../../app/(app)/cards/actions";
import { fmtDateTime } from "../../lib/format.ts";

/** 카드 수정 이력: 원장 변경·작성본 확정을 최근 순으로, 칸별 전후 비교 */
export function HistoryPanel({ uid, onClose, version }: { uid: string; onClose: () => void; version: number }) {
  const [state, setState] = useState<{ loading: boolean; items: HistoryEntry[]; error: string | null }>({ loading: true, items: [], error: null });
  useEffect(() => {
    let alive = true;
    getCardHistory(uid).then((r) => {
      if (alive) setState({ loading: false, items: r.items ?? [], error: r.ok ? null : (r.message ?? "이력을 읽지 못했습니다.") });
    });
    return () => {
      alive = false;
    };
  }, [uid, version]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h3 className="text-sm font-bold text-navy">수정 이력</h3>
        <button type="button" onClick={onClose} aria-label="수정 이력 닫기" className="flex size-7 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
          ✕
        </button>
      </div>
      <div className="min-h-0 grow overflow-y-auto">
        {state.loading && <p className="px-4 py-6 text-center text-ui text-muted">불러오는 중…</p>}
        {state.error && (
          <p role="alert" className="px-4 py-6 text-center text-ui text-error">
            {state.error}
          </p>
        )}
        {!state.loading && !state.error && state.items.length === 0 && <p className="px-4 py-8 text-center text-ui leading-6 text-muted">아직 수정 이력이 없습니다.</p>}
        <ol className="flex flex-col">
          {state.items.map((h) => (
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
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
