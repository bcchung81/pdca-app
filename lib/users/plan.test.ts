import assert from "node:assert/strict";
import { test } from "node:test";
import type { AppRole } from "../auth/access.ts";
import { extractEmail, planRow, planRows, type PlanContext } from "./plan.ts";
import type { ExistingSnapshot, TeamRef } from "./types.ts";

const QI: TeamRef = { id: 2, name: "검사기획팀", hq: "전파기반본부" };
const JG: TeamRef = { id: 13, name: "자격기획팀", hq: "ICT자격본부" };
const TEAMS = new Map([QI, JG].map((t) => [t.id, t]));
const snap = (o: Partial<ExistingSnapshot> = {}): ExistingSnapshot => ({ role: "dept_user", active: true, teamId: QI.id, displayName: "홍길동", ...o });

function ctx(actorRole: AppRole = "pmo", existing: Record<string, ExistingSnapshot> = {}): PlanContext {
  return { actorRole, allowedDomains: ["kca.kr"], teams: TEAMS, existing: (e) => existing[e] ?? null };
}

test("extractEmail: 표기에서 주소만 뽑아 소문자로", () => {
  assert.equal(extractEmail("홍길동 <Hong@KCA.kr>"), "hong@kca.kr");
  assert.equal(extractEmail("mailto:a@b.co"), "a@b.co");
  assert.equal(extractEmail(" hong@kca.kr. "), "hong@kca.kr");
  assert.equal(extractEmail("hong"), "");
  assert.equal(extractEmail("a@b"), "");
});

test("신규: 기관 메일 + 팀이 정해지면 새 계정", () => {
  const r = planRow({ name: "홍길동", email: "Hong@kca.kr", teamId: QI.id }, ctx());
  assert.deepEqual([r.status, r.applicable, r.email, r.teamId], ["new", true, "hong@kca.kr", QI.id]);
});

test("성과관리팀은 기관 밖 메일을 새로 등록하지 못하고 관리자는 한다. 이미 있는 담당자는 성과관리팀도 고친다", () => {
  const input = { name: "외부인", email: "x@gmail.com", teamId: QI.id };
  assert.equal(planRow(input, ctx("pmo")).status, "external");
  assert.equal(planRow(input, ctx("admin")).status, "new");
  assert.equal(planRow({ ...input, name: "새이름" }, ctx("pmo", { "x@gmail.com": snap({ displayName: "외부인" }) })).status, "update");
});

test("이미 있는 계정: 같으면 same, 이름·팀이 다르면 update(무엇이 바뀌는지), 팀이 비었으면 지정", () => {
  const same = planRow({ name: "홍길동", email: "hong@kca.kr", teamId: QI.id }, ctx("pmo", { "hong@kca.kr": snap() }));
  assert.deepEqual([same.status, same.applicable], ["same", true]);
  const moved = planRow({ name: "홍길동", email: "hong@kca.kr", teamId: JG.id }, ctx("pmo", { "hong@kca.kr": snap() }));
  assert.equal(moved.status, "update");
  assert.deepEqual(moved.changes, ["팀 검사기획팀 → 자격기획팀"]);
  const renamed = planRow({ name: "홍길순", email: "hong@kca.kr", teamId: QI.id }, ctx("pmo", { "hong@kca.kr": snap() }));
  assert.deepEqual(renamed.changes, ["이름 홍길동 → 홍길순"]);
  const noTeam = planRow({ name: "홍길동", email: "hong@kca.kr", teamId: QI.id }, ctx("pmo", { "hong@kca.kr": snap({ teamId: null, displayName: "" }) }));
  assert.deepEqual(noTeam.changes, ["이름 홍길동", "팀 검사기획팀 지정"]);
});

test("성과관리팀·관리자 계정과 사용 중지된 계정은 건너뛴다", () => {
  const input = { name: "김", email: "kim@kca.kr", teamId: QI.id };
  for (const role of ["pmo", "admin"] as const) {
    const r = planRow(input, ctx("admin", { "kim@kca.kr": snap({ role }) }));
    assert.deepEqual([r.status, r.applicable], ["not-dept", false], role);
  }
  const off = planRow(input, ctx("pmo", { "kim@kca.kr": snap({ active: false }) }));
  assert.deepEqual([off.status, off.applicable], ["inactive", false]);
});

