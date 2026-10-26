import { type AppRole, atLeast } from "../../lib/auth/access.ts";

export type NavIcon = "home" | "ledger" | "sync" | "inspect" | "link" | "report" | "book" | "mytasks" | "inbox" | "draft" | "library" | "users" | "usage";

/** 메뉴 접힘 상태 쿠키 */
export const NAV_COOKIE = "pdca_nav";
/** 메뉴 접힘 모드: 쿠키가 없으면 auto(폭 1280px 미만이면 접힘) */
export type NavMode = "open" | "collapsed" | "auto";

export interface NavTab {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
  /** 한 메뉴에 묶은 화면들(화면 위 탭). 첫 탭이 메뉴 주소 */
  tabs?: NavTab[];
  /** 탭은 아니지만 이 메뉴에서 들어가는 화면(그 주소에 있을 때 이 메뉴를 켬) */
  also?: string[];
}

export interface NavSection {
  id: "pmo" | "dept" | "admin";
  title: string;
  items: NavItem[];
}

// 메뉴는 할 일 단위로 묶고, 같은 일의 화면은 메뉴 안 탭으로(주소는 그대로)
const PMO: NavItem[] = [
  { href: "/dashboard", label: "현황", icon: "home" },
  {
    href: "/cards",
    label: "과제 원장",
    icon: "ledger",
    tabs: [
      { href: "/cards", label: "원장" },
      { href: "/cards/import", label: "현행화" },
      { href: "/cards/archive", label: "보관함" },
    ],
  },
  {
    href: "/inspections",
    label: "월간 점검",
    icon: "inspect",
    tabs: [
      { href: "/inspections", label: "점검" },
      { href: "/inspections/summary", label: "취합 보고" },
    ],
  },
  {
    href: "/reports",
    label: "경평 초안",
    icon: "report",
    tabs: [
      { href: "/reports", label: "보고서 현황" },
      { href: "/reports/cards", label: "과제별 초안" },
      { href: "/reports/outline", label: "목차·쪽 배정" },
      { href: "/reports/business", label: "사업 조판" },
    ],
  },
  {
    href: "/knowledge",
    label: "공통 지식",
    icon: "book",
    tabs: [
      { href: "/knowledge", label: "검색" },
      { href: "/links", label: "지적·과제 연결" },
    ],
  },
  {
    href: "/users",
    label: "사용자",
    icon: "users",
    tabs: [
      { href: "/users", label: "사용자·담당 과제" },
      { href: "/users/import", label: "일괄 등록" },
    ],
  },
];
const DEPT_TABS: NavTab[] = [
  { href: "/my", label: "과제" },
  { href: "/my/inspections", label: "점검 결과" },
];
const DEPT: NavItem[] = [
  { href: "/my", label: "내 과제", icon: "mytasks", tabs: DEPT_TABS },
  // 과제별 초안(/reports/cards/<uid>)·보고서 검토(/reports/<id>)는 「경평 초안」에서 들어감
  { href: "/my/report", label: "경평 초안", icon: "draft", also: ["/reports"] },
  { href: "/knowledge", label: "공통 지식", icon: "book" },
];
/** 성과관리팀·관리자: 부서를 골라 담당자에게 보이는 그대로(읽기 전용) */
const DEPT_VIEW: NavItem[] = [{ href: "/my", label: "부서 화면 보기", icon: "mytasks", tabs: [...DEPT_TABS, { href: "/my/report", label: "경평 초안" }] }];
const ADMIN: NavItem[] = [
  {
    href: "/admin/usage",
    label: "관리",
    icon: "usage",
    tabs: [
      { href: "/admin/usage", label: "AI 사용량" },
      { href: "/admin/library", label: "공통 자료·틀" },
    ],
  },
];

/**
 * 역할별 메뉴. 윗 역할은 아랫 역할의 화면을 모두 봅니다(관리자 > 성과관리팀 > 부서 담당자).
 * 성과관리팀·관리자에게 부서 담당자 메뉴는 「부서 화면 보기」 — 부서를 골라 담당자에게 보이는 그대로 확인합니다.
 */
export function navSectionsFor(role: AppRole): NavSection[] {
  if (role === "dept_user") return [{ id: "dept", title: "내 업무", items: DEPT }];
  const sections: NavSection[] = [
    { id: "pmo", title: "성과관리팀", items: PMO },
    { id: "dept", title: "부서 화면", items: DEPT_VIEW },
  ];
  if (atLeast(role, "admin")) sections.push({ id: "admin", title: "관리자", items: ADMIN });
  return sections;
}

const covers = (pathname: string, href: string) => pathname === href || pathname.startsWith(`${href}/`);

/** 지금 주소에 맞는 메뉴(메뉴·탭 주소 중 가장 길게 겹치는 것) */
export function activeItem(pathname: string, sections: NavSection[]): NavItem | null {
  let best: NavItem | null = null;
  let len = -1;
  for (const s of sections)
    for (const i of s.items)
      for (const h of [i.href, ...(i.tabs ?? []).map((t) => t.href), ...(i.also ?? [])])
        if (covers(pathname, h) && h.length > len) {
          best = i;
          len = h.length;
        }
  return best;
}

export function activeHref(pathname: string, sections: NavSection[]): string | null {
  return activeItem(pathname, sections)?.href ?? null;
}

/** 메뉴 안에서 지금 탭 */
export function activeTab(pathname: string, item: NavItem): string | null {
  let best: string | null = null;
  for (const t of item.tabs ?? []) if (covers(pathname, t.href) && (!best || t.href.length > best.length)) best = t.href;
  return best;
}

/** 메뉴 할 일 수: 메뉴와 그 탭 주소들의 합 */
export function itemBadge(item: NavItem, badges: Record<string, number>): number {
  return [...new Set([item.href, ...(item.tabs ?? []).map((t) => t.href)])].reduce((n, h) => n + (badges[h] ?? 0), 0);
}
