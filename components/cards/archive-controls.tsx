"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { T } from "../ui/kit";
import { archiveCard, purgeCard, restoreCard } from "../../app/(app)/cards/archive-actions";
import { ARCHIVE_REASON_MAX } from "../../lib/cards/limits.ts";

/** 색을 쓰는 곳이 더하는 단추 모양(경고색 등 T.btn 계열에 없는 색) */
const btn = `flex h-7 shrink-0 items-center rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap ${T.off}`;
const btn8 = `flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap ${T.off}`;

/** 보관함 한 줄: 되살리기 · 영구 삭제(관리자, 과제번호를 적어 확인) */
export function ArchiveRowActions(props: { uid: string; taskNo: string; canPurge: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState(false);
  const [typed, setTyped] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (ask)
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={props.taskNo} aria-label={`영구 삭제 확인: 과제번호 ${props.taskNo} 입력`} className="h-7 w-16 min-w-0 rounded-md border border-warn px-1.5 font-mono text-xs" />
        <button
          type="button"
          disabled={pending || typed.trim() !== props.taskNo}
          onClick={() =>
            start(async () => {
              const r = await purgeCard(props.uid, typed);
              setMsg(r.message);
              if (r.ok) router.refresh();
            })
          }
          className={`${btn} border-warn bg-warn-bg text-warn`}
        >
          영구 삭제
        </button>
        <button type="button" onClick={() => setAsk(false)} className={T.btnSm}>
          취소
        </button>
        {msg && <span role="alert" className="min-w-0 truncate text-xs text-warn">{msg}</span>}
      </span>
    );
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await restoreCard(props.uid);
            setMsg(r.ok ? null : r.message);
            router.refresh();
          })
        }
        className={`${btn} border-navy bg-paper text-navy`}
      >
        되살리기
      </button>
      {props.canPurge && (
        <button type="button" onClick={() => setAsk(true)} className={`${btn} border-field-line bg-paper text-muted-2 hover:border-warn hover:text-warn`}>
          영구 삭제…
        </button>
      )}
      {msg && <span role="alert" className="min-w-0 truncate text-xs text-warn">{msg}</span>}
    </span>
  );
}

/** 카드 작업 공간: 과제 삭제(보관) — 까닭을 적고 한 번 더 누름 */
export function ArchiveCardForm(props: { uid: string; onDone: (message: string) => void; onCancel: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-t border-warn/40 bg-warn-bg px-6 py-2 text-ui">
      <span className="shrink-0 font-semibold text-warn">과제 삭제(보관)</span>
      <span className="min-w-0 text-xs text-muted-2">목록·부서 화면·AI·점검에서 빠지고 보관함에서 되살릴 수 있습니다.</span>
      <input value={reason} maxLength={ARCHIVE_REASON_MAX} onChange={(e) => setReason(e.target.value)} placeholder="까닭(예: 과제 통합·폐지)" aria-label="삭제(보관)하는 까닭" className="h-8 w-56 min-w-0 rounded-md border border-field-line bg-paper px-2 text-xs" />
      <button
        type="button"
        disabled={pending || !reason.trim()}
        onClick={() =>
          start(async () => {
            const r = await archiveCard(props.uid, reason);
            if (!r.ok) {
              setErr(r.message);
              return;
            }
            props.onDone(r.message);
            router.push("/cards", { scroll: false });
            router.refresh();
          })
        }
        className={`${btn8} border-warn bg-paper text-warn`}
      >
        {pending ? "옮기는 중…" : "보관함으로 옮기기"}
      </button>
      <button type="button" onClick={props.onCancel} className={T.btn}>
        취소
      </button>
      {err && (
        <span role="alert" className="text-xs text-error">
          {err}
        </span>
      )}
    </div>
  );
}
