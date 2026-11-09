// 갈래 점검 C1~C3(lib/reports/branch-checks.ts — 경평 초안 프레임워크 확장 계획 P2) 시험.
// 지키는 것: 번호 일치(⑰·④·①)·갈래 수(⑱)는 주 틀이 대상 틀일 때만 참고 경고, 로드맵 계획 열(C3)은 틀과 상관없이 막힘 경고,
// 대상이 아니거나 어긋남이 없으면 경고 없음(집필·다시 점검 경고 목록이 예전 그대로), 경영관리 초안은 보지 않음.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block, BlockCell } from "./blocks.ts";
import { branchCountWarning, branchWarnings, figuresOf, markerOf, numberLinkWarnings, roadmapPlanWarning, sameKeyword } from "./branch-checks.ts";
import { type ReportSectionSpec, type SectionContext, type SectionOutput, recheckSection, verifySection } from "./section.ts";
import { warningLevel } from "./warning-levels.ts";

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
  ...over,
});
const card = { id: "x", taskNo: "1-가", title: "t" };

// ---------------------------------------------------------------------------
// 번호 표지·키워드

test("markerOf: 흰·검은 동그라미 번호·Step N·N단계를 읽고 나머지는 null", () => {
  assert.deepEqual(markerOf("❷ 데이터 개방"), { n: 2, family: "black", mark: "❷", rest: "데이터 개방" });
  assert.deepEqual(markerOf("➊ 개방"), { n: 1, family: "black", mark: "➊", rest: "개방" });
  assert.deepEqual(markerOf("③현장 안착"), { n: 3, family: "white", mark: "③", rest: "현장 안착" });
  assert.equal(markerOf("➂ 확산")?.family, "white", "➀~➉도 흰 동그라미");
  assert.deepEqual(markerOf("Step 2. 시범 운영"), { n: 2, family: "step", mark: "Step 2", rest: "시범 운영" });
  assert.deepEqual(markerOf("1단계 기반 구축"), { n: 1, family: "step", mark: "1단계", rest: "기반 구축" });
  for (const t of ["추진과제", "’26년 확산", "2026 확산", "10개 기관", ""]) assert.equal(markerOf(t), null, t);
});

test("sameKeyword: 빈칸·문장부호·괄호 속을 걷고 한쪽이 다른 쪽을 품으면 같음, 한쪽이 비면 같음", () => {
  assert.ok(sameKeyword("공공데이터 개방 확대", "데이터 개방"));
  assert.ok(sameKeyword("데이터·개방", "데이터 개방(’26)"));
  assert.ok(sameKeyword("", "아무 말"));
  assert.ok(!sameKeyword("데이터 개방", "현장 안착"));
});

// ---------------------------------------------------------------------------
// C1 ⑰ 핵심키워드 연결형

const overview = blk({ kind: "cards", variant: "plain", label: "추진과제", cells: [cell("❶ 데이터 개방", ["a"]), cell("❷ 현장 안착", ["b"]), cell("❸ 제도 정비", ["c"])] });
const branch = (label: string, cells: BlockCell[] = [cell("① 수요조사"), cell("② 설계"), cell("③ 구축"), cell("④ 운영")]) => blk({ kind: "steps", variant: "row", label, cells });

test("C1 ⑰: 개요 번호·키워드가 갈래 행 라벨과 맞으면 경고 없음(갈래 행 안 하위 단계 ①~④는 다른 갈래라 안 셈)", () => {
  const s = spec({ story: "핵심키워드 연결형", blocks: [overview, branch("❶ 데이터 개방"), branch("❷ 현장 안착"), branch("❸ 제도")] });
  assert.deepEqual(numberLinkWarnings(s), []);
});

test("C1 ⑰: 번호 빠짐·키워드 다름·개요에 없는 번호를 한 줄로(참고)", () => {
  const s = spec({ story: "핵심키워드 연결형", blocks: [overview, branch("❶ 데이터 개방"), branch("❷ 현장 확산"), branch("❹ 성과 공유")] });
  const w = numberLinkWarnings(s);
  assert.equal(w.length, 1);
  assert.match(w[0], /^번호 일치: 「추진과제」/);
  assert.match(w[0], /❷ 「현장 안착」 ↔ 뒤 「현장 확산」/);
  assert.match(w[0], /❸ 「제도 정비」이\(가\) 뒤 블록에 없음/);
  assert.match(w[0], /❹는 개요에 없음/);
  assert.equal(warningLevel(w[0]), "info");
});

