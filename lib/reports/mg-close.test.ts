// 닫는 추진성과 원장 보강(lib/reports/mg-close.ts) 시험 — 가짜 카드·가짜 글만 씀.

import assert from "node:assert/strict";
import { test } from "node:test";
import type { BlockOutput } from "./blocks.ts";
import type { Composition } from "./composition.ts";
import { planAdherence } from "./composition.ts";
import type { MgPart } from "./mg-types.ts";
import { type MgDraftContext, mgMarkers, verifyMgDraft } from "./mg-draft.ts";
import { ledgerOutcomeItems, ledgerOutcomeLines } from "./mg-close.ts";
import { cleanLine } from "./section.ts";

const baseCard = {
  id: "경영관리9/9-3",
  group: "경영관리9",
  taskNo: "9-3",
  title: "가짜 과제",
  overview: { checks: {} },
  feedback: { rows: [] },
  findings: { rows: [] },
  do: { lines: ["∙ 체계 개편"], monthly: [] },
  kpi: { rows: [] },
  outcome: { quantitative: [] as string[], qualitative: [] as string[] },
};
const withOutcome = (quantitative: string[], qualitative: string[] = []) => ({ ...baseCard, outcome: { quantitative, qualitative } });
const part = (key: string, evalNo: number): MgPart => ({ key, evalNo, evalTitle: `평가 ${evalNo}`, themeNo: 1, themeTitle: "대주제", mark: "가", title: "절", story: "", why: "" });
const ctx = (card: typeof baseCard): MgDraftContext => ({ unit: "MG-9", indicator: "지표", taskNo: "9-3", markers: mgMarkers(card), prior: [], evals: [3, 4] });
const pb = (label: string, at: string, kind = "bullets") => ({ kind: kind as "bullets", variant: "", label, purpose: "목적", cells: 1, materials: [], figures: [], at });
const plan: Composition = {
  version: 1, message: "", points: [], story: "", storyWhy: "", alternative: "", results: "", materials: [], memo: "",
  blocks: [pb("추진내용", "3.1.가"), pb("추진성과", "3.1.가"), pb("추진내용", "4.1.가")],
  mg: { indicator: "지표", parts: [part("3.1.가", 3), part("4.1.가", 4)] },
};
const blk = (b: Partial<BlockOutput>): BlockOutput => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b });
const run = (card: typeof baseCard, parts: Array<{ key: string; blocks: BlockOutput[] }>) =>
  verifyMgDraft({ caption: "", parts: parts.map((p) => ({ key: p.key, title: "절", blocks: p.blocks })) }, card, plan, ctx(card), "", "", 2026);
const labelsAt = (v: ReturnType<typeof run>, key: string) => (v.spec.blocks ?? []).filter((_, i) => v.spec.mg?.at[i] === key).map((b) => b.label);
const BOTH = [{ key: "3.1.가", blocks: [blk({ label: "추진내용", items: ["체계 개편 완료"] })] }, { key: "4.1.가", blocks: [blk({ label: "추진내용", items: ["둘째 절 내용"] })] }];

test("빠진 추진성과 블록을 원장 줄로 채움(구성안 자리, 수치 줄 먼저, 예정·목표 줄 뺌, 4줄까지)", () => {
  const card = withOutcome(["∙ 목표 100건 달성 예정", "∙ 교육 120명 수료", "∙ 만족도 4.5점 기록", "∙ 교육 120명 수료"], ["∙ 현장 호응 확대", "∙ 조직문화 개선", "∙ 추가 정성 줄"]);
  const v = run(card, BOTH);
  assert.deepEqual(labelsAt(v, "3.1.가"), ["추진내용", "추진성과"]);
  const b = (v.spec.blocks ?? []).find((x) => x.label === "추진성과")!;
  assert.equal(b.kind, "bullets");
  assert.deepEqual(b.items, ["교육 120명 수료", "만족도 4.5점 기록", "현장 호응 확대", "조직문화 개선"]);
  assert.ok(v.warnings.some((w) => w.startsWith("추진성과 보강: 집필이 비운 추진성과를 원장 성과 줄 4개로 채움")));
  assert.equal(labelsAt(v, "4.1.가").join(), "추진내용", "구성안에 추진성과가 없는 절은 그대로");
  assert.equal(v.unknownNumbers.length, 0);
});

