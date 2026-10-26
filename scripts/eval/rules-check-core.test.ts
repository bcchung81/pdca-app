import assert from "node:assert/strict";
import { test } from "node:test";
import type { BundleChunk } from "../../lib/knowledge/bundle.ts";
import type { DigestAnswer } from "../../lib/knowledge/rules-digest.ts";
import { type UnitResult, batchRequest, batchesOf, blocked, checkVerdicts, reviewMarkdown, tallyOf } from "./rules-check-core.ts";

const chunk = (k: string, text: string): BundleChunk => ({ chunk_key: k, doc_id: "d", seq: 0, unit_type: "plan_section", track: "주요사업", business: null, title: k, text, context_prefix: null, meta: null });
const answer: DigestAnswer = {
  rules: [
    { section: "가", text: "첫째 20점", refs: ["a"], quotes: [] },
    { section: "나", text: "둘째", refs: ["b"], quotes: [] },
    { section: "가", text: "셋째", refs: ["a", "b"], quotes: [] },
  ],
  omitted: [],
};

test("절로 묶고 한 번에 maxRules줄을 넘으면 나눔", () => {
  assert.deepEqual(batchesOf(answer).map((b) => [b.id, b.rules]), [["가", [0, 2]], ["나", [1]]]);
  assert.deepEqual(batchesOf(answer, 1).map((b) => [b.id, b.rules]), [["가#1", [0]], ["가#2", [2]], ["나", [1]]]);
});

test("요청에는 문서 전체 번호와 refs 조각 전문만", () => {
  const req = batchRequest(answer, batchesOf(answer)[1], [chunk("a", "AAA"), chunk("b", "BBB")]);
  assert.match(req, /\[2\] 둘째/);
  assert.match(req, /BBB/);
  assert.doesNotMatch(req, /AAA/);
});

test("답 검사: 빠진·중복·낯선 번호, 사유 없는 지적, 입력에 없는 key", () => {
  const b = batchesOf(answer)[0];
  const v = (rule: number, verdict: "맞음" | "빠짐" = "맞음", reason = "", wrongKeys: string[] = []) => ({ rule, verdict, reason, fix: "", wrongKeys });
  assert.deepEqual(checkVerdicts({ verdicts: [v(1), v(3)] }, b, new Set(["a"])), []);
  assert.equal(checkVerdicts({ verdicts: [v(1)] }, b, new Set()).length, 1);
  assert.equal(checkVerdicts({ verdicts: [v(1), v(1), v(3), v(9)] }, b, new Set()).length, 2);
  assert.equal(checkVerdicts({ verdicts: [v(1, "빠짐"), v(3, "맞음", "", ["zz"])] }, b, new Set(["a"])).length, 2);
});

test("review.md는 맞음이 아닌 것만 싣고 건수 표를 끝에 둠, 뜻 다름이 남으면 막힘", () => {
  const result: UnitResult = {
    id: "X", title: "시험", checkedAt: "", model: "m", staleKeys: [],
    batches: {
      가: { hash: "h", rules: [0, 2], ms: 1, verdicts: [{ rule: 1, verdict: "맞음", reason: "", fix: "", wrongKeys: [] }, { rule: 3, verdict: "뜻이 다름", reason: "숫자 다름", fix: "고침", wrongKeys: [] }] },
    },
    doc: { hash: "h", ms: 1, gaps: [{ keys: ["a"], what: "배점 빠짐", why: "중요", suggestion: "더함", severity: "높음" }] },
  };
  assert.equal(blocked(result), true);
  assert.equal(tallyOf(result).counts["뜻이 다름"], 1);
  const md = reviewMarkdown([{ result, answer }]);
  assert.match(md, /### 규칙 3 — 뜻이 다름/);
  assert.doesNotMatch(md, /### 규칙 1 /);
  assert.match(md, /배점 빠짐/);
  assert.match(md, /\| X \| 2 \| 1 \| 1 \| 0 \| 0 \| 0 \| 1 \| 막힘/);
});

test("올리기 막힘: 검산 실패·미완료·뜻 다름·원문 변경", async () => {
  const { storeBlockers } = await import("./rules-check-core.ts");
  const ok = { check: { ok: true }, answer };
  const v = (rule: number, verdict: "맞음" | "빠짐" | "키 잘못") => ({ rule, verdict, reason: "x", fix: "", wrongKeys: [] });
  const full = (verdicts: ReturnType<typeof v>[]): UnitResult => ({ id: "X", title: "", checkedAt: "", model: "m", staleKeys: [], batches: { 가: { hash: "h", rules: [], ms: 1, verdicts } }, doc: { hash: "h", ms: 1, gaps: [] } });
  assert.deepEqual(storeBlockers(ok, full([v(1, "맞음"), v(2, "빠짐"), v(3, "맞음")])), []);
  assert.equal(storeBlockers(ok, null).length, 1);
  assert.equal(storeBlockers({ check: { ok: false }, answer }, full([v(1, "맞음"), v(2, "맞음"), v(3, "맞음")])).length, 1);
  assert.match(storeBlockers(ok, full([v(1, "맞음")])).join(), /끝나지 않은 규칙 2줄/);
  assert.match(storeBlockers(ok, full([v(1, "키 잘못"), v(2, "맞음"), v(3, "맞음")])).join(), /키 잘못 1건/);
  assert.match(storeBlockers(ok, { ...full([v(1, "맞음"), v(2, "맞음"), v(3, "맞음")]), staleKeys: ["a"] }).join(), /바뀜/);
});

test("고쳐 만들기 지적: 맞음이 아닌 줄만 번호순 + 문서 단위 지적, 요청에 앞 판 번호와 지적이 실림", async () => {
  const { findingsOf } = await import("./rules-check-core.ts");
  const { repairPrompt, digestTarget } = await import("../../lib/knowledge/rules-digest.ts");
  const { rulesDigestPrompts } = await import("../../lib/prompts/sets.ts");
  const mk = (rule: number, verdict: "맞음" | "빠짐") => ({ rule, verdict, reason: "사유  입니다", fix: "고침", wrongKeys: [] });
  const r: UnitResult = { id: "BZ-1", title: "", checkedAt: "", model: "m", staleKeys: [], batches: { 가: { hash: "h", rules: [], ms: 1, verdicts: [mk(3, "빠짐"), mk(1, "맞음")] }, 나: { hash: "h", rules: [], ms: 1, verdicts: [mk(2, "빠짐")] } }, doc: { hash: "h", ms: 1, gaps: [{ keys: ["a"], what: "배점", why: "중요", suggestion: "더함", severity: "높음" }] } };
  const f = findingsOf(r);
  assert.deepEqual(f.lines.map((x) => x.rule), [2, 3]);
  assert.equal(f.lines[0].reason, "사유 입니다");
  assert.equal(f.docGaps.length, 1);
  const req = repairPrompt(rulesDigestPrompts().prompts, digestTarget("BZ-1"), [chunk("a", "AAA")], answer, f);
  assert.match(req, /규칙 2\(「둘째…」\) — 빠짐/);
  assert.match(req, /\[높음\] 배점/);
  assert.match(req, /"n":3/);
  assert.match(req, /지적이 없는 규칙 줄은 .*그대로/);
});
