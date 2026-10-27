// 붙여넣은 한 줄(이름·이메일·팀)이 반영되면 어떻게 되는지 판정합니다(입출력 없음).
// 미리보기 화면(팀을 바꿀 때마다 다시 셈)과 서버의 반영 액션이 같은 함수를 씁니다. 서버는 클라이언트가 보낸 값을 믿지 않고 이 판정을 다시 돌립니다.

import type { AppRole } from "../auth/access.ts";
import { checkDisplayName } from "./name.ts";
import { cleanCell } from "./paste.ts";
import type { ExistingSnapshot, TeamRef } from "./types.ts";

export const EMAIL_MAX = 254;

/** 붙여넣기로 등록할 수 있는 권한: 부서 담당자 · 성과관리팀(관리자만 고를 수 있음) */
export type PlanRole = "dept_user" | "pmo";

/**
 * 판정:
 *  new — 신규 계정  ·  update — 이름·부서·권한 변경  ·  same — 변화 없음(과제 매칭만 채울 수 있음)
 *  needs-team — 팀이 정해지지 않음(부서 담당자만)  ·  inactive — 사용 중지된 계정  ·  not-dept — 이 권한으로는 바꾸지 않는 기존 계정
 *  external — 기관 밖 메일(관리자만 등록)  ·  role-denied — 성과관리팀 권한은 관리자만 줄 수 있음
 *  duplicate — 붙여넣은 표 안 중복  ·  invalid — 이름·이메일·팀 값 오류
 */
export type PlanStatus = "new" | "update" | "same" | "needs-team" | "inactive" | "not-dept" | "external" | "role-denied" | "duplicate" | "invalid";

export interface PlannedRow {
  status: PlanStatus;
  /** 반영할 수 있는 줄인가(new·update·same) */
  applicable: boolean;
  name: string;
  /** 정리된(소문자·주소만 뽑은) 이메일. 못 뽑으면 빈 글 */
  email: string;
  teamId: number | null;
  role: PlanRole;
  message: string;
  /** update일 때 바뀌는 것 */
  changes: string[];
}

export interface PlanContext {
  /** 지금 사용자의 역할 — 성과관리팀은 기관 메일 도메인만 새로 등록 */
  actorRole: AppRole;
  /** 기관 메일 도메인(소문자) */
  allowedDomains: readonly string[];
  teams: ReadonlyMap<number, TeamRef>;
  /** 정리된 이메일로 이미 있는 계정 찾기 */
  existing: (email: string) => ExistingSnapshot | null;
}

export interface PlanInput {
  name: string;
  email: string;
  teamId: number | null;
  /** 주는 권한(없으면 부서 담당자). 성과관리팀 권한은 관리자만 줄 수 있음 */
  role?: PlanRole;
}

const EMAIL_IN_TEXT = /[^\s<>"'(),;:[\]]+@[^\s<>"'(),;:[\]]+\.[^\s<>"'(),;:[\]]+/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 「홍길동 <hong@kca.kr>」·「mailto:…」 같은 표기에서 주소만 뽑아 소문자로. 못 뽑으면 빈 글 */
export function extractEmail(s: string): string {
  const m = EMAIL_IN_TEXT.exec(cleanCell(s));
  if (!m) return "";
  const email = m[0].replace(/^mailto:/i, "").replace(/[.]+$/, "").toLowerCase();
  return EMAIL_SHAPE.test(email) && email.length <= EMAIL_MAX ? email : "";
}

const domainOf = (email: string) => email.slice(email.lastIndexOf("@") + 1);

const blank = (status: PlanStatus, input: PlanInput, name: string, email: string, message: string): PlannedRow => ({
  status,
  applicable: false,
  name,
  email,
  teamId: input.teamId,
  role: input.role ?? "dept_user",
  message,
  changes: [],
});

