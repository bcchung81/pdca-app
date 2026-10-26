import assert from "node:assert/strict";
import { test } from "node:test";
import { CASE_NO_SOURCE, NOTICE_NO_PEER, TABLE_KEYS, emptyResult } from "../inspections/model.ts";
import {
  CASE_NONE,
  type InspectContext,
  type InspectOutput,
  InspectOutputSchema,
  caseText,
  checkEvidence,
  inspectSystemText,
  inspectionCardText,
  inspectionPrompt,
  normalizeDirection,
  oneLine,
  quoteFound,
  recheckEvidence,
  verifyInspection,
} from "./inspect.ts";
import type { KnowledgeRef } from "./writer.ts";
import { inspectPrompts } from "../prompts/sets.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

// 점검 프롬프트(resources/prompts/inspection) — 적응문은 지침 14 대신 빈 글을 채워 봄
const P = inspectPrompts().prompts;
const inspectAdapter = (peer: boolean) => inspectSystemText(P, peer, "");

const card = seedCards<Record<string, unknown>>().find((c) => c.id === "주요사업1/1-가")!;

const refs: KnowledgeRef[] = [
  {
    key: "plan-2607/checklist/BZ/sd3/g1",
    title: "관리계획 '26 자가진단 · 주요사업 공통 · 세부평가내용❸ 성과점검",
    unitType: "checklist_group",
    text: "성과지표별 목표 달성 여부를 점검하고, 미달성 지표에 대한 원인 분석이 명확하다.\n\n계량지표의 목표 달성 수준이 과도하지 않아 세부평가내용1과 연계한 목표 선정 기준이 적절하다.",
    where: "2026 경영평가 관리계획(7월판) Ⅲ-2 지표별 자가진단 체크리스트 · 주요사업 공통",
  },
  {
    key: "plan-2607/eval25/BZ-1/e3/p01",
    title: "관리계획 '25 평가보고서 · 주요사업1 · 성과 ⑦",
    unitType: "evaluator_comment",
    text: "⑦다만, 전파 품질 안정화 및 위성 통신 상용화 성과를 평가함에 있어, 해당 실적 중 기관의 독자적인 정책적 노력이 미친 영향과 이동통신사들의 자발적인 대규모 투자 또는 기술의 자연적인 진보에 의한 기여분을 명확히 분별할 수 있는 과학적 분석 로직이 필요하다고 판단한다.",
    where: "2025 경영실적 평가보고서(최종) 평가위원 의견 · 주요사업1 전파이용 기회 확대 · 등급 C",
  },
];
const ctx: InspectContext = {
  period: "2026-09",
  today: "2026-09-26",
  preMonth: false,
  business: { id: "BZ-1", name2026: "전파이용 기회 확대", name2025: "전파이용 기회 확대" },
  subBusinesses: ["전파자원 공급", "전파품질 향상"],
  hasPeerCases: false,
};

const row = (no: number, judgment: InspectOutput["axes"][number]["judgment"] = "충족", extra: Partial<InspectOutput["axes"][number]> = {}) => ({ no, judgment, question: "", fix: "", evidence: [], card: "", note: "", ...extra });
function output(over: Partial<InspectOutput> = {}): InspectOutput {
  return {
    coherence: [1, 2, 3, 4, 5].map((n) => row(n)),
    axes: [1, 2, 3, 4, 5, 6, 7].map((n) => row(n)),
    patterns: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => row(n)),
    status: "과정 실적 단계에 머묾",
    direction: "○OutCome 연결: 체감 지표 → 성과 입증\n- 계량 수치의 함정: 기여분 분리",
    case: { key: "", summary: "", insight: "" },
    notices: [],
    ...over,
  };
}

