// 경영관리 구성안 「틀 고르기」(lib/reports/story-hints-mg.ts) 시험 — 신호 → 틀, 문 신호가 없으면 후보 없음, 같은 지표 다른 카드가 쓴 틀은 뒤로, 요청 글(2026-10-12 C5).

import assert from "node:assert/strict";
import { test } from "node:test";
import type { DiagramHint } from "./diagram-hints.ts";
import { reportOutlinePromptsMg } from "../prompts/sets.ts";
import { mgHintText, mgStoryHints, mgStoryHintsFor, mgStoryHintsPrompt } from "./story-hints-mg.ts";
import type { MgPriorSection } from "./mg-outline.ts";

const hint = (kind: string): DiagramHint => ({ kind, why: "시험", own: false });
const first = (input: Parameters<typeof mgStoryHints>[0]) => mgStoryHints(input)[0]?.story;
const stories = (input: Parameters<typeof mgStoryHints>[0]) => mgStoryHints(input).map((h) => h.story);

test("틀 고르기(경영관리): 신호마다 그 틀이 후보 1순위", () => {
  assert.equal(first({ text: "do.lines.0 | ∙ 비전 재정립과 전략목표·전략과제 연계" }), "전략수립형", "비전·전략목표·전략과제 낱말");
  assert.equal(first({ text: "", hints: [hint("strategy")] }), "전략수립형", "도식 후보 전략체계도");
  assert.equal(first({ text: "do.lines.0 | ∙ 노사 갈등과 제도의 한계를 넘는 협의" }), "문제·해결형", "갈등·한계 낱말");
  assert.equal(first({ text: "", hints: [hint("cards:vs")] }), "문제·해결형", "맞선 입장(VS)");
  assert.equal(first({ text: "do.lines.0 | ∙ 기존 수기 관리 → 개선 후 자동 집계(As-Is)" }), "기존·개선형", "기존·개선 전후 낱말");
  assert.equal(first({ text: "", hints: [hint("pdca")] }), "PDCA 체계형");
  assert.equal(first({ text: "", hints: [hint("timeline")] }), "단계·연도 로드맵형");
  assert.equal(first({ text: "do.monthly.0.items.0 | ∙ 월별 모니터링으로 부채비율·유동비율 증감 추이 점검" }), "계량 모니터링형", "모니터링 낱말 3개 이상");
  assert.equal(first({ text: "do.lines.0 | ① 해외 판로 지원\ndo.lines.4 | ② 협력기업 사후관리\ndo.lines.8 | ③ 성과 측정" }), "소과제 묶음형", "줄머리 번호 표지 2개 이상");
  assert.equal(first({ text: "do.lines.0 | ∙ 임신·출산부터 육아휴직 뒤 복직까지 지원" }), "생애주기형", "생애 단계 낱말 3개 이상");
  assert.equal(first({ text: "do.lines.0 | ∙ 정부 보수 지침 준수 및 가이드라인 100% 이행" }), "준수 점검형", "지침 준수·이행");
  const table = (t: boolean) => (t ? "구분 | 주요활동 | 추진실적\n가 | 나 | 다" : "추진배경 | 배경");
  assert.equal(first({ text: "", prior: [table(true), table(true), table(false)] }), "구분표 중심형", "추천 평가내용의 2025 절 절반 이상이 구분표");
});

test("틀 고르기(경영관리) ⑫: AI·자동화 낱말 서로 다른 것 2개 이상 + 업무 절차 변화 낱말 2개 이상이면 AX 전환형 후보, 모자라면 아님(2026-10-13)", () => {
  assert.equal(first({ text: "do.lines.0 | ∙ 생성형 AI 도입과 RPA 업무 자동화로 수작업 처리 시간 단축" }), "AX 전환형");
  assert.ok(!stories({ text: "do.lines.0 | ∙ 생성형 AI 도입과 RPA 활용 교육" }).includes("AX 전환형"), "업무 절차 변화 낱말 없음");
  assert.ok(!stories({ text: "do.lines.0 | ∙ AI 교육 운영\ndo.lines.1 | ∙ AI 활용 문화 확산" }).includes("AX 전환형"), "AI 한 낱말만");
  assert.ok(!stories({ text: "do.lines.0 | ∙ 노사 갈등과 제도의 한계를 넘는 협의" }).includes("AX 전환형"), "AI 낱말 없음");
});

test("틀 고르기(경영관리): 문 신호가 없으면 후보 없음 — 약한 낱말 하나·줄 안 번호·구분표가 절반 미만인 2025 절·기본형 ②는 후보가 아님", () => {
  assert.deepEqual(mgStoryHints({ text: "do.lines.0 | ∙ 교육 운영 및 결과 공유" }), []);
  assert.deepEqual(stories({ text: "do.lines.0 | ∙ 갈등 관리" }), [], "문제 낱말 하나");
  assert.deepEqual(stories({ text: "do.lines.1 | - ❶아차사고 활성화, ❷TBM 활동 확대" }), [], "줄 안에 이어 쓴 번호는 소과제 표지가 아님");
  assert.deepEqual(stories({ text: "do.lines.0 | ∙ 정부 지침 검토\ndo.lines.1 | ∙ 법령 준수 교육" }), [], "지침과 준수가 떨어져 있으면 아님");
  assert.deepEqual(stories({ text: "", prior: ["구분 | 활동\nx | y", "추진배경 | 배경", "추진배경 | 배경"] }), [], "구분표 절이 절반 미만");
  assert.ok(!stories({ text: "do.lines.0 | ∙ 비전 재정립과 전략목표·전략과제 연계", hints: [hint("pdca"), hint("timeline")] }).includes("배경·내용·성과형"));
});

