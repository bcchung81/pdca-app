// 작성 규칙 점검 C4~C8(lib/reports/writing-checks.ts — 경평 초안 프레임워크 확장 계획 P6) 시험.
// 지키는 것: 규칙마다 걸리는 사례와 오탐 막이(날짜·연도·%p·근거에 있는 낱말·직함·「과제로」 속 제로 등), C6만 막힘·나머지 참고,
// 어긋남이 없으면 경고 없음(집필·다시 점검 경고 목록이 예전 그대로), 경영관리 초안은 보지 않음, 자동 고치기 사유에는 안 들어감.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block, BlockCell } from "./blocks.ts";
import { type ReportSectionSpec, type SectionContext, type SectionOutput, recheckSection, verifySection } from "./section.ts";
import { warningLevel } from "./warning-levels.ts";
import { aiBaselineWarning, compareBaseWarning, hasFigure, hypeWordWarning, monthDay, percentPointWarning, titleFigureWarning, writingWarnings } from "./writing-checks.ts";

const cell = (head: string, bullets: string[] = [], x: Partial<BlockCell> = {}): BlockCell => ({ head, tag: "", bullets, note: "", ...x });
const blk = (b: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const spec = (over: Partial<ReportSectionSpec> = {}): ReportSectionSpec => ({
  version: 3,
  card: { id: "x", taskNo: "1-가", title: "t" },
  business: { no: 1, name: "b" },
  task: { no: "1-1", title: "t", bp: false },
  sub: { mark: "가", title: "제목", markers: [] },
  rows: [],
  results: [],
  caption: "",
  module: 1,
  blocks: [],
  ...over,
});
const sub = (title: string) => ({ mark: "가", title, markers: [] });
const card = { id: "x", taskNo: "1-가", title: "t" };
const MG = { mg: { parts: [], at: [] } as never };

// ---------------------------------------------------------------------------
// 수치·날짜

test("hasFigure·monthDay: 단위 붙은 수·두 자리 수·소수는 수치, 연월일·과제 번호·띄어 쓴 월.일은 아님", () => {
  for (const s of ["연구 2건 착수", "오차 0.7% 확인", "요구사항 110건 구현", "1.5배 확대", "7.6만 명"]) assert.ok(hasFigure(s), s);
  for (const s of ["보고서 제출(’26.1~10월)", "국민안전(#72) 뒷받침", "7.6 협의·10.13 구성", "설명회(10.28) 개최", "’26년 3월 시행"]) assert.ok(!hasFigure(s), s);
  assert.ok(monthDay("7", "6", "", false));
  assert.ok(monthDay("10", ".13", "구", true), "띄어 쓴 다음 낱말");
  assert.ok(!monthDay("7", "6", "만", false), "붙여 쓴 단위");
  assert.ok(!monthDay("0", "7", "%", false));
  assert.ok(!monthDay("13", "5", "", false), "13월은 없음");
});

// ---------------------------------------------------------------------------
// C4 제목 수치

test("C4: 소항목 제목 수치가 본문·추진성과에 없으면 참고 경고, 있으면 없음", () => {
  const body = [blk({ label: "추진내용", items: ["처리 절차 정비"] })];
  const w = titleFigureWarning(spec({ sub: sub("처리시간 45% 단축으로 민원 편의 향상"), blocks: body, results: ["처리시간 단축"] }));
  assert.match(w!, /^제목 수치: 45%\(소항목 제목\)가 본문·추진성과에 한 번도 안 나옵니다/);
  assert.equal(warningLevel(w!), "info");
  assert.equal(titleFigureWarning(spec({ sub: sub("처리시간 45% 단축"), blocks: body, results: ["처리시간 ^{’25년}20일 → ^{’26년}11일(45% 단축)"] })), null, "추진성과에 같은 값");
  assert.equal(titleFigureWarning(spec({ sub: sub("처리시간 45% 단축"), blocks: [blk({ items: ["평균 처리시간 45% 줄임"] })] })), null, "본문 블록에 같은 값");
});

test("C4: 블록 제목 수치는 그 블록 칸·다른 블록·추진성과에서 찾고, 연도·월.일·한 자리 수·자리표시는 안 봄", () => {
  const t = blk({ kind: "table", label: "점검 결과", title: "점검 1,200건 결과", cells: [cell("점검", ["1,200건"])] });
  assert.equal(titleFigureWarning(spec({ blocks: [t] })), null, "블록 칸에 같은 값(쉼표 무관)");
  const lost = titleFigureWarning(spec({ blocks: [blk({ kind: "table", label: "점검 결과", title: "점검 1,500건 결과", cells: [cell("점검", ["1,200건"])] })] }));
  assert.match(lost!, /1,500건\(「점검 결과」 블록 제목\)/);
  for (const title of ["’26년 확산 경과", "7.6 협의·10.13 구성", "3대 추진전략", "목표 【확인: 이용자 수 120만 명】 달성", "2026년 로드맵"]) {
    assert.equal(titleFigureWarning(spec({ blocks: [blk({ label: "가", title, items: ["내용"] })] })), null, title);
  }
});

// ---------------------------------------------------------------------------
// C5 비교 기준

test("C5: 수치만 있고 비교 기준 없는 추진성과 줄이 둘 이상이면 참고 경고", () => {
  const w = compareBaseWarning(spec({ results: ["예측 오차 0.7% 확인(’26.8)", "제도개선 연구 2건 착수(’26.6~7)", "요구사항 ^{’25년}80건 → ^{’26년}110건"] }));
  assert.match(w!, /^비교 기준: 추진성과 2줄이 수치만 있고 비교 기준/);
  assert.equal(warningLevel(w!), "info");
  assert.equal(compareBaseWarning(spec({ results: ["예측 오차 0.7% 확인", "요구사항 110건 구현"].slice(0, 1) })), null, "한 줄은 안 걸림");
});

test("C5: 기준·변화 낱말·두 연도·에서 …로·자리표시 줄·수치 없는 줄은 안 셈", () => {
  const ok = [
    "’25년 대비 12%p 증가",
    "처리기간 30% 단축",
    "목표 100% 달성",
    "’25년 72건, ’26년 90건",
    "수작업 검사에서 AI 판독 1만 건으로 전환",
    "기존 6단계 → 4단계",
    "안전사고 【확인: ’26년 건수】",
    "AI 프로토타입 개발, PoC 보고서 제출(’26.1~10월)",
  ];
  assert.equal(compareBaseWarning(spec({ results: ok })), null);
  assert.equal(compareBaseWarning(spec({ resultCards: [{ tag: "효율", headline: "검사 120건", figure: "만족 95점" }, { tag: "확산", headline: "기관 15곳", figure: "" }] })), compareBaseWarning(spec({ results: ["효율 검사 120건 만족 95점", "확산 기관 15곳"] })), "3칸은 칩·결과·수치를 한 줄로");
  assert.equal(compareBaseWarning(spec({ results: ["오차 0.7%", "연구 2건"], ...MG })), null, "경영관리는 안 봄");
});

// ---------------------------------------------------------------------------
// C6 %p 혼동

test("C6: 「A%에서 B%로 C% 증가」의 C가 B−A면 막힘 경고", () => {
  const w = percentPointWarning(spec({ results: ["합격률 30%에서 45%로 15% 상승"] }));
  assert.match(w!, /^비율 차: 「30%→45% … 15% 상승」 — 두 비율의 차이는 %p로 씁니다/);
  assert.equal(warningLevel(w!), "block");
  assert.ok(percentPointWarning(spec({ blocks: [blk({ items: ["이용률 ^{’25년}62.5% → ^{’26년}70.0%(+7.5%)"] })] })), "윗첨자 시점·부호·블록 글");
  assert.ok(percentPointWarning(spec({ results: ["오납부율 0.85% → 0.57%(0.28% 감소)"] })), "감소도");
});

test("C6: %p로 쓴 것·증감률로 맞게 쓴 것·증감 낱말 없는 %·비율 짝이 아닌 것은 안 걸림", () => {
  const ok = [
    "’25년 대비 12%p 증가",
    "합격률 30%에서 45%로 15%p 상승",
    "합격률 30% → 45%(50% 증가)",
    "합격률 40%에서 60%로 20%포인트 상승",
    "합격률 30% → 45%, 만족도 15% 수준",
    "처리건수 100건에서 115건으로 15% 증가",
    "합격률 50%에서 75%로 25%p 상승",
  ];
  for (const r of ok) assert.equal(percentPointWarning(spec({ results: [r] })), null, r);
  assert.equal(percentPointWarning(spec({ results: ["합격률 30%에서 45%로 15% 상승"], ...MG })), null, "경영관리는 안 봄");
});

// ---------------------------------------------------------------------------
// C7 과장 낱말

test("C7: 초안의 과장 낱말이 근거 글에 없으면 참고 경고, 근거에 같은 낱말이 있으면 없음", () => {
  const s = spec({ sub: sub("국내 최초 AI 판독 도입으로 고소작업 제로화"), results: ["안전사고 근절"] });
  const w = hypeWordWarning(s, "카드: AI 판독 시스템 도입, 고소작업 대체");
  assert.match(w!, /^과장 낱말: 「최초」·「근절」·「제로」이\(가\) 근거 글/);
  assert.equal(warningLevel(w!), "info");
  assert.equal(hypeWordWarning(s, "공공기관 최초 도입, 고소작업 제로, 안전사고 근절 목표"), null);
  assert.match(hypeWordWarning(s, "공공기관 최초 도입")!, /「근절」·「제로」/, "근거에 있는 낱말만 뺌");
});

test("C7: 직함·「과제로」 속 제로·「지역대학」 속 역대·제로트러스트·자리표시 속 낱말은 안 셈", () => {
  const s = spec({
    sub: sub("’26년 신규 과제로 추진"),
    blocks: [blk({ items: ["최고경영자 주재 점검", "지역대학 협력 체계로 전환", "제로트러스트 보안 적용", "전무이사 보고", "실적 【확인: 역대 최고 실적 여부】"] })],
  });
  assert.equal(hypeWordWarning(s, ""), null);
  assert.equal(hypeWordWarning(spec({ results: ["역대 최고 실적"], ...MG }), ""), null, "경영관리는 안 봄");
});

// ---------------------------------------------------------------------------
// C8 AI 기준선

test("C8: AI 낱말이 든 수치 있는 추진성과 줄에 기준선이 없으면 참고 경고(AX 전환형은 수치 있는 줄 전부)", () => {
  const w = aiBaselineWarning(spec({ story: "기존→개선형", results: ["AI 판독 1,200건 처리", "현장 검사 3,000건"] }));
  assert.match(w!, /^AI 기준선: AI 성과 1줄에 기준선/);
  assert.equal(warningLevel(w!), "info");
  const ax = aiBaselineWarning(spec({ story: "AX 전환형", results: ["업무시간 30% 단축", "검사 처리 1,200건", "자동화 체계 마련"] }));
  assert.match(ax!, /AI 성과 2줄/, "AX 전환형: 수치 있는 줄 전부(증가·단축은 기준선이 아님)");
});

test("C8: 기준선(기존·도입 전·대비·→·에서 …로·두 연도)이 있거나, 수치가 없거나, 자리표시 줄이거나, AI 낱말 없는 줄(다른 틀)은 안 걸림", () => {
  const ok = [
    "AI 판독 ^{’25년}30,706건 → ^{’26년}36,000건",
    "AI 도입 전 대비 처리시간 40% 단축",
    "수작업에서 AI 판독 1만 건으로 전환",
    "AI 추정 모델 프로토타입 개발",
    "AI 탐지 120건 【확인: 도입 전 건수】",
    "현장 검사 3,000건",
    "AICC 상담 1,200건",
  ];
  assert.equal(aiBaselineWarning(spec({ story: "기존→개선형", results: ok })), null);
  assert.equal(aiBaselineWarning(spec({ story: "AX 전환형", results: ["업무시간 30% 단축"], ...MG })), null, "경영관리는 안 봄");
});

// ---------------------------------------------------------------------------
// 집필·다시 점검에 들어감

test("writingWarnings: 어긋남이 없는 초안은 빈 배열", () => {
  const s = spec({ sub: sub("무선국 개설 절차 간소화"), story: "기존→개선형", blocks: [blk({ label: "추진내용", items: ["절차 정비"] })], results: ["개설 절차 ^{기존}6단계 → ^{도입 후}4단계", "설명회(’26.10.28) 개최로 안내"] });
  assert.deepEqual(writingWarnings(s, ""), []);
});

test("recheckSection·verifySection: 새 경고가 들어가고 자동 고치기 사유에는 안 들어감", () => {
  const s = spec({ sub: sub("합격률 45% 달성"), blocks: [blk({ label: "추진내용", items: ["합격률 30%에서 45%로 15% 상승"] })], results: ["역대 최고 합격률"] });
  const w = recheckSection(s, card, "", 2026).warnings;
  assert.ok(w.some((x) => x.startsWith("비율 차: ")), w.join("\n"));
  assert.ok(w.some((x) => x.startsWith("과장 낱말: ")), "근거 글(카드·첨부)에 없는 낱말");
  assert.ok(!recheckSection(s, card, "역대 최고 합격률 기록", 2026).warnings.some((x) => x.startsWith("과장 낱말: ")), "첨부 글(extraText)이 근거");

  const ctx: SectionContext = { business: { no: 1, name: "b" }, task: { no: "1-1", title: "t" }, mark: "가", markers: [], module: 1, head: "all" };
  const out = { title: "처리시간 45% 단축", story: "기존→개선형", blocks: [{ ...blk({ label: "추진내용", items: ["절차 정비"] }), evidence: "", figures: [] }], results: ["처리시간 단축"], resultCards: [], resultChart: { title: "", series: [], badge: "" }, resultBand: "", caption: "" } as unknown as SectionOutput;
  const v = verifySection(out, card, ctx);
  assert.ok(v.warnings.some((x) => x.startsWith("제목 수치: 45%")), v.warnings.join("\n"));
  assert.ok(![...v.composeIssues, ...v.proseIssues, ...v.titleIssues].some((x) => x.includes("제목 수치")), "자동 고치기 사유에는 안 넣음");
});
