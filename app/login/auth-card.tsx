import type { ReactNode } from "react";
import { BrandLogo } from "../../components/shell/brand-mark";

/** 로그인 화면 틀: 책상(배경) 위 종이 한 장. C3 교정쇄 스튜디오 토큰 */
export function AuthCard({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-desk px-4 py-12">
      <section className="w-full max-w-sm min-w-0 rounded-lg border border-[var(--line)] bg-paper p-8 shadow-sm">
        <div>
          <BrandLogo size="login" />
        </div>
        <p className="mt-3 text-xs text-muted">최종_진짜최종_.hwp, 이제 그만. 매달 고쳐 한 번에 확정합니다.</p>
        <h1 className="mt-2 font-serif text-title font-bold text-navy">{title}</h1>
        {lead && <p className="mt-2 text-sm leading-6 text-muted-2">{lead}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}
