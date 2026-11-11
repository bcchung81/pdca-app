// 로그인 세션 쿠키 httpOnly(lib/supabase/cookie-options.ts) 시험 — 2026-11-10 보안 점검 T4 M3.
// 막는 회귀: ① 세션 쿠키가 다시 스크립트로 읽히게 되는 것(서버 클라이언트 두 곳에서 옵션이 빠짐)
// ② httpOnly로 바꾼 뒤 브라우저 서명 업로드(카드 자료·현행화·공통 자료)가 세션을 요구하게 되는 것 — 설치된 @supabase/ssr·supabase-js 코드를 그대로 돌려 확인(네트워크 없음).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { AUTH_COOKIE_OPTIONS, authCookieOptions } from "./cookie-options.ts";

const URL_ = "https://proj.supabase.example";
const KEY = "sb_publishable_test";
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("세션 쿠키 옵션: httpOnly", () => {
  assert.equal(AUTH_COOKIE_OPTIONS.httpOnly, true);
});

test("세션 쿠키 옵션: secure는 Vercel에서만 참(로컬 http에 붙이면 쿠키가 버려질 수 있음)", () => {
  assert.deepEqual(authCookieOptions({}), { httpOnly: true, secure: false });
  assert.deepEqual(authCookieOptions({ VERCEL: "" }), { httpOnly: true, secure: false });
  assert.deepEqual(authCookieOptions({ VERCEL: "1" }), { httpOnly: true, secure: true });
  // 이 시험 프로세스는 로컬 실행이라 모듈 값도 secure:false여야 함(Vercel 환경변수가 없을 때)
  if (!process.env.VERCEL) assert.equal(AUTH_COOKIE_OPTIONS.secure, false);
});

test("세션 쿠키를 쓰는 서버 클라이언트 두 곳(proxy.ts·server.ts)이 모두 이 옵션을 씀", () => {
  for (const f of ["../../proxy.ts", "./server.ts"]) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    assert.match(src, /cookieOptions:\s*AUTH_COOKIE_OPTIONS/, `${f}: createServerClient에 cookieOptions: AUTH_COOKIE_OPTIONS`);
  }
});

test("서버 클라이언트: 로그인(세션 저장) 때 쓰는 쿠키에 httpOnly가 실림(@supabase/ssr이 기본값과 합침)", async () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const sub = "00000000-0000-0000-0000-000000000001";
  const jwt = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, exp: Math.floor(Date.now() / 1000) + 3600, role: "authenticated", aud: "authenticated" })}.sig`;
  const sets: Array<{ name: string; options: Record<string, unknown> }> = [];
  const s = createServerClient(URL_, KEY, {
    global: { fetch: (async () => json({ id: sub, aud: "authenticated", role: "authenticated", email: "a@example.test" })) as typeof fetch },
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: { getAll: () => [], setAll: (cs) => void sets.push(...cs.map((c) => ({ name: c.name, options: c.options as Record<string, unknown> }))) },
  });
  const { error } = await s.auth.setSession({ access_token: jwt, refresh_token: "r" });
  assert.equal(error, null);
  await new Promise((r) => setTimeout(r, 20));
  const auth = sets.filter((c) => /^sb-.+-auth-token(\.\d+)?$/.test(c.name));
  assert.ok(auth.length > 0, "세션 쿠키를 써야 함");
  for (const c of auth) {
    assert.equal(c.options.httpOnly, true, c.name);
    assert.equal(c.options.sameSite, "lax", "기본값(sameSite·path)은 그대로");
    assert.equal(c.options.path, "/");
  }
});

test("브라우저 서명 업로드: 세션 쿠키가 안 보여도(httpOnly) 공개 키로 서명 주소에 올리고, 쿠키를 건드리지 않음", async () => {
  const seen: Array<{ url: string; method?: string; auth: string | null; apikey: string | null }> = [];
  const writes: string[] = [];
  const b = createBrowserClient(URL_, KEY, {
    isSingleton: false,
    global: {
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        seen.push({ url: String(input), method: init?.method, auth: h.get("authorization"), apikey: h.get("apikey") });
        return json({ Key: "card-materials/u/x.pdf" });
      }) as typeof fetch,
    },
    // httpOnly 세션 쿠키는 document.cookie에 안 보임 → 브라우저 클라이언트에는 앱 쿠키(트랙 보기 등)만 보임
    cookies: { getAll: () => [{ name: "pdca_track", value: "biz" }], setAll: (cs) => void writes.push(...cs.map((c) => c.name)) },
  });
  const { data, error } = await b.storage.from("card-materials").uploadToSignedUrl("u/x.pdf", "TOKEN123", new Blob(["hi"]), { contentType: "application/pdf" });
  assert.equal(error, null);
  assert.equal(data?.path, "u/x.pdf");
  const up = seen.filter((r) => r.url.includes("/storage/v1/object/upload/sign/"));
  assert.equal(up.length, 1, "서명 업로드 요청 1건");
  assert.equal(up[0].url, `${URL_}/storage/v1/object/upload/sign/card-materials/u/x.pdf?token=TOKEN123`);
  assert.equal(up[0].method, "PUT");
  assert.equal(up[0].apikey, KEY);
  assert.equal(up[0].auth, `Bearer ${KEY}`, "세션이 없으면 공개 키를 Bearer로 — 서명 업로드는 주소의 token으로 인증");
  assert.ok(!seen.some((r) => r.url.includes("/auth/v1/")), "인증 서버(토큰 갱신 등)를 부르지 않음");
  assert.deepEqual(writes, [], "브라우저 클라이언트가 쿠키를 쓰거나 지우지 않음");
});
