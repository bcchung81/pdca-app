"use server";

import { revalidatePath } from "next/cache";
import { type AppRole, type CurrentUser, requireAtLeast } from "../../../lib/auth/dal.ts";
import { allowedEmailDomains } from "../../../lib/auth/redirect.ts";
import { createAdminClient } from "../../../lib/supabase/admin.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { type PlanContext, extractEmail, planRows } from "../../../lib/users/plan.ts";
import { type Db, type ExistingProfile, assignTeamCards, loadMatchTeams, loadProfilesByEmail, logAccessEvent } from "../../../lib/users/service.ts";
import { type ApplyResult, type ApplyRowInput, type ApplyRowResult, type ExistingLookup, type LookupResponse, PASTE_MAX_ROWS, type TeamOption } from "../../../lib/users/types.ts";

export type UserFormState = { status: "idle" } | { status: "ok"; message: string } | { status: "error"; message: string };

const ROLES: AppRole[] = ["dept_user", "pmo", "admin"];
const NOT_STAFF = "성과관리팀·관리자만 할 수 있습니다.";
const BAN_FOREVER = "876000h"; // 약 100년 — Supabase 로그인 링크 발급을 막는 방법(없앨 때는 "none")

const error = (message: string): UserFormState => ({ status: "error", message });
const parseRole = (v: FormDataEntryValue | null): AppRole | null => (ROLES.includes(v as AppRole) ? (v as AppRole) : null);

function parseTeam(v: FormDataEntryValue | null): number | null | "invalid" {
  const s = String(v ?? "");
  if (!s) return null;
  return /^\d+$/.test(s) ? Number(s) : "invalid";
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

function planContext(me: CurrentUser, teams: TeamOption[], profiles: Map<string, ExistingProfile>): PlanContext {
  return { actorRole: me.role, allowedDomains: allowedEmailDomains(), teams: new Map(teams.map((t) => [t.id, t])), existing: (email) => profiles.get(email) ?? null };
}

/** 계정 만들기(서비스 키) + 가입 트리거가 만든 프로필에 이름·부서(·역할)를 로그인 사용자 권한으로 지정. 반환 행 수를 확인해 0행이면 실패로 다룸 */
async function createAccount(
  db: Db,
  email: string,
  name: string,
  patch: { team_id: number | null; role?: AppRole },
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const { data, error: createErr } = await createAdminClient().auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
  if (createErr || !data.user) {
    console.error("createUser", createErr?.message);
    return { ok: false, message: "계정을 만들지 못했습니다." };
  }
  const { data: rows, error: updErr } = await db.from("profiles").update({ display_name: name, ...patch }).eq("id", data.user.id).select("id");
  if (updErr || !rows?.length) {
    console.error("createAccount profile", updErr?.message ?? "0 rows");
    return { ok: false, message: "계정은 만들었지만 이름·부서 지정에 실패했습니다. 사용자 목록에서 다시 지정해 주세요." };
  }
  return { ok: true, id: data.user.id };
}

// ── 한 명 수정·추가(옆 창) ─────────────────────────────────────────────────────────────────────

/**
 * 이름·부서(·역할) 바꾸기. 관리자는 누구나·역할까지, 성과관리팀은 부서 담당자의 이름·부서만.
 * 최종 판정은 DB(RLS + 가드 트리거)가 하고, 부서가 바뀌면 새 팀 과제를 담당으로 지정합니다(예전 팀 지정은 DB가 지움).
 */
export async function updateUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const me = await requireAtLeast("pmo", "/users");
  if (!me) return error(NOT_STAFF);
  const id = String(formData.get("id") ?? "");
  const team = parseTeam(formData.get("team_id"));
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 40);
  if (!id || team === "invalid") return error("입력값을 확인해 주세요.");

  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, role, team_id").eq("id", id).maybeSingle();
  if (!target) return error("계정을 찾을 수 없습니다.");
  const isAdmin = me.role === "admin";
  if (!isAdmin && target.role !== "dept_user") return error("성과관리팀·관리자 계정은 관리자만 바꿀 수 있습니다.");
  const role = isAdmin ? parseRole(formData.get("role")) : "dept_user";
  if (!role) return error("입력값을 확인해 주세요.");

  if (id === me.id && role !== "admin") {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
    if ((count ?? 0) <= 1) return error("마지막 관리자는 역할을 바꿀 수 없습니다. 다른 관리자를 먼저 지정해 주세요.");
  }
  const patch = isAdmin ? { role, team_id: team, display_name: displayName } : { team_id: team, display_name: displayName };
  const { data, error: updErr } = await supabase.from("profiles").update(patch).eq("id", id).select("id");
  if (updErr || !data?.length) {
    console.error("updateUser", updErr?.message ?? "0 rows");
    return error("저장하지 못했습니다.");
  }
  let assigned = 0;
  if (role === "dept_user" && team !== null && team !== target.team_id) {
    try {
      assigned = await assignTeamCards(supabase, me.id, id, team);
    } catch (e) {
      console.error("updateUser assign", e);
    }
  }
  await logAccessEvent(supabase, me.id, id, "user_updated", { team: { from: target.team_id, to: team }, role: role !== target.role ? { from: target.role, to: role } : undefined, assigned });
  revalidatePath("/users");
  return { status: "ok", message: assigned ? `저장했습니다. 새 팀의 과제 ${assigned}장을 담당으로 지정했습니다.` : "저장했습니다." };
}

