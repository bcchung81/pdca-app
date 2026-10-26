// 경평 초안 「틀 고르기」(lib/reports/story-hints.ts) 시험: 도식 후보·글 신호·형제 초안의 틀로 이야기 틀 후보를 뽑는 결정론.

import assert from "node:assert/strict";
import { test } from "node:test";
import { diagramHints } from "./diagram-hints.ts";
import { MAIN_STORIES, storyHints, storyHintsPrompt } from "./story-hints.ts";
import { frameworkOf } from "./frameworks.ts";
import { hintSource, sectionHints } from "./section.ts";

const hintsOf = (text: string, siblings: string[] = []) => storyHints(diagramHints(text), text, siblings);
const top = (text: string, siblings: string[] = []) => hintsOf(text, siblings)[0]?.story;

test("MAIN_STORIES: 섞음을 뺀 12종이고 틀 사전(FRAMEWORKS)에 모두 있음", () => {
  assert.equal(MAIN_STORIES.length, 12);
  assert.ok(!(MAIN_STORIES as readonly string[]).includes("섞음"));
  for (const s of MAIN_STORIES) assert.ok(frameworkOf(s)?.blocks.length, s);
});

test("협업 기관 3곳 이상 + 한계 표현 → 한계 극복·다자협업형이 1순위", () => {
  const text = "국립공원공단·이동통신사·과기정통부 민관 협의체가 산악 음영 한계를 함께 풀었다. 기지국 부족·전원 한계·접근 한계가 있었다.";
  assert.equal(top(text), "한계 극복·다자협업형");
});

test("현장 목소리형: 말풍선 원문이 있으면 1순위, 민원·불안 낱말만 있으면 후보이되 「원문 없음」을 알림, 낱말 하나뿐이면 후보 아님", () => {
  const withVoice = "국민 불안이 컸다. 주민은 “전자파가 걱정돼서 잠을 못 자요.”라고 했다. 민원 120건을 처리했다.";
  assert.equal(top(withVoice), "현장 목소리형");
  const wordsOnly = hintsOf("국민 불안이 컸다. 민원 120건을 처리했다.").find((h) => h.story === "현장 목소리형");
  assert.ok(wordsOnly);
  assert.match(wordsOnly!.why, /원문은 아직 없음/);
  assert.ok(!hintsOf("올해 민원 120건을 처리했다.").some((h) => h.story === "현장 목소리형"));
});

test("현장 목소리형: 전년 절(2025 보고서)에만 말투 인용이 있으면 후보 아님 — 말풍선 신호는 카드·첨부 글로만(sectionHints, 2026-10-14 후속 2)", () => {
  const prior = [{ section: { key: "rpt25/k", business: "BZ-1", taskNo: "1-1", mark: "가", title: "전년 절", taskTitle: "", targetName: "", page: null, text: "주민은 “전자파가 걱정돼서 잠을 못 자요”라고 했다." }, score: 0.3 }];
  const card = { id: "x", taskNo: "1-1", title: "전파 안전 점검" };
  const actuals = { today: "", kpi: [], monthly: [] };
  const fromPrior = storyHints(sectionHints(card, prior, [], [], actuals, 2026), hintSource(card, prior, []));
  assert.ok(!fromPrior.some((h) => h.story === "현장 목소리형"));
  // 카드에 같은 말이 있으면 후보(1순위)
  const spoken = { ...card, title: "주민 “전자파가 걱정돼서 잠을 못 자요”" };
  assert.equal(storyHints(sectionHints(spoken, prior, [], [], actuals, 2026), hintSource(spoken, prior, []))[0]?.story, "현장 목소리형");
});

test("연도 4개 이상(연혁 점) + 제도·자격 → 연혁·연도 사다리형", () => {
  assert.equal(top("’22년 자격 신설, ’23년 제도 정비, ’24년 응시 확대, ’25년 누적 1,200명 취득"), "연혁·연도 사다리형");
});

test("원스톱·창구 통합 신호 → 원스톱 통합형", () => {
  assert.equal(top("측정 의뢰·상담·결과 안내를 한 번에 처리하는 원스톱 창구로 통합했다"), "원스톱 통합형");
});

test("용어 정의·왜 질문 + 교육 → 왜-어떻게형", () => {
  assert.equal(top("조난발신 연습기란? 왜 연습기가 필요한가? 어민 교육·훈련에 활용"), "왜-어떻게형");
});

