"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { T } from "./kit";

// 단추 클래스 — 확인 창(ConfirmDialog)과 그것을 쓰는 화면이 같은 모양을 쓰도록 여기서 내보냄(kit 단추와 같은 문자열)
export const primary = T.btnPrimary;
export const plain = T.btn;

/** 단추 옆에 뜨는 확인 창(네이티브 dialog — 배경 누르면 닫힘, Esc는 기본 동작) */
export function ConfirmDialog(props: { label: string; title: string; open: boolean; onOpenChange: (v: boolean) => void; children: ReactNode; confirmLabel: string; confirmDisabled?: boolean; pending: boolean; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (props.open && !el.open) el.showModal();
    if (!props.open && el.open) el.close();
  }, [props.open]);
  return (
    <dialog
      ref={ref}
      aria-label={props.label}
      onClose={() => props.onOpenChange(false)}
      onClick={(e) => e.target === ref.current && ref.current?.close()}
      className="fixed top-1/2 left-1/2 w-[440px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-paper p-0 text-ink shadow-2xl backdrop:bg-navy/20"
    >
      <div className="flex flex-col gap-3 p-5">
        <h3 className="font-serif text-base font-bold text-navy">{props.title}</h3>
        {props.children}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => ref.current?.close()} className={plain}>
            취소
          </button>
          <button type="button" disabled={props.confirmDisabled || props.pending} onClick={props.onConfirm} className={primary}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** 확인 창 한 단계 — 제목(질문 한 문장)·본문(문단별)·확인 단추 이름 */
export interface AskStep {
  title: string;
  body: string[];
  confirmLabel: string;
}

/**
 * 확인 창(ConfirmDialog) 한 개를 쓰는 훅 — window.confirm처럼 「확인 필요하면 묻고, 아니면 바로 실행」.
 * ask(steps, run): steps가 비면 바로 run, 있으면 차례로 묻고 마지막 확인에서 run(묻는 동안 상태가 바뀌어도 run은 ask를 부른 때 값을 씀).
 * dialog는 이 훅을 쓰는 부품이 한 번 그려야 함
 */
export function useAsk(): { ask: (steps: AskStep[], run: () => void) => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState<{ steps: AskStep[]; i: number; run: () => void } | null>(null);
  const ask = (steps: AskStep[], run: () => void) => {
    if (!steps.length) {
      run();
      return;
    }
    setQ({ steps, i: 0, run });
    setOpen(true);
  };
  const step = q?.steps[q.i];
  const dialog = (
    <ConfirmDialog
      label={step?.title ?? "확인"}
      title={step?.title ?? ""}
      open={open}
      onOpenChange={setOpen}
      confirmLabel={step?.confirmLabel ?? "확인"}
      pending={false}
      onConfirm={() => {
        if (!q) return;
        if (q.i < q.steps.length - 1) {
          setQ({ ...q, i: q.i + 1 });
          return;
        }
        setOpen(false);
        q.run();
      }}
    >
      {step?.body.map((t, i) => (
        <p key={i} className="text-ui leading-6 text-ink">
          {t}
        </p>
      ))}
    </ConfirmDialog>
  );
  return { ask, dialog };
}
