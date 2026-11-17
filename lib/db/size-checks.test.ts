// 큰 JSON·글 열의 크기 상한과 jsonb 모양 검사(2026-11-17 근본책 4단계 — supabase/migrations/20261117160000_size_checks.sql).
// 열마다 상한 바로 아래(= 상한 바이트)는 들어가고 바로 위(+1바이트)는 check_violation(23514), 기대 모양이 아니면 위반, 운영 최대 크기 값은 통과.
// 모두 postgres(RLS를 건너뛰는 역할 — 서비스 키·스크립트와 같은 자리)로 써서, CHECK가 역할과 무관하게 걸리는지 봅니다.
// 큰 값은 SQL repeat()로 DB 안에서 만듭니다. 카드 원본(seed) 없이 마이그레이션만 올리므로 늘 돕니다. PGroonga 검색 마이그레이션은 건너뜁니다.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./supabase-stub.ts";

const MIGRATIONS = join(resolve(import.meta.dirname, "../.."), "supabase/migrations");
const SKIP = [/_search(_\w+)?\.sql$/];
const SIZE_FILE = "20261117160000_size_checks.sql";
const USER = "00000000-0000-0000-0000-0000000000a4";

const MiB = 1024 * 1024;

/** 바이트 상한을 건 열: 표·열·상한·모양·고칠 행 조건(시험 바탕 행) */
interface Col {
  table: string;
  col: string;
  max: number;
  shape: "object" | "array" | "text";
  where: string;
  /** 운영(또는 로컬) 최대 바이트 — 이 크기는 통과해야 함 */
  real?: number;
}

const COLS: Col[] = [
  { table: "cards", col: "data", max: 4 * MiB, shape: "object", where: "id = 'c1'", real: 42_121 },
  { table: "cards", col: "layout", max: 16 * MiB, shape: "object", where: "id = 'c1'", real: 318_755 },
  { table: "cards", col: "original_html", max: 8 * MiB, shape: "text", where: "id = 'c1'", real: 19_885 },
  { table: "card_versions", col: "data", max: 4 * MiB, shape: "object", where: "card_id = 'c1'", real: 15_109 },
  { table: "card_versions", col: "base", max: 4 * MiB, shape: "object", where: "card_id = 'c1'" },
  { table: "card_edits", col: "before", max: 4 * MiB, shape: "object", where: "card_id = 'c1'" },
  { table: "card_edits", col: "after", max: 4 * MiB, shape: "object", where: "card_id = 'c1'" },
  { table: "card_import_items", col: "parsed", max: 4 * MiB, shape: "object", where: "seq = 1" },
  { table: "card_import_items", col: "layout", max: 16 * MiB, shape: "object", where: "seq = 1" },
  { table: "card_report_drafts", col: "spec", max: 4 * MiB, shape: "object", where: "card_id = 'c1'", real: 25_537 },
  { table: "card_report_drafts", col: "outline", max: 4 * MiB, shape: "object", where: "card_id = 'c1'", real: 30_719 },
  { table: "eval_unit_report_parts", col: "spec", max: 4 * MiB, shape: "object", where: "eval_unit_id = 'MG-1'" },
  { table: "report_draft_edits", col: "before", max: 4 * MiB, shape: "object", where: "card_id = 'c1'" },
  { table: "report_draft_edits", col: "after", max: 4 * MiB, shape: "object", where: "card_id = 'c1'" },
  { table: "inspections", col: "result", max: 8 * MiB, shape: "object", where: "card_id = 'c1'" },
  { table: "ai_results", col: "result", max: 8 * MiB, shape: "object", where: `user_id = '${USER}'` },
  { table: "reports", col: "blocks", max: 8 * MiB, shape: "array", where: "eval_unit_id = 'BZ-1'", real: 2 },
  { table: "reports", col: "inputs", max: 1 * MiB, shape: "object", where: "eval_unit_id = 'BZ-1'", real: 2 },
  { table: "prep_jobs", col: "payload", max: 1 * MiB, shape: "object", where: "target = 'c1'" },
];

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !SKIP.some((s) => s.test(f))).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  // 시험 바탕 행(열마다 한 행 — 아래 시험은 이 행을 고쳐 봄). 모두 postgres로 넣음
  await db.exec(`
    insert into auth.users (id, email) values ('${USER}', 'size-test@kca.test');
    insert into public.teams (name) values ('크기시험팀');
    insert into public.eval_units (id, track, name) values ('BZ-1', '주요사업', '시험사업'), ('MG-1', '경영관리', '시험지표') on conflict (id) do nothing;
    insert into public.cards (id, eval_unit_id, task_no, title, edition, data, team_id)
      values ('c1', 'BZ-1', '1-가', '시험 과제', '261103', '{"id":"c1","taskNo":"1-가","title":"시험 과제"}', (select id from public.teams where name = '크기시험팀'));
    insert into public.card_versions (card_id, period, version, data, base) values ('c1', '2026-11', 1, '{"id":"c1"}', '{"id":"c1"}');
    insert into public.card_edits (card_id, before, after) values ('c1', '{}', '{}');
    insert into public.card_imports (created_by) values ('${USER}');
    insert into public.card_import_items (import_id, file_n, seq, parsed, match) values ((select max(id) from public.card_imports), 1, 1, '{}', 'none');
    insert into public.card_report_drafts (card_id, year, spec, outline, outline_status) values ('c1', 2026, '{}', '{}', 'draft');
    insert into public.eval_unit_report_parts (eval_unit_id, year, part, spec) values ('MG-1', 2026, 'cover', '{}');
    insert into public.report_draft_edits (card_id, year, block_index, kind, before, after, edited_by) values ('c1', 2026, 0, 'edit', '{}', '{}', '${USER}');
    insert into public.inspections (card_id, period) values ('c1', '2026-11');
    insert into public.ai_requests (feature, status, user_id) values ('card_assist', 'ok', '${USER}');
    insert into public.ai_results (request_id, user_id, feature, result) values ((select max(id) from public.ai_requests), '${USER}', 'card_assist', '{}');
    insert into public.reports (eval_unit_id, year, team_id) values ('BZ-1', 2026, (select id from public.teams where name = '크기시험팀'));
    insert into public.prep_jobs (kind, target) values ('match_knowledge', 'c1');
  `);
});

