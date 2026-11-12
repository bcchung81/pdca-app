// 경영관리 경평 초안의 「주요사업 초안 참고」(lib/reports/mg-biz.ts) — 요청 자료·숫자 근거(그 초안의 없는 숫자는 가림)·초안 근거 목록(2026-11-12)
import assert from "node:assert/strict";
import { test } from "node:test";
import { BIZ_MASK, bizMaterials, bizMissing, maskNumbers, withBizSources, withoutBizFiles } from "./mg-biz.ts";
import { mgStoryHintsOf } from "./story-hints-mg.ts";
import type { BizRefText } from "./mg-biz-queries.ts";
import type { Block } from "./blocks.ts";
import { type ReportSectionSpec, knownNumbers, unknownNumbersIn } from "./section.ts";
import { mgMaterialsPrompt } from "./mg-draft.ts";
import { reportDraftPromptsMg } from "../prompts/sets.ts";
import { specSources, withFileSources } from "./draft-sources.ts";

const block = (over: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...over });

const bizSpec = (items: string[]): ReportSectionSpec => ({
  version: 3,
  card: { id: "주요사업3/3-나", taskNo: "3-나", title: "가짜 방송 지원사업" },
  business: { no: 3, name: "가짜 대상사업" },
  task: { no: "3-1", title: "가짜 실행과제", bp: false },
  sub: { mark: "나", title: "현장 지원 확대", markers: [] },
  rows: [],
  blocks: [block({ label: "추진성과", items })],
  results: [],
  caption: "",
  module: 1,
});

const ref = (over: Partial<BizRefText> = {}): BizRefText => ({
  cardId: "주요사업3/3-나",
  taskId: "주요사업3 3-나",
  taskNo: "3-나",
  title: "가짜 방송 지원사업",
  team: "가짜팀",
  data: { taskNo: "3-나", title: "가짜 방송 지원사업", plan: { content: "현장 컨설팅 운영 계획" } },
  spec: bizSpec(["현장 컨설팅 1,234건 지원", "만족도 87.5% 달성"]),
  stamp: "a".repeat(32),
  updatedAt: "2026-11-10T00:00:00Z",
  unknownNumbers: ["87.5%"],
  files: [{ kind: "card", id: "m1", name: "결과보고.hwpx", text: "참여 기관 345곳" }],
  ...over,
});

test("maskNumbers: 없는 숫자와 같은 조각만 가리고 다른 숫자의 일부·단위 없는 같은 값은 그대로", () => {
  assert.equal(maskNumbers("만족도 87.5% 달성, 87.5점, 187.5% 상승", ["87.5%"]), `만족도 ${BIZ_MASK} 달성, 87.5점, 187.5% 상승`);
  assert.equal(maskNumbers("1,234건과 11,234건", ["1234"]), `${BIZ_MASK}건과 11,234건`, "쉼표 표기 달라도 같은 수(numKey)");
  assert.equal(maskNumbers("12 % 증가", ["12%"]), `${BIZ_MASK} 증가`, "띄어 쓴 단위도");
  assert.equal(maskNumbers("그대로 12", []), "그대로 12");
});

