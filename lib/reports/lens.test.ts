import assert from "node:assert/strict";
import { test } from "node:test";
import { LENS_CRITERIA_KEYS, LENS_LIMITS, LENS_PER_CHUNK, type LensRow, lensTopic, pickLens } from "./lens.ts";

const row = (chunk_key: string, unit_type: string, text = `${chunk_key} 본문`, meta: Record<string, unknown> | null = null): LensRow => ({ chunk_key, title: `제목 ${chunk_key}`, unit_type, text, context_prefix: `위치 ${chunk_key}`, meta });
const empty = { criteria: [], linked: [], execution: [], searched: [], peers: [] };

test("평가 기준: 정한 키 순서대로(읽은 순서와 무관), 없는 키는 건너뜀", () => {
  const got = pickLens({ ...empty, criteria: [row(LENS_CRITERIA_KEYS[3], "plan_section"), row(LENS_CRITERIA_KEYS[0], "handbook_indicator"), row("plan-2607/narr/I/ref6/s1", "plan_section")] });
  assert.deepEqual(
    got.map((x) => [x.group, x.key]),
    [
      ["criteria", LENS_CRITERIA_KEYS[0]],
      ["criteria", LENS_CRITERIA_KEYS[3]],
    ],
    "고정 목록 밖 조각은 넣지 않음",
  );
  assert.equal(got[0].where, `위치 ${LENS_CRITERIA_KEYS[0]}`);
});

test("평가위원 지적: 카드에 연결된 것 → 이 사업 「집행」 의견 → 검색 순, 같은 조각은 한 번, 개수 상한", () => {
  const got = pickLens({
    ...empty,
    linked: [row("mid25-biz/BZ-1/03", "finding_row"), row("att3/q8", "qa_pair")],
    execution: [row("plan-2607/eval25/BZ-1/e2/p01", "evaluator_comment"), row("mid25-biz/BZ-1/03", "finding_row")],
    searched: Array.from({ length: 10 }, (_, i) => row(`plan-2607/eval25/BZ-1/e3/p0${i}`, "evaluator_comment")),
  });
  const critiques = got.filter((x) => x.group === "critiques").map((x) => x.key);
  assert.deepEqual(critiques.slice(0, 3), ["mid25-biz/BZ-1/03", "plan-2607/eval25/BZ-1/e2/p01", "plan-2607/eval25/BZ-1/e3/p00"]);
  assert.equal(critiques.length, LENS_LIMITS.critiques.items);
  assert.deepEqual(got.filter((x) => x.group === "survey").map((x) => x.key), ["att3/q8"], "연결된 실사 조각은 실사 묶음으로");
});

test("실사 질의응답: 글자 상한을 넘기 전까지, 조각 하나는 2,500자까지 자름", () => {
  const long = "가".repeat(LENS_PER_CHUNK + 500);
  const got = pickLens({ ...empty, searched: [row("q1", "qa_pair", long), row("q2", "qa_part", long), row("q3", "qa_pair", long), row("q4", "qa_pair")] });
  const survey = got.filter((x) => x.group === "survey");
  assert.equal(survey[0].text.length, LENS_PER_CHUNK);
  assert.deepEqual(survey.map((x) => x.key), ["q1", "q2"], "6,000자 상한 — 셋째 긴 조각에서 멈춤");
});

test("유관기관 사례: KCA 행·B+·B0 밖 등급은 빼고 B+ 먼저", () => {
  const got = pickLens({
    ...empty,
    peers: [row("p1", "peer_case", "b0", { grade: "B0" }), row("p2", "peer_case", "c", { grade: "C" }), row("p3", "peer_case", "kca", { grade: "B+", kca: true }), row("p4", "peer_case", "bplus", { grade: "B+" })],
  });
  assert.deepEqual(got.map((x) => x.key), ["p4", "p1"]);
});

test("검색 글: 과제명·실행과제·계량지표 이름·지적사항(글줄만)", () => {
  assert.equal(lensTopic({ title: "안테나 판독", executionTask: "스마트 검사", kpi: { rows: [{ name: "대체 건수" }, {}] }, act: { findings: ["산식 재산정", { table: 1 }] } }), "안테나 판독 스마트 검사 대체 건수 산식 재산정");
  assert.equal(lensTopic(null), "");
});

test("검색 글: 「지적사항 없음」 줄은 넣지 않음(주요사업·경영관리), 실제 지적은 유지", () => {
  assert.equal(lensTopic({ title: "가", act: { findings: ["∙ 경영평가 지적사항 없음"] } }), "가");
  assert.equal(lensTopic({ title: "가", act: { findings: ["∙ 해당없음", "∙ 산식 근거 없음 — 재산정 필요"] } }), "가 산식 근거 없음 — 재산정 필요");
  assert.equal(lensTopic({ title: "나", findings: { rows: [{ finding: ["해당사항 없음", "실적 미흡"] }, { finding: ["-"] }] } }), "나 실적 미흡 -");
});