/** 한 줄 판정. seen은 앞선 줄에서 나온 이메일(중복 검사용) — planRows가 채웁니다 */
export function planRow(input: PlanInput, ctx: PlanContext, seen: ReadonlySet<string> = new Set()): PlannedRow {
  const checked = checkDisplayName(input.name);
  const name = checked.name;
  const email = extractEmail(input.email);
  if (!email) return blank("invalid", input, name, "", "이메일 주소를 읽지 못했습니다");
  if (name.includes("@")) return blank("invalid", input, name, email, "이름 칸에 메일 주소가 들어 있습니다 — 열 순서를 확인해 주세요");
  if (!checked.ok) return blank("invalid", input, name, email, checked.message);
  if (seen.has(email)) return blank("duplicate", input, name, email, "붙여넣은 표 안에서 같은 메일이 앞에 이미 있습니다");

  const role: PlanRole = input.role === "pmo" ? "pmo" : "dept_user";
  if (role === "pmo" && ctx.actorRole !== "admin") return blank("role-denied", input, name, email, "성과관리팀 권한은 관리자만 줄 수 있습니다");

  const existing = ctx.existing(email);
  if (existing && existing.role === "admin") return blank("not-dept", input, name, email, "이미 관리자 계정입니다 — 여기서는 바꾸지 않습니다");
  if (existing && role === "dept_user" && existing.role !== "dept_user") {
    return blank("not-dept", input, name, email, "이미 성과관리팀 계정입니다 — 부서 담당자로 낮추지 않습니다");
  }
  if (existing && !existing.active) return blank("inactive", input, name, email, "사용 중지된 계정입니다 — 사용자 목록에서 복구한 뒤 다시 올려 주세요");
  if (!existing && ctx.actorRole !== "admin" && !ctx.allowedDomains.includes(domainOf(email))) {
    return blank("external", input, name, email, `기관 메일(@${ctx.allowedDomains.join(", @")})이 아닙니다 — 관리자만 등록할 수 있습니다`);
  }
  // 팀: 부서 담당자는 필수(팀이 접근 범위), 성과관리팀은 모든 과제를 보므로 선택(비워도 됨)
  if (role === "dept_user" && input.teamId === null) return blank("needs-team", input, name, email, "팀을 골라 주세요");
  const team = input.teamId === null ? null : (ctx.teams.get(input.teamId) ?? null);
  if (input.teamId !== null && !team) return blank("invalid", input, name, email, "없거나 사용하지 않는 팀입니다");

  const teamId = team ? team.id : null;
  if (!existing) {
    const message = role === "pmo" ? "새 성과관리팀 계정을 만듭니다" : "새 담당자 계정을 만듭니다";
    return { status: "new", applicable: true, name, email, teamId, role, message, changes: [] };
  }
  const changes: string[] = [];
  if (existing.displayName !== name) changes.push(existing.displayName ? `이름 ${existing.displayName} → ${name}` : `이름 ${name}`);
  if (role === "pmo" && existing.role === "dept_user") changes.push("권한 부서 담당자 → 성과관리팀(담당 과제 지정은 해제됨)");
  // 성과관리팀은 팀을 비워 둘 수 있으므로 비었을 때는 기존 팀을 그대로 둠
  if (teamId !== null && existing.teamId !== teamId) {
    const from = existing.teamId !== null ? ctx.teams.get(existing.teamId)?.name : undefined;
    changes.push(from ? `팀 ${from} → ${team!.name}` : `팀 ${team!.name} 지정`);
  }
  const keepTeam = role === "pmo" && teamId === null ? existing.teamId : teamId;
  if (!changes.length) return { status: "same", applicable: true, name, email, teamId: keepTeam, role, message: "이미 같은 내용입니다", changes };
  return { status: "update", applicable: true, name, email, teamId: keepTeam, role, message: changes.join(" · "), changes };
}

/** 여러 줄 판정(앞선 줄과 메일이 같으면 뒤 줄이 duplicate) */
export function planRows(inputs: readonly PlanInput[], ctx: PlanContext): PlannedRow[] {
  const seen = new Set<string>();
  return inputs.map((input) => {
    const row = planRow(input, ctx, seen);
    if (row.email && row.status !== "duplicate" && row.status !== "invalid") seen.add(row.email);
    return row;
  });
}
