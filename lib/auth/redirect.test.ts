import assert from "node:assert/strict";
import { test } from "node:test";
import { authCallbackSearch, isAllowedEmail, otpPolicy, requestOrigin, safeNext } from "./redirect.ts";

test("로그인 뒤 경로는 같은 사이트 절대 경로만", () => {
  assert.equal(safeNext("/cards?x=1"), "/cards?x=1");
  assert.equal(safeNext("//evil.com"), "/");
  assert.equal(safeNext("/\\evil.com"), "/");
  assert.equal(safeNext("https://evil.com"), "/");
  assert.equal(safeNext(undefined), "/");
  assert.equal(safeNext("/a\r\nSet-Cookie: x"), "/");
});

test("로그인 뒤 경로: 제어 문자(탭 등)·스킴이 낀 경로는 거부 — URL 해석이 탭을 지워 //evil.com이 되던 열린 리다이렉트(2026-10-10)", () => {
  assert.equal(new URL("/\t/evil.com", "https://app.example").host, "evil.com", "전제: 탭은 URL 해석에서 지워짐");
  assert.equal(safeNext("/\t/evil.com"), "/");
  assert.equal(safeNext("/\n/evil.com"), "/");
  assert.equal(safeNext("/\u0000x"), "/");
  assert.equal(safeNext("/\u007f/evil.com"), "/");
  assert.equal(safeNext("/javascript:alert(1)"), "/");
  assert.equal(safeNext("/" + "a".repeat(700)), "/", "너무 긴 값");
  assert.equal(safeNext("/reports/cards/abc?from=%2Fmy"), "/reports/cards/abc?from=%2Fmy", "인코딩된 쿼리는 그대로");
  assert.equal(safeNext("/x", "/my"), "/x");
  assert.equal(safeNext("//evil.com", "/my"), "/my", "기본 경로 인자");
});

test("메일 도메인 허용 목록", () => {
  assert.equal(isAllowedEmail("someone@kca.kr", ["kca.kr"]), true);
  assert.equal(isAllowedEmail(" Someone@KCA.kr ", ["kca.kr"]), true);
  assert.equal(isAllowedEmail("a@evil.kca.kr.com", ["kca.kr"]), false);
  assert.equal(isAllowedEmail("a@gmail.com", ["kca.kr"]), false);
  assert.equal(isAllowedEmail("not-an-email", ["kca.kr"]), false);
});

test("매직링크 정책: 기관 메일만 새 계정, 그 밖은 등록된 계정만", () => {
  assert.deepEqual(otpPolicy("new@kca.kr", ["kca.kr"]), { valid: true, createUser: true });
  assert.deepEqual(otpPolicy("someone@gmail.com", ["kca.kr"]), { valid: true, createUser: false });
  assert.deepEqual(otpPolicy("broken", ["kca.kr"]), { valid: false, createUser: false });
});

const hdr = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
const ENV = { NEXT_PUBLIC_SITE_URL: "https://kca-sherpa.vercel.app", VERCEL_URL: "kca-sherpa-abc123-team.vercel.app", VERCEL_BRANCH_URL: "kca-sherpa-git-dev-team.vercel.app" };

test("메일 링크 돌아올 주소: 호출한 주소 기준 — 운영·배포·미리보기·로컬은 자기 주소로(2026-10-12)", () => {
  assert.equal(requestOrigin(hdr({ "x-forwarded-host": "kca-sherpa.vercel.app", "x-forwarded-proto": "https" }), ENV), "https://kca-sherpa.vercel.app");
  assert.equal(requestOrigin(hdr({ "x-forwarded-host": "kca-sherpa-abc123-team.vercel.app", "x-forwarded-proto": "https" }), ENV), "https://kca-sherpa-abc123-team.vercel.app");
  assert.equal(requestOrigin(hdr({ host: "kca-sherpa-git-dev-team.vercel.app" }), ENV), "https://kca-sherpa-git-dev-team.vercel.app");
  assert.equal(requestOrigin(hdr({ host: "localhost:3000" }), ENV), "http://localhost:3000");
  assert.equal(requestOrigin(hdr({ host: "127.0.0.1:3100" }), {}), "http://127.0.0.1:3100");
  assert.equal(requestOrigin(hdr({ "x-forwarded-host": "KCA-SHERPA.vercel.app, proxy.internal" }), ENV), "https://kca-sherpa.vercel.app", "여러 값이면 첫 값·소문자");
});

test("메일 링크 돌아올 주소: 이 앱의 주소가 아닌 호스트 헤더는 받지 않고 NEXT_PUBLIC_SITE_URL로(로그인 링크 가로채기 방지)", () => {
  assert.equal(requestOrigin(hdr({ "x-forwarded-host": "evil.example.com" }), ENV), "https://kca-sherpa.vercel.app");
  assert.equal(requestOrigin(hdr({ host: "kca-sherpa.vercel.app.evil.com" }), ENV), "https://kca-sherpa.vercel.app");
  assert.equal(requestOrigin(hdr({ host: "kca-sherpa.vercel.app/@evil.com" }), ENV), "https://kca-sherpa.vercel.app", "경로·@가 낀 호스트");
  assert.equal(requestOrigin(hdr({ "x-forwarded-host": "kca-sherpa.vercel.app", "x-forwarded-proto": "javascript" }), ENV), "https://kca-sherpa.vercel.app", "이상한 proto는 https");
  assert.equal(requestOrigin(hdr({}), {}), "http://localhost:3000");
  assert.equal(requestOrigin(hdr({ host: "evil.example.com" }), { NEXT_PUBLIC_SITE_URL: "https://kca-sherpa.vercel.app/" }), "https://kca-sherpa.vercel.app", "끝 / 제거");
});

test("루트로 온 메일 링크(?code= 또는 token_hash+type)는 확인 화면 쿼리로, 그 밖은 null", () => {
  assert.equal(authCallbackSearch("/", new URLSearchParams("code=6dc51e3f")), "?code=6dc51e3f");
  assert.equal(authCallbackSearch("/", new URLSearchParams("token_hash=abc&type=email&next=%2Fmy&x=1")), "?token_hash=abc&type=email&next=%2Fmy");
  assert.equal(authCallbackSearch("/", new URLSearchParams("token_hash=abc")), null, "type 없음");
  assert.equal(authCallbackSearch("/", new URLSearchParams("")), null);
  assert.equal(authCallbackSearch("/cards", new URLSearchParams("code=1")), null, "루트만");
});
