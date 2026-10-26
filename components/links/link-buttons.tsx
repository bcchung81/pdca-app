"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { T } from "../ui/kit";
import { type LinkKey, bulkConfirm, setLinkStatus, setTaskMapStatus } from "../../app/(app)/links/actions";

const btn = `h-7 rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap ${T.off}`;

/** 연결 한 건: 확정 / 제외 / 되돌리기 */
export function LinkButtons({ linkKey, status }: { linkKey: LinkKey; status: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (s: "confirmed" | "rejected" | "candidate") =>
    start(async () => {
      const res = await setLinkStatus(linkKey, s);
      if (res.ok) router.refresh();
      else setErr(res.message ?? "실패");
    });
  const done = status === "confirmed" || status === "rejected";
  return (
    <span className="flex items-center gap-1.5">
      {err && <span role="alert" className="text-xs text-error">{err}</span>}
      {done ? (
        <button type="button" disabled={pending} onClick={() => run("candidate")} className={T.btnSm}>
          되돌리기
        </button>
      ) : (
        <>
          <button type="button" disabled={pending} onClick={() => run("rejected")} className={`${btn} border-field-line bg-paper text-ink hover:border-warn`}>
            제외
          </button>
          <button type="button" disabled={pending} onClick={() => run("confirmed")} className={T.btnPrimarySm}>
            확정
          </button>
        </>
      )}
    </span>
  );
}

/** 과제 대응 확정 / 되돌리기 + 메모 */
export function TaskMapForm({ cardId, status, note }: { cardId: string; status: string; note: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [memo, setMemo] = useState(note ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const run = (s: "confirmed" | "draft") =>
    start(async () => {
      const res = await setTaskMapStatus(cardId, s, memo);
      setMsg(res.ok ? (s === "confirmed" ? "확정했습니다." : "초안으로 되돌렸습니다.") : (res.message ?? "실패"));
      if (res.ok) router.refresh();
    });
  return (
    <div className="flex flex-col gap-2">
      <textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} placeholder="메모(부서 협의 결과 등)" className="rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-ui" />
      <div className="flex items-center gap-2">
        {msg && (
          <span role="status" className="text-xs text-muted-2">
            {msg}
          </span>
        )}
        <span className="ml-auto flex gap-1.5">
          {status === "confirmed" ? (
            <button type="button" disabled={pending} onClick={() => run("draft")} className={T.btnSm}>
              확정 풀기
            </button>
          ) : null}
          <button type="button" disabled={pending} onClick={() => run("confirmed")} className={T.btnPrimarySm}>
            {status === "confirmed" ? "메모 저장" : "대응 확정"}
          </button>
        </span>
      </div>
    </div>
  );
}

/** 확신도 높은 초안 일괄 확정(두 번 눌러 확인) */
export function BulkConfirm({ kind, count, label }: { kind: "findings" | "tasks"; count: number; label: string }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!count && !msg) return null;
  return (
    <span className="flex items-center gap-2">
      {msg && (
        <span role="status" className="text-xs text-muted-2">
          {msg}
        </span>
      )}
      {count > 0 &&
        (ask ? (
          <>
            <span className="text-xs text-warn">{count}건을 확정할까요?</span>
            <button type="button" onClick={() => setAsk(false)} className={T.btnSm}>
              취소
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await bulkConfirm(kind);
                  setMsg(r.message);
                  setAsk(false);
                  router.refresh();
                })
              }
              className={T.btnPrimarySm}
            >
              확정
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setAsk(true)} className={`${btn} border-navy bg-paper text-navy`}>
            {label} ({count})
          </button>
        ))}
    </span>
  );
}
