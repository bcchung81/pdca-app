// 작성지원·질문·보완 점검·경평 구성안이 함께 쓰는 「최종 점검표」 읽기(latestInspection) — 보낸·확인한 것 중 점검월이 가장 늦은 1건, 초안 제외(CLAUDE.md 「자료 범위」).
// 가짜 db는 eq·neq·order·limit을 실제처럼 걸러 질의 조건을 그대로 따름. 고르기가 질의 조건에만 기대면 그 조건을 지운 변이에서 이 시험이 실패함(2026-11-22 Q2-02).
// writer-knowledge.ts는 context.ts(import "server-only")를 불러오므로 그 모듈만 빈 모듈로 돌림(run.test.ts와 같음).
import assert from "node:assert/strict";
import * as nodeModule from "node:module";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_ID } from "../inspections/model.ts";

type Resolve = (specifier: string, context: unknown) => unknown;
const { registerHooks } = nodeModule as unknown as { registerHooks: (hooks: { resolve: (specifier: string, context: unknown, next: Resolve) => unknown }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
const { latestInspection } = await import("./writer-knowledge.ts");

type Row = { id: number; card_id: string; period: string; status: string; result: unknown };

/** inspections 표 하나를 흉내 내는 가짜 db(select·eq·neq·order·limit·maybeSingle, await하면 { data }) */
function fakeDb(rows: Row[]): SupabaseClient {
  const query = (list: Row[]) => {
    const q = {
      select: () => q,
      eq: (col: keyof Row, v: unknown) => query(list.filter((r) => r[col] === v)),
      neq: (col: keyof Row, v: unknown) => query(list.filter((r) => r[col] !== v)),
      order: (col: keyof Row, o: { ascending: boolean }) => query(list.toSorted((a, b) => String(a[col]).localeCompare(String(b[col])) * (o.ascending ? 1 : -1))),
      limit: (n: number) => query(list.slice(0, n)),
      maybeSingle: async () => ({ data: list[0] ?? null, error: null }),
      then: (ok: (v: { data: Row[]; error: null }) => unknown) => Promise.resolve({ data: list, error: null }).then(ok),
    };
    return q;
  };
  return { from: (table: string) => (assert.equal(table, "inspections"), query(rows)) } as unknown as SupabaseClient;
}

const sheet = (status: string) => ({ form: FORM_ID, overview: { status, direction: "", case: "" }, axes: [], patterns: [], coherence: [], notices: [], ai: null });
let next = 1;
const row = (card_id: string, period: string, status: string): Row => ({ id: next++, card_id, period, status, result: sheet(`${period} ${status}`) });

test("최종 점검표: 보낸·확인한 것 중 점검월이 가장 늦은 1건 — 더 늦은 초안·다른 과제 점검표는 아님", async () => {
  const db = fakeDb([row("A", "2026-09", "acknowledged"), row("A", "2026-11", "draft"), row("A", "2026-10", "sent"), row("B", "2026-12", "sent")]);
  const ins = await latestInspection(db, "A");
  assert.deepEqual(ins && { period: ins.period, status: ins.status, overview: ins.result.overview.status }, { period: "2026-10", status: "sent", overview: "2026-10 sent" });
});

test("최종 점검표: 확인한 점검표가 더 늦으면 그것, 초안만 있거나 점검표가 없으면 없음", async () => {
  const later = await latestInspection(fakeDb([row("A", "2026-09", "acknowledged"), row("A", "2026-08", "sent")]), "A");
  assert.deepEqual(later && [later.period, later.status], ["2026-09", "acknowledged"]);
  assert.equal(await latestInspection(fakeDb([row("A", "2026-10", "draft"), row("A", "2026-11", "draft")]), "A"), null);
  assert.equal(await latestInspection(fakeDb([row("B", "2026-10", "sent")]), "A"), null);
});
