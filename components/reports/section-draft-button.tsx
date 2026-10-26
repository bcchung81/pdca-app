"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { setReportSectionBp } from "../../app/(app)/reports/cards/actions";
import { T } from "../ui/kit";

/** BP(우수사례) 표시 켜고 끄기 — BP는 사람이 고름 */
export function BpToggle({ uid, on }: { uid: string; on: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        const r = await setReportSectionBp(uid, !on);
        setBusy(false);
        if (r.ok) router.refresh();
      }}
      title="BP(우수사례) 과제로 표시 — 실행과제 띠에 BP 딱지"
      className={on ? T.btnPrimary : T.btn}
    >
      BP {on ? "표시 중" : "표시"}
    </button>
  );
}
