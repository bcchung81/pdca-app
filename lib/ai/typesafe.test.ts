import assert from "node:assert/strict";
import { test } from "node:test";
import type { BundleChunk } from "../knowledge/bundle.ts";
import {
  DEFAULT_BANDS,
  DEFAULT_RULE,
  type SystemOneResponse,
  WORDING_VARIANTS,
  bandCounts,
  bandOf,
  batches,
  cardComparison,
  cardState,
  crossTab,
  evaluateRule,
  relevanceQuestions,
  scoreChunks,
  summarizeBands,
  typesafeCaller,
} from "./typesafe.ts";

const chunk = (chunk_key: string, over: Partial<BundleChunk> = {}): BundleChunk => ({
  chunk_key,
  doc_id: "att3-2604",
  seq: 0,
  unit_type: "qa_pair",
  track: "주요사업",
  business: "BZ-3",
  title: `제목 ${chunk_key}`,
  text: `글 ${chunk_key}`,
  context_prefix: null,
  meta: null,
  ...over,
});

const noul = (p: number) => ({ type: "noul" as const, noul: p });
const usage = { input_tokens: 100, output_tokens: 10 };

test("질문 만들기: 조각마다 예/아니오(Noul) 질문 하나, 조각 전체 글을 자르지 않고 instructions.candidate에 넣고 id로 조각 키를 되짚는다", () => {
  const long = "가".repeat(30_000);
  const { questions, ids } = relevanceQuestions([
    chunk("k1", { title: "실사 Q1", text: long, context_prefix: "첨부3 12쪽" }),
    chunk("k2", { unit_type: "pool_indicator", text: "<table><tr><td>가</td><td>나</td></tr></table>" }),
  ]);
  assert.deepEqual(ids, ["k1", "k2"], "질문 순서 = 조각 순서, 답의 id에서 조각 키를 찾음");
  const q0 = questions.q0;
  assert.equal(q0.type, "noul");
  const ins = q0.instructions as { candidate: { title: string; unit: string; where?: string; text: string }; question: string };
  assert.equal(ins.candidate.title, "실사 Q1");
  assert.equal(ins.candidate.unit, "qa_pair");
  assert.equal(ins.candidate.where, "첨부3 12쪽");
  assert.equal(ins.candidate.text.length, long.length, "글을 자르지 않음");
  assert.match(ins.question, /`candidate`/);
  assert.match(ins.question, /`task`/);
  assert.ok(q0.criteria && q0.criteria.true.length > 5 && q0.criteria.false.length > 5, "경계가 미묘해 true/false 설명을 붙임");
  const ins1 = questions.q1.instructions as { candidate: { text: string } };
  assert.ok(!ins1.candidate.text.includes("<td>"), "표는 줄 글로 풀어 넣음");
  assert.deepEqual(relevanceQuestions([]), { questions: {}, ids: [] });
});

test("과제 상태(state): 과제 정체성·계량지표·전년 지적·AI 활용만, 월별 실적은 넣지 않고 빈 카드도 던지지 않는다", () => {
  const s = cardState({
    title: "지속가능한 ICT기금 재정건전성 제고",
    taskNo: "5-가",
    executionTaskNo: "5-1",
    executionTask: "기금 운용 효율화",
    targetBusiness: "ICT기금",
    kpi: { rows: [{ nameRaw: "기금 수익률", formula: "수익/원금" }, { name: "집행률" }] },
    act: { findings: ["지적 A\n둘째 줄", { table: { rows: [] } }] },
    strategy: { ai: { text: "AI 예측" } },
    do: { monthly: [{ period: "2026-03", items: ["월별 실적 문장"] }] },
  }) as { task: Record<string, unknown> };
  assert.equal(s.task.과제명, "지속가능한 ICT기금 재정건전성 제고");
  assert.equal(s.task.실행과제, "5-1 기금 운용 효율화");
  assert.deepEqual(s.task.계량지표, ["기금 수익률 — 수익/원금", "집행률"]);
  assert.deepEqual(s.task.전년_지적사항, ["지적 A / 둘째 줄"], "표·그림 줄은 뺌");
  assert.ok(!JSON.stringify(s).includes("월별 실적 문장"));
  assert.deepEqual(cardState(null), { task: {} });
});