after(async () => {
  await db?.close();
});

/**
 * 정확히 n바이트(::text 기준)인 값의 SQL 식. object = {"t": "aaa…"}(n-9자), array = ["aaa…"](n-4자), text = aaa…(n자)
 * (jsonb 글 표현은 콜론 뒤에 공백 하나 — octet_length(jsonb_build_object('t', 'ab')::text) = 2 + 9)
 */
function sized(shape: Col["shape"], n: number): string {
  if (shape === "object") return `jsonb_build_object('t', repeat('a', ${n - 9}))`;
  if (shape === "array") return `jsonb_build_array(repeat('a', ${n - 4}))`;
  return `repeat('a', ${n})`;
}

/** postgres로 한 열을 고쳐 봄 — 성공이면 null, 실패면 오류 코드와 제약 이름 */
async function write(c: Col, expr: string): Promise<{ code: string; constraint: string } | null> {
  try {
    const r = await db.query(`update public.${c.table} set ${c.col} = ${expr} where ${c.where}`);
    assert.equal(r.affectedRows, 1, `${c.table}.${c.col} 바탕 행이 하나여야 함`);
    return null;
  } catch (e) {
    const err = e as { code?: string; constraint?: string; message: string };
    return { code: err.code ?? "?", constraint: err.constraint ?? err.message };
  }
}

test("크기 계산 도우미: 만든 값의 ::text 바이트가 정확히 n", async () => {
  for (const shape of ["object", "array", "text"] as const) {
    const expr = shape === "text" ? sized(shape, 1234) : `(${sized(shape, 1234)})::text`;
    const { rows } = await db.query<{ n: number }>(`select octet_length(${expr})::int as n`);
    assert.equal(rows[0].n, 1234, shape);
  }
});

test("열마다 상한 바이트까지는 들어가고 1바이트 넘으면 <표>_<열>_size 위반(postgres로 써도)", async () => {
  for (const c of COLS) {
    assert.equal(await write(c, sized(c.shape, c.max)), null, `${c.table}.${c.col} 상한 ${c.max} 바이트는 통과`);
    assert.deepEqual(await write(c, sized(c.shape, c.max + 1)), { code: "23514", constraint: `${c.table}_${c.col}_size` }, `${c.table}.${c.col} 상한 + 1`);
  }
});

