"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { confirmDraft, returnDraft, setFixedLock } from "../../app/(app)/cards/actions";
import type { ReviewProps } from "../../lib/cards/versions.ts";
import { fmtDateTime } from "../../lib/format.ts";
import { T } from "../ui/kit";
import type { CardEditorHandle } from "./card-editor";
import { RETURN_NOTE_MAX } from "../../lib/cards/limits.ts";

/** 성과관리팀: 제출된 작성본을 원장과 비교하고 확정·돌려보내기 */
export function ReviewBar({ review, editor, onDone }: { review: ReviewProps; editor: React.RefObject<CardEditorHandle | null>; onDone: (m: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [returning, setReturning] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return null;

  const confirm = () =>
    startTransition(async () => {
      // 원장에 저장하지 못한 변경이 있으면 확정하지 않음(확정이 그 변경을 덮지 않게)
      if (editor.current && !(await editor.current.flush())) {
        onDone("원장에 저장하지 못한 변경이 있어 확정하지 않았습니다. 화면을 새로 고친 뒤 다시 확정해 주세요.");
        return;
      }
      const res = await confirmDraft(review.versionId);
      if (res.ok && res.data) {
        editor.current?.reset(res.data, res.rev);
        setDone(true);
        onDone(`${review.periodLabel}을 확정해 원장에 반영했습니다.`);
        router.refresh();
      } else onDone(res.message ?? "확정하지 못했습니다.");
    });
  const sendBack = () =>
    startTransition(async () => {
      const res = await returnDraft(review.versionId, note);
      if (res.ok) {
        setDone(true);
        onDone("돌려보냈습니다. 부서 담당자 화면에 메모가 보입니다.");
        router.refresh();
      } else onDone(res.message ?? "돌려보내지 못했습니다.");
    });

  return (
    <div className="border-t border-line bg-info-bg">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2 text-ui">
        <span className="shrink-0 font-semibold text-navy">{review.periodLabel} 제출됨</span>
        <span className="min-w-0 truncate text-muted-2">
          {review.author} · {fmtDateTime(review.submittedAt)} · 바뀐 칸 {review.changes.length}개
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={T.btn}>
            {open ? "비교 닫기" : "비교 보기"}
          </button>
          <button type="button" disabled={pending} onClick={() => setReturning(!returning)} className={T.btn}>
            돌려보내기
          </button>
          <button type="button" disabled={pending} onClick={confirm} className={T.btnPrimary}>
            확정(원장 반영)
          </button>
        </span>
      </div>
      {review.conflicts.length > 0 && (
        <p className="px-6 pb-2 text-xs text-warn">
          작성본을 시작한 뒤 원장에서도 바뀐 구역이 있습니다: {review.conflicts.join(", ")}. 확정하면 이 구역은 작성본 내용으로 바뀝니다 — 비교를 먼저 확인하세요. 다른 구역의 원장 변경은 그대로 둡니다.
        </p>
      )}
      {returning && (
        <div className="flex min-w-0 items-start gap-2 px-6 pb-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={RETURN_NOTE_MAX} placeholder="돌려보내는 이유(부서 담당자에게 보임)" className="min-w-0 grow rounded-md border border-field-line bg-paper px-2.5 py-1.5 text-ui" />
          <button type="button" disabled={pending || !note.trim()} onClick={sendBack} className={`flex h-8 shrink-0 items-center rounded-md border px-2.5 text-xs font-semibold whitespace-nowrap no-underline border-warn bg-paper text-warn ${T.off}`}>
            보내기
          </button>
        </div>
      )}
      {open && (
        <ol className="max-h-[38vh] overflow-y-auto border-t border-line bg-paper px-6 py-3 text-ui">
          {review.changes.length === 0 && <li className="text-muted">원장과 다른 칸이 없습니다.</li>}
          {review.changes.map((c) => (
            <li key={c.path} className="grid grid-cols-[160px_1fr] gap-x-3 border-b border-row-line py-2 last:border-b-0">
              <span className="truncate text-xs font-semibold text-muted" title={c.path}>
                {c.section}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                {c.before && <span className="text-muted line-through decoration-muted/60">{c.before}</span>}
                {c.after ? <span className="text-ink">{c.after}</span> : <span className="text-xs text-warn">(삭제)</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** 성과관리팀: 이 카드의 고정 영역(주요사업 Act·Plan·계량지표, 경영관리 전년도 환류·지적 및 개선방안·계량지표) 확정·풀기 — 편집기 메타 막대 안 한 칸(머리 막대를 줄이려고 별도 줄을 두지 않음) */
export function FixedChip({ uid, lockedAt, label, onDone }: { uid: string; lockedAt: string | null; label: string; onDone: (m: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = (lock: boolean) =>
    start(async () => {
      const r = await setFixedLock([uid], lock);
      onDone(r.ok ? (lock ? `고정 영역을 확정했습니다. 부서 작성본에서는 ${label}를 고칠 수 없습니다.` : "고정 영역 확정을 풀었습니다.") : (r.message ?? "바꾸지 못했습니다."));
      router.refresh();
    });
  const tip = lockedAt
    ? `고정 영역(${label}) 확정됨 · ${fmtDateTime(lockedAt)} — 부서 작성본에서는 고칠 수 없습니다. 누르면 확정을 풉니다`
    : `고정 영역(${label}) 미확정 — 누르면 확정합니다(부서 작성본에서 잠김)`;
  // 상태와 조작을 한 단추로: 채운 단추 = 확정됨
  return (
    <button
      type="button"
      aria-pressed={Boolean(lockedAt)}
      disabled={pending}
      onClick={() => toggle(!lockedAt)}
      title={tip}
      className={lockedAt ? T.btnPrimary : T.btn}
    >
      <Lock size={12} strokeWidth={2} aria-hidden="true" />
      {lockedAt ? "고정 영역 확정됨" : "고정 영역 확정"}
    </button>
  );
}

/** 부서 작성본: 고정 영역이 잠겼다는 표시(메타 막대 안) */
export function LockedChip({ label }: { label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" title={`고정 영역(${label})은 성과관리팀이 확정해 작성본에서 고칠 수 없습니다 — 회색 칸은 골라서 AI에 보낼 수만 있습니다.`}>
      <Lock size={12} strokeWidth={2} aria-hidden="true" className="text-navy" />
      고정 영역 잠김
    </span>
  );
}