/**
 * 계정 미리 만들기(메일은 보내지 않음 — 그 사람이 로그인 화면에서 메일 링크로 들어옴).
 * 관리자는 역할까지 고르고, 성과관리팀은 부서 담당자만(기관 메일만). 부서 담당자는 팀이 필요하며 그 팀 과제가 담당으로 지정됩니다.
 */
export async function inviteUser(_prev: UserFormState, formData: FormData): Promise<UserFormState> {
  const me = await requireAtLeast("pmo", "/users");
  if (!me) return error(NOT_STAFF);
  const isAdmin = me.role === "admin";
  const email = extractEmail(String(formData.get("email") ?? ""));
  const role = isAdmin ? parseRole(formData.get("role")) : "dept_user";
  const team = parseTeam(formData.get("team_id"));
  const displayName = String(formData.get("display_name") ?? "").trim().slice(0, 40);
  if (!email || !role || team === "invalid") return error("메일·역할·부서를 확인해 주세요.");
  if (role === "dept_user" && team === null) return error("부서 담당자는 팀을 골라야 합니다.");
  if (!isAdmin && !allowedEmailDomains().includes(email.slice(email.lastIndexOf("@") + 1))) {
    return error(`기관 메일(@${allowedEmailDomains().join(", @")})만 등록할 수 있습니다. 외부 주소는 관리자에게 요청해 주세요.`);
  }

  const supabase = await createClient();
  const { data: exists } = await supabase.from("profiles").select("id").eq("email", email).maybeSingle();
  if (exists) return error("이미 있는 계정입니다. 목록에서 역할·부서를 바꿔 주세요.");

  const made = await createAccount(supabase, email, displayName, { team_id: team, role });
  if (!made.ok) return error(made.message);
  let assigned = 0;
  if (role === "dept_user" && team !== null) {
    try {
      assigned = await assignTeamCards(supabase, me.id, made.id, team);
    } catch (e) {
      console.error("inviteUser assign", e);
    }
  }
  await logAccessEvent(supabase, me.id, made.id, "user_added", { via: "form", role, team_id: team, assigned });
  revalidatePath("/users");
  return { status: "ok", message: `${email} 계정을 만들었습니다.${assigned ? ` 팀 과제 ${assigned}장을 담당으로 지정했습니다.` : ""} 로그인 화면에서 메일 링크로 들어올 수 있습니다.` };
}

// ── 사용 중지·복구 ("삭제") ────────────────────────────────────────────────────────────────────