test("bizMaterials: 주요사업마다 원장 → 경평 초안 → 붙임(원문 그대로), 이름에 주요사업 번호·과제명, 숫자 근거로 인정", () => {
  const m = bizMaterials([ref()]);
  assert.deepEqual(
    m.docs.map((d) => [d.name, d.relation, d.numberEvidence]),
    [
      ["주요사업3 3-나 가짜 방송 지원사업 — 원장", "biz", true],
      ["주요사업3 3-나 가짜 방송 지원사업 — 경평 초안", "biz-draft", true],
      ["주요사업3 3-나 가짜 방송 지원사업 — 붙임 결과보고.hwpx", "biz", true],
    ],
  );
  const draft = m.docs.find((d) => d.relation === "biz-draft")!;
  assert.match(draft.text, /만족도 87\.5% 달성/, "AI가 보는 초안 글은 원문 그대로(없는 숫자도)");
  assert.match(m.prompt, /\[주요사업 자료\] 주요사업3 3-나 가짜 방송 지원사업 — 경평 초안\n/);
  assert.doesNotMatch(m.known, /87\.5%/, "숫자 근거 글에서는 가림");
  assert.match(m.known, /1,234/);
  assert.match(m.quote, /87\.5%/, "인용 대조는 원문");
  // 이 카드 첨부(MaterialDoc card·report)와 섞이지 않게 docs의 id는 요청 안 열쇠
  assert.ok(m.docs.every((d) => d.id.startsWith("주요사업3/3-나#")));
  assert.deepEqual(m.sources, [{ kind: "biz", id: "주요사업3/3-나", name: "주요사업3 3-나 경평 초안", stamp: "a".repeat(32), at: "2026-11-10T00:00:00Z" }], "주요사업 하나당 한 줄(붙임은 따로 적지 않음)");
});

test("숫자 근거: 그 주요사업 초안의 없는 숫자는 경영관리 초안에서도 없는 숫자, 나머지 초안·원장·붙임 숫자는 근거로 인정", () => {
  const m = bizMaterials([ref()]);
  const mgCard = { taskNo: "8-1", title: "가짜 경영관리 과제" };
  const known = knownNumbers(mgCard, m.known);
  const isKnown = (t: string) => known.has(t.replace(/,/g, "").replace(/\s+/g, "")) || known.has(t.replace(/,/g, "").replace(/\s+/g, "").replace(/(%|배)$/, ""));
  const mgDraft = "주요사업 3-나와 연계해 현장 컨설팅 1,234건 지원·참여 기관 345곳, 만족도 87.5%";
  assert.deepEqual(unknownNumbersIn(mgDraft, isKnown), ["87.5%"]);
  // 같은 수가 그 주요사업 원장(또는 붙임)에 있으면 근거 — 원장은 가리지 않음
  const inLedger = bizMaterials([ref({ data: { taskNo: "3-나", outcome: { quantitative: ["만족도 87.5%"] } } })]);
  const k2 = knownNumbers(mgCard, inLedger.known);
  assert.ok(k2.has("87.5%"));
  // 없는 숫자가 없는 초안은 초안 숫자 전부 인정
  const clean = bizMaterials([ref({ unknownNumbers: [] })]);
  assert.ok(knownNumbers(mgCard, clean.known).has("87.5%"));
});

test("bizMaterials: 초안 형식이 아니면 초안 글 없이 원장·붙임만, 빈 붙임은 뺌", () => {
  const m = bizMaterials([ref({ spec: { version: 9 }, files: [{ kind: "report", id: "r1", name: "빈.pdf", text: "  " }] })]);
  assert.deepEqual(m.docs.map((d) => d.relation), ["biz"]);
  assert.equal(m.quote, "");
  assert.equal(m.sources.length, 1);
});

test("bizMissing: 고른 주요사업 중 읽지 못한 것은 초안 경고 표기로(거절하지 않음)", () => {
  assert.deepEqual(bizMissing(["주요사업3/3-나", "주요사업9/9-가", "주요사업9/9-가"], [ref()]), ["「주요사업9 9-가 경평 초안」(찾을 수 없음)"], "카드 id 모양이 아니라 정상 표기");
  assert.deepEqual(bizMissing(["다른모양"], []), ["「다른모양 경평 초안」(찾을 수 없음)"], "모양이 다르면 id 그대로");
});

