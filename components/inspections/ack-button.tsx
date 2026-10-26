"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acknowledgeInspection } from "../../app/(app)/my/actions";
import { T } from "../ui/kit";

/** 받은 점검 결과 「확인했습니다」(부서 담당자) */
export function AckButton({ id }: { id: number }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      {msg && (
        <span role="alert" className="text-xs text-error">
          {msg}
        </span>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await acknowledgeInspection(id);
            if (res.ok) router.refresh();
            else setMsg(res.message ?? "확인하지 못했습니다.");
          })
        }
        className={T.btnPrimary}
      >
        확인했습니다
      </button>
    </span>
  );
}
