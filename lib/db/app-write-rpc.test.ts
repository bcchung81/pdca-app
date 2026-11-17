// 앱 서버 경유 표지를 요구하는 공개 rpc(2026-11-17 근본책 2단계 — supabase/migrations/20261117150000_app_write_rpcs.sql).
// 공개 security definer 함수 7개는 맨 앞에서 표지(private.app_write())를 확인합니다: 로그인 사용자라도 표지가 없거나 틀리면 42501로 거절하고
// 아무것도 하지 않으며, 맞는 표지면 첫 줄을 지나 예전처럼 돕니다. sql에서 plpgsql로 바꾼 5개는 0행이어도 반환 열 형식이 맞아야 오류 없이 끝나므로
// 「맞는 표지 → 오류 없음」이 본문 구조까지 확인합니다. 각 함수의 행 판정·한도는 migrations.test.ts가 표지를 싣고(as) 확인합니다.
// 카드 원본(seed) 없이 마이그레이션만 올리므로 늘 돕니다. PGroonga 검색 마이그레이션(search_knowledge — security invoker)은 건너뜁니다.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { after, before, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { SUPABASE_STUB } from "./supabase-stub.ts";

const MIGRATIONS = join(resolve(import.meta.dirname, "../.."), "supabase/migrations");
const SKIP = [/_search(_\w+)?\.sql$/];
/** 시험용 표지(운영 키와 무관한 고정 값) — before에서 그 sha256을 키 표에 넣음 */
const KEY = "test-app-write-key-not-a-secret";
/** 시험 계정(가입 트리거가 부서 담당자·팀 없음으로 만듦) */
const USER = "00000000-0000-0000-0000-0000000000e1";
const REFUSED = "앱 서버를 거친 요청만 받습니다";
const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const FINISH_KEY = "rpc-test-finish-key";

/** 표지 확인을 맨 앞에 둔 공개 rpc와 부르는 SQL(맞는 표지면 오류 없이 끝나는 인자). 끝맺기는 시작이 만든 id를 $1로 받음 */
const RPCS = {
  start_ai_request: { sql: "select public.start_ai_request('card_assist', null, null, null, $1::text[]) as r", params: [[sha(FINISH_KEY)]] },
  finish_ai_request: { sql: "select public.finish_ai_request($1, $2, 'ok') as r", params: [0, FINISH_KEY] },
  report_submit_cards: { sql: "select * from public.report_submit_cards(0)", params: [] },
  mg_biz_refs: { sql: "select * from public.mg_biz_refs('MG-0', 2026)", params: [] },
  mg_biz_ref_texts: { sql: "select * from public.mg_biz_ref_texts('MG-0', 2026, '{}'::text[])", params: [] },
  mg_biz_stale: { sql: "select * from public.mg_biz_stale('{}'::text[], 2026)", params: [] },
  report_outline_context: { sql: "select * from public.report_outline_context('BZ-0', 2026)", params: [] },
} as const;
type RpcName = keyof typeof RPCS;
const NAMES = Object.keys(RPCS) as RpcName[];

let db: PGlite;

before(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql") && !SKIP.some((s) => s.test(f))).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), "utf8"));
  await db.query("insert into private.app_write_key (hash, note) values ($1, '시험')", [sha(KEY)]);
  await db.query("insert into auth.users (id, email) values ($1, 'rpc-test@kca.test')", [USER]);
});

after(async () => {
  await db?.close();
});

/** 로그인 사용자(sub)·표지(mark — null이면 머리글 없음)로 한 번 실행하고 원래대로 */
async function run(sql: string, params: readonly unknown[], mark: string | null, sub: string | null = USER) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
  await db.query("select set_config('request.headers', $1, false)", [mark === null ? "" : JSON.stringify({ "x-app-write": mark })]);
  await db.exec("set role authenticated");
  try {
    return await db.query<Record<string, unknown>>(sql, [...params]);
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
    await db.query("select set_config('request.headers', '', false)");
  }
}

const refused = (e: unknown) => (e as { code?: string }).code === "42501" && (e as Error).message.includes(REFUSED);
const aiRows = async () => (await db.query<{ n: number }>("select count(*)::int as n from public.ai_requests where user_id = $1", [USER])).rows[0].n;

test("공개 rpc 표지 확인(20261117150000): 로그인 사용자라도 표지가 없거나 틀리면 7개 모두 42501로 거절하고 아무것도 쓰지 않음", async () => {
  for (const name of NAMES) {
    for (const mark of [null, "", "wrong", `${KEY} `]) {
      await assert.rejects(() => run(RPCS[name].sql, RPCS[name].params, mark), refused, `${name} 표지 ${JSON.stringify(mark)}`);
    }
  }
  assert.equal(await aiRows(), 0, "거절된 호출 기록 시작은 행을 남기지 않음");
});

test("공개 rpc 표지 확인: 맞는 표지면 7개 모두 첫 줄을 지나 예전처럼 끝남(시작 → 끝맺기, 읽기는 해당 없는 인자라 0행)", async () => {
  const start = (await run(RPCS.start_ai_request.sql, RPCS.start_ai_request.params, KEY)).rows[0].r as { ok: boolean; ids: number[] };
  assert.equal(start.ok, true);
  assert.equal(start.ids.length, 1);
  assert.equal((await run(RPCS.finish_ai_request.sql, [start.ids[0], FINISH_KEY], KEY)).rows[0].r, true, "시작이 만든 행을 끝맺음");
  assert.equal((await run(RPCS.finish_ai_request.sql, RPCS.finish_ai_request.params, KEY)).rows[0].r, false, "없는 행은 false(예전과 같음)");
  for (const name of ["report_submit_cards", "mg_biz_refs", "mg_biz_ref_texts", "mg_biz_stale", "report_outline_context"] as const) {
    assert.deepEqual((await run(RPCS[name].sql, RPCS[name].params, KEY)).rows, [], name);
  }
});

test("공개 rpc 표지 확인은 맨 앞: 로그인 없음이어도 표지 거절이 먼저, 표지가 맞으면 본문의 로그인 확인으로 이어짐", async () => {
  await assert.rejects(() => run(RPCS.start_ai_request.sql, RPCS.start_ai_request.params, null, null), refused);
  await assert.rejects(() => run(RPCS.start_ai_request.sql, RPCS.start_ai_request.params, KEY, null), /로그인이 필요/);
  await assert.rejects(() => run(RPCS.finish_ai_request.sql, RPCS.finish_ai_request.params, KEY, null), /로그인이 필요/);
});

test("AI 호출 시작(20261117170000): 표지가 맞아도 사용 중지 계정은 거절하고 행을 남기지 않음 — 표지 거절이 여전히 먼저, 되살리면 다시 됨", async () => {
  const before = await aiRows();
  await db.query("update public.profiles set active = false where id = $1", [USER]);
  try {
    await assert.rejects(() => run(RPCS.start_ai_request.sql, RPCS.start_ai_request.params, null), refused, "표지 없음 → 표지 거절이 먼저");
    await assert.rejects(
      () => run(RPCS.start_ai_request.sql, RPCS.start_ai_request.params, KEY),
      (e: unknown) => (e as { code?: string }).code === "42501" && /사용 중지/.test((e as Error).message),
    );
    assert.equal(await aiRows(), before, "거절된 시작은 행을 남기지 않음");
  } finally {
    await db.query("update public.profiles set active = true where id = $1", [USER]);
  }
  const r = (await run(RPCS.start_ai_request.sql, [[sha("rpc-test-restored")]], KEY)).rows[0].r as { ok: boolean };
  assert.equal(r.ok, true, "되살린 계정은 다시 시작");
});