test("가치 축 3개 이상이면 가치 축 분할형, 2개뿐이면 후보 아님", () => {
  assert.equal(top("공공성과 효율성, 서비스 질을 함께 높였다"), "가치 축 분할형");
  assert.ok(!hintsOf("공공성과 효율성을 높였다").some((h) => h.story === "가치 축 분할형"));
});

test("대립·제도 조정 → 이슈→해결책형", () => {
  assert.equal(top("주파수 공급을 두고 사업자 간 입장 차이가 컸다. 제도 개선과 정책 조정으로 해결책을 마련"), "이슈→해결책형");
});

test("연구 → 개발 → 확산 단계 → 단계 전개형", () => {
  assert.equal(top("’24년 연구, ’25년 개발·시범, ’26년 전국 확산. 1단계 수집 2단계 학습 3단계 판독"), "단계 전개형");
});

test("⑨ 기존과 개선이 한 줄에 든 글 → 기존→개선형, '25 지적은 문 신호가 아니라 약한 신호(지적만 있으면 후보 아님)", () => {
  assert.equal(top("기존 수기 입력 방식을 개선해 자동 연계로 전환했다"), "기존→개선형");
  const critOnly = storyHints(diagramHints("검사 업무를 추진했다.", { critiques: ["검사 체계 보완 필요"] }), "검사 업무를 추진했다.");
  assert.ok(!critOnly.some((h) => h.story === "기존→개선형"));
  const both = "기존 수기 입력 방식을 개선해 자동 연계로 전환했다";
  const withCrit = storyHints(diagramHints(both, { critiques: ["검사 체계 보완 필요"] }), both).find((h) => h.story === "기존→개선형")!;
  assert.match(withCrit.why, /지적을 고친 과제/);
});

test("⑩ 추진내용 갈래 표지(do.lines의 「∙ (…)」) 4개 이상 → 구분표 중심형, 3개면 후보 아님(문 신호 없음)", () => {
  const lines = (n: number) => Array.from({ length: n }, (_, i) => `do.lines.${i} | ∙ (갈래${i + 1}) 내용`).join("\n");
  assert.equal(top(lines(4)), "구분표 중심형");
  assert.ok(!hintsOf(lines(3)).some((h) => h.story === "구분표 중심형"));
  assert.ok(!hintsOf("∙ (갈래1) 가\n∙ (갈래2) 나\n∙ (갈래3) 다\n∙ (갈래4) 라").some((h) => h.story === "구분표 중심형"), "카드 칸 경로가 없는 글은 세지 않음");
});

test("⑪ 현황분석·조사·진단 낱말 3종 이상 → 현황분석→대응형, 2종이면 후보 아님", () => {
  assert.equal(top("실태조사와 현장조사로 혼간섭 원인을 진단했다"), "현황분석→대응형");
  assert.ok(!hintsOf("실태조사와 현장조사를 했다").some((h) => h.story === "현황분석→대응형"));
});

test("⑫ AI·자동화 낱말 서로 다른 것 2개 이상 + 업무 절차 변화 낱말 2개 이상 → AX 전환형, 어느 한쪽이 모자라면 후보 아님(2026-10-13)", () => {
  assert.equal(top("AI 자동 판독으로 육안 확인 없이 검사하고, 반복 확인은 자동화해 소요 시간을 단축했다"), "AX 전환형");
  const ax = hintsOf("인공지능 챗봇으로 상담 프로세스를 바꿔 처리 시간을 줄였다").find((h) => h.story === "AX 전환형")!;
  assert.match(ax.why, /AI·자동화 낱말/);
  assert.match(ax.opener, /\[전환 배경\] 칸 도식\(▶\)/, "여는 블록 = ▶ 칸 도식");
  assert.ok(!hintsOf("AI 안테나 판독을 확대했다. AI 판독 결과를 공유했다").some((h) => h.story === "AX 전환형"), "AI 한 낱말만 되풀이");
  assert.ok(!hintsOf("AIoT 센서 설치를 자동화했다").some((h) => h.story === "AX 전환형"), "AIoT의 AI는 세지 않음 — 자동화 하나뿐");
  assert.ok(!hintsOf("실태조사와 현장조사로 혼간섭 원인을 진단했다").some((h) => h.story === "AX 전환형"), "AI 낱말 없음");
  assert.ok(!hintsOf("AI 서비스 확산과 인공지능 산업 성장에 대비해 주파수를 공급했다").some((h) => h.story === "AX 전환형"), "AI가 배경일 뿐 — 업무 절차 변화 낱말 없음");
  const weak = hintsOf("AI 판독과 자동화로 소요 시간을 단축했다").find((h) => h.story === "AX 전환형")!;
  const strong = hintsOf("AI 판독과 자동화로 육안 확인·수작업을 없애 프로세스를 바꾸고 소요 시간을 단축했다").find((h) => h.story === "AX 전환형")!;
  assert.equal(strong.score - weak.score, 2, "절차 변화 낱말 4개 이상이면 2점 더(뚜렷한 전환 과제가 다른 틀에 밀리지 않게)");
});

