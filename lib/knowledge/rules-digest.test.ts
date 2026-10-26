// 공통 규칙 문서 검산·범위·마크다운·부분 갱신 대상 셈(lib/knowledge/rules-digest.ts)을 지킵니다. 조각은 합성(기관 자료 없음).

import assert from "node:assert/strict";
import { test } from "node:test";
import { rulesDigestPrompts } from "../prompts/sets.ts";
import type { BundleChunk } from "./bundle.ts";
import { type DigestAnswer, checkDigest, checkProblems, digestChunks, digestInputs, digestMarkdown, digestPrompt, digestTarget, quoteInText, staleDigest, unknownNumbersIn } from "./rules-digest.ts";

let seq = 0;
const chunk = (o: Partial<BundleChunk> & Pick<BundleChunk, "chunk_key" | "unit_type">): BundleChunk => ({
  doc_id: "plan-2607",
  seq: seq++,
  track: "주요사업",
  business: null,
  title: o.chunk_key,
  text: "",
  context_prefix: null,
  meta: null,
  ...o,
});

const CHUNKS: BundleChunk[] = [
  chunk({ chunk_key: "plan/s1", unit_type: "plan_section", text: "주요사업은 「성과의 인과관계」를 중점 평가하며 배점은 2점이다. 2025년 기준 목표 1,200건." }),
  chunk({ chunk_key: "plan/hb-common", unit_type: "handbook_indicator", business: "BZ-4", text: "총평 — 계량지표 달성도 40% 반영" }),
  chunk({ chunk_key: "pool/bz1-a", unit_type: "pool_indicator", doc_id: "pool25-biz", business: "BZ-1", text: "<table><tr><td>지표</td><td>무선국 검사율</td></tr></table>" }),
  chunk({ chunk_key: "pool/bz2-a", unit_type: "pool_indicator", doc_id: "pool25-biz", business: "BZ-2", text: "다른 사업 지표" }),
  chunk({ chunk_key: "plan/task-row", unit_type: "task_list_row", business: "BZ-1", text: "과제 행" }),
  chunk({ chunk_key: "crit/1", unit_type: "evaluator_comment", business: "BZ-1", text: "지적" }),
  chunk({ chunk_key: "mg/hb", unit_type: "handbook_indicator", track: "경영관리", text: "경영관리 기관 공통" }),
  chunk({ chunk_key: "mg/cl1", unit_type: "checklist_group", track: "경영관리", business: "MG-1", text: "전략기획 착안" }),
];

test("범위: 트랙 공통은 ①② 층의 기준류(평가단위마다 같음), 평가단위는 ③층 — 과제 목록 행·사례류·다른 트랙은 빠짐", () => {
  assert.deepEqual(digestChunks(CHUNKS, digestTarget("track-biz")).map((c) => c.chunk_key), ["plan/s1", "plan/hb-common"]);
  assert.deepEqual(digestChunks(CHUNKS, digestTarget("BZ-1")).map((c) => c.chunk_key), ["pool/bz1-a"]);
  assert.deepEqual(digestChunks(CHUNKS, digestTarget("track-mg")).map((c) => c.chunk_key), ["mg/hb"]);
  assert.deepEqual(digestChunks(CHUNKS, digestTarget("MG-1")).map((c) => c.chunk_key), ["mg/cl1"]);
  assert.throws(() => digestTarget("BZ-4"), /모릅니다/);
  assert.throws(() => digestTarget("xx"), /모릅니다/);
  assert.match(digestTarget("BZ-1").title, /^주요사업1 /);
  assert.match(digestTarget("MG-3").title, /^경영관리 지표3 /);
});

test("범위: 트랙 공통 층이 평가단위마다 다르면 멈춤", () => {
  const odd = [...CHUNKS, chunk({ chunk_key: "odd", unit_type: "handbook_indicator", business: "BZ-4", meta: { related_business: "BZ-2" }, title: "x", text: "y" })];
  // 공통지표 조각은 주인 사업을 알면 그 사업의 ③층이라 ①②는 여전히 같아야 함 — 같으면 통과
  assert.doesNotThrow(() => digestChunks(odd, digestTarget("track-biz")));
  const t = { ...digestTarget("track-biz"), units: ["BZ-1", "BZ-2"], layers: ["institution", "common", "business"] as const };
  assert.throws(() => digestChunks(CHUNKS, t), /다릅니다/);
});

