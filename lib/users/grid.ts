// 엑셀처럼 생긴 격자(붙여넣기 등록 화면)의 줄 분석(입출력 없음). 화면은 격자에서 줄을 읽어 analyzeGrid에 넣고,
// 돌려받은 값(팀·후보·상태·반영 체크)을 격자의 계산 열에 써넣습니다. 같은 입력이면 같은 출력이라 써넣은 값을 다시 넣어도 그대로입니다.

import type { AppRole } from "../auth/access.ts";
import { type PlanStatus, extractEmail, planRows } from "./plan.ts";
import { matchTeam } from "./team-match.ts";
import type { ApplyRowInput, ExistingSnapshot, TeamOption } from "./types.ts";

/** 격자 열 번호: 붙여넣는 세 열(A~C) · 권한(관리자만 보임) · 계산 열 · 숨은 열(auto) */
export const COL = { name: 0, email: 1, teamText: 2, role: 3, team: 4, hint: 5, status: 6, pick: 7, auto: 8 } as const;

/** 권한 열의 값(드롭다운 id) */
export const ROLE_VALUE = { dept: "dept_user", pmo: "pmo" } as const;
export const ROLE_LABEL: Record<string, string> = { dept_user: "부서 담당자", pmo: "성과관리팀" };

/** 추천 1순위를 팀 칸에 미리 채우는 기준(이보다 낮으면 후보만 보여 주고 칸은 비워 둠). 채워도 사람이 체크해야 반영 */
export const AUTO_FILL_SCORE = 0.9;
/** 1순위가 2순위보다 이만큼 앞서야 「분명한 1순위」(본부만 적힌 줄처럼 후보 점수가 같으면 고르지 않음) */
export const CLEAR_LEAD = 0.1;

export type GridStatus = PlanStatus | "checking" | "blank";

export const STATUS_LABEL: Record<GridStatus, string> = {
  new: "신규",
  update: "변경",
  same: "변경 없음",
  "needs-team": "팀 선택 필요",
  inactive: "중지된 계정",
  "not-dept": "성과관리팀·관리자",
  external: "기관 밖 메일",
  "role-denied": "관리자만 가능",
  duplicate: "중복",
  invalid: "오류",
  checking: "확인 중…",
  blank: "",
};

/** 칸 색: ok 초록 · warn 노랑(확인 필요) · skip 회색(건너뜀) · err 빨강 · info 파랑(성과관리팀 권한) */
export type Tone = "ok" | "warn" | "skip" | "err" | "info" | "";

const STATUS_TONE: Record<GridStatus, Tone> = {
  new: "ok",
  update: "ok",
  same: "",
  "needs-team": "warn",
  inactive: "skip",
  "not-dept": "skip",
  external: "skip",
  "role-denied": "skip",
  duplicate: "err",
  invalid: "err",
  checking: "",
  blank: "",
};

export interface GridRowIn {
  name: string;
  email: string;
  teamText: string;
  /** 권한 칸 값("dept_user" | "pmo", 비었으면 부서 담당자) */
  role: string;
  /** 팀 칸 값(팀 id 글, 비었으면 "") */
  team: string;
  pick: boolean;
  /** 앞서 자동으로 채운 팀 id(사람이 고른 값과 구분하려고 숨은 열에 둠) */
  auto: string;
}

export interface GridRowOut {
  blank: boolean;
  /** 권한 칸에 넣을 값(빈 줄은 "") */
  role: string;
  roleTone: Tone;
  team: string;
  auto: string;
  pick: boolean;
  hint: string;
  /** 추천 1순위 팀 id 글(추천이 없으면 ""). 「추천 1순위 모두 적용」이 씀 */
  suggest: string;
  status: string;
  message: string;
  teamTone: Tone;
  statusTone: Tone;
  /** 반영할 수 있는 줄(신규·변경·변경 없음) */
  applicable: boolean;
  /** 반영을 요청할 값(반영할 수 없는 줄은 null) */
  input: ApplyRowInput | null;
}

export interface GridEnv {
  teams: readonly TeamOption[];
  /** 이미 조회한 이메일 → 기존 계정(없으면 null). 여기 없는 이메일은 아직 조회 전 */
  existing: ReadonlyMap<string, ExistingSnapshot | null>;
  actorRole: AppRole;
  allowedDomains: readonly string[];
}

const isBlank = (r: GridRowIn) => !r.name.trim() && !r.email.trim() && !r.teamText.trim();
const pct = (n: number) => `${Math.round(n * 100)}%`;