test("형제 초안이 이미 쓴 틀은 뒤로 미루고 이유에 형제 수를 적음", () => {
  const text = "국립공원공단·이동통신사·과기정통부 민관 협의체가 산악 음영 한계를 함께 풀었다. 기지국 부족·전원 한계·접근 한계. ’24년 연구, ’25년 시범, ’26년 확산";
  const alone = hintsOf(text);
  const crowded = hintsOf(text, ["한계 극복·다자협업형", "한계 극복·다자협업형"]);
  assert.equal(alone[0].story, "한계 극복·다자협업형");
  assert.notEqual(crowded[0].story, "한계 극복·다자협업형");
  const moved = crowded.find((h) => h.story === "한계 극복·다자협업형");
  assert.ok(moved && moved.siblings === 2);
});

test("신호가 없으면 빈 목록, 후보는 3개까지·같은 틀 한 번", () => {
  assert.deepEqual(hintsOf("올해 계획대로 추진했다."), []);
  const many = hintsOf("국립공원공단·이동통신사·과기정통부 협의체 한계. 원스톱 창구 통합. 공공성·효율성. ’22년 ’23년 ’24년 ’25년 자격 제도. 조난발신 연습기란? 교육");
  assert.ok(many.length <= 3);
  assert.equal(new Set(many.map((h) => h.story)).size, many.length);
});

test("후보마다 여는 블록 = 그 틀 블록 순서의 첫 블록 이름", () => {
  for (const h of hintsOf("국립공원공단·이동통신사·과기정통부 민관 협의체가 한계를 풀었다. 기지국 부족·전원 한계·접근 한계")) {
    assert.ok(h.opener.length > 0, h.story);
    assert.ok(h.why.length > 0, h.story);
  }
  const fw = frameworkOf("현장 목소리형")!;
  const voice = hintsOf("국민 불안. 주민은 “걱정돼서 잠을 못 자요.”라고 했다. 민원 120건").find((h) => h.story === "현장 목소리형")!;
  assert.match(voice.opener, fw.blocks[0].kind === "banner" ? /메시지 띠/ : /./);
});

test("storyHintsPrompt: 후보 줄·형제 표시·없을 때 문구를 프롬프트 절로 채움", () => {
  const p = {
    feature: "report-outline",
    version: "t",
    system: {},
    schema: {},
    request: {
      storyHints: "틀 고르기\n{{items}}",
      "storyHints.item": "- {{story}} — {{why}} · 여는 블록 {{opener}}{{siblings}}",
      "storyHints.none": "- 없음",
      "storyHints.siblings": " · 형제 {{n}}",
    },
  };
  const text = storyHintsPrompt(p as never, [{ story: "원스톱 통합형", why: "원스톱", opener: "칸 도식(✚)", siblings: 1, score: 3 }]);
  assert.match(text, /^틀 고르기\n- 원스톱 통합형 — 원스톱 · 여는 블록 칸 도식\(✚\) · 형제 1$/);
  assert.equal(storyHintsPrompt(p as never, []), "틀 고르기\n- 없음");
});

test("'25 실사 질의로만 뜬 Q&A 후보는 왜-어떻게형 신호가 아님(거의 모든 카드에 실사 질의가 있어 이 틀로 몰림 — 평가 라운드 P 4/8)", () => {
  const text = "검사 업무 개선을 추진했다.";
  const fromSurvey = storyHints(diagramHints(text, { survey: ["Q8 오판독 대비책은?"] }), text);
  assert.ok(!fromSurvey.some((h) => h.story === "왜-어떻게형"));
  const asked = "왜 연습기가 필요한가? 어떻게 쓰는가?";
  assert.ok(storyHints(diagramHints(asked), asked).some((h) => h.story === "왜-어떻게형"));
});
