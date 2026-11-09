"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { T } from "../ui/kit";

/** 걸러진 사람들의 메일 주소를 `; `로 이어 클립보드에 복사(메일 주소는 화면·콘솔에 찍지 않음). 휴대폰 폭에서는 숨김 */
export function CopyEmails({ emails }: { emails: string[] }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(emails.join("; "));
      setState("done");
    } catch {
      setState("error");
    }
    setTimeout(() => setState("idle"), 2500);
  };
  return (
    <span className={`flex items-center gap-2 ${T.deskOnly}`}>
      <button type="button" onClick={copy} disabled={emails.length === 0} className={T.btn}>
        <Copy size={14} aria-hidden />
        메일 주소 복사({emails.length}명)
      </button>
      <span role="status" className={`text-xs ${state === "error" ? "text-error" : "text-muted-2"}`}>
        {state === "done" ? "복사했습니다" : state === "error" ? "복사하지 못했습니다. 브라우저 권한을 확인하세요." : ""}
      </span>
    </span>
  );
}
