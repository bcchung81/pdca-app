"use client";

import { type ReactNode, createContext, useContext } from "react";
import type { NavSection } from "./nav-items";

interface NavValue {
  sections: NavSection[];
  badges: Record<string, number>;
}

const NavContext = createContext<NavValue | null>(null);

/** 앱 틀(layout)이 역할별 메뉴·할 일 배지를 내려 줌 — 화면 머리의 화면 선택(GroupSeg)이 읽음 */
export function NavProvider({ sections, badges, children }: NavValue & { children: ReactNode }) {
  return <NavContext.Provider value={{ sections, badges }}>{children}</NavContext.Provider>;
}

export function useNav(): NavValue | null {
  return useContext(NavContext);
}
