// 역할 계층: 관리자 > 성과관리팀 > 부서 담당자. 윗 역할은 아랫 역할의 화면을 모두 볼 수 있습니다(데이터 범위는 RLS가 정함).

export type AppRole = "dept_user" | "pmo" | "admin";

export const ROLE_LABEL: Record<AppRole, string> = {
  dept_user: "부서 담당자",
  pmo: "성과관리팀",
  admin: "관리자",
};

export const ROLE_RANK: Record<AppRole, number> = { dept_user: 0, pmo: 1, admin: 2 };

/** role이 min 이상인가 */
export function atLeast(role: AppRole, min: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * 기관 공통 자료(공통 지식)를 읽는 구성원인가: 성과관리팀·관리자, 또는 팀이 지정된 부서 담당자(활성 여부는 requireUser가 이미 거름).
 * DB `private.is_member()`(20261110100000_member_read_guard.sql)와 같은 규칙 — 화면이 RLS의 빈 결과를 「자료 없음」으로 오해하거나 공용 캐시에 넣지 않게(2026-11-10 T3 리뷰 T4-R1)
 */
export function isKnowledgeMember(u: { role: AppRole; team: unknown }): boolean {
  return u.role !== "dept_user" || u.team != null;
}

/** 로그인 뒤 첫 화면: 부서 담당자는 내 과제, 성과관리팀·관리자는 현황 */
export function homeFor(role: AppRole): string {
  return role === "dept_user" ? "/my" : "/dashboard";
}
