"use client";

import { BookOpen, ChevronLeft, ClipboardCheck, FileInput, FilePen, FileText, Gauge, Inbox, LayoutDashboard, Library, Link2, ListChecks, Table2, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { isFullView } from "../../lib/full-view.ts";
import { PendingDot } from "../ui/pending-dot";
import { NAV_COOKIE, type NavIcon, type NavMode, type NavSection, activeHref, itemBadge } from "./nav-items";

const SHAPES: Record<NavMode, { width: string; open: string; shut: string; headAlign: string; rowAlign: string; turn: string }> = {
  open: { width: "w-[232px]", open: "", shut: "hidden", headAlign: "justify-between", rowAlign: "px-3", turn: "" },
  collapsed: { width: "w-[68px]", open: "hidden", shut: "", headAlign: "justify-center", rowAlign: "justify-center px-0", turn: "rotate-180" },
  auto: { width: "w-[68px] xl:w-[232px]", open: "max-xl:hidden", shut: "xl:hidden", headAlign: "justify-between max-xl:justify-center", rowAlign: "px-3 max-xl:justify-center max-xl:px-0", turn: "max-xl:rotate-180" },
};

const ICONS: Record<NavIcon, typeof Gauge> = {
  home: LayoutDashboard,
  ledger: Table2,
  sync: FileInput,
  inspect: ClipboardCheck,
  link: Link2,
  report: FileText,
  book: BookOpen,
  mytasks: ListChecks,
  inbox: Inbox,
  draft: FilePen,
  library: Library,
  users: Users,
  usage: Gauge,
};

/** 화면 폭이 Tailwind `xl`(80rem) 이상인지 — 화면 읽기 프로그램용 값에만 씀(모양은 CSS). 서버 스냅숏은 펼침 */
const WIDE_QUERY = "(min-width: 80rem)";
const subscribeWide = (onChange: () => void) => {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};
const wideNow = () => window.matchMedia(WIDE_QUERY).matches;
const wideOnServer = () => true;

/**
 * 접는 왼쪽 메뉴(역할별 묶음). 쿠키에 사용자가 고른 open·collapsed가 있으면 그대로 따르고, 없으면(auto) 폭 1280px 미만에서 접힙니다.
 * 서버는 화면 폭을 모르므로 auto의 모양은 CSS 반응형 클래스(max-xl:·xl:)로만 가려 첫 렌더부터 깜빡이지 않게 합니다
 */
export function SideNav({ roleLabel, sections, initialMode, badges = {} }: { roleLabel: string; sections: NavSection[]; initialMode: NavMode; badges?: Record<string, number> }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const [mode, setMode] = useState<NavMode>(initialMode);
  const wide = useSyncExternalStore(subscribeWide, wideNow, wideOnServer);
  // 지금 펼쳐 보이는가(auto는 실제 폭) — aria·title용
  const expanded = mode === "auto" ? wide : mode === "open";
  const toggle = () => {
    const next: NavMode = expanded ? "collapsed" : "open";
    setMode(next);
    document.cookie = `${NAV_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  // 모양: 모드별로 「펼친 때만/접힌 때만」 보이는 요소의 숨김 클래스와 접힘 때 달라지는 줄 정렬·회전
  const shape = SHAPES[mode];
  const label = expanded ? "메뉴 접기" : "메뉴 펼치기";
  const active = activeHref(pathname, sections);
  // 전체 보기(카드 전체 페이지·과제별 초안 ?full=1)는 메뉴 없이 머리띠 아래 전부를 작성 영역으로
  if (isFullView(pathname, params.get("full"))) return null;

  return (
    <nav
      aria-label="주 메뉴"
      className={`flex shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-line-strong bg-nav px-3 py-4 ${shape.width}`}
    >
      <div className={`mb-1.5 flex items-center gap-2 border-b border-line-strong pb-3 ${shape.headAlign}`}>
        <span className={`truncate pl-1 text-xs font-semibold tracking-[0.12em] text-muted ${shape.open}`}>{roleLabel}</span>
        <button
          type="button"
          onClick={toggle}
          aria-label={label}
          title={label}
          aria-expanded={expanded}
          className="flex size-10 shrink-0 items-center justify-center rounded-md border border-field-line bg-desk text-navy"
        >
          <ChevronLeft size={17} strokeWidth={1.8} aria-hidden="true" className={shape.turn} />
        </button>
      </div>
      {sections.map((s, si) => (
        <div key={s.id} role="group" aria-label={s.title} className={`flex flex-col gap-0.5 ${si > 0 ? "mt-3 border-t border-line-strong pt-3" : ""}`}>
          {sections.length > 1 && <span className={`px-3 pb-1 text-xs font-semibold tracking-[0.08em] text-muted ${shape.open}`}>{s.title}</span>}
          {s.items.map((item) => {
            const current = item.href === active;
            const Icon = ICONS[item.icon];
            const badge = itemBadge(item, badges);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={current ? "page" : undefined}
                aria-label={`${expanded ? "" : `${s.title} · `}${item.label}${badge ? ` (할 일 ${badge})` : ""}`}
                title={badge ? `${item.label} · 할 일 ${badge}` : item.label}
                className={`flex h-10 items-center gap-3 rounded-md text-sm no-underline ${shape.rowAlign} ${
                  current ? "bg-paper font-bold text-navy" : "font-medium text-muted-2 hover:bg-paper/60"
                }`}
              >
                <span className="relative shrink-0">
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  {badge > 0 && <span className={`absolute -top-1 -right-1.5 size-2 rounded-full bg-warn ${shape.shut}`} aria-hidden="true" />}
                </span>
                <span className={`truncate ${shape.open}`}>{item.label}</span>
                <PendingDot className={`${badge > 0 ? "" : "ml-auto"} ${shape.open}`} />
                {badge > 0 && (
                  <span className={`ml-auto shrink-0 ${shape.open} rounded-full bg-warn px-1.5 font-mono text-xs leading-[18px] font-semibold text-white`} aria-hidden="true">
                    {badge > 99 ? "99+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