/**
 * 계정 사용 중지(active=false)와 복구. 기록이 남은 계정은 지울 수 없어(작성자·확정자 참조) 중지로 다룹니다.
 * 성과관리팀은 부서 담당자만, 본인은 못 함. 먼저 DB(RLS·가드)에서 바꾸고 성공했을 때만 로그인 링크 발급을 막거나 풉니다.
 */
export async function setUserActive(id: string, active: boolean): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("pmo", "/users");
  if (!me) return { ok: false, message: NOT_STAFF };
  if (id === me.id) return { ok: false, message: "본인 계정은 여기서 중지할 수 없습니다." };
  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, role, active").eq("id", id).maybeSingle();
  if (!target) return { ok: false, message: "계정을 찾을 수 없습니다." };
  if (me.role !== "admin" && target.role !== "dept_user") return { ok: false, message: "성과관리팀·관리자 계정은 관리자만 바꿀 수 있습니다." };
  if (target.active === active) return { ok: true, message: active ? "이미 사용 중인 계정입니다." : "이미 중지된 계정입니다." };
  if (!active && target.role === "admin") {
    const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("active", true);
    if ((count ?? 0) <= 1) return { ok: false, message: "마지막 관리자는 중지할 수 없습니다." };
  }
  const { data, error: updErr } = await supabase.from("profiles").update({ active }).eq("id", id).select("id");
  if (updErr || !data?.length) {
    console.error("setUserActive", updErr?.message ?? "0 rows");
    return { ok: false, message: "바꾸지 못했습니다." };
  }
  const { error: banErr } = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: active ? "none" : BAN_FOREVER });
  await logAccessEvent(supabase, me.id, id, active ? "user_restored" : "user_deactivated", banErr ? { ban_error: banErr.message } : {});
  revalidatePath("/users");
  if (banErr) {
    console.error("setUserActive ban", banErr.message);
    return active
      ? { ok: false, message: "복구했지만 로그인 차단을 풀지 못했습니다. 다시 눌러 주세요." }
      : { ok: true, message: "중지했습니다. 화면·데이터 접근은 막혔지만 로그인 메일 차단은 실패했습니다(다시 눌러 주세요)." };
  }
  return { ok: true, message: active ? "복구했습니다." : "사용을 중지했습니다." };
}

// ── 과제 담당자 매칭 ───────────────────────────────────────────────────────────────────────────

/** 한 사람의 담당 과제를 주어진 목록으로 맞춤(그 사람 팀의 활성 과제만). 더하고 뺀 수를 알림 */
export async function setUserAssignments(userId: string, cardIds: string[]): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("pmo", "/users");
  if (!me) return { ok: false, message: NOT_STAFF };
  if (!Array.isArray(cardIds) || cardIds.length > 500 || cardIds.some((c) => typeof c !== "string")) return { ok: false, message: "입력값을 확인해 주세요." };
  const supabase = await createClient();
  const { data: target } = await supabase.from("profiles").select("id, role, team_id, active").eq("id", userId).maybeSingle();
  if (!target || target.role !== "dept_user") return { ok: false, message: "부서 담당자 계정만 과제를 지정할 수 있습니다." };
  if (!target.active) return { ok: false, message: "사용 중지된 계정입니다." };
  if (target.team_id === null) return { ok: false, message: "먼저 팀을 지정해 주세요." };

  const [{ data: teamCards }, { data: current }] = await Promise.all([
    supabase.from("cards").select("id").eq("team_id", target.team_id).eq("status", "active"),
    supabase.from("card_assignees").select("card_id").eq("user_id", userId),
  ]);
  const allowed = new Set((teamCards ?? []).map((c) => c.id));
  const want = new Set(cardIds.filter((c) => allowed.has(c)));
  const have = new Set((current ?? []).map((c) => c.card_id));
  const add = [...want].filter((c) => !have.has(c));
  const drop = [...have].filter((c) => !want.has(c));

  if (add.length) {
    const { error: insErr } = await supabase.from("card_assignees").insert(add.map((card_id) => ({ card_id, user_id: userId, assigned_by: me.id })));
    if (insErr) {
      console.error("setUserAssignments add", insErr.message);
      return { ok: false, message: "담당 과제를 지정하지 못했습니다." };
    }
  }
  if (drop.length) {
    const { error: delErr } = await supabase.from("card_assignees").delete().eq("user_id", userId).in("card_id", drop);
    if (delErr) {
      console.error("setUserAssignments drop", delErr.message);
      return { ok: false, message: "담당 과제를 빼지 못했습니다." };
    }
  }
  if (add.length) await logAccessEvent(supabase, me.id, userId, "assigned", { count: add.length, card_ids: add.slice(0, 60) });
  if (drop.length) await logAccessEvent(supabase, me.id, userId, "unassigned", { count: drop.length, card_ids: drop.slice(0, 60) });
  revalidatePath("/users");
  return { ok: true, message: add.length || drop.length ? `담당 과제 ${want.size}장으로 맞췄습니다(추가 ${add.length} · 제외 ${drop.length}).` : "바뀐 것이 없습니다." };
}

