import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGIN_MIN_MS, type OtpSender, requestMagicLink, waitAtLeast } from "./login.ts";

/** 가짜 Supabase auth: 정해 둔 오류를 돌려주고 받은 요청을 적어 둠 */
function fakeAuth(error: { status?: number; code?: string; message: string } | null) {
  const calls: Array<Parameters<OtpSender["signInWithOtp"]>[0]> = [];
  const auth: OtpSender = {
    async signInWithOtp(credentials) {
      calls.push(credentials);
      return { error };
    },
  };
  return { auth, calls };
}

const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const orig = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = orig;
  }
};

const EMAIL = "someone@kca.test";
const URL = "https://app.test/auth/confirm?next=%2F";

test("로그인 메일 요청: 계정은 만들지 않고(shouldCreateUser false) 돌아올 주소를 그대로 넘김", async () => {
  const { auth, calls } = fakeAuth(null);
  assert.deepEqual(await requestMagicLink(auth, EMAIL, URL), { status: "sent", email: EMAIL });
  assert.deepEqual(calls, [{ email: EMAIL, options: { emailRedirectTo: URL, shouldCreateUser: false } }]);
});

test("로그인 메일 요청: 발송 한도(429)도 등록 안 된 주소와 같은 답 — 화면 답으로 계정 여부가 드러나지 않음(2026-11-16 시큐어 코딩 점검)", async () => {
  const notRegistered = await requestMagicLink(fakeAuth({ status: 422, code: "otp_disabled", message: "Signups not allowed for otp" }).auth, EMAIL, URL);
  const banned = await requestMagicLink(fakeAuth({ status: 400, code: "user_banned", message: "User is banned" }).auth, EMAIL, URL);
  const sent = await requestMagicLink(fakeAuth(null).auth, EMAIL, URL);
  const limits = await quiet(() =>
    Promise.all([
      requestMagicLink(fakeAuth({ status: 429, code: "over_email_send_rate_limit", message: "For security purposes, you can only request this after 30 seconds." }).auth, EMAIL, URL),
      requestMagicLink(fakeAuth({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" }).auth, EMAIL, URL),
      requestMagicLink(fakeAuth({ message: "Email rate limit exceeded" }).auth, EMAIL, URL),
    ]),
  );
  for (const r of [notRegistered, banned, ...limits]) assert.deepEqual(r, sent);
});

test("로그인 메일 요청: 한도는 서버 로그에 남기되 메일 주소는 남기지 않음", async () => {
  const lines: unknown[][] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => void lines.push(a);
  try {
    await requestMagicLink(fakeAuth({ status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" }).auth, EMAIL, URL);
  } finally {
    console.error = orig;
  }
  assert.equal(lines.length, 1);
  assert.ok(!JSON.stringify(lines).includes(EMAIL));
});

test("로그인 메일 요청: 발송 설정 문제·그 밖의 실패는 오류로 알림(입력한 주소는 칸에 남김)", async () => {
  const unauthorized = await quiet(() => requestMagicLink(fakeAuth({ status: 400, message: "Email address not authorized" }).auth, EMAIL, URL));
  assert.equal(unauthorized.status, "error");
  assert.match(unauthorized.status === "error" ? unauthorized.message : "", /발송 설정/);
  const failed = await quiet(() => requestMagicLink(fakeAuth({ status: 500, message: "Error sending magic link email" }).auth, EMAIL, URL));
  assert.deepEqual(failed, { status: "error", email: EMAIL, message: "로그인 메일을 보내지 못했습니다. 잠시 뒤 다시 시도해 주세요." });
});

test("로그인 응답 최소 시간: 빠른 답(미등록·한도)은 남은 만큼 기다리고, 이미 지났으면 바로 — 응답 시간으로 등록 여부가 드러나지 않게(2026-11-17)", async () => {
  const slept: number[] = [];
  const sleep = async (ms: number) => void slept.push(ms);
  await waitAtLeast(1_000, LOGIN_MIN_MS, () => 1_200, sleep);
  await waitAtLeast(1_000, LOGIN_MIN_MS, () => 1_000 + LOGIN_MIN_MS + 300, sleep);
  assert.deepEqual(slept, [LOGIN_MIN_MS - 200]);
  assert.ok(LOGIN_MIN_MS >= 500 && LOGIN_MIN_MS <= 3_000, "정상 사용자가 기다리는 시간은 몇 초 안");
});
