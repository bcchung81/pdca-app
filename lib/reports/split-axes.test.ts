// 경평 초안 「분할 축」·「갈래 칩」(lib/reports/split-axes.ts — 2026-10-13) 시험: 축 맞추기·칩 근거 검증(전략 이름 지어내기 차단),
// 주요사업 구성안(정리·옛 구성안·사람 편집·형제 축)·경영관리 구성안(절 칩·편집·절 다시 짜기·형제), 집필 옮기기·그리기(칩 없을 때 불변)·높이.
// 다른 시험 파일 끝에 덧붙이지 않고 한 파일에 모음(같은 파일을 고치는 다른 작업과 합칠 때 겹치지 않게).

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { reportOutlinePrompts, reportOutlinePromptsMg } from "../prompts/sets.ts";
import type { Block, BlockOutput } from "./blocks.ts";
import { mgSpecHeight } from "./business-layout.ts";
import { type Composition, type CompositionOutput, CompositionOut, applyCompositionEdit, cleanComposition, compositionFit, editOf, readComposition, splitSiblingsOf } from "./composition.ts";
import { chipTitle, fitReport, titleMm } from "./fit.ts";
import { MgOutlineOut, type MgOutlineOutput, applyMgCompositionEdit, cleanMgComposition, mgPartPrompt, mgPartRedo, mgSiblingOf, mgSiblingsPrompt, replaceMgPart } from "./mg-outline.ts";
import type { MgPart } from "./mg-types.ts";
import { sectionHtml } from "./section-html.ts";
import { type ReportSectionSpec, type SectionOutput, sectionContext, sourceKey, verifySection } from "./section.ts";
import { CHIP_MAX, SPLIT_AXES, axesFor, cleanChip, cleanSplit, matchAxis, splitAxesText, splitHeadPrompt, splitSiblingIssues, splitSiblingsPrompt } from "./split-axes.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

const hay = (s: string) => sourceKey(s);

// ---------------------------------------------------------------------------
// 사전·축 맞추기·칩 검증

test("사전: 축 11종(분석 §3 나1~나11), 표준 값은 재난 주기·관리 단계·성숙 단계·가치 축만, 트랙별로 거름", () => {
  assert.equal(SPLIT_AXES.length, 11);
  assert.equal(new Set(SPLIT_AXES.map((a) => a.name)).size, 11);
  assert.deepEqual(SPLIT_AXES.find((a) => a.name === "재난 주기")?.values, ["예방", "대비", "대응", "복구"]);
  assert.deepEqual(SPLIT_AXES.filter((a) => a.values.length).map((a) => a.name).sort(), ["가치 축", "관리 단계", "성숙 단계", "재난 주기"].sort());
  assert.deepEqual(SPLIT_AXES.find((a) => a.name === "전략 이름 묶음")?.values, [], "전략 이름은 표준 값 없음");
  const biz = axesFor("biz").map((a) => a.name);
  const mg = axesFor("mg").map((a) => a.name);
  assert.ok(biz.includes("가치사슬") && !biz.includes("관리 단계") && !biz.includes("가치 축"));
  assert.ok(mg.includes("관리 단계") && mg.includes("가치 축") && !mg.includes("가치사슬"));
});

test("matchAxis: 이름·별칭·가운뎃점 변형·띄어쓰기·곱하기 표기를 사전 이름으로, 이 트랙에 없거나 모르면 빈 글", () => {
  assert.equal(matchAxis("재난 주기", "biz"), "재난 주기");
  assert.equal(matchAxis("재난주기", "mg"), "재난 주기");
  assert.equal(matchAxis("공간ㆍ주체 렌즈", "biz"), "공간·주체 렌즈");
  assert.equal(matchAxis("대상 집단·등급", "biz"), "대상 집단", "별칭");
  assert.equal(matchAxis("PDCA", "mg"), "관리 단계");
  assert.equal(matchAxis("관리 단계(PDCA)", "mg"), "관리 단계");
  assert.equal(matchAxis("분야 x 단계", "biz"), "분야 × 단계");
  assert.equal(matchAxis("관리 단계", "biz"), "", "경영관리 전용 축");
  assert.equal(matchAxis("가치사슬", "mg"), "", "주요사업 전용 축");
  assert.equal(matchAxis("시간축", "biz"), "");
  assert.equal(matchAxis("", "biz"), "");
  assert.equal(matchAxis(undefined, "biz"), "");
});