test("초안 근거 목록: biz는 이 카드 자료로 읽히지 않고(specSources biz), 블록 고치기의 새 주요사업만 더함(있는 것은 그때 지문 그대로)", () => {
  const spec = [
    { kind: "card", id: "c1", name: "a.hwp" },
    { kind: "biz", id: "주요사업3/3-나", name: "주요사업3 3-나 경평 초안", stamp: "old", at: "t0" },
    { kind: "prior", id: "p1", name: "2025 절" },
  ];
  assert.deepEqual(specSources(spec), { card: ["c1"], report: [], prior: ["p1"], biz: ["주요사업3/3-나"] });
  assert.equal(withFileSources(spec, [{ kind: "card", id: "c1", name: "a.hwp" }]), spec, "첨부 더하기는 biz를 건드리지 않음");
  const now = bizMaterials([ref({ stamp: "new" }), ref({ cardId: "주요사업4/4-가", taskId: "주요사업4 4-가", stamp: "s4" })]).sources;
  const next = withBizSources(spec, now);
  assert.deepEqual(next?.map((x) => `${x.kind}:${x.id}`), ["card:c1", "biz:주요사업3/3-나", "biz:주요사업4/4-가", "prior:p1"]);
  assert.equal((next?.[1] as { stamp?: string }).stamp, "old", "이미 있는 주요사업은 그때 지문");
  assert.equal(withBizSources(spec, now.slice(0, 1)), spec, "새 것이 없으면 같은 배열");
});

test("요청 글: 주요사업 자료는 이 과제 첨부 뒤에 「주요사업 원장·붙임」·「주요사업 경평 초안」 관계 문구로", () => {
  const { prompts } = reportDraftPromptsMg();
  const ctx = { unit: "MG-8", indicator: "가짜 지표", taskNo: "8-1", markers: [], prior: [], evals: [] };
  const own = { name: "이 과제 자료.hwpx", text: "자체 실적 10건", relation: "card" as const, numberEvidence: true };
  const m = bizMaterials([ref()]);
  const text = mgMaterialsPrompt(prompts, { title: "가짜 경영관리 과제" }, ctx, 2026, [], [own, ...m.docs]);
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  assert.match(text, /\[첨부 1\] 이 과제 자료\.hwpx — 이 과제 카드 전용 자료/);
  assert.match(text, /\[첨부 2\] 주요사업3 3-나 가짜 방송 지원사업 — 원장 — .*주요사업/);
  assert.match(text, /\[첨부 3\] 주요사업3 3-나 가짜 방송 지원사업 — 경평 초안 — .*경평 초안/);
  // 주요사업 자료가 없으면 이 과제 첨부만(주요사업 관계 문구 없음)
  const base = mgMaterialsPrompt(prompts, { title: "가짜 경영관리 과제" }, ctx, 2026, [], [own]);
  assert.doesNotMatch(base, /\[첨부 2\]|경평 초안\(다른 과제/);
  assert.ok(text.startsWith(base.slice(0, base.indexOf("「첨부 자료」"))), "앞부분(첨부 머리 전까지)은 같은 글");
});

test("신호 계산(이야기 틀 후보 등)은 주요사업 자료를 빼고 이 카드 글·이 카드 첨부만 — 주요사업 초안 낱말이 경영관리 틀 후보에 섞이지 않음", () => {
  const own = { name: "이 과제 자료.hwpx", text: "자체 실적 10건", relation: "card" as const, numberEvidence: true };
  // 주요사업 초안에 전략수립형 신호 낱말을 가득 넣음
  const strategy = "비전 전략목표 전략과제 체계 환경분석 ".repeat(20);
  const m = bizMaterials([ref({ spec: bizSpec([strategy]) })]);
  const all = [own, ...m.docs];
  assert.deepEqual(withoutBizFiles(all), [own]);
  const ctx = { prior: [], evals: [] };
  const card = { taskNo: "8-1", title: "가짜 경영관리 과제" };
  const story = (files: typeof all) => mgStoryHintsOf({ card, ctx, files }).map((h) => h.story);
  assert.notDeepEqual(story(all), story([own]), "거르지 않으면 주요사업 초안 낱말이 후보를 바꿈(이 시험의 전제)");
  assert.deepEqual(story(withoutBizFiles(all)), story([own]), "주요사업 자료를 뺀 후보 = 이 카드 첨부만의 후보");
});
