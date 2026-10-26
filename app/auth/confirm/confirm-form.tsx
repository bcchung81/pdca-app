"use client";

import Link from "next/link";
import { useActionState } from "react";
import { confirmLogin, type ConfirmState } from "./actions";
import { T } from "../../../components/ui/kit";

export function ConfirmForm(props: { tokenHash: string; type: string; code: string; next: string }) {
  const [state, action, pending] = useActionState<ConfirmState, FormData>(confirmLogin, { status: "idle" });
  const usable = Boolean((props.tokenHash && props.type) || props.code);

  if (!usable) {
    return (
      <p className="text-sm text-ink/80">
        링크에 로그인 정보가 없습니다.{" "}
        <Link className="text-link underline" href="/login">
          로그인 메일을 다시 받기
        </Link>
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="token_hash" value={props.tokenHash} />
      <input type="hidden" name="type" value={props.type} />
      <input type="hidden" name="code" value={props.code} />
      <input type="hidden" name="next" value={props.next} />
      <button
        type="submit"
        disabled={pending}
        className={`h-11 rounded-md border border-navy bg-navy px-4 text-sm font-semibold text-white ${T.off}`}
      >
        {pending ? "확인 중…" : "로그인 계속"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-error">
          {state.message}{" "}
          <Link className="text-link underline" href="/login">
            다시 받기
          </Link>
        </p>
      )}
    </form>
  );
}
