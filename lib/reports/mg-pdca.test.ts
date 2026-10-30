// 경영관리 경평 초안 PDCA 뼈대(lib/reports/mg-pdca.ts) 시험 — 가짜 카드(실제 카드 값 아님)로 단계 묶기·Check 줄 옮기기·지적 없음 행 빼기·머리 라벨·빈 카드,
// 요청 글 블록(구성안·집필 공용 자료 블록의 카드 글 뒤), 구성안 블록 stage 정리·보존(사람 편집·절 다시 짜기), 구성안 점검 「PDCA」.

import assert from "node:assert/strict";
import { test } from "node:test";
import { MGMT_TRACK, PDCA_STAGES } from "../tracks/index.ts";
import { reportDraftPromptsMg } from "../prompts/sets.ts";
import { type Composition, editOf } from "./composition.ts";
import { type MgDraftContext, mgMaterialsPrompt } from "./mg-draft.ts";
import { type MgOutlineOutput, applyMgCompositionEdit, cleanMgComposition, mgCompositionIssues, replaceMgPart } from "./mg-outline.ts";
import { cleanStage, mgPdcaPrompt, mgPdcaSkeleton, pdcaIssues, pdcaSkeleton } from "./mg-pdca.ts";
import { warningLevel } from "./warning-levels.ts";

/** 가짜 경영관리 카드(칸 모양만 parse-mgmt.ts와 같음 — 글·숫자는 지어낸 일반어) */
const CARD = {
  group: "경영관리1",
  title: "가짜 과제",
  feedback: {
    headers: { self: "’00년 자체평가", plan: "’01년 개선방안" },
    rows: [
      { self: ["∙ 참여 부서가 일부에 그침"], plan: ["∙ 전 부서로 넓힘"] },
      { self: [], plan: [] },
    ],
  },
  findings: {
    headers: { finding: "지적사항", plan: "개선방안" },
    rows: [
      { finding: ["∙ 지적사항 없음"], plan: ["-"] },
      { finding: ["∙ 성과 측정 기준이 모호함"], plan: ["∙ 측정 기준을 문서로 정함"] },
    ],
  },
  kpi: {
    headers: { name: "지표", prev: "’00년 실적", target: "’01년 목표" },
    rows: [
      { name: "참여율", unit: "%", prev: "50", target: "60" },
      { name: "", unit: null, prev: "", target: "" },
    ],
  },
  do: {
    lines: [
      "□ 운영 체계 정비(~3월)",
      "- 안내서 개정",
      "- (리스크 대응) 일정이 늦어지면 단계를 나눔",
      "   ",
      { table: { rows: [[{ lines: ["구분"] }, { lines: ["내용"] }], [{ lines: ["교육"] }, { lines: ["두 차례 운영"] }]] } },
      { image: { src: null, kordoc: "" } },
    ],
    monthly: [{ period: "1월", items: ["안내서 개정 착수", "운영 현황 모니터링"] }],
  },
  outcome: { headers: { quantitative: "정량", qualitative: "정성" }, quantitative: ["∙ 참여율 55% 달성"], qualitative: [] },
};

test("대응표: 경영관리만 PDCA 대응표가 있고 단계는 P·D·C·A 안, Check 낱말이 있음(주요사업은 없음 — tracks.test)", () => {
  const spec = MGMT_TRACK.pdca;
  assert.ok(spec.sources.length > 0);
  assert.ok(spec.sources.every((s) => (PDCA_STAGES as readonly string[]).includes(s.stage)));
  assert.ok(spec.checkWords.length > 0);
});

