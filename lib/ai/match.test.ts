import assert from "node:assert/strict";
import { test } from "node:test";
import type { BundleChunk } from "../knowledge/bundle.ts";
import { fillFrom } from "../prompts/template.ts";
import { matchPrompts } from "../prompts/sets.ts";
import { MATCH_GROUP_CHARS, MatchResultSchema, UNSURE_MAX, matchBlock, matchCandidates, matchCardSummary, matchPrompt, matchResultSchema, matchShared, parseMatches, splitByBudget } from "./match.ts";

const c = (over: Partial<BundleChunk> & { chunk_key: string }): BundleChunk => ({
  doc_id: "att3-2604",
  seq: 0,
  unit_type: "qa_pair",
  track: "주요사업",
  business: "BZ-1",
  title: over.chunk_key,
  text: `글 ${over.chunk_key}`,
  context_prefix: null,
  meta: null,
  ...over,
});

const chunks: BundleChunk[] = [
  c({ chunk_key: "qa/BZ-1/1", seq: 2 }),
  c({ chunk_key: "qa/BZ-1/0", seq: 1 }),
  c({ chunk_key: "qa/BZ-2/1", seq: 5, business: "BZ-2" }),
  c({ chunk_key: "qa/BZ-4/1", seq: 3, business: "BZ-4" }),
  c({ chunk_key: "qa/bonus/1", seq: 4, business: null, track: "가점" }),
  c({ chunk_key: "find/inst", doc_id: "eval25", unit_type: "finding_row", business: null }),
  c({ chunk_key: "plan/sec", doc_id: "plan-2607", unit_type: "plan_section", business: null }),
  c({ chunk_key: "plan/task/1", doc_id: "plan-2607", unit_type: "task_list_row" }),
  c({ chunk_key: "peer/b0", doc_id: "peer25-biz", unit_type: "peer_case", meta: { grade: "B0" } }),
  c({ chunk_key: "rpt/BZ-1/a", doc_id: "rpt25-biz", unit_type: "report_section" }),
  c({ chunk_key: "rpt/BZ-2/a", doc_id: "rpt25-biz", unit_type: "report_section", business: "BZ-2" }),
];

test("매칭 후보: 규칙 범위(기관 공통·공통지표·사업 미지정·이 사업)의 대응표 대상 유형만, 문서 → 적재 순서로 고정", () => {
  assert.deepEqual(
    matchCandidates(chunks, "BZ-1").map((x) => x.chunk_key),
    ["qa/BZ-1/0", "qa/BZ-1/1", "qa/BZ-4/1", "qa/bonus/1", "find/inst", "rpt/BZ-1/a"],
    "다른 사업·붙임2·관리계획 서술·과제 목록 행은 뺌",
  );
  assert.deepEqual(matchCandidates([...chunks].reverse(), "BZ-1").map((x) => x.chunk_key), matchCandidates(chunks, "BZ-1").map((x) => x.chunk_key), "입력 순서와 상관없이 같은 순서");
});

test("매칭 후보: docIds를 주면 그 문서 조각만(새 판이 온 문서), 빈 목록이면 전체", () => {
  assert.deepEqual(matchCandidates(chunks, "BZ-1", ["rpt25-biz"]).map((x) => x.chunk_key), ["rpt/BZ-1/a"]);
  assert.equal(matchCandidates(chunks, "BZ-1", []).length, 6);
  assert.deepEqual(matchCandidates(chunks, "BZ-1", ["없는-문서"]), []);
});

test("묶음 나누기: 조각을 자르지 않고 순서를 지키며, 한 조각이 상한보다 커도 혼자 한 묶음", () => {
  const big = (k: string, n: number) => c({ chunk_key: k, text: "가".repeat(n) });
  const list = [big("a", 1000), big("b", 1000), big("c", 10_000), big("d", 1000), big("e", 1000)];
  const groups = splitByBudget(list, 2_500);
  assert.deepEqual(groups.map((g) => g.map((x) => x.chunk_key)), [["a", "b"], ["c"], ["d", "e"]]);
  assert.deepEqual(groups.flat().map((x) => x.chunk_key), ["a", "b", "c", "d", "e"]);
  assert.ok(groups.flat().every((x) => x.text!.length >= 1000), "글을 자르지 않음");
  assert.deepEqual(splitByBudget([]), []);
  assert.equal(splitByBudget(list).length, 1, "기본 상한 안이면 한 묶음");
  assert.ok(MATCH_GROUP_CHARS >= 100_000);
});

