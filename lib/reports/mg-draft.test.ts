// 경영관리 경평 초안 집필(lib/reports/mg-draft.ts)·렌더(section-html.ts mgBody)·프롬프트 채우기 시험(2026-10-09 R3).

import assert from "node:assert/strict";
import { test } from "node:test";
import { reportDraftPromptsMg, reportOutlinePromptsMg } from "../prompts/sets.ts";
import { fillFrom } from "../prompts/template.ts";
import type { BlockOutput } from "./blocks.ts";
import type { Composition } from "./composition.ts";
import { type MgDraftContext, MG_VOLUME_BAND, mgCardAsOf, mgFindingParts, mgMarkers, mgMaterialsPrompt, mgPlanPrompt, mgVolumePrompt, mgVolumeWarning, recheckMgSection, verifyMgDraft } from "./mg-draft.ts";
import { mgSpecHeight } from "./business-layout.ts";
import type { MgPriorSection } from "./mg-outline.ts";
import { sectionHtml } from "./section-html.ts";

const card = {
  id: "경영관리9/9-3",
  group: "경영관리9",
  taskNo: "9-3",
  title: "지속가능한 조직·인력 운영 기반 마련",
  overview: { checks: { new: true } },
  feedback: { rows: [{ self: ["∙ '25 자체평가 직무교육 120명"], plan: ["∙ 개선"] }] },
  findings: { rows: [{ finding: ["∙ 교육훈련 체계 미흡 지적"], plan: ["∙ 체계 개편"] }] },
  do: { lines: ["∙ 직무교육 체계 개편 (7월)"], monthly: [] },
  kpi: { rows: [] },
  outcome: { quantitative: [], qualitative: [] },
};
const sec = (evalNo: number, themeNo: number, mark: string, text: string): MgPriorSection => ({ key: `k/${evalNo}/${themeNo}/${mark}`, evalNo, evalTitle: `평가내용 ${evalNo}`, themeNo, themeTitle: `대주제 ${themeNo}`, mark, title: `${mark} 절`, markers: [], text, page: null });
const ctx: MgDraftContext = { unit: "MG-9", indicator: "조직 및 인적자원관리", taskNo: "9-3", markers: mgMarkers(card), prior: [sec(3, 1, "가", "’25년 교육 85회 운영"), sec(4, 1, "가", "넷째 글"), sec(1, 1, "가", "첫째 글")], evals: [3, 4] };

const plan: Composition = {
  version: 1,
  message: "메시지",
  points: ["논점"],
  story: "",
  storyWhy: "",
  alternative: "",
  results: "",
  materials: [{ id: "m1", kind: "fact", text: "직무교육 체계 개편", when: "", source: "카드 do.lines.0", quote: "직무교육 체계 개편", found: true }],
  memo: "",
  blocks: [
    { kind: "bullets", variant: "", label: "추진배경", purpose: "왜", cells: 1, materials: ["m1"], figures: [], at: "3.1.가" },
    { kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1"], figures: [], at: "3.1.가" },
    { kind: "bullets", variant: "", label: "추진내용", purpose: "무엇", cells: 1, materials: ["m1"], figures: [], at: "4.1.가", by: "human", memo: "짧게" },
  ],
  mg: {
    indicator: "조직 및 인적자원관리",
    parts: [
      { key: "3.1.가", evalNo: 3, evalTitle: "평가내용 3", themeNo: 1, themeTitle: "대주제 1", mark: "가", title: "직무교육 개편", story: "배경·내용·성과형", why: "카드 추진내용" },
      { key: "4.1.가", evalNo: 4, evalTitle: "평가내용 4", themeNo: 1, themeTitle: "대주제 1", mark: "가", title: "둘째", story: "", why: "" },
    ],
  },
};

const blk = (b: Partial<BlockOutput>): BlockOutput => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b });

test("마커: 지적 및 개선방안 칸에 지적이 있으면 지적개선, 26년 신규 체크면 신규", () => {
  assert.deepEqual(mgMarkers(card), ["지적개선", "신규"]);
  assert.deepEqual(mgMarkers({ findings: { rows: [{ finding: ["-"], plan: [] }] } }), [], "빈 표시만 있는 지적 칸은 지적 없음");
  assert.deepEqual(mgMarkers({ findings: { rows: [{ finding: ["∙ 지적사항 없음"], plan: [] }] } }), [], "「지적사항 없음」 줄은 지적이 아님(2026-10-14)");
});

