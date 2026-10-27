// supabase/migrations를 PGlite(WASM Postgres)에 실제로 적용하고, 적재와 역할별 권한(RLS)을 확인합니다.
// Supabase가 제공하는 auth·storage 스키마와 역할은 최소한으로 흉내 냅니다. PGroonga 검색 마이그레이션은 건너뜁니다
// (호스티드 Supabase에서 확인할 항목).

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { readSeedInput } from "./seed-files.ts";
import { SUPABASE_STUB } from "./supabase-stub.ts";
import { buildSeedRows } from "./seed-rows.ts";
import { HAS_SEED_CARDS, NO_SEED_CARDS } from "../testing/originals.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const MIGRATIONS = join(ROOT, "supabase/migrations");
const SKIP = [/_search(_\w+)?\.sql$/];

let db: PGlite;
// 카드 59장 원본(seed/cards — git 밖)으로 팀·카드를 채운 DB 위에서 모든 시험이 돌므로, 원본이 없으면 DB를 만들지 않고 시험 전부를 건너뜀
const seed = HAS_SEED_CARDS ? readSeedInput(ROOT) : ({} as ReturnType<typeof readSeedInput>);
const rows = HAS_SEED_CARDS ? buildSeedRows(seed) : ({} as ReturnType<typeof buildSeedRows>);
const users = {
  inspector: "00000000-0000-0000-0000-000000000001", // 검사기획팀 담당자
  license: "00000000-0000-0000-0000-000000000002", // 자격기획팀 담당자
  pmo: "00000000-0000-0000-0000-000000000003",
  admin: "00000000-0000-0000-0000-000000000004",
};

async function insertJson(table: string, list: Array<Record<string, unknown>>, columns?: string[]) {
  if (list.length === 0) return;
  const cols = columns ?? Object.keys(list[0]);
  const colList = cols.map((c) => `"${c}"`).join(", ");
  await db.query(`insert into ${table} (${colList}) select ${colList} from jsonb_populate_recordset(null::${table}, $1::jsonb)`, [JSON.stringify(list)]);
}

/** 사용자로 한 번 실행(세션 설정 후 원래대로) */
async function as<T>(user: keyof typeof users, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [users[user]]);
  await db.exec("set role authenticated");
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** 부서 담당자 시험 계정에 자기 팀의 활성 과제를 모두 지정 — 사용자 화면의 「팀 과제 자동 매칭」을 켠 상태. 부서 담당자는 지정된 과제만 보므로 대부분의 시험이 이 상태에서 시작 */
async function assignTeams() {
  await db.query(
    `insert into public.card_assignees (card_id, user_id)
     select c.id, p.id from public.profiles p join public.cards c on c.team_id = p.team_id
     where p.role = 'dept_user' and p.active and c.status = 'active' on conflict do nothing`,
  );
}

/** 작성본 시험 자료: 그 카드 원장의 식별 칸(id·group·taskNo)만 든 JSON — 새 작성본은 식별 칸이 원장과 같아야 함(20261010120000). $1 = 카드 id */
const DRAFT_IDS = "(select jsonb_build_object('id', c.data -> 'id', 'group', c.data -> 'group', 'taskNo', c.data -> 'taskNo') from public.cards c where c.id = $1)";

async function count(sql: string, params: unknown[] = []): Promise<number> {
  const r = await db.query<{ n: number }>(`select count(*)::int as n from (${sql}) q`, params);
  return r.rows[0].n;
}

async function rejects(fn: () => Promise<unknown>, pattern: RegExp) {
  await assert.rejects(fn, (e: Error) => pattern.test(e.message));
}