test("C1 ⑰: 행 머리(rows[].key)·칸 머리(cells[].head)도 갈래 표지로 읽음", () => {
  const table = blk({ kind: "table", variant: "result", label: "갈래별 실적", cells: [cell("❶ 데이터 개방"), cell("❷ 현장 안착"), cell("❸ 제도 정비")] });
  assert.deepEqual(numberLinkWarnings(spec({ story: "핵심키워드 연결형", blocks: [overview, table] })), []);
  const cmp = blk({ kind: "compare", variant: "table", rows: [{ key: "❶ 개방", before: [], after: [] }, { key: "❷ 안착", before: [], after: [] }, { key: "❸ 정비", before: [], after: [] }] });
  assert.deepEqual(numberLinkWarnings(spec({ story: "핵심키워드 연결형", blocks: [overview, cmp] })), []);
});

test("C1: 다른 틀이거나 번호 개요가 없거나 경영관리 초안이면 경고 없음", () => {
  const bad = [overview, branch("❶ 다른 말")];
  assert.deepEqual(numberLinkWarnings(spec({ story: "기존→개선형", blocks: bad })), []);
  assert.deepEqual(numberLinkWarnings(spec({ story: "핵심키워드 연결형", blocks: [blk({ kind: "cards", cells: [cell("데이터"), cell("현장")] }), branch("❶ 다른 말")] })), []);
  assert.deepEqual(numberLinkWarnings(spec({ story: "핵심키워드 연결형", blocks: bad, mg: { parts: [], at: [] } as never })), []);
});

// ---------------------------------------------------------------------------
// C1 ① 단계 전개형 — 단계 이름 = 세부 실적 이름

test("C1 ①: 단계 칸(칩 Step N 포함)과 뒤 블록의 같은 번호 머리 이름이 다르면 알림, 뒤에 번호가 없으면 조용함", () => {
  const steps = blk({ kind: "steps", variant: "row", label: "추진내용", cells: [cell("기반 구축", [], { tag: "Step 1" }), cell("시범 운영", [], { tag: "Step 2" }), cell("전국 확산", [], { tag: "Step 3" })] });
  const detail = blk({ kind: "table", variant: "result", label: "단계별 실적", cells: [cell("Step 1 기반 구축"), cell("Step 2 시범 적용")] });
  const w = numberLinkWarnings(spec({ story: "단계 전개형", blocks: [steps, detail] }));
  assert.equal(w.length, 1);
  assert.match(w[0], /Step 2 「시범 운영」 ↔ 뒤 「시범 적용」/);
  assert.doesNotMatch(w[0], /Step 3/, "단계 전개형은 빠진 번호를 세지 않음");
  assert.deepEqual(numberLinkWarnings(spec({ story: "단계 전개형", blocks: [steps, blk({ kind: "table", variant: "result", cells: [cell("기반"), cell("시범")] })] })), []);
});

// ---------------------------------------------------------------------------
// C1 ④ 현장 목소리형 — 말풍선 → 해법 1:1

const voices = (heads: string[]) => blk({ kind: "voices", label: "국민 의견수렴", cells: heads.map((h) => cell(h, ["원문"])) });
const fixes = (keys: string[]) => blk({ kind: "compare", variant: "table", label: "추진노력", rows: keys.map((key) => ({ key, before: ["a"], after: ["b"] })) });

test("C1 ④: 말풍선 수 ≠ 다음 표 행 수, 번호가 다르면 알림 — 같으면 없음", () => {
  const story = "현장 목소리형";
  assert.deepEqual(numberLinkWarnings(spec({ story, blocks: [voices(["① 주민", "② 상인"]), fixes(["① 측정 공개", "② 상담 창구"])] })), []);
  assert.deepEqual(numberLinkWarnings(spec({ story, blocks: [voices(["① 주민", "② 상인"]), fixes(["➊ 측정 공개", "➋ 상담 창구"])] })), [], "표지 모양만 달라도 번호 값이 같으면 맞음");
  assert.deepEqual(numberLinkWarnings(spec({ story, blocks: [voices(["주민", "상인"]), fixes(["측정 공개", "상담 창구"])] })), [], "번호 없는 말풍선은 칸 수만");
  const count = numberLinkWarnings(spec({ story, blocks: [voices(["① 주민", "② 상인", "③ 학부모"]), fixes(["① 측정 공개", "② 상담 창구"])] }));
  assert.deepEqual(count, ["번호 일치: 말풍선 3개와 다음 「추진노력」 2행이 1:1이 아닙니다 — 목소리마다 해법 행 하나로 맞춥니다."]);
  const nums = numberLinkWarnings(spec({ story, blocks: [voices(["① 주민", "② 상인"]), fixes(["① 측정 공개", "상담 창구"])] }));
  assert.equal(nums.length, 1);
  assert.match(nums[0], /말풍선 ①②과 다음 「추진노력」 행 머리 ①\(번호 없음\)의 번호가 다릅니다/);
  assert.deepEqual(numberLinkWarnings(spec({ story, blocks: [voices(["① 주민"]), fixes(["① a", "② b"])] })), [], "목소리 하나는 보지 않음");
});