test("요청 글(구성안·집필 공용): 자리표시가 남지 않고, 전년 골격 전체 + 추천 평가내용 + 고른 평가내용의 전년 절 글만 넣음(상한을 넘으면 제목만)", () => {
  const p = reportDraftPromptsMg().prompts;
  const text = mgMaterialsPrompt(p, card, ctx, 2026, [3], [{ name: "a.hwp", text: "첨부 글", relation: "card" }], [{ group: "criteria", key: "c1", title: "편람", where: "", text: "기준" }], { today: "2026-10-09", kpi: [], monthly: [] });
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /「조직 및 인적자원관리」 · 과제관리카드 9-3/);
  assert.match(text, /앱이 붙일 마커: 지적개선·신규/);
  assert.match(text, /평가내용 1\. 평가내용 1/, "골격은 지표 전체");
  assert.match(text, /추천 평가내용.*평가내용 3·평가내용 4/);
  assert.match(text, /’25년 교육 85회 운영/, "고른 평가내용(3)의 절 글");
  assert.doesNotMatch(text, /넷째 글/, "고르지 않은 평가내용(4)의 글은 안 넣음");
  assert.match(text, /\[첨부 1\] a\.hwp/);
  assert.match(text, /\[평가 기준\]/);
  const big = mgMaterialsPrompt(p, card, { ...ctx, prior: [sec(3, 1, "가", "가".repeat(39_000)), sec(3, 1, "나", "나".repeat(5_000))] }, 2026, [3]);
  assert.match(big, /나 절 — \(글이 길어 제목만/);
});

test("구성안 요청·시스템 프롬프트: 자리표시가 남지 않음, 집필 시스템은 문체·규칙 자리만", () => {
  const op = reportOutlinePromptsMg().prompts;
  assert.doesNotMatch(fillFrom(op, "system", "system", { skeleton: "## 판정표" }), /\{\{\w+\}\}/);
  assert.deepEqual([...new Set([...op.system.system.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))], ["skeleton"], "구성안 시스템의 자리표시는 골격 판정뿐");
  assert.doesNotMatch(fillFrom(op, "request", "task", { maxParts: 8, maxBlocks: 32 }), /\{\{\w+\}\}/);
  assert.doesNotMatch(fillFrom(op, "request", "memo", { memo: "메모" }), /\{\{\w+\}\}/);
  const dp = reportDraftPromptsMg().prompts;
  assert.deepEqual([...new Set([...dp.system.system.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]))].sort(), ["rules", "style"]);
  assert.match(dp.system.system, /전략수립형/, "경영관리 이야기 틀을 끼움");
});

test("승인된 구성안 글: 절 열쇠·절 이름·틀, 블록은 전체 번호로, 사람이 고른 블록 표시, 자리표시 없음", () => {
  const text = mgPlanPrompt(reportDraftPromptsMg().prompts, plan, ctx);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /절 \[3\.1\.가\] 평가내용 3 · 대주제 1 · 가\. 직무교육 개편 · 이야기 틀 배경·내용·성과형/);
  assert.match(text, /3\. \[추진내용\] bullets/);
  assert.match(text, /담당자 메모: 짧게/);
  assert.ok(text.indexOf("[3.1.가]") < text.indexOf("[4.1.가]"));
});

test("AI 답 정리: 절 열쇠로 구성안 절에 맞춰 구성안 순서로 펼침(spec.mg.at), 모르는 절·안 쓴 절·추진성과로 닫지 않은 절 경고, 근거에 없는 숫자, 원문 없는 인용 뺌", () => {
  const out = {
    caption: "도식",
    parts: [
      { key: "4.1.가", title: "가. 둘째 고친 제목", blocks: [blk({ label: "추진내용", items: ["직무교육 체계 개편으로 **역량 강화**"] })] },
      { key: "3.1.가", title: "직무교육 개편", blocks: [blk({ label: "추진배경", items: ["’25년 교육 85회 운영 기반 확대"] }), blk({ kind: "quotes", label: "", cells: [{ head: "", tag: "", bullets: ["지어낸 인용 문장입니다 정말로"], note: "" }] }), blk({ kind: "stats", label: "추진성과", cells: [{ head: "777명", tag: "", bullets: ["교육 인원"], note: "" }, { head: "85회", tag: "", bullets: ["교육 운영"], note: "" }] })] },
      { key: "9.9.가", title: "모르는 절", blocks: [blk({ items: ["x"] })] },
    ],
  };
  const v = verifyMgDraft(out, card, plan, ctx, ctx.prior.map((s) => s.text).join("\n"), "", 2026);
  assert.deepEqual(v.spec.mg?.at, ["3.1.가", "3.1.가", "4.1.가"], "구성안 절 순서로");
  assert.deepEqual(v.spec.blocks?.map((b) => b.label), ["추진배경", "추진성과", "추진내용"]);
  assert.equal(v.spec.mg?.parts[1].title, "둘째 고친 제목", "절 표지는 떼고 AI 제목");
  assert.equal(v.spec.business.name, "조직 및 인적자원관리");
  assert.deepEqual(v.spec.sub.markers, ["지적개선", "신규"]);
  assert.equal(v.spec.fit, undefined, "판면 어림 없음");
  assert.deepEqual(v.unknownNumbers, ["777"], "근거(카드·전년 절)에 없는 숫자만");
  assert.ok(v.warnings.some((w) => w.includes("구성안에 없는 절 1개")));
  assert.ok(v.warnings.some((w) => w.includes("4.1.가") || (w.includes("둘째 고친 제목") && w.includes("추진성과"))), "4.1.가 절은 추진성과로 닫지 않음");
  assert.ok(!v.spec.blocks?.some((b) => b.kind === "quotes"), "원문 없는 인용 블록은 뺌");
  // 쓰지 않은 절
  const partial = verifyMgDraft({ caption: "", parts: [out.parts[1]] }, card, plan, ctx, "", "", 2026);
  assert.ok(partial.warnings.some((w) => w.includes("승인한 절 2개 중 1개")));
});

