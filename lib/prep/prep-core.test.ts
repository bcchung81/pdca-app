import assert from "node:assert/strict";
import { test } from "node:test";
import { enqueueWith, mergeJobPayload } from "./enqueue-core.ts";
import { FakeDb } from "./fake-db.ts";
import { cardIdentityFingerprint } from "./fingerprint.ts";
import { mergeQueuedJob } from "./merge-queued.ts";
import { ALL_PREP_KINDS, prepAutoKinds } from "./policy.ts";

const card = (over: Record<string, unknown> = {}) => ({
  title: "AI 안테나 판독",
  executionTaskNo: "1-1",
  executionTask: "전파 품질 검사 고도화",
  targetBusiness: "전파검사",
  kpi: { rows: [{ nameRaw: "판독 정확도", target: "95" }, { nameRaw: "처리 건수", target: "100" }] },
  act: { findings: ["지적 A"] },
  months: { "1": "실적" },
  ...over,
});

test("과제 정체성 지문: 월별 실적·지적·목표값이 바뀌어도 같고, 과제명·실행과제·대상사업·계량지표 이름이 바뀌면 달라진다", () => {
  const base = cardIdentityFingerprint(card());
  assert.equal(cardIdentityFingerprint(card({ months: { "1": "다른 실적" }, act: { findings: ["지적 B"] } })), base);
  assert.equal(cardIdentityFingerprint(card({ kpi: { rows: [{ nameRaw: "판독 정확도", target: "99" }, { nameRaw: "처리 건수", target: "200" }] } })), base, "목표값은 정체성이 아님");
  assert.notEqual(cardIdentityFingerprint(card({ title: "AI 안테나 판독 확산" })), base);
  assert.notEqual(cardIdentityFingerprint(card({ executionTask: "다른 실행과제" })), base);
  assert.notEqual(cardIdentityFingerprint(card({ targetBusiness: "다른 사업" })), base);
  assert.notEqual(cardIdentityFingerprint(card({ kpi: { rows: [{ nameRaw: "판독 정확도" }] } })), base, "지표가 빠지면 달라짐");
  assert.equal(cardIdentityFingerprint(null), cardIdentityFingerprint({}), "비어도 던지지 않음");
});

test("자동 처리 종류: Vercel은 자동, 로컬은 자동 처리 없음(처리기가 모두 AI 호출이라 직접 돌림), PREP_AUTORUN으로 바꿈", () => {
  assert.deepEqual(ALL_PREP_KINDS, ["match_knowledge"], "3-5 재정의: 처리기가 있는 종류는 공통 지식 매칭뿐");
  assert.deepEqual(prepAutoKinds({}), []);
  assert.deepEqual(prepAutoKinds({ VERCEL: "1" }), [...ALL_PREP_KINDS]);
  assert.deepEqual(prepAutoKinds({ PREP_AUTORUN: "all" }), [...ALL_PREP_KINDS]);
  assert.deepEqual(prepAutoKinds({ PREP_AUTORUN: "off" }), []);
  assert.deepEqual(prepAutoKinds({ VERCEL: "1", PREP_AUTORUN: "off" }), [], "off가 우선");
});

test("작업 등록: 같은 대상의 대기 작업이 이미 있으면(유일 위반) 건너뛰고, 다른 오류는 던진다", async () => {
  const jobs = [
    { kind: "match_knowledge" as const, target: "A" },
    { kind: "match_knowledge" as const, target: "B" },
  ];
  const r = await enqueueWith(async (j) => ({ error: j.target === "B" ? { code: "23505", message: "duplicate key" } : null }), jobs);
  assert.deepEqual(r, { queued: 1, skipped: 1 });
  await assert.rejects(() => enqueueWith(async () => ({ error: { code: "42501", message: "row-level security" } }), jobs), /작업 등록 실패\(match_knowledge A\)/);
});

test("대기 작업 합치기(규칙): docIds는 합집합(기존 순서 먼저), 어느 쪽이든 문서 지정이 없으면 전체, 다른 키는 기존 값 유지", () => {
  assert.deepEqual(mergeJobPayload({ docIds: ["a", "b"] }, { docIds: ["b", "c"] }), { docIds: ["a", "b", "c"] });
  assert.deepEqual(mergeJobPayload({ docIds: ["a"] }, {}), {}, "전체 문서 등록이 오면 전체로");
  assert.deepEqual(mergeJobPayload({}, { docIds: ["a"] }), {}, "이미 전체면 그대로");
  assert.deepEqual(mergeJobPayload({ docIds: ["a"], note: "x" }, { docIds: [] }), { note: "x" }, "빈 목록도 문서 지정 없음");
  assert.deepEqual(mergeJobPayload(null, { docIds: ["a"] }), {});
  assert.deepEqual(mergeJobPayload({ docIds: ["a"] }, { docIds: [1, "b"] as never }), { docIds: ["a", "b"] }, "문자열이 아닌 값은 버림");
});

test("작업 등록: 유일 위반이면 merge를 부르고 합친 건수만 merged로 셈, 새로 들어간 건은 merge를 안 부르며, merge를 안 주면 merged 키가 없음", async () => {
  const jobs = [
    { kind: "match_knowledge" as const, target: "A", payload: { docIds: ["d2"] } },
    { kind: "match_knowledge" as const, target: "B", payload: { docIds: ["d2"] } },
    { kind: "match_knowledge" as const, target: "C", payload: { docIds: ["d2"] } },
  ];
  const called: string[] = [];
  const r = await enqueueWith(
    async (j) => ({ error: j.target === "A" ? null : { code: "23505", message: "duplicate key" } }),
    jobs,
    async (j) => {
      called.push(j.target);
      return j.target === "B"; // C는 합칠 게 없음(이미 같은 목록)
    },
  );
  assert.deepEqual(r, { queued: 1, skipped: 2, merged: 1 });
  assert.deepEqual(called, ["B", "C"]);
  assert.deepEqual(await enqueueWith(async () => ({ error: null }), jobs), { queued: 3, skipped: 0 });
});

test("대기 작업에 문서 합치기(서비스 키 경로): 대기 중인 작업만 고치고, 처리 중인 작업·대기 작업 없음·이미 같은 목록이면 건드리지 않음", async () => {
  const db = new FakeDb({
    prep_jobs: [
      { id: 1, kind: "match_knowledge", target: "A", status: "queued", payload: { docIds: ["d1"] } },
      { id: 2, kind: "match_knowledge", target: "B", status: "running", payload: { docIds: ["d1"] } },
      { id: 3, kind: "match_knowledge", target: "D", status: "queued", payload: { docIds: ["d1", "d2"] } },
    ],
  });
  const merge = mergeQueuedJob(db as never);
  const job = (target: string) => ({ kind: "match_knowledge" as const, target, payload: { docIds: ["d2"] } });
  assert.equal(await merge(job("A")), true);
  assert.deepEqual(db.rows("prep_jobs")[0].payload, { docIds: ["d1", "d2"] });
  assert.equal(await merge(job("B")), false, "처리 중인 작업은 그대로");
  assert.deepEqual(db.rows("prep_jobs")[1].payload, { docIds: ["d1"] });
  assert.equal(await merge(job("C")), false, "대기 작업이 없으면 할 일 없음");
  assert.equal(await merge(job("D")), false, "이미 d2가 들어 있음");
  assert.equal(await merge({ kind: "match_knowledge", target: "A", payload: {} }), true, "전체 문서 등록이 오면 그 작업이 전체로");
  assert.deepEqual(db.rows("prep_jobs")[0].payload, {});
});
