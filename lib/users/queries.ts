import "server-only";

import type { AppRole } from "../auth/dal.ts";
import { createAdminClient } from "../supabase/admin.ts";
import { createClient } from "../supabase/server.ts";
import type { TeamRef } from "./types.ts";

export interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  active: boolean;
  teamId: number | null;
  teamName: string | null;
  hq: string | null;
  /** 부서 담당자: 그 팀의 활성 과제 수(성과관리팀·관리자는 null) */
  cardCount: number | null;
  /** 부서 담당자: 담당으로 지정된 과제 수(성과관리팀·관리자는 null) */
  assignedCount: number | null;
  lastSignInAt: string | null;
}

/** 사용자 화면용 목록. 호출 전에 성과관리팀 이상 확인을 거쳐야 합니다(최근 접속은 서비스 키로 조회) */
export async function listUsers(): Promise<{ users: UserRow[]; teams: TeamRef[] }> {
  const supabase = await createClient();
  const [{ data: profiles, error }, { data: teams }, { data: cards }, { data: assigned }] = await Promise.all([
    supabase.from("profiles").select("id, email, display_name, role, active, team_id").order("created_at"),
    supabase.from("teams").select("id, name, hq").eq("active", true).order("name"),
    supabase.from("cards").select("team_id").eq("status", "active"),
    supabase.from("card_assignees").select("user_id"),
  ]);
  if (error) throw new Error(`사용자 목록: ${error.message}`);

  const perTeam = new Map<number, number>();
  for (const c of cards ?? []) if (c.team_id) perTeam.set(c.team_id, (perTeam.get(c.team_id) ?? 0) + 1);
  const perUser = new Map<string, number>();
  for (const a of assigned ?? []) perUser.set(a.user_id, (perUser.get(a.user_id) ?? 0) + 1);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  const lastSignIn = new Map<string, string | null>();
  const admin = createAdminClient();
  for (let page = 1; page <= 20; page++) {
    const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    for (const u of data?.users ?? []) lastSignIn.set(u.id, u.last_sign_in_at ?? null);
    if (!data || data.users.length < 1000) break;
  }

  const users = (profiles ?? []).map((p) => {
    const team = p.team_id ? teamById.get(p.team_id) : undefined;
    const dept = p.role === "dept_user";
    return {
      id: p.id,
      email: p.email ?? "",
      displayName: p.display_name,
      role: p.role as AppRole,
      active: p.active,
      teamId: p.team_id,
      teamName: team?.name ?? null,
      hq: team?.hq ?? null,
      cardCount: dept ? (p.team_id ? (perTeam.get(p.team_id) ?? 0) : 0) : null,
      assignedCount: dept ? (perUser.get(p.id) ?? 0) : null,
      lastSignInAt: lastSignIn.get(p.id) ?? null,
    } satisfies UserRow;
  });
  return { users, teams: teams ?? [] };
}