test("다시 점검(블록 고치기 뒤): 판면 없이 숫자·추진성과 닫기를 다시 셈", () => {
  const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "t", blocks: [blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), blk({ kind: "stats", label: "추진성과", cells: [{ head: "120명", tag: "", bullets: ["교육 인원"], note: "" }, { head: "85회", tag: "", bullets: ["교육 운영"], note: "" }] })] }] }, card, plan, ctx, "", "", 2026);
  const edited = { ...v.spec, blocks: [{ ...v.spec.blocks![0], items: ["직무교육 999명 개편"] }, v.spec.blocks![1]], fit: { total: 1, budget: 1 } };
  const r = recheckMgSection(edited, card, ctx.prior.map((s) => s.text).join("\n"), 2026);
  assert.equal(r.spec.fit, undefined);
  assert.deepEqual(r.unknownNumbers, ["999"]);
  // 근거의 괄호 속 날짜는 아는 숫자(2026-10-10 계획서 §10 E2 — 주요사업과 같은 규칙)
  const dated = { ...v.spec, blocks: [{ ...v.spec.blocks![0], items: ["직무교육 개편 보고 6.23"] }, v.spec.blocks![1]] };
  const prior = ctx.prior.map((s) => s.text).join("\n");
  assert.deepEqual(recheckMgSection(dated, card, `${prior}\n교육 개편 보고(6.23.)`, 2026).unknownNumbers, []);
  assert.deepEqual(recheckMgSection(dated, card, prior, 2026).unknownNumbers, ["6.23"]);
});

test("렌더: 평가내용 상자 → 대주제 띠 → 절 제목 → 그 절 블록, 블록 경로·data-block은 전체 순번, 마커는 첫 대주제 띠에", () => {
  const out = { caption: "", parts: [{ key: "3.1.가", title: "직무교육 개편", blocks: [blk({ label: "추진배경", items: ["첫 블록 글"] }), blk({ kind: "stats", label: "추진성과", cells: [{ head: "120명", tag: "", bullets: ["교육 인원"], note: "" }, { head: "85회", tag: "", bullets: ["교육 운영"], note: "" }] })] }, { key: "4.1.가", title: "둘째", blocks: [blk({ label: "추진내용", items: ["셋째 블록 글"] })] }] };
  const { spec } = verifyMgDraft(out, card, plan, ctx, "", "", 2026);
  const html = sectionHtml(spec, [], { blockMarks: true, editMarks: true });
  const i3 = html.indexOf("평가내용3");
  const i4 = html.indexOf("평가내용4");
  assert.ok(i3 > 0 && i4 > i3, "평가내용 상자 둘이 순서대로");
  assert.match(html, /<h5 class="k-sub">가\. 직무교육 개편<\/h5>/);
  assert.match(html, /data-block="2"/, "둘째 절 블록은 전체 순번 2");
  assert.match(html, /data-t="blocks\.2\.items\.0"/, "고치기 경로도 전체 순번");
  assert.equal((html.match(/k-mark|k-marker|지적개선/g) ?? []).length > 0, true);
  assert.doesNotMatch(html, /대상사업/, "주요사업 머리 없음");
});