/** 격자 전체 줄을 분석 */
export function analyzeGrid(rows: readonly GridRowIn[], env: GridEnv): GridRowOut[] {
  const teamById = new Map(env.teams.map((t) => [t.id, t]));
  const names = (id: number) => teamById.get(id)?.name ?? String(id);

  // 1) 팀 칸: 자동으로 채운 값은 팀명 글이 바뀌면 따라 바뀌고, 사람이 고른 값은 그대로 둠
  const stage = rows.map((r) => {
    if (isBlank(r)) return null;
    const pmo = r.role === ROLE_VALUE.pmo; // 성과관리팀은 팀이 선택(모든 과제를 봄) — 추천은 채우지 않고 정확히 같을 때만 넣음
    const match = matchTeam(r.teamText, env.teams);
    const cand = match.kind === "suggest" ? match.candidates : [];
    const top = cand[0] && cand[0].score - (cand[1]?.score ?? 0) >= CLEAR_LEAD ? cand[0] : undefined; // 분명한 1순위만
    const exact = match.kind === "exact";
    const desired = match.kind === "exact" ? String(match.teamId) : !pmo && top && top.score >= AUTO_FILL_SCORE ? String(top.teamId) : "";
    const untouched = r.team === "" || r.team === r.auto;
    const team = untouched ? desired : r.team;
    const pick = untouched && desired !== r.auto ? exact && desired !== "" : r.pick;
    return { match, exact, pmo, desired, suggest: !pmo && top ? String(top.teamId) : "", untouched, team, pick };
  });

  // 2) 줄 판정(서버가 반영할 때 다시 하는 것과 같은 함수)
  const live = stage.flatMap((s, i) => (s ? [i] : []));
  const lookedUp = (email: string) => !email || env.existing.has(email);
  const plans = planRows(
    live.map((i) => ({ name: rows[i].name, email: rows[i].email, teamId: stage[i]!.team ? Number(stage[i]!.team) : null, role: stage[i]!.pmo ? ROLE_VALUE.pmo : ROLE_VALUE.dept })),
    { actorRole: env.actorRole, allowedDomains: env.allowedDomains, teams: teamById, existing: (e) => env.existing.get(e) ?? null },
  );
  const planOf = new Map(live.map((i, k) => [i, plans[k]]));

  return rows.map((r, i): GridRowOut => {
    const s = stage[i];
    const plan = planOf.get(i);
    if (!s || !plan) return { blank: true, role: "", roleTone: "", team: "", auto: "", pick: false, hint: "", suggest: "", status: "", message: "", teamTone: "", statusTone: "", applicable: false, input: null };

    const checking = plan.email !== "" && !lookedUp(plan.email) && ["new", "update", "same"].includes(plan.status);
    const status: GridStatus = checking ? "checking" : plan.status;
    const applicable = !checking && plan.applicable;

    let hint = "";
    if (s.match.kind === "exact") hint = `✔ ${s.match.reason}${s.match.warn ? ` · ${s.match.warn}` : ""}`;
    else if (s.pmo) hint = "성과관리팀 — 팀 없이 등록(모든 과제를 봅니다)";
    else if (s.match.kind === "suggest") hint = s.match.candidates.map((c) => `${names(c.teamId)} ${pct(c.score)}`).join(" · ");
    else if (r.teamText.trim()) hint = "비슷한 팀을 찾지 못했습니다";

    const skipped = ["inactive", "not-dept", "external", "role-denied", "duplicate", "invalid"].includes(plan.status);
    let teamTone: Tone = "";
    if (!skipped) {
      if (s.pmo) teamTone = s.team ? "ok" : ""; // 성과관리팀은 팀이 없어도 확인 필요가 아님
      else if (!s.team) teamTone = "warn";
      else if (s.untouched && !s.exact) teamTone = "warn"; // 추천만 미리 채움 — 확인 필요
      else teamTone = "ok";
    }
    return {
      blank: false,
      role: s.pmo ? ROLE_VALUE.pmo : ROLE_VALUE.dept,
      roleTone: s.pmo ? "info" : "",
      team: s.team,
      auto: s.desired,
      pick: s.pick,
      hint,
      suggest: s.suggest,
      status: STATUS_LABEL[status],
      message: plan.message,
      teamTone,
      statusTone: STATUS_TONE[status],
      applicable,
      input: applicable ? { line: i + 1, name: plan.name, email: plan.email, teamId: plan.teamId, role: plan.role } : null,
    };
  });
}

/** 격자 한 줄(배열)을 분석 입력으로 */
export function gridRowIn(cells: ReadonlyArray<unknown>): GridRowIn {
  const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
  return {
    name: s(cells[COL.name]),
    email: s(cells[COL.email]),
    teamText: s(cells[COL.teamText]),
    role: s(cells[COL.role]),
    team: s(cells[COL.team]),
    pick: cells[COL.pick] === true || cells[COL.pick] === "true",
    auto: s(cells[COL.auto]),
  };
}

/** 이메일 칸에서 조회할 주소(정리된 것만) */
export function emailsOf(rows: readonly GridRowIn[]): string[] {
  return [...new Set(rows.map((r) => extractEmail(r.email)).filter(Boolean))];
}
