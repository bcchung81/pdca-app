import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_ATTEMPTS, STUCK_LIMIT_MS, fanOutMatch, isStuck, reclaimState, stateAfterError } from "./queue.ts";

test("fanOutMatch: 카드마다 작업 하나, 중복 카드는 한 번, docIds는 payload에", () => {
  assert.deepEqual(fanOutMatch(["A", "B", "A"]), [
    { kind: "match_knowledge", target: "A", payload: {} },
    { kind: "match_knowledge", target: "B", payload: {} },
  ]);
  assert.deepEqual(fanOutMatch(["A"], ["d1", "d2"])[0].payload, { docIds: ["d1", "d2"] });
  assert.deepEqual(fanOutMatch(["A"], [])[0].payload, {}, "문서 목록이 비면 전체 문서");
});

test("isStuck: 시작 시각이 없으면 아님, 한도를 넘어야 멈춘 작업", () => {
  const now = new Date("2026-09-29T12:00:00Z");
  assert.equal(isStuck(null, now), false);
  assert.equal(isStuck(new Date(now.getTime() - STUCK_LIMIT_MS + 1000), now), false);
  assert.equal(isStuck(new Date(now.getTime() - STUCK_LIMIT_MS - 1000), now), true);
  assert.equal(isStuck("2026-09-29T11:00:00Z", now), true, "문자열 시각도 받음");
});

test("stateAfterError: 최대 시도 전에는 다시 대기, 넘으면 실패", () => {
  assert.equal(stateAfterError(1), "queued");
  assert.equal(stateAfterError(MAX_ATTEMPTS), "failed");
});

test("reclaimState: 멈춘(시간 초과) 작업도 시도 횟수 상한이면 실패로 닫음 — 예외 없이 함수가 죽는 작업이 끝없이 다시 돌던 것(2026-10-10)", () => {
  assert.equal(reclaimState(1), "queued", "한 번 멈춤 → 다시 대기");
  assert.equal(reclaimState(MAX_ATTEMPTS), "failed", "상한만큼 멈춤 → 실패");
  assert.equal(reclaimState(MAX_ATTEMPTS + 3), "failed");
  assert.equal(reclaimState(0), "queued", "시도 기록이 없는 옛 행");
});