test("틀 고르기(경영관리): 카드 양식 머리·과제번호 줄·과제 개요 체크칸(「고도화과제(기존)」)은 신호로 세지 않고, 숫자 근거가 아닌 첨부는 뺌", () => {
  const card = { title: "재무구조 안정성", overview: { cells: ["☑ 고도화과제(기존)"] }, do: { lines: ["∙ 개선 후 운영"] } };
  const text = mgHintText(card);
  assert.doesNotMatch(text, /고도화과제/);
  assert.ok(!stories({ text }).includes("기존·개선형"), "체크칸의 「기존」 + 본문 「개선 후」만으로는 기존·개선형이 아님");
  const withFiles = mgHintText(card, [{ text: "첨부: 기존 방식 → 개선 전후 비교" }, { text: "다른 과제 자료: 갈등·한계·취약", numberEvidence: false }]);
  assert.match(withFiles, /기존 방식/);
  assert.doesNotMatch(withFiles, /다른 과제 자료/);
});

test("틀 고르기(경영관리): 같은 지표 다른 카드의 절이 주 틀로 쓴 틀은 절 하나에 2점씩 뒤로(빼지는 않음), 후보는 3개까지", () => {
  const text = "do.lines.0 | ∙ 비전·전략목표 재정립\ndo.lines.1 | ∙ 노사 갈등과 제도 한계";
  assert.deepEqual(stories({ text, hints: [hint("strategy")] }), ["전략수립형", "문제·해결형"]);
  const r = mgStoryHints({ text, hints: [hint("strategy")], siblingStories: ["전략수립형", "전략수립형"] });
  assert.deepEqual(r.map((h) => h.story), ["문제·해결형", "전략수립형"]);
  assert.equal(r[1].siblings, 2);
  const many = mgStoryHints({ text: `${text}\ndo.lines.2 | ∙ 임신·출산·육아 지원\ndo.lines.3 | ① 가\ndo.lines.4 | ② 나`, hints: [hint("strategy"), hint("pdca")] });
  assert.equal(many.length, 3);
});

test("틀 고르기 요청 글(경영관리): 후보·없음·형제 표기를 채우면 자리표시가 남지 않고, 여는 블록은 그 틀의 첫 블록", () => {
  const p = reportOutlinePromptsMg().prompts;
  const hints = mgStoryHints({ text: "do.lines.0 | ① 가\ndo.lines.1 | ② 나", siblingStories: ["소과제 묶음형"] });
  const text = mgStoryHintsPrompt(p, hints);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /틀 고르기/);
  assert.match(text, /소과제 묶음형 — 신호: 줄머리 번호 표지 2개/);
  assert.match(text, /여는 블록 \[추진배경\]/);
  assert.match(text, /같은 지표 다른 카드의 절 1개가 이미 주 틀로 씀/);
  assert.match(text, /「섞음」은 없습니다/);
  assert.match(mgStoryHintsPrompt(p, []), /뚜렷한 신호 없음/);
});

test("mgStoryHintsFor: 추천 평가내용의 2025 절 글만 보고(다른 평가내용 절은 안 셈), 형제 구성안 절의 주 틀로 뒤로 미룸", () => {
  const p = reportOutlinePromptsMg().prompts;
  const sec = (evalNo: number, text: string): MgPriorSection => ({ key: `k${evalNo}${text.length}`, evalNo, evalTitle: "", themeNo: 1, themeTitle: "", mark: "가", title: "", markers: [], text, page: null });
  const prior = [sec(1, "구분 | 활동 | 실적"), sec(1, "구분 | 활동"), sec(2, "추진배경 | 배경"), sec(2, "추진배경 | 배경"), sec(2, "추진배경 | 배경")];
  assert.match(mgStoryHintsFor(p, { card: { title: "t" }, ctx: { prior, evals: [1] } }), /구분표 중심형 — 신호: 추천 평가내용의 2025 절 2개 중 2개가 구분표/);
  assert.match(mgStoryHintsFor(p, { card: { title: "t" }, ctx: { prior, evals: [1, 2] } }), /뚜렷한 신호 없음/, "평가내용 1·2를 합치면 5개 중 2개");
  const sib = mgStoryHintsFor(p, { card: { title: "t" }, ctx: { prior, evals: [1] }, siblings: [{ taskNo: "9-1", parts: [{ key: "1.1.가", evalNo: 1, themeNo: 1, mark: "가", title: "", label: "", story: "구분표 중심형", signature: "" }] }] });
  assert.match(sib, /같은 지표 다른 카드의 절 1개가 이미 주 틀로 씀/);
});