// ---------------------------------------------------------------------------
// C2 ⑱ 문제·원인별 해결형

const causes = blk({ kind: "cards", variant: "plus", label: "문제·원인", cells: [cell("① 인력 부족", ["a"]), cell("② 장비 노후", ["b"]), cell("③ 절차 복잡", ["c"])] });
const actions = (n: number) => blk({ kind: "table", variant: "chevron", label: "원인별 조치", items: ["원인", "조치", "결과"], cells: Array.from({ length: n }, (_, i) => cell(`원인 ${i + 1}`, ["조치", "결과"])) });

test("C2 ⑱: 원인 칸 수 = 조치 표 행 수 = 추진성과 갈래 수면 없음, 다르면 한 줄(참고)", () => {
  const story = "문제·원인별 해결형";
  assert.equal(branchCountWarning(spec({ story, blocks: [causes, actions(3)], results: ["a", "b", "c"] })), null);
  const w = branchCountWarning(spec({ story, blocks: [causes, actions(2)], results: ["a", "b", "c"] }));
  assert.equal(w, "갈래 수: 원인 3개(「문제·원인」)·조치 2행(「원인별 조치」)·추진성과 3갈래가 다릅니다 — 원인마다 조치 한 행·성과 한 갈래로 맞춥니다(근거에 없는 갈래는 지어내지 않음)");
  assert.equal(warningLevel(w!), "info");
  // 3칸 추진성과는 칸 수로, 전후 비교(diag)는 행 수로
  const diag = blk({ kind: "compare", variant: "diag", label: "대응", rows: [1, 2, 3].map((i) => ({ key: `${i}`, before: ["a"], after: ["b"] })) });
  const cards3 = [1, 2].map((i) => ({ tag: `${i}`, headline: "h", figure: "f" }));
  assert.match(branchCountWarning(spec({ story, blocks: [causes, diag], results: ["x"], resultCards: cards3 }))!, /조치 3행\(「대응」\)·추진성과 2갈래/);
  // 추진성과가 비면 원인·조치만
  assert.equal(branchCountWarning(spec({ story, blocks: [causes, actions(3)] })), null);
});

test("C2: 다른 틀·원인 칸 없음은 경고 없음", () => {
  assert.equal(branchCountWarning(spec({ story: "이슈→해결책형", blocks: [causes, actions(2)], results: ["a"] })), null);
  assert.equal(branchCountWarning(spec({ story: "문제·원인별 해결형", blocks: [actions(2)], results: ["a"] })), null);
});

// ---------------------------------------------------------------------------
// C3 로드맵 계획 열

const ITEMS = ["구분", "Step 1(’25) 기반 마련", "Step 2(’26) 확산", "Step 3(’27~) 고도화"];
const road = (cells: BlockCell[]) => blk({ kind: "table", variant: "roadmap", label: "전체 로드맵", items: ITEMS, cells, year: 2026 });
const ROAD = road([cell("추진내용", ["체계 설계", "12개 기관 확산", "50개 기관 전면 적용"]), cell("기대 효과", ["", "처리 30% 단축", "처리 45% 단축"])]);

test("figuresOf: 수 + 단위 첫 글자, 한 자리 정수·연월일은 뺌", () => {
  assert.deepEqual(
    figuresOf("’27년 50개 기관·45% 단축, 2027년 3건, 11월 1.5배, 1,200억원").map((f) => `${f.num}${f.unit}`),
    ["50개", "45%", "1.5배", "1200억"],
  );
});