test("cleanChip: 대괄호·따옴표를 걷고, 표준 값 또는 근거 글의 낱말만 — 가운뎃점 조각마다 표준 값이면 통과", () => {
  assert.deepEqual(cleanChip("[예방]", "재난 주기", ""), { chip: "예방", warning: "" });
  assert.deepEqual(cleanChip("「대비·대응」", "재난 주기", ""), { chip: "대비·대응", warning: "" }, "조각마다 표준 값");
  assert.deepEqual(cleanChip("plan", "관리 단계", ""), { chip: "plan", warning: "" }, "영문 표준 값은 대소문자 무시");
  assert.deepEqual(cleanChip("성숙 시장", "대상 집단", hay("수출 지원은 성숙 시장과 유망 시장으로 나눠")), { chip: "성숙 시장", warning: "" }, "근거 글에 있는 낱말");
  assert.deepEqual(cleanChip("", "재난 주기", ""), { chip: "", warning: "" });
  const none = cleanChip("미래 시장", "대상 집단", hay("성숙 시장"));
  assert.equal(none.chip, "");
  assert.match(none.warning, /^갈래: 칩 \[미래 시장\]이 「대상 집단」의 표준 값도 아니고 근거 글에도 없어/);
  const long = cleanChip("가".repeat(CHIP_MAX + 1), "재난 주기", hay("가".repeat(40)));
  assert.equal(long.chip, "");
  assert.match(long.warning, /12자를 넘어/);
  assert.match(cleanChip("예방", "없는 축", "").warning, /갈래 축이 없어/);
  assert.equal(cleanChip("가", "대상 집단", hay("가나다")).chip, "", "한 글자는 근거 대조를 하지 않음");
  assert.deepEqual(cleanChip("미래 시장", "대상 집단", "", "미래 시장"), { chip: "미래 시장", warning: "" }, "저장된 칩(keep)은 그대로");
});

test("전략 이름 묶음: 계획·카드에 적힌 전략 이름만 — 지어낸 이름은 버리고 경고", () => {
  const plan = hay("2026 추진전략: 공세·수성·확산 3대 전략으로 위기를 돌파");
  assert.equal(cleanChip("공세", "전략 이름 묶음", plan).chip, "공세");
  assert.equal(cleanChip("공세·수성", "전략 이름 묶음", plan).chip, "공세·수성");
  const made = cleanChip("도약", "전략 이름 묶음", plan);
  assert.equal(made.chip, "");
  assert.match(made.warning, /계획·카드에 적힌 전략 이름만/);
  assert.equal(cleanChip("예방", "전략 이름 묶음", plan).chip, "", "다른 축의 표준 값도 안 됨");
});

test("cleanSplit: 모르는 축이면 축·칩 모두 버리고 경고, 축만 있으면 빈 칩", () => {
  assert.deepEqual(cleanSplit("재난주기", "[복구]", "biz", ""), { split: { axis: "재난 주기", chip: "복구" }, warnings: [] });
  assert.deepEqual(cleanSplit("성숙 단계", "", "biz", ""), { split: { axis: "성숙 단계", chip: "" }, warnings: [] });
  const bad = cleanSplit("시간축", "단기", "biz", "");
  assert.equal(bad.split, undefined);
  assert.equal(bad.warnings.length, 2);
  assert.deepEqual(cleanSplit("", "", "biz", ""), { warnings: [] });
});