test("답 검증: 입력에 없는 key·빈 근거·중복은 버리고 dropped로 셈, 남은 것은 답 순서대로 rank, 근거는 한 줄로", () => {
  const valid = new Set(["k1", "k2", "k3"]);
  const { hits, dropped } = parseMatches(
    {
      matches: [
        { key: " k2 ", certainty: "high", basis: "  계량지표 \n 판독 정확도를   다룸 " },
        { key: "없는 키", certainty: "high", basis: "지어냄" },
        { key: "k1", certainty: "high", basis: "" },
        { key: "k2", certainty: "high", basis: "중복" },
        { key: "k3", certainty: "high", basis: "가".repeat(500) },
      ],
    },
    valid,
  );
  assert.equal(dropped, 3);
  assert.deepEqual(hits.map((h) => [h.chunkKey, h.rank]), [["k2", 1], ["k3", 2]]);
  assert.equal(hits[0].basis, "계량지표 판독 정확도를 다룸");
  assert.equal(hits[1].basis.length, 200);
  assert.deepEqual(parseMatches({ matches: [] }, valid), { hits: [], dropped: 0 });
});

test("카드 요약: 과제 정체성과 매칭에 쓰는 칸만(월별 실적은 안 넣음), 빈 카드도 던지지 않음", () => {
  const s = matchCardSummary({
    title: "AI 안테나 판독",
    taskNo: "1-가",
    executionTaskNo: "1-1",
    executionTask: "전파 품질 검사 고도화",
    targetBusiness: "무선국",
    kpi: { rows: [{ nameRaw: "판독 정확도", formula: "정확 건수/전체" }, { name: "처리 건수" }] },
    act: { findings: ["지적 A\n두 번째 줄", { table: { rows: [] } }] },
    strategy: { ai: { text: "AI 판독 도입" } },
    overview: { cells: ["개요 한 줄"] },
    do: { monthly: [{ period: "2026-03", items: ["월별 실적 문장"] }] },
  });
  assert.match(s, /과제명: AI 안테나 판독/);
  assert.match(s, /실행과제: 1-1 전파 품질 검사 고도화/);
  assert.match(s, /계량지표: 판독 정확도 — 정확 건수\/전체 \/ 처리 건수/);
  assert.match(s, /전년 경영평가 지적사항: 지적 A \/ 두 번째 줄/);
  assert.match(s, /AI 활용: AI 판독 도입/);
  assert.ok(!s.includes("월별 실적 문장"));
  assert.equal(matchCardSummary(null), "");
});

test("카드 요약: 경영관리 카드는 「지적 및 개선방안」 칸(findings.rows)을 지적·개선방안으로 넣음, 주요사업 카드 요약은 그대로", () => {
  const s = matchCardSummary({
    title: "핵심가치 진단",
    taskNo: "1-1",
    findings: { rows: [{ finding: ["지적 하나", "지적 둘"], plan: ["개선 하나"] }, { finding: ["지적 셋"], plan: [] }] },
    act: { findings: ["주요사업 지적"] },
  });
  assert.match(s, /전년 경영평가 지적사항: 주요사업 지적 \/ 지적 하나 \/ 지적 둘 \/ 지적 셋/);
  assert.match(s, /지적에 대한 개선방안: 개선 하나/);
  assert.ok(!matchCardSummary({ title: "가", act: { findings: ["지적 A"] } }).includes("개선방안"));
});

