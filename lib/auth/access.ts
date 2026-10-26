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

/** 로그인 뒤 첫 화면: 부서 담당자는 내 과제, 성과관리팀·관리자는 현황 */
export function homeFor(role: AppRole): string {
  return role === "dept_user" ? "/my" : "/dashboard";
}
