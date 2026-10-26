import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_FILL_SCORE, COL, analyzeGrid, emailsOf, gridRowIn, type GridEnv, type GridRowIn } from "./grid.ts";
import type { ExistingSnapshot, TeamOption } from "./types.ts";

const T = (id: number, name: string, hq: string, cards = 3): TeamOption => ({ id, name, hq, cards });
const TEAMS = [T(1, "검사관리팀", "전파기반본부"), T(2, "검사기획팀", "전파기반본부", 8), T(6, "전파혁신전략팀", "차세대전파혁신단"), T(7, "전파혁신추진팀", "차세대전파혁신단")];
const snap = (o: Partial<ExistingSnapshot> = {}): ExistingSnapshot => ({ role: "dept_user", active: true, teamId: 2, displayName: "홍길동", ...o });

function env(known: Record<string, ExistingSnapshot | null> = {}, o: Partial<GridEnv> = {}): GridEnv {
  return { teams: TEAMS, existing: new Map(Object.entries(known)), actorRole: "pmo", allowedDomains: ["kca.kr"], ...o };
}
const row = (o: Partial<GridRowIn> = {}): GridRowIn => ({ name: "홍길동", email: "hong@kca.kr", teamText: "검사기획팀", role: "dept_user", team: "", pick: false, auto: "", ...o });
const seen = { "hong@kca.kr": null, "kim@kca.kr": null };

test("팀명이 정확히 같으면 팀 칸을 채우고 반영 체크까지 켠다(초록)", () => {
  const [o] = analyzeGrid([row()], env(seen));
  assert.deepEqual([o.team, o.auto, o.pick, o.teamTone, o.status, o.applicable], ["2", "2", true, "ok", "신규", true]);
  assert.ok(o.hint.startsWith("✔"));
  assert.deepEqual(o.input, { line: 1, name: "홍길동", email: "hong@kca.kr", teamId: 2, role: "dept_user" });
});

test("끝말만 다른 추천(0.9 이상)은 팀 칸에 미리 채우되 노랑·체크는 꺼 둔다", () => {
  const [o] = analyzeGrid([row({ teamText: "검사기획" })], env(seen));
  assert.deepEqual([o.team, o.pick, o.teamTone, o.status], ["2", false, "warn", "신규"]);
  assert.match(o.hint, /검사기획팀 97%/);
});

test("점수가 낮은 추천은 팀 칸을 비워 두고 후보만 보여 준다(팀 선택 필요)", () => {
  const [o] = analyzeGrid([row({ teamText: "검사기휙팀" })], env(seen));
  assert.ok(0.5 < AUTO_FILL_SCORE);
  assert.deepEqual([o.team, o.pick, o.teamTone, o.status, o.applicable, o.input], ["", false, "warn", "팀 선택 필요", false, null]);
  assert.match(o.hint, /검사기획팀 50%/);
});

test("비슷한 이름의 팀(전략/추진)은 미리 채우지 않는다", () => {
  const [o] = analyzeGrid([row({ teamText: "전파혁신팀" })], env(seen));
  assert.equal(o.team, "");
  assert.match(o.hint, /전파혁신전략팀/);
  assert.match(o.hint, /전파혁신추진팀/);
});

test("「추천 1순위」는 분명히 앞선 후보만 내놓는다(본부만 적힌 줄·전략/추진처럼 점수가 같거나 붙어 있으면 없음)", () => {
  const out = (teamText: string) => analyzeGrid([row({ teamText })], env(seen))[0].suggest;
  assert.equal(out("검사기휙팀"), "2", "후보가 하나면 그 팀");
  assert.equal(out("전파기반본부"), "", "같은 점수의 팀이 여럿이면 고르지 않음");
  assert.equal(out("전파혁신팀"), "", "전략/추진이 붙어 있으면 고르지 않음");
  assert.equal(out("재무회계"), "");
});

test("사람이 고른 팀은 팀명 글이 바뀌어도 그대로 두고, 자동으로 채운 팀은 글을 따라간다", () => {
  const touched = analyzeGrid([row({ teamText: "검사기획팀", team: "1", auto: "2", pick: true })], env(seen))[0];
  assert.deepEqual([touched.team, touched.pick, touched.teamTone], ["1", true, "ok"]);
  const follow = analyzeGrid([row({ teamText: "검사관리팀", team: "2", auto: "2", pick: false })], env(seen))[0];
  assert.deepEqual([follow.team, follow.auto, follow.pick], ["1", "1", true]);
});

