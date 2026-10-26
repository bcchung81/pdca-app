"use client";

import { useLinkStatus } from "next/link";

/** Link 안에 두면, 누른 뒤 새 화면이 올 때까지 작은 점이 깜박입니다(이동 중 무반응처럼 보이지 않게) */
export function PendingDot({ className = "" }: { className?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full bg-[var(--accent)] transition-opacity ${pending ? "animate-pulse opacity-100" : "opacity-0"} ${className}`} />;
}
