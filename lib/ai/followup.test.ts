import assert from "node:assert/strict";
import { test } from "node:test";
import { type InspectionResult, type RowResult, type TableKey, emptyResult } from "../inspections/model.ts";
import { assistPrompts } from "../prompts/sets.ts";
import { type FollowupAnswer, FOLLOWUP_NOTICE, MISSING_REMAINING, followupBasis, followupBlock, verifyFollowup } from "./followup.ts";

const P = assistPrompts().prompts;

function make(rows: Array<[TableKey, number, Partial<RowResult>]>): InspectionResult {
  const r = emptyResult();
  for (const [k, no, p] of rows) r[k][no - 1] = { ...r[k][no - 1], ...p };
  return r;
}
const ev = [{ source: "붙임1 자가진단 체크리스트", quote: "실적이 국민의 체감 변화로 연결되었는지 확인", key: null, verified: null }];
const weak = (fix: string, card: string, extra: Partial<RowResult> = {}): Partial<RowResult> => ({ judgment: "미흡", fix, card, evidence: ev, ...extra });
const ins = (rows: Array<[TableKey, number, Partial<RowResult>]>, status = "sent") => ({ period: "2026-09", status, result: make(rows) });

test("점검표가 없으면 null, 미흡이 없으면 행이 비고 집중보완이 아님", () => {
  assert.equal(followupBasis(null), null);
  const b = followupBasis(ins([["axes", 1, { judgment: "충족" }]]))!;
  assert.deepEqual(b.rows, []);
  assert.equal(b.focus, false);
  assert.equal(b.statusLabel, "부서에 보냄");
  assert.equal(followupBasis(ins([], "acknowledged"))!.statusLabel, "부서 확인함");
});

test("미흡 행만 id·라벨·요구·점검 당시 카드·예상 질의·근거로 뽑고, 기준 미확인·해당 없음은 재확인 목록으로", () => {
  const b = followupBasis(
    ins([
      ["axes", 4, weak("추진성과 정량 칸에 국민 체감 수치 추가", "'추진성과 — 정량' — 내부 효율만 있음")],
      ["patterns", 5, weak("분모 변화 설명 추가", "'계량 성과지표' — 분모 설명 없음", { question: "분모가 줄어 좋아 보이는 착시 아닌가?" })],
      ["coherence", 1, { judgment: "충족" }],
      ["axes", 1, { judgment: "기준 미확인", note: "필요 자료: 편람" }],
      ["patterns", 2, { judgment: "해당 없음", note: "계량지표 미연계" }],
    ]),
  )!;
  assert.deepEqual(
    b.rows.map((r) => r.id),
    ["axes.4", "patterns.5"],
  );
  const [a, p] = b.rows;
  assert.equal(a.label, "7대축 4 OutCome 연결");
  assert.equal(a.star, true);
  assert.equal(a.requested, "추진성과 정량 칸에 국민 체감 수치 추가");
  assert.equal(a.cardThen, "'추진성과 — 정량' — 내부 효율만 있음");
  assert.deepEqual(a.evidence, ["붙임1 자가진단 체크리스트 「실적이 국민의 체감 변화로 연결되었는지 확인」"]);
  assert.equal(p.label, "질의패턴 5 계량 수치의 함정");
  assert.equal(p.question, "분모가 줄어 좋아 보이는 착시 아닌가?");
  assert.deepEqual(
    b.recheck.map((x) => [x.id, x.judgment, x.note]),
    [
      ["axes.1", "기준 미확인", "필요 자료: 편람"],
      ["patterns.2", "해당 없음", "계량지표 미연계"],
    ],
  );
});

test("집중보완(★ 두 개 이상 미흡)이면 ★핵심 행을 맨 앞에, 아니면 표 순서", () => {
  const w = () => weak("보완", "카드");
  const focus = followupBasis(ins([["axes", 1, w()], ["axes", 4, w()], ["patterns", 5, w()]]))!;
  assert.equal(focus.focus, true);
  assert.deepEqual(
    focus.rows.map((r) => r.id),
    ["axes.4", "patterns.5", "axes.1"],
  );
  const plain = followupBasis(ins([["axes", 1, w()], ["axes", 4, w()]]))!;
  assert.equal(plain.focus, false);
  assert.deepEqual(
    plain.rows.map((r) => r.id),
    ["axes.1", "axes.4"],
  );
});

const CARD = "## 추진성과 — 정량\noutcome.quantitative.0 | 검사 소요 3만 시간 단축, 국민 민원 40% 감소를 확인함";
const basis = () =>
  followupBasis(
    ins([
      ["axes", 4, weak("추진성과 정량 칸에 국민 체감 수치 추가", "'추진성과 — 정량' — 내부 효율만 있음")],
      ["patterns", 5, weak("분모 변화 설명 추가", "'계량 성과지표' — 분모 설명 없음")],
      ["coherence", 2, weak("국정과제 번호 기재", "'전략 연계성' — 국정과제 비어 있음")],
    ]),
  )!;
const ans = (id: string, judgment: FollowupAnswer["judgment"], over: Partial<FollowupAnswer> = {}): FollowupAnswer => ({ id, judgment, card_quote: "", inspection_quote: "", remaining: "", ...over });