test("뼈대: P = 전년도 환류 짝·실제 지적 짝·계량지표 목표, D = 추진내용(표 줄은 칸을 이음, 그림 뺌)·월별(기간), C = 추진성과 + Check 낱말 줄, A = 빈 묶음", () => {
  const sk = mgPdcaSkeleton(CARD);
  assert.deepEqual(sk.P, [
    { label: "’00년 자체평가 → ’01년 개선방안", text: "∙ 참여 부서가 일부에 그침 → ∙ 전 부서로 넓힘" },
    { label: "지적사항 → 개선방안", text: "∙ 성과 측정 기준이 모호함 → ∙ 측정 기준을 문서로 정함" },
    { label: "계량 성과지표", text: "참여율(%) · ’00년 실적 50 · ’01년 목표 60" },
  ]);
  assert.deepEqual(sk.D, [
    { label: "추진내용", text: "□ 운영 체계 정비(~3월)" },
    { label: "추진내용", text: "- 안내서 개정" },
    { label: "추진내용", text: "구분 | 내용" },
    { label: "추진내용", text: "교육 | 두 차례 운영" },
    { label: "월별 실적 · 1월", text: "안내서 개정 착수" },
  ]);
  assert.deepEqual(sk.C, [
    { label: "정량", text: "∙ 참여율 55% 달성" },
    { label: "추진내용", text: "- (리스크 대응) 일정이 늦어지면 단계를 나눔" },
    { label: "월별 실적 · 1월", text: "운영 현황 모니터링" },
  ]);
  assert.deepEqual(sk.A, []);
});

test("뼈대: 머리(headers)가 없으면 대응표의 기본 라벨, 빈 카드는 모두 빈 묶음 — 요청 블록은 빈 글", () => {
  const noHead = mgPdcaSkeleton({ feedback: { rows: [{ self: ["보완점"], plan: ["개선"] }] }, kpi: { rows: [{ name: "만족도", unit: "점", prev: "", target: "80" }] } });
  assert.deepEqual(noHead.P, [
    { label: "전년도 자체평가 → 개선방안", text: "보완점 → 개선" },
    { label: "계량 성과지표", text: "만족도(점) · 전년 실적 — · 목표 80" },
  ]);
  const empty = pdcaSkeleton({}, MGMT_TRACK.pdca);
  assert.deepEqual(empty, { P: [], D: [], C: [], A: [] });
  assert.equal(mgPdcaPrompt(reportDraftPromptsMg().prompts, empty), "");
  // 지적이 「없음」뿐인 카드는 지적 줄이 없음
  assert.deepEqual(mgPdcaSkeleton({ findings: { rows: [{ finding: ["해당 없음"], plan: ["개선방안"] }] } }).P, []);
});

test("요청 블록: 카드 글 바로 뒤(전년 골격 앞)에 단계마다 줄 수·라벨 줄, 빈 단계는 「카드에 없음」 한 줄 — 평문 카드 글은 그대로", () => {
  const p = reportDraftPromptsMg().prompts;
  const block = mgPdcaPrompt(p, mgPdcaSkeleton(CARD));
  assert.match(block, /「PDCA 뼈대」/);
  assert.match(block, /P 문제·계획\(3줄\)/);
  assert.match(block, /D 실행\(5줄\)/);
  assert.match(block, /C 점검·성과\(3줄\)/);
  assert.match(block, /A 보완\(0줄\)[^\n]*\n- 카드에 없음/);
  assert.ok(block.includes("- [지적사항 → 개선방안] ∙ 성과 측정 기준이 모호함 → ∙ 측정 기준을 문서로 정함"));
  const ctx: MgDraftContext = { unit: "MG-1", indicator: "지표", taskNo: "1-1", markers: [], prior: [], evals: [] };
  const text = mgMaterialsPrompt(p, CARD, ctx, 2026, []);
  const at = text.indexOf("「PDCA 뼈대」");
  assert.ok(at > text.indexOf("「카드」") && at < text.indexOf("「전년도("), "카드 글 뒤 · 전년 골격 앞");
  assert.ok(text.includes("feedback.rows.0.self.0 | ∙ 참여 부서가 일부에 그침"), "평문 카드 글(칸 경로 | 글)은 그대로");
  assert.equal(mgMaterialsPrompt(p, { title: "t" }, ctx, 2026, []).includes("「PDCA 뼈대」"), false, "칸이 모두 비면 블록 없음");
});