test("요청: 점검월·사전점검·주요사업('25 사업명)·지식 조각(key·위치)·카드 칸·AX 붙임", { skip: NO_SEED_CARDS }, () => {
  const p = inspectionPrompt(P, card, refs, ctx);
  assert.match(p, /점검월: 2026-09 · 점검일자: 2026-09-26 · 사전점검 아님/);
  assert.match(p, /주요사업\(지침의 '대상사업' 속성\): 전파이용 기회 확대\(BZ-1\) — '25 사업명 환산: 전파이용 기회 확대 사업/);
  assert.match(p, /카드 기본정보 '대상사업' 칸\(주요사업 아래 세부 대상사업\): 전파품질 향상 — 이 주요사업의 세부 대상사업: 전파자원 공급 · 전파품질 향상/);
  assert.match(p, /<source key="plan-2607\/eval25\/BZ-1\/e3\/p01" title="관리계획 '25 평가보고서 · 주요사업1 · 성과 ⑦" where="2025 경영실적 평가보고서/);
  assert.match(p, /## 계량 성과지표/);
  assert.match(p, /## \[Do\] 월별 실적/);
  assert.match(p, /붙임2 미확보/);
  const text = inspectionCardText(card);
  assert.match(text, /## 붙임 · AX 연계과제/);
  assert.match(text, /SafeVision/);
  assert.ok(text.length < 40_000, `카드 글 ${text.length}자`);
});

test("스키마: 판정 순서(정합성 → 7대축 → 질의패턴 → 총평)로 냄", () => {
  const shape = Object.keys((InspectOutputSchema as unknown as { shape: Record<string, unknown> }).shape);
  assert.deepEqual(shape, ["coherence", "axes", "patterns", "status", "direction", "case", "notices"]);
});

test("인용 대조: 띄어쓰기·문장부호 무시, …로 줄인 조각은 순서대로, 짧은 글은 확인 안 함", () => {
  const t = refs[1].text;
  assert.equal(quoteFound("기여분을 명확히 분별할 수 있는 과학적 분석 로직이 필요", t), true);
  assert.equal(quoteFound("「전파 품질 안정화 … 과학적 분석 로직이 필요하다고 판단한다.」", t), true);
  // kordoc HTML 표 조각: 프롬프트와 같이 줄 글로 풀어 대조(태그 이름 글자가 끼지 않게)
  const table = '<table><tr><th>구 분</th><th colspan="2">기 존</th></tr><tr><td>지표명</td><td colspan="2">5G 이동통신<br>활성화 기여도</td></tr></table>';
  assert.equal(quoteFound("지표명 5G 이동통신 활성화 기여도", table), true);
  assert.equal(quoteFound("과학적 분석 로직 … 전파 품질 안정화", t), false, "순서가 바뀌면 아님");
  assert.equal(quoteFound("기여분", t), false, "너무 짧음");
  assert.equal(quoteFound("원문에 없는 문장입니다", t), false);
  // 키가 틀려도 다른 조각에 있으면 바로잡고, 어디에도 없으면 다름
  assert.deepEqual(checkEvidence({ key: refs[0].key, quote: "기술의 자연적인 진보에 의한 기여분" }, refs), { source: refs[1].title, quote: "기술의 자연적인 진보에 의한 기여분", key: refs[1].key, verified: true });
  assert.equal(checkEvidence({ key: refs[0].key, quote: "지어낸 문장이 들어 있음" }, refs).verified, false);
  assert.equal(checkEvidence({ key: null, quote: "붙임2 한국관광공사 원문", source: "붙임2 한국관광공사" }, refs).verified, null, "대조할 수 없는 사람 근거");
});

test("검증: 양식 칸은 코드가, 행 번호로 맞추고 빠진 행·틀린 인용은 알림, 사례제안은 붙임2 미확보", () => {
  const out = output({
    axes: [
      row(4, "미흡", { fix: "'추진성과' 칸에 체감 변화 추가", card: "'추진성과 — 정량' — 건수만", question: "지울 질문", evidence: [{ key: refs[0].key, quote: "미달성 지표에 대한 원인 분석이 명확하다" }, { key: "없는/키", quote: "지어낸 원문" }] }),
      ...[1, 2, 3, 5, 6].map((n) => row(n)),
    ],
    patterns: [row(5, "미흡", { question: "기여분을 분리했나?", fix: "산식 옆에 기여분 분리 근거", card: "'계량 성과지표' — 기여분 없음", evidence: [{ key: refs[1].key, quote: "기여분을 명확히 분별할 수 있는 과학적 분석 로직이 필요" }] })],
    notices: [" 팀명 미기재 "],
  });
  const v = verifyInspection(out, refs, ctx, { model: "claude-opus-5", at: "2026-09-26T01:00:00Z" });
  assert.equal(v.missing, 1 + 7, "7대축 7 · 질의패턴 5를 뺀 7행");
  assert.equal(v.unverified, 1);
  const r = v.result;
  assert.equal(r.axes[3].judgment, "미흡");
  assert.equal(r.axes[3].question, "", "7대축엔 예상 질의 없음");
  assert.deepEqual(
    r.axes[3].evidence.map((e) => [e.source, e.verified]),
    [
      [refs[0].title, true],
      ["출처 확인 안 됨", false],
    ],
  );
  assert.equal(r.axes[6].judgment, null, "빠진 행은 미판단");
  assert.equal(r.patterns[4].question, "기여분을 분리했나?");
  assert.equal(r.overview.case, CASE_NO_SOURCE);
  assert.equal(r.overview.direction, "★OutCome 연결: 체감 지표 → 성과 입증\n★계량 수치의 함정: 기여분 분리");
  assert.deepEqual(r.notices.slice(0, 2), [NOTICE_NO_PEER, "팀명 미기재"]);
  assert.ok(r.notices.some((n) => n.startsWith("원문과 다른 인용 1개")));
  assert.ok(r.notices.some((n) => n.startsWith("AI가 판단하지 않은 항목 8개")));
  assert.deepEqual(r.ai, { model: "claude-opus-5", at: "2026-09-26T01:00:00Z", sources: 2 });
  assert.equal(TABLE_KEYS.reduce((n, k) => n + r[k].length, 0), 20);
});

test("검증: 사전점검이면 7대축 2·4, 질의패턴 5를 해당 없음으로 덮고 추진현황 첫머리에 사전점검 표시", () => {
  const pre = { ...ctx, period: "2026-10", preMonth: true };
  const out = output({ axes: [1, 2, 3, 4, 5, 6, 7].map((n) => row(n, n === 4 ? "미흡" : "충족", n === 4 ? { fix: "f", card: "c", evidence: [{ key: refs[0].key, quote: "원인 분석이 명확하다" }] } : {})) });
  const r = verifyInspection(out, refs, pre, { model: "m", at: "" }).result;
  assert.equal(r.axes[1].judgment, "해당 없음");
  assert.equal(r.axes[3].judgment, "해당 없음");
  assert.equal(r.axes[3].note, "점검월 미도래(사전점검)");
  assert.equal(r.patterns[4].judgment, "해당 없음");
  assert.match(r.overview.status, /^사전점검\(점검월 미도래\) — 점검월 2026-10 ≠ 점검일자 2026-09-26\n과정 실적 단계에 머묾$/);
});

test("개선방향 줄머리는 ★ 하나로, 보완·카드는 한 줄로, 저장 전 사람이 고친 인용도 다시 대조", () => {
  assert.equal(normalizeDirection("1) 가\n▸ 나<br>★ 다\n\n· 라"), "★가\n★나\n★다\n★라");
  assert.equal(oneLine("- '[Plan]' 칸에 사유 추가\n- 연결 명시<br>∙ -5% 목표"), "'[Plan]' 칸에 사유 추가 · 연결 명시 · -5% 목표");
  const v = verifyInspection(output({ axes: [row(1, "미흡", { fix: "- 가 칸 추가\n- 나 명시", card: "'가' —\n비었음", evidence: [{ key: refs[0].key, quote: "원인 분석이 명확하다" }] })] }), refs, ctx, { model: "m", at: "" });
  assert.equal(v.result.axes[0].fix, "가 칸 추가 · 나 명시");
  assert.equal(v.result.axes[0].card, "'가' — · 비었음");
  const r = emptyResult();
  r.axes[0] = { judgment: "미흡", question: "", fix: "f", card: "c", note: "", evidence: [{ source: "내가 적은 출처", quote: "목표 달성 여부를 점검하고", key: null, verified: null }] };
  const back = recheckEvidence(r, refs);
  assert.deepEqual(back.axes[0].evidence[0], { source: refs[0].title, quote: "목표 달성 여부를 점검하고", key: refs[0].key, verified: true });
});

// 붙임2 사례 — 시험용 가상 자료(실제 기관 평가 내용 아님)
const peers: KnowledgeRef[] = [
  { key: "peer25-biz/001", title: "붙임2 · 가상기관A — 시험 서비스 사업(B+)", unitType: "peer_case", text: "잘한 점(성과): 국민 의견을 제도 개선까지 반영\n\n아쉬운 점(지적사항): 대표성 보완", meta: { org: "가상기관A", business: "시험 서비스 사업", grade: "B+", kind: "기관", kca: false } },
  { key: "peer25-biz/002", title: "붙임2 · 한국방송통신전파진흥원 — 전파이용 기회 확대 사업(C)", unitType: "peer_case", text: "아쉬운 점(지적사항): 내부 효율에 치중", meta: { org: "한국방송통신전파진흥원", business: "전파이용 기회 확대 사업", grade: "C", kind: "기관", kca: true } },
];

test("붙임2: 적응문 두 벌, 요청에 「붙임2 사례」(KCA 표시)를 따로 두고 지식 조각에서는 뺌", { skip: NO_SEED_CARDS }, () => {
  assert.match(inspectAdapter(false), /붙임2\(유관기관 평가보고서 정리\)는 아직 없습니다/);
  assert.match(inspectAdapter(true), /「붙임2 사례」로 줍니다/);
  assert.doesNotMatch(inspectAdapter(true), /\{\{/);
  const p = inspectionPrompt(P, card, [...refs, ...peers], { ...ctx, hasPeerCases: true });
  assert.match(p, /「붙임2 사례」\n<case key="peer25-biz\/001" org="가상기관A" business="시험 서비스 사업" grade="B\+" kind="기관" kca="false">/);
  assert.match(p, /kca="true"/);
  assert.match(p, /붙임2 사례 2행/);
  const knowledgePart = p.slice(p.indexOf("「지식 조각」"), p.indexOf("「붙임2 사례」"));
  assert.doesNotMatch(knowledgePart, /peer25-biz/);
});

test("사례제안 글: 기관명·사업명·등급은 붙임2 조각에서, 지어낸·KCA 사례는 해당 없음 + 알림", () => {
  assert.deepEqual(caseText({ key: "peer25-biz/001", summary: "국민 의견을\n제도까지 반영", insight: "▸ 인사이트: 의견 수렴을 반영 단계까지 이은 점이 인정받음" }, peers), {
    text: "가상기관A — 시험 서비스 사업(B+): 국민 의견을\n제도까지 반영\n▸ 인사이트: 의견 수렴을 반영 단계까지 이은 점이 인정받음",
    notice: null,
  });
  assert.deepEqual(caseText({ key: "", summary: "", insight: "" }, peers), { text: CASE_NONE, notice: null });
  assert.match(caseText({ key: "peer25-biz/002", summary: "x", insight: "y" }, peers).notice ?? "", /KCA 행/);
  assert.match(caseText({ key: "peer25-biz/999", summary: "x", insight: "y" }, peers).notice ?? "", /붙임2에 없는 사례/);
  const v = verifyInspection(output({ case: { key: "peer25-biz/001", summary: "요약", insight: "시사점" } }), [...refs, ...peers], { ...ctx, hasPeerCases: true }, { model: "m", at: "" });
  assert.equal(v.result.overview.case, "가상기관A — 시험 서비스 사업(B+): 요약\n▸ 인사이트: 시사점");
  assert.ok(!v.result.notices.includes(NOTICE_NO_PEER), "붙임2가 있으면 미확보 알림 없음");
});
