// 경영관리 경평 초안 「분량 채움 보강」(lib/reports/mg-fill.ts) 시험 — 가짜 카드·가짜 글·가짜 AI·가짜 DB만 씀(실제 AI·DB 호출 없음).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { blockEditPrompt, blockRoom } from "./block-edit.ts";
import type { Block, BlockOutput } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { DRAFT_CONFLICT_MSG } from "./draft-store.ts";
import { PAGE_MM, hollowBoxes } from "./fit.ts";
import { type FillCall, type FillPlan, type FillTarget, type MgFillInput, type MgFillRun, MG_FILL, acceptFill, emptyBlock, fillMessage, fillRequestText, fillWarnings, hollowByBlock, mgAdherenceWarning, mgFillPatch, mgFillReasons, missingBlocks, missingSlot, pickFillTargets, repeatsOf, runMgFill, saveFirstThenFill, sentencesOf, unusedLedgerFacts } from "./mg-fill.ts";
import { type PlanBlock, planAdherence } from "./composition.ts";
import { blockShapeCode } from "./block-shape.ts";
import { AI_LIMITS } from "../ai/request-log.ts";
import { reportBlockPromptsMg } from "../prompts/sets.ts";
import type { MgPart } from "./mg-types.ts";
import type { ReportSectionSpec } from "./section.ts";
import { warningLevel } from "./warning-levels.ts";

const P = reportBlockPromptsMg().prompts;

const card = {
  id: "경영관리9/9-3",
  group: "경영관리9",
  taskNo: "9-3",
  title: "가짜 과제",
  overview: { checks: {} },
  feedback: { rows: [] },
  findings: { rows: [] },
  do: { lines: ["∙ 교육 체계 개편"], monthly: [] },
  kpi: { rows: [] },
  outcome: { quantitative: ["∙ 직무교육 120명 수료", "∙ 참여 기관 23곳으로 확대", "∙ 3명 배치"], qualitative: ["∙ 현장 호응 확대"] },
};

const block = (b: Partial<Block> & Pick<Block, "kind">): Block => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const out = (b: Block): BlockOutput => ({ ...b, evidence: "", figures: b.figures ?? [] }) as BlockOutput;
const cell = (head: string, bullets: string[]) => ({ head, tag: "", bullets, note: "" });
const part = (key: string, evalNo: number, mark: string): MgPart => ({ key, evalNo, evalTitle: `평가내용 ${evalNo}`, themeNo: 1, themeTitle: "대주제", mark, title: `${mark} 절`, story: "", why: "" });
const A = part("3.1.가", 3, "가");
const B = part("4.1.가", 4, "가");

function mgSpec(rows: Array<[MgPart, Block]>, pages?: number): ReportSectionSpec {
  const parts = [...new Map(rows.map(([p]) => [p.key, p])).values()];
  return {
    version: 3,
    card: { id: card.id, taskNo: card.taskNo, title: card.title },
    business: { no: 0, name: "지표" },
    task: { no: "9-3", title: card.title, bp: false },
    sub: { mark: "", title: card.title, markers: [] },
    rows: [],
    blocks: rows.map(([, b]) => b),
    story: "",
    results: [],
    caption: "",
    module: 1,
    mg: { indicator: "지표", parts, at: rows.map(([p]) => p.key), ...(pages ? { pages } : {}) },
  };
}

const LONG = "교육 과정을 현장 요구에 맞춰 다시 짜고 부서별 의견을 모아 운영 방식을 바꿈";
/** 나란한 두 칸 중 한 칸만 긴 카드(빈 칸) */
const hollowCards = block({ kind: "cards", variant: "plain", label: "추진내용", cells: [cell("개편", [LONG, LONG]), cell("운영", ["짧음"])] });
/** 두 칸 길이가 같은 카드(빈 칸 없음) */
const evenCards = block({ kind: "cards", variant: "plain", label: "추진내용", cells: [cell("개편", [LONG]), cell("운영", [LONG])] });
const bullets = (label: string, items: string[]) => block({ kind: "bullets", label, items });

const input: MgFillInput = { card, known: "", quoteOnly: "", year: 2026, today: "2026-10-29" };

// ---------------------------------------------------------------------------
// 1. 판정

test("판정 ① 분량: 어림이 배정 × 90%보다 작으면 켜짐, 이상이거나 배정이 없으면 꺼짐", () => {
  const rows: Array<[MgPart, Block]> = [[A, bullets("추진배경", ["체계 개편 추진"])], [B, bullets("추진내용", ["운영 개선"])]];
  const h = mgSpecHeight(mgSpec(rows));
  const on = mgFillReasons(mgSpec(rows, 2), card);
  assert.equal(on.target, Math.round(2 * PAGE_MM.height));
  assert.equal(on.short, true, `어림 ${Math.round(h)}mm < 510 × 0.9`);
  // 배정을 어림 높이 / 0.9 위로 잡으면 꺼짐(0.5쪽 단위가 아니어도 됨 — 판정만 봄)
  assert.equal(mgFillReasons(mgSpec(rows, (h / PAGE_MM.height) * 1.05), card).short, false, "배정의 95%쯤이면 꺼짐");
  const none = mgFillReasons(mgSpec(rows), card);
  assert.equal(none.target, null);
  assert.equal(none.short, false, "배정이 없으면 분량 사유 없음");
  assert.equal(MG_FILL.low, 0.9, "메타프롬프트 F4 「배정의 90~125%」의 아래 끝");
});

test("판정 ② 빈 칸: 나란한 칸 중 짧은 칸이 있으면 그 블록 번호와 칸, 칸 길이가 같으면 없음 — 블록별 합 = 초안 전체 hollowBoxes", () => {
  const spec = mgSpec([[A, bullets("추진배경", ["배경"])], [A, hollowCards], [B, evenCards]]);
  const by = hollowByBlock(spec);
  assert.deepEqual(by.map((x) => x.index), [1]);
  assert.ok(by[0].boxes.every((x) => x.where.startsWith("추진내용 ")));
  assert.equal(by.flatMap((x) => x.boxes).length, hollowBoxes(spec.blocks!, spec.mg!.at).length, "블록별로 가른 빈 칸 합이 전체와 같음");
  assert.deepEqual(mgFillReasons(mgSpec([[A, evenCards]]), card).hollow, []);
});

test("판정 ③ 안 쓴 원장 사실: 수치가 초안에 없는 원장 성과 줄만(수치 없는 줄·흔한 값만 있는 줄은 셈하지 않음), 초안에 그 수치가 있으면 빠짐", () => {
  const empty = mgSpec([[A, bullets("추진내용", ["체계 개편"])]]);
  assert.deepEqual(unusedLedgerFacts(empty, card), ["직무교육 120명 수료", "참여 기관 23곳으로 확대"], "「3명」(한 자리 개수)·「현장 호응 확대」(수치 없음)는 셀 수 없어 뺌");
  const used = mgSpec([[A, bullets("추진내용", ["교육 120명이 마침", "기관 23곳 참여"])]]);
  assert.deepEqual(unusedLedgerFacts(used, card), [], "같은 값 + 단위가 초안에 있으면 쓴 것");
  const r = mgFillReasons(used, card);
  assert.equal(r.facts.length, 0);
  assert.equal(pickFillTargets(used, r).length, 0, "사유가 하나도 없으면 고르지 않음(보강 안 함)");
});

// ---------------------------------------------------------------------------
// 2. 고르기

test("고르기: 빈 칸 블록 먼저 → 분량이 모자란 절의 칸 글 블록, 막대·띠·소제목·인용·코드가 채운 추진성과는 뺌", () => {
  const rows: Array<[MgPart, Block]> = [
    [A, bullets("추진배경", ["배경"])],
    [A, block({ kind: "chart", label: "추진성과", series: [{ label: "’25", value: "10" }, { label: "’26", value: "20" }] as any })],
    [A, block({ kind: "stats", label: "추진성과", cells: [cell("120명", ["수료"]), cell("23곳", ["참여"])] })],
    [A, block({ kind: "subhead", label: "", text: "소제목" })],
    [A, block({ kind: "quotes", label: "목소리", cells: [cell("담당", ["좋아졌다"])] })],
    [B, bullets("추진내용", ["운영 개선"])],
    [B, hollowCards],
    [B, bullets("추진성과", ["원장 줄"])],
    [B, bullets("향후계획", ["다음 계획"])],
  ];
  const spec = mgSpec(rows, 3);
  const r = mgFillReasons(spec, card);
  const ts = pickFillTargets(spec, r, [B.key]);
  assert.equal(ts[0].index, 6, "빈 칸 블록이 맨 앞");
  assert.equal(ts[0].why, "hollow");
  for (const skip of [1, 2, 3, 4]) assert.ok(!ts.some((t) => t.index === skip), `${spec.blocks![skip].kind}는 보강하지 않음`);
  assert.ok(!ts.some((t) => t.index === 7), "코드가 채운 절(closed)의 「추진성과」 블록은 보강하지 않음");
  assert.ok(ts.slice(1).every((t) => t.why === "short" && t.part && t.part.short > 0));
  // 여유 = 남은 분량 ÷ 고른 블록 수(블록마다 같음)
  const room = r.target! - r.height;
  for (const t of ts) assert.equal(t.share, Math.floor(room / ts.length));
  // 코드가 채운 절이 아니면 「추진성과」 불릿도 후보(라벨로 가르지 않고 closed로만 가름)
  const one = mgSpec([[B, hollowCards], [B, bullets("추진성과", ["원장 줄"])]], 2);
  const oneR = mgFillReasons(one, card);
  assert.deepEqual(pickFillTargets(one, oneR).map((t) => t.index), [0, 1]);
  assert.deepEqual(pickFillTargets(one, oneR, [B.key]).map((t) => t.index), [0]);
});

