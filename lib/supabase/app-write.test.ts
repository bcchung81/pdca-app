// 앱 서버 경유 표지(lib/supabase/app-write.ts, 근본책 1단계 2026-11-17) 시험.
// 막는 회귀: ① 서버 클라이언트(server.ts·job-client.ts)가 표지를 안 실어 표지 정책을 건 DB에서 쓰기가 모두 거절됨
// ② 표지가 브라우저로 새어 앱 밖 요청도 정책을 통과함(브라우저 클라이언트에 싣거나, NEXT_PUBLIC_로 만들거나, 클라이언트 컴포넌트가 읽음)
// ③ 값이 없을 때(로컬·시험) 빈 머리글을 실음 — 설치된 @supabase/ssr를 그대로 돌려 실제 요청 머리글을 봄(네트워크 없음)

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { test } from "node:test";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { APP_WRITE_HEADER, appWriteHeaders } from "./app-write.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const URL_ = "https://proj.supabase.example";
const PUB = "sb_publishable_test";
const KEY = "a".repeat(64);
const src = (f: string) => readFileSync(join(ROOT, f), "utf8");

/** 클라이언트로 select 한 번 — 나간 요청 머리글 */
async function sentHeaders(make: (fetch: typeof globalThis.fetch) => { from: (t: string) => { select: (c: string) => PromiseLike<unknown> } }): Promise<Headers> {
  let seen: Headers | null = null;
  const fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    seen = new Headers(init?.headers);
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  await make(fetch).from("card_report_drafts").select("card_id");
  assert.ok(seen, "요청이 나가야 함");
  return seen;
}

test("appWriteHeaders: APP_WRITE_KEY가 있을 때만 x-app-write(앞뒤 공백 걷음), 없거나 빈 값이면 머리글 없음", () => {
  assert.equal(APP_WRITE_HEADER, "x-app-write");
  assert.deepEqual(appWriteHeaders({ APP_WRITE_KEY: KEY }), { "x-app-write": KEY });
  assert.deepEqual(appWriteHeaders({ APP_WRITE_KEY: ` ${KEY}\n` }), { "x-app-write": KEY });
  assert.deepEqual(appWriteHeaders({}), {});
  assert.deepEqual(appWriteHeaders({ APP_WRITE_KEY: "" }), {});
  assert.deepEqual(appWriteHeaders({ APP_WRITE_KEY: "  " }), {});
  assert.deepEqual(appWriteHeaders({ NEXT_PUBLIC_APP_WRITE_KEY: KEY }), {}, "공개 이름은 읽지 않음");
});

test("서버 클라이언트(server.ts와 같은 옵션): 값이 있으면 DB 요청에 표지가 실리고, 없으면 안 실림 — 로그인 토큰·공개 키 머리글은 그대로", async () => {
  const server = (env: Record<string, string | undefined>) => (fetch: typeof globalThis.fetch) =>
    createServerClient(URL_, PUB, { global: { fetch, headers: appWriteHeaders(env) }, cookies: { getAll: () => [], setAll: () => {} } });
  const on = await sentHeaders(server({ APP_WRITE_KEY: KEY }));
  assert.equal(on.get("x-app-write"), KEY);
  assert.equal(on.get("apikey"), PUB);
  const off = await sentHeaders(server({}));
  assert.equal(off.get("x-app-write"), null);
  assert.equal(off.get("apikey"), PUB);
});

test("서버 클라이언트 두 곳이 표지를 싣는 줄을 가짐(server.ts global.headers, job-client.ts 로그인 토큰과 함께), 둘 다 server-only", () => {
  const server = src("lib/supabase/server.ts");
  assert.match(server, /^import "server-only";/m);
  assert.match(server, /global:\s*\{\s*headers:\s*appWriteHeaders\(\)\s*\}/);
  const job = src("lib/supabase/job-client.ts");
  assert.match(job, /^import "server-only";/m);
  assert.match(job, /headers:\s*\{\s*\.\.\.appWriteHeaders\(\),\s*Authorization:/, "로그인 토큰(Authorization)이 뒤에 와서 덮이지 않음");
});

test("브라우저 클라이언트(browser.ts와 같은 옵션)는 서버에 값이 있어도 표지를 싣지 않음", async () => {
  const prev = process.env.APP_WRITE_KEY;
  process.env.APP_WRITE_KEY = KEY;
  try {
    const h = await sentHeaders((fetch) => createBrowserClient(URL_, PUB, { isSingleton: false, global: { fetch }, cookies: { getAll: () => [], setAll: () => {} } }));
    assert.equal(h.get("x-app-write"), null);
  } finally {
    if (prev === undefined) delete process.env.APP_WRITE_KEY;
    else process.env.APP_WRITE_KEY = prev;
  }
  const browser = src("lib/supabase/browser.ts");
  assert.doesNotMatch(browser, /app-write|APP_WRITE|x-app-write|global\s*:/);
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === "node_modules" ? [] : files(p);
    return /\.(ts|tsx|mjs|js)$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
  });
}

test("표지 비밀은 브라우저 번들로 가는 길이 없음: 읽는 곳은 app-write.ts 하나, 그 모듈은 server-only 모듈만 가져감, NEXT_PUBLIC_ 이름 없음", () => {
  const all = [...files(join(ROOT, "lib")), ...files(join(ROOT, "app")), ...files(join(ROOT, "components")), join(ROOT, "proxy.ts"), join(ROOT, "instrumentation.ts")];
  const rel = (p: string) => relative(ROOT, p);
  const readers = all.filter((p) => /(?:process\.env|\benv)(?:\.APP_WRITE_KEY|\[\s*["'`]APP_WRITE_KEY)/.test(readFileSync(p, "utf8"))).map(rel);
  assert.deepEqual(readers, ["lib/supabase/app-write.ts"]);
  assert.ok(!all.some((p) => /NEXT_PUBLIC_APP_WRITE/.test(readFileSync(p, "utf8"))));
  assert.ok(!/NEXT_PUBLIC_APP_WRITE/.test(src(".env.example")));
  assert.match(src(".env.example"), /^APP_WRITE_KEY=$/m, "서버 전용 이름으로 적힘(값은 비움)");
  const importers = all.filter((p) => /from\s+"[^"]*\/app-write\.ts"/.test(readFileSync(p, "utf8"))).map(rel).sort();
  assert.deepEqual(importers, ["lib/supabase/job-client.ts", "lib/supabase/server.ts"]);
  for (const f of importers) assert.match(src(f), /^import "server-only";/m, f);
  // 클라이언트 컴포넌트가 server.ts·job-client.ts를 직접 가져가면 빌드가 server-only로 멈춤 — 그래도 「use client」 파일에 서버 클라이언트 import가 없음을 같이 봄
  const client = all.filter((p) => /^\s*["']use client["']/.test(readFileSync(p, "utf8")));
  assert.ok(client.length > 0, "검사가 클라이언트 파일을 실제로 찾음");
  for (const p of client) assert.doesNotMatch(readFileSync(p, "utf8"), /supabase\/(server|job-client|app-write)\.ts/, rel(p));
});
