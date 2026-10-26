import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "../supabase/server.ts";
import { type AppRole, atLeast } from "./access.ts";

export { type AppRole, ROLE_LABEL } from "./access.ts";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  active: boolean;
  team: { id: number; name: string; hq: string | null } | null;
}

/** 로그인 사용자와 프로필. 한 번의 렌더 안에서는 한 번만 조회합니다 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, email, display_name, role, active, team:teams(id, name, hq)")
    .eq("id", sub)
    .maybeSingle();
  if (!profile) return null;
  const team = Array.isArray(profile.team) ? profile.team[0] : profile.team;
  return {
    id: profile.id,
    email: profile.email ?? String(data?.claims?.email ?? ""),
    displayName: profile.display_name,
    role: profile.role as AppRole,
    active: profile.active,
    team: team ? { id: team.id, name: team.name, hq: team.hq } : null,
  };
});

/**
 * 로그인하지 않았으면 로그인 화면으로, 사용 중지된 계정이면 안내가 붙은 로그인 화면으로.
 * (DB는 중지된 계정의 역할을 비워 데이터를 이미 막고 있고, 여기서는 화면·서버 액션이 그 사람의 옛 역할대로 열리지 않게 함)
 */
export async function requireUser(next = "/"): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`);
  if (!user.active) redirect("/login?blocked=1");
  return user;
}

/** 역할이 맞지 않으면 null(화면이 안내를 보여 줌). 서버 액션에서는 결과가 null이면 바로 거절합니다 */
export async function requireRole(roles: AppRole[], next = "/"): Promise<CurrentUser | null> {
  const user = await requireUser(next);
  return roles.includes(user.role) ? user : null;
}

/** 역할 계층(관리자 > 성과관리팀 > 부서 담당자)으로 min 이상이면 사용자, 아니면 null(화면이 안내를 보여 줌) */
export async function requireAtLeast(min: AppRole, next = "/"): Promise<CurrentUser | null> {
  const user = await requireUser(next);
  return atLeast(user.role, min) ? user : null;
}