test("고르기 상한 해제(2026-10-29): 후보가 1분 한도(AI_LIMITS.perMinute)보다 많아도 보강할 수 있는 블록 전부, 분량이 모자란 절 먼저 · 몫 = 남은 분량 ÷ 전부", () => {
  const rows: Array<[MgPart, Block]> = [
    [A, bullets("추진배경", ["배경 하나"])],
    ...Array.from({ length: 6 }, (_, i): [MgPart, Block] => [B, bullets(`내용${i}`, ["짧은 줄"])]),
  ];
  const spec = mgSpec(rows, 4);
  const ts = pickFillTargets(spec, mgFillReasons(spec, card));
  assert.equal(ts.length, 7, "7블록 모두(예전 상한 4)");
  assert.ok(ts.length > AI_LIMITS.perMinute - 1);
  const r = mgFillReasons(spec, card);
  assert.ok(ts.every((t) => t.share === Math.floor((r.target! - r.height) / 7)));
  // 절 몫은 같고 B절이 블록이 많아 덜 모자람 — A절(더 모자람)의 블록이 먼저
  assert.equal(ts[0].index, 0);
});

test("고르기: 늘릴 높이가 없고(배정 이상) 빈 칸도 없으면 안 쓴 원장 사실만으로는 고르지 않음, 배정이 없으면 여유 null", () => {
  const rows: Array<[MgPart, Block]> = [[A, bullets("추진내용", ["체계 개편"])]];
  const h = mgSpecHeight(mgSpec(rows));
  const over = mgSpec(rows, (h / PAGE_MM.height) * 0.98);
  const r = mgFillReasons(over, card);
  assert.ok(r.facts.length > 0 && !r.short);
  assert.deepEqual(pickFillTargets(over, r), []);
  const free = mgSpec([[A, hollowCards]]);
  const t = pickFillTargets(free, mgFillReasons(free, card));
  assert.equal(t.length, 1);
  assert.equal(t[0].share, null, "배정이 없으면 여유를 셈하지 않음");
});

test("고르기: 안 쓴 원장 사실은 블록 하나에만 — 그 블록이 든 절 글과 많이 겹치는 블록으로", () => {
  const rows: Array<[MgPart, Block]> = [
    [A, bullets("추진내용", ["직무교육 과정 개편과 수료 관리"])],
    [B, bullets("추진내용", ["참여 기관 협의체 운영과 확대"])],
  ];
  const spec = mgSpec(rows, 3);
  const ts = pickFillTargets(spec, mgFillReasons(spec, card));
  const at = (i: number) => ts.find((t) => t.index === i)!;
  assert.deepEqual(at(0).facts, ["직무교육 120명 수료"]);
  assert.deepEqual(at(1).facts, ["참여 기관 23곳으로 확대"]);
  assert.equal(ts.flatMap((t) => t.facts).length, 2, "한 사실이 두 블록에 가지 않음");
});

// ---------------------------------------------------------------------------
// 3. 요청 글 · 여유 mm