/** 구성안 AI 답(가짜): 두 절, 블록마다 stage(소문자·빈칸·모르는 값 섞음) */
const OUT = (): MgOutlineOutput => ({
  message: "핵심",
  points: ["논점"],
  parts: [
    { evalNo: 1, themeNo: 1, themeTitle: "", mark: "가", title: "첫 절", story: "배경·내용·성과형", why: "" },
    { evalNo: 1, themeNo: 1, themeTitle: "", mark: "나", title: "둘째 절", story: "배경·내용·성과형", why: "" },
  ],
  materials: [{ id: "m1", kind: "fact", text: "사실", when: "", source: "카드", quote: "원문" }],
  blocks: [
    { part: 1, kind: "bullets", variant: "", label: "추진배경", purpose: "왜", cells: 2, materials: ["m1"], figures: [], alts: [], stage: " p " },
    { part: 1, kind: "cards", variant: "plain", label: "추진내용", purpose: "어떻게", cells: 3, materials: ["m1"], figures: [], alts: [], stage: "D" },
    { part: 1, kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1"], figures: [], alts: [], stage: "Check" },
    { part: 2, kind: "bullets", variant: "", label: "추진내용", purpose: "어떻게", cells: 2, materials: ["m1"], figures: [], alts: [], stage: "" },
    { part: 2, kind: "stats", variant: "", label: "추진성과", purpose: "결과", cells: 2, materials: ["m1"], figures: [], alts: [] },
  ],
});
const clean = (o: MgOutlineOutput) => cleanMgComposition(o, "", new Set(), { indicator: "지표", prior: [] }).composition;

test("구성안 stage 정리: P·D·C·A 한 글자만 남기고(대소문자·앞뒤 빈칸 무시) 나머지·빈 글은 필드를 지움 · cleanStage", () => {
  const c = clean(OUT());
  assert.deepEqual(c.blocks.map((b) => b.stage), ["P", "D", undefined, undefined, undefined]);
  assert.ok(c.blocks.slice(2).every((b) => !("stage" in b)), "지운 것은 필드째 없음");
  assert.equal(cleanStage("a"), "A");
  assert.equal(cleanStage("PD"), "");
  assert.equal(cleanStage(null), "");
});

test("구성안 stage 보존: 사람 편집(순서 바꿈·고침·복제)과 절 다시 짜기(replaceMgPart)를 거쳐도 남음, 새 블록은 없음", () => {
  const c = clean(OUT());
  const e = editOf(c);
  // 순서 뒤집기(같은 절 안) + 첫 블록 목적 고침 + 둘째 블록 복제 + 새 블록
  const edited = applyMgCompositionEdit(c, { ...e, blocks: [{ ...e.blocks[1] }, { ...e.blocks[0], purpose: "고친 목적" }, { ...e.blocks[1] }, ...e.blocks.slice(2), { ...e.blocks[0], from: null }] }).composition;
  const first = edited.blocks.filter((b) => b.at === "1.1.가");
  assert.deepEqual(first.map((b) => b.stage), ["D", "P", "D", undefined, undefined]);
  // 절 다시 짜기: 새 답의 stage가 그 절 블록에 실리고 다른 절은 그대로
  const redo: MgOutlineOutput = { ...OUT(), parts: [OUT().parts[1]], blocks: [{ part: 1, kind: "bullets", variant: "", label: "점검", purpose: "확인", cells: 2, materials: ["m1"], figures: [], alts: [], stage: "C" }] };
  const merged = replaceMgPart(c, clean(redo), "1.1.나", {}).composition;
  assert.deepEqual(merged.blocks.filter((b) => b.at === "1.1.나").map((b) => b.stage), ["C"]);
  assert.deepEqual(merged.blocks.filter((b) => b.at === "1.1.가").map((b) => b.stage), ["P", "D", undefined]);
  // 저장·읽기(JSON 왕복)에도 남음
  assert.deepEqual((JSON.parse(JSON.stringify(merged)) as Composition).blocks.map((b) => b.stage), merged.blocks.map((b) => b.stage));
});

test("구성안 점검 「PDCA」: stage가 하나도 없는 옛 구성안은 점검 안 함, 뼈대에 재료가 있는 단계의 블록이 카드 전체에 없으면 한 줄(참고), 뼈대를 안 주면 점검 안 함", () => {
  const sk = mgPdcaSkeleton(CARD);
  const c = clean(OUT());
  const old: Composition = {
    ...c,
    blocks: c.blocks.map((b) => {
      const x = { ...b };
      delete x.stage;
      return x;
    }),
  };
  assert.deepEqual(pdcaIssues(old, sk), []);
  const issues = pdcaIssues(c, sk);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^PDCA: 카드에 C 재료 3줄이 있는데/);
  assert.equal(warningLevel(issues[0]), "info");
  // 카드 전체에서 셈 — 둘째 절에만 C가 있어도 됨
  const full: Composition = { ...c, blocks: c.blocks.map((b, i) => (i === 4 ? { ...b, stage: "C" } : b)) };
  assert.deepEqual(pdcaIssues(full, sk), []);
  // 뼈대에 재료가 없는 단계는 묻지 않음
  assert.deepEqual(pdcaIssues(c, { ...sk, C: [] }), []);
  assert.ok(mgCompositionIssues(c, sk).some((w) => w.startsWith("PDCA:")));
  assert.ok(!mgCompositionIssues(c).some((w) => w.startsWith("PDCA:")));
});