test("확률 구간: 0.8 이상 확신(auto), 0.2 이하 제외, 그 사이는 애매(candidate) — 경계 포함 방향과 사용자 지정 값", () => {
  assert.deepEqual(DEFAULT_BANDS, { high: 0.8, low: 0.2 });
  assert.equal(bandOf(0.95), "auto");
  assert.equal(bandOf(0.8), "auto", "0.8은 확신");
  assert.equal(bandOf(0.79), "candidate");
  assert.equal(bandOf(0.5), "candidate");
  assert.equal(bandOf(0.21), "candidate");
  assert.equal(bandOf(0.2), "none", "0.2는 제외");
  assert.equal(bandOf(0.01), "none");
  assert.equal(bandOf(0.7, { high: 0.9, low: 0.1 }), "candidate");
  assert.equal(bandOf(0.92, { high: 0.9, low: 0.1 }), "auto");
  assert.throws(() => bandOf(1.2), /0~1/, "확률이 아니면 던짐");
  assert.throws(() => bandOf(Number.NaN), /0~1/);
});

test("묶음: 순서를 지키고 나머지 묶음까지 담으며 크기가 0 이하면 던진다", () => {
  assert.deepEqual(batches([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(batches([], 3), []);
  assert.deepEqual(batches([1], 5), [[1]]);
  assert.throws(() => batches([1], 0), /1 이상/);
});

test("조각 채점: 묶음마다 같은 state로 한 번씩 요청하고, 답을 조각 키에 맞춰 돌려주며 토큰을 합친다", async () => {
  const chunks = ["a", "b", "c", "d", "e"].map((k) => chunk(k));
  const calls: Array<{ state: unknown; ids: string[] }> = [];
  const call = async (req: { state: unknown; questions: Record<string, unknown> }): Promise<SystemOneResponse> => {
    const ids = Object.keys(req.questions);
    calls.push({ state: req.state, ids });
    return { model: "jev-x", answers: Object.fromEntries(ids.map((id, i) => [id, noul((calls.length * 10 + i) / 100)])), usage };
  };
  const card = { title: "과제" };
  const r = await scoreChunks(call, card, chunks, { batchSize: 2 });
  assert.equal(r.requests, 3);
  assert.deepEqual(calls.map((c) => c.ids.length), [2, 2, 1]);
  assert.ok(calls.every((c) => JSON.stringify(c.state) === JSON.stringify(cardState(card))), "state는 모든 요청에서 같음");
  assert.deepEqual(r.scores.map((s) => s.chunkKey), ["a", "b", "c", "d", "e"], "조각 순서 유지");
  assert.deepEqual(r.scores.map((s) => s.p), [0.1, 0.11, 0.2, 0.21, 0.3], "묶음 안 질문 id가 조각에 정확히 대응");
  assert.deepEqual(r.usage, { input_tokens: 300, output_tokens: 30 });
  assert.equal(r.model, "jev-x");
  assert.deepEqual((await scoreChunks(call, card, [])).scores, []);
});

test("조각 채점: 답이 빠졌거나 Noul이 아니거나 확률이 범위 밖이면 0으로 덮지 않고 던진다", async () => {
  const chunks = [chunk("a"), chunk("b")];
  const bad = (answers: SystemOneResponse["answers"]) => async () => ({ model: "m", answers, usage });
  await assert.rejects(() => scoreChunks(bad({ q0: noul(0.5) }), {}, chunks), /q1/);
  await assert.rejects(() => scoreChunks(bad({ q0: noul(0.5), q1: { type: "choice" } as never }), {}, chunks), /noul/i);
  await assert.rejects(() => scoreChunks(bad({ q0: noul(0.5), q1: noul(1.5) }), {}, chunks), /0~1/);
});

test("HTTP 클라이언트: 주소·Bearer 인증·본문(state·model·questions)을 맞춰 보내고 응답을 그대로 돌려준다", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fakeFetch = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ model: "jev-1", answers: { q0: noul(0.9) }, usage }), { status: 200 });
  }) as unknown as typeof fetch;
  const call = typesafeCaller({ apiKey: "sk-test", model: "jev-latest", fetchFn: fakeFetch });
  const res = await call({ state: { task: { a: 1 } }, questions: { q0: { type: "noul", instructions: "q" } } });
  assert.equal(res.answers.q0.noul, 0.9);
  assert.equal(seen!.url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(seen!.init.method, "POST");
  const headers = seen!.init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer sk-test");
  assert.equal(headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(String(seen!.init.body)), { state: { task: { a: 1 } }, model: "jev-latest", questions: { q0: { type: "noul", instructions: "q" } } });
});

