"use client";

import { useCallback, useEffect, useState } from "react";
import { type CardMaterial, deleteCardMaterial, finishCardMaterialUpload, listCardMaterials, startCardMaterialUpload } from "../../app/(app)/cards/materials-actions";
import { FileDrop } from "../ui/file-drop";
import { ATTACH_ACCEPT, ATTACH_LABEL } from "../../lib/ai/writer.ts";
import { materialNameProblem } from "../../lib/cards/limits.ts";

/** 카드 전용 자료: 이 카드의 실적 근거 파일(AI 작성지원·경평 초안에서 첨부로 골라 씀). 다른 카드·월간 점검에는 쓰이지 않습니다 */
export function MaterialsPanel({ uid, readOnly, onClose }: { uid: string; readOnly: boolean; onClose: () => void }) {
  const [state, setState] = useState<{ loading: boolean; items: CardMaterial[]; canEdit: boolean; error: string | null }>({ loading: true, items: [], canEdit: false, error: null });
  const load = useCallback(() => {
    listCardMaterials(uid).then((r) => setState({ loading: false, items: r.items, canEdit: r.canEdit, error: r.ok ? null : (r.message ?? "자료를 읽지 못했습니다.") }));
  }, [uid]);
  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-line px-4">
        <h3 className="min-w-0 truncate text-sm font-bold text-navy" title="이 카드에서만 쓰입니다 · 월간 점검에는 쓰이지 않음">
          카드 전용 자료 {state.items.length ? state.items.length : ""}
        </h3>
        <button type="button" onClick={onClose} aria-label="카드 전용 자료 닫기" className="flex size-7 shrink-0 items-center justify-center rounded-md border border-field-line text-muted hover:border-navy">
          ✕
        </button>
      </div>
      <div className="min-h-0 grow overflow-y-auto p-4">
        {state.loading ? (
          <p className="py-6 text-center text-ui text-muted">불러오는 중…</p>
        ) : state.error ? (
          <p role="alert" className="py-6 text-center text-ui text-error">
            {state.error}
          </p>
        ) : (
          <FileDrop
            bucket="card-materials"
            items={state.items}
            canEdit={state.canEdit && !readOnly}
            compact
            hint={`실적 결과보고·보도자료·공문 등(파일당 50MB) · 받는 형식: ${ATTACH_LABEL} · AI 작성지원에서 첨부로 골라 씁니다`}
            accept={ATTACH_ACCEPT}
            checkName={materialNameProblem}
            start={(name, size) => startCardMaterialUpload(uid, name, size)}
            finish={(path, name, mime, size) => finishCardMaterialUpload(uid, path, name, mime, size)}
            remove={(id) => deleteCardMaterial(id)}
            onChange={load}
          />
        )}
      </div>
    </div>
  );
}