test("요청 글: 코드가 fill.* 조각으로 만듦(칸 x/y줄·안 쓴 원장 사실·늘려도 되는 mm·짜임 그대로) — 자리표시 없음", () => {
  const t: FillTarget = { index: 1, why: "hollow", boxes: [{ where: "추진내용 2번째 칸", used: 1, most: 4, perLine: 14, add: 30 }], share: 37, facts: ["직무교육 120명 수료"], repeats: [], sentences: [] };
  const text = fillRequestText(P, t, { unit: "cell", perLine: 14, now: 4, max: 9, slack: 37, bullet: 2 });
  assert.match(text, /^분량 채움 보강 — /);
  assert.match(text, /\[추진내용 2번째 칸\] 지금 1\/4줄/);
  assert.match(text, /아직 안 쓴 원장 사실[^\n]*「직무교육 120명 수료」/);
  assert.match(text, /약 37mm — 칸마다 약 5줄\(불릿 3개\) 더 늘려 채움/, "늘릴 줄 = max − now, 불릿 = 줄 ÷ 불릿 하나 줄 수(올림)");
  assert.match(fillRequestText(P, t, { unit: "cell", perLine: 14, now: 4, max: 6, slack: 37 }), /약 37mm — 칸마다 약 2줄 더/, "불릿 줄 수가 없는 칸");
  assert.match(fillRequestText(P, t, { unit: "line", perLine: 40, now: 3, max: 10, slack: 37 }), /약 37mm — 불릿 줄 합 약 7줄 더/);
  assert.match(fillRequestText(P, t, { unit: "line", perLine: 40, now: 3, max: 3, slack: 37 }), /지금 높이 안에서/, "한 줄도 못 늘리면 늘리지 않음");
  assert.match(text, /짜임·라벨·칸 수·모양·그림 자리는 그대로/);
  assert.doesNotMatch(text, /\{\{/);
  const keep = fillRequestText(P, { ...t, boxes: [], why: "short", part: { share: 120, short: 45 }, share: 0, facts: [] });
  assert.match(keep, /절 몫\(약 120mm\)보다 약 45mm 모자랍니다/);
  assert.match(keep, /지금 높이 안에서/);
  assert.match(keep, /없음 — 근거에 있는 이 블록 주제의 사실로만/);
});

test("여유 mm: 보강은 blockRoom에 블록 몫을 줘 그만큼 줄을 늘림 — 사람 요청(값 없음)은 예전 셈 그대로", () => {
  const spec = mgSpec([[A, bullets("추진내용", ["체계 개편"])], [B, bullets("추진내용", ["운영"])]], 2);
  const human = blockRoom(spec, 0)!;
  assert.equal(human.slack, Math.round(2 * PAGE_MM.height - mgSpecHeight(spec)), "사람 요청은 초안 전체 여유");
  const share = blockRoom(spec, 0, 12)!;
  assert.equal(share.slack, 12);
  assert.ok(share.max > share.now && share.max <= human.max, "몫만큼만 늘림");
  assert.equal(blockRoom(spec, 0, 0.5)!.max, share.now, "몫이 한 줄보다 작으면 늘리지 않음");
  const req = { blockIndex: 0, kind: "edit" as const, request: "요청", quote: "" };
  assert.equal(blockEditPrompt(P, spec, req, { card: "", extra: "" }), blockEditPrompt(P, spec, req, { card: "", extra: "" }, undefined, undefined), "몫을 안 주면 같은 글");
  assert.match(blockEditPrompt(P, spec, req, { card: "", extra: "" }, undefined, 12), /판면 여유 12mm/);
});

// ---------------------------------------------------------------------------
// 3. 다시 쓰기(가짜 AI)

const usage = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cacheWrite1h: 0 };
/** 모든 라운드의 블록 결과(라운드 순) */
const res = (run: MgFillRun) => run.rounds.flatMap((r) => r.results);
const okCall = (block: (b: Block) => Block, seen: string[] = []) => async (prompt: string, t: FillTarget): Promise<FillCall> => {
  seen.push(prompt);
  return { ok: true, output: { block: out(block(baseSpec.blocks![t.index])), reply: "보탰습니다" }, usage, model: "fake" };
};
const baseRows: Array<[MgPart, Block]> = [[A, bullets("추진내용", ["교육 체계 개편 추진"])], [B, bullets("추진성과", ["운영 개선"])]];
const baseSpec = mgSpec(baseRows, 2);
const deps = (call: (p: string, t: FillTarget) => Promise<FillCall>, o: Partial<{ t0: number; firstMs: number; deadlineMs: number; now: () => number }> = {}) => ({ prompts: P, call, t0: 0, firstMs: 0, deadlineMs: Infinity, now: () => 0, ...o });

test("다시 쓰기: 받은 블록은 그 블록만 바뀌고(사람이 고친 블록 표시 없음) 높이가 늘며, 요청 글은 블록 고치기 edit 절 + fill 조각", async () => {
  const seen: string[] = [];
  const run = await runMgFill(baseSpec, input, deps(okCall((b) => ({ ...b, items: [...b.items, "직무교육 120명 수료로 현장 역량을 높임", "참여 기관 23곳으로 늘려 협업 범위를 넓힘"] }), seen)));
  assert.ok(run);
  assert.ok(run.rounds[0].results.length > 0 && run.rounds[0].results.every((r) => r.ok), JSON.stringify(res(run)));
  assert.ok(run.after > run.before, `${run.before} → ${run.after}`);
  assert.equal(run.spec.humanEdits, undefined, "AI 보강은 사람이 고친 블록이 아님");
  assert.match(seen[0], /「이번 요청 — 블록 고치기」/);
  assert.match(seen[0], /- 요청: 분량 채움 보강 — /);
  assert.match(seen[0], /모양 바꾸기[^\n]*없음 — 이 요청은 모양을 바꾸지 않음/);
  assert.equal(baseSpec.blocks![0].items.length, 1, "원래 초안은 그대로");
  assert.deepEqual(run.usage.input, usage.input * res(run).length);
});

test("다시 쓰기: 근거 밖 숫자·종류 바꾸기·칸 수 바꾸기·바꾸지 않음·호출 실패는 받지 않고 1차 글 유지(다음 블록은 계속)", async () => {
  const cases: Array<[string, (b: Block) => Block, RegExp]> = [
    ["없는 숫자", (b) => ({ ...b, items: [...b.items, "만족도 999건 기록"] }), /근거 밖 숫자 1개\(999\)/],
    ["종류", (b) => ({ ...b, kind: "cards", variant: "plain", items: [], cells: [cell("a", ["x"]), cell("b", ["y"])] }), /블록 종류를 바꿨습니다/],
    ["그대로", (b) => b, /바꾸지 않음/],
  ];
  for (const [name, f, why] of cases) {
    const run = await runMgFill(baseSpec, input, deps(okCall(f)));
    assert.ok(run, name);
    assert.ok(res(run).every((r) => !r.ok), name);
    assert.match(res(run)[0].reason ?? "", why, name);
    assert.deepEqual(run.spec.blocks, baseSpec.blocks, `${name}: 1차 글 그대로`);
  }
  const cards = mgSpec([[A, hollowCards]], 2);
  const more = await runMgFill(cards, input, deps(async (_p, t) => ({ ok: true, output: { block: out({ ...cards.blocks![t.index], cells: [cell("a", ["x"]), cell("b", ["y"]), cell("c", ["z"])] }), reply: "" }, usage, model: "fake" })));
  assert.equal(res(more!)[0].reason, "모양이나 칸 수가 바뀜", "칸 수가 바뀌면(2칸 → 3칸) 받지 않음");
  const fewer = await runMgFill(cards, input, deps(async (_p, t) => ({ ok: true, output: { block: out({ ...cards.blocks![t.index], cells: [cell("개편", [LONG])] }), reply: "" }, usage, model: "fake" })));
  assert.match(res(fewer!)[0].reason ?? "", /칸이 모자라거나/, "칸이 모자라면 블록 고치기 검증이 거절");
  let n = 0;
  const thrown = await runMgFill(mgSpec(baseRows, 3), input, deps(async (_p, t) => {
    n += 1;
    if (n === 1) throw new Error("CLI 실패");
    return { ok: true, output: { block: out({ ...baseSpec.blocks![t.index], items: [...baseSpec.blocks![t.index].items, "직무교육 120명 수료"] }), reply: "" }, usage, model: "fake" };
  }));
  assert.equal(res(thrown!)[0].ok, false);
  assert.match(res(thrown!)[0].reason ?? "", /CLI 실패/);
  assert.ok(res(thrown!).length >= 2, "던진 블록 뒤 블록도 시도");
});

test("다시 쓰기: 호출 한도에 걸리면(stop) 남은 블록은 시작하지 않음, 기한(canFixAgain) 안에 한 번 더 부를 시간이 없으면 시작하지 않음", async () => {
  let calls = 0;
  const limited = await runMgFill(mgSpec(baseRows, 3), input, deps(async () => {
    calls += 1;
    return { ok: false, stop: true, message: "요청이 너무 잦습니다." };
  }));
  // 한도는 그 라운드만 끝냄(기다리지 않음) — 아직 배정 × 0.9 미만이라 2회차가 한 번 더 시도하고 또 걸리면 끝
  assert.equal(calls, 2);
  assert.deepEqual(limited!.rounds.map((r) => r.skipped?.why), ["limit", "limit"]);
  assert.equal(limited!.rounds[0].skipped?.blocks.length, limited!.rounds[0].targets.length);
  let timedCalls = 0;
  // 지금까지 600초 + 1차 집필 100초 × 1.1 > 기한 690초 → 시작하지 않음
  const timed = await runMgFill(mgSpec(baseRows, 3), input, deps(async () => ((timedCalls += 1), { ok: false, stop: false, message: "x" }), { t0: 0, now: () => 600_000, firstMs: 100_000, deadlineMs: 690_000 }));
  assert.equal(timedCalls, 0);
  assert.equal(timed!.rounds[0].skipped?.why, "time");
  assert.equal(timed!.rounds.length, 1, "시간이 없으면 2회차도 없음");
  assert.equal(await runMgFill(mgSpec([[A, bullets("추진내용", ["교육 120명이 마침", "기관 23곳 참여"])]]), input, deps(async () => assert.fail("부르면 안 됨"))), null, "사유가 없으면 AI를 부르지 않음");
});

test("경고·저장 값: 보강한 블록·채운 mm(참고 「분량 보강」), 1차 유지 블록(참고 「분량 보강 실패」), 집필 때만 셈하는 1차 경고는 남기고 다시 점검 경고는 새로", async () => {
  let n = 0;
  const run = (await runMgFill(baseSpec, input, deps(async (_p, t) => {
    n += 1;
    const b = baseSpec.blocks![t.index];
    return { ok: true, output: { block: out({ ...b, items: [...b.items, n === 1 ? "직무교육 120명 수료로 현장 역량을 높임" : "만족도 999건"] }), reply: "" }, usage, model: "fake" };
  })))!;
  const ws = fillWarnings(run);
  assert.match(ws[0], /^분량 보강: 블록 1개\(\d번 「[^」]+」 \+\d+mm\)에 원장·근거 사실을 보탰습니다 — 분량 어림 \d+ → \d+\/510mm/);
  assert.match(ws[1], /^분량 보강 실패: 블록 1개는 1차 글을 유지했습니다\(\d번 「[^」]+」 — 근거 밖 숫자 1개\(999\)\)/);
  for (const w of ws) assert.equal(warningLevel(w), "info", w);
  const first = { spec: baseSpec, warnings: ["구성안: 승인한 짜임 3블록 중 2블록만 같은 순서로 썼습니다 — 다시 만들거나 구성안을 고쳐 주세요."] };
  const patch = mgFillPatch(first, run, input);
  assert.equal(patch.warnings[0], first.warnings[0], "집필 때만 셈하는 경고는 그대로");
  assert.ok(patch.warnings.some((w) => w.startsWith("분량 보강: ")));
  assert.equal(patch.warnings.filter((w) => w.startsWith("분량:")).length, new Set(patch.warnings.filter((w) => w.startsWith("분량:"))).size, "다시 점검 경고가 겹치지 않음");
  assert.ok(patch.spec.blocks!.some((b) => b.items.some((x) => x.includes("120명"))));
  assert.deepEqual(patch.unknownNumbers, []);
  assert.match(fillMessage(run, "saved"), /^ 분량 보강 블록 1\/2개·2회\(분량 어림 \d+ → \d+\/510mm\)\.$/);
  assert.match(fillMessage(run, "conflict"), /그사이 초안이 바뀌어 분량 보강 결과는 저장하지 않았습니다/);
  assert.equal(fillMessage(null, "none"), "");
});

// ---------------------------------------------------------------------------
// 3-2. 라운드·블록 몫·반복 수치(2026-10-29 오후 — 보강 키우기)

/** 부를 때마다 그 블록에 숫자 없는 긴 줄을 하나씩 더 붙여 돌려주는 가짜 AI(앞 라운드에 받은 줄 위에 이어 붙음) — grow에 없는 블록은 그대로(받지 않음) */
const EXTRA = ["현장 의견을 모아 교육 과정의 순서와 실습 비중을 다시 짜서 운영함", "부서별 담당자 협의로 운영 방식을 바꾸고 결과를 공유함", "참여 부서의 요청을 반영해 다음 과정 구성을 고침", "운영 결과를 점검해 미흡한 과정을 보완함"];
/** 홀수 번째 블록에 붙일 다른 줄 — 두 블록에 같은 줄을 붙이면 반복 문장(⑤ 사유)이 생겨 라운드 시험의 후보가 바뀜 */
const EXTRA_ODD = ["신규 입사자 안내 자료를 만들어 첫 주 적응을 도움", "외부 강사 풀을 넓혀 전문 과목 강의를 늘림", "온라인 강좌 신청 절차를 줄여 접수를 쉽게 함", "분기마다 수강 기록을 모아 부서장에게 알림"];
function growCall(spec: ReportSectionSpec, grow: (i: number) => boolean, clock?: { t: number; step: number }) {
  const n = new Map<number, number>();
  return async (_p: string, t: FillTarget): Promise<FillCall> => {
    if (clock) clock.t += clock.step;
    const b = spec.blocks![t.index];
    if (!grow(t.index)) return { ok: true, output: { block: out(b), reply: "" }, usage, model: "fake" };
    const k = (n.get(t.index) ?? 0) + 1;
    n.set(t.index, k);
    return { ok: true, output: { block: out({ ...b, items: [...b.items, ...(t.index % 2 ? EXTRA_ODD : EXTRA).slice(0, k)] }), reply: "" }, usage, model: "fake" };
  };
}
const twoRows: Array<[MgPart, Block]> = [[A, bullets("추진내용", ["교육 체계 개편 추진"])], [B, bullets("추진내용", ["운영 방식 개선"])]];
/** 배정을 지금 어림 + room mm로(0.5쪽 단위가 아니어도 됨 — 판정만 봄) */
const roomSpec = (rows: Array<[MgPart, Block]>, room: number) => mgSpec(rows, (mgSpecHeight(mgSpec(rows)) + room) / PAGE_MM.height);

test("라운드: 1회차 뒤 아직 배정 × 0.9 미만이면 2회차(받은 블록도 다시 후보 — 늘린 줄 위에 이어 씀), 1회차로 0.9에 닿으면 2회차 없음", async () => {
  const far = mgSpec(twoRows, 2);
  const run = (await runMgFill(far, input, deps(growCall(far, () => true))))!;
  assert.equal(MG_FILL.rounds, 2);
  assert.equal(run.rounds.length, 2, "510mm에 한참 모자라 2회차까지");
  assert.deepEqual(run.rounds.map((r) => r.round), [1, 2]);
  assert.deepEqual(run.rounds[1].targets.map((t) => t.index), [0, 1], "몫의 절반에 못 미친 블록은 2회차에 다시 후보");
  assert.ok(run.rounds[1].results.every((r) => r.ok && r.round === 2));
  assert.equal(run.rounds[1].before, run.rounds[0].after);
  assert.ok(run.after > run.rounds[0].after, "2회차도 늘림");
  assert.ok(run.spec.blocks![0].items.length === 1 + 2, "1회차 한 줄 + 2회차 한 줄 더");
  // 지금 어림이 배정 × 0.9보다 조금 작게(한 줄이면 넘음) — 1회차로 닿아 2회차 없음
  const h = mgSpecHeight(mgSpec(twoRows));
  const near = mgSpec(twoRows, (h / 0.9 + 2) / PAGE_MM.height);
  assert.ok(mgFillReasons(near, card).short);
  const once = (await runMgFill(near, input, deps(growCall(near, () => true))))!;
  assert.equal(once.rounds.length, 1, "목표에 닿으면 멈춤");
  assert.ok(!mgFillReasons(once.spec, card).short);
});

test("라운드 2회차 후보(2026-10-29 「내용이 많은 쪽」): 아직 배정 × 0.9 미만이면 보강할 수 있는 블록 전부 — 1회차에 몫을 다 쓴 블록·못 받은 블록도, 몫은 남은 분량을 다시 나눔", async () => {
  // 남은 분량 24mm → 블록 둘이 몫 12mm씩, 0번만 한 줄(몫의 절반 이상) 늘리고 1번은 바꾸지 않음(못 받음) — 그래도 배정 × 0.9 미만
  const spec = roomSpec(twoRows, 24);
  const run = (await runMgFill(spec, input, deps(growCall(spec, (i) => i === 0))))!;
  const r1 = run.rounds[0];
  const got = r1.results.find((r) => r.index === 0)!;
  assert.ok(got.ok && got.mm! * 2 >= got.share!, JSON.stringify(r1.results));
  assert.equal(r1.results.find((r) => r.index === 1)!.ok, false);
  assert.equal(run.rounds.length, 2, JSON.stringify(run.rounds.map((r) => [r.before, r.after, r.reasons.target])));
  assert.deepEqual(run.rounds[1].targets.map((t) => t.index), [1, 0], "못 받은 1번(더 모자란 절 먼저)도, 몫을 다 쓴 0번도 2회차 후보(예전에는 0번을 뺐음)");
  const left = Math.max(0, run.rounds[1].reasons.target! - run.rounds[1].reasons.height);
  for (const t of run.rounds[1].targets) assert.equal(t.share, Math.floor(left / 2), "남은 분량을 다시 나눈 새 몫");
  assert.ok(run.rounds[1].results.some((r) => r.index === 1), "못 받은 블록을 한 번 더 시도");
  assert.equal(run.spec.blocks![0].items.length, 1 + 2, "0번은 2회차에도 이어 늘림");
});

test("고르기 all(2회차): 절 몫을 채운 절의 블록도 모자란 절 블록 뒤에 블록 순으로 — 1회차(all 없음)는 모자란 절 블록만", () => {
  // A절 블록 6개(절 몫보다 김) · B절 블록 1개(절 몫보다 짧음), 카드 전체는 배정의 약 85%
  const rows: Array<[MgPart, Block]> = [...Array.from({ length: 6 }, (_, i): [MgPart, Block] => [A, bullets(`내용${i}`, ["교육 체계 개편 추진"])]), [B, bullets("추진내용", ["운영 개선"])]];
  const h = mgSpecHeight(mgSpec(rows));
  const spec = mgSpec(rows, h / 0.85 / PAGE_MM.height);
  const r = mgFillReasons(spec, card);
  assert.ok(r.short);
  assert.deepEqual(pickFillTargets(spec, r).map((t) => t.index), [6], "1회차: 절 몫보다 모자란 B절 블록만");
  const all = pickFillTargets(spec, r, [], true);
  assert.deepEqual(all.map((t) => t.index), [6, 0, 1, 2, 3, 4, 5]);
  assert.ok(all.slice(1).every((t) => t.why === "short" && !t.part), "절 몫을 채운 절 블록은 절 모자람 없이(요청 글에 fill.short 없음)");
  assert.ok(all.every((t) => t.share === Math.floor((r.target! - r.height) / 7)));
  assert.doesNotMatch(fillRequestText(P, all[1], blockRoom(spec, all[1].index, all[1].share!)), /절 몫/);
  // 분량 사유가 없으면(빈 칸·반복만) all이어도 더하지 않음
  const even = mgSpec([[A, hollowCards], [A, bullets("추진내용", ["운영 개선"])]]);
  assert.deepEqual(pickFillTargets(even, mgFillReasons(even, card), [], true).map((t) => t.index), [0]);
});

test("멈춤: Vercel 기한·로컬 전체 상한(MG_FILL.maxSec)이면 그 자리에서 끝(2회차 없음), 시간 어림은 직전 블록 호출 ms", async () => {
  const spec = mgSpec(twoRows, 2);
  // 블록 호출마다 250초: 1회차 0+110 ≤ 690 → 250+275 ≤ 690 → 2회차 첫 블록 500+275 > 690
  const clock = { t: 0, step: 250_000 };
  const vercel = (await runMgFill(spec, input, deps(growCall(spec, () => true, clock), { firstMs: 100_000, deadlineMs: 690_000, now: () => clock.t })))!;
  assert.equal(vercel.rounds.length, 2);
  assert.equal(vercel.rounds[0].results.length, 2);
  assert.deepEqual(vercel.rounds[1].skipped, { why: "time", blocks: [0, 1] });
  assert.equal(MG_FILL.maxSec, 600);
  // 로컬(기한 Infinity): 보강 시작 + 600초가 기한 — 2회차 첫 블록 500+275 > 600
  const c2 = { t: 0, step: 250_000 };
  const local = (await runMgFill(spec, input, deps(growCall(spec, () => true, c2), { firstMs: 100_000, deadlineMs: Infinity, now: () => c2.t })))!;
  assert.equal(local.rounds[1].skipped?.why, "time");
  assert.equal(res(local).length, 2);
  assert.match(fillWarnings(local).at(-1) ?? "", /^분량 보강: /, "받은 블록은 다른 라운드에서 시간이 모자라도 실패로 적지 않음");
});

test("블록 몫(blockRoom share): 보강은 「지금 줄 + 4줄」 상한 없이 몫 mm까지(불릿 8개 넘어도 한 줄 높이로 이어 셈), 사람 블록 고치기(몫 없음)는 그대로 + 4줄", () => {
  const many = mgSpec([[A, bullets("추진내용", Array.from({ length: 9 }, () => "교육 체계 개편 추진"))]], 6);
  const human = blockRoom(many, 0)!;
  assert.equal(human.max, human.now + 4, "사람 요청은 판면 여유가 커도 4줄까지");
  const big = blockRoom(many, 0, 120)!;
  assert.ok(big.max > big.now + 4, `몫 120mm면 4줄보다 많이: ${big.now} → ${big.max}`);
  const small = blockRoom(many, 0, 30)!;
  assert.ok(small.max > small.now && small.max < big.max, "몫에 비례");
  const cards = mgSpec([[A, evenCards]], 6);
  assert.ok(blockRoom(cards, 0, 150)!.max > blockRoom(cards, 0)!.max, "칸 블록도 몫만큼");
  // 요청 글: 늘릴 줄·불릿 수를 코드가 셈 — 사람 요청 글(몫 없음)은 예전과 같은 글
  const t: FillTarget = { index: 0, why: "short", boxes: [], part: { share: 200, short: 120 }, share: 120, facts: [], repeats: [], sentences: [] };
  assert.match(fillRequestText(P, t, big), new RegExp(`약 120mm — 불릿 줄 합 약 ${big.max - big.now}줄 더`));
  const req = { blockIndex: 0, kind: "edit" as const, request: "요청", quote: "" };
  assert.match(blockEditPrompt(P, many, req, { card: "", extra: "" }), new RegExp(`최대 ${human.now + 4}줄까지`));
});

/** 반복 수치 시험 초안: 120명이 0·1·2번(절 둘)에, 1·3번이 「추진성과」 */
const repRows: Array<[MgPart, Block]> = [
  [A, bullets("추진내용", ["직무교육 120명 수료로 현장 역량을 높임"])],
  [A, bullets("추진성과", ["직무교육 120명 수료"])],
  [B, bullets("추진내용", ["교육 120명 운영 경과를 점검함"])],
  [B, bullets("추진성과", ["교육 120명 마침"])],
  [B, block({ kind: "stats", label: "추진성과", cells: [cell("120명", ["수료"]), cell("23곳", ["참여"])] })],
  [B, block({ kind: "quotes", label: "목소리", cells: [cell("담당", ["120명이 함께해 좋았다"])] })],
];

test("반복 수치 남길 자리: 그 수치가 든 「추진성과」 블록(구성안 성과 배정이 맞는 절 먼저 → 블록 순), 없으면 처음 나온 블록 — 기준은 「반복 수치」 경고와 같음", () => {
  const spec = mgSpec(repRows, 3);
  const r = repeatsOf(spec).find((x) => x.key === "120명")!;
  assert.ok(r, JSON.stringify(repeatsOf(spec)));
  assert.equal(r.keep, 1, "배정이 없으면 블록 순 첫 「추진성과」");
  assert.deepEqual(r.others, [0, 2, 3, 4, 5]);
  const plan: FillPlan = {
    materials: [{ id: "m1", kind: "fact", text: "직무교육 120명 수료", quote: "", when: "", from: "" } as any],
    blocks: [{ at: B.key, label: "추진성과", materials: ["m1"] } as any],
    mg: { indicator: "지표", parts: [A, B], outcomes: [{ text: "직무교육 120명 수료", from: "quantitative", figure: true }] },
  };
  assert.equal(repeatsOf(spec, plan).find((x) => x.key === "120명")!.keep, 3, "구성안이 그 성과 재료를 B절 추진성과에 배정 → B절 「추진성과」");
  const noClose = mgSpec([[A, bullets("추진내용", ["교육 120명 운영"])], [B, bullets("추진배경", ["교육 120명 대상"])]], 3);
  assert.deepEqual(repeatsOf(noClose).map((x) => [x.figure, x.keep, x.others]), [["120명", 0, [1]]], "닫는 블록이 없으면 처음 나온 블록, 절 둘이면 블록 둘도 반복");
  assert.deepEqual(repeatsOf(mgSpec([[A, bullets("추진내용", ["교육 120명 운영", "교육 120명 대상"])], [A, bullets("추진배경", ["교육 120명"])]], 3)).length, 0, "한 절 블록 둘은 반복 아님(블록 3개 미만)");
  assert.ok(mgFillReasons(spec, card).repeats.length > 0);
});

test("반복 대상 블록 고르기: 남길 자리 밖의 블록 — 수치 띠·인용·코드가 채운 추진성과는 뺌, 반복 블록에 안 쓴 원장 사실 먼저(같은 사실 두 블록 안 줌), 요청 글에 수치·남길 자리", () => {
  const spec = mgSpec(repRows, 3);
  // 120명·23곳은 초안에 있어 안 쓴 원장 사실이 아님 — 안 쓴 사실 둘을 더한 카드
  const card2 = { ...card, outcome: { ...card.outcome, quantitative: [...card.outcome.quantitative, "∙ 만족도 4.5점 달성", "∙ 협약 15건 체결"] } };
  const ts = pickFillTargets(spec, mgFillReasons(spec, card2), [B.key]);
  const rep = ts.filter((t) => t.repeats.length);
  assert.deepEqual(rep.map((t) => t.index), [0, 2], "수치 띠(4)·인용(5)·코드가 채운 B절 추진성과(3)는 뺌");
  assert.ok(rep.every((t) => t.repeats.some((x) => x.figure === "120명" && x.at === "2번 「추진성과」")));
  const facts = ts.flatMap((t) => t.facts);
  assert.equal(facts.length, new Set(facts).size, "같은 사실을 두 블록에 주지 않음");
  assert.deepEqual(rep.map((t) => t.facts.length), [1, 1], "반복 블록마다 사실 하나씩 먼저(뺀 자리를 채울 사실)");
  const text = fillRequestText(P, rep[0], blockRoom(spec, rep[0].index, rep[0].share ?? undefined));
  assert.match(text, /같은 수치 되풀이 — 이 블록의 120명\(이미 \[2번 「추진성과」\]에 있음\)\. 이 블록에서는 그 수치를 빼고 뒤의 「아직 안 쓴 원장 사실」로 바꿉니다\. 바꿀 사실이 없으면 그 수치만 빼고 문장은 살려 줄 수를 유지합니다\./);
  assert.doesNotMatch(text, /\{\{/);
  // 분량이 넉넉해도(배정 없음) 반복만으로 고름
  const free = mgSpec(repRows);
  assert.deepEqual(pickFillTargets(free, mgFillReasons(free, card)).filter((t) => t.why === "repeat").map((t) => t.index), [0, 2, 3]);
});

test("받기: 높이가 줄면 안 받음, 배정 × 1.25를 넘게 늘면 안 받음, 반복 수치를 뺐으면 받음(removed), 남겼어도 분량이 늘면 받고 「반복 그대로」, 남기고 그대로면 안 받음", async () => {
  const found = () => true;
  const two = mgSpec([[A, bullets("추진내용", ["교육 체계 개편 추진", "운영 방식을 바꿔 부서 협업을 넓힘"])]], 2);
  const shrink = acceptFill(two, 0, out({ ...two.blocks![0], items: ["교육 체계 개편 추진"] }), input, found, 510);
  assert.equal(shrink.ok, false);
  assert.match(!shrink.ok ? shrink.reason : "", /^높이가 줄어듦/);
  const h = mgSpecHeight(two);
  const over = acceptFill(two, 0, out({ ...two.blocks![0], items: [...two.blocks![0].items, ...EXTRA] }), input, found, Math.round(h));
  assert.match(!over.ok ? over.reason : "", /배정의 125%를 넘음/);
  const spec = mgSpec(repRows, 3);
  const reps = pickFillTargets(spec, mgFillReasons(spec, card)).find((t) => t.index === 0)!.repeats;
  const b0 = spec.blocks![0];
  const removed = acceptFill(spec, 0, out({ ...b0, items: ["직무교육 과정을 현장 요구에 맞춰 개편함", "참여 기관 23곳으로 늘려 협업 범위를 넓힘"] }), input, found, 765, reps);
  assert.ok(removed.ok && removed.repeats?.removed.includes("120명") && !removed.repeats.kept.length, JSON.stringify(removed));
  const kept = acceptFill(spec, 0, out({ ...b0, items: [...b0.items, "참여 기관 23곳으로 늘려 협업 범위를 넓힘"] }), input, found, 765, reps);
  assert.ok(kept.ok && kept.mm > 0 && kept.repeats?.kept.includes("120명"), JSON.stringify(kept));
  const same = acceptFill(spec, 0, out({ ...b0, items: ["직무교육 120명 수료로 현장 역량을 키움"] }), input, found, 765, reps);
  assert.match(!same.ok ? same.reason : "", /반복 수치\(120명\)를 빼지 않았고 분량도 늘지 않음/);
  // 경고: 「분량 보강」 줄 안에 반복 결과
  const run = (await runMgFill(spec, input, deps(async (_p, t) => {
    const b = spec.blocks![t.index];
    return { ok: true, output: { block: out({ ...b, items: [...b.items, "참여 기관 23곳으로 늘려 협업 범위를 넓힘"] }), reply: "" }, usage, model: "fake" };
  })))!;
  const w = fillWarnings(run)[0];
  assert.match(w, /^분량 보강: [^\n]*1번 「추진내용」 \+\d+mm·반복 그대로 120명/);
  assert.equal(warningLevel(w), "info");
});

// ---------------------------------------------------------------------------
// 3-3. 반복 문장(⑤ — 2026-10-29 S7, 지어낸 글)

const S1 = "교육 과정을 현장 요구에 맞춰 다시 짜고 부서별 운영 방식을 바꿈";
const S2 = "협약 기관과 공동 점검반을 꾸려 분기마다 현장 안전 상태를 살핌";
const S3 = "담당자 의견을 받아 신청 화면의 입력 칸을 절반으로 줄임";
const sentRows: Array<[MgPart, Block]> = [
  [A, bullets("추진내용", [S1, "교육 체계 개편 추진"])],
  [A, bullets("추진성과", [S1])],
  [B, bullets("추진배경", [S2])],
  [B, bullets("추진내용", [S2, "점검 결과를 모아 공유함"])],
  [B, bullets("개선", [S3, "접수 안내문을 고침"])],
  [B, block({ kind: "quotes", label: "목소리", cells: [cell("담당", [S3])] })],
];

test("반복 문장 남길 자리(⑤): 「반복 문장」 경고와 같은 쌍 — 추진성과·띠 쪽 → 다시 쓸 수 없는 쪽(인용) → 처음 나온 블록을 남기고 다른 쪽을 바꿀 블록으로", () => {
  const spec = mgSpec(sentRows);
  const ss = sentencesOf(spec);
  assert.deepEqual(ss.map((x) => [x.index, x.keep, x.at]).sort((a, b) => Number(a[0]) - Number(b[0])), [
    [0, 1, "2번 「추진성과」"],
    [3, 2, "3번 「추진배경」"],
    [4, 5, "6번 「목소리」"],
  ]);
  assert.ok(ss.every((x) => x.text === x.other), "같은 글 쌍");
  assert.equal(mgFillReasons(spec, card).sentences.length, 3);
  assert.deepEqual(sentencesOf(mgSpec([[A, bullets("추진내용", [S1])], [B, bullets("추진내용", [S2])]])), [], "닮지 않은 글은 쌍이 아님");
});

test("반복 문장 고르기·요청 글: 배정이 없어도 반복 문장만으로 고르고(why sentence, 블록 순), 안 쓴 원장 사실을 먼저 주며, 요청 글에 그 문장·남길 자리·바꾸는 법", () => {
  const spec = mgSpec(sentRows);
  const ts = pickFillTargets(spec, mgFillReasons(spec, card));
  assert.deepEqual(ts.map((t) => [t.index, t.why]), [[0, "sentence"], [3, "sentence"], [4, "sentence"]]);
  assert.deepEqual(ts[0].sentences, [{ text: S1, keep: 1, other: S1, at: "2번 「추진성과」" }]);
  assert.deepEqual(ts.map((t) => t.facts.length), [1, 1, 0], "안 쓴 원장 사실 둘을 반복 블록에 하나씩 먼저");
  const text = fillRequestText(P, ts[0], blockRoom(spec, 0));
  assert.ok(text.includes(`비슷한 문장 되풀이 — 이 블록의 「${S1}」(이미 [2번 「추진성과」]에 비슷한 문장이 있음). 같은 주장을 되풀이하지 말고 뒤의 「아직 안 쓴 원장 사실」이나 근거 사실로 바꿉니다. 바꿀 사실이 없으면 이 블록 고유의 구체(대상·수단·시점)로 다시 씁니다. 줄 수는 줄이지 않습니다.`), text);
  assert.match(text, /「같은 수치 되풀이」·「비슷한 문장 되풀이」를 고치는 것 말고는/);
  assert.doesNotMatch(text, /\{\{/);
});

test("반복 문장 받기: 바꿨으면 받음(fixed), 그대로인데 분량도 그대로면 안 받음, 그대로여도 분량이 늘면 받고 경고에 「반복 그대로 「…」」", async () => {
  const found = () => true;
  const spec = mgSpec(sentRows);
  const t0 = pickFillTargets(spec, mgFillReasons(spec, card)).find((t) => t.index === 0)!;
  const b0 = spec.blocks![0];
  const fixed = acceptFill(spec, 0, out({ ...b0, items: ["참여 기관 23곳으로 늘려 협업 범위를 넓히고 공동 과정을 운영함", b0.items[1]] }), input, found, null, [], t0.sentences);
  assert.ok(fixed.ok && fixed.sentences?.fixed[0] === S1 && !fixed.sentences.kept.length, JSON.stringify(fixed));
  const same = acceptFill(spec, 0, out({ ...b0, items: [S1, "교육 체계를 개편"] }), input, found, null, [], t0.sentences);
  assert.match(!same.ok ? same.reason : "", /^반복 문장 1개를 바꾸지 않았고 분량도 늘지 않음$/);
  const grown = acceptFill(spec, 0, out({ ...b0, items: [...b0.items, EXTRA[0]] }), input, found, null, [], t0.sentences);
  assert.ok(grown.ok && grown.mm > 0 && grown.sentences?.kept[0] === S1, JSON.stringify(grown));
  const run = (await runMgFill(spec, input, deps(async (_p, t) => {
    const b = spec.blocks![t.index];
    return { ok: true, output: { block: out({ ...b, items: [...b.items, [...EXTRA, ...EXTRA_ODD][t.index]] }), reply: "" }, usage, model: "fake" };
  })))!;
  const w = fillWarnings(run)[0];
  assert.match(w, /^분량 보강: [^\n]*1번 「추진내용」 \+\d+mm·반복 그대로 「교육 과정을 현장 요구에 맞춰 다시 짜고 부…」/, "블록마다 다른 줄을 보태 분량은 늘었지만 반복 문장은 그대로");
  assert.equal(warningLevel(w), "info");
});

// ---------------------------------------------------------------------------
// 4. 저장 흐름(가짜 DB — draft-store.test.ts와 같은 모양)

function fakeDb(initial: Record<string, any> | null) {
  let row = initial ? { ...initial } : null;
  let tick = 0;
  const calls: string[] = [];
  const db: any = {
    from() {
      return {
        update(patch: Record<string, unknown>) {
          const conds: Record<string, unknown> = {};
          const q: any = {
            eq(k: string, v: unknown) {
              conds[k] = v;
              return q;
            },
            async select() {
              calls.push(`update@${conds.updated_at}`);
              const hit = row && Object.entries(conds).every(([k, v]) => row![k] === v);
              if (!hit) return { data: [], error: null };
              row = { ...row, ...patch, updated_at: `t${++tick}` };
              return { data: [{ updated_at: row.updated_at }], error: null };
            },
          };
          return q;
        },
        insert(values: Record<string, unknown>) {
          return {
            async select() {
              calls.push("insert");
              if (row) return { data: null, error: { code: "23505", message: "duplicate key" } };
              row = { ...values, updated_at: `t${++tick}` };
              return { data: [{ updated_at: row.updated_at }], error: null };
            },
          };
        },
      };
    },
    /** 그 사이 사람이 고침(버전이 바뀜) */
    humanEdit(spec: unknown) {
      row = { ...row, spec, updated_at: `h${++tick}` };
    },
  };
  return { db, get row() { return row; }, calls };
}
const key = { cardId: card.id, year: 2026 };

test("저장 흐름: 1차 저장 → 보강 → 1차 저장 버전 조건으로 갱신", async () => {
  const f = fakeDb({ card_id: key.cardId, year: 2026, spec: { a: 0 }, updated_at: "t0" });
  let seenVersion = "";
  const r = await saveFirstThenFill(f.db, key, { spec: { a: 1 } }, "t0", async () => {
    seenVersion = f.row!.updated_at;
    assert.deepEqual(f.row!.spec, { a: 1 }, "보강 전에 1차 초안이 이미 저장됨");
    return { patch: { spec: { a: 2 } }, value: "run" };
  });
  assert.deepEqual(r, { ok: true, version: "t2", second: "saved", value: "run", message: null });
  assert.equal(seenVersion, "t1");
  assert.deepEqual(f.calls, ["update@t0", "update@t1"], "2차는 1차가 돌려준 버전 조건");
  assert.deepEqual(f.row!.spec, { a: 2 });
});

test("저장 흐름: 보강하는 사이 사람이 고쳤으면 덮지 않고 건너뜀 · 1차 저장이 충돌이면 보강하지 않음 · 보강 결과가 없거나 던지면 1차만", async () => {
  const f = fakeDb({ card_id: key.cardId, year: 2026, spec: { a: 0 }, updated_at: "t0" });
  const r = await saveFirstThenFill(f.db, key, { spec: { a: 1 } }, "t0", async () => {
    f.db.humanEdit({ a: "사람" });
    return { patch: { spec: { a: "보강" } }, value: 1 };
  });
  assert.equal(r.ok && r.second, "conflict");
  assert.equal(r.ok && r.version, "t1", "1차 저장 버전");
  assert.deepEqual(f.row!.spec, { a: "사람" }, "사람이 고친 글이 남음");
  assert.equal(r.ok && r.message, DRAFT_CONFLICT_MSG);

  const g = fakeDb({ card_id: key.cardId, year: 2026, spec: { a: "다른 곳" }, updated_at: "t9" });
  let called = false;
  const c = await saveFirstThenFill(g.db, key, { spec: { a: 1 } }, "t0", async () => ((called = true), null));
  assert.deepEqual(c, { ok: false, conflict: true, message: DRAFT_CONFLICT_MSG });
  assert.equal(called, false, "1차를 못 쓰면 보강(AI)을 부르지 않음");

  const h = fakeDb(null);
  const none = await saveFirstThenFill(h.db, key, { spec: { a: 1 } }, null, async () => null);
  assert.deepEqual(none, { ok: true, version: "t1", second: "none", value: null, message: null });
  assert.deepEqual(h.calls, ["insert"], "보강 결과가 없으면 2차 저장 없음");

  const k = fakeDb({ card_id: key.cardId, year: 2026, spec: {}, updated_at: "t0" });
  const err = await saveFirstThenFill(k.db, key, { spec: { a: 1 } }, "t0", async () => {
    throw new Error("보강 오류");
  });
  assert.equal(err.ok && err.second, "error");
  assert.deepEqual(k.row!.spec, { a: 1 }, "1차는 남음");
});

// ---------------------------------------------------------------------------
// 0. 빠진 구성안 블록 되살리기(2026-10-29 — 집필이 구성안 블록을 통째로 빠뜨림)

const plan = (b: Partial<PlanBlock> & Pick<PlanBlock, "kind" | "at">): PlanBlock => ({ variant: "", label: "", purpose: "", cells: 2, materials: [], figures: [], ...b });
/** 구성안: A절 [추진배경 불릿 · 추진내용 막대 든 수치 표(데이터 블록, m1) · 추진성과], B절 [추진내용 카드 2칸(m2) · 추진성과] */
const missPlan: FillPlan = {
  materials: [
    { id: "m1", kind: "figure", text: "교육 만족도 81점·86점·91점", when: "", source: "첨부", quote: "만족도 81점, 86점, 91점", found: true },
    { id: "m2", kind: "fact", text: "교육 과정 개편과 운영 방식 개선", when: "", source: "카드", quote: "", found: true },
    { id: "m3", kind: "need", text: "참여 인원 자료", when: "", source: "", quote: "", found: false },
  ],
  blocks: [
    plan({ kind: "bullets", label: "추진배경", at: A.key, cells: 1 }),
    plan({ kind: "table", variant: "bars", label: "추진내용", at: A.key, cells: 1, purpose: "만족도 세 해 값을 보임", materials: ["m1", "m3"] }),
    plan({ kind: "bullets", label: "추진성과", at: A.key, cells: 1 }),
    plan({ kind: "cards", variant: "plain", label: "추진내용", at: B.key, purpose: "개편과 운영 개선", materials: ["m2"] }),
    plan({ kind: "bullets", label: "추진성과", at: B.key, cells: 1 }),
  ],
  mg: { indicator: "지표", parts: [A, B] } as any,
};
/** 집필 초안: 두 블록(표·카드)을 빠뜨림 */
const missRows: Array<[MgPart, Block]> = [[A, bullets("추진배경", ["교육 체계 개편 추진"])], [A, bullets("추진성과", ["운영 개선"])], [B, bullets("추진성과", ["현장 호응 확대"])]];
const missSpec = (pages?: number) => mgSpec(missRows, pages);
const missInput: MgFillInput = { ...input, known: "만족도 81점 86점 91점 · 참여율 61% 66% 71%", plan: missPlan };
const SAT_ROWS = [cell("만족도", ["81점", "86점", "91점"]), cell("참여율", ["61%", "66%", "71%"])];
const SAT = block({ kind: "table", variant: "bars", label: "추진내용", items: ["구분", "’24년", "’25년", "’26년"], cells: SAT_ROWS });
const CARDS = block({ kind: "cards", variant: "plain", label: "추진내용", cells: [cell("개편", ["교육 과정을 현장 요구에 맞춰 다시 짬"]), cell("운영", ["운영 방식을 부서 의견으로 다시 정함"])] });
/** 빠진 블록 요청(why missing)에는 모양대로 채운 블록, 그 밖은 그대로(받지 않음) */
const reviveCall = (fill: (shape: string) => Block | null, seen: Array<{ prompt: string; t: FillTarget }> = []) => async (prompt: string, t: FillTarget): Promise<FillCall> => {
  seen.push({ prompt, t });
  const b = t.missing ? fill(t.missing.shape) : null;
  return b ? { ok: true, output: { block: out(b), reply: "" }, usage, model: "fake" } : { ok: false, stop: false, message: "부르지 않을 블록" };
};
const byShape = (shape: string) => (shape.includes("막대") ? SAT : CARDS);

test("빠진 블록 찾기: 구성안 짝이 없는 블록만, 데이터 블록 먼저 → 구성안 순 · 자리는 같은 절 앞뒤 짝 사이", () => {
  const spec = missSpec();
  const found = missingBlocks(spec, missPlan);
  assert.deepEqual(found.map((m) => [m.plan, m.shape, m.at, m.data]), [[1, "table:bars", A.key, true], [3, "cards:plain", B.key, false]]);
  assert.equal(missingSlot(spec, missPlan, 1), 1, "A절 추진배경(0)과 추진성과(1) 사이");
  assert.equal(missingSlot(spec, missPlan, 3), 2, "B절 첫 블록(추진성과) 앞");
  assert.equal(missingSlot(spec, missPlan, 0), null, "짝이 있는 블록은 빠진 것이 아님");
});

test("빠진 블록 찾기: 앱이 정리하며 뺀 블록(droppedShapes)·원장 보강한 절의 추진성과·다른 모양으로 쓴 자리·절째 빠진 블록은 빼고 이유가 같음", () => {
  const spec = missSpec();
  assert.deepEqual(missingBlocks(spec, missPlan, [{ kind: "table", variant: "bars" }]).map((m) => m.plan), [3], "앱이 뺀 같은 모양 하나는 되살리지 않음");
  // 추진성과가 빠진 초안 — 원장 보강(closed)이 채운 절의 추진성과는 빼고, 아닌 절은 되살림 대상
  const noClose = mgSpec([[A, bullets("추진배경", ["교육 체계 개편 추진"])], [A, SAT], [B, CARDS], [B, bullets("추진성과", ["현장 호응 확대"])]]);
  assert.deepEqual(missingBlocks(noClose, missPlan).map((m) => m.plan), [2]);
  assert.deepEqual(missingBlocks(noClose, missPlan, [], [A.key]), [], "원장 보강한 절의 추진성과는 이미 되살린 것");
  // 그 자리에 집필이 다른 모양(불릿)을 썼으면 대응 블록이 있는 것 — 되살리면 같은 내용이 둘
  const other = mgSpec([[A, bullets("추진배경", ["교육 체계 개편 추진"])], [A, bullets("추진내용", ["만족도 조사"])], [A, bullets("추진성과", ["운영 개선"])], [B, bullets("추진성과", ["현장 호응 확대"])]]);
  assert.deepEqual(missingBlocks(other, missPlan).map((m) => m.plan), [3]);
  // B절이 통째로 없으면 그 절 블록은 되살리지 않음(절 제목을 못 세움 — 「구성안: 승인한 절」 경고가 알림)
  assert.deepEqual(missingBlocks(mgSpec(missRows.slice(0, 2)), missPlan).map((m) => m.plan), [1]);
});

test("빈 모양: 구성안 종류·모양·칸 수·라벨·배치 그대로, 글·견본 값은 모두 비움", () => {
  const e = emptyBlock(plan({ kind: "table", variant: "bars", label: "추진내용", at: A.key, cells: 2, layout: "full" }));
  assert.equal(blockShapeCode(e), "table:bars");
  assert.equal(e.label, "추진내용");
  assert.equal(e.layout, "full");
  assert.equal(e.cells.length, 2);
  assert.ok([e.title, e.text, ...e.items, ...e.cells.flatMap((c) => [c.head, ...c.bullets]), ...e.series.map((x) => x.value)].every((t) => t === ""), JSON.stringify(e));
  assert.equal(emptyBlock(plan({ kind: "cards", variant: "plain", at: A.key, cells: 3 })).cells.length, 3);
});

test("되살리기: 데이터 블록 먼저 구성안 자리에 끼워 채우고(요청 글 = fill.missing — 라벨·모양·목적·재료·원문, 자료 필요 재료 뺌), 받으면 절 열쇠도 맞고 경고에 「빠진 블록 되살림」", async () => {
  const seen: Array<{ prompt: string; t: FillTarget }> = [];
  const spec = missSpec();
  const run = (await runMgFill(spec, missInput, deps(reviveCall(byShape, seen))))!;
  assert.ok(run);
  assert.ok(run.revived.every((r) => r.ok), JSON.stringify(run.revived));
  assert.deepEqual(seen.map((x) => x.t.why), ["missing", "missing"]);
  assert.ok(seen[0].t.missing!.shape.includes("막대") && !seen[1].t.missing!.shape.includes("막대"), `데이터 블록 먼저 — ${seen.map((x) => x.t.missing!.shape)}`);
  assert.match(seen[0].prompt, /- 요청: 분량 채움 보강 — [^\n]*구성안이 정한 블록인데 집필이 빠뜨려/);
  assert.match(seen[0].prompt, /라벨 「추진내용」 · 모양 [^·]*막대[^·]* · 목적: 만족도 세 해 값을 보임/);
  assert.match(seen[0].prompt, /m1 교육 만족도 81점·86점·91점\(원문 「만족도 81점, 86점, 91점」\)/);
  assert.doesNotMatch(seen[0].prompt, /참여 인원 자료/, "자료 필요 재료는 근거가 아니라 넣지 않음");
  assert.doesNotMatch(seen[0].prompt, /12,345건|’24년", "’25년/, "견본 값은 빈 모양에 없음");
  assert.ok(run.revived.every((r) => r.ok), JSON.stringify(run.revived));
  const kinds = run.spec.blocks!.map((b) => blockShapeCode(b));
  assert.deepEqual(kinds, ["bullets", "table:bars", "bullets", "cards:plain", "bullets"]);
  assert.deepEqual(run.spec.mg!.at, [A.key, A.key, A.key, B.key, B.key]);
  assert.deepEqual(run.revived.map((r) => [r.plan, r.index]), [[1, 1], [3, 3]], "결과 번호는 보강을 마친 초안 번호(뒤에 끼운 블록이 앞 번호를 밀지 않음)");
  assert.equal(run.spec.humanEdits, undefined, "AI 글이라 사람이 고친 블록 표시 없음");
  assert.equal(planAdherence(missPlan, run.spec.blocks!).same, true);
  const ws = fillWarnings(run);
  assert.match(ws[0], /^분량 보강: 빠진 블록 되살림: 2번 「추진내용」 \+\d+mm · 4번 「추진내용」 \+\d+mm\(구성안이 정한 블록을 집필이 빠뜨려 구성안 재료로 채움\) — 분량 어림 \d+ → \d+mm/);
  assert.equal(warningLevel(ws[0]), "info");
  assert.match(fillMessage(run, "saved"), /빠진 블록 2\/2개 되살림/);
  // 구성안 지킴을 다시 셈 — 1차 경고(5블록 중 3블록)는 다 맞아 빠지고 짜임 칩도 5/5
  const first = { spec: { ...spec, plan: { story: "", matched: 3, total: 5 } }, warnings: [mgAdherenceWarning(planAdherence(missPlan, spec.blocks!))!] };
  assert.match(first.warnings[0], /^구성안: 승인한 짜임 5블록 중 3블록만/);
  const patch = mgFillPatch(first, { ...run, spec: { ...run.spec, plan: first.spec.plan } }, missInput);
  assert.ok(!patch.warnings.some((w) => w.startsWith("구성안: 승인한 짜임")), patch.warnings.join("\n"));
  assert.deepEqual(patch.spec.plan, { story: "", matched: 5, total: 5 });
});

test("되살리기 받기: 하나만 받으면 경고는 새 셈(5블록 중 4블록), 빈 칸이 남거나·근거 밖 숫자·모양이 바뀌거나·배정 125%를 넘으면 빈 모양을 빼고 원래 초안 그대로", async () => {
  const spec = missSpec();
  const one = (await runMgFill(spec, missInput, deps(reviveCall((sh) => (sh.includes("막대") ? SAT : null)))))!;
  assert.deepEqual(one.revived.map((r) => r.ok), [true, false]);
  assert.equal(one.spec.blocks!.length, 4, "못 받은 카드는 빈 모양 없이");
  const patch = mgFillPatch({ spec, warnings: [mgAdherenceWarning(planAdherence(missPlan, spec.blocks!))!] }, one, missInput);
  assert.ok(patch.warnings.includes(mgAdherenceWarning(planAdherence(missPlan, one.spec.blocks!))!), "구성안 지킴 경고를 새로 셈");
  assert.match(patch.warnings.join("\n"), /구성안: 승인한 짜임 5블록 중 4블록만/);
  assert.match(fillWarnings(one).find((w) => w.startsWith("분량 보강 실패"))!, /^분량 보강 실패: 빠진 블록 1개는 되살리지 못했습니다\(「추진내용」\(cards:plain\) — 부르지 않을 블록\)\.$/);
  const cases: Array<[string, Block, RegExp, ReportSectionSpec?]> = [
    ["빈 칸", { ...SAT, cells: [SAT_ROWS[0], cell("참여율", ["61%", "", "71%"])] }, /빈 칸이 남음\(1곳\)/],
    ["근거 밖 숫자", { ...SAT, cells: [SAT_ROWS[0], cell("참여율", ["61%", "66%", "77%"])] }, /근거 밖 숫자 1개\(77%\)/],
    ["모양", { ...SAT, variant: "" }, /모양이 바뀜/],
    // 배정을 지금 어림 바로 위로 — 블록 하나가 통째로 더해지면 125%를 넘음
    ["분량", SAT, /분량이 배정의 125%를 넘음/, mgSpec(missRows, (mgSpecHeight(missSpec()) * 1.01) / PAGE_MM.height)],
  ];
  for (const [name, b, why, sp] of cases) {
    const base = sp ?? spec;
    const run = (await runMgFill(base, missInput, deps(reviveCall((sh) => (sh.includes("막대") ? b : null)))))!;
    assert.equal(run.revived[0].ok, false, name);
    assert.match(run.revived[0].reason ?? "", why, name);
    assert.deepEqual(run.spec.blocks!.map(blockShapeCode), base.blocks!.map(blockShapeCode), `${name}: 원래 초안 그대로(빈 모양 없음)`);
    assert.deepEqual(run.spec.mg!.at, base.mg!.at, name);
  }
});

test("되살리기 멈춤·조건: 기한이면 빠진 블록을 시작하지 않고 라운드도 없음, 호출 한도면 남은 빠진 블록만 멈춤, 구성안이 없으면 되살리지 않음", async () => {
  let calls = 0;
  const timed = (await runMgFill(missSpec(2), missInput, deps(async () => ((calls += 1), { ok: false, stop: false, message: "x" }), { t0: 0, now: () => 600_000, firstMs: 100_000, deadlineMs: 690_000 })))!;
  assert.equal(calls, 0);
  assert.deepEqual(timed.revived.map((r) => [r.ok, r.reason]), [[false, "시간이 모자라 시작하지 않음"], [false, "시간이 모자라 시작하지 않음"]]);
  assert.equal(timed.rounds.length, 0, "시간이 없으면 라운드도 없음");
  const limited = (await runMgFill(missSpec(), missInput, deps(async () => ({ ok: false, stop: true, message: "요청이 너무 잦습니다." }))))!;
  assert.deepEqual(limited.revived.map((r) => r.reason), ["호출 한도(요청이 너무 잦습니다.)", "호출 한도(요청이 너무 잦습니다.)"]);
  assert.equal(await runMgFill(missSpec(), { ...missInput, plan: undefined }, deps(async () => assert.fail("부르면 안 됨"))), null, "구성안이 없으면 빠진 블록을 모름 — 다른 사유도 없으면 보강 없음");
});


test("되살린 뒤 라운드: 1~3 사유는 되살린 초안에서 다시 잼(블록 번호 = 보강을 마친 초안), 되살린 블록은 라운드 결과와 따로", async () => {
  const spec = missSpec(3);
  const calls: FillTarget[] = [];
  const run = (await runMgFill(spec, missInput, deps(async (_p, t) => {
    calls.push(t);
    return reviveCall(byShape)(_p, t);
  })))!;
  assert.ok(run.revived.every((r) => r.ok));
  assert.ok(run.rounds.length > 0, "배정 3쪽이면 분량 부족으로 라운드가 돎");
  assert.equal(run.rounds[0].before, Math.round(run.rounds[0].reasons.height), "1회차 사유는 되살린 초안의 어림");
  assert.ok(run.rounds[0].reasons.height > run.reasons.height, "되살린 블록만큼 1회차 어림이 큼(run.reasons는 보강 전)");
  for (const t of calls.filter((x) => x.why !== "missing")) assert.ok(t.index < run.spec.blocks!.length && run.spec.mg!.at[t.index], `라운드 블록 ${t.index}`);
});