test("C3: 계획 열(’27~) 수치가 추진성과·결과 줄에 실적처럼 나오면 막힘 경고", () => {
  const s = spec({ story: "로드맵형", blocks: [ROAD, blk({ kind: "steps", variant: "row", label: "올해 추진", cells: [cell("확산", ["a"], { note: "처리 시간 45% 단축" })] })], results: ["50개 기관에 전면 적용해 처리 시간 단축"] });
  const w = roadmapPlanWarning(s);
  assert.ok(w);
  assert.match(w!, /^로드맵 계획: 「전체 로드맵」 표의 계획 열\(Step 3\(’27…\) 수치 50개·45%가 실적 줄에 실적처럼 나옴/);
  assert.equal(warningLevel(w!), "block");
});

test("C3: 올해·지난 열 수치, 계획·목표라고 밝힌 줄, 계획 표지 있는 줄, 다른 단위는 안 걸림", () => {
  const ok = (results: string[]) => roadmapPlanWarning(spec({ story: "로드맵형", blocks: [ROAD], results }));
  assert.equal(ok(["12개 기관 확산, 처리 30% 단축"]), null, "올해 열 수치");
  assert.equal(ok(["’27년 50개 기관 목표로 확산 기반 마련"]), null, "목표라고 밝힘(PLAN_BAR)");
  assert.equal(ok(["50개 기관 전면 적용 예정"]), null, "계획 표지(planMarker)");
  assert.equal(ok(["만족도 50점 달성"]), null, "단위가 다름(개 ↔ 점)");
  // 계획 아닌 열에도 같은 수치가 있으면 대조하지 않음
  const both = road([cell("추진내용", ["12개 기관", "12개 기관 확산", "12개 기관 고도화"])]);
  assert.equal(roadmapPlanWarning(spec({ blocks: [both], results: ["12개 기관 확산"] })), null);
});

test("C3: 틀과 상관없이 로드맵 표가 있으면 봄, 머리에 목표가 든 열도 계획 열, 보고서 연도를 모르면 목표 열만", () => {
  const s = spec({ story: "단계 전개형", blocks: [ROAD], results: ["50개 기관 전면 적용"] });
  assert.ok(roadmapPlanWarning(s), "다른 틀에서도");
  const noYear = blk({ kind: "table", variant: "roadmap", label: "로드맵", items: ["구분", "’25", "’26", "’26 목표"], cells: [cell("기관", ["10개", "20개", "80개"])] });
  assert.match(roadmapPlanWarning(spec({ blocks: [noYear], results: ["80개 기관 참여"] }))!, /계획 열\(’26 목표\)/);
  assert.equal(roadmapPlanWarning(spec({ blocks: [noYear], results: ["20개 기관 참여"] })), null);
  assert.equal(roadmapPlanWarning(spec({ blocks: [ROAD], results: ["50개 기관"], mg: { parts: [], at: [] } as never })), null, "경영관리 초안은 안 봄");
});

// ---------------------------------------------------------------------------
// 집필·다시 점검에 들어감

test("recheckSection: 대상 틀·로드맵이면 새 경고가 들어가고, 아니면 경고 목록이 예전 그대로(새 앞머리 없음)", () => {
  const roadSpec = spec({ story: "로드맵형", blocks: [{ ...ROAD, year: undefined }], results: ["50개 기관에 전면 적용"] });
  const r = recheckSection(roadSpec, card, "", 2026);
  assert.ok(r.warnings.some((w) => w.startsWith("로드맵 계획: ")), "다시 점검이 보고서 연도를 넣고 계획 열을 봄");
  const plain = spec({ story: "기존→개선형", blocks: [overview, branch("❶ 다른 말"), causes, actions(1)], results: ["a"] });
  const w = recheckSection(plain, card, "", 2026).warnings;
  assert.ok(!w.some((x) => /^(번호 일치|갈래 수|로드맵 계획): /.test(x)));
  assert.deepEqual(branchWarnings(plain), []);
});

test("verifySection: 집필 검증 경고에도 들어감(⑰ 번호 빠짐)", () => {
  const ctx: SectionContext = { business: { no: 1, name: "b" }, task: { no: "1-1", title: "t" }, mark: "가", markers: [], module: 1, head: "all" };
  const outBlock = (b: Block) => ({ ...b, evidence: "", figures: [] });
  const out = { title: "제목", story: "핵심키워드 연결형", blocks: [overview, branch("❶ 데이터 개방"), branch("❷ 현장 안착")].map(outBlock), results: ["a"], resultCards: [], resultChart: { title: "", series: [], badge: "" }, resultBand: "", caption: "" } as unknown as SectionOutput;
  const v = verifySection(out, card, ctx);
  assert.ok(v.warnings.some((w) => /^번호 일치: .*❸ 「제도 정비」이\(가\) 뒤 블록에 없음/.test(w)), v.warnings.join("\n"));
  assert.ok(!v.composeIssues.some((x) => x.includes("번호 일치")), "자동 고치기 사유에는 안 넣음");
});
