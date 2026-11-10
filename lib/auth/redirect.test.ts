import assert from "node:assert/strict";
import { test } from "node:test";
import { BANNED_MSG, LINK_FAILED_MSG, authCallbackSearch, confirmErrorMessage, isNotRegisteredError, isValidEmail, requestOrigin, safeNext } from "./redirect.ts";

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

test("로그인 메일 요청: 메일 모양만 봄(기관·외부 구별 없음 — 계정은 로그인으로 만들지 않음)", () => {
  for (const e of ["new@kca.kr", " Someone@KCA.kr ", "someone@gmail.com"]) assert.equal(isValidEmail(e), true, e);
  for (const e of ["broken", "a@b", "a b@kca.kr", ""]) assert.equal(isValidEmail(e), false, e);
});

test("등록 안 된 주소 오류 알아보기(가입 끈 Supabase의 답) — 화면은 보낸 것과 같은 답(계정 여부를 알리지 않음)", () => {
  assert.equal(isNotRegisteredError({ code: "otp_disabled", message: "Signups not allowed for otp" }), true);
  assert.equal(isNotRegisteredError({ message: "Signups not allowed for otp" }), true, "코드가 없어도 문구로");
  assert.equal(isNotRegisteredError({ message: "User not found" }), true);
  assert.equal(isNotRegisteredError({ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }), false, "발송 한도는 따로 안내");
  assert.equal(isNotRegisteredError({ message: "Error sending magic link email" }), false);
  // 사용 중지(auth ban) 계정: 보내기에서 오류가 오더라도 등록 안 된 주소와 같은 답 — 사용 중지 여부·계정 여부를 알리지 않음(T3 리뷰 T4-R3)
  assert.equal(isNotRegisteredError({ code: "user_banned", message: "User is banned" }), true);
  // 링크 확인 단계(메일함 주인만 옴): 사용 중지면 그렇다고, 나머지(만료·이미 쓰임·토큰 없음)는 다시 받으라고(T4 9단계)
  assert.deepEqual(
    [confirmErrorMessage({ code: "user_banned", message: "User is banned" }), confirmErrorMessage({ message: "User is banned" }), confirmErrorMessage({ code: "otp_expired", message: "Email link is invalid or has expired" }), confirmErrorMessage(null)],
    [BANNED_MSG, BANNED_MSG, LINK_FAILED_MSG, LINK_FAILED_MSG],
  );
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
