import type { Metadata } from "next";
import { safeNext } from "../../../lib/auth/redirect.ts";
import { AuthCard } from "../../login/auth-card";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "로그인 확인 · 경영AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const sp = await searchParams;
  return (
    <AuthCard title="로그인 확인" lead="아래 버튼을 누르면 로그인됩니다.">
      <ConfirmForm tokenHash={one(sp.token_hash)} type={one(sp.type)} code={one(sp.code)} next={safeNext(one(sp.next))} />
    </AuthCard>
  );
}