// ── 엑셀 붙여넣기 등록 ─────────────────────────────────────────────────────────────────────────

/**
 * 붙여넣은 표의 이메일들이 이미 있는 계정인지 알려 줍니다(DB를 바꾸지 않음). 격자 화면이 줄을 고칠 때마다 새 주소만 묻습니다.
 * 팀 추천은 순수 함수라 화면이 직접 계산하므로 여기서는 계정 여부만 돌려줍니다.
 */
export async function lookupExistingUsers(emails: string[]): Promise<LookupResponse> {
  const me = await requireAtLeast("pmo", "/users/import");
  if (!me) return { ok: false, message: NOT_STAFF };
  if (!Array.isArray(emails) || emails.length > PASTE_MAX_ROWS) return { ok: false, message: `한 번에 ${PASTE_MAX_ROWS}줄까지 처리합니다.` };
  const list = [...new Set(emails.map((e) => extractEmail(str(e, 400))).filter(Boolean))];
  const profiles = await loadProfilesByEmail(await createClient(), list);
  const existing: ExistingLookup = {};
  for (const e of list) {
    const p = profiles.get(e);
    existing[e] = p ? { role: p.role, active: p.active, teamId: p.teamId, displayName: p.displayName } : null;
  }
  return { ok: true, existing };
}

/**
 * 확인한 줄을 반영: 신규는 계정을 만들고, 이미 있는 담당자는 이름·팀을 바꾸고, 「팀 과제 자동 매칭」이 켜져 있으면
 * 그 팀 활성 과제 전부를 담당으로 지정합니다. 화면이 보낸 값을 믿지 않고 판정을 처음부터 다시 합니다.
 * 부분 실패는 되돌리지 않고 줄마다 결과를 돌려줍니다(이미 만든 계정은 그대로 유효).
 */
export async function applyUserPaste(input: ApplyRowInput[], options: { autoAssign: boolean }): Promise<ApplyResult> {
  const me = await requireAtLeast("pmo", "/users/import");
  if (!me) return { ok: false, message: NOT_STAFF };
  if (!Array.isArray(input) || input.length > PASTE_MAX_ROWS) return { ok: false, message: `한 번에 ${PASTE_MAX_ROWS}줄까지 처리합니다.` };
  const rows: ApplyRowInput[] = input.map((r, i) => ({
    line: Number.isInteger(r?.line) ? r.line : i + 1,
    name: str(r?.name, 200),
    email: str(r?.email, 400),
    teamId: Number.isInteger(r?.teamId) ? r.teamId : null,
    // 성과관리팀 권한은 관리자만 줄 수 있음 — 판정(planRows)이 성과관리팀 사용자의 요청을 role-denied로 막음
    role: r?.role === "pmo" ? "pmo" : "dept_user",
  }));
  if (!rows.length) return { ok: false, message: "반영할 줄이 없습니다." };
  const autoAssign = options?.autoAssign === true;

  const supabase = await createClient();
  const [teams, profiles] = await Promise.all([loadMatchTeams(supabase), loadProfilesByEmail(supabase, rows.map((r) => extractEmail(r.email)).filter(Boolean))]);
  const planned = planRows(rows, planContext(me, teams, profiles));

  const results: ApplyRowResult[] = [];
  for (const [i, plan] of planned.entries()) {
    const line = rows[i].line;
    if (!plan.applicable) {
      results.push({ line, email: plan.email || rows[i].email, status: plan.status === "invalid" ? "error" : "skipped", message: plan.message, assigned: 0 });
      continue;
    }
    try {
      results.push(await applyPlanned(supabase, me, line, plan, profiles.get(plan.email) ?? null, autoAssign));
    } catch (e) {
      console.error("applyUserPaste", plan.email, e);
      results.push({ line, email: plan.email, status: "error", message: "처리하지 못했습니다.", assigned: 0 });
    }
  }
  revalidatePath("/users");
  return { ok: true, rows: results };
}

