"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { applyImportItems, applySafeImportItems, registerImportItem, skipImportItems } from "../../../app/(app)/cards/import/actions";
import type { BlockDiff, BlockKey } from "../../../lib/cards/hwp/sync.ts";
import { T } from "../../ui/kit";
import { CardFileUpload } from "./card-file-upload";
import { SyncReview } from "./sync-review";


/** 현행화 목록: 올리면 그 묶음의 검토 화면으로 */
export function ImportUploader() {
  const router = useRouter();
  return <CardFileUpload onParsed={(id) => router.push(`/cards/import/${id}`)} />;
}

/** 「전체 반영」: 위험 없는 확정 매칭만(지침 14 일괄 승인) */
export function ApplySafeButton(props: { importId: number; safe: number; same: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const n = props.safe + props.same;
  return (
    <div className="flex min-w-0 items-center gap-2">
      <button
        type="button"
        disabled={pending || n === 0}
        onClick={() =>
          start(async () => {
            const r = await applySafeImportItems(props.importId);
            setMsg(r.message);
            router.refresh();
          })
        }
        className={T.btnPrimary}
        title={n === 0 ? "위험 없이 반영할 과제가 없습니다" : undefined}
      >
        {pending ? "반영 중…" : `전체 반영 — 위험 없는 ${props.safe}건${props.same ? ` · 변경 없음 ${props.same}건 정리` : ""}`}
      </button>
      {msg && (
        <span role="status" className="min-w-0 truncate text-xs text-muted-2" title={msg}>
          {msg}
        </span>
      )}
    </div>
  );
}

/** 과제 하나 검토·반영(성과관리팀 원장) */
export function LedgerItemReview(props: { importId: number; itemId: number; cardId: string | null; blocks: BlockDiff[]; defaults: BlockKey[]; risks: string[]; disabled?: boolean; disabledHint?: string }) {
  const router = useRouter();
  return (
    <SyncReview
      blocks={props.blocks}
      defaults={props.defaults}
      risks={props.risks}
      submitLabel="승인한 블록 원장에 반영"
      disabled={props.disabled}
      disabledHint={props.disabledHint}
      onSubmit={async (a) => {
        const r = await applyImportItems(props.importId, [{ itemId: props.itemId, cardId: props.cardId, ...a }]);
        router.refresh();
        return { ok: r.ok, message: r.results[0]?.message ?? r.message ?? "처리하지 못했습니다." };
      }}
    >
      <SkipItem importId={props.importId} itemId={props.itemId} />
    </SyncReview>
  );
}

/** 건너뛰기(사유와 함께) */
export function SkipItem(props: { importId: number; itemId: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className={T.btn}>
        건너뛰기
      </button>
    );
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="사유(예: 부서 확인 후 다시)" className="h-8 w-48 min-w-0 rounded-md border border-field-line px-2 text-xs" aria-label="건너뛰는 사유" />
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            await skipImportItems(props.importId, [props.itemId], reason);
            router.refresh();
          })
        }
        className={T.btn}
      >
        건너뛰기 확정
      </button>
    </span>
  );
}

/** 원장에 없는 과제: 새 과제로 등록(주요사업을 모르면 골라서) */
export function RegisterItem(props: { importId: number; itemId: number; group: string | null }) {
  const router = useRouter();
  const [group, setGroup] = useState(props.group ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2 rounded-md border border-line p-3">
      <p className="text-ui text-ink">원장에 없는 과제입니다. 새 과제가 맞으면 따로 등록합니다.</p>
      <div className="flex flex-wrap items-center gap-2">
        {!props.group && (
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="h-8 rounded-md border border-field-line px-2 text-xs" aria-label="주요사업">
            <option value="">주요사업 고르기</option>
            <option value="주요사업1">주요사업1</option>
            <option value="주요사업2">주요사업2</option>
            <option value="주요사업3">주요사업3</option>
          </select>
        )}
        <button
          type="button"
          disabled={pending || !group}
          onClick={() =>
            start(async () => {
              const r = await registerImportItem(props.importId, props.itemId, group);
              setMsg({ ok: r.ok, text: r.message });
              router.refresh();
            })
          }
          className={T.btnPrimary}
        >
          {pending ? "등록 중…" : "새 과제로 등록"}
        </button>
        <SkipItem importId={props.importId} itemId={props.itemId} />
      </div>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-xs ${msg.ok ? "text-muted-2" : "text-error"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
