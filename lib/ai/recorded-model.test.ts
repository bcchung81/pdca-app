// 화면이 보낸 모델 표기를 호출 기록과 맞춰 보기(lib/ai/recorded-model.ts — 여러 안 고르기·「다른 모양으로」 적용 공용, 2026-11-18 웹 점검 T3-N3).
// run.ts는 import "server-only"라 run.test.ts와 같이 "server-only"만 빈 모듈로 돌려 주고 불러옵니다.
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { RECORDED_MODEL_MS, matchRecordedModel, recordedModel } = await import("./recorded-model.ts");
const { modelLabel } = await import("./run.ts");
const { cleanLine } = await import("../reports/section.ts");

/** ai_requests 읽기 흉내: 건 조건을 모으고 rows를 돌려줌 */
function fakeDb(rows: Array<{ model: string | null }>) {
  const calls: Array<[string, ...unknown[]]> = [];
  const q = {
    select: (...a: unknown[]) => (calls.push(["select", ...a]), q),
    eq: (...a: unknown[]) => (calls.push(["eq", ...a]), q),
    gte: (...a: unknown[]) => (calls.push(["gte", ...a]), q),
    order: (...a: unknown[]) => (calls.push(["order", ...a]), q),
    limit: (...a: unknown[]) => (calls.push(["limit", ...a]), Promise.resolve({ data: rows, error: null })),
  };
  const db = { from: (t: string) => (calls.push(["from", t]), q) };
  return { db: db as unknown as Parameters<typeof recordedModel>[0], calls };
}

test("matchRecordedModel: 기록의 모델(CLI는 cli/ 머리)과 화면 표시가 같을 때만 남기고, 기록에 없거나 빈 값은 null", () => {
  const recorded = [{ model: "cli/sonnet" }, { model: null }, { model: "claude-x" }];
  assert.equal(matchRecordedModel(modelLabel({ provider: "cli", model: "sonnet" }), recorded), "sonnet · Claude Code");
  assert.equal(matchRecordedModel(" claude-x ", recorded), "claude-x");
  assert.equal(matchRecordedModel("claude-opus-지어냄", recorded), null);
  assert.equal(matchRecordedModel("sonnet", recorded), null);
  assert.equal(matchRecordedModel("", recorded), null);
  assert.equal(matchRecordedModel(42, recorded), null);
  assert.equal(matchRecordedModel("claude-x", []), null);
});

test("recordedModel(「다른 모양으로」 적용): 이 사용자·이 카드·report_block·끝낸 호출·최근 7일 기록과 대조 — 맞으면 남고 아니면 null", async () => {
  const now = Date.parse("2026-11-18T00:00:00.000Z");
  // 미리보기는 기록 model에 modelLabel(call)을 그대로 남김(edit-actions.ts previewBlockShapes)
  const shown = modelLabel({ provider: "cli", model: "opus" });
  const ok = fakeDb([{ model: shown }]);
  assert.equal(await recordedModel(ok.db, { userId: "me-1", cardId: "card-1", feature: "report_block" }, shown, now), shown);
  assert.deepEqual(ok.calls, [
    ["from", "ai_requests"],
    ["select", "model"],
    ["eq", "user_id", "me-1"],
    ["eq", "card_id", "card-1"],
    ["eq", "feature", "report_block"],
    ["eq", "status", "ok"],
    ["gte", "created_at", new Date(now - RECORDED_MODEL_MS).toISOString()],
    ["order", "created_at", { ascending: false }],
    ["limit", 50],
  ]);
  const forged = fakeDb([{ model: shown }]);
  assert.equal(await recordedModel(forged.db, { userId: "me-1", cardId: "card-1", feature: "report_block" }, "지어낸 모델", now), null);
  const none = fakeDb([]);
  assert.equal(await recordedModel(none.db, { userId: "me-1", cardId: "card-1", feature: "report_block" }, shown, now), null);
  // 빈 값은 기록을 읽지 않음
  const empty = fakeDb([{ model: shown }]);
  assert.equal(await recordedModel(empty.db, { userId: "me-1", cardId: "card-1", feature: "report_block" }, "  ", now), null);
  assert.equal(await recordedModel(empty.db, { userId: "me-1", cardId: "card-1", feature: "report_block" }, undefined, now), null);
  assert.deepEqual(empty.calls, []);
});

test("정상 표본은 전후 같음: 미리보기가 돌려준 모델 표기(api·Claude Code·Codex)는 화면 값 그대로 대조한 뒤 예전처럼 cleanLine을 거쳐 같은 값으로 남음", () => {
  for (const call of [{ provider: "api", model: "claude-opus-5-5" }, { provider: "cli", model: "sonnet" }, { provider: "codex", model: "codex/gpt-x" }] as const) {
    const label = modelLabel(call);
    const before = cleanLine(label, 80) || null; // 예전 저장값(edit-actions.ts applyBlockShape)
    assert.equal(cleanLine(matchRecordedModel(label, [{ model: label }]), 80) || null, before);
    assert.ok(before);
  }
  // cleanLine은 「 · 」를 바꾸므로(조판 규칙) 다듬은 값으로 대조하면 Claude Code 표기가 맞지 않음 — 대조는 화면 값으로
  assert.notEqual(cleanLine("sonnet · Claude Code", 80), "sonnet · Claude Code");
  assert.equal(cleanLine(null, 80) || null, null);
  // 구성안 기록(cli/ 머리)도 예전 규칙 그대로
  assert.equal(matchRecordedModel("sonnet · Claude Code", [{ model: "cli/sonnet" }]), "sonnet · Claude Code");
});