async function applyPlanned(
  db: Db,
  me: CurrentUser,
  line: number,
  plan: ReturnType<typeof planRows>[number],
  existing: ExistingProfile | null,
  autoAssign: boolean,
): Promise<ApplyRowResult> {
  const fail = (message: string): ApplyRowResult => ({ line, email: plan.email, status: "error", message, assigned: 0 });
  const pmo = plan.role === "pmo";
  // 팀 담당 과제 자동 지정은 부서 담당자만(성과관리팀은 모든 과제를 봄)
  const assign = async (userId: string) => (autoAssign && !pmo && plan.teamId !== null ? await assignTeamCards(db, me.id, userId, plan.teamId) : 0);

  if (!existing) {
    const made = await createAccount(db, plan.email, plan.name, pmo ? { team_id: plan.teamId, role: "pmo" } : { team_id: plan.teamId });
    if (!made.ok) return fail(made.message);
    const assigned = await assign(made.id);
    await logAccessEvent(db, me.id, made.id, "user_added", { via: "paste", role: plan.role, team_id: plan.teamId, assigned });
    const what = pmo ? "성과관리팀 계정을 만들었습니다" : "계정을 만들었습니다";
    return { line, email: plan.email, status: "created", message: assigned ? `계정을 만들고 팀 과제 ${assigned}장을 담당으로 지정했습니다` : what, assigned };
  }

  if (plan.status === "update") {
    // 성과관리팀 줄에서 팀을 비웠으면 기존 팀은 건드리지 않음. 권한이 바뀌면 그때만 role을 보냄(가드: 관리자만)
    const patch: { display_name: string; team_id?: number | null; role?: "pmo" } = { display_name: plan.name };
    if (!(pmo && plan.teamId === existing.teamId)) patch.team_id = plan.teamId;
    if (pmo && existing.role === "dept_user") patch.role = "pmo";
    const { data, error: updErr } = await db.from("profiles").update(patch).eq("id", existing.id).select("id");
    if (updErr || !data?.length) return fail("이름·팀·권한을 바꾸지 못했습니다");
  }
  const assigned = await assign(existing.id);
  const teamChanged = existing.teamId !== plan.teamId;
  if (plan.status === "update") await logAccessEvent(db, me.id, existing.id, "user_updated", { via: "paste", changes: plan.changes, role: plan.role, assigned });
  else if (assigned) await logAccessEvent(db, me.id, existing.id, "assigned", { via: "paste", count: assigned });
  if (plan.status === "update") {
    const note = teamChanged && !autoAssign && !pmo ? " (팀이 바뀌어 이전 담당 과제는 해제되었습니다)" : "";
    return { line, email: plan.email, status: "updated", message: `${plan.changes.join(" · ")}${assigned ? ` · 팀 과제 ${assigned}장 지정` : ""}${note}`, assigned };
  }
  return assigned
    ? { line, email: plan.email, status: "updated", message: `팀 과제 ${assigned}장을 담당으로 지정했습니다`, assigned }
    : { line, email: plan.email, status: "unchanged", message: "바뀐 것이 없습니다", assigned: 0 };
}