test("검증: 빠진 행은 확인 불가로 채우고, 중복은 첫 건만, 모르는 id는 버리고, id의 공백·대소문자는 맞춰 읽고, 집계는 코드가 센다", () => {
  const v = verifyFollowup(
    [
      ans("axes.4", "반영됨", { card_quote: "「국민 민원 40% 감소를 확인함」", inspection_quote: "추진성과 정량 칸에 국민 체감 수치 추가", remaining: "반영됨이면 지워질 글" }),
      ans("axes.4", "미반영"), // 중복 — 첫 건만
      ans("axes.9", "반영됨"), // 모르는 id — 버림
      ans(" PATTERNS.5 ", "미반영", { card_quote: "카드에 없는 문장입니다 여기", inspection_quote: "분모 변화 설명 추가", remaining: "'계량 성과지표' 칸에 분모 설명 추가" }),
    ],
    basis(),
    CARD,
  );
  assert.deepEqual(
    v.items.map((i) => [i.id, i.judgment, i.missing]),
    [
      ["axes.4", "반영됨", false],
      ["patterns.5", "미반영", false],
      ["coherence.2", "확인 불가", true],
    ],
  );
  const [a, p, m] = v.items;
  assert.equal(a.remaining, "", "반영됨이면 남은 할 일을 비움");
  assert.equal(a.cardQuote, "국민 민원 40% 감소를 확인함", "「」는 뗌");
  assert.equal(a.cardQuoteOk, true);
  assert.equal(a.inspectionQuoteOk, true);
  assert.equal(p.cardQuoteOk, false, "카드 글에 없는 인용은 원문과 다름");
  assert.equal(p.inspectionQuoteOk, true);
  assert.equal(p.remaining, "'계량 성과지표' 칸에 분모 설명 추가");
  assert.equal(m.remaining, MISSING_REMAINING);
  assert.equal(m.cardQuoteOk, null);
  assert.deepEqual(v.counts, { 반영됨: 1, "일부 반영": 0, 미반영: 1, "확인 불가": 1, total: 3 });
  assert.equal(v.notice, FOLLOWUP_NOTICE);
  assert.equal(v.recheckCount, 0);
});

test("검증: 6자 미만 인용은 원문 확인이 아니고, 빈 인용은 null, 답이 null이면 모든 행이 확인 불가", () => {
  const v = verifyFollowup([ans("axes.4", "일부 반영", { card_quote: "수치", remaining: "보강" })], basis(), CARD);
  assert.equal(v.items[0].cardQuoteOk, false);
  assert.equal(v.items[0].inspectionQuoteOk, null);
  const none = verifyFollowup(null, basis(), CARD);
  assert.equal(none.counts["확인 불가"], 3);
  assert.ok(none.items.every((i) => i.missing));
});

test("요청 블록: 헤더와 행(id | 항목 | 보완 | 점검 당시 카드 | 예상 질의 | 근거), 줄바꿈·구분 기호는 풀리고 빈 칸은 —, 재확인 목록이 붙음", () => {
  const b = followupBasis(
    ins([
      ["axes", 4, weak("첫 줄\n둘째 줄 | 구분", "")],
      ["patterns", 5, weak("보완", "카드 상태", { question: "착시 아닌가?" })],
      ["axes", 1, { judgment: "해당 없음", note: "점검월 미도래" }],
    ]),
  )!;
  const text = followupBlock(P, b);
  assert.ok(text.startsWith("「점검표 보완 요구」 — 2026-09 점검(부서에 보냄) · 미흡 2건 · 집중보완: 예"), text);
  assert.ok(text.includes("axes.4 | ★7대축 4 OutCome 연결 | 첫 줄 / 둘째 줄 / 구분 | — | — | 붙임1 자가진단 체크리스트 「실적이 국민의 체감 변화로"), text);
  assert.ok(text.includes("patterns.5 | ★질의패턴 5 계량 수치의 함정 | 보완 | 카드 상태 | 착시 아닌가? |"), text);
  assert.ok(text.includes("「재확인」") && text.includes("7대축 1 국민 출발점 — 해당 없음(점검월 미도래)"), text);
});

test("검증: 줄인 인용(…)은 조각마다 순서대로 원문에 있으면 원문 확인, 순서가 바뀌거나 없는 조각이 있으면 다름", () => {
  const b = basis();
  const q = (cq: string) => verifyFollowup([ans("axes.4", "반영됨", { card_quote: cq })], b, CARD).items[0].cardQuoteOk;
  assert.equal(q("검사 소요 3만 시간 … 국민 민원 40% 감소를 확인함"), true, "가운데 생략");
  assert.equal(q("검사 소요 3만 시간 단축…"), true, "끝 생략");
  assert.equal(q("국민 민원 40% 감소를 확인함 … 검사 소요 3만 시간"), false, "순서가 바뀜");
  assert.equal(q("검사 소요 3만 시간 … 지어낸 문장입니다 여기"), false, "원문에 없는 조각");
  assert.equal(q("…"), null, "생략 표시만 있으면 인용 없음");
  assert.equal(q("수치 … 단축"), false, "조각 글자 합이 6자 미만");
});
