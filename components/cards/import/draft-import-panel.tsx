"use client";

import { useState } from "react";
import { applyImportToDraft, getDraftImportPlan, skipImportItems } from "../../../app/(app)/cards/import/actions";
import type { SyncPlan } from "../../../lib/cards/hwp/sync.ts";
import { CardFileUpload } from "./card-file-upload";
import { SyncReview } from "./sync-review";

type Item = { itemId: number; title: string | null; taskNo: string | null; match: string; reason: string | null; plan: SyncPlan };

/**
 * 부서 담당자: 한글 파일(HWP·HWPX)로 이달 작성본 채우기. 원장이 아니라 작성본에만 들어가고, 제출 → 성과관리팀 확정은 그대로입니다.
 * 파일에 없다는 이유로 지우지 않고(지우기는 따로 고름), 확정된 고정 영역은 바꾸지 않습니다.
 */
export function DraftImportPanel(props: {
  uid: string;
  /** 반영 전에 편집기의 남은 변경을 저장 */
  flush: () => Promise<boolean>;
  onApplied: (r: { data: Record<string, unknown>; rev: number; versionId: number; imageUrls: Record<string, string>; message: string }) => void;
  onClose: () => void;
}) {
  const [importId, setImportId] = useState<number | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async (id: number) => {
    setImportId(id);
    setErr(null);
    setDone(null);
    const r = await getDraftImportPlan(id);
    if (!r.ok) {
      setErr(r.message ?? "파일을 비교하지 못했습니다.");
      setItems(null);
      return;
    }
    setItems(r.items);
  };
  const item = items?.[0];

  return (
    <section aria-label="한글 파일로 작성본 채우기" className="flex h-full min-h-0 flex-col bg-paper">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-line px-5">
        <h3 className="min-w-0 truncate font-serif text-base font-bold text-navy" title="한글에서 고친 이 과제 카드를 올리면 바뀐 블록만 골라 작성본에 넣습니다">
          한글 파일로 작성본 채우기
        </h3>
        <button type="button" onClick={props.onClose} aria-label="닫기" className="flex size-8 shrink-0 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
          ✕
        </button>
      </div>
      <div className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-5 py-4">
        {!item && <CardFileUpload cardUid={props.uid} multiple={false} compact onParsed={(id) => void load(id)} />}
        {err && (
          <p role="alert" className="rounded-md border border-error-line bg-error-bg px-3 py-2 text-sm text-error-strong">
            {err}
          </p>
        )}
        {done && (
          <p role="status" className="rounded-md border border-line bg-info-bg px-3 py-2 text-ui text-ink">
            {done}
          </p>
        )}
        {item && importId !== null && (
          <>
            <div className="flex min-w-0 flex-col gap-1 rounded-md border border-line bg-field px-3 py-2 text-ui">
              <span className="truncate font-semibold text-navy" title={item.title ?? ""}>
                {item.taskNo} {item.title}
              </span>
              {item.match !== "exact" && item.reason && <span className="text-xs text-warn">{item.reason}</span>}
            </div>
            <SyncReview
              key={item.itemId}
              blocks={item.plan.blocks}
              defaults={item.plan.defaults}
              risks={item.plan.risks.filter((r) => !r.startsWith("과제 매칭"))}
              submitLabel="작성본에 반영"
              onSubmit={async (a) => {
                if (!(await props.flush())) return { ok: false, message: "편집 중인 내용을 먼저 저장하지 못했습니다. 다시 시도해 주세요." };
                const r = await applyImportToDraft(importId, { itemId: item.itemId, ...a });
                if (r.ok && r.data) {
                  props.onApplied({ data: r.data, rev: r.rev ?? 0, versionId: r.versionId!, imageUrls: r.imageUrls ?? {}, message: r.message });
                  setItems(null);
                  setDone(r.message);
                }
                return { ok: r.ok, message: r.message };
              }}
            >
              <button
                type="button"
                onClick={async () => {
                  await skipImportItems(importId, [item.itemId], "부서가 반영하지 않음");
                  setItems(null);
                  setDone("반영하지 않았습니다. 다른 파일을 올릴 수 있습니다.");
                }}
                className="flex h-9 items-center rounded-md border border-field-line bg-paper px-3 text-xs font-semibold text-ink hover:border-navy"
              >
                반영하지 않기
              </button>
            </SyncReview>
          </>
        )}
      </div>
    </section>
  );
}
