// 저장된 과제별 초안의 「없는 숫자」 다시 세기(lib/reports/draft-recount.ts, 2026-11-16) — 저장값(unknown_numbers·warnings)을 믿지 않고 다시 셈,
// 정상 초안(저장값 = 다시 센 값)은 화면·내려받기가 그대로, 근거가 적을수록 더 많이 잡힘(안전한 쪽).
import assert from "node:assert/strict";
import { test } from "node:test";
import type { Block } from "./blocks.ts";
import { recountDraft, recountUnknown, unknownView, unknownWarnings } from "./draft-recount.ts";
import { recheckMgSection } from "./mg-draft.ts";
import type { MgPart } from "./mg-types.ts";
import { type ReportSectionSpec, recheckSection } from "./section.ts";
import { sectionDocument, sectionHtml } from "./section-html.ts";
import { warningLevel } from "./warning-levels.ts";

const block = (over: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });

const spec = (items: string[]): ReportSectionSpec => ({
  version: 3,
  card: { id: "주요사업3/3-나", taskNo: "3-나", title: "가짜 지원사업" },
  business: { no: 3, name: "가짜 대상사업" },
  task: { no: "3-1", title: "가짜 실행과제", bp: false },
  sub: { mark: "나", title: "현장 지원 확대", markers: [] },
  rows: [],
  blocks: [block({ label: "추진성과", items })],
  results: [],
  caption: "",
  module: 1,
});

const card = { taskNo: "3-나", title: "가짜 지원사업", outcome: { quantitative: ["현장 컨설팅 1,234건"] } };
const draft = spec(["현장 컨설팅 1,234건 지원", "만족도 87.5% 달성"]);
const KNOWN = "결과보고: 참여 기관 345곳";

test("저장값이 비어 있어도 다시 세어 없는 숫자를 칠하고, 경고에 없는 숫자 줄(막힘)을 다시 넣음", () => {
  const r = recountDraft(draft, card, KNOWN, { unknown: [], warnings: [] });
  assert.deepEqual(r.unknown, ["87.5%"]);
  assert.deepEqual(r.added, ["87.5%"]);
  assert.equal(r.warnings.length, 1);
  assert.match(r.warnings[0], /^카드·첨부 자료에 없는 숫자 1개\(저장된 점검 결과에 없던 1개를 다시 셈/);
  assert.equal(warningLevel(r.warnings[0]), "block", "없는 숫자 줄은 막힘 등급(앞머리 없이 같은 글 규칙)");
  // 미리보기·내려받기는 다시 센 값으로 붉은 점선
  assert.match(sectionHtml(draft, r.unknown), /<span class="k-unv"[^>]*>(<span class="k-nb">)?87\.5%</);
  assert.doesNotMatch(sectionHtml(draft, []), /k-unv/, "저장값만 믿으면 점선이 사라짐(고치기 전 동작)");
  // 근거가 하나도 없으면 다시 점검과 같은 말(「카드」)
  assert.match(recountDraft(draft, card, "", { unknown: null, warnings: [] }).warnings[0], /^카드에 없는 숫자 1개/);
});

test("정상 초안(저장값 = 다시 센 값): 칠할 숫자·경고·HTML 출력이 저장값 그대로", () => {
  const saved = recheckSection(draft, card, KNOWN);
  const r = recountDraft(draft, card, KNOWN, { unknown: saved.unknownNumbers, warnings: saved.warnings });
  assert.deepEqual(r.unknown, saved.unknownNumbers);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.warnings, saved.warnings);
  assert.equal(sectionHtml(draft, r.unknown, { blockMarks: true, repeats: true }), sectionHtml(draft, saved.unknownNumbers, { blockMarks: true, repeats: true }));
  const meta = { year: 2026, generatedAt: "2026-11-16 10:00", model: "m" };
  assert.equal(sectionDocument(draft, r.unknown, meta), sectionDocument(draft, saved.unknownNumbers, meta));
});

