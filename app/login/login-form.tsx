"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";
import { T } from "../../components/ui/kit";

export function LoginForm({ next, domain }: { next: string; domain: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(sendMagicLink, { status: "idle" });

  if (state.status === "sent") {
    return (
      <div className="flex flex-col gap-2 text-sm leading-6 text-ink" role="status">
        <p>
          <strong className="break-all">{state.email}</strong>으로 로그인 메일을 보냈습니다.
        </p>
        <p className="text-ink/80">메일의 링크를 이 브라우저에서 열고, 나오는 화면에서 「로그인 계속」을 누르세요.</p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email" className="text-sm font-medium text-ink">
        기관 메일
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder={`이름@${domain}`}
        defaultValue={state.status === "error" ? state.email : undefined}
        className="h-11 min-w-0 rounded-md border border-[var(--line)] bg-paper px-3 text-sm text-ink outline-none focus:border-navy"
      />
      <button
        type="submit"
        disabled={pending}
        className={`h-11 rounded-md border border-navy bg-navy px-4 text-sm font-semibold text-white ${T.off}`}
      >
        {pending ? "보내는 중…" : "로그인 메일 받기"}
      </button>
      {state.status === "error" && (
        <p role="alert" className="text-sm text-error">
          {state.message}
        </p>
      )}
    </form>
  );
}
