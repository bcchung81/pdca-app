import assert from "node:assert/strict";
import test from "node:test";
import {
  MATERIAL_CHARS, type JudgeAnswer, type Outcome, type ResultLike, type RunRecord,
  buildPacket, checkJudge, judgeable, judgeJsonSchema, summarize, summaryMarkdown, writerAnswerMarkdown,
} from "./writer-judge-core.ts";

const RESULT: ResultLike = {
  headline: "요약",
  summary: "설명",
  citations: [{ key: "mid25-biz/BZ-4/04", title: "제목", quote: "인용문", verified: true }],
  suggestions: [{ kind: "replace", targetPath: "plan.lines.0", period: null, current: "현재 글", proposed: ["새 글"], reason: "이유", sourceKeys: [], applicable: true }],
  monthlyRow: { month: "2026-10", activity: "추진", quantitative: "10건", qualitative: "정성", progress: "50%", risk: "없음" },
  followup: { items: [{ id: "axes.4", label: "7대축 4", star: true, judgment: "미반영", cardQuote: "카드글", cardQuoteOk: true, inspectionQuote: "점검글", inspectionQuoteOk: false, remaining: "OutCome 기재", missing: false }] },
};

const judge = (score: number, safety: number | null = 4): JudgeAnswer => ({
  axes: { grounding: { score, note: "" }, specific: { score: 3, note: "" }, useful: { score: 3, note: "" }, rules: { score: 3, note: "" }, safety: { score: safety, note: "" } },
  errors: [{ type: "fabricated", where: "제안 1", evidence: "10건", note: "자료에 없음" }],
  weakness: "약점",
  improvements: [{ layer: "prompt", change: "바꿈" }],
  summary: "종합",
});

test("writerAnswerMarkdown: 제안의 칸·현재 글·바꿀 글, 월별 행, 보완 점검 행이 보이고 라벨·모델 단서는 없음", () => {
  const md = writerAnswerMarkdown(RESULT);
  for (const s of ["plan.lines.0", "현재 글", "새 글", "월별 실적 행", "추진실적: 추진", "보완 점검 (1행)", "axes.4", "판단: 미반영", "원문과 다름"]) assert.ok(md.includes(s), s);
  assert.doesNotMatch(md, /\bbase\b|opus|claude/i);
});

test("buildPacket: 요청·카드·자료·답·조각이 있고 보완 점검에만 미흡 행 절이 붙음", () => {
  const base = { cardId: "주요사업1/1-가", modeLabel: "개선 제안", modeHint: "안내", periodLabel: "2026년 10월", cardText: "title | 과제", materials: [{ key: "file:1", name: "자료.pdf", text: "자료 원문" }], answer: "답 본문", chunks: [{ key: "k/1", title: "t", text: "조각 원문" }] };
  const p = buildPacket({ ...base, mode: "improve" });
  for (const s of ["개선 제안", "2026년 10월", "title | 과제", "[file:1] 자료.pdf", "자료 원문", "답 본문", "[k/1]", "조각 원문"]) assert.ok(p.includes(s), s);
  assert.ok(!p.includes("점검표 미흡 행"));
  const f = buildPacket({ ...base, mode: "followup", followupBasis: { period: "2026-09", statusLabel: "부서에 보냄", focus: true, rows: [{ id: "axes.4", label: "7대축 4", star: true, requested: "보완 요구", cardThen: "당시", question: "질의", evidence: ["근거"] }] } });
  for (const s of ["점검표 미흡 행", "axes.4", "★7대축 4", "보완 요구", "집중보완: 예"]) assert.ok(f.includes(s), s);
});

test("buildPacket: 긴 자료는 앞 MATERIAL_CHARS자만 싣고 그 사실을 적음", () => {
  const p = buildPacket({ cardId: "c", mode: "improve", modeLabel: "l", modeHint: "h", periodLabel: "p", cardText: "c", materials: [{ key: "file:1", name: "n", text: "가".repeat(MATERIAL_CHARS + 10) }], answer: "a", chunks: [] });
  assert.match(p, new RegExp(`앞 ${MATERIAL_CHARS}자만 실음`));
  assert.ok(!p.includes("가".repeat(MATERIAL_CHARS + 1)));
});

