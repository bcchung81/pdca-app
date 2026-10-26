// 경평 집필 자동 고치기 판단(lib/ai/fix-policy.ts) 시험 — 2026-10-10 개선 계획 B2b·B2d(병목):
// 평가 라운드 28건 모두 고치기를 한 번 더 돌았고(집필 중앙 490초·최대 744초 — Vercel 800초에 가까움), 문장 문제만인 초안도 전체를 다시 썼음.

import assert from "node:assert/strict";
import { test } from "node:test";
import { FIX_DEADLINE_MS, canFixAgain, draftScore, draftTimings, fixDeadlineMs, shouldFix } from "./fix-policy.ts";

const none = { need: null, year: 0, compose: 0, prose: 0 };

test("shouldFix: 판면·올해 실적·짜임 문제가 있으면 고치고, 없으면 안 고침", () => {
  assert.deepEqual(shouldFix(none, 300_000, 290_000), { fix: false, reason: "none" });
  assert.deepEqual(shouldFix({ ...none, need: "over" }, 300_000, 290_000), { fix: true });
  assert.deepEqual(shouldFix({ ...none, year: 1 }, 300_000, 290_000), { fix: true });
  assert.deepEqual(shouldFix({ ...none, compose: 2 }, 300_000, 290_000), { fix: true });
});

test("shouldFix: 문장 문제만이면 고치지 않음(경고로 남김 — 28건 중 2건이 이 경우)", () => {
  assert.deepEqual(shouldFix({ ...none, prose: 3 }, 100_000, 90_000), { fix: false, reason: "prose-only" });
  assert.deepEqual(shouldFix({ ...none, prose: 3, need: "under" }, 100_000, 90_000), { fix: true }, "판면도 문제면 같이 고침");
});

test("shouldFix: 남은 시간이 1차 호출 시간 × 1.1보다 짧으면 고치기를 건너뜀(함수 시간 제한 800초 — 끊기면 두 호출분을 다 잃음)", () => {
  // 지금까지 400초, 1차 380초 → 고치기 예상 418초 → 818초 > 기한
  assert.deepEqual(shouldFix({ ...none, need: "over" }, 400_000, 380_000), { fix: false, reason: "time" });
  // 지금까지 300초, 1차 280초 → 608초 ≤ 기한
  assert.deepEqual(shouldFix({ ...none, need: "over" }, 300_000, 280_000), { fix: true });
  assert.ok(FIX_DEADLINE_MS < 800_000 - 60_000, "기한은 함수 제한 800초에서 저장·여유 1분 이상을 뺀 값");
  assert.deepEqual(shouldFix({ ...none, need: "over" }, 300_000, 280_000, 500_000), { fix: false, reason: "time" }, "기한을 인자로 바꿀 수 있음");
});

test("fixDeadlineMs: 함수 시간 제한이 있는 Vercel에서만 기한, 로컬(개발·연기 시험)은 제한 없음 — 2026-10-10 실검증: 로컬 바로 만들기 1차 507초가 Vercel용 기한에 걸려 고치기를 건너뜀(계획서 §10 E1)", () => {
  assert.equal(fixDeadlineMs({ VERCEL: "1" }), FIX_DEADLINE_MS);
  assert.equal(fixDeadlineMs({}), Infinity);
  // 로컬에서는 1차 507초여도 고침, Vercel에서는 건너뜀
  assert.deepEqual(shouldFix({ ...none, need: "under" }, 507_000, 507_000, fixDeadlineMs({})), { fix: true });
  assert.deepEqual(shouldFix({ ...none, need: "under" }, 507_000, 507_000, fixDeadlineMs({ VERCEL: "1" })), { fix: false, reason: "time" });
});

test("draftScore: 고친 판 고르기 — 없는 숫자(50)가 올해 실적(40)·짜임(20)·문장(10)보다 무겁고, 판면 점수에 더함(계획서 §10 E3: 예전에는 없는 숫자를 안 셈)", () => {
  const spec = { version: 3, blocks: [], module: 1, head: "all", sub: { title: "t", markers: [] }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, rows: [], results: [] } as never;
  const base = { spec, unknownNumbers: [] as string[], yearIssues: [] as string[], composeIssues: [] as string[], proseIssues: [] as string[] };
  const s0 = draftScore(base);
  assert.equal(draftScore({ ...base, unknownNumbers: ["77%"] }) - s0, 50);
  assert.equal(draftScore({ ...base, yearIssues: ["x"], composeIssues: ["y"], proseIssues: ["z"] }) - s0, 70);
  // 판면·문장을 고쳤어도 없는 숫자를 새로 만든 판은 앞 판보다 나쁨
  assert.ok(draftScore({ ...base, unknownNumbers: ["12.3"] }) > draftScore({ ...base, proseIssues: ["a", "b", "c"] }));
});

test("canFixAgain: 「판면만 한 번 더」도 첫 고치기와 같은 시간 규칙(지금까지 + 직전 호출 × 1.1 ≤ 기한) — 예전 170초 기준은 평가 75건 중 2번만 돌아 18건을 막았음(계획서 §10 E7)", () => {
  // 1차 250초 + 고치기 200초 = 450초, 한 번 더 220초 → 670초 ≤ 690초(Vercel)
  assert.equal(canFixAgain(450_000, 200_000, fixDeadlineMs({ VERCEL: "1" })), true);
  assert.equal(canFixAgain(500_000, 200_000, fixDeadlineMs({ VERCEL: "1" })), false, "Vercel 기한을 넘으면 안 함");
  assert.equal(canFixAgain(787_000, 321_000, fixDeadlineMs({})), true, "로컬은 제한 없음(라운드 X 1/2-가: 1차 466초 + 고치기 321초)");
});

test("draftTimings: 집필 AI 기록에 전체·1차·고치기·한 번 더 ms·횟수·건너뛴 이유 — 없는 단계는 키째 뺌(계획서 §10 E5)", () => {
  // 운영 화면 실검증(2026-10-10 주요사업1/2-가): 고치기 한 번
  assert.deepEqual(draftTimings(485_590, 1, { firstMs: 393_131, fixMs: 91_995 }), { call: 485_590, passes: 1, first: 393_131, fix: 91_995 });
  // 시간 부족으로 건너뜀(첫 실검증 507초 — 그때는 이 키가 없어 데이터로 추정만 했음)
  assert.deepEqual(draftTimings(507_268, 0, { firstMs: 507_106, skipped: "time" }), { call: 507_268, passes: 0, first: 507_106, skip: "time" });
  // 판면만 한 번 더까지(라운드 Y 2/6-가)
  assert.deepEqual(draftTimings(439_000, 2, { firstMs: 268_809, fixMs: 106_846, againMs: 63_501 }), { call: 439_000, passes: 2, first: 268_809, fix: 106_846, again: 63_501 });
});