test("지적개선 표지 자리(2026-10-15): 카드 지적 행과 가장 겹치는 절의 대주제 띠에, 겹침이 약하면 첫 띠(예전 그대로), 「지적사항 없음」뿐이면 표지 없음, 필드 없는 spec은 예전 출력과 같음", () => {
  const themes = [
    { key: "2.1.가", themeTitle: "성과평가체계 고도화", title: "분기별 실적 점검과 저성과부서 코칭", item: "분기별 계량실적 점검 회의 운영" },
    { key: "2.2.가", themeTitle: "전략 연계 성과지표 정렬", title: "설립 목적 반영 지표 재정비", item: "직무 특성을 반영한 지표 재정비" },
    { key: "2.3.가", themeTitle: "적합성 검증을 통한 수용성 제고", title: "KPI 적합성 평가 등급 세분화로 변별력 강화", item: "적합성 평가 1·2등급 집중 해소를 위한 상대 비교 검증 도입" },
  ];
  const plan3: Composition = {
    ...plan,
    blocks: themes.map((x) => ({ ...plan.blocks[0], at: x.key })),
    mg: { indicator: "조직 및 인적자원관리", parts: themes.map((x, i) => ({ key: x.key, evalNo: 2, evalTitle: "평가내용 2", themeNo: i + 1, themeTitle: x.themeTitle, mark: "가", title: x.title, story: "", why: "" })) },
  };
  const out = { caption: "", parts: themes.map((x) => ({ key: x.key, title: x.title, blocks: [blk({ label: "추진내용", items: [x.item] })] })) };
  const withFinding = (finding: string[]) => ({ ...card, overview: { checks: { new: false } }, findings: { rows: [{ finding, plan: ["∙ 개선"] }] } });
  const run = (c: typeof card) => verifyMgDraft(out, c, plan3, { ...ctx, markers: mgMarkers(c) }, "", "", 2026).spec;
  const bands = (html: string) => [...html.matchAll(/<h4 class="k-task">.*?<\/h4>/g)].map((m) => m[0]);
  const hit = run(withFinding(["∙ 부서평가 적합성 평가 결과가 1·2등급에 집중되어 변별력 미흡"]));
  assert.deepEqual(hit.mg?.finding, ["2.3.가"], "셋째 대주제 절");
  const b = bands(sectionHtml(hit));
  assert.ok(!b[0].includes("지적개선") && !b[1].includes("지적개선") && b[2].includes("지적개선"), "표지는 셋째 대주제 띠에만");
  assert.equal((sectionHtml(hit).match(/지적개선/g) ?? []).length, 1);
  // 겹침이 약함 → 필드 없음, 첫 띠(예전 그대로)
  const weak = run(withFinding(["∙ 재난안전 훈련의 실효성 미흡"]));
  assert.equal(weak.mg?.finding, undefined);
  assert.ok(bands(sectionHtml(weak))[0].includes("지적개선"));
  // 「지적사항 없음」뿐 → 마커도 자리도 없음
  const none = run(withFinding(["∙ 지적사항 없음"]));
  assert.deepEqual(none.sub.markers, []);
  assert.deepEqual(mgFindingParts(none, withFinding(["∙ 지적사항 없음"])), []);
  assert.doesNotMatch(sectionHtml(none), /지적개선/);
  // 필드 없는 예전 초안: 예전 출력 그대로(첫 띠 끝에 BP·지적개선 순서, 다른 띠·절 제목에는 표지 없음 — 실제 초안 14건을 이 변경 전 렌더러와 바이트 대조함, 2026-10-15)
  const old = { ...hit, task: { ...hit.task, bp: true }, mg: { ...hit.mg!, finding: undefined } };
  delete old.mg.finding;
  const legacy = sectionHtml(old);
  assert.equal((legacy.match(/class="mk /g) ?? []).length, 2);
  assert.match(bands(legacy)[0], /BP<\/span><span class="mk mk--dark">지적개선<\/span><\/h4>$/, "예전처럼 첫 띠에 BP·지적개선");
  assert.ok(!bands(legacy)[2].includes("지적개선"));
  // 사업 조판에서 첫 대주제를 이미 그렸어도 옮긴 표지는 셋째 띠에, BP는 다음에 그리는 첫 머리(절 제목)에
  const cont = sectionHtml({ ...hit, task: { ...hit.task, bp: true } }, [], { mgCont: { eval: true, theme: true } });
  assert.match(cont, /<h5 class="k-sub">가\. 분기별 실적 점검과 저성과부서 코칭<span class="mk mk--bp"/);
  assert.ok(bands(cont)[1].includes("지적개선"), "그려진 띠 중 둘째 = 셋째 대주제");
  // 다시 점검(블록 고치기 뒤)도 같은 규칙으로 다시 정하고, 지적과 겹치던 글이 사라지면 필드를 지움
  assert.deepEqual(recheckMgSection(hit, withFinding(["∙ 부서평가 적합성 평가 결과가 1·2등급에 집중되어 변별력 미흡"]), "", 2026).spec.mg?.finding, ["2.3.가"]);
  const legacyRecheck = recheckMgSection(old, withFinding(["∙ 부서평가 적합성 평가 결과가 1·2등급에 집중되어 변별력 미흡"]), "", 2026).spec;
  assert.deepEqual(legacyRecheck.mg?.finding, ["2.3.가"], "필드 없던 초안도 다시 점검 때 정해짐");
  const blank = { ...hit, mg: { ...hit.mg!, parts: hit.mg!.parts.map((p) => ({ ...p, title: "제목", themeTitle: "대주제" })) }, blocks: hit.blocks!.map((x) => ({ ...x, items: ["다른 글"] })) };
  assert.equal(recheckMgSection(blank, withFinding(["∙ 부서평가 적합성 평가 결과가 1·2등급에 집중되어 변별력 미흡"]), "", 2026).spec.mg?.finding, undefined);
});

test("올해 실적 자리표시 상한: 경영관리는 절마다 2개(절 4개면 8개 — 주요사업 소항목 상한 4보다 큼), 넘으면 경고", () => {
  const keys = ["3.1.가", "3.1.나", "3.2.가", "3.2.나"];
  const plan4: Composition = { ...plan, blocks: keys.map((at) => ({ ...plan.blocks[0], at })), mg: { indicator: "지표", parts: keys.map((key, i) => ({ ...plan.mg!.parts[0], key, themeNo: 1 + Math.floor(i / 2), mark: i % 2 ? "나" : "가" })) } };
  const run = (perPart: number) =>
    verifyMgDraft({ caption: "", parts: keys.map((key, p) => ({ key, title: "t", blocks: [blk({ label: "추진배경", items: [Array.from({ length: perPart }, (_, i) => `【확인: 절${p} 지표${i}】`).join(" ")] })] })) }, card, plan4, ctx, "", "", 2026).warnings;
  assert.ok(!run(2).some((w) => w.includes("자리표시가")), "절 4개 × 2 = 8개는 상한 안");
  assert.ok(run(3).some((w) => w.includes("자리표시가 12개입니다") && w.includes("8개까지만")), "절 4개 × 3 = 12개는 넘음");
});

test("경영관리 시스템 프롬프트(구성안·집필·블록 고치기)에는 주요사업 전용 도식 고르기·그림 통계가 없고 경영관리 고르기·표 머리 줄 틀이 있음, 주요사업은 그대로", async () => {
  const { reportBlockPrompts, reportBlockPromptsMg, reportDraftPrompts, reportOutlinePrompts } = await import("../prompts/sets.ts");
  const mgSystems = [reportOutlinePromptsMg().prompts.system.system, reportDraftPromptsMg().prompts.system.system, reportBlockPromptsMg().prompts.system.system];
  for (const sys of mgSystems) {
    for (const bad of ["같은 주요사업", "반쪽 소항목", "119~126쪽"]) assert.ok(!sys.includes(bad), `경영관리 프롬프트에 「${bad}」`);
    assert.match(sys, /## 블록 사전/);
    assert.match(sys, /## 도식 고르기\(경영관리\)/);
    assert.match(sys, /구분 \| 추진내용 \| 추진실적/, "표 머리 줄 틀(경영관리 프레임워크 FW-T04)");
    assert.match(sys, /소주제[^\n]*subhead/, "절 안 소주제 묶음(분석 §8.7 — 52절 중 13절)은 subhead로 나눔");
  }
  for (const sys of [reportOutlinePrompts().prompts.system.system, reportDraftPrompts().prompts.system.system, reportBlockPrompts().prompts.system.system]) {
    assert.match(sys, /## 블록 사전/);
    assert.match(sys, /## 도식 고르기\n/);
    assert.match(sys, /같은 주요사업/);
  }
});

// ---------------------------------------------------------------------------
// 2026-10-12 사용자 결정 D1(분량 목표 + 경고)·D2(지표별 「추진성과」 닫기 관례)·집필 점검 보강

const strictPrior = [sec(3, 1, "가", "추진배경 | 배경\n\n추진성과 | ∙ 7분 → 1분"), sec(4, 1, "가", "추진내용 | 내용\n\n추진성과 | ∙ 결과"), sec(1, 1, "", "대주제 본문(절 없음 — 닫기 셈에서 뺌)")];
const strictCtx: MgDraftContext = { ...ctx, prior: strictPrior };
const statsOut = (label = "추진성과") => blk({ kind: "stats", label, cells: [{ head: "120명", tag: "", bullets: ["교육 인원"], note: "" }, { head: "85회", tag: "", bullets: ["교육 운영"], note: "" }] });

test("승인된 구성안 글(D1·D2): 닫기 관례 한 줄·블록마다 글 한도(칸 폭 한 줄 글자 수)·칸 늘리지 않음, 배정이 있을 때만 분량 목표(블록 영역 mm·절당·블록당)", () => {
  const p = reportDraftPromptsMg().prompts;
  const loose = mgPlanPrompt(p, plan, ctx);
  assert.match(loose, /닫기 관례: 이 지표\(「조직 및 인적자원관리」\)의 2025 보고서는 절마다 닫는 모양이 다릅니다/);
  assert.match(loose, /1\. \[추진배경\] bullets — 왜 · 칸 1개\(늘리지 않음\) · 글 한도 불릿 1줄 이하 · 한 줄 약 \d+자/);
  assert.match(loose, /2\. \[추진성과\] stats — 결과 · 칸 2개\(늘리지 않음\) · 글 한도 칸마다 한 줄 약 \d+자/);
  assert.match(loose, /칸 수·불릿 줄 수를 늘리지 않고/);
  assert.doesNotMatch(loose, /분량 목표/, "배정이 없으면 분량 목표 없음");
  const strict = mgPlanPrompt(p, plan, { ...strictCtx, pages: 1.5 });
  assert.doesNotMatch(strict, /\{\{\w+\}\}/);
  assert.match(strict, /절 2개가 모두 라벨 「추진성과」 행으로 닫혔습니다/);
  const m = /분량 목표: 목차·쪽 배정이 이 카드에 준 1\.5쪽\(약 383mm[^)]*\)\. 이 구성안\(절 2개·블록 3개\)은 머리\(평가내용 상자·대주제 띠·절 제목 줄 약 (\d+)mm\)를 빼면 블록 영역이 약 (\d+)mm — 절당 약 (\d+)mm/.exec(strict);
  assert.ok(m, "분량 목표 줄");
  assert.equal(Number(m[1]) + Number(m[2]), 383, "머리 + 블록 영역 = 배정 높이");
  assert.equal(Number(m[3]), Math.round(Number(m[2]) / 2));
  assert.equal(mgPlanPrompt(p, plan, { ...ctx, pages: 0 }).includes("분량 목표"), false, "0쪽은 목표 없음");
});

test("구성안 요청 분량 목표(D1): 배정 쪽 · 판면 높이 · 블록 수 감 · 절 수별 블록 영역 — 배정이 없으면 빈 글", () => {
  const op = reportOutlinePromptsMg().prompts;
  assert.equal(mgVolumePrompt(op, null), "");
  assert.equal(mgVolumePrompt(op, undefined), "");
  const v = mgVolumePrompt(op, 1.5);
  assert.doesNotMatch(v, /\{\{\w+\}\}/);
  assert.match(v, /이 카드에 준 1\.5쪽/);
  assert.match(v, /이 카드는 약 383mm/);
  assert.match(v, /블록은 모두 9개 안팎/, "쪽당 6개(planBlockCap)");
  const rows = [...v.matchAll(/절 (\d)개 → 블록 영역 약 (\d+)mm, 절당 약 (\d+)mm/g)].map((x) => x.slice(1).map(Number));
  assert.deepEqual(rows.map((r) => r[0]), [3, 4, 5], "1.5쪽이면 쪽당 2~3절 언저리");
  assert.ok(rows[0][1] > rows[1][1] && rows[1][1] > rows[2][1], "절이 늘면 머리(절 제목 줄)만큼 영역이 줄어듦");
});

test("분량 경고(D1): 어림이 배정 쪽 × 255mm의 ±25% 밖일 때만 — 경계(정확히 25%)는 경고 없음, 배정이 없으면 없음", () => {
  assert.equal(MG_VOLUME_BAND, 0.25);
  assert.equal(mgVolumeWarning(318.75, 1), null, "+25% 정확히는 안");
  assert.equal(mgVolumeWarning(191.25, 1), null, "−25% 정확히는 안");
  assert.match(mgVolumeWarning(320, 1) ?? "", /^분량: 어림 320mm\(약 1\.3쪽\) — 배정 1쪽\(작성분량 기준\) 대비 \+25% — /);
  assert.match(mgVolumeWarning(593, 1.5) ?? "", /^분량: 어림 593mm\(약 2\.3쪽\) — 배정 1\.5쪽\(작성분량 기준\) 대비 \+55% — .*줄이거나/, "13-4 실측(593mm / 1.5쪽)");
  assert.match(mgVolumeWarning(190, 1) ?? "", /대비 -25%.*보태/);
  assert.match(mgVolumeWarning(727, 4) ?? "", /^분량: 어림 727mm\(약 2\.9쪽\) — 배정 4쪽\(작성분량 기준\) 대비 -29% — 근거가 있으면/);
  assert.doesNotMatch(mgVolumeWarning(727, 4) ?? "", /규정|2025 기준/, "배정은 작성분량 기준(2026-10-12)");
  assert.equal(mgVolumeWarning(900, null), null);
  assert.equal(mgVolumeWarning(900, 0), null);
});

test("집필 점검(D1): 배정 쪽수·엄격 닫기를 spec.mg에 남기고, 어림 높이(mgSpecHeight — 사업 조판과 같은 셈)가 ±25% 밖이면 분량 경고", () => {
  const out = { caption: "", parts: [{ key: "3.1.가", title: "직무교육 개편", blocks: [blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), statsOut()] }, { key: "4.1.가", title: "둘째", blocks: [blk({ label: "추진내용", items: ["직무교육 체계 개편"] }), statsOut()] }] };
  const far = verifyMgDraft(out, card, plan, { ...strictCtx, pages: 3 }, "", "", 2026);
  assert.equal(far.spec.mg?.pages, 3);
  assert.equal(far.spec.mg?.strictClose, true);
  const mm = mgSpecHeight(far.spec);
  assert.ok(far.warnings.some((w) => w.startsWith(`분량: 어림 ${Math.round(mm)}mm`)), "3쪽 배정에 짧은 초안 → 분량 경고");
  const near = verifyMgDraft(out, card, plan, { ...strictCtx, pages: mm / 255 }, "", "", 2026);
  assert.ok(!near.warnings.some((w) => w.startsWith("분량:")), "배정이 어림과 비슷하면 경고 없음");
  const none = verifyMgDraft(out, card, plan, ctx, "", "", 2026);
  assert.equal(none.spec.mg?.pages, undefined, "배정 없으면 남기지 않음(옛 초안과 같은 모양)");
  assert.equal(none.spec.mg?.strictClose, undefined);
  assert.ok(!none.warnings.some((w) => w.startsWith("분량:")));
  // 다시 점검도 spec.mg.pages로 같은 경고
  assert.ok(recheckMgSection(far.spec, card, "", 2026).warnings.some((w) => w.startsWith("분량:")));
});

test("닫기(D2): 엄격 지표(2025 절이 모두 「추진성과」 행)는 절마다 마지막 블록 라벨 「추진성과」 — 「추진실적」 표로 끝나면 경고, 기본 지표는 「추진실적」도 인정", () => {
  const tableEnd = blk({ kind: "table", label: "추진실적", items: ["구분", "내용", "실적"], cells: [{ head: "교육", tag: "", bullets: ["직무교육", "개편"], note: "" }, { head: "체계", tag: "", bullets: ["직무교육 체계", "개편"], note: "" }] });
  const out = { caption: "", parts: [{ key: "3.1.가", title: "직무교육 개편", blocks: [blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), tableEnd] }, { key: "4.1.가", title: "둘째", blocks: [blk({ label: "추진내용", items: ["직무교육 체계 개편"] }), statsOut()] }] };
  const strict = verifyMgDraft(out, card, plan, strictCtx, "", "", 2026);
  const w = strict.warnings.find((x) => x.startsWith("절:"));
  assert.ok(w && w.includes("직무교육 개편") && w.includes("마지막 블록이 라벨 「추진성과」가 아닙니다"), "엄격: 「추진실적」 표로 끝난 3.1.가");
  assert.ok(!w.includes("둘째"), "4.1.가는 추진성과로 닫음");
  const loose = verifyMgDraft(out, card, plan, ctx, "", "", 2026);
  assert.ok(!loose.warnings.some((x) => x.startsWith("절:")), "기본: 「추진실적」 표도 닫음");
  // 다시 점검은 spec.mg.strictClose로 같은 규칙
  assert.ok(recheckMgSection(strict.spec, card, "", 2026).warnings.some((x) => x.includes("마지막 블록이 라벨 「추진성과」가 아닙니다")));
  assert.ok(!recheckMgSection(loose.spec, card, "", 2026).warnings.some((x) => x.startsWith("절:")));
});

test("집필 점검 보강: 표의 빈 값 칸·수치 띠의 빈 큰 수치, 초안 전체 그림 자리 0, 같은 절 안 같은 도식 반복(표는 예외) — 경고만", () => {
  const emptyTable = blk({ kind: "table", label: "성과지표", items: ["성과지표", "’25년 실적", "’26년 목표", "’26년 실적"], cells: [{ head: "직무교육", tag: "", bullets: ["85회", "100회", ""], note: "" }, { head: "만족도", tag: "", bullets: ["80점", "85점", ""], note: "" }] });
  const cardsA = blk({ kind: "cards", label: "추진내용", cells: [{ head: "a", tag: "", bullets: ["직무교육"], note: "" }, { head: "b", tag: "", bullets: ["개편"], note: "" }] });
  const out = { caption: "", parts: [{ key: "3.1.가", title: "직무교육 개편", blocks: [cardsA, { ...cardsA, label: "추진내용2" }, emptyTable, { ...emptyTable, label: "성과지표2" }, statsOut()] }] };
  const v = verifyMgDraft(out, card, plan, ctx, "’25년 85회 100회 80점 85점", "", 2026);
  assert.ok(v.warnings.some((w) => w.startsWith("빈 칸: [성과지표] 표의 「’26년 실적」 2칸이 비었습니다")), "빈 칸 경고");
  assert.ok(v.warnings.some((w) => w.startsWith("그림 자리: 초안에 그림 자리가 없습니다 — 2025 경영관리 보고서는 절마다 사진·삽화가 1~3장")));
  const again = v.warnings.filter((w) => w.startsWith("도식:"));
  assert.equal(again.length, 1);
  assert.match(again[0], /같은 도식\(cards\)을 두 번 이상/, "표 두 번은 알리지 않고 cards만");
  const withFig = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "t", blocks: [{ ...cardsA, figures: [{ kind: "photo", desc: "교육 현장", pos: "right", size: "S" }] }, statsOut()] }] }, card, plan, ctx, "", "", 2026);
  assert.ok(!withFig.warnings.some((w) => w.startsWith("그림 자리:")), "그림 자리가 하나라도 있으면 경고 없음");
  assert.ok(!withFig.warnings.some((w) => w.startsWith("빈 칸:") || w.startsWith("도식:")));
  // 빈 큰 수치
  const blankStat = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "t", blocks: [blk({ kind: "stats", label: "추진성과", cells: [{ head: "", tag: "", bullets: ["교육 인원"], note: "" }, { head: "85회", tag: "", bullets: ["교육 운영"], note: "" }, { head: "120명", tag: "", bullets: ["교육 인원"], note: "" }] })] }] }, card, plan, ctx, "", "", 2026);
  assert.ok(blankStat.warnings.some((w) => w.startsWith("빈 칸: [추진성과] 수치 띠의 큰 수치 1칸이 비었습니다")));
});

