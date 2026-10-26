import "server-only";

import type { createClient } from "../supabase/server.ts";
import { compareTaskNo } from "../cards/view.ts";
import type { ExistingSnapshot, TeamOption } from "./types.ts";

// 담당자 등록·관리의 DB 조회·기록 모음. 모두 로그인 사용자 권한(RLS)으로 돌고, 호출하는 액션이 역할을 먼저 확인합니다.

export type Db = Awaited<ReturnType<typeof createClient>>;

/** 서버 안에서만 쓰는 기존 계정 정보(id 포함) */
export interface ExistingProfile extends ExistingSnapshot {
  id: string;
  email: string;
}

/** 붙여넣기에서 고를 수 있는 팀: 활성 팀 중 활성 과제 카드가 있는 팀(과제 수 포함), 본부·이름 순 */
export async function loadMatchTeams(db: Db): Promise<TeamOption[]> {
  const [{ data: teams, error }, { data: cards }] = await Promise.all([
    db.from("teams").select("id, name, hq").eq("active", true),
    db.from("cards").select("team_id").eq("status", "active"),
  ]);
  if (error) throw new Error(`팀 목록: ${error.message}`);
  const per = new Map<number, number>();
  for (const c of cards ?? []) if (c.team_id) per.set(c.team_id, (per.get(c.team_id) ?? 0) + 1);
  return (teams ?? [])
    .filter((t) => per.has(t.id))
    .map((t) => ({ id: t.id, name: t.name, hq: t.hq, cards: per.get(t.id) ?? 0 }))
    .sort((a, b) => (a.hq ?? "").localeCompare(b.hq ?? "", "ko") || a.name.localeCompare(b.name, "ko"));
}

/** 이메일(소문자)로 이미 있는 계정 찾기 */
export async function loadProfilesByEmail(db: Db, emails: string[]): Promise<Map<string, ExistingProfile>> {
  const out = new Map<string, ExistingProfile>();
  const list = [...new Set(emails)];
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await db.from("profiles").select("id, email, display_name, role, team_id, active").in("email", list.slice(i, i + 100));
    if (error) throw new Error(`계정 조회: ${error.message}`);
    for (const p of data ?? []) {
      const email = (p.email ?? "").toLowerCase();
      out.set(email, { id: p.id, email, role: p.role, active: p.active, teamId: p.team_id, displayName: p.display_name });
    }
  }
  return out;
}

/** 그 팀 활성 과제 전부를 이 담당자에게 지정(이미 있는 지정은 그대로). 새로 지정된 수를 돌려줌 */
export async function assignTeamCards(db: Db, actorId: string, userId: string, teamId: number): Promise<number> {
  const { data: cards, error } = await db.from("cards").select("id").eq("team_id", teamId).eq("status", "active");
  if (error) throw new Error(`팀 과제 조회: ${error.message}`);
  if (!cards?.length) return 0;
  const { data, error: insErr } = await db
    .from("card_assignees")
    .upsert(
      cards.map((c) => ({ card_id: c.id, user_id: userId, assigned_by: actorId })),
      { onConflict: "card_id,user_id", ignoreDuplicates: true },
    )
    .select("card_id");
  if (insErr) throw new Error(`담당 과제 지정: ${insErr.message}`);
  return data?.length ?? 0;
}

export type AccessAction = "user_added" | "user_updated" | "user_deactivated" | "user_restored" | "assigned" | "unassigned";

/** 권한 변경 기록. 기록 실패가 본 작업을 막지 않게 오류만 남김 */
export async function logAccessEvent(db: Db, actorId: string, targetUserId: string, action: AccessAction, detail: Record<string, unknown> = {}): Promise<void> {
  const { error } = await db.from("access_events").insert({ actor_id: actorId, target_user_id: targetUserId, action, detail });
  if (error) console.error("access_events", error.message);
}

export interface AssignCard {
  id: string;
  taskNo: string;
  title: string;
  business: string;
  assigned: boolean;
}

/** 옆 창의 「담당 과제」: 그 사용자 팀의 활성 과제와 지정 여부(사업·과제번호 순) */
export async function assignmentView(db: Db, userId: string, teamId: number | null): Promise<AssignCard[]> {
  if (teamId === null) return [];
  const [{ data: cards, error }, { data: mine }] = await Promise.all([
    db.from("cards").select("id, task_no, title, unit:eval_units(name, sort)").eq("team_id", teamId).eq("status", "active"),
    db.from("card_assignees").select("card_id").eq("user_id", userId),
  ]);
  if (error) throw new Error(`팀 과제 조회: ${error.message}`);
  const assigned = new Set((mine ?? []).map((m) => m.card_id));
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  return (cards ?? [])
    .map((c) => ({ id: c.id, taskNo: c.task_no, title: c.title, business: one(c.unit)?.name ?? "", sort: one(c.unit)?.sort ?? 0, assigned: assigned.has(c.id) }))
    .sort((a, b) => a.sort - b.sort || compareTaskNo(a.taskNo, b.taskNo))
    .map((c) => ({ id: c.id, taskNo: c.taskNo, title: c.title, business: c.business, assigned: c.assigned }));
}