test("jsonb 열은 기대 모양(object/array)이 아니면 <표>_<열>_shape 위반", async () => {
  for (const c of COLS.filter((c) => c.shape !== "text")) {
    const wrong = c.shape === "object" ? ["'[]'::jsonb", "'\"글\"'::jsonb", "'1'::jsonb", "'null'::jsonb"] : ["'{}'::jsonb", "'\"글\"'::jsonb", "'null'::jsonb"];
    for (const w of wrong) assert.deepEqual(await write(c, w), { code: "23514", constraint: `${c.table}_${c.col}_shape` }, `${c.table}.${c.col} = ${w}`);
  }
});

test("운영(로컬) 최대 크기의 값과 빈 기본값은 그대로 통과 — null 허용 열은 null도", async () => {
  for (const c of COLS) {
    if (c.real) assert.equal(await write(c, sized(c.shape, Math.max(c.real, c.shape === "object" ? 9 : 4))), null, `${c.table}.${c.col} ${c.real} 바이트`);
    assert.equal(await write(c, c.shape === "object" ? "'{}'::jsonb" : c.shape === "array" ? "'[]'::jsonb" : "''"), null, `${c.table}.${c.col} 빈 값`);
  }
  const nullable = [
    ["cards", "layout"],
    ["cards", "original_html"],
    ["card_versions", "base"],
    ["card_import_items", "layout"],
    ["card_report_drafts", "spec"],
  ];
  for (const [t, col] of nullable) assert.equal(await write(COLS.find((c) => c.table === t && c.col === col)!, "null"), null, `${t}.${col} null`);
});

test("새 행 넣기도 같은 제약: 큰 카드 JSON·배열 카드 JSON은 거절, 보통 카드는 들어감(postgres)", async () => {
  const insert = (id: string, data: string) => db.query(`insert into public.cards (id, eval_unit_id, task_no, title, edition, data) values ('${id}', 'BZ-1', '${id}', '시험', '261103', ${data})`);
  await assert.rejects(() => insert("c-big", sized("object", 4 * MiB + 1)), (e: { code?: string; constraint?: string }) => e.code === "23514" && e.constraint === "cards_data_size");
  await assert.rejects(() => insert("c-arr", "'[]'::jsonb"), (e: { code?: string; constraint?: string }) => e.code === "23514" && e.constraint === "cards_data_shape");
  await insert("c-ok", sized("object", 42_121));
  const { rows } = await db.query<{ n: number }>("select count(*)::int as n from public.cards where id in ('c-big', 'c-arr', 'c-ok')");
  assert.equal(rows[0].n, 1);
});

test("프로필 이름은 100자까지 — 넘으면 profiles_display_name_length 위반(한글은 글자 수로 셈)", async () => {
  const set = async (name: string) => {
    try {
      await db.query("update public.profiles set display_name = $1 where id = $2", [name, USER]);
      return null;
    } catch (e) {
      return (e as { constraint?: string }).constraint ?? (e as Error).message;
    }
  };
  assert.equal(await set("가".repeat(100)), null, "한글 100자(300바이트)는 통과");
  assert.equal(await set("홍길동"), null);
  assert.equal(await set("가".repeat(101)), "profiles_display_name_length");
});

test("마이그레이션 머리 주석의 반영 전 확인 SQL이 그대로 돌고, 정상 행만 있으면 0행", async () => {
  const head = readFileSync(join(MIGRATIONS, SIZE_FILE), "utf8").split("\n");
  const from = head.findIndex((l) => /^--\s+select 'cards\.data'/.test(l));
  assert.ok(from > 0, "확인 SQL 첫 줄");
  const lines: string[] = [];
  for (const l of head.slice(from)) {
    lines.push(l.replace(/^--\s+/, ""));
    if (l.trimEnd().endsWith(";")) break;
  }
  const sql = lines.join("\n");
  // 시험 바탕 행을 정상 값으로 되돌린 뒤 돌림
  for (const c of COLS) await write(c, c.shape === "object" ? "'{}'::jsonb" : c.shape === "array" ? "'[]'::jsonb" : "''");
  const { rows } = await db.query(sql);
  assert.deepEqual(rows, []);
  // 확인 SQL이 모든 대상 표를 훑는지(표 이름이 빠지지 않게)
  for (const t of new Set([...COLS.map((c) => c.table), "profiles"])) assert.ok(sql.includes(`public.${t} `), `확인 SQL에 ${t}`);
});
