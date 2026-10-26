"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendAllDrafts } from "../../app/(app)/inspections/actions";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { T } from "../ui/kit";

/** 그 달 작성이 끝난 초안을 한 번에 부서로 보냄 */
export function SendAllButton({ period, drafts }: { period: string; drafts: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <span className="flex items-center gap-2">
      {msg && (
        <span role="status" className="max-w-[320px] truncate text-xs text-muted-2" title={msg}>
          {msg}
        </span>
      )}
      <button
        type="button"
        disabled={pending || drafts === 0}
        onClick={() => setOpen(true)}
        className={T.btnPrimary}
      >
        초안 모두 보내기 ({drafts})
      </button>
      <ConfirmDialog
        label="초안 모두 보내기 확인"
        title={`초안 ${drafts}건을 부서에 보낼까요?`}
        open={open}
        onOpenChange={setOpen}
        pending={pending}
        confirmLabel="보내기"
        onConfirm={() =>
          start(async () => {
            const res = await sendAllDrafts(period);
            setMsg(res.message);
            setOpen(false);
            router.refresh();
          })
        }
      >
        <p className="text-ui leading-6 text-muted-2">
          판단이 끝난 초안만 보내고, 덜 끝난 초안은 그대로 둡니다. 보낸 점검표는 성과관리팀도 고칠 수 없고 행마다 「보내기 취소」만 됩니다.
        </p>
      </ConfirmDialog>
    </span>
  );
}