test("HTTP 클라이언트: 429·529는 지수 백오프로 다시 시도하다가 한도를 넘으면 던지고, 401·422는 바로 던지며 키를 메시지에 싣지 않는다", async () => {
  const sleeps: number[] = [];
  const sleep = async (ms: number) => void sleeps.push(ms);
  let n = 0;
  const flaky = (async () => (++n < 3 ? new Response("busy", { status: n === 1 ? 429 : 529 }) : new Response(JSON.stringify({ model: "m", answers: {}, usage }), { status: 200 }))) as unknown as typeof fetch;
  const ok = await typesafeCaller({ apiKey: "sk-secret", model: "m", fetchFn: flaky, sleep, retries: 3 })({ state: "s", questions: {} });
  assert.equal(ok.model, "m");
  assert.equal(n, 3);
  assert.deepEqual(sleeps, [1000, 2000], "1초, 2초로 늘려 기다림");

  let m = 0;
  const always429 = (async () => (m++, new Response("slow down", { status: 429 }))) as unknown as typeof fetch;
  await assert.rejects(() => typesafeCaller({ apiKey: "sk-secret", model: "m", fetchFn: always429, sleep, retries: 2 })({ state: "s", questions: {} }), /429/);
  assert.equal(m, 3, "처음 1번 + 재시도 2번");

  for (const status of [401, 422]) {
    let k = 0;
    const once = (async () => (k++, new Response(JSON.stringify({ detail: "나쁜 요청" }), { status }))) as unknown as typeof fetch;
    await assert.rejects(
      () => typesafeCaller({ apiKey: "sk-secret", model: "m", fetchFn: once, sleep })({ state: "s", questions: {} }),
      (e: Error) => e.message.includes(String(status)) && !e.message.includes("sk-secret"),
    );
    assert.equal(k, 1, `${status}은 다시 시도하지 않음`);
  }
});

test("구간 요약: 확신·애매·제외 수와 「관련 있음 중 애매 비율」", () => {
  const s = summarizeBands([0.95, 0.9, 0.85, 0.5, 0.3, 0.1, 0.02, 0.01]);
  assert.deepEqual(s, { total: 8, auto: 3, candidate: 2, none: 3, ambiguousShare: 2 / 5 });
  assert.equal(summarizeBands([0.1, 0.05]).ambiguousShare, 0, "관련 있음이 하나도 없으면 비율 0");
  assert.deepEqual(summarizeBands([]), { total: 0, auto: 0, candidate: 0, none: 0, ambiguousShare: 0 });
});

test("교차표: 기존(Claude) 판정 × Jev 구간 — 기존 목록에 없는 조각은 absent로 센다", () => {
  const jev = new Map([["a", 0.95], ["b", 0.9], ["c", 0.5], ["d", 0.05], ["e", 0.4], ["f", 0.01]]);
  const existing = new Map<string, "auto" | "candidate">([["a", "auto"], ["b", "auto"], ["c", "candidate"], ["d", "candidate"]]);
  const t = crossTab(jev, existing);
  assert.deepEqual(t.auto, { auto: 2, candidate: 0, none: 0 });
  assert.deepEqual(t.candidate, { auto: 0, candidate: 1, none: 1 });
  assert.deepEqual(t.absent, { auto: 0, candidate: 1, none: 1 });
});

test("문구 변형: 기본(strict)은 「같은 사업 안의 다른 사안·사업 전반」을 아니오로 밝히고, 완화(loose)는 그 줄을 빼며, 질문 본문·조각 글은 같다", () => {
  assert.deepEqual(WORDING_VARIANTS, ["strict", "loose"]);
  const c = [chunk("k1")];
  const strict = relevanceQuestions(c).questions.q0;
  const explicit = relevanceQuestions(c, "strict").questions.q0;
  const loose = relevanceQuestions(c, "loose").questions.q0;
  assert.deepEqual(strict, explicit, "변형을 안 주면 기본(strict) — 1차 실험과 같은 요청");
  assert.match(strict.criteria!.false, /같은 사업 안의 다른 사안/);
  assert.match(strict.criteria!.false, /사업 전반/);
  assert.doesNotMatch(loose.criteria!.false, /같은 사업 안의 다른 사안|사업 전반/);
  assert.ok(loose.criteria!.false.length > 5, "완화라도 아니오 기준은 있음(낱말만 닮은 경우 등)");
  assert.equal(loose.criteria!.true, strict.criteria!.true, "예 기준은 변형 간에 같음");
  type Ins = { candidate: unknown; question: string };
  assert.deepEqual((loose.instructions as Ins).candidate, (strict.instructions as Ins).candidate);
  assert.equal((loose.instructions as Ins).question, (strict.instructions as Ins).question);
  assert.throws(() => relevanceQuestions(c, "nope" as never), /문구 변형/);
});

