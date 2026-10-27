import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "../../lib/auth/dal.ts";
import { allowedEmailDomains, safeNext } from "../../lib/auth/redirect.ts";
import { signOut } from "./actions";
import { AuthCard } from "./auth-card";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "로그인 · 경영AI비서" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const sp = await searchParams;
  const next = safeNext(Array.isArray(sp.next) ? sp.next[0] : sp.next);
  const user = await getCurrentUser();
  if (user?.active) redirect(next);
  // 사용 중지된 계정: 세션이 남아 있어도 화면·데이터는 막혀 있으므로 안내하고 로그아웃만 받음
  if (user) {
    return (
      <AuthCard title="사용이 중지된 계정" lead="이 계정은 사용이 중지되어 쓸 수 없습니다. 다시 쓰려면 성과관리팀에 문의해 주세요.">
        <form action={signOut}>
          <button type="submit" className="h-11 w-full rounded-md border border-[var(--line)] bg-paper px-4 text-sm font-semibold text-navy">
            로그아웃
          </button>
        </form>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="로그인" lead="기관 메일로 로그인 링크를 보내 드립니다. 비밀번호는 없습니다.">
      <LoginForm next={next} domain={allowedEmailDomains()[0] ?? "kca.kr"} />
    </AuthCard>
  );
}