test("분석 결과를 다시 입력으로 넣어도 그대로다(멱등)", () => {
  const inputs = [row(), row({ name: "김영희", email: "kim@kca.kr", teamText: "검사기획" }), row({ name: "", email: "", teamText: "" })];
  const once = analyzeGrid(inputs, env(seen));
  const again = analyzeGrid(
    inputs.map((r, i) => ({ ...r, team: once[i].team, auto: once[i].auto, pick: once[i].pick })),
    env(seen),
  );
  assert.deepEqual(again, once);
});

test("빈 줄은 계산하지 않는다", () => {
  const [o] = analyzeGrid([row({ name: "", email: "", teamText: "" })], env());
  assert.deepEqual([o.blank, o.team, o.pick, o.status, o.input], [true, "", false, "", null]);
});

test("기존 계정 조회 전에는 「확인 중」, 조회 뒤에는 성과관리팀·변경·중복 판정", () => {
  assert.equal(analyzeGrid([row()], env({}))[0].status, "확인 중…");
  assert.equal(analyzeGrid([row()], env({}))[0].applicable, false);
  assert.equal(analyzeGrid([row()], env({ "hong@kca.kr": snap({ role: "pmo" }) }))[0].status, "성과관리팀·관리자");
  assert.equal(analyzeGrid([row()], env({ "hong@kca.kr": snap({ teamId: 1 }) }))[0].status, "변경");
  const dup = analyzeGrid([row(), row({ name: "홍길동2" })], env(seen));
  assert.deepEqual(dup.map((o) => o.status), ["신규", "중복"]);
});

test("팀 칸이 비면 조회 전이어도 「팀 선택 필요」를 바로 보여 준다", () => {
  assert.equal(analyzeGrid([row({ teamText: "알 수 없는 팀" })], env({}))[0].status, "팀 선택 필요");
});

test("gridRowIn·emailsOf: 격자 배열을 읽고 조회할 이메일만 모은다", () => {
  const r = gridRowIn(["홍길동", "Hong@KCA.kr", "검사기획팀", "pmo", "2", "", "신규", true, "2"]);
  assert.deepEqual([r.name, r.role, r.team, r.pick, r.auto], ["홍길동", "pmo", "2", true, "2"]);
  assert.equal(COL.auto, 8);
  assert.deepEqual(emailsOf([r, row({ email: "hong@kca.kr" }), row({ email: "나쁜메일" })]), ["hong@kca.kr"]);
});

test("성과관리팀 권한 줄: 팀이 없어도 반영할 수 있고(팀 선택 필요·노랑 없음), 추천은 채우지 않고 정확히 같을 때만 팀을 넣는다", () => {
  const admin = env(seen, { actorRole: "admin" });
  const none = analyzeGrid([row({ role: "pmo", teamText: "AI디지털심화팀", pick: true })], admin)[0];
  assert.deepEqual([none.role, none.roleTone, none.team, none.teamTone, none.status, none.applicable, none.pick], ["pmo", "info", "", "", "신규", true, true]);
  assert.deepEqual(none.input, { line: 1, name: "홍길동", email: "hong@kca.kr", teamId: null, role: "pmo" });
  assert.match(none.hint, /팀 없이 등록/);
  const fuzzy = analyzeGrid([row({ role: "pmo", teamText: "검사기획" })], admin)[0];
  assert.deepEqual([fuzzy.team, fuzzy.suggest, fuzzy.teamTone], ["", "", ""], "성과관리팀 줄은 추천 팀을 미리 채우지 않음");
  const exact = analyzeGrid([row({ role: "pmo", teamText: "검사기획팀" })], admin)[0];
  assert.deepEqual([exact.team, exact.teamTone, exact.input?.teamId], ["2", "ok", 2]);
});

test("성과관리팀 권한은 관리자만: 성과관리팀 사용자가 보내면 「관리자만 가능」으로 건너뜀", () => {
  const o = analyzeGrid([row({ role: "pmo" })], env(seen, { actorRole: "pmo" }))[0];
  assert.deepEqual([o.status, o.applicable, o.input], ["관리자만 가능", false, null]);
});

test("권한 칸이 비어 있으면 부서 담당자로 본다(빈 줄은 권한도 비움)", () => {
  assert.equal(analyzeGrid([row({ role: "" })], env(seen))[0].role, "dept_user");
  assert.equal(analyzeGrid([row({ name: "", email: "", teamText: "", role: "dept_user" })], env())[0].role, "");
});