test("judgeable: 건너뜀·코드 결과·결과 없음은 뺌", () => {
  const base: RunRecord = { cardId: "c", uid: "u", mode: "improve", label: "base", periodLabel: "p", result: RESULT };
  assert.deepEqual(judgeable(base), { ok: true });
  assert.deepEqual(judgeable({ ...base, skipped: "실적 자료 없음" }), { ok: false, reason: "건너뜀 — 실적 자료 없음" });
  assert.equal(judgeable({ ...base, codeResult: true }).ok, false);
  assert.equal(judgeable({ ...base, result: undefined }).ok, false);
});

test("checkJudge: 정상은 통과, 축 범위·오류 인용 비움·약점 비움·제안 있는데 안전 null은 실패", () => {
  assert.equal(checkJudge(judge(5)).ok, true);
  assert.equal(checkJudge(judge(6)).ok, false);
  assert.equal(checkJudge(judge(0)).ok, false);
  const noEvidence = judge(3);
  noEvidence.errors[0].evidence = " ";
  assert.equal(checkJudge(noEvidence).ok, false);
  assert.equal(checkJudge({ ...judge(3), weakness: "" }).ok, false);
  assert.equal(checkJudge(judge(3, null), { hasSuggestions: true }).ok, false);
  assert.equal(checkJudge(judge(3, null), { hasSuggestions: false }).ok, true);
  assert.equal(checkJudge({ axes: {} }).ok, false);
});

test("judgeJsonSchema: draft-7 JSON 스키마", () => {
  const s = judgeJsonSchema() as { type?: string; required?: string[] };
  assert.equal(s.type, "object");
  assert.ok(s.required?.includes("weakness"));
});

test("summarize: 라벨 × 요청 종류별 축 평균(안전 null 제외)·오류 종류별 건수·지표 합계·약점", () => {
  const m = { suggestions: 2, applicable: 1, citations: 1, verified: 1, notVerified: 0, keys: 3 };
  const outcomes: Outcome[] = [
    { label: "base", mode: "improve", uid: "u1", cardId: "c1", judge: judge(5, null), metrics: m },
    { label: "base", mode: "improve", uid: "u2", cardId: "c2", judge: judge(3, 4), metrics: m },
    { label: "base", mode: "discover", uid: "u1", cardId: "c1", metrics: m },
  ];
  const s = summarize(outcomes);
  assert.equal(s.length, 2);
  const imp = s.find((x) => x.mode === "improve")!;
  assert.equal(imp.judged, 2);
  assert.equal(imp.axes.grounding, 4);
  assert.equal(imp.axes.safety, 4);
  assert.equal(imp.errors.fabricated, 2);
  assert.equal(imp.errors.style, 0);
  assert.equal(imp.metrics.suggestions, 4);
  assert.equal(imp.weaknesses.length, 2);
  const disc = s.find((x) => x.mode === "discover")!;
  assert.equal(disc.judged, 0);
  assert.equal(disc.axes.grounding, null);
});

test("summaryMarkdown: 표 세 개·약점·뺀 건 이유가 보임", () => {
  const s = summarize([{ label: "base", mode: "improve", uid: "u1", cardId: "c1", judge: judge(4), metrics: { suggestions: 1, applicable: 1, citations: 0, verified: 0, notVerified: 0, keys: 0 } }]);
  const md = summaryMarkdown(s, [{ label: "base", mode: "reflect", uid: "u2", cardId: "c2", reason: "건너뜀 — 실적 자료 없음" }]);
  for (const t of ["## 축 평균", "## 오류 종류별 건수", "## 결정론 지표", "c1: 약점", "## 심사에서 뺀 건", "실적 자료 없음", "지어냄"]) assert.ok(md.includes(t), t);
});
