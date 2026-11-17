import type { Metadata } from "next";
import { safeNext } from "../../../lib/auth/redirect.ts";
import { AuthCard } from "../../login/auth-card";
import { ClearTabStore } from "../../login/clear-tab-store";
import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "로그인 확인 · 경평AI비서" };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ConfirmPage({ searchParams }: PageProps<"/auth/confirm">) {
  const sp = await searchParams;
  return (
    <AuthCard title="로그인 확인" lead="아래 버튼을 누르면 로그인됩니다.">
      {/* 로그인 화면을 거치지 않고 메일 링크로 바로 온 탭도 앞사람의 카드 AI 대화·검토 메모를 지움(2026-11-17) */}
      <ClearTabStore />
      <ConfirmForm tokenHash={one(sp.token_hash)} type={one(sp.type)} code={one(sp.code)} next={safeNext(one(sp.next))} />
    </AuthCard>
  );
}