test("카드 시점(mgCardAsOf): 원본 판·그 뒤 원장 수정 — 요청 「카드」 머리에 들어가고, 작성일은 카드 시점이 아니라고 밝힘", () => {
  assert.equal(mgCardAsOf({ edition: "260904", data_rev: 0, updated_at: "2026-10-07T06:49:29Z" }), "’26.9.4. 판(그 뒤 원장 수정 없음)");
  assert.equal(mgCardAsOf({ edition: "260904", data_rev: 3, updated_at: "2026-10-11T01:00:00Z" }), "’26.9.4. 판(그 뒤 원장 수정 3회 — 마지막 ’26.10.11.)");
  assert.equal(mgCardAsOf({ edition: null }), "판 모름(그 뒤 원장 수정 없음)");
  const p = reportDraftPromptsMg().prompts;
  const ctx: MgDraftContext = { unit: "MG-13", indicator: "AI 활용 혁신", taskNo: "13-4", markers: [], prior: [], evals: [1], cardAsOf: mgCardAsOf({ edition: "260904", data_rev: 0 }) };
  const text = mgMaterialsPrompt(p, { title: "t" }, ctx, 2026, [1], [], [], { today: "2026-10-12", kpi: [], monthly: [] } as never);
  assert.ok(text.includes("「카드」 — 원장 ’26.9.4. 판(그 뒤 원장 수정 없음)"));
  assert.ok(text.includes("보고서 작성일 2026-10-12 — 카드·첨부의 작성 시점이 아님"));
  assert.ok(mgMaterialsPrompt(p, { title: "t" }, { ...ctx, cardAsOf: undefined }, 2026, [1]).includes("원장 시점 모름"));
});