test("변형을 scoreChunks까지 넘긴다 — 요청의 질문이 그 변형의 기준으로 만들어짐", async () => {
  const seen: string[] = [];
  const call = async (req: { questions: Record<string, { criteria?: { false: string } }> }) => {
    seen.push(req.questions.q0.criteria!.false);
    return { model: "m", answers: { q0: noul(0.5) }, usage };
  };
  await scoreChunks(call as never, {}, [chunk("a")], { variant: "loose" });
  await scoreChunks(call as never, {}, [chunk("a")]);
  assert.doesNotMatch(seen[0], /사업 전반/);
  assert.match(seen[1], /사업 전반/, "안 주면 strict");
});

test("구간 세기: 지정한 조각들만 세고, Jev 점수에 없는 조각은 0으로 치지 않고 missing으로 센다", () => {
  const jev = new Map([["a", 0.95], ["b", 0.5], ["c", 0.05]]);
  assert.deepEqual(bandCounts(jev, ["a", "b", "c"]), { auto: 1, candidate: 1, none: 1, missing: 0 });
  assert.deepEqual(bandCounts(jev, ["a", "x", "y"]), { auto: 1, candidate: 0, none: 0, missing: 2 });
  assert.deepEqual(bandCounts(jev, []), { auto: 0, candidate: 0, none: 0, missing: 0 });
  assert.deepEqual(bandCounts(jev, ["b"], { high: 0.4, low: 0.1 }), { auto: 1, candidate: 0, none: 0, missing: 0 }, "구간을 바꾸면 달라짐");
});

test("카드별 비교 지표: Claude 확신·애매의 수와, 그중 Jev가 제외(p≤low)한 수", () => {
  const jev = new Map([["a", 0.95], ["b", 0.1], ["c", 0.5], ["d", 0.05], ["e", 0.15], ["f", 0.9]]);
  const existing = new Map<string, "auto" | "candidate">([["a", "auto"], ["b", "auto"], ["c", "candidate"], ["d", "candidate"], ["e", "candidate"]]);
  assert.deepEqual(cardComparison(jev, existing), { claudeAutoTotal: 2, claudeAutoNone: 1, claudeCandTotal: 3, claudeCandNone: 2 });
  assert.deepEqual(cardComparison(new Map(), new Map()), { claudeAutoTotal: 0, claudeAutoNone: 0, claudeCandTotal: 0, claudeCandNone: 0 });
});

test("결정 규칙: 기본은 「Claude 확신 제외 ≤1건 그리고 후보 제외율 ≥30%」 — 하나라도 어기면 접고 이유를 남긴다", () => {
  assert.deepEqual(DEFAULT_RULE, { maxAutoDropped: 1, minCandDropShare: 0.3 });
  const card = (o: Partial<ReturnType<typeof cardComparison>>) => ({ claudeAutoTotal: 10, claudeAutoNone: 0, claudeCandTotal: 10, claudeCandNone: 4, ...o });
  const pass = evaluateRule([card({}), card({ claudeAutoNone: 1 })]);
  assert.equal(pass.pass, true);
  assert.deepEqual([pass.autoDropped, pass.candTotal, pass.candDropped, pass.candDropShare], [1, 20, 8, 0.4]);
  assert.deepEqual(pass.reasons, []);

  const tooManyAuto = evaluateRule([card({ claudeAutoNone: 1 }), card({ claudeAutoNone: 1 })]);
  assert.equal(tooManyAuto.pass, false);
  assert.match(tooManyAuto.reasons.join(" "), /확신.*2건/);

  const lowShare = evaluateRule([card({ claudeCandNone: 1 }), card({ claudeCandNone: 2 })]);
  assert.equal(lowShare.pass, false);
  assert.match(lowShare.reasons.join(" "), /15%|제외율/);

  const both = evaluateRule([card({ claudeAutoNone: 3, claudeCandNone: 0 })]);
  assert.equal(both.reasons.length, 2, "두 조건을 모두 어기면 이유 둘");

  const empty = evaluateRule([card({ claudeCandTotal: 0, claudeCandNone: 0 })]);
  assert.equal(empty.pass, false, "후보가 하나도 없으면 제외율을 잴 수 없어 통과시키지 않음");
  assert.match(empty.reasons.join(" "), /후보/);
  assert.equal(evaluateRule([card({ claudeAutoNone: 2 })], { maxAutoDropped: 2, minCandDropShare: 0.3 }).pass, true, "규칙 값을 바꿀 수 있음");
});