test("요청 글: 축 사전 줄(트랙별 — 표준 값은 있을 때만), 형제 절 — 형제가 축을 쓰면 같은 축으로, 아무도 안 썼으면 split.none, 형제 없으면 빈 글", () => {
  const p = reportOutlinePrompts().prompts;
  const text = splitAxesText(p, "biz");
  assert.equal(text.split("\n").length, axesFor("biz").length);
  assert.match(text, /재난 주기 — 예방 → 대비 → 대응 → 복구 국면마다 · 표준 값: 예방·대비·대응·복구 · 쓸 때:/);
  assert.match(text, /고객 여정 — [^\n]*마다 — 기관이 하는 일의 단계가 아님 · 쓸 때:/);
  assert.doesNotMatch(text, /관리 단계/);
  const head = splitHeadPrompt(p, "biz");
  assert.match(head, /「갈래 축」\(선택\)/);
  assert.doesNotMatch(head, /\{\{/);
  assert.match(splitHeadPrompt(reportOutlinePromptsMg().prompts, "mg"), /관리 단계 — /);
  assert.equal(splitSiblingsPrompt(p, "1-1 실행과제", []), "");
  const used = splitSiblingsPrompt(p, "1-1 실행과제", [{ mark: "나", title: "둘째 소항목", axis: "재난 주기", chip: "대응" }]);
  assert.match(used, /형제가 이미 「재난 주기」 축으로 나눴으므로/);
  assert.match(used, /나\. 둘째 소항목 — 「재난 주기」 \[대응\]/);
  const none = splitSiblingsPrompt(p, "1-1 실행과제", [{ mark: "나", title: "둘째", axis: "", chip: "" }]);
  assert.match(none, /아직 갈래 축을 정한 것이 없습니다/);
  assert.match(none, /나\. 둘째 — 축 없음/);
});

test("형제 축 경고: 형제와 다른 축·같은 칩이면 경고(막지 않음), 축이 없으면 없음", () => {
  const sib = [
    { mark: "나", title: "", axis: "재난 주기", chip: "대응" },
    { mark: "다", title: "", axis: "", chip: "" },
  ];
  assert.deepEqual(splitSiblingIssues(undefined, sib), []);
  assert.deepEqual(splitSiblingIssues({ axis: "재난 주기", chip: "예방" }, sib), []);
  assert.match(splitSiblingIssues({ axis: "대상 집단", chip: "" }, sib)[0], /^갈래: 갈래 축 「대상 집단」이 같은 실행과제 형제\(나\. 「재난 주기」\)와 다릅니다/);
  assert.match(splitSiblingIssues({ axis: "재난 주기", chip: "대응" }, sib)[0], /칩 \[대응\]이 같은 실행과제 형제\(나\)와 같습니다/);
});

// ---------------------------------------------------------------------------
// 주요사업 구성안

const outBase = (over: Partial<CompositionOutput> = {}): CompositionOutput => ({ message: "메시지", points: ["논점"], story: "단계 전개형", storyWhy: "이유", alternative: "차선", materials: [{ id: "m1", kind: "fact", text: "재료", when: "", source: "카드", quote: "" }], blocks: [{ kind: "bullets", variant: "", label: "추진내용", purpose: "목적", cells: 2, materials: ["m1"], figures: [], alts: [] }], results: "결과", ...over }) as CompositionOutput;

test("주요사업 답 스키마: splitAxis·splitChip은 선택 문자열(enum 아님) — 없어도·아무 글이어도 파싱됨", () => {
  assert.ok(CompositionOut.safeParse(outBase()).success, "필드 없음");
  assert.ok(CompositionOut.safeParse(outBase({ splitAxis: "재난ㆍ주기 + 다른 축", splitChip: "[예방]" })).success, "변형 표기도 파싱은 통과(정리가 맞춤)");
});

test("cleanComposition: 축은 사전 이름으로, 칩은 근거에서 찾은 것만 — 모르는 축은 필드 없이 경고, 축이 없으면 split 없음(옛 출력 그대로)", () => {
  const h = hay("재난방송 예방 교육과 현장 대응 훈련");
  const ok = cleanComposition(outBase({ splitAxis: "재난주기", splitChip: "[예방]" }), h, new Set());
  assert.deepEqual(ok.composition.split, { axis: "재난 주기", chip: "예방" });
  const plain = cleanComposition(outBase(), h, new Set());
  assert.equal("split" in plain.composition, false, "축을 안 쓰면 필드 자체가 없음");
  const bad = cleanComposition(outBase({ splitAxis: "전략 이름 묶음", splitChip: "도약 전략" }), h, new Set());
  assert.deepEqual(bad.composition.split, { axis: "전략 이름 묶음", chip: "" });
  assert.ok(bad.warnings.some((w) => /전략 이름만/.test(w)));
  const unknown = cleanComposition(outBase({ splitAxis: "시간축", splitChip: "단기" }), h, new Set());
  assert.equal(unknown.composition.split, undefined);
  assert.ok(unknown.warnings.some((w) => w.startsWith("갈래:")));
});

const comp = (over: Partial<Composition> = {}): Composition => ({ version: 1, message: "m", points: [], story: "단계 전개형", storyWhy: "", alternative: "", blocks: [{ kind: "bullets", variant: "", label: "추진내용", purpose: "p", cells: 2, materials: [], figures: [] }], results: "", materials: [{ id: "m1", kind: "fact", text: "재료", when: "", source: "", quote: "성숙 시장 수출 상담", found: true }], memo: "", ...over });

test("옛 구성안(split 없음): 그대로 읽고, 편집 시작 값은 빈 축 — 그대로 저장하면 split 필드가 생기지 않음", () => {
  const old = comp();
  assert.equal(readComposition(JSON.parse(JSON.stringify(old)))?.split, undefined);
  const e = editOf(old);
  assert.deepEqual(e.split, { axis: "", chip: "" });
  const r = applyCompositionEdit(old, e);
  assert.equal("split" in r.composition, false);
  assert.deepEqual(r.notes, []);
  // 보내지 않은 편집(옛 화면)은 저장된 축·칩을 그대로
  const withSplit = comp({ split: { axis: "재난 주기", chip: "예방" } });
  const noSplit = editOf(withSplit);
  delete noSplit.split;
  assert.deepEqual(applyCompositionEdit(withSplit, noSplit).composition.split, { axis: "재난 주기", chip: "예방" });
});

test("사람 편집: 축·칩을 바꾸거나 지움 — 같은 규칙(표준 값·근거 글), 저장된 칩은 같은 축이면 그대로, 못 받은 칩은 notes", () => {
  const c = comp({ split: { axis: "대상 집단", chip: "성숙 시장" } });
  const h = hay("카드 글");
  // 그대로(근거 글 없어도 저장된 칩은 남음)
  assert.deepEqual(applyCompositionEdit(c, editOf(c), undefined, h).composition.split, { axis: "대상 집단", chip: "성숙 시장" });
  // 표준 값으로 바꿈
  const e1 = { ...editOf(c), split: { axis: "재난 주기", chip: "복구" } };
  assert.deepEqual(applyCompositionEdit(c, e1, undefined, h).composition.split, { axis: "재난 주기", chip: "복구" });
  // 축을 바꾸면 저장된 칩도 다시 검증(근거 글에 없으면 빠짐)
  const e2 = { ...editOf(c), split: { axis: "고객 여정", chip: "성숙 시장" } };
  const r2 = applyCompositionEdit(c, e2, undefined, h);
  assert.deepEqual(r2.composition.split, { axis: "고객 여정", chip: "" });
  assert.ok(r2.notes.some((n) => n.startsWith("갈래 칩:")));
  // 근거 글에 있는 낱말로
  assert.equal(applyCompositionEdit(c, e2, undefined, hay("성숙 시장 수출 상담")).composition.split?.chip, "성숙 시장");
  // 지움
  const e3 = { ...editOf(c), split: { axis: "", chip: "" } };
  assert.equal("split" in applyCompositionEdit(c, e3, undefined, h).composition, false);
});

test("형제 축(splitSiblingsOf): 같은 대상사업·실행과제 형제만, 축·칩은 형제 구성안(없으면 초안 칩), 제목은 초안(없으면 카드 제목), 표지 순", () => {
  const siblings = [
    { id: "me", taskNo: "1-가", targetBusiness: "전파", executionTaskNo: "1", executionTask: "" },
    { id: "s2", taskNo: "1-다", targetBusiness: "전파", executionTaskNo: "1", executionTask: "" },
    { id: "s1", taskNo: "1-나", targetBusiness: "전파", executionTaskNo: "1", executionTask: "" },
    { id: "s3", taskNo: "2-가", targetBusiness: "전파", executionTaskNo: "2", executionTask: "" },
  ];
  const rows = [
    { card_id: "s2", spec: null, outline: comp({ split: { axis: "재난 주기", chip: "복구" } }), cards: { task_no: "1-다", title: "셋째 과제" } },
    { card_id: "s1", spec: { version: 3, sub: { mark: "나", title: "둘째 소항목", markers: [], chip: "대응" }, blocks: [], rows: [], results: [] }, outline: null, cards: [{ task_no: "1-나", title: "둘째 과제" }] },
    { card_id: "s3", spec: null, outline: comp({ split: { axis: "대상 집단", chip: "" } }), cards: { task_no: "2-가", title: "다른 실행과제" } },
  ];
  const got = splitSiblingsOf({ targetBusiness: "전파", executionTaskNo: "1" }, "me", siblings, rows as any);
  assert.deepEqual(got, [
    { mark: "나", title: "둘째 소항목", axis: "", chip: "대응" },
    { mark: "다", title: "셋째 과제", axis: "재난 주기", chip: "복구" },
  ]);
  assert.deepEqual(splitSiblingsOf({ targetBusiness: "전파", executionTaskNo: "" }, "me", siblings, rows as any), [], "실행과제 번호가 없으면 없음");
});

test("판면 어림: 칩이 없으면 그대로, 칩이 있으면 「[값] 」을 붙인 제목으로 셈(구성안·초안 같은 셈)", () => {
  assert.equal(chipTitle("제목"), "제목");
  assert.equal(chipTitle("제목", ""), "제목");
  assert.equal(chipTitle("제목", "예방"), "[예방] 제목");
  const c = comp();
  const base = compositionFit(c, 0.5).total;
  assert.equal(compositionFit({ ...c, split: { axis: "재난 주기", chip: "" } }, 0.5).total, base, "칩 없는 축은 높이 그대로");
  // 38자 제목은 한 줄에 가깝게 차 있어 긴 칩을 붙이면 줄이 늚
  assert.ok(compositionFit({ ...c, split: { axis: "대상 집단", chip: "가나다라마바사아자차카타" } }, 0.5).total > base);
  const s = { sub: { title: "가".repeat(38), markers: [] as string[] }, blocks: [], results: ["결과"], module: 1 };
  assert.equal(fitReport({ ...s, sub: { ...s.sub, chip: undefined } }).total, fitReport(s).total);
  assert.ok(fitReport({ ...s, sub: { ...s.sub, chip: "가나다라마바사아자차카타" } }).total > fitReport(s).total);
});

// ---------------------------------------------------------------------------
// 집필 옮기기·그리기

const seed = { cards: seedCards() };
const card = seed.cards.find((x) => x.id === "주요사업1/1-가")!;
const B = (kind: Block["kind"], label: string, over: Partial<Block> = {}): Block => ({ kind, label, title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });

test("verifySection: ctx.chip을 spec.sub.chip으로 옮기고 제목 앞에 겹쳐 적은 칩은 뗌, 칩이 없으면 sub에 필드 없음", { skip: NO_SEED_CARDS }, () => {
  const ctx = sectionContext(card, seed.cards.filter((x) => x.group === "주요사업1"));
  const ob = (b: Block): BlockOutput => ({ ...b, evidence: "", figures: [] }) as BlockOutput;
  const out = { title: "[예방] 재난 대비 체계", story: "단계 전개형", blocks: [ob(B("bullets", "추진배경", { items: ["배경"] }))], results: ["성과"], resultCards: [], resultChart: { title: "", series: [], badge: "" }, resultBand: "", caption: "" } as unknown as SectionOutput;
  const plain = verifySection(out, card, ctx);
  assert.equal("chip" in plain.spec.sub, false);
  assert.equal(plain.spec.sub.title, "[예방] 재난 대비 체계");
  const chipped = verifySection(out, card, { ...ctx, chip: "예방" });
  assert.equal(chipped.spec.sub.chip, "예방");
  assert.equal(chipped.spec.sub.title, "재난 대비 체계");
});

const bizSpec = (sub: ReportSectionSpec["sub"]): ReportSectionSpec => ({ version: 3, card: { id: "주요사업1/1-가", taskNo: "1-가", title: "과제" }, business: { no: 1, name: "전파" }, task: { no: "1-1", title: "실행과제", bp: false }, sub, rows: [], blocks: [B("bullets", "추진내용", { items: ["내용 한 줄"] })], results: ["성과 한 줄"], caption: "", module: 1 });

test("그리기(주요사업): 칩이 없으면 출력이 바이트까지 그대로, 있으면 소항목 제목 앞 「[값] 」(이스케이프 — 새 CSS 없음)", () => {
  const plain = sectionHtml(bizSpec({ mark: "가", title: "소항목 제목", markers: [] }), [], { editMarks: true, blockMarks: true });
  assert.equal(sectionHtml(bizSpec({ mark: "가", title: "소항목 제목", markers: [], chip: "" }), [], { editMarks: true, blockMarks: true }), plain);
  const html = sectionHtml(bizSpec({ mark: "가", title: "소항목 제목", markers: [], chip: "성숙 <시장>" }), [], { editMarks: true, blockMarks: true });
  assert.match(html, /<h5 class="k-sub">가\. \[성숙 &lt;시장&gt;\] <span/);
  assert.equal(html.replace("[성숙 &lt;시장&gt;] ", ""), plain, "칩 글자 말고는 같음");
});

// ---------------------------------------------------------------------------
// 경영관리

const mgOut = (over: Partial<MgOutlineOutput> = {}): MgOutlineOutput =>
  ({
    message: "m",
    points: [],
    parts: [
      { evalNo: 1, themeNo: 1, themeTitle: "", mark: "", title: "", story: "", why: "", chip: "계획" },
      { evalNo: 1, themeNo: 2, themeTitle: "", mark: "가", title: "계획 수립", story: "", why: "", chip: "[계획]" },
      { evalNo: 1, themeNo: 2, themeTitle: "", mark: "나", title: "이행 점검", story: "", why: "", chip: "도약" },
    ],
    materials: [],
    blocks: [
      { part: 1, kind: "band", variant: "", label: "", purpose: "p", cells: 1, materials: [], figures: [], alts: [] },
      { part: 2, kind: "band", variant: "", label: "", purpose: "p", cells: 1, materials: [], figures: [], alts: [] },
      { part: 3, kind: "band", variant: "", label: "", purpose: "p", cells: 1, materials: [], figures: [], alts: [] },
    ],
    ...over,
  }) as MgOutlineOutput;

test("경영관리 답 스키마: splitAxis·part.chip은 선택 문자열 — 없어도 파싱됨", () => {
  const noAxis: any = mgOut();
  for (const p of noAxis.parts) delete p.chip;
  assert.equal("splitAxis" in noAxis, false);
  assert.ok(MgOutlineOut.safeParse(noAxis).success);
  assert.ok(MgOutlineOut.safeParse(mgOut({ splitAxis: "아무 글" })).success);
});

test("cleanMgComposition: 카드 축은 사전 이름, 절 칩은 표준 값·근거 낱말만 — 대주제 본문(표지 없음) 칩은 없음, 지어낸 칩은 빼고 경고", () => {
  const { composition: c, warnings } = cleanMgComposition(mgOut({ splitAxis: "PDCA" }), "", new Set(), { indicator: "지표", prior: [] });
  assert.equal(c.mg?.axis, "관리 단계");
  assert.deepEqual(c.mg?.parts.map((p) => [p.key, p.chip]), [["1.1.0", undefined], ["1.2.가", "계획"], ["1.2.나", undefined]]);
  assert.ok(warnings.some((w) => /칩 \[도약\]이 「관리 단계」의 표준 값도 아니고/.test(w)));
  // 축이 없으면 칩을 모두 빼고 한 번만 경고, mg.axis 필드 없음(옛 구성안과 같은 모양)
  const none = cleanMgComposition(mgOut(), "", new Set(), { indicator: "지표", prior: [] });
  assert.equal("axis" in (none.composition.mg ?? {}), false);
  assert.ok(none.composition.mg?.parts.every((p) => !("chip" in p)));
  assert.equal(none.warnings.filter((w) => w === "갈래: 갈래 축이 없어 절 칩을 뺐습니다.").length, 1);
  // 주요사업 전용 축은 경영관리에서 버림
  const biz = cleanMgComposition(mgOut({ splitAxis: "가치사슬" }), "", new Set(), { indicator: "지표", prior: [] });
  assert.equal(biz.composition.mg?.axis, undefined);
  assert.ok(biz.warnings.some((w) => /경영관리 갈래 축 사전에 없어/.test(w)));
  // 절 다시 짜기: ctx.axis가 AI 답 축보다 앞섬
  const redo = cleanMgComposition(mgOut({ splitAxis: "재난 주기" }), "", new Set(), { indicator: "지표", prior: [], axis: "관리 단계" });
  assert.equal(redo.composition.mg?.axis, "관리 단계");
});

const part = (mark: string, chip?: string): MgPart => ({ key: `1.2.${mark}`, evalNo: 1, evalTitle: "평가", themeNo: 2, themeTitle: "대주제", mark, title: `${mark} 절`, story: "", why: "", ...(chip ? { chip } : {}) });
const mgComp = (axis?: string): Composition => ({
  version: 1,
  message: "m",
  points: [],
  story: "",
  storyWhy: "",
  alternative: "",
  blocks: [
    { kind: "band", variant: "", label: "", purpose: "p", cells: 1, materials: [], figures: [], at: "1.2.가" },
    { kind: "band", variant: "", label: "", purpose: "p", cells: 1, materials: [], figures: [], at: "1.2.나" },
  ],
  results: "",
  materials: [],
  memo: "",
  mg: { indicator: "지표", parts: [part("가", axis ? "계획" : undefined), part("나", axis ? "실행" : undefined)], ...(axis ? { axis } : {}) },
});

test("경영관리 편집: 축·절 칩을 바꾸거나 지움(같은 규칙), 옛 구성안은 그대로, 블록 정렬·다른 절 칩은 잃지 않음", () => {
  const old = mgComp();
  const e0 = editOf(old);
  assert.deepEqual(e0.split, { axis: "", chip: "" });
  assert.deepEqual(e0.parts?.map((p) => p.chip), ["", ""]);
  const r0 = applyMgCompositionEdit(old, e0);
  assert.equal("axis" in (r0.composition.mg ?? {}), false);
  assert.ok(r0.composition.mg?.parts.every((p) => !("chip" in p)));
  const c = mgComp("관리 단계");
  // 그대로
  const same = applyMgCompositionEdit(c, editOf(c), "");
  assert.deepEqual(same.composition.mg?.parts.map((p) => p.chip), ["계획", "실행"]);
  assert.equal(same.composition.mg?.axis, "관리 단계");
  // 한 절 칩만 바꿈(표준 값), 다른 절은 그대로 — 근거에 없는 값은 빠지고 notes
  const e1 = editOf(c);
  e1.parts = e1.parts!.map((p) => (p.key === "1.2.나" ? { ...p, chip: "점검" } : { ...p, chip: "도약" }));
  const r1 = applyMgCompositionEdit(c, e1, "");
  assert.deepEqual(r1.composition.mg?.parts.map((p) => p.chip), [undefined, "점검"]);
  assert.ok(r1.notes.some((n) => n.startsWith("갈래 칩:")));
  // 순서를 바꿔도 칩은 절에 붙어 다님
  const e2 = editOf(c);
  e2.parts = [...e2.parts!].reverse();
  const r2 = applyMgCompositionEdit(c, e2, "");
  assert.deepEqual(r2.composition.mg?.parts.map((p) => [p.key, p.chip]), [["1.2.나", "실행"], ["1.2.가", "계획"]]);
  assert.deepEqual(r2.composition.blocks.map((b) => b.at), ["1.2.나", "1.2.가"]);
  // 축을 지우면 칩도 빠짐
  const r3 = applyMgCompositionEdit(c, { ...editOf(c), split: { axis: "", chip: "" } }, "");
  assert.equal(r3.composition.mg?.axis, undefined);
  assert.ok(r3.composition.mg?.parts.every((p) => !p.chip));
});

test("경영관리 절 다시 짜기·형제: 새 답 칩이 있으면 그것, 없으면 지금 칩 — 요청 글에 카드 축 줄, 형제 줄에 축·칩", () => {
  const c = mgComp("관리 단계");
  const next = (chip?: string): Composition => ({ ...mgComp("관리 단계"), blocks: [{ kind: "bullets", variant: "", label: "추진내용", purpose: "새", cells: 1, materials: [], figures: [], at: "1.2.가" }], mg: { indicator: "지표", parts: [{ ...part("가"), ...(chip ? { chip } : {}) }], axis: "관리 단계" } });
  assert.equal(replaceMgPart(c, next(), "1.2.가", {}).composition.mg?.parts[0].chip, "계획", "새 답에 칩이 없으면 지금 칩");
  assert.equal(replaceMgPart(c, next("환류"), "1.2.가", {}).composition.mg?.parts[0].chip, "환류");
  assert.equal(replaceMgPart(c, next("환류"), "1.2.가", {}).composition.mg?.parts[1].chip, "실행", "다른 절 칩은 그대로");
  const p = reportOutlinePromptsMg().prompts;
  const redo = mgPartRedo(c, "1.2.가")!;
  assert.equal(redo.axis, "관리 단계");
  assert.match(mgPartPrompt(p, redo), /이 카드의 갈래 축은 「관리 단계」입니다 — 이 절의 chip은 그 축의 값 하나\(지금 칩: 계획/);
  assert.doesNotMatch(mgPartPrompt(p, mgPartRedo(mgComp(), "1.2.가")!), /갈래 축/, "축이 없으면 줄 없음");
  const sib = mgSiblingOf("9-2", c)!;
  assert.equal(sib.axis, "관리 단계");
  const text = mgSiblingsPrompt(p, [sib]);
  assert.match(text, /9-2 카드 갈래 축: 「관리 단계」/);
  assert.match(text, /절 \[1\.2\.가\][^\n]* · 칩 \[계획\]/);
  assert.doesNotMatch(mgSiblingsPrompt(p, [mgSiblingOf("9-2", mgComp())!]), /갈래 축|칩 \[/, "축·칩이 없으면 예전 줄 그대로");
});

const mgSpec = (parts: MgPart[]): ReportSectionSpec => ({ version: 3, card: { id: "경영관리9/9-1", taskNo: "9-1", title: "과제" }, business: { no: 0, name: "지표" }, task: { no: "9-1", title: "과제", bp: false }, sub: { mark: "", title: "과제", markers: [] }, rows: [], blocks: parts.map(() => B("bullets", "추진내용", { items: ["내용"] })), results: [], caption: "", module: 1, mg: { indicator: "지표", parts, at: parts.map((p) => p.key) } });

test("그리기·높이(경영관리): 칩이 없으면 그대로, 있으면 절 제목 앞 「[값] 」 — 높이는 칩을 붙인 제목으로 셈", () => {
  const long = (chip?: string) => ({ ...part("가", chip), title: "가".repeat(36) });
  const plain = sectionHtml(mgSpec([long()]));
  const html = sectionHtml(mgSpec([long("계획")]));
  assert.match(html, /<h5 class="k-sub">가\. \[계획\] 가{36}/);
  assert.equal(html.replace("[계획] ", ""), plain);
  assert.equal(mgSpecHeight(mgSpec([long()])), mgSpecHeight(mgSpec([{ ...long(), chip: "" }])));
  const grow = titleMm(chipTitle("가".repeat(36), "가나다라마바사아자차카타"), []) - titleMm("가".repeat(36), []);
  assert.ok(grow > 0);
  assert.equal(Math.round((mgSpecHeight(mgSpec([long("가나다라마바사아자차카타")])) - mgSpecHeight(mgSpec([long()]))) * 10), Math.round(grow * 10));
});