test("성과 글이 없는 추진성과 블록(빈 블록·목표뿐)을 채움 — 블록 수는 그대로", () => {
  const card = withOutcome(["∙ 교육 120명 수료"]);
  for (const items of [[], ["목표 200명 달성 예정"]]) {
    const v = run(card, [{ key: "3.1.가", blocks: [blk({ label: "추진내용", items: ["개편"] }), blk({ label: "추진성과", items })] }, BOTH[1]]);
    const res = (v.spec.blocks ?? []).filter((x) => x.label === "추진성과");
    assert.equal(res.length, 1);
    assert.deepEqual(res[0].items, ["교육 120명 수료"]);
    assert.equal(labelsAt(v, "3.1.가").length, 2);
  }
});

test("이미 성과 줄이 있으면 그대로 둠", () => {
  const card = withOutcome(["∙ 교육 120명 수료"]);
  const v = run(card, [{ key: "3.1.가", blocks: [blk({ label: "추진내용", items: ["개편"] }), blk({ label: "추진성과", items: ["수료 120명"] })] }, BOTH[1]]);
  const res = (v.spec.blocks ?? []).filter((x) => x.label === "추진성과");
  assert.deepEqual(res.map((x) => x.items), [["수료 120명"]]);
  assert.ok(!v.warnings.some((w) => w.startsWith("추진성과 보강")));
});

test("원장에 쓸 줄이 없으면(예정·목표 줄뿐이어도) 넣지 않음", () => {
  for (const card of [baseCard, withOutcome(["∙ 목표 100건 예정"], ["∙ 내년 계획"])]) {
    const v = run(card, BOTH);
    assert.deepEqual(labelsAt(v, "3.1.가"), ["추진내용"]);
    assert.ok(!v.warnings.some((w) => w.startsWith("추진성과 보강")));
  }
});

test("구성안 추진성과가 stats면 stats 칸(head 빈 성과 문장)으로 넣고 구성안과 같은 순서로 맞음 — 빈 칸 경고 없음", () => {
  const card = withOutcome(["∙ 교육 120명 수료", "∙ 만족도 4.5점 기록"]);
  const statsPlan: Composition = { ...plan, blocks: [pb("추진내용", "3.1.가"), pb("추진성과", "3.1.가", "stats"), pb("추진내용", "4.1.가")] };
  for (const mid of [[], [blk({ kind: "stats", label: "추진성과", cells: [{ head: "", tag: "", bullets: ["목표 200명"], note: "" }] })]]) {
    const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["개편"] }), ...mid] }, { key: "4.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["둘째"] })] }] }, card, statsPlan, ctx(card), "", "", 2026);
    const b = (v.spec.blocks ?? []).find((x) => x.label === "추진성과")!;
    assert.equal(b.kind, "stats");
    assert.deepEqual(b.cells.map((c) => [c.head, c.bullets, c.note, c.tag]), [["", ["교육 120명 수료"], "", ""], ["", ["만족도 4.5점 기록"], "", ""]]);
    assert.deepEqual(planAdherence(statsPlan, v.spec.blocks ?? [], v.droppedShapes), { matched: 3, total: 3, same: true });
    assert.ok(!v.warnings.some((w) => w.startsWith("빈 칸")));
  }
});

test("구성안 추진성과가 bullets·stats 밖(chart)이면 넣지 않음", () => {
  const card = withOutcome(["∙ 교육 120명 수료"]);
  const chartPlan: Composition = { ...plan, blocks: [pb("추진내용", "3.1.가"), pb("추진성과", "3.1.가", "chart"), pb("추진내용", "4.1.가")] };
  const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["개편"] })] }] }, card, chartPlan, ctx(card), "", "", 2026);
  assert.deepEqual(labelsAt(v, "3.1.가"), ["추진내용"]);
});

// ---------------------------------------------------------------------------
// 2026-10-29 후속: 막대만 남은 추진성과 행 · 절마다 같은 보강 막기

const chartBlk = (label: string) => blk({ kind: "chart", label, title: "활용 건수", series: [{ label: "’25년", value: "120건" }, { label: "’26년", value: "300건" }] });
const twoPlan = (closeKinds: string[]): Composition => ({
  ...plan,
  blocks: [pb("추진내용", "3.1.가"), ...closeKinds.map((k) => pb("추진성과", "3.1.가", k)), pb("추진내용", "4.1.가")],
});