test("구성안 점검 「PDCA」: 절 안 단계 순서 거스름과 첫 절 밖 P 둘 이상은 절 이름과 한 줄씩(단계 없는 블록은 건너뜀)", () => {
  const sk = mgPdcaSkeleton(CARD);
  const blk = (at: string, stage?: "P" | "D" | "C" | "A") => ({ at, stage, label: "", kind: "bullets", materials: [], purpose: "목적" }) as unknown as Composition["blocks"][number];
  const part = (key: string, mark: string, title: string) => ({ key, mark, title }) as unknown as NonNullable<Composition["mg"]>["parts"][number];
  const mg = { parts: [part("a", "가", "첫째 절"), part("b", "나", "둘째 절")] } as unknown as Composition["mg"];
  const ok = { mg, blocks: [blk("a", "P"), blk("a", "D"), blk("a"), blk("a", "C"), blk("b", "P"), blk("b", "D"), blk("b", "C")] };
  assert.deepEqual(pdcaIssues(ok, sk), []);
  const bad = { mg, blocks: [blk("a", "P"), blk("a", "P"), blk("a", "D"), blk("a", "P"), blk("a", "C"), blk("b", "P"), blk("b", "P"), blk("b", "D"), blk("b", "C")] };
  const issues = pdcaIssues(bad, sk);
  assert.equal(issues.length, 2);
  assert.match(issues[0], /^PDCA: 가\. 첫째 절의 블록 단계 순서가 P → P → D → P → C/);
  assert.match(issues[1], /^PDCA: 나\. 둘째 절에 문제·계획\(P\) 블록이 2개/);
  assert.ok(issues.every((w) => warningLevel(w) === "info"));
});

test("구성안 점검 「PDCA」: 절을 닫는 마지막 「추진성과」 블록(C)은 순서 판정에서 뺌 — D → C → A → 추진성과는 정상, P·D·P → 추진성과는 여전히 경고", () => {
  const sk = mgPdcaSkeleton(CARD);
  const blk = (at: string, stage?: "P" | "D" | "C" | "A", label = "") => ({ at, stage, label, kind: "bullets", materials: [], purpose: "목적" }) as unknown as Composition["blocks"][number];
  const part = (key: string, mark: string, title: string) => ({ key, mark, title }) as unknown as NonNullable<Composition["mg"]>["parts"][number];
  const mg = { parts: [part("a", "가", "첫째 절")] } as unknown as Composition["mg"];
  const ok = { mg, blocks: [blk("a", "P", "문제"), blk("a", "D", "추진내용"), blk("a", "C", "점검"), blk("a", "A", "보완"), blk("a", "C", " 추진 성과 ")] };
  assert.deepEqual(pdcaIssues(ok, sk), []);
  const bad = { mg, blocks: [blk("a", "P", "문제"), blk("a", "D", "추진내용"), blk("a", "P", "재계획"), blk("a", "C", "추진성과")] };
  const issues = pdcaIssues(bad, sk);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^PDCA: 가\. 첫째 절의 블록 단계 순서가 P → D → P입니다/);
});
