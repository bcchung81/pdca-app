"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { buildReportOutline, setOutline } from "../../app/(app)/reports/actions";
import { T } from "../ui/kit";
import { pageSteps } from "../../lib/reports/outline.ts";

export function BuildOutlineButton({ year, refresh, label }: { year: number; refresh: boolean; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      {msg && (
        <span role="status" className="max-w-[320px] truncate text-xs text-muted-2" title={msg}>
          {msg}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await buildReportOutline(year, refresh);
            setMsg(r.message ?? null);
            router.refresh();
          })
        }
        className={refresh ? T.btn : T.btnPrimary}
      >
        {label}
      </button>
    </span>
  );
}

/** 과제 쪽 배정(0.5쪽 단위, max쪽까지 — 주요사업 3·경영관리 10)과 포함 여부 — 바꾸면 바로 저장 */
export function OutlineCell({ cardId, year, pages, included, title, max = 3 }: { cardId: string; year: number; pages: number; included: boolean; title: string; max?: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState({ pages, included });
  const [err, setErr] = useState<string | null>(null);
  const save = (patch: { pages?: number; included?: boolean }) => {
    const before = val;
    setVal((v) => ({ ...v, ...patch }));
    start(async () => {
      const r = await setOutline(cardId, year, patch);
      if (!r.ok) {
        setVal(before);
        setErr(r.message ?? "실패");
      } else {
        setErr(null);
        router.refresh();
      }
    });
  };
  return (
    <span className="flex items-center gap-3">
      <select
        value={String(val.pages)}
        disabled={pending || !val.included}
        onChange={(e) => save({ pages: Number(e.target.value) })}
        aria-label={`${title} 쪽 배정`}
        className="h-7 w-[76px] rounded-md border border-field-line bg-paper px-1.5 font-mono text-ui disabled:cursor-not-allowed disabled:bg-thead disabled:text-muted"
      >
        {pageSteps(max, val.pages).map((p) => (
          <option key={p} value={p}>
            {p}쪽
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-xs text-muted-2">
        <input type="checkbox" checked={val.included} disabled={pending} onChange={(e) => save({ included: e.target.checked })} />
        포함
      </label>
      {err && <span role="alert" className="text-xs text-error">{err}</span>}
    </span>
  );
}
