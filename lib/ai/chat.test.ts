import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyResult } from "../inspections/model.ts";
import { CHAT_LIMITS, QUICK_PROMPTS, chatPrompt, cleanHistory, inspectionBrief } from "./chat.ts";
import { knowledgeBlock } from "./writer.ts";
import { chatPrompts } from "../prompts/sets.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

// 질문 프롬프트(resources/prompts/card-chat)
const P = chatPrompts().prompts;
const CHAT_ADAPTER = P.system.system;

const card = seedCards<Record<string, unknown>>().find((c) => c.id === "주요사업1/1-가")!;

test("적응문·빠른 질문: 지침 출력기호, 카드 안 고침, 모드 B·지적사항 환류·점검결과", () => {
  assert.match(CHAT_ADAPTER, /◆ 핵심 · ▸ 세부 · □ 표 제목 · ○ 마무리/);
  assert.match(CHAT_ADAPTER, /카드를 직접 고치지는 않습니다/);
  assert.match(CHAT_ADAPTER, /세부 대상사업이므로 3개 이름과 달라도 오류로 짚지 않습니다/, "지침의 대상사업 = 앱의 주요사업");
  assert.match(CHAT_ADAPTER, /판단과 문장을 바꾸지 않고\(요약·수정·재판정 금지\)/, "점검결과 조회는 지침 「점검결과조회」대로 원문 그대로");
  assert.match(CHAT_ADAPTER, /지침의 지식파일 이름과 「근거 자료」의 짝/, "지침 지식파일 이름 ↔ 앱 근거 자료");
  assert.deepEqual(
    QUICK_PROMPTS.map((q) => q.key),
    ["improve", "discover", "findings", "strategy", "inspection"],
  );
});

test("대화 이력 정리: 역할·빈 글 거름, 최근 턴만, 길이 제한", () => {
  const raw = [{ role: "system", text: "x" }, { role: "user", text: " " }, ...Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", text: `t${i}` }))];
  const h = cleanHistory(raw);
  assert.equal(h.length, CHAT_LIMITS.turns);
  assert.equal(h.at(-1)?.text, "t11");
  const long = cleanHistory([{ role: "assistant", text: "가".repeat(CHAT_LIMITS.answer + 100) }]);
  assert.equal(long[0].text.length, CHAT_LIMITS.answer);
  assert.deepEqual(cleanHistory("x"), []);
});

test("요청: 기준 월·카드 칸·점검결과·근거 자료·이전 대화·이번 질문", { skip: NO_SEED_CARDS }, () => {
  const ins = emptyResult();
  ins.axes[3] = { judgment: "미흡", question: "", fix: "'추진성과' 칸에 체감 변화 추가", evidence: [{ source: "관리계획 자가진단", quote: "결과(outcome) 중심", key: "k", verified: true }], card: "'추진성과 — 정량' — 건수만", note: "" };
  const brief = inspectionBrief({ period: "2026-09", status: "sent", result: ins });
  assert.match(brief, /2026-09 점검\(부서에 보냄\) — 7대축 0\/7/);
  assert.match(brief, /\[7대축 4 OutCome 연결 — 미흡\] ▸ 보완: '추진성과' 칸에 체감 변화 추가/);
  assert.equal(inspectionBrief(null), "(받은 점검 없음)");
  const p = chatPrompt(P, card, knowledgeBlock([{ key: "k1", title: "제목", unitType: "evaluator_comment", text: "원문" }]), { question: "추진성과 보완?", history: [{ role: "user", text: "앞 질문" }, { role: "assistant", text: "앞 답" }], periodLabel: "2026년 9월", inspection: brief });
  for (const w of ["기준 월: 2026년 9월", "「카드」", "주요사업 전파이용 기회 확대 · 대상사업 전파품질 향상", "## 계량 성과지표", "「점검결과」", '<source key="k1"', "「이전 대화」\n담당자: 앞 질문\nAI: 앞 답", "「이번 질문」\n추진성과 보완?"]) assert.ok(p.includes(w), w);
  assert.ok(!p.includes("「첨부 자료"), "첨부가 없으면 첨부 칸 없음");
});

test("카드 자료(첨부): 근거 자료 뒤·이전 대화 앞, 자료마다 file:N 봉투에 전체 글", { skip: NO_SEED_CARDS }, () => {
  const p = chatPrompt(P, card, "", {
    question: "이 결과보고로 9월 실적 정리",
    history: [{ role: "user", text: "앞 질문" }],
    periodLabel: "2026년 9월",
    inspection: "(받은 점검 없음)",
    files: [
      { name: "결과보고.pdf", text: "PDF 글" },
      { name: "보도자료.hwpx", text: "LTE-R 준공검사 3건" },
    ],
  });
  const at = (w: string) => p.indexOf(w);
  assert.ok(at("「첨부 자료」 2건") > at("「근거 자료」"));
  assert.ok(at('<source key="file:2" title="보도자료.hwpx" kind="카드 전용 자료">\nLTE-R 준공검사 3건\n</source>') > 0);
  assert.ok(at("「이전 대화」") > at("LTE-R 준공검사 3건"));
  assert.match(CHAT_ADAPTER, /첨부 자료/);
  assert.doesNotMatch(CHAT_ADAPTER, /첨부 파일은 받지 않습니다/);
});