test("추진성과 행에 막대만 남으면 막대 앞에 원장 줄 글 블록(구성안의 그 절 글 블록 모양, 없으면 stats)을 넣어 [성과 문장 | 막대]로 그림", async () => {
  const { sectionDocument } = await import("./section-html.ts");
  const card = withOutcome(["∙ 활용 300건 달성", "∙ 만족도 4.5점 기록"]);
  for (const [kinds, want] of [[["stats", "chart"], "stats"], [["bullets", "chart"], "bullets"], [["chart"], "stats"]] as const) {
    const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["개편"] }), chartBlk("추진성과")] }, { key: "4.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["둘째"] })] }] }, card, twoPlan([...kinds]), ctx(card), "", "", 2026);
    const close = (v.spec.blocks ?? []).filter((b) => b.label === "추진성과");
    assert.deepEqual(close.map((b) => b.kind), [want, "chart"], `구성안 ${kinds.join("+")}`);
    const lines = want === "stats" ? close[0].cells.map((c) => c.bullets[0]) : close[0].items;
    assert.deepEqual(lines, ["활용 300건 달성", "만족도 4.5점 기록"]);
    assert.ok(v.warnings.some((w) => w.startsWith("추진성과 보강: 막대만 남은 추진성과 행 1곳의 왼쪽을 원장 성과 줄 2개로 채움")));
    const html = sectionDocument(v.spec, [], { year: 2026, generatedAt: "", model: "" });
    assert.match(html, /<div class="k-row2"><div>[\s\S]*?활용 <span class="k-nb">300건<\/span> 달성[\s\S]*?<\/div><figure class="k-chart/, "글 블록 왼쪽 · 막대 오른쪽");
  }
});

test("추진성과가 아닌 라벨 행에 막대만 있으면 글을 지어내지 않고 참고 경고(막대)만", () => {
  const card = withOutcome(["∙ 활용 300건 달성"]);
  const v = run(card, [{ key: "3.1.가", blocks: [blk({ label: "추진내용", items: ["개편"] }), chartBlk("활용 현황"), blk({ label: "추진성과", items: ["활용 300건 달성"] })] }, BOTH[1]]);
  assert.deepEqual(labelsAt(v, "3.1.가"), ["추진내용", "활용 현황", "추진성과"]);
  assert.ok(v.warnings.some((w) => w.startsWith("막대: 글 블록 없이 막대만 있는 행 1곳(활용 현황)")));
});

test("보강 원장 줄은 한 절에만 — 두 절이 같은 줄을 받지 않고, 다른 절 글에 같은 수치가 있는 줄은 건너뜀, 절 글과 겹치는 줄을 먼저", () => {
  const both: Composition = { ...plan, blocks: [pb("추진내용", "3.1.가"), pb("추진성과", "3.1.가"), pb("추진내용", "4.1.가"), pb("추진성과", "4.1.가")] };
  const card = withOutcome(["∙ 교육 120명 수료", "∙ 상담 건수 45건 처리", "∙ 공모전 31건 접수"], ["∙ 상담 창구 일원화로 응답 단축"]);
  const parts = [
    { key: "3.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["교육 과정 개편"] })] },
    { key: "4.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["상담 창구 일원화", "공모전 31건 접수 완료"] })] },
  ];
  const v = verifyMgDraft({ caption: "", parts }, card, both, ctx(card), "", "", 2026);
  const close = (key: string) => (v.spec.blocks ?? []).find((b, i) => b.label === "추진성과" && v.spec.mg?.at[i] === key)?.items ?? [];
  const a = close("3.1.가");
  const b = close("4.1.가");
  assert.ok(a.length && b.length, "두 절 모두 채움");
  assert.deepEqual(a.filter((x) => b.includes(x)), [], "같은 줄을 두 절에 주지 않음");
  assert.ok(!a.includes("공모전 31건 접수"), "다른 절(4.1.가) 글에 같은 수치(31건)가 있는 줄은 3.1.가에 안 줌");
  assert.equal(a[0], "교육 120명 수료", "3.1.가는 그 절 글(교육)과 겹치는 줄을 먼저");
  assert.ok(b.includes("상담 창구 일원화로 응답 단축"), "4.1.가는 그 절 글(상담 창구)과 겹치는 줄을 받음");
});

test("남은 원장 줄이 없으면 그 절은 보강하지 않고(빈 상자 없음) 참고 경고", () => {
  const both: Composition = { ...plan, blocks: [pb("추진내용", "3.1.가"), pb("추진성과", "3.1.가"), pb("추진내용", "4.1.가"), pb("추진성과", "4.1.가")] };
  const card = withOutcome(["∙ 교육 120명 수료"]);
  const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["교육 과정 개편"] })] }, { key: "4.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["둘째 절 내용"] })] }] }, card, both, ctx(card), "", "", 2026);
  assert.deepEqual(labelsAt(v, "3.1.가"), ["추진내용", "추진성과"]);
  assert.deepEqual(labelsAt(v, "4.1.가"), ["추진내용"]);
  assert.ok(v.warnings.some((w) => w.startsWith("추진성과 보강: 원장 성과 줄이 다른 절 글에 이미 쓰여(같은 수치·같은 문장) 절 1개는 채우지 않음")));
});