test("실적 2개 미만 막대(2026-10-14): 실적 하나 + 목표 하나는 빠지고 경고, 실적 둘 + 목표는 남음 — 추진성과가 같은 절 블록 수치 2개를 되풀이하면 경고만", () => {
  const bar = (series: Array<{ label: string; value: string }>) => blk({ kind: "chart", label: "추진배경", title: "만족도", series });
  const run = (blocks: BlockOutput[]) => verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "t", blocks }] }, card, plan, ctx, "", "", 2026);
  const one = run([blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), bar([{ label: "’25년", value: "87.8점" }, { label: "’26년 목표", value: "90점" }])]);
  assert.ok(!one.spec.blocks?.some((b) => b.kind === "chart"));
  assert.ok(one.warnings.includes("막대: 실적 값이 2개 미만(목표·계획 값만 더한 막대)이라 뺐습니다 — 실적 값이 쌓이면 다시 쓸 수 있습니다"));
  const two = run([blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), bar([{ label: "’24년", value: "80점" }, { label: "’25년", value: "87.8점" }, { label: "’26년 목표", value: "90점" }])]);
  assert.ok(two.spec.blocks?.some((b) => b.kind === "chart"));
  const rep = run([blk({ label: "추진내용", items: ["교육 720건, 만족도 6.9% 상승"] }), blk({ label: "추진성과", items: ["교육 720건 운영, 만족도 6.9% 상승"] })]);
  assert.ok(rep.warnings.some((w) => w.startsWith("추진성과: 블록에 쓴 수치를 되풀이")));
});