test("팀이 없거나 없는 팀이면 반영하지 않는다", () => {
  const none = planRow({ name: "홍길동", email: "hong@kca.kr", teamId: null }, ctx());
  assert.deepEqual([none.status, none.applicable], ["needs-team", false]);
  const bad = planRow({ name: "홍길동", email: "hong@kca.kr", teamId: 999 }, ctx());
  assert.deepEqual([bad.status, bad.applicable], ["invalid", false]);
});

test("이름·이메일 값 오류를 걸러낸다", () => {
  const at = (name: string, email: string) => planRow({ name, email, teamId: QI.id }, ctx());
  assert.equal(at("홍길동", "hong").status, "invalid");
  assert.equal(at("", "hong@kca.kr").status, "invalid");
  assert.equal(at("hong@kca.kr", "홍길동").status, "invalid", "열이 바뀐 경우");
  assert.equal(at("홍".repeat(41), "hong@kca.kr").status, "invalid");
});

test("planRows: 같은 메일이 앞에 있으면 뒤 줄은 duplicate, 오류 줄은 중복 기준이 되지 않는다", () => {
  const rows = planRows(
    [
      { name: "홍길동", email: "hong@kca.kr", teamId: QI.id },
      { name: "홍길동2", email: "HONG@kca.kr", teamId: QI.id },
      { name: "", email: "new@kca.kr", teamId: QI.id },
      { name: "새사람", email: "new@kca.kr", teamId: QI.id },
    ],
    ctx(),
  );
  assert.deepEqual(rows.map((r) => r.status), ["new", "duplicate", "invalid", "new"]);
});

test("성과관리팀 권한: 관리자만 주고, 팀 없이도 되고, 기관 밖 메일도 됨(관리자), 성과관리팀 사용자는 role-denied", () => {
  const pmoInput = { name: "박마바", email: "outside@example.com", teamId: null, role: "pmo" as const };
  const made = planRow(pmoInput, ctx("admin"));
  assert.deepEqual([made.status, made.applicable, made.role, made.teamId, made.message], ["new", true, "pmo", null, "새 성과관리팀 계정을 만듭니다"]);
  const denied = planRow(pmoInput, ctx("pmo"));
  assert.deepEqual([denied.status, denied.applicable], ["role-denied", false]);
  // 부서 담당자로 올리면 팀이 꼭 필요
  assert.equal(planRow({ ...pmoInput, role: "dept_user" }, ctx("admin")).status, "needs-team");
});

test("성과관리팀 권한 + 기존 계정: 부서 담당자는 올리고(담당 과제 해제 경고), 성과관리팀은 그대로, 관리자는 건너뜀, 낮추지 않음", () => {
  const input = { name: "홍길동", email: "hong@kca.kr", teamId: null, role: "pmo" as const };
  const up = planRow(input, ctx("admin", { "hong@kca.kr": snap() }));
  assert.equal(up.status, "update");
  assert.ok(up.changes.some((c) => c.includes("성과관리팀")));
  assert.equal(up.teamId, QI.id, "팀을 비웠으면 기존 팀을 그대로 둠");
  const same = planRow(input, ctx("admin", { "hong@kca.kr": snap({ role: "pmo" }) }));
  assert.deepEqual([same.status, same.applicable], ["same", true]);
  const admin = planRow(input, ctx("admin", { "hong@kca.kr": snap({ role: "admin" }) }));
  assert.deepEqual([admin.status, admin.applicable], ["not-dept", false]);
  const down = planRow({ ...input, role: "dept_user", teamId: QI.id }, ctx("admin", { "hong@kca.kr": snap({ role: "pmo" }) }));
  assert.deepEqual([down.status, down.applicable], ["not-dept", false]);
});
