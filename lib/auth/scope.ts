import "server-only";

import { createClient } from "../supabase/server.ts";
import type { CurrentUser } from "./dal.ts";
import { getTrack } from "../tracks/current.ts";

export interface TeamWithCards {
  id: number;
  name: string;
  hq: string | null;
  cards: number;
}

export interface DeptScope {
  /** 보고 있는 부서(없으면 아직 고르지 않음·부서 미지정) */
  team: { id: number; name: string; hq: string | null } | null;
  /** 성과관리팀·관리자가 부서 화면을 보는 중(읽기 전용) */
  preview: boolean;
  /** 부서 고르기 목록(성과관리팀·관리자만) */
  teams: TeamWithCards[];
}

/**
 * 부서 담당자 화면의 범위. 담당자는 자기 부서, 성과관리팀·관리자는 ?team=으로 고른 부서를 담당자에게 보이는 그대로 봅니다.
 * 데이터 권한은 RLS가 판정하고, 여기서는 보여 줄 부서만 정합니다.
 */
export async function deptScope(user: CurrentUser, sp: Record<string, string | string[] | undefined>): Promise<DeptScope> {
  if (user.role === "dept_user") return { team: user.team, preview: false, teams: [] };
  const supabase = await createClient();
  const track = await getTrack();
  const [{ data: teams }, { data: cards }] = await Promise.all([
    supabase.from("teams").select("id, name, hq").eq("active", true).order("name"),
    supabase.from("cards").select("team_id, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", track), // 부서 화면 보기는 머리띠에서 고른 트랙의 과제로 부서를 고름
  ]);
  const per = new Map<number, number>();
  for (const c of cards ?? []) if (c.team_id) per.set(c.team_id, (per.get(c.team_id) ?? 0) + 1);
  const list = (teams ?? []).map((t) => ({ ...t, cards: per.get(t.id) ?? 0 })).filter((t) => t.cards > 0);
  const raw = Array.isArray(sp.team) ? sp.team[0] : sp.team;
  const picked = list.find((t) => String(t.id) === raw) ?? null;
  return { team: picked ? { id: picked.id, name: picked.name, hq: picked.hq } : null, preview: true, teams: list };
}