test("인용 대조: 공백 차이만 허용, 줄임표는 순서대로", () => {
  assert.ok(quoteInText("성과의  인과 관계", "「성과의 인과관계」를 중점"));
  assert.ok(quoteInText("「성과의 인과관계」", "성과의 인과관계"));
  assert.equal(quoteInText("성과의 인과-관계", "성과의 인과관계"), false, "문장부호 차이는 다른 글");
  assert.ok(quoteInText("주요사업은…배점은", "주요사업은 인과 배점은"));
  assert.equal(quoteInText("배점은…주요사업은", "주요사업은 인과 배점은"), false);
  assert.ok(quoteInText("a &lt; b", "a < b"), "봉투에서 이스케이프된 글을 그대로 인용해도 됨");
});

test("숫자 대조: 쉼표·%·배점(한 자리 + 점)·기준연도까지 원문에 있어야 함", () => {
  const src = "배점은 2점이다. 2025년 기준 목표 1,200건, 40% 반영";
  assert.deepEqual(unknownNumbersIn("배점 2점, ’25년 기준 1200건 40%", src), []);
  assert.deepEqual(unknownNumbersIn("배점 3점", src), ["3점"]);
  assert.deepEqual(unknownNumbersIn("2026년 기준", src), ["2026"]);
  assert.deepEqual(unknownNumbersIn("목표 1,300건, 45%", src), ["1,300", "45%"]);
  assert.deepEqual(unknownNumbersIn("세 가지 기준 1개", src), [], "한 자리 수(점이 아닌)는 대조하지 않음");
});

const GOOD: DigestAnswer = {
  rules: [
    { section: "평가 기준·배점", text: "주요사업은 「성과의 인과관계」를 중점 평가, 배점 2점", refs: ["plan/s1"], quotes: ["성과의 인과관계"] },
    { section: "평가 기준·배점", text: "계량지표 달성도 40% 반영", refs: ["plan/hb-common"], quotes: [] },
  ],
  omitted: [],
};

test("검산: 통과하는 답", () => {
  const c = checkDigest(GOOD, digestChunks(CHUNKS, digestTarget("track-biz")));
  assert.equal(c.ok, true, JSON.stringify(c));
  assert.deepEqual(checkProblems(c, GOOD), []);
});

test("검산: 없는 key·빈 refs·인용 불일치·빠짐·없는 숫자를 모두 잡음(omitted도 빠짐을 채움)", () => {
  const input = digestChunks(CHUNKS, digestTarget("track-biz"));
  const bad: DigestAnswer = {
    rules: [
      { section: "가", text: "「성과의 인과 관계성」을 본다, 배점 3점", refs: ["plan/s1", "nope"], quotes: [] },
      { section: "가", text: "근거 없는 줄", refs: [], quotes: [] },
      // 인용은 refs 조각 글에서만 찾음(다른 조각 글에 있어도 안 됨)
      { section: "나", text: "「계량지표 달성도」", refs: ["plan/s1"], quotes: [] },
    ],
    omitted: [{ key: "ghost", reason: "x" }],
  };
  const c = checkDigest(bad, input);
  assert.equal(c.ok, false);
  assert.deepEqual(c.unknownKeys.sort(), ["ghost", "nope"]);
  assert.deepEqual(c.emptyRefs, [1]);
  assert.deepEqual(c.badQuotes, [{ rule: 0, quote: "성과의 인과 관계성" }, { rule: 2, quote: "계량지표 달성도" }]);
  assert.deepEqual(c.missing, ["plan/hb-common"]);
  assert.deepEqual(c.unknownNumbers, [{ rule: 0, numbers: ["3점"] }]);
  const problems = checkProblems(c, bad);
  assert.ok(problems.some((p) => p.includes("plan/hb-common")));
  assert.ok(problems.some((p) => p.startsWith("규칙 1(") && p.includes("3점")));
  const fixed = checkDigest({ ...GOOD, rules: GOOD.rules.slice(0, 1), omitted: [{ key: "plan/hb-common", reason: "중복" }] }, input);
  assert.equal(fixed.ok, true, "omitted에 있으면 빠짐이 아님");
  const both = checkDigest({ ...GOOD, omitted: [{ key: "plan/s1", reason: "중복" }] }, input);
  assert.equal(both.ok, true);
  assert.deepEqual(both.both, ["plan/s1"], "refs와 omitted에 함께 있으면 참고로만 알림");
});

