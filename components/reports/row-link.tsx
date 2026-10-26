"use client";

import { useRouter } from "next/navigation";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";

/**
 * 표 행 전체를 눌러 이동(「열기」 링크는 그대로 두고 키보드 접근성을 지킴).
 * 안의 링크·단추·입력을 누르면(또는 텍스트 선택 중이면) 행 이동은 하지 않음.
 */
export function ClickableRow({ href, className = "", children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  const fromInner = (e: MouseEvent | KeyboardEvent) => (e.target as HTMLElement).closest("a, button, input, textarea, select, label");

  return (
    <tr
      className={`cursor-pointer ${className}`}
      tabIndex={0}
      onClick={(e) => {
        if (fromInner(e) || window.getSelection()?.toString()) return;
        router.push(href);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || fromInner(e)) return;
        router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