test("저장 뒤 근거가 늘어 다시 센 값에서 빠진 숫자는 저장값대로 남고(예전 화면 그대로), 저장값의 다른 숫자도 그대로 더함", () => {
  const r = recountDraft(draft, card, `${KNOWN}\n만족도 87.5%`, { unknown: ["87.5%", "9,999"], warnings: ["판면: 어림 300mm", "카드·첨부 자료에 없는 숫자 2개 — 원자료로 확인하거나 지워 주세요: 87.5%, 9,999"] });
  assert.deepEqual(r.unknown, ["87.5%", "9,999"]);
  assert.deepEqual(r.added, []);
  assert.deepEqual(r.warnings, ["판면: 어림 300mm", "카드·첨부 자료에 없는 숫자 2개 — 원자료로 확인하거나 지워 주세요: 87.5%, 9,999"]);
});

test("unknownWarnings: 저장값에 없던 숫자가 있으면 기존 없는 숫자 줄 자리를 바꾸고(다시 센 것 먼저), 다른 경고 순서는 그대로", () => {
  const v = unknownView(["1,111"], ["1,111", "87.5%"]);
  assert.deepEqual(v, { unknown: ["1,111", "87.5%"], added: ["87.5%"] });
  const w = unknownWarnings(["문장: 가", "카드에 없는 숫자 1개 — 원자료로 확인하거나 지워 주세요: 1,111", "판면: 나"], v, "카드");
  assert.equal(w.length, 3);
  assert.equal(w[0], "문장: 가");
  assert.match(w[1], /^카드에 없는 숫자 2개\(저장된 점검 결과에 없던 1개를 다시 셈 — .*\) — 원자료로 확인하거나 지워 주세요: 87\.5%, 1,111$/);
  assert.equal(w[2], "판면: 나");
  assert.deepEqual(unknownView("{}", []), { unknown: [], added: [] }, "배열이 아닌 저장값은 빈 값");
});

test("근거가 적을수록 없는 숫자가 더 많이 잡힘(단조 — 근거 일부로 센 값 ⊇ 전부로 센 값)", () => {
  const s = spec(["목표 1,000건 대비 1,234건(123.4%) 달성", "참여 기관 345곳·만족도 87.5%", "전년 900건에서 1,234건으로 334건 증가"]);
  const full = "목표 1,000건\n참여 기관 345곳\n만족도 87.5%\n전년 900건";
  const lines = full.split("\n");
  const all = new Set(recountUnknown(s, card, full));
  for (let mask = 0; mask < 1 << lines.length; mask++) {
    const part = lines.filter((_, i) => mask & (1 << i)).join("\n");
    const sub = new Set(recountUnknown(s, card, part));
    for (const x of all) assert.ok(sub.has(x), `근거 일부(${part.replace(/\n/g, " / ")})로 센 값에 ${x}가 있어야 함`);
  }
  assert.deepEqual([...all], [], "근거 전부면 셈한 값(123.4%·334)까지 근거");
});

test("경영관리 초안은 경영관리 다시 점검(절 제목 글 포함)으로 셈", () => {
  const part: MgPart = { key: "1.1.가", evalNo: 1, evalTitle: "가짜 평가내용", themeNo: 1, themeTitle: "가짜 대주제", mark: "가", title: "만족도 92점 달성", story: "", why: "" };
  const mg: ReportSectionSpec = { ...spec(["교육 1,234건 운영"]), mg: { indicator: "가짜 지표", parts: [part], at: ["1.1.가"] } };
  assert.deepEqual(recountUnknown(mg, card, ""), recheckMgSection(mg, card, "").unknownNumbers);
  assert.ok(recountUnknown(mg, card, "").includes("92"), "절 제목의 숫자도 셈");
  assert.ok(!recountUnknown(spec(["교육 1,234건 운영"]), card, "").includes("92"));
});
