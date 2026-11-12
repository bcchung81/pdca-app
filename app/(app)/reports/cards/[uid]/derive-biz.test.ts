// 경영관리 초안의 「주요사업 경평 초안(참고)」 화면 재료(derive.ts bizChoicesOf·bizStaleOf·bizStaleLabel·usedOf) — 추천·정렬·낡음·지워짐
import assert from "node:assert/strict";
import { test } from "node:test";
import type { BizRefRow } from "../../../../../lib/reports/mg-biz-queries.ts";
import type { ReportSectionSpec } from "../../../../../lib/reports/section.ts";
import { bizChoicesOf, bizStaleLabel, bizStaleOf, usedOf } from "./derive.ts";

const row = (taskId: string, over: Partial<BizRefRow> = {}): BizRefRow => ({ cardId: `id-${taskId}`, uid: `u-${taskId}`, taskId, taskNo: taskId.split(" ")[1], title: `과제 ${taskId}`, team: "가짜팀", stamp: "s1", updatedAt: "2026-11-10T01:00:00Z", unknownCount: 0, fileCount: 0, chars: 12000, ...over });
const specWith = (sources: unknown[]) => ({ version: 3, sources }) as unknown as ReportSectionSpec;

const rows = [row("주요사업2 3-라"), row("주요사업1 10-가"), row("주요사업1 2-가"), row("주요사업1 2-나"), row("주요사업3 1-가")];

test("bizChoicesOf: 추천(a 인용·b 지침 연계) 먼저, 나머지는 번호 숫자 순(10-가가 2-가 뒤)", () => {
  const out = bizChoicesOf(rows, { spec: null, cardText: "연계: 주요사업2 3-라 성과를 반영", unitId: "MG-3", linkIndex: [{ name: "가짜 지표", unit: "MG-3", known: true, ids: ["주요사업1 2-나", "주요사업2 3-라"] }] });
  assert.deepEqual(
    out.map((b) => b.taskId),
    ["주요사업1 2-나", "주요사업2 3-라", "주요사업1 2-가", "주요사업1 10-가", "주요사업3 1-가"],
  );
  assert.deepEqual(out.find((b) => b.taskId === "주요사업2 3-라")?.reasons, ["a", "b"]);
  assert.deepEqual(out.find((b) => b.taskId === "주요사업1 2-나")?.reasons, ["b"]);
  assert.deepEqual(out.find((b) => b.taskId === "주요사업3 1-가")?.reasons, []);
});

test("bizChoicesOf: 다른 지표의 색인 행은 안 쓰고, 후보가 없으면 빈 목록(주요사업 화면 그대로)", () => {
  const out = bizChoicesOf(rows, { spec: null, cardText: "", unitId: "MG-3", linkIndex: [{ name: "다른", unit: "MG-4", known: true, ids: ["주요사업3 1-가"] }] });
  assert.ok(out.every((b) => b.reasons.length === 0));
  assert.deepEqual(bizChoicesOf([], { spec: null, cardText: "주요사업2 3-라", unitId: "MG-3", linkIndex: [] }), []);
});

test("낡음: 지난 초안이 참고한 지문과 지금 지문이 다를 때만(참고하지 않은 주요사업은 표지 없음), 후보에 없으면 지워짐", () => {
  const spec = specWith([
    { kind: "biz", id: "id-주요사업2 3-라", name: "주요사업 주요사업2 3-라 경평 초안", stamp: "old", at: "2026-11-01T00:00:00Z" },
    { kind: "biz", id: "id-주요사업1 2-가", name: "주요사업 주요사업1 2-가 경평 초안", stamp: "s1", at: "2026-11-01T00:00:00Z" },
    { kind: "biz", id: "id-gone", name: "주요사업 주요사업1 9-다 경평 초안", stamp: "s1", at: "2026-11-01T00:00:00Z" },
    { kind: "card", id: "7", name: "첨부.pdf" },
  ]);
  const stale = bizStaleOf(spec, rows);
  assert.deepEqual(stale.map((s) => [s.taskNo, s.at !== null]), [["3-라", true], ["9-다", false]]);
  const choices = bizChoicesOf(rows, { spec, cardText: "", unitId: "MG-3", linkIndex: [] });
  assert.equal(choices.find((b) => b.taskId === "주요사업2 3-라")?.stale, true);
  assert.equal(choices.find((b) => b.taskId === "주요사업1 2-가")?.stale, false);
  assert.equal(choices.find((b) => b.taskId === "주요사업3 1-가")?.stale, false, "고르지 않은 주요사업은 낡음 표시 없음");
  const label = bizStaleLabel(stale);
  assert.equal(label?.text, "참고한 주요사업 초안이 바뀜 — 3-라 외 1");
  assert.match(label?.title ?? "", /9-다: 지워짐/);
  assert.equal(bizStaleLabel([]), null);
  assert.deepEqual(bizStaleOf(null, rows), []);
});

test("usedOf: spec.sources의 biz 카드 id를 돌려줌(없으면 빈 배열)", () => {
  const spec = specWith([{ kind: "biz", id: "id-1", name: "x", stamp: "s", at: "t" }, { kind: "card", id: "5", name: "a" }]);
  const used = usedOf(spec, { updated_at: "2026-11-11T00:00:00Z" } as never);
  assert.deepEqual(used?.biz, ["id-1"]);
  assert.deepEqual(used?.card, ["5"]);
  assert.deepEqual(usedOf(specWith([]), { updated_at: "2026-11-11T00:00:00Z" } as never)?.biz, []);
});
