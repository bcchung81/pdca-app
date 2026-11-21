// AI 가점 실사를 관련 카드에만 넣는 판정(bonus-scope.ts): 대상 조각(가점 트랙 · 사업 미지정 · 실사 성격)과 세 갈래(대응표 연결 · 주요사업 AI활용 칸 · 경영관리 지표 13), 「없음」 표기.
import assert from "node:assert/strict";
import { test } from "node:test";
import { aiFieldFilled, bonusDrop, bonusReasons, isBonusSurvey } from "./bonus-scope.ts";

const chunk = (unit_type: string, track = "가점", business: string | null = null) => ({ doc_id: "att3-2604", unit_type, track, business, meta: null });
const withAi = (ai: unknown) => ({ title: "과제", strategy: { ai } });

test("대상 조각: 가점 트랙 · 사업 미지정 · 실사 성격(질의응답·긴 답변·요청자료·증빙 그림)만", () => {
  for (const t of ["qa_pair", "qa_part", "request_evidence", "evidence_image"]) assert.equal(isBonusSurvey(chunk(t)), true, t);
  assert.equal(isBonusSurvey(chunk("plan_section")), false, "가점 트랙이어도 다른 성격(기준류)은 대상 아님 — 지금처럼 넣음");
  assert.equal(isBonusSurvey(chunk("generic_section")), false, "모르는 성격(other)도 대상 아님");
  assert.equal(isBonusSurvey(chunk("qa_pair", "가점", "MG-13")), false, "사업(지표)이 정해진 조각은 대상 아님");
  assert.equal(isBonusSurvey(chunk("qa_pair", "주요사업")), false, "주요사업 트랙 사업 미지정 실사는 대상 아님");
  assert.equal(isBonusSurvey(chunk("qa_pair", "경영관리")), false);
});

test("AI활용 칸: 체크했거나, 글이 비지 않고 「없음」 표기가 아니면 채워짐", () => {
  assert.equal(aiFieldFilled(withAi({ text: "AI 기반 민원 상담", checked: true })), true);
  assert.equal(aiFieldFilled(withAi({ text: "해당사항 없음", checked: true })), true, "체크가 앞섬");
  assert.equal(aiFieldFilled(withAi({ text: "AI 분석 기반 예측 시스템\n구축", checked: false })), true, "체크 안 했어도 실제 글이 있으면 채워짐");
  for (const text of ["해당사항 없음", "해당사항없음", " 해당 없음 ", "없음", "-", " - ", "해당사항\n없음", "", "   "]) assert.equal(aiFieldFilled(withAi({ text, checked: false })), false, JSON.stringify(text));
  assert.equal(aiFieldFilled(withAi({ checked: true })), true, "글 없이 체크만");
  assert.equal(aiFieldFilled(withAi({ text: 3, checked: "true" })), false, "글이 문자열이 아니고 체크가 true가 아님");
  for (const data of [null, undefined, "글", { title: "과제" }, { strategy: null }, { strategy: { ai: null } }, withAi("글")]) assert.equal(aiFieldFilled(data), false, JSON.stringify(data));
});

test("관련 갈래: 대응표 연결 · 주요사업 AI활용 칸 · 경영관리 지표 13(겹치면 모두), 아니면 빈 목록", () => {
  const ai = withAi({ text: "AI 챗봇", checked: true });
  const none = withAi({ text: "해당사항 없음", checked: false });
  assert.deepEqual(bonusReasons({ unit: "BZ-1", data: ai, linkedBonus: false }), ["ai"]);
  assert.deepEqual(bonusReasons({ unit: "BZ-2", data: none, linkedBonus: false }), []);
  assert.deepEqual(bonusReasons({ unit: "BZ-3", data: none, linkedBonus: true }), ["linked"], "매칭기가 찾은 연결은 빼지 않음");
  assert.deepEqual(bonusReasons({ unit: "BZ-1", data: ai, linkedBonus: true }), ["linked", "ai"]);
  assert.deepEqual(bonusReasons({ unit: "MG-13", data: { title: "" }, linkedBonus: false }), ["mg13"]);
  assert.deepEqual(bonusReasons({ unit: "MG-13", data: {}, linkedBonus: true }), ["linked", "mg13"]);
  assert.deepEqual(bonusReasons({ unit: "MG-3", data: {}, linkedBonus: false }), []);
  assert.deepEqual(bonusReasons({ unit: "MG-3", data: ai, linkedBonus: false }), [], "AI활용 칸 갈래는 주요사업 카드만");
  assert.deepEqual(bonusReasons({ unit: "MG-3", data: {}, linkedBonus: true }), ["linked"]);
});

test("bonusDrop: 무관 카드면 가점 실사만 뺌, 관련 카드(연결 — 유형 상관없이 대응표 키 전부로 봄 · AI활용 칸 · 지표 13)면 아무것도 안 뺌", () => {
  const k = (chunk_key: string, unit_type: string, track = "가점", business: string | null = null) => ({ chunk_key, ...chunk(unit_type, track, business) });
  const chunks = [k("bonus/qa", "qa_pair"), k("bonus/req", "request_evidence"), k("bonus/rule", "plan_section"), k("biz/qa", "qa_pair", "주요사업", "BZ-1")];
  const kept = (drop: (c: (typeof chunks)[number]) => boolean) => chunks.filter((c) => !drop(c)).map((c) => c.chunk_key);
  const none = withAi({ text: "해당사항 없음", checked: false });
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "BZ-1", data: none, linked: [] })), ["bonus/rule", "biz/qa"], "무관: 가점 실사(질의응답·요청자료)만 빠짐");
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "BZ-1", data: none, linked: ["biz/qa"] })), ["bonus/rule", "biz/qa"], "가점 실사가 아닌 연결은 관련 판정에 안 셈");
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "BZ-1", data: none, linked: ["bonus/req"] })), chunks.map((c) => c.chunk_key), "요청자료 하나만 연결돼도 관련 — 전부 남김");
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "BZ-1", data: none, linked: ["없는/키"] })), ["bonus/rule", "biz/qa"], "조각에 없는 연결 키는 안 셈");
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "BZ-1", data: withAi({ text: "AI 챗봇", checked: false }), linked: [] })), chunks.map((c) => c.chunk_key));
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "MG-13", data: {}, linked: [] })), chunks.map((c) => c.chunk_key));
  assert.deepEqual(kept(bonusDrop(chunks, { unit: "MG-3", data: {}, linked: [] })), ["bonus/rule", "biz/qa"]);
});
