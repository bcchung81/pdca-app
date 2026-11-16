import assert from "node:assert/strict";
import { test } from "node:test";
import { type OtpSender, requestMagicLink } from "./login.ts";

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