before(async () => {
  if (!HAS_SEED_CARDS) return;
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !SKIP.some((s) => s.test(f))).sort();
  for (const f of files) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));

  await insertJson("public.teams", rows.teams);
  await insertJson("public.eval_units", rows.evalUnits);
  const teamIds = new Map((await db.query<{ id: number; name: string }>("select id, name from public.teams")).rows.map((r) => [r.name, r.id]));
  await insertJson(
    "public.cards",
    rows.cards.map(({ team_name, ...c }) => ({ ...c, team_id: team_name ? teamIds.get(team_name) : null })),
  );
  if (seed.knowledgeAvailable) {
    await insertJson("public.knowledge_documents", rows.documents);
    await insertJson("public.knowledge_chunks", rows.chunks as unknown as Array<Record<string, unknown>>);
    await insertJson("public.card_knowledge_scope", rows.scope);
    await insertJson("public.task_map", rows.taskMap);
  }

  // 사용자: 가입 트리거가 프로필을 만들고, 관리자 권한(여기서는 postgres)으로 역할·부서 지정
  for (const [name, id] of Object.entries(users)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@kca.test`]);
  }
  await db.query("update public.profiles set team_id = $1 where id = $2", [teamIds.get("검사기획팀"), users.inspector]);
  await db.query("update public.profiles set team_id = $1 where id = $2", [teamIds.get("자격기획팀"), users.license]);
  await db.query("update public.profiles set role = 'pmo' where id = $1", [users.pmo]);
  await db.query("update public.profiles set role = 'admin' where id = $1", [users.admin]);
  await assignTeams();
});

after(async () => {
  await db?.close();
});

test("마이그레이션 적용과 적재", { skip: NO_SEED_CARDS }, async () => {
  assert.equal(await count("select 1 from public.cards"), 59);
  assert.equal(await count("select 1 from public.cards where original_html is not null"), 59, "카드마다 원본 양식 조각");
  assert.equal(await count("select 1 from public.profiles"), 4, "가입 트리거");
  assert.equal(await count("select 1 from storage.buckets"), 5, "knowledge·card-materials·card-originals·report-materials·card-imports");
  if (seed.knowledgeAvailable) {
    assert.equal(await count("select 1 from public.knowledge_chunks"), rows.chunks.length);
    assert.equal(await count("select 1 from public.task_map"), 59);
    assert.ok((await count("select 1 from public.card_knowledge_scope where status = 'auto'")) > 0);
  }
});

test("부서 담당자는 지정된 과제만(같은 팀이어도 지정 안 된 과제·주관 부서의 다른 카드는 안 보임), 성과관리팀·관리자는 모든 과제", { skip: NO_SEED_CARDS }, async () => {
  const own = await count("select 1 from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀'");
  assert.ok(own > 1 && own < 59);
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), own, "팀 과제를 모두 지정하면 팀 과제 전체");
  assert.equal(await as("pmo", () => count("select 1 from public.cards")), 59);
  assert.equal(await as("admin", () => count("select 1 from public.cards")), 59);

  // 지정을 한 장으로 줄이면 그 한 장만
  const [keep, ...rest] = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' order by c.id")).rows.map((r) => r.id);
  await db.query("delete from public.card_assignees where user_id = $1 and card_id <> $2", [users.inspector, keep]);
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 1);
  assert.equal(await as("inspector", () => count("select 1 from public.cards where id = $1", [keep])), 1);
  assert.equal(await as("inspector", () => count("select 1 from public.cards where id = $1", [rest[0]])), 0, "같은 팀이어도 지정 안 된 과제는 안 보임");
  assert.equal(await as("license", () => count("select 1 from public.cards")), await count("select 1 from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀'"), "다른 담당자의 지정은 그대로");
  // 지정 안 된 같은 팀 과제에는 쓰지도 못함
  const ins = `insert into public.card_versions (card_id, period, version, status, data) values ($1, '2026-09', 1, 'draft', coalesce(${DRAFT_IDS}, '{}'))`;
  await rejects(() => as("inspector", () => db.query(ins, [rest[0]])), /row-level security/);
  await as("inspector", () => db.query(ins, [keep]));
  await db.query("delete from public.card_versions where card_id = $1", [keep]);

  // 주관 부서로 지정해도 예외 없음(그 사업의 다른 카드를 읽지 못함)
  await db.query("update public.eval_units set lead_team_id = (select id from public.teams where name = '검사기획팀') where id = 'BZ-1'");
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 1);
  await db.query("update public.eval_units set lead_team_id = null where id = 'BZ-1'");

  // 보관한 카드는 지정돼 있어도 안 보임, 사용 중지·지정 해제도 마찬가지
  await db.query("update public.cards set status = 'retired' where id = $1", [keep]);
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 0);
  await db.query("update public.cards set status = 'active' where id = $1", [keep]);
  await db.query("update public.profiles set active = false where id = $1", [users.inspector]);
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 0, "사용 중지된 계정");
  await db.query("update public.profiles set active = true where id = $1", [users.inspector]);
  await db.query("delete from public.card_assignees where user_id = $1", [users.inspector]);
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 0, "지정이 없으면 아무 과제도 안 보임");
  await assignTeams();
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), own);
});

test("월별 작성본: 자기 카드만 작성, 확정은 성과관리팀", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const other = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0].id;
  const insert = `insert into public.card_versions (card_id, period, version, status, data) values ($1, '2026-09', $2, $3, coalesce(${DRAFT_IDS}, '{}')) returning id`;

  const draft = await as("inspector", () => db.query<{ id: number }>(insert, [own, 1, "submitted"]));
  await rejects(() => as("inspector", () => db.query(insert, [other, 1, "draft"])), /row-level security/);
  await rejects(() => as("inspector", () => db.query(insert, [own, 2, "confirmed"])), /성과관리팀/);
  await rejects(
    () => as("inspector", () => db.query("update public.card_versions set status = 'confirmed' where id = $1", [draft.rows[0].id])),
    /성과관리팀/,
  );
  await as("pmo", () => db.query("update public.card_versions set status = 'confirmed' where id = $1", [draft.rows[0].id]));
  assert.equal(await count("select 1 from public.card_versions where status = 'confirmed'"), 1);
  // 다른 부서 담당자는 보지도 못함
  assert.equal(await as("license", () => count("select 1 from public.card_versions")), 0);
});

test("서비스 키(service_role)는 역할·부서를 지정할 수 있다(초기 관리자 지정 스크립트)", { skip: NO_SEED_CARDS }, async () => {
  // 앞선 테스트가 관리자 권한으로 가드 함수를 이미 컴파일해 두었으면 권한 검사가 생략되므로 계획을 비웁니다
  // (호스티드는 요청마다 새 연결이라 이 검사가 일어남).
  await db.exec("discard all");
  await db.exec("set role service_role");
  try {
    await db.query("update public.profiles set role = 'pmo' where id = $1", [users.license]);
    await db.query("update public.profiles set role = 'dept_user' where id = $1", [users.license]);
  } finally {
    await db.exec("reset role");
  }
});

test("역할·부서는 관리자만 바꾼다", { skip: NO_SEED_CARDS }, async () => {
  await rejects(() => as("inspector", () => db.query("update public.profiles set role = 'admin' where id = $1", [users.inspector])), /관리자만/);
  await as("inspector", () => db.query("update public.profiles set display_name = '검사 담당' where id = $1", [users.inspector]));
  // 성과관리팀은 부서 담당자의 부서·활성은 바꾸지만(아래 테스트) 역할은 못 바꿈 — 가드 트리거가 막음
  await rejects(() => as("pmo", () => db.query("update public.profiles set role = 'admin' where id = $1", [users.license])), /관리자만/);
  assert.equal((await db.query<{ role: string }>("select role from public.profiles where id = $1", [users.license])).rows[0].role, "dept_user");
  await as("admin", () => db.query("update public.profiles set role = 'dept_user' where id = $1", [users.license]));
  assert.equal(await as("license", () => count("select 1 from public.profiles")), 1, "담당자는 자기 프로필만");
});

test("마지막 활성 관리자(2026-10-10 개선 계획 P2-5): 역할을 낮추거나 사용 중지해 활성 관리자가 0명이 되면 거절 — 서비스 키도, 다른 관리자가 있으면 됨", { skip: NO_SEED_CARDS }, async () => {
  await rejects(() => as("admin", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.admin])), /마지막 활성 관리자/);
  await rejects(() => as("admin", () => db.query("update public.profiles set active = false where id = $1", [users.admin])), /마지막 활성 관리자/);
  await db.exec("set role service_role");
  try {
    await rejects(() => db.query("update public.profiles set role = 'dept_user' where id = $1", [users.admin]), /마지막 활성 관리자/);
  } finally {
    await db.exec("reset role");
  }
  // 다른 활성 관리자가 있으면 낮출 수 있음, 사용 중지된 관리자는 셈에 안 들어감
  await as("admin", () => db.query("update public.profiles set role = 'admin' where id = $1", [users.pmo]));
  await as("admin", () => db.query("update public.profiles set active = false where id = $1", [users.pmo]));
  await rejects(() => as("admin", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.admin])), /마지막 활성 관리자/);
  await as("admin", () => db.query("update public.profiles set active = true where id = $1", [users.pmo]));
  await as("admin", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.admin]));
  // 원래대로(성과관리팀이 된 원래 관리자를 남은 관리자가 되돌리고, 남은 관리자를 다시 성과관리팀으로)
  await as("pmo", () => db.query("update public.profiles set role = 'admin' where id = $1", [users.admin]));
  await as("admin", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.pmo]));
  assert.deepEqual((await db.query<{ role: string }>("select role from public.profiles where id in ($1, $2) order by id", [users.pmo, users.admin])).rows.map((r) => r.role), ["pmo", "admin"]);
});

const cardOf = async (team: string) =>
  (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = $1 and c.status = 'active' order by c.id limit 1", [team])).rows[0].id;

test("담당자 계정 관리: 성과관리팀은 부서 담당자의 이름·부서·활성만 바꾸고, 역할·성과관리팀·관리자 행·메일은 못 바꾼다", { skip: NO_SEED_CARDS }, async () => {
  const qi = await teamId("검사기획팀");
  const lic = await teamId("자격기획팀");
  // 부서 담당자의 부서·활성·이름
  const moved = await as("pmo", () => db.query("update public.profiles set team_id = $1, display_name = '이동' where id = $2", [qi, users.license]));
  assert.equal(moved.affectedRows, 1);
  await as("pmo", () => db.query("update public.profiles set active = false where id = $1", [users.license]));
  await as("pmo", () => db.query("update public.profiles set active = true, team_id = $1 where id = $2", [lic, users.license]));
  // 역할 승격·성과관리팀 행·관리자 행·본인 행·메일은 안 됨
  await rejects(() => as("pmo", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.license])), /관리자만/);
  assert.equal((await as("pmo", () => db.query("update public.profiles set team_id = $1 where id = $2", [qi, users.admin]))).affectedRows, 0, "관리자 행은 걸러짐");
  await rejects(() => as("pmo", () => db.query("update public.profiles set team_id = $1 where id = $2", [qi, users.pmo])), /관리자만/);
  await rejects(() => as("pmo", () => db.query("update public.profiles set email = 'x@kca.test' where id = $1", [users.license])), /식별/);
  // 담당자는 자기 부서·메일을 못 바꿈, 관리자는 바꿈
  await rejects(() => as("inspector", () => db.query("update public.profiles set team_id = $1 where id = $2", [lic, users.inspector])), /관리자만/);
  await rejects(() => as("inspector", () => db.query("update public.profiles set email = 'y@kca.test' where id = $1", [users.inspector])), /식별/);
  await as("admin", () => db.query("update public.profiles set team_id = $1 where id = $2", [lic, users.license]));
});

test("과제 담당자(card_assignees): 성과관리팀이 같은 팀 활성 담당자만 지정하고, 담당자는 자기 행만 읽는다", { skip: NO_SEED_CARDS }, async () => {
  await db.query("delete from public.card_assignees"); // 앞의 시험이 채운 팀 전체 지정을 비우고 시작
  const own = await cardOf("검사기획팀");
  const other = await cardOf("자격기획팀");
  const add = "insert into public.card_assignees (card_id, user_id, assigned_by) values ($1, $2, $3)";
  await as("pmo", () => db.query(add, [own, users.inspector, users.pmo]));
  await as("pmo", () => db.query(add, [other, users.license, users.pmo]));
  assert.equal(await as("inspector", () => count("select 1 from public.card_assignees")), 1, "담당자는 자기 행만");
  assert.equal(await as("pmo", () => count("select 1 from public.card_assignees")), 2);
  // 다른 팀 과제·성과관리팀 계정·담당자 스스로 지정은 거절
  await rejects(() => as("pmo", () => db.query(add, [other, users.inspector, users.pmo])), /같은 부서/);
  await rejects(() => as("pmo", () => db.query(add, [own, users.pmo, users.pmo])), /부서 담당자 계정만/);
  await rejects(() => as("inspector", () => db.query(add, [own, users.inspector, users.inspector])), /row-level security/);
  assert.equal((await as("inspector", () => db.query("delete from public.card_assignees where user_id = $1", [users.inspector]))).affectedRows, 0, "담당자는 지우지 못함(행이 걸러짐)");
  assert.equal(await count("select 1 from public.card_assignees"), 2);
  // 사용 중지된 계정은 지정 못 함(이미 있는 지정은 남음)
  await as("pmo", () => db.query("update public.profiles set active = false where id = $1", [users.license]));
  await rejects(() => as("pmo", () => db.query("insert into public.card_assignees (card_id, user_id) values ($1, $2) on conflict do nothing", [other, users.license])), /사용 중지/);
  await as("pmo", () => db.query("update public.profiles set active = true where id = $1", [users.license]));
});

test("과제 담당자: 사용자의 팀이 바뀌거나 카드의 팀이 바뀌면 어긋난 지정은 지워진다", { skip: NO_SEED_CARDS }, async () => {
  const qi = await teamId("검사기획팀");
  const lic = await teamId("자격기획팀");
  const own = await cardOf("검사기획팀");
  const count0 = (sql: string, p: unknown[]) => count(sql, p);
  assert.equal(await count0("select 1 from public.card_assignees where user_id = $1", [users.inspector]), 1);
  // 사용자 팀 이동 → 그 사용자의 지정 삭제
  await as("pmo", () => db.query("update public.profiles set team_id = $1 where id = $2", [lic, users.inspector]));
  assert.equal(await count0("select 1 from public.card_assignees where user_id = $1", [users.inspector]), 0);
  await as("pmo", () => db.query("update public.profiles set team_id = $1 where id = $2", [qi, users.inspector]));
  // 카드 팀 이동 → 그 카드의 지정 삭제
  await as("pmo", () => db.query("insert into public.card_assignees (card_id, user_id) values ($1, $2)", [own, users.inspector]));
  await db.query("update public.cards set team_id = $1 where id = $2", [lic, own]);
  assert.equal(await count0("select 1 from public.card_assignees where card_id = $1", [own]), 0);
  await db.query("update public.cards set team_id = $1 where id = $2", [qi, own]);
  await db.query("delete from public.card_assignees");
});

test("성과관리팀 승격(붙여넣기 등록의 권한 열): 관리자만 부서 담당자를 성과관리팀으로 올리고, 올리면 담당 과제 지정이 지워진다", { skip: NO_SEED_CARDS }, async () => {
  const own = await cardOf("검사기획팀");
  await as("pmo", () => db.query("insert into public.card_assignees (card_id, user_id) values ($1, $2) on conflict do nothing", [own, users.inspector]));
  assert.equal(await count("select 1 from public.card_assignees where user_id = $1", [users.inspector]), 1);
  await rejects(() => as("pmo", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.inspector])), /관리자만/);
  await rejects(() => as("inspector", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.inspector])), /관리자만/);
  await as("admin", () => db.query("update public.profiles set role = 'pmo' where id = $1", [users.inspector]));
  assert.equal(await count("select 1 from public.card_assignees where user_id = $1", [users.inspector]), 0, "권한이 바뀌면 담당 과제 지정은 지워짐");
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 59, "성과관리팀이 되면 모든 과제를 봄");
  await as("admin", () => db.query("update public.profiles set role = 'dept_user' where id = $1", [users.inspector]));
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), 0, "부서 담당자로 돌아오면 지정이 없어 아무 과제도 안 보임");
  await assignTeams(); // 뒤의 시험을 위해 팀 과제 전체 지정을 되돌림
  assert.ok((await as("inspector", () => count("select 1 from public.cards"))) < 59);
});

test("권한 변경 기록(access_events): 성과관리팀이 자기 이름으로 남기고 읽는다, 담당자는 못 본다", { skip: NO_SEED_CARDS }, async () => {
  const ins = "insert into public.access_events (actor_id, target_user_id, action, detail) values ($1, $2, 'user_added', '{}'::jsonb)";
  await as("pmo", () => db.query(ins, [users.pmo, users.license]));
  await rejects(() => as("pmo", () => db.query(ins, [users.admin, users.license])), /row-level security/);
  await rejects(() => as("inspector", () => db.query(ins, [users.inspector, users.license])), /row-level security/);
  assert.equal(await as("pmo", () => count("select 1 from public.access_events")), 1);
  assert.equal(await as("inspector", () => count("select 1 from public.access_events")), 0);
});

test("본부 표기 정정(20260930120000): 방송콘텐츠진흥팀의 방송미디어부만 방송미디어본부로 바뀌고 여러 번 돌려도 같다", { skip: NO_SEED_CARDS }, async () => {
  const sql = readFileSync(join(MIGRATIONS, "20260930120000_users_assignees.sql"), "utf8");
  const fix = sql.split("\n").filter((l) => l.startsWith("update public.teams set hq")).join("\n");
  assert.ok(fix, "정정 문장이 있어야 함");
  const hqOf = async (name: string) => (await db.query<{ hq: string }>("select hq from public.teams where name = $1", [name])).rows[0].hq;
  const before = await hqOf("검사기획팀");
  await db.query("update public.teams set hq = '방송미디어부' where name = '방송콘텐츠진흥팀'");
  await db.exec(fix);
  await db.exec(fix);
  assert.equal(await hqOf("방송콘텐츠진흥팀"), "방송미디어본부");
  assert.equal(await hqOf("검사기획팀"), before);
  // 다시 적재해도 되돌아가지 않게 시드 변환에도 같은 정정이 있음
  assert.equal(rows.teams.find((t) => t.name === "방송콘텐츠진흥팀")?.hq, "방송미디어본부");
});

test("월간 점검: 보낸 결과만 부서에 보이고, 부서는 확인만", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const r = await as("pmo", () => db.query<{ id: number }>("insert into public.inspections (card_id, period, result) values ($1, '2026-09', '{\"summary\":\"점검\"}') returning id", [own]));
  const id = r.rows[0].id;
  assert.equal(await as("inspector", () => count("select 1 from public.inspections")), 0, "draft는 안 보임");
  await as("pmo", () => db.query("update public.inspections set status = 'sent' where id = $1", [id]));
  assert.equal(await as("inspector", () => count("select 1 from public.inspections")), 1);
  await rejects(() => as("inspector", () => db.query("update public.inspections set status = 'acknowledged', result = '{}' where id = $1", [id])), /성과관리팀만/);
  // 보낸 점검표는 성과관리팀도 내용을 못 고침(20261027100000 — 예전에는 서버 액션만 막았음): 상태만 그대로 두든, 보내기 취소와 함께든
  for (const sql of ["update public.inspections set result = '{\"summary\":\"고침\"}' where id = $1", "update public.inspections set model = 'x', knowledge_keys = '{k}' where id = $1", "update public.inspections set status = 'draft', result = '{}' where id = $1"]) {
    await rejects(() => as("pmo", () => db.query(sql, [id])), /보내기를 취소한 뒤/);
  }
  assert.equal((await db.query<{ s: string }>("select result->>'summary' as s from public.inspections where id = $1", [id])).rows[0].s, "점검", "내용 그대로");
  // 보내기 취소(상태만 → 초안)는 허용, 초안은 고칠 수 있고 다시 보낼 수 있음
  await as("pmo", () => db.query("update public.inspections set status = 'draft' where id = $1", [id]));
  assert.equal(await as("inspector", () => count("select 1 from public.inspections")), 0, "취소한 점검표는 부서에 안 보임");
  await as("pmo", () => db.query("update public.inspections set result = '{\"summary\":\"점검\"}', model = 'manual' where id = $1", [id]));
  await as("pmo", () => db.query("update public.inspections set status = 'sent' where id = $1", [id]));
  // 부서의 확인(상태만 → acknowledged)은 보낸 점검표에서 허용
  await as("inspector", () => db.query("update public.inspections set status = 'acknowledged' where id = $1", [id]));
  // 부서가 확인한 점검표는 성과관리팀도 못 고침(2026-10-10 개선 계획 P1-2 — 예전에는 성과관리팀 직접 호출이면 뚫렸음), 서비스 키는 막지 않음
  await rejects(() => as("pmo", () => db.query("update public.inspections set result = '{}' where id = $1", [id])), /확인한 점검표/);
  await rejects(() => as("pmo", () => db.query("update public.inspections set status = 'draft' where id = $1", [id])), /확인한 점검표/);
  await db.query("update public.inspections set model = 'svc' where id = $1", [id]);
  await db.query("delete from public.inspections where id = $1", [id]);
});

test("카드 전용 자료 파일: 자기 카드 폴더에만 올린다", { skip: NO_SEED_CARDS }, async () => {
  const [own, other] = (
    await db.query<{ uid: string; team: string }>(
      "select c.uid::text as uid, t.name as team from public.cards c join public.teams t on t.id = c.team_id where t.name in ('검사기획팀', '자격기획팀') order by t.name = '검사기획팀' desc limit 100",
    )
  ).rows.reduce<string[]>((acc, r) => {
    if (r.team === "검사기획팀" && !acc[0]) acc[0] = r.uid;
    if (r.team === "자격기획팀" && !acc[1]) acc[1] = r.uid;
    return acc;
  }, []);
  const put = "insert into storage.objects (bucket_id, name) values ('card-materials', $1)";
  await as("inspector", () => db.query(put, [`${own}/a.pdf`]));
  await rejects(() => as("inspector", () => db.query(put, [`${other}/b.pdf`])), /row-level security/);
  assert.equal(await as("license", () => count("select 1 from storage.objects where bucket_id = 'card-materials'")), 0);
  await rejects(() => as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('knowledge', 'x/y.pdf')")), /row-level security/);
});

test("첨부 읽은 글(참고자료 1단계): 쓸 수 있는 사람만 읽은 글 칸을 채우고, 파일 경로·소속은 못 바꾼다", { skip: NO_SEED_CARDS }, async () => {
  const team = async (name: string) => (await db.query<{ id: number }>("select id from public.teams where name = $1", [name])).rows[0].id;
  const insp = await team("검사기획팀");
  const lic = await team("자격기획팀");
  const card = async (name: string) => (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = $1 limit 1", [name])).rows[0].id;
  const own = await card("검사기획팀");
  const other = await card("자격기획팀");
  const parsed = "set parsed_text = '전체 글', parse_status = 'parsed', parser_version = 'v', parsed_at = now(), parse_error = null, parsed_chars = 4, sha256 = 'h'";

  // 카드 전용 자료: 올릴 때 읽은 글을 함께 넣고, 판이 바뀌면 자기 카드 것만 다시 채움
  const cm = (await as("inspector", () => db.query<{ id: string }>("insert into public.card_materials (card_id, storage_path, file_name, uploaded_by, parsed_text, parse_status, parser_version, parsed_chars) values ($1, 'x/a.hwp', 'a.hwp', $2, '글', 'parsed', 'v0', 1) returning id", [own, users.inspector]))).rows[0].id;
  const cmOther = (await db.query<{ id: string }>("insert into public.card_materials (card_id, storage_path, file_name) values ($1, 'y/b.hwp', 'b.hwp') returning id", [other])).rows[0].id;
  assert.equal((await as("inspector", () => db.query(`update public.card_materials ${parsed} where id = $1`, [cm]))).affectedRows, 1);
  assert.equal((await as("inspector", () => db.query(`update public.card_materials ${parsed} where id = $1`, [cmOther]))).affectedRows, 0, "남의 카드 자료는 못 채움");
  await rejects(() => as("inspector", () => db.query("update public.card_materials set storage_path = 'y/b.hwp' where id = $1", [cm])), /permission denied/);
  await rejects(() => as("inspector", () => db.query("update public.card_materials set card_id = $2 where id = $1", [cm, other])), /permission denied/);

  // 보고서 추가자료: 그 보고서 내용을 고칠 수 있는 사람만(제출하면 부서는 못 채움)
  const insert = "insert into public.reports (eval_unit_id, year, team_id, created_by) values ('BZ-1', 2035, $1, $2) returning id";
  const mine = (await as("pmo", () => db.query<{ id: number }>(insert, [insp, users.pmo]))).rows[0].id;
  const theirs = (await as("pmo", () => db.query<{ id: number }>(insert, [lic, users.pmo]))).rows[0].id;
  const rm = (await as("inspector", () => db.query<{ id: string }>("insert into public.report_materials (report_id, storage_path, file_name, uploaded_by) values ($1, $2, 'a.pdf', $3) returning id", [mine, `${mine}/a.pdf`, users.inspector]))).rows[0].id;
  const rmTheirs = (await db.query<{ id: string }>("insert into public.report_materials (report_id, storage_path, file_name, uploaded_by) values ($1, $2, 'b.pdf', $3) returning id", [theirs, `${theirs}/b.pdf`, users.license])).rows[0].id;
  assert.equal((await db.query<{ parse_status: string }>("select parse_status from public.report_materials where id = $1", [rm])).rows[0].parse_status, "pending", "기본은 아직 안 읽음");
  assert.equal((await as("inspector", () => db.query(`update public.report_materials ${parsed} where id = $1`, [rm]))).affectedRows, 1);
  assert.equal((await as("inspector", () => db.query(`update public.report_materials ${parsed} where id = $1`, [rmTheirs]))).affectedRows, 0, "남의 부서 보고서 자료는 못 채움");
  await rejects(() => as("inspector", () => db.query("update public.report_materials set storage_path = $2 where id = $1", [rm, `${theirs}/b.pdf`])), /permission denied/);
  await rejects(() => as("inspector", () => db.query("update public.report_materials set report_id = $2 where id = $1", [rm, theirs])), /permission denied/);
  await rejects(() => as("inspector", () => db.query("update public.report_materials set parse_status = 'done' where id = $1", [rm])), /check/);
  await as("inspector", () => db.query("update public.reports set status = 'drafting' where id = $1", [mine])); // 전이 표: 작성 중을 거쳐 제출(2026-10-10)
  await as("inspector", () => db.query("update public.reports set status = 'submitted' where id = $1", [mine]));
  assert.equal((await as("inspector", () => db.query(`update public.report_materials ${parsed} where id = $1`, [rm]))).affectedRows, 0, "제출한 보고서는 부서가 못 채움");
  assert.equal((await as("pmo", () => db.query(`update public.report_materials ${parsed} where id = $1`, [rm]))).affectedRows, 1, "성과관리팀은 채움");
  // 뒤 테스트의 건수에 끼지 않게 치움
  await db.query("delete from public.report_materials where report_id in ($1, $2)", [mine, theirs]);
  await db.query("delete from public.reports where id in ($1, $2)", [mine, theirs]);
  await db.query("delete from public.card_materials where id in ($1, $2)", [cm, cmOther]);
});

test("AI 호출 기록: 캐시 쓰기 중 1시간 캐시 몫을 따로 남긴다", { skip: NO_SEED_CARDS }, async () => {
  await as("inspector", () => db.query("insert into public.ai_requests (user_id, feature, status, cache_write_tokens, cache_write_1h_tokens) values ($1, 'card_assist', 'ok', 10, 4)", [users.inspector]));
  assert.equal(await count("select 1 from public.ai_requests where cache_write_1h_tokens = 4"), 1);
  await db.query("delete from public.ai_requests where cache_write_1h_tokens = 4");
});

test("AI 호출 기록 진행 중·끝맺기(2026-10-10 개선 계획 P0-3): 자기 running 행만 ok·error로 끝내며 토큰·소요 시간을 채우고, 끝난 행·남의 행·user_id·feature는 못 고침", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.card_assignees a on a.card_id = c.id where a.user_id = $1 limit 1", [users.inspector])).rows[0].id;
  const ins = (who: keyof typeof users, card: string | null) => as(who, () => db.query<{ id: number }>("insert into public.ai_requests (user_id, card_id, feature, status) values ($1, $2, 'report_section', 'running') returning id", [users[who], card]));
  const id = (await ins("inspector", own)).rows[0].id;
  await as("inspector", () => db.query("update public.ai_requests set status = 'ok', output_tokens = 100, duration_ms = 1234, finished_at = now(), timings = '{\"call\": 1000}'::jsonb where id = $1", [id]));
  assert.equal(await count("select 1 from public.ai_requests where id = $1 and status = 'ok' and output_tokens = 100 and duration_ms = 1234 and timings->>'call' = '1000'", [id]), 1);
  // 끝난 행은 다시 못 고침(정책이 running만 — 0행)
  await as("inspector", () => db.query("update public.ai_requests set output_tokens = 1, status = 'error' where id = $1", [id]));
  assert.equal(await count("select 1 from public.ai_requests where id = $1 and output_tokens = 100 and status = 'ok'", [id]), 1);
  // 남의 running 행은 못 끝냄
  const other = (await ins("license", null)).rows[0].id;
  await as("inspector", () => db.query("update public.ai_requests set status = 'ok' where id = $1", [other]));
  assert.equal(await count("select 1 from public.ai_requests where id = $1 and status = 'running'", [other]), 1);
  // 식별 열(user_id·feature·card_id·mode)은 열 권한이 없어 거절
  const mine = (await ins("inspector", own)).rows[0].id;
  await rejects(() => as("inspector", () => db.query("update public.ai_requests set feature = 'card_chat' where id = $1", [mine])), /permission denied/);
  await rejects(() => as("inspector", () => db.query("update public.ai_requests set user_id = $2 where id = $1", [mine, users.license])), /permission denied/);
  // 상태 값은 running·ok·error만
  await rejects(() => as("inspector", () => db.query("update public.ai_requests set status = 'done' where id = $1", [mine])), /check constraint|violates/);
  await db.query("delete from public.ai_requests where id = any($1)", [[id, other, mine]]);
});

test("카드 원본 그림: 그 카드를 볼 수 있는 사람만 읽고, 담당자는 못 올린다", { skip: NO_SEED_CARDS }, async () => {
  const uids = (
    await db.query<{ uid: string; team: string }>(
      "select c.uid::text as uid, t.name as team from public.cards c join public.teams t on t.id = c.team_id where t.name in ('검사기획팀', '자격기획팀')",
    )
  ).rows;
  const own = uids.find((r) => r.team === "검사기획팀")!.uid;
  const other = uids.find((r) => r.team === "자격기획팀")!.uid;
  await db.query("insert into storage.objects (bucket_id, name) values ('card-originals', $1), ('card-originals', $2)", [`${own}/image_001.jpg`, `${other}/image_001.jpg`]);
  assert.equal(await as("inspector", () => count("select 1 from storage.objects where bucket_id = 'card-originals'")), 1);
  assert.equal(await as("pmo", () => count("select 1 from storage.objects where bucket_id = 'card-originals'")), 2);
  await rejects(() => as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('card-originals', $1)", [`${own}/x.png`])), /row-level security/);
});

test("카드 원장 수정: 성과관리팀만 고치고 이력을 남긴다", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  // 담당자는 원장을 못 고침(행이 걸러져 0건)과 이력도 못 남김
  const byDept = await as("inspector", () => db.query("update public.cards set progress = 50 where id = $1", [own]));
  assert.equal(byDept.affectedRows, 0);
  await rejects(
    () => as("inspector", () => db.query("insert into public.card_edits (card_id, edited_by, before, after) values ($1, $2, '{}', '{}')", [own, users.inspector])),
    /row-level security/,
  );
  const byPmo = await as("pmo", () => db.query("update public.cards set progress = 50, stage = 'Do', work_status = '진행중' where id = $1", [own]));
  assert.equal(byPmo.affectedRows, 1);
  await as("pmo", () => db.query("insert into public.card_edits (card_id, edited_by, before, after) values ($1, $2, '{}', '{}')", [own, users.pmo]));
  // 남의 이름으로 이력을 남길 수 없음
  await rejects(
    () => as("pmo", () => db.query("insert into public.card_edits (card_id, edited_by, before, after) values ($1, $2, '{}', '{}')", [own, users.admin])),
    /row-level security/,
  );
  await rejects(() => as("pmo", () => db.query("update public.cards set progress = 120 where id = $1", [own])), /check constraint/);
  assert.equal(await as("inspector", () => count("select 1 from public.card_edits")), 1, "담당자는 자기 카드 이력을 읽음");
  assert.equal(await as("license", () => count("select 1 from public.card_edits")), 0);
});

test("자동 저장 이력 병합·AI 사용 기록 권한", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const other = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0].id;
  const row = await as("pmo", () => db.query<{ id: number }>("insert into public.card_edits (card_id, edited_by, before, after) values ($1, $2, '{}', '{\"a\":1}') returning id", [own, users.pmo]));
  const upd = await as("pmo", () => db.query("update public.card_edits set after = '{\"a\":2}' where id = $1", [row.rows[0].id]));
  assert.equal(upd.affectedRows, 1, "본인 이력 행 갱신");
  const byAdmin = await as("admin", () => db.query("update public.card_edits set after = '{}' where id = $1", [row.rows[0].id]));
  assert.equal(byAdmin.affectedRows, 0, "남의 이력 행은 못 고침");
  // AI 기록: 볼 수 있는 카드만, 본인 이름으로만
  await as("inspector", () => db.query("insert into public.ai_requests (user_id, card_id, feature, status) values ($1, $2, 'card_assist', 'ok')", [users.inspector, own]));
  await rejects(() => as("inspector", () => db.query("insert into public.ai_requests (user_id, card_id, feature, status) values ($1, $2, 'card_assist', 'ok')", [users.inspector, other])), /row-level security/);
  await rejects(() => as("inspector", () => db.query("insert into public.ai_requests (user_id, card_id, feature, status) values ($1, $2, 'card_assist', 'ok')", [users.license, own])), /row-level security/);
  assert.equal(await as("license", () => count("select 1 from public.ai_requests")), 0);
  assert.equal(await as("pmo", () => count("select 1 from public.ai_requests")), 1);
});

test("공통 지식: 모두 읽고, 성과관리팀만 쓴다. anon은 아무것도 못 읽음", { skip: NO_SEED_CARDS }, async () => {
  assert.equal(await as("inspector", () => count("select 1 from public.eval_units")), rows.evalUnits.length); // 주요사업 4 + 시드 조각이 가리키는 경영관리 지표
  await rejects(
    () => as("inspector", () => db.query("insert into public.knowledge_documents (doc_id, title, file_name) values ('x', 'x', 'x')")),
    /row-level security/,
  );
  await as("pmo", () => db.query("insert into public.knowledge_documents (doc_id, title, file_name) values ('x', 'x', 'x')"));
  if (seed.knowledgeAvailable) {
    assert.equal(await as("license", () => count("select 1 from public.knowledge_chunks")), rows.chunks.length);
    const visibleLinks = await as("inspector", () => count("select 1 from public.card_knowledge_scope"));
    assert.ok(visibleLinks < rows.scope.length, "대응표는 볼 수 있는 카드 것만");
  }
  await db.exec("set role anon");
  try {
    await rejects(() => db.query("select 1 from public.cards"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("월별 작성본: 제출하면 내용을 못 고치고, 제출 취소(또는 돌려받음) 뒤 고친다", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const v = await as("inspector", () =>
    db.query<{ id: number }>(`insert into public.card_versions (card_id, period, version, status, data, created_by) values ($1, '2026-10', 1, 'draft', ${DRAFT_IDS} || '{"a":1}', $2) returning id`, [own, users.inspector]),
  );
  const id = v.rows[0].id;
  await as("inspector", () => db.query("update public.card_versions set data = data || '{\"a\":2}' where id = $1", [id]));
  assert.ok((await db.query<{ updated_at: string | null }>("select updated_at from public.card_versions where id = $1", [id])).rows[0].updated_at, "고친 시각");
  await as("inspector", () => db.query("update public.card_versions set status = 'submitted', submitted_at = now(), submitted_by = $2 where id = $1", [id, users.inspector]));
  await rejects(() => as("inspector", () => db.query("update public.card_versions set data = data || '{\"a\":3}' where id = $1", [id])), /제출을 취소/);
  await rejects(() => as("inspector", () => db.query("update public.card_versions set confirmed_by = $2 where id = $1", [id, users.inspector])), /확정 정보/);
  await as("inspector", () => db.query("update public.card_versions set status = 'draft' where id = $1", [id]));
  await as("inspector", () => db.query("update public.card_versions set data = data || '{\"a\":3}' where id = $1", [id]));
  // 성과관리팀은 돌려보내며 메모를 남기고, 확정도 함
  await as("pmo", () => db.query("update public.card_versions set status = 'draft', note = '목표 대비 실적을 적어 주세요' where id = $1", [id]));
  await as("pmo", () => db.query("update public.card_versions set status = 'confirmed', confirmed_by = $2, confirmed_at = now() where id = $1", [id, users.pmo]));
  assert.equal(await count("select 1 from public.card_versions where id = $1 and status = 'confirmed'", [id]), 1);
});

test("경평 초안: 부서는 자기 보고서만 쓰고, 주관 부서는 그 사업 보고서를 읽고, 승인은 성과관리팀", { skip: NO_SEED_CARDS }, async () => {
  const team = async (name: string) => (await db.query<{ id: number }>("select id from public.teams where name = $1", [name])).rows[0].id;
  const insp = await team("검사기획팀");
  const lic = await team("자격기획팀");
  const insert = "insert into public.reports (eval_unit_id, year, team_id, created_by) values ('BZ-1', 2026, $1, $2) returning id";
  await rejects(() => as("inspector", () => db.query(insert, [insp, users.inspector])), /row-level security/);
  const mine = (await as("pmo", () => db.query<{ id: number }>(insert, [insp, users.pmo]))).rows[0].id;
  const theirs = (await as("pmo", () => db.query<{ id: number }>(insert, [lic, users.pmo]))).rows[0].id;

  assert.equal(await as("inspector", () => count("select 1 from public.reports")), 1);
  assert.equal(await as("pmo", () => count("select 1 from public.reports")), 2);
  // 준비 → 제출은 표 밖(전이 표 — 첫 초안이 생기면 트리거가 작성 중으로 바꿈): 작성 중을 거쳐 제출
  await rejects(() => as("inspector", () => db.query("update public.reports set status = 'submitted' where id = $1", [mine])), /바꿀 수 없는 상태/);
  await as("inspector", () => db.query("update public.reports set status = 'drafting' where id = $1", [mine]));
  await as("inspector", () => db.query("update public.reports set inputs = '{\"kpi\":{\"0\":\"12\"}}', status = 'submitted' where id = $1", [mine]));
  await rejects(() => as("inspector", () => db.query("update public.reports set status = 'approved' where id = $1", [mine])), /승인/);
  await rejects(() => as("inspector", () => db.query("update public.reports set team_id = $2 where id = $1", [mine, lic])), /식별/);
  const blocked = await as("inspector", () => db.query("update public.reports set inputs = '{}' where id = $1", [theirs]));
  assert.equal(blocked.affectedRows, 0, "남의 부서 보고서는 못 고침");

  // 주관 부서는 그 사업의 보고서를 모두 읽지만 고치지는 못함
  await db.query("update public.eval_units set lead_team_id = $1 where id = 'BZ-1'", [insp]);
  assert.equal(await as("inspector", () => count("select 1 from public.reports")), 2);
  assert.equal((await as("inspector", () => db.query("update public.reports set inputs = '{}' where id = $1", [theirs]))).affectedRows, 0);
  await db.query("update public.eval_units set lead_team_id = null where id = 'BZ-1'");

  // 코멘트: 볼 수 있는 보고서에만, 본인 이름으로
  await as("license", () => db.query("insert into public.report_comments (report_id, body, author_id) values ($1, '질문', $2)", [theirs, users.license]));
  await rejects(() => as("inspector", () => db.query("insert into public.report_comments (report_id, body, author_id) values ($1, 'x', $2)", [theirs, users.inspector])), /row-level security/);
  await as("pmo", () => db.query("insert into public.report_comments (report_id, anchor, kind, body, author_id) values ($1, 'b1', '수정', '수치 확인', $2)", [mine, users.pmo]));
  assert.equal(await as("inspector", () => count("select 1 from public.report_comments")), 1);
  const resolved = await as("inspector", () => db.query("update public.report_comments set status = 'resolved', resolved_by = $2, resolved_at = now() where report_id = $1", [mine, users.pmo]));
  assert.equal(resolved.affectedRows, 1, "작성 부서가 코멘트를 해결 처리");
  const who = (await db.query<{ resolved_by: string }>("select resolved_by from public.report_comments where report_id = $1", [mine])).rows[0].resolved_by;
  assert.equal(who, users.inspector, "해결한 사람은 로그인 사용자로 기록(남의 이름을 못 넣음)");
  await rejects(() => as("inspector", () => db.query("update public.report_comments set body = '바꿈' where report_id = $1", [mine])), /permission denied/);
  await rejects(() => as("inspector", () => db.query("update public.report_comments set author_id = $2 where report_id = $1", [mine, users.inspector])), /permission denied/);

  // 제출한 보고서: 부서는 내용·추가자료를 못 바꿈(제출 취소 뒤 고침)
  await rejects(() => as("inspector", () => db.query("update public.reports set inputs = '{}' where id = $1", [mine])), /제출한 보고서/);
  await rejects(() => as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('report-materials', $1)", [`${mine}/x.pdf`])), /row-level security/);
  await as("inspector", () => db.query("update public.reports set status = 'drafting' where id = $1", [mine]));

  // 추가자료 파일: 자기 보고서 폴더에만
  const put = "insert into storage.objects (bucket_id, name) values ('report-materials', $1)";
  await as("inspector", () => db.query(put, [`${mine}/a.pdf`]));
  await rejects(() => as("inspector", () => db.query(put, [`${theirs}/a.pdf`])), /row-level security/);
  await rejects(() => as("inspector", () => db.query(put, ["abc/a.pdf"])), /row-level security/);
  await as("inspector", () => db.query("insert into public.report_materials (report_id, storage_path, file_name, uploaded_by) values ($1, $2, 'a.pdf', $3)", [mine, `${mine}/a.pdf`, users.inspector]));
  assert.equal(await as("license", () => count("select 1 from public.report_materials")), 0);

  // 승인은 제출된 보고서에서만(상태 전이 표 — 2026-10-10 개선 계획 P1-1): 작성 중에서 바로 승인은 성과관리팀도 거절
  await rejects(() => as("pmo", () => db.query("update public.reports set status = 'approved', approved_by = $2, approved_at = now() where id = $1", [mine, users.pmo])), /바꿀 수 없는 상태/);
  await as("inspector", () => db.query("update public.reports set status = 'submitted' where id = $1", [mine]));
  await as("pmo", () => db.query("update public.reports set status = 'approved', approved_by = $2, approved_at = now() where id = $1", [mine, users.pmo]));
  await rejects(() => as("inspector", () => db.query("update public.reports set status = 'drafting' where id = $1", [mine])), /승인/);
  // 승인 → 제출은 표 밖(승인 취소는 작성 중으로만)
  await rejects(() => as("pmo", () => db.query("update public.reports set status = 'submitted' where id = $1", [mine])), /바꿀 수 없는 상태/);
  // 준비 → 승인(제출 우회)은 성과관리팀도 거절, 서비스 키(적재·관리 스크립트)는 막지 않음
  const fresh = (await as("pmo", () => db.query<{ id: number }>("insert into public.reports (eval_unit_id, year, team_id, created_by) values ('BZ-1', 2027, $1, $2) returning id", [insp, users.pmo]))).rows[0].id;
  await rejects(() => as("pmo", () => db.query("update public.reports set status = 'approved' where id = $1", [fresh])), /바꿀 수 없는 상태/);
  await db.query("update public.reports set status = 'approved' where id = $1", [fresh]);
  await db.query("delete from public.reports where id = $1", [fresh]);
});

test("작성본 식별 칸(2026-10-10 개선 계획 P2-5): 새 작성본의 id·group·taskNo는 원장과 같아야 하고, 고칠 때는 과제·식별 칸을 못 바꿈 — 성과관리팀도, 서비스 키는 예외", { skip: NO_SEED_CARDS }, async () => {
  const [own, sibling] = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' and c.status = 'active' order by c.id limit 2")).rows.map((r) => r.id);
  const insert = "insert into public.card_versions (card_id, period, version, status, data) values ($1, '2027-01', 1, 'draft', $2::jsonb) returning id";
  const ledgerIds = (await db.query<{ ids: Record<string, unknown> }>(`select ${DRAFT_IDS} as ids`, [own])).rows[0].ids;
  await rejects(() => as("inspector", () => db.query(insert, [own, JSON.stringify({ ...ledgerIds, taskNo: "9-9" })])), /식별 값/);
  await rejects(() => as("pmo", () => db.query(insert, [own, JSON.stringify({ ...ledgerIds, id: sibling })])), /식별 값/);
  const id = (await as("inspector", () => db.query<{ id: number }>(insert, [own, JSON.stringify(ledgerIds)]))).rows[0].id;
  await rejects(() => as("inspector", () => db.query(`update public.card_versions set data = data || '{"group":"주요사업9"}' where id = $1`, [id])), /바꿀 수 없습니다/);
  await rejects(() => as("pmo", () => db.query("update public.card_versions set card_id = $2 where id = $1", [id, sibling])), /바꿀 수 없습니다/);
  await rejects(() => as("pmo", () => db.query("update public.card_versions set data = data - 'taskNo' where id = $1", [id])), /바꿀 수 없습니다/);
  await as("inspector", () => db.query(`update public.card_versions set data = data || '{"memo":"고침"}' where id = $1`, [id]));
  await db.exec("set role service_role");
  try {
    await db.query(`update public.card_versions set data = data || '{"taskNo":"9-9"}' where id = $1`, [id]);
  } finally {
    await db.exec("reset role");
  }
  await db.query("delete from public.card_versions where id = $1", [id]);
});

test("고정 영역 확정: 부서 작성본은 Act·Plan·계량지표를 못 바꾸고, 나머지는 바꾼다", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string; data: Record<string, unknown> }>("select c.id, c.data from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' order by c.id desc limit 1")).rows[0];
  await db.query("update public.cards set fixed_locked_at = now() where id = $1", [own.id]);
  const insert = "insert into public.card_versions (card_id, period, version, status, data) values ($1, '2026-11', $2, 'draft', $3::jsonb)";
  const changedPlan = { ...own.data, plan: { ...(own.data.plan as object), lines: ["바꾼 계획"] }, do: { ...(own.data.do as object), lines: ["이달 실적"] } };
  // 잠긴 영역은 거절하지 않고 원장 값으로 맞춤(잠금 뒤에도 작성본이 막히지 않게), 나머지 변경은 그대로
  await as("inspector", () => db.query(insert, [own.id, 1, JSON.stringify(changedPlan)]));
  const saved = (await db.query<{ data: { plan: unknown; do: { lines: string[] } } }>("select data from public.card_versions where card_id = $1 and version = 1 and period = '2026-11'", [own.id])).rows[0].data;
  assert.deepEqual(saved.plan, own.data.plan, "잠긴 Plan은 원장 값");
  assert.deepEqual(saved.do.lines, ["이달 실적"], "Do 변경은 그대로");
  // 카드마다 열린 작성본은 하나(작성 중·제출)
  await rejects(() => as("inspector", () => db.query(insert, [own.id, 2, JSON.stringify(changedPlan)])), /duplicate key|unique/);
  // 성과관리팀은 잠금과 상관없이 씀(원장 관리 주체)
  await as("pmo", () => db.query("update public.card_versions set data = $2::jsonb where card_id = $1 and period = '2026-11' and version = 1", [own.id, JSON.stringify(changedPlan)]));
  const byPmo = (await db.query<{ data: { plan: { lines: string[] } } }>("select data from public.card_versions where card_id = $1 and period = '2026-11' and version = 1", [own.id])).rows[0].data;
  assert.deepEqual(byPmo.plan.lines, ["바꾼 계획"], "성과관리팀 쓰기는 잠금 영향 없음");
  await db.query("update public.cards set fixed_locked_at = null where id = $1", [own.id]);
  await as("inspector", () => db.query("update public.card_versions set data = $2::jsonb where card_id = $1 and version = 1 and period = '2026-11'", [own.id, JSON.stringify(changedPlan)]));
  const unlocked = (await db.query<{ data: { plan: { lines: string[] } } }>("select data from public.card_versions where card_id = $1 and version = 1 and period = '2026-11'", [own.id])).rows[0].data;
  assert.deepEqual(unlocked.plan.lines, ["바꾼 계획"], "잠금을 풀면 Plan도 고침");
});

test("고정 영역 확정(경영관리 카드): 부서 작성본은 전년도 환류·지적 및 개선방안·계량지표를 못 바꾸고, 주요사업 키(act·plan)를 만들지 않음", { skip: NO_SEED_CARDS }, async () => {
  const own = (
    await db.query<{ id: string; data: Record<string, unknown> }>(
      "select c.id, c.data from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' and not exists (select 1 from public.card_versions v where v.card_id = c.id and v.status in ('draft', 'submitted')) order by c.id limit 1",
    )
  ).rows[0];
  const mg = {
    group: "경영관리1",
    feedback: { rows: [{ self: ["'25 자체평가"], plan: ["'26 반영계획"] }] },
    findings: { rows: [{ finding: ["지적 원문"], plan: ["개선방안"] }] },
    do: { lines: ["추진내용"], monthly: [] },
    kpi: { rows: [{ name: "지표", prev: "1", target: "2" }] },
    outcome: { quantitative: [], qualitative: [] },
  };
  await db.query("update public.cards set data = $2::jsonb, fixed_locked_at = now() where id = $1", [own.id, JSON.stringify(mg)]);
  const changed = { ...mg, feedback: { rows: [] }, findings: { rows: [] }, kpi: { rows: [] }, do: { lines: ["이달 실적"], monthly: [] } };
  await as("inspector", () => db.query("insert into public.card_versions (card_id, period, version, status, data, base) values ($1, '2026-11', 1, 'draft', $2::jsonb, $2::jsonb)", [own.id, JSON.stringify(changed)]));
  const saved = (await db.query<{ data: Record<string, unknown>; base: Record<string, unknown> }>("select data, base from public.card_versions where card_id = $1 and period = '2026-11' and version = 1", [own.id])).rows[0];
  for (const k of ["feedback", "findings", "kpi"] as const) {
    assert.deepEqual(saved.data[k], mg[k], `잠긴 ${k}는 원장 값`);
    assert.deepEqual(saved.base[k], mg[k], `base의 ${k}도 원장 값`);
  }
  assert.deepEqual(saved.data.do, { lines: ["이달 실적"], monthly: [] }, "추진내용 변경은 그대로");
  assert.ok(!("act" in saved.data) && !("plan" in saved.data), "경영관리 작성본에 주요사업 키를 덮어쓰지 않음");
  await db.query("delete from public.card_versions where card_id = $1 and period = '2026-11'", [own.id]);
  await db.query("update public.cards set data = $2::jsonb, fixed_locked_at = null where id = $1", [own.id, JSON.stringify(own.data)]);
});


test("보고서 목차·쪽 배정: 성과관리팀만 쓰고 부서는 자기 과제만 읽음, 0.5쪽 단위", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string; eval_unit_id: string }>("select c.id, c.eval_unit_id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0];
  const other = (await db.query<{ id: string; eval_unit_id: string }>("select c.id, c.eval_unit_id from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0];
  const insert = "insert into public.report_outline (card_id, year, eval_unit_id, section, pages) values ($1, 2026, $2, '대상사업', $3)";
  await rejects(() => as("inspector", () => db.query(insert, [own.id, own.eval_unit_id, 1])), /row-level security/);
  await as("pmo", () => db.query(insert, [own.id, own.eval_unit_id, 1.5]));
  await as("pmo", () => db.query(insert, [other.id, other.eval_unit_id, 0.5]));
  await rejects(() => as("pmo", () => db.query("update public.report_outline set pages = 1.25 where card_id = $1", [own.id])), /check constraint/);
  assert.equal(await as("inspector", () => count("select 1 from public.report_outline")), 1);
  assert.equal(await as("pmo", () => count("select 1 from public.report_outline")), 2);
});

test("보고서 과제별 초안: 부서는 지정된 자기 부서 카드만 쓰고, 성과관리팀 읽기, 비로그인 불가", { skip: NO_SEED_CARDS }, async () => {
  // 앞선 「경평 초안」 테스트가 검사기획팀·BZ-1 보고서를 approved로 남겨 둠(부서 잠금 대상) — 이 테스트는 그 잠금과 무관하니
  // 소유자 권한(RLS·가드 트리거 밖)으로 미리 drafting으로 되돌려 둠
  await db.query("update public.reports set status = 'drafting' where eval_unit_id = 'BZ-1' and status in ('submitted', 'approved')");
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const other = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0].id;
  const upsert =
    "insert into public.card_report_drafts (card_id, year, spec, model, source_rev) values ($1, 2026, $2::jsonb, 'm', 1) on conflict (card_id, year) do update set spec = excluded.spec";
  const spec = JSON.stringify({ version: 1, rows: [] });
  await as("inspector", () => db.query(upsert, [own, spec]));
  await as("inspector", () => db.query(upsert, [own, spec]));
  await rejects(() => as("inspector", () => db.query(upsert, [other, spec])), /row-level security/);
  await as("pmo", () => db.query(upsert, [other, spec]));
  assert.equal(await as("inspector", () => count("select 1 from public.card_report_drafts")), 1, "부서는 자기 카드 초안만 봄");
  assert.equal(await as("pmo", () => count("select 1 from public.card_report_drafts")), 2);
  const touched = await as("inspector", () => db.query("update public.card_report_drafts set model = 'x' where card_id = $1", [other]));
  assert.equal(touched.affectedRows ?? 0, 0, "남의 부서 카드 초안은 못 고침(보이지도 않음)");
  await db.exec("set role anon");
  try {
    await rejects(() => db.query("select 1 from public.card_report_drafts"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("경평 초안 구성안(2단계): 부서는 자기 카드에 구성안만 있는 행을 넣고 읽음, spec·outline 둘 다 없거나 outline만 있고 status가 없으면 거절, 성과관리팀은 전부", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const other = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0].id;
  const outline = JSON.stringify({ version: 1, message: "m", points: [], story: "", storyWhy: "", alternative: "", blocks: [], results: "", materials: [], memo: "" });
  const insertOutline = "insert into public.card_report_drafts (card_id, year, outline, outline_status) values ($1, 2027, $2::jsonb, 'draft')";
  await as("inspector", () => db.query(insertOutline, [own, outline]));
  await rejects(() => as("inspector", () => db.query(insertOutline, [other, outline])), /row-level security/);
  await as("pmo", () => db.query(insertOutline, [other, outline]));
  assert.equal(await as("inspector", () => count("select 1 from public.card_report_drafts where year = 2027")), 1, "부서는 자기 카드 구성안만 봄(spec 없이 outline만)");
  assert.equal(await as("pmo", () => count("select 1 from public.card_report_drafts where year = 2027")), 2, "성과관리팀은 전부");
  await rejects(() => as("inspector", () => db.query("insert into public.card_report_drafts (card_id, year) values ($1, 2028)", [own])), /card_report_drafts_has_content|check constraint/);
  await rejects(() => as("inspector", () => db.query("insert into public.card_report_drafts (card_id, year, outline) values ($1, 2028, $2::jsonb)", [own, outline])), /card_report_drafts_outline_status|check constraint/);
});

test("경평 초안 구성안 승인 저장: 구성안 행에 spec+outline+approved를 함께 upsert하면 성공, outline 없이 approved만이면 제약 위반, spec만이면 구성안 그대로", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const outline = JSON.stringify({ version: 1, message: "m", points: [], story: "", storyWhy: "", alternative: "", blocks: [], results: "", materials: [], memo: "" });
  const insertOutline = "insert into public.card_report_drafts (card_id, year, outline, outline_status) values ($1, 2029, $2::jsonb, 'draft')";
  await as("inspector", () => db.query(insertOutline, [own, outline]));
  const spec = JSON.stringify({ version: 3, rows: [] });
  const upsertBoth =
    "insert into public.card_report_drafts (card_id, year, spec, model, source_rev, outline, outline_status, outline_approved_by, outline_approved_at) " +
    "values ($1, 2029, $2::jsonb, 'm', 1, $3::jsonb, 'approved', $4, now()) " +
    "on conflict (card_id, year) do update set spec = excluded.spec, model = excluded.model, source_rev = excluded.source_rev, " +
    "outline = excluded.outline, outline_status = excluded.outline_status, outline_approved_by = excluded.outline_approved_by, outline_approved_at = excluded.outline_approved_at";
  // (a) 부서가 자기 카드에 spec + outline + approved를 함께 upsert하면 성공
  await as("inspector", () => db.query(upsertBoth, [own, spec, outline, users.inspector]));
  const approved = (await db.query<{ spec: unknown; outline_status: string }>("select spec, outline_status from public.card_report_drafts where card_id = $1 and year = 2029", [own])).rows[0];
  assert.deepEqual(approved.spec, JSON.parse(spec), "spec이 채워짐");
  assert.equal(approved.outline_status, "approved");

  // (b) outline 없이 outline_status 'approved'만 upsert하면 제약 위반(회귀 방지)
  const upsertStatusOnly =
    "insert into public.card_report_drafts (card_id, year, spec, model, source_rev, outline_status) values ($1, 2029, $2::jsonb, 'm', 2, 'approved') " +
    "on conflict (card_id, year) do update set spec = excluded.spec, model = excluded.model, source_rev = excluded.source_rev, outline_status = excluded.outline_status";
  await rejects(() => as("inspector", () => db.query(upsertStatusOnly, [own, spec])), /card_report_drafts_outline_status|check constraint/);

  // (c) 구성안 행에 outline·status 없이 spec만 upsert(「AI로 바로 만들기」)하면 성공하고 기존 outline·status는 그대로 남음
  const insertOutline2 = "insert into public.card_report_drafts (card_id, year, outline, outline_status) values ($1, 2030, $2::jsonb, 'draft')";
  await as("inspector", () => db.query(insertOutline2, [own, outline]));
  const upsertSpecOnly =
    "insert into public.card_report_drafts (card_id, year, spec, model, source_rev) values ($1, 2030, $2::jsonb, 'm', 1) on conflict (card_id, year) do update set spec = excluded.spec, model = excluded.model, source_rev = excluded.source_rev";
  await as("inspector", () => db.query(upsertSpecOnly, [own, spec]));
  const stillDraft = (await db.query<{ spec: unknown; outline: unknown; outline_status: string }>("select spec, outline, outline_status from public.card_report_drafts where card_id = $1 and year = 2030", [own])).rows[0];
  assert.deepEqual(stillDraft.spec, JSON.parse(spec), "spec만 새로 채워짐");
  assert.deepEqual(stillDraft.outline, JSON.parse(outline), "구성안은 그대로 남음");
  assert.equal(stillDraft.outline_status, "draft", "승인 상태는 그대로 남음");
});

test("경평 초안 블록 고치기 이력(report_draft_edits): 부서는 자기 부서 카드에만 자기 이름으로 넣고 읽음, 성과관리팀은 전부, 고치기·지우기는 권한 없음, 블록 번호 -1(추진성과)까지", { skip: NO_SEED_CARDS }, async () => {
  // 위와 같은 까닭(검사기획팀·BZ-1 보고서 잠금)으로 이 테스트와 무관한 잠금을 미리 풀어 둠
  await db.query("update public.reports set status = 'drafting' where eval_unit_id = 'BZ-1' and status in ('submitted', 'approved')");
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const other = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0].id;
  const insert = (edited_by: string) =>
    "insert into public.report_draft_edits (card_id, year, block_index, kind, request, quote, reply, before, after, model, edited_by) " +
    `values ($1, 2026, 0, 'edit', '요청', '고른 글', '답', '{}'::jsonb, '{"label":"x"}'::jsonb, 'm', '${edited_by}') returning id`;
  const own1 = await as("inspector", () => db.query<{ id: number }>(insert(users.inspector), [own]));
  assert.equal(own1.rows.length, 1, "부서는 자기 부서 카드에 넣음");
  // 다른 부서 카드에는 못 넣음(그 카드를 볼 수 없어 RLS 위반)
  await rejects(() => as("inspector", () => db.query(insert(users.inspector), [other])), /row-level security/);
  // edited_by를 다른 사람으로 넣으면 거절(쓴 사람 = 로그인 사용자만)
  await rejects(() => as("inspector", () => db.query(insert(users.pmo), [own])), /row-level security/);
  assert.equal(await as("inspector", () => count("select 1 from public.report_draft_edits")), 1, "부서는 자기 부서 카드 이력만 읽음");
  assert.equal(await as("pmo", () => count("select 1 from public.report_draft_edits")), 1, "성과관리팀은 전부 읽음(같은 카드)");
  await as("pmo", () => db.query(insert(users.pmo), [other]));
  assert.equal(await as("pmo", () => count("select 1 from public.report_draft_edits")), 2, "성과관리팀은 다른 부서 카드에도 넣음");
  assert.equal(await as("inspector", () => count("select 1 from public.report_draft_edits")), 1, "부서는 여전히 자기 부서 카드 이력만 봄");
  // 고치기·지우기 권한이 없음(넣기만 허용 — 테이블 GRANT 수준 거절, RLS 아님)
  await rejects(() => as("pmo", () => db.query("update public.report_draft_edits set reply = 'x' where id = $1", [own1.rows[0].id])), /permission denied/);
  await rejects(() => as("pmo", () => db.query("delete from public.report_draft_edits where id = $1", [own1.rows[0].id])), /permission denied/);
  // kind가 edit·undo 밖이면 제약 위반
  const badKind =
    "insert into public.report_draft_edits (card_id, year, block_index, kind, before, after, edited_by) values ($1, 2026, 0, 'redo', '{}'::jsonb, '{}'::jsonb, $2)";
  await rejects(() => as("inspector", () => db.query(badKind, [own, users.inspector])), /check constraint/);
  // 블록 번호: -1 = 추진성과 상자(2026-10-13)는 넣고, 그보다 작으면 제약 위반
  const byIndex = (i: number) => `insert into public.report_draft_edits (card_id, year, block_index, kind, before, after, edited_by) values ($1, 2026, ${i}, 'edit', '{"results":[],"resultBand":""}'::jsonb, '{"results":["x"],"resultBand":""}'::jsonb, $2) returning id`;
  assert.equal((await as("inspector", () => db.query(byIndex(-1), [own, users.inspector]))).rows.length, 1, "추진성과(-1) 이력은 넣음");
  await rejects(() => as("inspector", () => db.query(byIndex(-2), [own, users.inspector])), /check constraint/);
  await db.exec("set role anon");
  try {
    await rejects(() => db.query("select 1 from public.report_draft_edits"), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("경평 초안 부서 제출 잠금(report_locked·guard_card_report_draft): 부서 보고서가 제출·승인이면 부서는 그 카드 초안·구성안·이력을 못 고침, 성과관리팀은 그대로, 취소하면 다시 됨", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string; eval_unit_id: string }>("select c.id, c.eval_unit_id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0];
  const insp = (await db.query<{ id: number }>("select id from public.teams where name = '검사기획팀'")).rows[0].id;
  const year = 2031;
  const reportId = (
    await as("pmo", () => db.query<{ id: number }>("insert into public.reports (eval_unit_id, year, team_id, created_by) values ($1, $2, $3, $4) returning id", [own.eval_unit_id, year, insp, users.pmo]))
  ).rows[0].id;
  await as("pmo", () => db.query("update public.reports set status = 'drafting' where id = $1", [reportId]));

  const spec = JSON.stringify({ version: 1, rows: [] });
  const upsert = "insert into public.card_report_drafts (card_id, year, spec, model, source_rev) values ($1, $2, $3::jsonb, 'm', 1) on conflict (card_id, year) do update set spec = excluded.spec, model = excluded.model";
  const editInsert =
    "insert into public.report_draft_edits (card_id, year, block_index, kind, before, after, edited_by) values ($1, $2, 0, 'edit', '{}'::jsonb, '{\"label\":\"x\"}'::jsonb, $3)";

  // drafting: 부서가 넣기·고치기·이력 넣기·지우기 모두 됨
  await as("inspector", () => db.query(upsert, [own.id, year, spec]));
  await as("inspector", () => db.query("update public.card_report_drafts set model = 'm2' where card_id = $1 and year = $2", [own.id, year]));
  await as("inspector", () => db.query(editInsert, [own.id, year, users.inspector]));
  await as("inspector", () => db.query("delete from public.card_report_drafts where card_id = $1 and year = $2", [own.id, year]));
  await as("inspector", () => db.query(upsert, [own.id, year, spec]));

  // submitted: 부서는 넣기·고치기·이력 넣기·지우기 모두 거절(성과관리팀은 그대로 됨)
  await as("pmo", () => db.query("update public.reports set status = 'submitted' where id = $1", [reportId]));
  await rejects(() => as("inspector", () => db.query(upsert, [own.id, year, spec])), /제출한 보고서의 과제입니다/);
  await rejects(() => as("inspector", () => db.query("update public.card_report_drafts set model = 'm3' where card_id = $1 and year = $2", [own.id, year])), /제출한 보고서의 과제입니다/);
  await rejects(() => as("inspector", () => db.query(editInsert, [own.id, year, users.inspector])), /제출한 보고서의 과제입니다/);
  await rejects(() => as("inspector", () => db.query("delete from public.card_report_drafts where card_id = $1 and year = $2", [own.id, year])), /제출한 보고서의 과제입니다/);
  await as("pmo", () => db.query("update public.card_report_drafts set model = 'staff' where card_id = $1 and year = $2", [own.id, year]));
  await as("pmo", () => db.query(editInsert, [own.id, year, users.pmo]));

  // approved: 마찬가지로 부서는 거절
  await as("pmo", () => db.query("update public.reports set status = 'approved', approved_by = $2, approved_at = now() where id = $1", [reportId, users.pmo]));
  await rejects(() => as("inspector", () => db.query(upsert, [own.id, year, spec])), /제출한 보고서의 과제입니다/);

  // 제출 취소(drafting으로 되돌림): 부서가 다시 고침
  await as("pmo", () => db.query("update public.reports set status = 'drafting' where id = $1", [reportId]));
  await as("inspector", () => db.query("update public.card_report_drafts set model = 'again' where card_id = $1 and year = $2", [own.id, year]));
  const back = (await db.query<{ model: string }>("select model from public.card_report_drafts where card_id = $1 and year = $2", [own.id, year])).rows[0];
  assert.equal(back.model, "again");
});

test("경평 초안 부서 제출: 자료 준비(preparing) 보고서에 부서가 첫 초안을 넣으면 초안 작성(drafting)으로, 이미 제출이면 그대로(성과관리팀은 잠금 밖)", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string; eval_unit_id: string }>("select c.id, c.eval_unit_id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0];
  const insp = (await db.query<{ id: number }>("select id from public.teams where name = '검사기획팀'")).rows[0].id;

  // preparing → drafting: 부서 첫 구성안 행으로도 전환됨
  const preparing = (
    await as("pmo", () => db.query<{ id: number }>("insert into public.reports (eval_unit_id, year, team_id, created_by) values ($1, 2032, $2, $3) returning id", [own.eval_unit_id, insp, users.pmo]))
  ).rows[0].id;
  assert.equal((await db.query<{ status: string }>("select status from public.reports where id = $1", [preparing])).rows[0].status, "preparing");
  const outline = JSON.stringify({ version: 1, message: "m", points: [], story: "", storyWhy: "", alternative: "", blocks: [], results: "", materials: [], memo: "" });
  await as("inspector", () => db.query("insert into public.card_report_drafts (card_id, year, outline, outline_status) values ($1, 2032, $2::jsonb, 'draft')", [own.id, outline]));
  assert.equal((await db.query<{ status: string }>("select status from public.reports where id = $1", [preparing])).rows[0].status, "drafting", "첫 초안(구성안)이 자료 준비를 초안 작성으로 바꿈");

  // 이미 submitted면 그대로(잠금 예외가 먼저 걸려 부서는 애초에 못 넣고, 성과관리팀이 넣어도 전환 규칙은 preparing에서만)
  const submitted = (
    await as("pmo", () => db.query<{ id: number }>("insert into public.reports (eval_unit_id, year, team_id, created_by) values ($1, 2033, $2, $3) returning id", [own.eval_unit_id, insp, users.pmo]))
  ).rows[0].id;
  await as("pmo", () => db.query("update public.reports set status = 'drafting' where id = $1", [submitted])); // 전이 표: 작성 중을 거쳐 제출(2026-10-10)
  await as("pmo", () => db.query("update public.reports set status = 'submitted' where id = $1", [submitted]));
  await as("pmo", () => db.query("insert into public.card_report_drafts (card_id, year, spec, model, source_rev) values ($1, 2033, $2::jsonb, 'm', 1)", [own.id, JSON.stringify({ version: 1, rows: [] })]));
  assert.equal((await db.query<{ status: string }>("select status from public.reports where id = $1", [submitted])).rows[0].status, "submitted", "제출된 보고서는 성과관리팀이 넣어도 상태 그대로");
});

test("경평 초안 부서 제출: 성과관리팀 검토 메모(review_note)는 부서가 못 바꾸고, 성과관리팀은 바꿈, 2000자 넘으면 거절", { skip: NO_SEED_CARDS }, async () => {
  const insp = (await db.query<{ id: number }>("select id from public.teams where name = '검사기획팀'")).rows[0].id;
  const reportId = (
    await as("pmo", () => db.query<{ id: number }>("insert into public.reports (eval_unit_id, year, team_id, created_by) values ('BZ-1', 2034, $1, $2) returning id", [insp, users.pmo]))
  ).rows[0].id;
  await rejects(() => as("inspector", () => db.query("update public.reports set review_note = '고쳐 주세요' where id = $1", [reportId])), /식별/);
  await rejects(() => as("inspector", () => db.query("update public.reports set reviewed_at = now(), reviewed_by = $2 where id = $1", [reportId, users.inspector])), /식별/);
  await as("pmo", () => db.query("update public.reports set review_note = '월별 실적을 더 채워 주세요', reviewed_at = now(), reviewed_by = $2 where id = $1", [reportId, users.pmo]));
  const noted = (await db.query<{ review_note: string }>("select review_note from public.reports where id = $1", [reportId])).rows[0];
  assert.equal(noted.review_note, "월별 실적을 더 채워 주세요");
  await rejects(() => as("pmo", () => db.query("update public.reports set review_note = $2 where id = $1", [reportId, "x".repeat(2001)])), /check constraint/);
  await as("pmo", () => db.query("update public.reports set review_note = $2 where id = $1", [reportId, "x".repeat(2000)]));
});

test("경평 초안 사업 맥락 읽기(report_outline_context rpc): 성과관리팀 전부, 카드 있는 부서는 전부(자기 줄만 mine), 카드 없는 부서는 0행, 주관 부서는 카드 없어도 받음, anon 거절", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string; eval_unit_id: string }>("select c.id, c.eval_unit_id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0];
  const other = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사관리팀' and c.eval_unit_id = $1 limit 1", [own.eval_unit_id])).rows[0];
  assert.ok(other, "검사관리팀도 같은 사업(BZ-1)에 카드가 있음");
  const year = 2035;
  const insertOutline = "insert into public.report_outline (card_id, year, eval_unit_id, section, subsection, sort, pages) values ($1, $2, $3, '대상사업', '실행과제', $4, 0.5)";
  await db.query(insertOutline, [own.id, year, own.eval_unit_id, 1]);
  await db.query(insertOutline, [other.id, year, own.eval_unit_id, 2]);

  const rpc = (user: keyof typeof users) => as(user, () => db.query<{ task_no: string; mine: boolean }>("select task_no, mine from public.report_outline_context($1, $2)", [own.eval_unit_id, year]));

  // 성과관리팀: 사업 전부
  assert.equal((await rpc("pmo")).rows.length, 2);

  // 그 사업에 카드가 있는 부서(검사기획팀)는 전부 받고, 자기 카드 줄만 mine=true
  const ownTaskNo = (await db.query<{ task_no: string }>("select task_no from public.cards where id = $1", [own.id])).rows[0].task_no;
  const inspRows = (await rpc("inspector")).rows;
  assert.equal(inspRows.length, 2);
  assert.deepEqual(
    inspRows.filter((r) => r.mine).map((r) => r.task_no),
    [ownTaskNo],
  );

  // 그 사업에 카드가 없는 부서(자격기획팀)는 0행
  assert.equal((await rpc("license")).rows.length, 0);

  // 주관 부서 지정: 카드가 없어도 전부 받음
  const lic = (await db.query<{ id: number }>("select id from public.teams where name = '자격기획팀'")).rows[0].id;
  await db.query("update public.eval_units set lead_team_id = $1 where id = $2", [lic, own.eval_unit_id]);
  assert.equal((await rpc("license")).rows.length, 2, "주관 부서는 카드가 없어도 그 사업 전체를 읽음");
  await db.query("update public.eval_units set lead_team_id = null where id = $1", [own.eval_unit_id]);
  assert.equal((await rpc("license")).rows.length, 0, "주관 부서 지정을 풀면 다시 0행");

  // 비로그인(anon)은 실행 권한 없음
  await db.exec("set role anon");
  try {
    await rejects(() => db.query("select 1 from public.report_outline_context($1, $2)", [own.eval_unit_id, year]), /permission denied/);
  } finally {
    await db.exec("reset role");
  }
});

test("카드 현행화: 원장 반영 묶음은 성과관리팀만, 부서는 자기 카드 작성본용 묶음만 만들고 봄", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string; uid: string }>("select c.id, c.uid from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' order by c.id limit 1")).rows[0];
  const other = (await db.query<{ id: string; uid: string }>("select c.id, c.uid from public.cards c join public.teams t on t.id = c.team_id where t.name = '자격기획팀' limit 1")).rows[0];
  const newImport = "insert into public.card_imports (scope, target_card_id, created_by) values ($1, $2, $3) returning id";
  await rejects(() => as("inspector", () => db.query(newImport, ["ledger", null, users.inspector])), /row-level security/);
  await rejects(() => as("inspector", () => db.query(newImport, ["draft", other.id, users.inspector])), /row-level security/);
  const mine = (await as("inspector", () => db.query<{ id: number }>(newImport, ["draft", own.id, users.inspector]))).rows[0].id;
  const staffImport = (await as("pmo", () => db.query<{ id: number }>(newImport, ["ledger", null, users.pmo]))).rows[0].id;
  const item = "insert into public.card_import_items (import_id, file_n, seq, parsed, match, card_id) values ($1, 1, 1, '{}'::jsonb, 'exact', $2)";
  await as("inspector", () => db.query(item, [mine, own.id]));
  await rejects(() => as("inspector", () => db.query(item, [staffImport, own.id])), /row-level security/);
  await as("pmo", () => db.query(item, [staffImport, own.id]));
  assert.equal(await as("inspector", () => count("select 1 from public.card_imports")), 1);
  assert.equal(await as("inspector", () => count("select 1 from public.card_import_items")), 1);
  assert.equal(await as("license", () => count("select 1 from public.card_import_items")), 0);
  assert.equal(await as("pmo", () => count("select 1 from public.card_imports")), 2);
  // 원본 파일: 쓸 수 있는 묶음 폴더에만
  await as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('card-imports', $1)", [`${mine}/1.hwpx`]));
  await rejects(() => as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('card-imports', $1)", [`${staffImport}/1.hwpx`])), /row-level security/);
  assert.equal(await as("license", () => count("select 1 from storage.objects where bucket_id = 'card-imports'")), 0);
  // 현행화 그림: 부서는 자기 카드 폴더에 imp 파일만 새로 올림
  await as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('card-originals', $1)", [`${own.uid}/imp${mine}-image_001.jpg`]));
  await rejects(() => as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('card-originals', $1)", [`${own.uid}/biz1-image_009.jpg`])), /row-level security/);
  await rejects(() => as("inspector", () => db.query("insert into storage.objects (bucket_id, name) values ('card-originals', $1)", [`${other.uid}/imp${mine}-image_001.jpg`])), /row-level security/);
});

test("카드 보관(삭제): 보관한 카드는 부서가 못 보고 못 씀, 성과관리팀은 보관함에서 봄", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' order by c.id limit 1 offset 1")).rows[0];
  const before = await as("inspector", () => count("select 1 from public.cards"));
  await rejects(() => as("inspector", () => db.query("update public.cards set status = 'retired' where id = $1 returning id", [own.id]).then((r) => (r.rows.length ? r : Promise.reject(new Error("row-level security"))))), /row-level security/);
  await as("pmo", () => db.query("update public.cards set status = 'retired', retired_at = now(), retired_by = $2, retired_reason = '과제 통합' where id = $1", [own.id, users.pmo]));
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), before - 1);
  assert.equal(await as("pmo", () => count("select 1 from public.cards where status = 'retired'")), 1);
  await rejects(() => as("inspector", () => db.query("insert into public.card_versions (card_id, period, version, status, data) values ($1, '2026-12', 1, 'draft', '{}'::jsonb)", [own.id])), /row-level security/);
  await as("pmo", () => db.query("update public.cards set status = 'active', retired_at = null, retired_by = null, retired_reason = null where id = $1", [own.id]));
  assert.equal(await as("inspector", () => count("select 1 from public.cards")), before);
});

test("카드 원본 배치(layout): 성과관리팀만 쓰고, 배치만 바꾸면 수정일자는 그대로", { skip: NO_SEED_CARDS }, async () => {
  const own = (await db.query<{ id: string }>("select c.id from public.cards c join public.teams t on t.id = c.team_id where t.name = '검사기획팀' limit 1")).rows[0].id;
  const layout = JSON.stringify({ v: 1, blocks: [] });
  const byDept = await as("inspector", () => db.query("update public.cards set layout = $2::jsonb where id = $1", [own, layout]));
  assert.equal(byDept.affectedRows, 0, "담당자는 배치를 못 씀");
  await db.query("update public.cards set updated_at = '2026-01-01T00:00:00Z' where id = $1", [own]);
  const byPmo = await as("pmo", () => db.query("update public.cards set layout = $2::jsonb where id = $1", [own, layout]));
  assert.equal(byPmo.affectedRows, 1);
  const kept = await db.query<{ t: string }>("select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') as t from public.cards where id = $1", [own]);
  assert.equal(kept.rows[0].t, "2026-01-01", "배치만 바꿈 → 수정일자 그대로");
  await as("pmo", () => db.query("update public.cards set progress = 30 where id = $1", [own]));
  const moved = await db.query<{ t: string }>("select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD') as t from public.cards where id = $1", [own]);
  assert.notEqual(moved.rows[0].t, "2026-01-01", "다른 값을 바꾸면 수정일자 갱신");
  assert.equal(await as("inspector", () => count("select 1 from public.cards where id = $1 and layout is not null", [own])), 1, "담당자는 자기 카드 배치를 읽음");
});

// ── 참고자료 3단계 표(과제 대응표·보고서 자료 연결·근거 목록표·작업 대기열) ─────────────────────────────────────────
const teamId = async (name: string) => (await db.query<{ id: number }>("select id from public.teams where name = $1", [name])).rows[0].id;
const firstCard = async (teamName: string) => (await db.query<{ id: string; eval_unit_id: string }>("select c.id, c.eval_unit_id from public.cards c join public.teams t on t.id = c.team_id where t.name = $1 order by c.id limit 1", [teamName])).rows[0];

/** 시험용 공통 지식 문서·조각(로컬 적재 유무와 상관없이) */
async function withKnowledgeFixture(fn: () => Promise<void>) {
  await db.query("insert into public.knowledge_documents (doc_id, title, file_name) values ('prep-test', 't', 't.md')");
  await db.query("insert into public.knowledge_chunks (chunk_key, doc_id, seq, unit_type, track, title, context_prefix, blocks, text, search_text) values ('prep-test/1', 'prep-test', 1, 'qa_pair', '주요사업', 't', 'p', '[]'::jsonb, 'x', 'x'), ('prep-test/2', 'prep-test', 2, 'qa_pair', '주요사업', 't', 'p', '[]'::jsonb, 'x', 'x')");
  try {
    await fn();
  } finally {
    await db.query("delete from public.knowledge_documents where doc_id = 'prep-test'"); // 조각·대응표는 cascade
  }
}

/** 검사기획팀·자격기획팀 보고서와 자료(같은 사업). 사업 안에 다른 부서 카드가 있어야 함 */
async function withReportFixture(fn: (f: { mine: number; theirs: number; rm: string; rmTheirs: string; ownCard: string; otherTeamCard: string }) => Promise<void>) {
  const insp = await teamId("검사기획팀");
  const lic = await teamId("자격기획팀");
  const own = await firstCard("검사기획팀");
  const otherTeamCard = (await db.query<{ id: string }>("select id from public.cards where eval_unit_id = $1 and team_id <> $2 and status = 'active' order by id limit 1", [own.eval_unit_id, insp])).rows[0]?.id;
  assert.ok(otherTeamCard, "같은 사업에 다른 부서 카드가 있어야 시험할 수 있음");
  const insert = "insert into public.reports (eval_unit_id, year, team_id, created_by) values ($1, 2036, $2, $3) returning id";
  const mine = (await as("pmo", () => db.query<{ id: number }>(insert, [own.eval_unit_id, insp, users.pmo]))).rows[0].id;
  const theirs = (await as("pmo", () => db.query<{ id: number }>(insert, [own.eval_unit_id, lic, users.pmo]))).rows[0].id;
  const rm = (await as("inspector", () => db.query<{ id: string }>("insert into public.report_materials (report_id, storage_path, file_name, uploaded_by) values ($1, $2, 'a.pdf', $3) returning id", [mine, `${mine}/a.pdf`, users.inspector]))).rows[0].id;
  const rmTheirs = (await db.query<{ id: string }>("insert into public.report_materials (report_id, storage_path, file_name, uploaded_by) values ($1, $2, 'b.pdf', $3) returning id", [theirs, `${theirs}/b.pdf`, users.license])).rows[0].id;
  try {
    await fn({ mine, theirs, rm, rmTheirs, ownCard: own.id, otherTeamCard });
  } finally {
    await db.query("delete from public.prep_jobs");
    await db.query("delete from public.report_materials where report_id in ($1, $2)", [mine, theirs]);
    await db.query("delete from public.reports where id in ($1, $2)", [mine, theirs]);
  }
}

test("과제 대응표(3단계): 카드를 볼 수 있는 사람만 읽고, 확정·뺌은 성과관리팀·관리자만 쓰고, 제안자·상태 값은 제약을 따른다", { skip: NO_SEED_CARDS }, async () => {
  const own = (await firstCard("검사기획팀")).id;
  const other = (await firstCard("자격기획팀")).id;
  await withKnowledgeFixture(async () => {
    await db.query("insert into public.card_knowledge_scope (card_id, chunk_key, method) values ($1, 'prep-test/1', 'ai'), ($2, 'prep-test/1', 'ai')", [own, other]);
    const seen = (u: keyof typeof users) => as(u, () => count("select 1 from public.card_knowledge_scope where chunk_key = 'prep-test/1'"));
    assert.equal(await seen("inspector"), 1, "담당 부서는 자기 카드 행만");
    assert.equal(await seen("license"), 1);
    assert.equal(await seen("pmo"), 2);
    await rejects(() => as("inspector", () => db.query("insert into public.card_knowledge_scope (card_id, chunk_key, method) values ($1, 'prep-test/2', 'human')", [own])), /row-level security/);
    assert.equal((await as("inspector", () => db.query("update public.card_knowledge_scope set status = 'confirmed' where card_id = $1", [own]))).affectedRows, 0, "담당자는 확정 못 함");
    assert.equal((await as("inspector", () => db.query("delete from public.card_knowledge_scope where card_id = $1", [own]))).affectedRows, 0, "담당자는 못 지움");
    assert.equal((await as("pmo", () => db.query("update public.card_knowledge_scope set status = 'confirmed', confirmed_by = $2 where card_id = $1 and chunk_key = 'prep-test/1'", [own, users.pmo]))).affectedRows, 1);
    await as("pmo", () => db.query("insert into public.card_knowledge_scope (card_id, chunk_key, method) values ($1, 'prep-test/2', 'human')", [own]));
    await rejects(() => as("admin", () => db.query("insert into public.card_knowledge_scope (card_id, chunk_key, method, status) values ($1, 'prep-test/2', 'ai', 'done')", [other])), /check/);
    await rejects(() => as("admin", () => db.query("insert into public.card_knowledge_scope (card_id, chunk_key, method) values ($1, 'prep-test/2', 'guess')", [other])), /check/);
    await db.exec("set role anon");
    try {
      await rejects(() => db.query("select 1 from public.card_knowledge_scope"), /permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });
});

test("공통 지식 선별 결과(card_knowledge_select): 부서 담당자는 지정된 카드 행만 읽고 쓰지 못함, 성과관리팀·관리자는 읽고 씀, 순위는 1부터, 익명 차단, 조각이 지워지면 함께", { skip: NO_SEED_CARDS }, async () => {
  const own = (await firstCard("검사기획팀")).id;
  const other = (await firstCard("자격기획팀")).id;
  await withKnowledgeFixture(async () => {
    await db.query("insert into public.card_knowledge_select (card_id, chunk_key, rank, score, judge) values ($1, 'prep-test/1', 1, 0.9, 'test'), ($2, 'prep-test/1', 1, 0.8, 'test')", [own, other]);
    const seen = (u: keyof typeof users) => as(u, () => count("select 1 from public.card_knowledge_select where chunk_key = 'prep-test/1'"));
    assert.equal(await seen("inspector"), 1, "부서 담당자는 지정된 자기 카드 행만");
    assert.equal(await seen("license"), 1);
    assert.equal(await seen("pmo"), 2);
    assert.equal(await seen("admin"), 2);
    // 같은 팀이어도 지정을 빼면 안 보임
    await db.query("delete from public.card_assignees where user_id = $1 and card_id = $2", [users.inspector, own]);
    try {
      assert.equal(await seen("inspector"), 0, "지정 안 된 카드는 안 보임");
    } finally {
      await assignTeams();
    }
    // 부서 담당자는 쓰지 못함
    await rejects(() => as("inspector", () => db.query("insert into public.card_knowledge_select (card_id, chunk_key, rank, judge) values ($1, 'prep-test/2', 2, 'x')", [own])), /row-level security/);
    assert.equal((await as("inspector", () => db.query("update public.card_knowledge_select set rank = 5 where card_id = $1", [own]))).affectedRows, 0, "담당자는 못 고침");
    assert.equal((await as("inspector", () => db.query("delete from public.card_knowledge_select where card_id = $1", [own]))).affectedRows, 0, "담당자는 못 지움");
    // 성과관리팀·관리자는 넣고 고치고 지움
    await as("pmo", () => db.query("insert into public.card_knowledge_select (card_id, chunk_key, rank, judge) values ($1, 'prep-test/2', 2, 'x')", [own]));
    assert.equal((await as("pmo", () => db.query("update public.card_knowledge_select set rank = 3 where card_id = $1 and chunk_key = 'prep-test/2'", [own]))).affectedRows, 1);
    assert.equal((await as("admin", () => db.query("delete from public.card_knowledge_select where card_id = $1 and chunk_key = 'prep-test/2'", [own]))).affectedRows, 1);
    await as("admin", () => db.query("insert into public.card_knowledge_select (card_id, chunk_key, rank, judge) values ($1, 'prep-test/2', 2, 'x')", [other]));
    await rejects(() => as("admin", () => db.query("insert into public.card_knowledge_select (card_id, chunk_key, rank, judge) values ($1, 'prep-test/2', 0, 'x')", [own])), /check/);
    await rejects(() => as("admin", () => db.query("insert into public.card_knowledge_select (card_id, chunk_key, rank) values ($1, 'prep-test/2', 1)", [own])), /null/);
    await db.exec("set role anon");
    try {
      await rejects(() => db.query("select 1 from public.card_knowledge_select"), /permission denied/);
    } finally {
      await db.exec("reset role");
    }
    // 조각이 지워지면 그 행도
    await db.query("delete from public.knowledge_chunks where chunk_key = 'prep-test/2'");
    assert.equal(await count("select 1 from public.card_knowledge_select where chunk_key = 'prep-test/2'"), 0);
  });
  assert.equal(await count("select 1 from public.card_knowledge_select where chunk_key like 'prep-test/%'"), 0, "문서를 지우면 조각과 함께 지워짐");
});

test("일반 문서(5단계 범용 조각기): generic_section 유형·검색 전용 표지가 제약 없이 들어가고, 성과관리팀만 문서를 지우며, 지우면 조각과 과제 대응표 행(사람이 확정한 행 포함)이 함께 지워진다", { skip: NO_SEED_CARDS }, async () => {
  const own = (await firstCard("검사기획팀")).id;
  await as("pmo", () => db.query("insert into public.knowledge_documents (doc_id, title, file_name, status) values ('up-gen', 't', 't.pdf', 'ingest')"));
  try {
    await as("pmo", () =>
      db.query(
        "insert into public.knowledge_chunks (chunk_key, doc_id, seq, unit_type, track, title, context_prefix, blocks, text, search_text, meta) values ('up-gen/g0000', 'up-gen', 0, 'generic_section', '주요사업', 't', 'p', '[]'::jsonb, 'x', 'x', '{\"generic\": true, \"search_only\": true}'::jsonb)",
      ),
    );
    await db.query("insert into public.card_knowledge_scope (card_id, chunk_key, method, status) values ($1, 'up-gen/g0000', 'ai', 'confirmed')", [own]);
    assert.equal(await count("select 1 from public.knowledge_chunks where unit_type = 'generic_section' and meta->>'search_only' = 'true'"), 1, "새 유형·표지는 마이그레이션 없이 들어감");
    assert.equal((await as("inspector", () => db.query("delete from public.knowledge_documents where doc_id = 'up-gen'"))).affectedRows, 0, "부서 담당자는 못 지움");
    assert.equal((await as("pmo", () => db.query("delete from public.knowledge_documents where doc_id = 'up-gen'"))).affectedRows, 1);
    assert.equal(await count("select 1 from public.knowledge_chunks where doc_id = 'up-gen'"), 0, "조각도 지워짐");
    assert.equal(await count("select 1 from public.card_knowledge_scope where chunk_key = 'up-gen/g0000'"), 0, "대응표 행도 지워짐");
  } finally {
    await db.query("delete from public.knowledge_documents where doc_id = 'up-gen'");
  }
});

test("옛 knowledge_card_links는 이관 뒤에도 그대로 남아 있다(운영 확인 전에는 지우지 않음)", { skip: NO_SEED_CARDS }, async () => {
  assert.equal(await count("select 1 from information_schema.tables where table_schema = 'public' and table_name = 'knowledge_card_links'"), 1);
});

test("보고서 추가자료↔과제 연결(3단계): 그 보고서의 사업·부서 활성 카드에만 잇고, 남의 부서는 읽지도 잇지도 못하고, 제출하면 부서는 못 바꾼다", { skip: NO_SEED_CARDS }, async () => {
  await withReportFixture(async ({ mine, rm, rmTheirs, ownCard, otherTeamCard }) => {
    await as("inspector", () => db.query("insert into public.report_material_cards (material_id, card_id, status, method) values ($1, $2, 'confirmed', 'human')", [rm, ownCard]));
    await rejects(() => as("inspector", () => db.query("insert into public.report_material_cards (material_id, card_id, method) values ($1, $2, 'human')", [rm, otherTeamCard])), /row-level security/);
    await rejects(() => as("inspector", () => db.query("insert into public.report_material_cards (material_id, card_id, method) values ($1, $2, 'human')", [rmTheirs, ownCard])), /row-level security/);
    await rejects(() => as("inspector", () => db.query("insert into public.report_material_cards (material_id, card_id, method) values ($1, $2, 'rule')", [rm, ownCard])), /check/);
    assert.equal(await as("inspector", () => count("select 1 from public.report_material_cards")), 1);
    assert.equal(await as("license", () => count("select 1 from public.report_material_cards")), 0, "다른 부서는 못 읽음");
    assert.equal(await as("pmo", () => count("select 1 from public.report_material_cards")), 1);
    await as("inspector", () => db.query("update public.reports set status = 'drafting' where id = $1", [mine])); // 전이 표: 작성 중을 거쳐 제출(2026-10-10)
    await as("inspector", () => db.query("update public.reports set status = 'submitted' where id = $1", [mine]));
    assert.equal((await as("inspector", () => db.query("delete from public.report_material_cards where material_id = $1", [rm]))).affectedRows, 0, "제출한 보고서는 부서가 못 바꿈");
    assert.equal((await as("pmo", () => db.query("delete from public.report_material_cards where material_id = $1", [rm]))).affectedRows, 1, "성과관리팀은 바꿈");
    // 3-5 재정의(정리 마이그레이션): AI 제안 상태(auto·candidate)는 없앰 — 사람이 확정한 것만 담음
    await rejects(() => db.query("insert into public.report_material_cards (material_id, card_id, method, status) values ($1, $2, 'ai', 'candidate')", [rm, ownCard]), /check/);
    await rejects(() => db.query("insert into public.report_material_cards (material_id, card_id, method, status) values ($1, $2, 'ai', 'auto')", [rm, ownCard]), /check/);
    await db.query("insert into public.report_material_cards (material_id, card_id, method) values ($1, $2, 'human')", [rm, ownCard]);
    assert.equal(await count("select 1 from public.report_material_cards where status = 'confirmed'"), 1, "상태를 안 적어도 확정(기본값)");
    await db.query("delete from public.report_materials where id = $1", [rm]);
    assert.equal(await count("select 1 from public.report_material_cards where material_id = $1", [rm]), 0, "자료를 지우면 연결도 사라짐");
  });
});

test("근거 목록표 표는 정리 마이그레이션으로 없어졌다(3-5 재정의 — 목록표는 요청 때 계산)", { skip: NO_SEED_CARDS }, async () => {
  assert.equal(await count("select 1 from information_schema.tables where table_schema = 'public' and table_name = 'card_context_manifest'"), 0);
});

test("작업 대기열(3단계): 자기 이름으로 그 대상 권한이 있을 때만 등록하고, 같은 대상 대기 작업은 하나, 처리 상태는 처리기만 바꾼다", { skip: NO_SEED_CARDS }, async () => {
  const own = (await firstCard("검사기획팀")).id;
  const other = (await firstCard("자격기획팀")).id;
  const ins = "insert into public.prep_jobs (kind, target, requested_by) values ($1, $2, $3)";
  await withReportFixture(async ({ rm, rmTheirs }) => {
    await as("inspector", () => db.query(ins, ["match_knowledge", own, users.inspector]));
    await rejects(() => as("inspector", () => db.query(ins, ["match_knowledge", own, users.inspector])), /duplicate key/);
    await rejects(() => as("inspector", () => db.query(ins, ["match_knowledge", other, users.inspector])), /row-level security/);
    await rejects(() => as("inspector", () => db.query(ins, ["match_knowledge", own, users.pmo])), /row-level security/);
    // 정리 마이그레이션 뒤: 처리기가 있는 작업은 match_knowledge뿐 — 없앤 종류는 등록 권한도 없고 값 검사에도 걸림
    await rejects(() => as("inspector", () => db.query(ins, ["build_manifest", own, users.inspector])), /row-level security/);
    await rejects(() => as("inspector", () => db.query(ins, ["match_report_material", rm, users.inspector])), /row-level security/);
    await rejects(() => as("inspector", () => db.query(ins, ["match_report_material", rmTheirs, users.inspector])), /row-level security/);
    await rejects(() => db.query("insert into public.prep_jobs (kind, target) values ('build_manifest', $1)", [own]), /check/);
    await rejects(() => as("inspector", () => db.query("insert into public.prep_jobs (kind, target, requested_by, status) values ('match_knowledge', $1, $2, 'done')", [own, users.inspector])), /permission denied/);
    await rejects(() => as("inspector", () => db.query("update public.prep_jobs set status = 'done'")), /permission denied/);
    assert.equal(await as("inspector", () => count("select 1 from public.prep_jobs")), 1, "본인이 건 작업");
    assert.equal(await as("license", () => count("select 1 from public.prep_jobs")), 0);
    assert.equal(await as("pmo", () => count("select 1 from public.prep_jobs")), 1);

    // 처리기(service_role)는 상태를 바꾸고, 사용자 없이(user_id 없음) AI 호출 기록을 남길 수 있다
    await db.exec("discard all");
    await db.exec("set role service_role");
    let jobId: number;
    try {
      await db.query("update public.prep_jobs set status = 'running', started_at = now(), attempts = attempts + 1 where kind = 'match_knowledge' and target = $1", [own]);
      jobId = (await db.query<{ id: number }>("select id from public.prep_jobs where kind = 'match_knowledge' and target = $1", [own])).rows[0].id;
      await db.query("insert into public.ai_requests (user_id, job_id, feature, status) values (null, $1, 'prep_match', 'ok')", [jobId]);
      await db.query("insert into public.prep_jobs (kind, target) values ('match_knowledge', $1)", [own]); // 실행 중인 것과 대기 작업은 함께 있을 수 있음
    } finally {
      await db.exec("reset role");
    }
    assert.equal(await as("inspector", () => count("select 1 from public.ai_requests where feature = 'prep_match'")), 0, "사용자 없는 기록은 성과관리팀만 봄");
    assert.equal(await as("pmo", () => count("select 1 from public.ai_requests where feature = 'prep_match'")), 1);
    await db.query("delete from public.ai_requests where feature = 'prep_match'");
  });
});

test("지표 단위 부분(eval_unit_report_parts, R5b): 성과관리팀 쓰기·확정, 그 지표·연도에 보고서 행이 있는 부서는 읽기만, 다른 지표·연도는 못 읽음, 주관 부서는 쓰되 확정 못 함, 지표·연도·부분 불변, 부분 허용 목록", { skip: NO_SEED_CARDS }, async () => {
  const team = async (name: string) => (await db.query<{ id: number }>("select id from public.teams where name = $1", [name])).rows[0].id;
  const insp = await team("검사기획팀");
  const lic = await team("자격기획팀");
  // 시험용 경영관리 지표 둘(실제 MG-1~14와 겹치지 않는 id)
  await db.query("insert into public.eval_units (id, track, name, sort) values ('MG-90', '경영관리', '시험 지표 90', 90), ('MG-91', '경영관리', '시험 지표 91', 91)");
  await db.query("insert into public.reports (eval_unit_id, year, team_id) values ('MG-90', 2026, $1)", [insp]);
  const ins = "insert into public.eval_unit_report_parts (eval_unit_id, year, part, spec) values ($1, $2, $3, '{\"part\":\"x\"}') returning updated_at::text";
  const stamp = async (unit: string, year: number, part: string) => (await db.query<{ updated_at: string; updated_by: string; status: string }>("select updated_at::text, updated_by, status from public.eval_unit_report_parts where eval_unit_id = $1 and year = $2 and part = $3", [unit, year, part])).rows[0];
  try {
    // 성과관리팀: 넣고 고치고 확정, 고친 사람은 트리거가 채움, 고치면 updated_at(버전)이 바뀜
    await as("pmo", () => db.query(ins, ["MG-90", 2026, "findings"]));
    await as("pmo", () => db.query(ins, ["MG-90", 2027, "findings"]));
    await as("pmo", () => db.query(ins, ["MG-91", 2026, "findings"]));
    const v0 = await stamp("MG-90", 2026, "findings");
    assert.equal(v0.updated_by, users.pmo, "고친 사람은 트리거가 채움");
    assert.equal(v0.status, "draft");
    await as("admin", () => db.query("update public.eval_unit_report_parts set spec = '{\"part\":\"y\"}', status = 'confirmed' where eval_unit_id = 'MG-90' and year = 2026 and part = 'findings'"));
    const v1 = await stamp("MG-90", 2026, "findings");
    assert.equal(v1.updated_by, users.admin);
    assert.equal(v1.status, "confirmed");
    assert.notEqual(v1.updated_at, v0.updated_at, "고치면 버전이 바뀜");
    const stale = await as("pmo", () => db.query("update public.eval_unit_report_parts set spec = '{}' where eval_unit_id = 'MG-90' and year = 2026 and part = 'findings' and updated_at = $1::timestamptz", [v0.updated_at]));
    assert.equal(stale.affectedRows, 0, "읽을 때의 버전이 아니면 0행(서버가 「다른 곳에서 바뀜」)");
    assert.equal(await as("pmo", () => count("select 1 from public.eval_unit_report_parts")), 3);
    assert.equal(await as("admin", () => count("select 1 from public.eval_unit_report_parts")), 3);

    // 그 지표·연도에 보고서 행이 있는 부서(검사기획팀 — MG-90 2026)는 그 행만 읽음, 쓰기는 못 함
    assert.equal(await as("inspector", () => count("select 1 from public.eval_unit_report_parts")), 1, "다른 지표(MG-91)·다른 연도(2027)는 못 읽음");
    assert.equal(await as("license", () => count("select 1 from public.eval_unit_report_parts")), 0, "보고서 행이 없는 부서는 못 읽음");
    await rejects(() => as("inspector", () => db.query(ins, ["MG-90", 2026, "prior"])), /row-level security/);
    assert.equal((await as("inspector", () => db.query("update public.eval_unit_report_parts set spec = '{}' where eval_unit_id = 'MG-90'"))).affectedRows, 0, "부서는 고치지 못함");
    assert.equal((await as("pmo", () => db.query("delete from public.eval_unit_report_parts where eval_unit_id = 'MG-90' and year = 2027"))).affectedRows, 1, "성과관리팀은 지움");

    // 주관 부서(자격기획팀 — MG-91): 보고서 행 없이도 읽고 쓰되, 확정(status)은 못 바꾸고 확정으로 넣지도 못하고 지우지도 못함
    await db.query("update public.eval_units set lead_team_id = $1 where id = 'MG-91'", [lic]);
    assert.equal(await as("license", () => count("select 1 from public.eval_unit_report_parts")), 1);
    await as("license", () => db.query(ins, ["MG-91", 2026, "outcome"]));
    assert.equal((await stamp("MG-91", 2026, "outcome")).updated_by, users.license);
    assert.equal((await as("license", () => db.query("update public.eval_unit_report_parts set spec = '{\"part\":\"z\"}' where eval_unit_id = 'MG-91' and part = 'findings'"))).affectedRows, 1);
    await rejects(() => as("license", () => db.query("update public.eval_unit_report_parts set status = 'confirmed' where eval_unit_id = 'MG-91' and part = 'findings'")), /확정은 성과관리팀만/);
    await rejects(() => as("license", () => db.query("insert into public.eval_unit_report_parts (eval_unit_id, year, part, spec, status) values ('MG-91', 2026, 'prior', '{}', 'confirmed')")), /확정은 성과관리팀만/);
    assert.equal((await as("license", () => db.query("delete from public.eval_unit_report_parts where eval_unit_id = 'MG-91'"))).affectedRows, 0, "주관 부서는 지우지 못함");
    await rejects(() => as("license", () => db.query(ins, ["MG-90", 2026, "outcome"])), /row-level security/);
    // 주관 부서 지정을 풀면 다시 못 읽음
    await db.query("update public.eval_units set lead_team_id = null where id = 'MG-91'");
    assert.equal(await as("license", () => count("select 1 from public.eval_unit_report_parts")), 0);

    // 지표·연도·부분은 성과관리팀도 못 바꿈, 부분은 허용 목록만
    await rejects(() => as("pmo", () => db.query("update public.eval_unit_report_parts set part = 'prior' where eval_unit_id = 'MG-90' and part = 'findings'")), /바꿀 수 없습니다/);
    await rejects(() => as("pmo", () => db.query("update public.eval_unit_report_parts set year = 2028 where eval_unit_id = 'MG-90' and part = 'findings'")), /바꿀 수 없습니다/);
    await rejects(() => as("pmo", () => db.query("update public.eval_unit_report_parts set eval_unit_id = 'MG-91' where eval_unit_id = 'MG-90' and part = 'findings'")), /바꿀 수 없습니다/);
    await rejects(() => as("pmo", () => db.query(ins, ["MG-90", 2026, "direction"])), /check constraint/);
    await rejects(() => as("pmo", () => db.query("insert into public.eval_unit_report_parts (eval_unit_id, year, part, spec, status) values ('MG-90', 2026, 'cover', '{}', 'done')")), /check constraint/);
    await rejects(() => as("pmo", () => db.query(ins, ["MG-90", 2026, "findings"])), /duplicate key/);
  } finally {
    await db.query("delete from public.eval_unit_report_parts where eval_unit_id in ('MG-90', 'MG-91')");
    await db.query("delete from public.reports where eval_unit_id in ('MG-90', 'MG-91')");
    await db.query("delete from public.eval_units where id in ('MG-90', 'MG-91')");
  }
});
