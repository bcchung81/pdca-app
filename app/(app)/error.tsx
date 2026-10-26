"use client";

import Link from "next/link";
import { useEffect } from "react";

/** 로그인한 화면의 예기치 않은 오류: 다시 시도 또는 첫 화면으로 */
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex grow flex-col items-start gap-3 px-8 pt-10">
      <h1 className="font-serif text-title font-bold text-navy">화면을 불러오지 못했습니다</h1>
      <p className="max-w-[560px] text-sm leading-6 text-muted-2">
        잠시 뒤 다시 시도해 주세요. 같은 문제가 계속되면 관리자에게 알려 주세요{error.digest ? ` (오류 번호 ${error.digest})` : ""}.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={() => retry()} className="h-9 rounded-md bg-navy px-4 text-sm font-semibold text-white">
          다시 시도
        </button>
        <Link href="/" className="flex h-9 items-center rounded-md border border-field-line bg-paper px-4 text-sm font-semibold text-ink no-underline hover:border-navy">
          첫 화면
        </Link>
      </div>
    </main>
  );
}
