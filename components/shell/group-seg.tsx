"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { isFullView } from "../../lib/full-view.ts";
import { useNav } from "./nav-context";
import { activeItem, activeTab } from "./nav-items";

/**
 * 한 줄 머리 오른쪽의 화면 선택(세그먼트). 한 메뉴에 묶은 화면(과제 원장 → 원장·현행화·보관함 등)이면 그림.
 * 부서 화면 보기(?team=)는 탭을 옮겨도 고른 부서를, 월간 점검은 고른 달(?period=)을 그대로 둡니다.
 */
export function GroupSeg() {
  const nav = useNav();
  const pathname = usePathname();
  const params = useSearchParams();
  if (!nav) return null;
  const item = activeItem(pathname, nav.sections);
  if (!item?.tabs || isFullView(pathname, params.get("full"))) return null;
  const on = activeTab(pathname, item);
  const team = params.get("team");
  const period = params.get("period");
  return (
    <nav aria-label={`${item.label} 화면`} className="flex shrink-0 gap-0.5 rounded-lg border border-field-line bg-paper p-0.5">
      {item.tabs.map((t) => {
        const current = t.href === on;
        const n = nav.badges[t.href] ?? 0;
        const href =
          team && t.href.startsWith("/my")
            ? `${t.href}?team=${encodeURIComponent(team)}`
            : period && t.href.startsWith("/inspections")
              ? `${t.href}?period=${encodeURIComponent(period)}`
              : t.href;
        return (
          <Link
            key={t.href}
            href={href}
            aria-current={current ? "page" : undefined}
            title={n ? `${t.label} · 할 일 ${n}` : undefined}
            className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-md px-3.5 text-ui font-semibold whitespace-nowrap no-underline ${current ? "bg-navy text-white" : "text-muted-2 hover:text-navy"}`}
          >
            {t.label}
            {n > 0 && (
              <span className="rounded-full bg-warn px-1.5 font-mono text-xs leading-[18px] font-semibold text-white" aria-label={`할 일 ${n}`}>
                {n > 99 ? "99+" : n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
