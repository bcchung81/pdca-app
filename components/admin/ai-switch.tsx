"use client";

import { useState, useTransition } from "react";
import { setAiPaused } from "../../app/(app)/admin/ai-switch-actions";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { T, Tag } from "../ui/kit";

export interface AiSwitchState {
  on: boolean;
  reason: string | null;
  /** 바꾼 때(표시용 글 — 서버가 만들어 넘김) */
  updatedText: string | null;
  updatedBy: string | null;
  /** 상태를 읽지 못함(마이그레이션 전 등) — 단추를 숨김 */
  unreadable?: boolean;
}

/**
 * AI 일시 중지 스위치(마이그레이션 20261118140000). 관리자는 「AI 멈추기 / 다시 켜기」 + 사유, 앱 안 확인 창(ConfirmDialog)에서 한 번 더 묻고 바꿈.
 * 성과관리팀(canEdit = false)은 상태만 봄. 상태는 서버 부품(ai-switch-panel.tsx)이 읽어 넘김
 */
export function AiSwitch({ state, canEdit }: { state: AiSwitchState; canEdit: boolean }) {
  const [on, setOn] = useState(state.on);
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const next = !on;

  const run = () =>
    start(async () => {
      const r = await setAiPaused(next, reason);
      setOpen(false);
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setOn(r.on);
        setReason("");
      }
    });

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {state.unreadable ? (
        <Tag tone="muted">AI 스위치 · 상태 모름</Tag>
      ) : on ? (
        <Tag tone="warnSolid" title={[state.reason && `사유: ${state.reason}`, state.updatedText && `${state.updatedText}${state.updatedBy ? ` · ${state.updatedBy}` : ""}`].filter(Boolean).join(" · ") || undefined}>
          AI 멈춤
        </Tag>
      ) : (
        <Tag tone="muted">AI 켜짐</Tag>
      )}
      {canEdit && !state.unreadable && (
        <button type="button" onClick={() => (setMsg(null), setOpen(true))} disabled={pending} className={`${T.btnSm} ${T.deskOnly}`}>
          {on ? "AI 다시 켜기" : "AI 멈추기"}
        </button>
      )}
      {msg && (
        <span role="status" className={`min-w-0 text-xs ${msg.ok ? "text-muted-2" : "text-warn"}`}>
          {msg.text}
        </span>
      )}
      {canEdit && (
        <ConfirmDialog
          label={next ? "AI 멈추기 확인" : "AI 다시 켜기 확인"}
          title={next ? "AI 기능을 멈출까요?" : "AI 기능을 다시 켤까요?"}
          open={open}
          onOpenChange={setOpen}
          confirmLabel={next ? "멈추기" : "다시 켜기"}
          pending={pending}
          onConfirm={run}
        >
          {next ? (
            <>
              <p className="text-ui leading-6 text-ink">모든 사용자의 새 AI 요청(작성지원·점검 초안·경평 초안·그림 설명·과제 매칭)이 「관리자가 AI 기능을 잠시 멈췄습니다」로 거절됩니다. 이미 돌고 있는 요청은 끝까지 갑니다.</p>
              <label className={T.label}>
                사유(선택 — 200자까지, 관리 기록에 남음)
                <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className={T.field} placeholder="예: 비용 점검" />
              </label>
            </>
          ) : (
            <p className="text-ui leading-6 text-ink">새 AI 요청을 다시 받습니다. 대기 중인 과제 매칭 작업은 다음 처리 때 이어서 돕니다.</p>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