test("조각 봉투: 종류(unit)를 적고 표는 줄 글로 풀며 태그를 이스케이프", () => {
  const b = matchBlock([c({ chunk_key: "k<1>", title: "제목 & 표", context_prefix: "첨부3 12쪽", text: "<table><tr><td>가</td><td>나</td></tr></table>" })]);
  assert.match(b, /<source key="k&lt;1&gt;" unit="qa_pair" title="제목 &amp; 표" where="첨부3 12쪽">/);
  assert.ok(!b.includes("<td>"));
  assert.match(b, /<\/source>$/);
});

test("프롬프트 파일: 시스템·요청 글이 자리표시 오류 없이 만들어지고, 조각 묶음 글은 카드와 무관하게 같다", () => {
  const { prompts } = matchPrompts();
  assert.match(fillFrom(prompts, "system", "system"), /^# 역할/);
  const a = matchPrompt(prompts, "BZ-1", { title: "과제 A" });
  const b = matchPrompt(prompts, "BZ-1", { title: "과제 B" });
  assert.match(a, /주요사업: 전파이용 기회 확대/);
  assert.match(a, /과제명: 과제 A/);
  assert.notEqual(a, b);
  const group = matchCandidates(chunks, "BZ-1");
  assert.equal(matchShared(prompts, "BZ-1", group), matchShared(prompts, "BZ-1", group), "같은 입력이면 바이트까지 같음(캐시)");
  assert.match(matchShared(prompts, "BZ-1", group), /6건/);
  assert.notEqual(matchShared(prompts, "BZ-1", group), matchShared(prompts, "BZ-2", group), "사업이 다르면 다름");
});

test("답 스키마: 근거가 없으면 거절, 설명(schema.md)을 붙이면 모델용 JSON 스키마에 뜻이 실림", () => {
  assert.ok(MatchResultSchema.safeParse({ matches: [{ key: "k", certainty: "high", basis: "b" }] }).success);
  assert.ok(MatchResultSchema.safeParse({ matches: [{ key: "k", certainty: "unsure", basis: "b" }] }).success);
  assert.ok(!MatchResultSchema.safeParse({ matches: [{ key: "k", certainty: "high" }] }).success, "근거가 없으면 거절");
  assert.ok(!MatchResultSchema.safeParse({ matches: [{ key: "k", certainty: "maybe", basis: "b" }] }).success, "확신 정도는 high·unsure만");
  assert.ok(!MatchResultSchema.safeParse({}).success);
  const { schema } = matchPrompts();
  const json = JSON.stringify(schema.toJSONSchema?.() ?? {});
  assert.match(json, /해당 아님」인 조각은 넣지 않는다/);
  assert.match(json, /unsure = 관련은 있어 보이나 단정하기 어려워 사람이 고르게 함/);
  assert.ok(matchResultSchema(matchPrompts().prompts.schema));
});

test("확신 정도: high는 자동 초안, unsure는 후보(사람이 고름) — 애매는 UNSURE_MAX건까지만 남기고 나머지는 버림", () => {
  const valid = new Set(Array.from({ length: 30 }, (_, i) => `k${i}`));
  const matches = [
    { key: "k0", certainty: "high" as const, basis: "확실" },
    ...Array.from({ length: 12 }, (_, i) => ({ key: `k${i + 1}`, certainty: "unsure" as const, basis: `애매 ${i}` })),
    { key: "k20", certainty: "high" as const, basis: "확실2" },
  ];
  const { hits, dropped } = parseMatches({ matches }, valid);
  assert.equal(hits.find((h) => h.chunkKey === "k0")?.status, "auto");
  assert.equal(hits.find((h) => h.chunkKey === "k1")?.status, "candidate");
  assert.equal(hits.filter((h) => h.status === "candidate").length, UNSURE_MAX);
  assert.equal(dropped, 2, "애매 12건 중 상한을 넘은 2건");
  assert.equal(hits.find((h) => h.chunkKey === "k20")?.status, "auto", "상한은 애매만 셈 — 뒤의 확신은 그대로");
  assert.deepEqual(hits.map((h) => h.rank), hits.map((_, i) => i + 1), "순위는 남은 것 기준으로 이어짐");
});
