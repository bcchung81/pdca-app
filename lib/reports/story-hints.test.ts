// 경평 초안 「틀 고르기」(lib/reports/story-hints.ts) 시험: 도식 후보·글 신호·형제 초안의 틀로 이야기 틀 후보를 뽑는 결정론.

import assert from "node:assert/strict";
import { test } from "node:test";
import { diagramHints } from "./diagram-hints.ts";
import { MAIN_STORIES, storyHints, storyHintsPrompt } from "./story-hints.ts";
import { BRANCH_REPEAT_STORIES } from "./blocks.ts";
import { frameworkOf } from "./frameworks.ts";
import { hintSource, sectionHints, storyHintsOf } from "./section.ts";

const hintsOf = (text: string, siblings: string[] = []) => storyHints(diagramHints(text), text, siblings);
const top = (text: string, siblings: string[] = []) => hintsOf(text, siblings)[0]?.story;

test("MAIN_STORIES: 섞음을 뺀 20종(⑬~⑯은 2026-11-04, ⑰~⑳은 2026-11-09)이고 틀 사전(FRAMEWORKS)에 모두 있음, 갈래 반복 틀은 목록 안의 이름", () => {
  assert.equal(MAIN_STORIES.length, 20);
  for (const s of BRANCH_REPEAT_STORIES) assert.ok((MAIN_STORIES as readonly string[]).includes(s), s);
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
  assert.equal(hintsOf("민원·간담회·건의·애로·고충을 의견수렴으로 모았다").find((h) => h.story === "현장 목소리형")?.score, 2, "원문이 없으면 낱말이 많아도 2점까지(말풍선을 지어낼 틈을 막음)");
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

// '25 지적 신호는 2026-11-09 P1-2에서 뺌 — 운영 56장 중 53장에 걸려 변별력 없이 ⑨의 바닥 점수만 올렸음(예전 시험은 「지적이 있으면 이유에 적음」을 봤음)
test("⑨ 기존과 개선이 한 줄에 든 글 → 기존→개선형, '25 지적은 신호가 아님(지적만 있으면 후보 아님 · 지적이 있어도 점수·이유 그대로)", () => {
  assert.equal(top("기존 수기 입력 방식을 개선해 자동 연계로 전환했다"), "기존→개선형");
  const critOnly = storyHints(diagramHints("검사 업무를 추진했다.", { critiques: ["검사 체계 보완 필요"] }), "검사 업무를 추진했다.");
  assert.ok(!critOnly.some((h) => h.story === "기존→개선형"));
  const both = "기존 수기 입력 방식을 개선해 자동 연계로 전환했다";
  const withCrit = storyHints(diagramHints(both, { critiques: ["검사 체계 보완 필요"] }), both).find((h) => h.story === "기존→개선형")!;
  const without = hintsOf(both).find((h) => h.story === "기존→개선형")!;
  assert.equal(withCrit.score, without.score);
  assert.doesNotMatch(withCrit.why, /지적/);
});

test("⑨ 새 문 신호: 「기존」과 「수치 → 수치」 표기가 다른 줄에 있어도 후보(2026-11-09)", () => {
  const h = hintsOf("do.lines.0 | 기존 방식의 한계를 점검했다\ndo.lines.1 | 처리 기간 10일 → 3일").find((x) => x.story === "기존→개선형");
  assert.ok(h);
  assert.match(h!.why, /수치 → 수치/);
  assert.ok(!hintsOf("do.lines.0 | 처리 기간 10일 → 3일").some((x) => x.story === "기존→개선형"), "「기존」 낱말 없이 수치 화살표만이면 아님");
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

// 2026-11-09 P1-2부터 ⑫ 문 신호는 제목·계획·추진내용 줄(title·plan.lines·do.lines)에 AI 낱말이 1개 이상 있어야 함 — 그래서 이 시험의 글은 추진내용 칸 경로(do.lines.0 | )를 붙임(낱말 판정은 예전 그대로)
const doLine = (t: string) => `do.lines.0 | ${t}`;
test("⑫ AI·자동화 낱말 서로 다른 것 2개 이상 + 업무 절차 변화 낱말 2개 이상 → AX 전환형, 어느 한쪽이 모자라면 후보 아님(2026-10-13)", () => {
  assert.equal(top(doLine("AI 자동 판독으로 육안 확인 없이 검사하고, 반복 확인은 자동화해 소요 시간을 단축했다")), "AX 전환형");
  const ax = hintsOf(doLine("인공지능 챗봇으로 상담 프로세스를 바꿔 처리 시간을 줄였다")).find((h) => h.story === "AX 전환형")!;
  assert.match(ax.why, /AI·자동화 낱말/);
  assert.match(ax.opener, /\[전환 배경\] 칸 도식\(▶\)/, "여는 블록 = ▶ 칸 도식");
  assert.ok(!hintsOf(doLine("AI 안테나 판독을 확대했다. AI 판독 결과를 공유했다")).some((h) => h.story === "AX 전환형"), "AI 한 낱말만 되풀이");
  assert.ok(!hintsOf(doLine("AIoT 센서 설치를 자동화했다")).some((h) => h.story === "AX 전환형"), "AIoT의 AI는 세지 않음 — 자동화 하나뿐");
  assert.ok(!hintsOf(doLine("실태조사와 현장조사로 혼간섭 원인을 진단했다")).some((h) => h.story === "AX 전환형"), "AI 낱말 없음");
  assert.ok(!hintsOf(doLine("AI 서비스 확산과 인공지능 산업 성장에 대비해 주파수를 공급했다")).some((h) => h.story === "AX 전환형"), "AI가 배경일 뿐 — 업무 절차 변화 낱말 없음");
  assert.ok(!hintsOf("check.items.0 | AI 자동 판독으로 육안 확인 없이 소요 시간을 단축했다").some((h) => h.story === "AX 전환형"), "AI 낱말이 제목·계획·추진내용 줄에 없음");
  const weak = hintsOf(doLine("AI 판독과 자동화로 소요 시간을 단축했다")).find((h) => h.story === "AX 전환형")!;
  const strong = hintsOf(doLine("AI 판독과 자동화로 육안 확인·수작업을 없애 프로세스를 바꾸고 소요 시간을 단축했다")).find((h) => h.story === "AX 전환형")!;
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

// ---------------------------------------------------------------------------
// P1-2 틀 신호 보정(2026-11-09, docs/plan/경평초안-프레임워크-확장-계획.md P1-2 완료 기준 2)

const NO_ACTUALS = { today: "", kpi: [], monthly: [] };
/** 시험 카드(주요사업 — 기관 자료 아님): 추진내용 줄만 받음 */
const cardOf = (lines: string[], extra: Record<string, unknown> = {}) => ({ taskNo: "1-가", title: "시험 과제", do: { lines }, ...extra });
const storiesOf = (hs: { story: string }[]) => hs.map((h) => h.story);

test("P1-2: 전년 절에만 있는 연도 흐름·전후 비교로는 ①·⑧·⑨ 후보가 아님(storyHintsOf는 전년 절을 안 봄 — 요청 글의 도식 후보는 전년 절까지 봄)", () => {
  const card = cardOf(["전파 점검 업무를 추진했다"]);
  const prior = [{ section: { key: "rpt25/k", business: "BZ-1", taskNo: "1-가", mark: "가", title: "전년 절", taskTitle: "", targetName: "", page: null, text: "’22년 자격 신설, ’23년 제도 정비, ’24년 연구, ’25년 개발. 기존 수기 방식을 자동 연계로 개선했다" }, score: 0.3 }];
  const withPrior = sectionHints(card, prior, [], [], NO_ACTUALS, 2026).map((h) => h.kind);
  assert.ok(withPrior.includes("timeline:dots") && withPrior.includes("compare:panels"), "요청 글의 도식 후보는 전년 절 신호를 그대로 봄");
  assert.ok(storiesOf(storyHints(sectionHints(card, prior, [], [], NO_ACTUALS, 2026), hintSource(card, prior, []))).some((s) => ["연혁·연도 사다리형", "기존→개선형"].includes(s)), "예전 입력(전년 절 포함)이면 후보가 됐음");
  const now = storiesOf(storyHintsOf(card, [], [], NO_ACTUALS, 2026));
  for (const s of ["단계 전개형", "연혁·연도 사다리형", "기존→개선형"]) assert.ok(!now.includes(s), s);
});

test("P1-2: 칸 이름 「(장애 또는 리스크 요인)」·「(모니터링 및 해결 방안)」만으로는 ⑱이 아님, 원인·조치 낱말이 본문에 있으면 ⑱", () => {
  assert.ok(!hintsOf("do.lines.0 | (장애 또는 리스크 요인) 예산 부족\ndo.lines.1 | (모니터링 및 해결 방안) 분기마다 조치").some((h) => h.story === "문제·원인별 해결형"));
  assert.equal(top("do.lines.0 | 지연 원인은 장비 노후와 인력 부족 요인이었다\ndo.lines.1 | 원인별로 장비 교체 조치와 인력 보완 대응을 했다"), "문제·원인별 해결형");
});

test("P1-2: 업무 공정의 「N단계」만으로는 ⑲가 아님(2026-11-09 실호출 — 「기존 6단계 → 4단계」가 ⑲ 1순위를 열던 오탐)", () => {
  assert.ok(!hintsOf("do.lines.0 | 기존 6단계 절차를 4단계로 줄였다\ndo.lines.1 | 1단계 접수와 2단계 심사를 합쳤다").some((h) => h.story === "로드맵형"));
});

test("P1-2: ☑ 중장기과제 표시만으로는 ⑲가 아님(보조 신호), 로드맵 낱말이 있으면 ⑲", () => {
  assert.ok(!hintsOf("overview.cells.0 | ☑ 중장기과제 □ 신규과제\ndo.lines.0 | 전파 점검을 추진했다").some((h) => h.story === "로드맵형"));
  const road = hintsOf("overview.cells.0 | ☑ 중장기과제\ndo.lines.0 | 3개년 로드맵에 따라 1단계 기반 구축을 마치고 2단계를 준비했다").find((h) => h.story === "로드맵형");
  assert.ok(road);
  assert.match(road!.why, /중장기과제/, "중장기과제는 문이 열린 뒤 보조 점수");
});

test("P1-2: AX 연계 붙임에만 AI 낱말이 있으면 ⑫가 아님, 추진내용에 있으면 ⑫", () => {
  const ax = { axAttachments: [{ marker: "①", title: "AI 자동 판독 연계", purpose: "인공지능 자동화로 수작업 단축", sections: [{ heading: "내용", items: ["AI 자동 판독으로 육안 확인을 줄이고 처리 시간을 단축"] }] }] };
  assert.ok(!storiesOf(storyHintsOf(cardOf(["전파 점검 업무를 추진했다"], ax), [], [], NO_ACTUALS, 2026)).includes("AX 전환형"));
  assert.ok(storiesOf(storyHintsOf(cardOf(["AI 자동 판독과 자동화로 육안 확인·수작업을 줄여 처리 시간을 단축했다"], ax), [], [], NO_ACTUALS, 2026)).includes("AX 전환형"));
});

test("P1-2: 번호 갈래 ❶~❸ → ⑰ 핵심키워드 연결형, 점 갈래 「∙ (…)」 5갈래 → ⑩ 구분표 중심형, 번호 갈래 5개 → ⑩(⑰ 아님)", () => {
  assert.equal(top(["❶ 데이터 연계 확대", "❷ 현장 점검 강화", "❸ 이용자 안내 개선"].map((t, i) => `do.lines.${i} | ${t}`).join("\n")), "핵심키워드 연결형");
  assert.equal(top(["① (연계) 가", "② (점검) 나"].map((t, i) => `do.lines.${i} | ${t}`).join("\n")), "핵심키워드 연결형", "① (키워드) 표지도 번호 갈래");
  const dots = hintsOf(Array.from({ length: 5 }, (_, i) => `do.lines.${i} | ∙ (갈래${i + 1}) 내용`).join("\n"));
  assert.equal(dots[0]?.story, "구분표 중심형");
  assert.match(dots[0].why, /갈래 5개 이상/);
  const nums = hintsOf(["①", "②", "③", "④", "⑤"].map((m, i) => `do.lines.${i} | ${m} 내용`).join("\n"));
  assert.equal(nums[0]?.story, "구분표 중심형");
  assert.ok(!nums.some((h) => h.story === "핵심키워드 연결형"));
  assert.ok(!hintsOf("check.items.0 | ❶ 가\ncheck.items.1 | ❷ 나").some((h) => h.story === "핵심키워드 연결형"), "추진내용 줄이 아니면 세지 않음");
});

test("P1-2: ⑬~⑯ 신호 — 시범·확산 · 재점검·환류 · 위험·예방 · 데이터·정책 반영 낱말", () => {
  assert.equal(top("시범 운영 결과를 표준화해 전국으로 확산하고 정착시켰다"), "시범→확산형");
  assert.equal(top("재점검 결과를 환류해 이행 점검과 개선 과제를 관리했다"), "환류 개선형");
  assert.equal(top("위험 요인을 진단해 예방 조치와 안전 점검으로 사고를 줄였다"), "위험관리·안전형");
  assert.equal(top("데이터 수집과 데이터 분석 결과를 정책 반영하고 기준 마련에 썼다"), "데이터 기반 의사결정형");
});

test("P1-2: ⑳ 수혜 대상 낱말 3종 이상 → 대상별 맞춤형, 1종이면 아님", () => {
  assert.equal(top("중소기업·소상공인·취약계층마다 지원 방식을 달리했다"), "대상별 맞춤형");
  assert.ok(!hintsOf("중소기업 지원을 넓혔다").some((h) => h.story === "대상별 맞춤형"));
});

test("P1-2: 점수가 같으면 기본형 ★(⑨ ⑱ ① ⑰ ⑩)을 먼저, 나머지는 틀 번호 순", () => {
  const hs = hintsOf(["❶ 시범 운영", "❷ 표준화", "❸ 전국 확산"].map((t, i) => `do.lines.${i} | ${t}`).join("\n"));
  assert.deepEqual(hs.slice(0, 2).map((h) => [h.story, h.score]), [["핵심키워드 연결형", 3], ["시범→확산형", 3]], "⑰(★)이 번호가 앞선 ⑬보다 먼저");
});