test("그 절 글에 같은 문장이 이미 있는 원장 줄은 그 절 보강에서도 건너뜀(같은 수치는 먼저 고름)", () => {
  const card = withOutcome(["∙ 현장 상담 창구를 하나로 모아 민원 응답 시간을 크게 줄임", "∙ 교육 120명 수료"]);
  const v = run(card, [{ key: "3.1.가", blocks: [blk({ label: "추진내용", items: ["현장 상담 창구를 하나로 모아 민원 응답 시간을 크게 줄임"] })] }, BOTH[1]]);
  assert.deepEqual((v.spec.blocks ?? []).find((b) => b.label === "추진성과")?.items, ["교육 120명 수료"]);
});

test("원장 성과 재료 목록(절 성과 재료): 정량 → 월별 실적 수치 줄 → 정성, 수치 유무, 「계획 대비」는 결과라 남기고 예정 줄은 뺌", () => {
  const card = {
    ...withOutcome(["∙ 신규 등록 31건(계획대비 3배)", "∙ 목표 100건 달성 예정"], ["∙ 활용 중심으로 기준 전환"]),
    do: { lines: [], monthly: [{ period: "1월~8월", items: [{ table: { rows: [[{ th: true, lines: ["[`26.8.월]"] }, { th: true, lines: ["[`26.9.월](예정)"] }], [{ th: false, lines: ["교육 과정(7건)"] }, { th: false, lines: ["평가 대응(2건)"] }]] } }] }] },
  };
  assert.deepEqual(ledgerOutcomeItems(card, cleanLine, Infinity), [
    { text: "신규 등록 31건(계획대비 3배)", from: "quantitative", figure: true },
    { text: "교육 과정(7건)(’26.8 기준)", from: "monthly", figure: true },
    { text: "활용 중심으로 기준 전환", from: "qualitative", figure: false },
  ]);
  assert.deepEqual(ledgerOutcomeLines(card, cleanLine, 2), ["신규 등록 31건(계획대비 3배)", "교육 과정(7건)(’26.8 기준)"]);
});

test("추진성과 보강은 구성안이 그 절 추진성과에 배정한 재료가 가리키는 원장 줄부터 — 다른 보강 절에 배정된 줄은 그 절 몫", () => {
  const card = withOutcome(["∙ 교육 120명 수료", "∙ 상담 건수 45건 처리", "∙ 공모전 31건 접수"]);
  const mat = (id: string, text: string) => ({ id, kind: "figure" as const, text, when: "", source: "카드", quote: text, found: true });
  const both: Composition = {
    ...plan,
    materials: [mat("m1", "공모전 31건 접수"), mat("m2", "교육 120명 수료")],
    blocks: [pb("추진내용", "3.1.가"), { ...pb("추진성과", "3.1.가"), materials: ["m1"] }, pb("추진내용", "4.1.가"), { ...pb("추진성과", "4.1.가"), materials: ["m2"] }],
  };
  // 3.1.가 글은 교육(120명)과 겹치지만 구성안은 그 절에 공모전을, 4.1.가에 교육을 배정함
  const parts = [
    { key: "3.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["교육 과정 개편"] })] },
    { key: "4.1.가", title: "절", blocks: [blk({ label: "추진내용", items: ["둘째 절 내용"] })] },
  ];
  const v = verifyMgDraft({ caption: "", parts }, card, both, ctx(card), "", "", 2026);
  const close = (key: string) => (v.spec.blocks ?? []).find((b, i) => b.label === "추진성과" && v.spec.mg?.at[i] === key)?.items ?? [];
  // 배정이 없으면 3.1.가는 그 절 글과 겹치는 교육 줄을 먼저 골랐을 것(위 「절 글과 겹치는 줄을 먼저」 시험) — 보인 순서는 원장 순서
  assert.ok(close("3.1.가").includes("공모전 31건 접수"), "배정 줄 먼저");
  assert.ok(!close("3.1.가").includes("교육 120명 수료"), "다른 절(4.1.가)에 배정된 줄은 안 가져감");
  assert.ok(close("4.1.가").includes("교육 120명 수료"));
});
