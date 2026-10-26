// 과제별 초안 행 저장(lib/reports/draft-store.ts) 시험 — AI 집필·구성안 저장에 버전 확인(2026-10-10 개선 계획 P0-2):
// 집필은 5~12분 걸려 그 사이 사람이 「직접 고치기」로 고친 글을 AI 결과가 덮었음(upsert). 시작할 때 읽은 updated_at이 그대로일 때만 저장.

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DRAFT_CONFLICT_MSG, UNIT_PART_CONFLICT_MSG, saveDraftRow, saveUnitPartRow } from "./draft-store.ts";

/** 한 표(기본 card_report_drafts)만 흉내 내는 가짜 클라이언트(update·insert + eq 조건 + select) — 저장 때마다 updated_at이 바뀜 */
function fakeDb(initial: Record<string, any> | null, expectTable = "card_report_drafts") {
  let row = initial ? { ...initial } : null;
  let tick = 0;
  const calls: string[] = [];
  const db: any = {
    from(table: string) {
      assert.equal(table, expectTable);
      return {
        update(patch: Record<string, unknown>) {
          const conds: Record<string, unknown> = {};
          const q: any = {
            eq(k: string, v: unknown) {
              conds[k] = v;
              return q;
            },
            async select() {
              calls.push(`update ${Object.keys(conds).sort().join(",")}`);
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
  };
  return { db, get row() { return row; }, calls };
}

const key = { cardId: "주요사업1/1-가", year: 2026 };

test("saveDraftRow: 시작할 때 읽은 버전이 그대로면 저장하고 새 버전을 돌려줌(update에 updated_at 조건)", async () => {
  const f = fakeDb({ card_id: key.cardId, year: 2026, spec: { a: 1 }, updated_at: "t0" });
  const r = await saveDraftRow(f.db, key, { spec: { a: 2 } }, "t0");
  assert.deepEqual(r, { ok: true, version: "t1" });
  assert.deepEqual(f.row?.spec, { a: 2 });
  assert.deepEqual(f.calls, ["update card_id,updated_at,year"]);
});

test("saveDraftRow: 그 사이 다른 사람이 고쳐 버전이 바뀌었으면 덮지 않고 conflict", async () => {
  const f = fakeDb({ card_id: key.cardId, year: 2026, spec: { a: "사람이 고친 글" }, updated_at: "t5" });
  const r = await saveDraftRow(f.db, key, { spec: { a: "AI 결과" } }, "t0");
  assert.deepEqual(r, { ok: false, conflict: true, message: DRAFT_CONFLICT_MSG });
  assert.deepEqual(f.row?.spec, { a: "사람이 고친 글" }, "사람이 고친 글이 남음");
});

test("saveDraftRow: 시작할 때 행이 없었으면 새로 넣고, 그 사이 누가 먼저 넣었으면(유일 위반) conflict", async () => {
  const empty = fakeDb(null);
  const r1 = await saveDraftRow(empty.db, key, { spec: { a: 1 } }, null);
  assert.equal(r1.ok, true);
  assert.equal(empty.row?.card_id, key.cardId, "열쇠가 같이 들어감");
  assert.equal(empty.row?.year, 2026);
  const raced = fakeDb({ card_id: key.cardId, year: 2026, spec: { a: "먼저 넣은 것" }, updated_at: "t9" });
  const r2 = await saveDraftRow(raced.db, key, { spec: { a: 2 } }, null);
  assert.deepEqual(r2, { ok: false, conflict: true, message: DRAFT_CONFLICT_MSG });
  assert.deepEqual(raced.row?.spec, { a: "먼저 넣은 것" });
});

test("saveDraftRow: 1차 저장이 돌려준 버전으로 2차 저장(집필 1차 초안 → 자동 고치기 결과)", async () => {
  const f = fakeDb(null);
  const first = await saveDraftRow(f.db, key, { spec: { pass: 1 } }, null);
  assert.ok(first.ok);
  const second = await saveDraftRow(f.db, key, { spec: { pass: 2 } }, first.ok ? first.version : null);
  assert.ok(second.ok);
  assert.deepEqual(f.row?.spec, { pass: 2 });
});

test("saveDraftRow: DB 오류(권한 등)는 conflict가 아니라 오류로", async () => {
  const db: any = { from: () => ({ update: () => ({ eq() { return this; }, select: async () => ({ data: null, error: { code: "42501", message: "permission denied" } }) }) }) };
  const r = await saveDraftRow(db, key, { spec: {} }, "t0");
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.conflict, false);
});

test("saveUnitPartRow(지표 단위 부분, R5b): 같은 버전 조건 — 키는 평가단위·연도·부분, 처음이면 키를 넣어 insert, 바뀌었으면 덮지 않음", async () => {
  const k = { evalUnitId: "MG-8", year: 2026, part: "findings" };
  const empty = fakeDb(null, "eval_unit_report_parts");
  const first = await saveUnitPartRow(empty.db, k, { spec: { a: 1 } }, null);
  assert.deepEqual(first, { ok: true, version: "t1" });
  assert.deepEqual([empty.row?.eval_unit_id, empty.row?.year, empty.row?.part], ["MG-8", 2026, "findings"]);
  const next = await saveUnitPartRow(empty.db, k, { spec: { a: 2 } }, "t1");
  assert.deepEqual(next, { ok: true, version: "t2" });
  assert.deepEqual(empty.calls, ["insert", "update eval_unit_id,part,updated_at,year"]);
  const stale = await saveUnitPartRow(empty.db, k, { spec: { a: "옛 버전" } }, "t1");
  assert.deepEqual(stale, { ok: false, conflict: true, message: UNIT_PART_CONFLICT_MSG });
  assert.deepEqual(empty.row?.spec, { a: 2 });
  const raced = await saveUnitPartRow(empty.db, k, { spec: {} }, null);
  assert.deepEqual(raced, { ok: false, conflict: true, message: UNIT_PART_CONFLICT_MSG }, "그 사이 누가 먼저 넣음");
});