test("검산: 표 조각은 줄 글로 풀어 대조(태그 글자가 인용에 끼지 않음)", () => {
  const input = digestChunks(CHUNKS, digestTarget("BZ-1"));
  const c = checkDigest({ rules: [{ section: "Pool", text: "「무선국 검사율」", refs: ["pool/bz1-a"], quotes: ["무선국 검사율"] }], omitted: [] }, input);
  assert.equal(c.ok, true, JSON.stringify(c));
});

test("요청 글·마크다운: 표지·절·줄 끝 key·부록, 재시도에는 문제와 앞 답", () => {
  const p = rulesDigestPrompts().prompts;
  const target = digestTarget("track-biz");
  const input = digestChunks(CHUNKS, target);
  const req = digestPrompt(p, target, input);
  assert.doesNotMatch(req, /\{\{\w+\}\}/);
  assert.ok(req.includes('<source key="plan/s1" unit="plan_section"'));
  assert.ok(req.includes("입력 key 목록: plan/s1, plan/hb-common"));
  const retry = digestPrompt(p, target, input, { problems: ["문제 하나"], previous: GOOD });
  assert.ok(retry.includes("- 문제 하나") && retry.includes('"plan/s1"'));
  const md = digestMarkdown(p, target, { ...GOOD, omitted: [{ key: "x/1", reason: "중복: plan/s1과 같은 글" }] });
  assert.ok(md.startsWith(`# 공통 규칙 문서 — ${target.title}\n`));
  assert.ok(md.includes("근거 메모 — 사실·숫자의 근거가 아님, 인용은 원문 조각으로"));
  assert.equal(md.match(/^## 평가 기준·배점$/gm)?.length, 1, "같은 절은 한 번");
  assert.ok(md.includes("- 계량지표 달성도 40% 반영 [plan/hb-common]"));
  assert.ok(md.includes("## 해당 없음·중복") && md.includes("- x/1 — 중복: plan/s1과 같은 글"));
});

test("부분 갱신: 바뀌거나 빠진 조각을 가리키는 절과 다시 판정할 부록 키, 새 조각", () => {
  const input = digestChunks(CHUNKS, digestTarget("track-biz"));
  const prev = { inputs: digestInputs(input), answer: { ...GOOD, rules: [...GOOD.rules, { section: "다른 절", text: "x", refs: ["plan/hb-common"], quotes: [] }], omitted: [{ key: "plan/s1", reason: "중복" }] } };
  assert.deepEqual(staleDigest(prev, digestInputs(input)), { changed: [], added: [], removed: [], sections: [], omitted: [] }, "같은 글이면 다시 만들 것 없음");
  const edited = input.map((c) => (c.chunk_key === "plan/s1" ? { ...c, text: `${c.text} 고침` } : c));
  const added = [...edited, chunk({ chunk_key: "plan/new", unit_type: "plan_section", text: "새 기준" })];
  const s = staleDigest(prev, digestInputs(added));
  assert.deepEqual(s, { changed: ["plan/s1"], added: ["plan/new"], removed: [], sections: ["평가 기준·배점"], omitted: ["plan/s1"] });
  const r = staleDigest(prev, digestInputs(input.filter((c) => c.chunk_key !== "plan/hb-common")));
  assert.deepEqual(r.removed, ["plan/hb-common"]);
  assert.deepEqual(r.sections, ["평가 기준·배점", "다른 절"]);
  assert.notEqual(digestInputs(edited)[0].hash, prev.inputs[0].hash);
});