test("빈 상자(2026-10-15 후속 5): 집필 요청 글 한도에 나란한 칸 줄 수 맞춤(상한 없음), 집필·다시 점검은 「칸 채우기:」 경고만", () => {
  const cardsPlan: Composition = { ...plan, blocks: [...plan.blocks.slice(0, 2), { kind: "cards", variant: "plain", label: "추진내용", purpose: "무엇", cells: 3, materials: ["m1"], figures: [], at: "4.1.가" }] };
  const text = mgPlanPrompt(reportDraftPromptsMg().prompts, cardsPlan, ctx);
  assert.match(text, /\[추진내용\] cards:plain — 무엇 · 칸 3개\(늘리지 않음\) · 글 한도 칸마다 한 줄 약 \d+자 · 나란한 칸은 줄 수를 같게\(±1줄\)/);
  assert.match(text, /\[추진성과\] stats — 결과 · 칸 2개\(늘리지 않음\) · 글 한도 칸마다 한 줄 약 \d+자 ·/, "수치 띠는 줄 수 맞춤 없음");
  assert.doesNotMatch(text, /칸마다 최대/, "경영관리는 줄 수 상한을 두지 않음");
  const long = "직무교육 체계 개편 결과를 부서별로 공유하여 교육 과정을 함께 정비";
  const cards = blk({ kind: "cards", label: "추진내용", variant: "plain", cells: [{ head: "가", tag: "", bullets: [long, long, long], note: "" }, { head: "나", tag: "", bullets: [long, long, long], note: "" }, { head: "다", tag: "", bullets: ["짧은 글"], note: "" }] });
  const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "t", blocks: [blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), statsOut()] }, { key: "4.1.가", title: "둘째", blocks: [cards] }] }, card, cardsPlan, ctx, "", "", 2026);
  const w = v.warnings.find((x) => x.startsWith("칸 채우기: "));
  assert.ok(w?.includes("[추진내용 3번째 칸]"), v.warnings.join("\n"));
  assert.ok(recheckMgSection(v.spec, card).warnings.some((x) => x.startsWith("칸 채우기: ")));
});

test("경영관리 수치 띠는 올해 실적 칸이 모자라도 빼지 않음(주요사업 수치 띠 실적 규칙 2026-10-15는 주요사업만 — 경영관리 띠는 절을 닫는 추진성과)", () => {
  const cells = [{ head: "30,706건", tag: "", bullets: ["교육 인원"], note: "’25년" }, { head: "97%", tag: "", bullets: ["만족도"], note: "’25년" }, { head: "【확인: ’26년 교육 인원】", tag: "", bullets: ["교육 인원"], note: "" }];
  const v = verifyMgDraft({ caption: "", parts: [{ key: "3.1.가", title: "t", blocks: [blk({ label: "추진배경", items: ["직무교육 체계 개편"] }), blk({ kind: "stats", label: "추진성과", cells })] }] }, card, plan, ctx, "", "", 2026);
  assert.ok(v.spec.blocks!.some((b) => b.kind === "stats"), "수치 띠가 남음");
  assert.ok(!v.warnings.some((w) => w.startsWith("수치 띠:")), v.warnings.join(" / "));
  assert.ok(!v.warnings.some((w) => w.includes("수치 띠를 빼고 다른 도식")), "경영관리 ② 문구는 예전 그대로");
});
