// 경영관리 지표 단위 부분 AI 문장 칸 채우기(R5c — unit-parts-ai.ts·resources/prompts/report-unit-mg) 시험.
// 지키는 것: 쓸 칸(빈 칸만·덮어쓰기·고르지 않은 계량 행 제외) · 요청 글(자리표시 없음·행 열쇠·재료 블록, 카드 전용 자료·보고서 추가자료가 안 들어감) ·
// 답 정리(모르는 행 버림·코드·사람 칸과 이미 쓴 칸 거절·줄 수 상한·빈 답 칸은 안 씀) · 숫자 대조(근거 = 카드·과제별 초안·실적 입력·달성률·2025 보고서·핵심공통항목 —
// 평가위원 지적 원문·시정조치 계획의 수치는 근거 아님) · 【확인】 셈 · 답 스키마에 한 값 enum·literal 없음 · AI 경고 갈아 끼우기.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { reportUnitPromptsMg } from "../prompts/sets.ts";
import type { Block } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";
import { type UnitAiInput, UNIT_AI_WARN, UnitAiOut, applyUnitAiAnswer, orderedCards, unitAiBudgetsOf, unitAiCells, unitAiKnownNumbers, unitAiPrompt, unitAiTargets, withAiWarnings } from "./unit-parts-ai.ts";
import { type MgUnitMaterials, type UnitCard, type UnitChunk, buildFindingsPart, buildOutcomePart, buildPriorPart } from "./unit-parts-mg.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = resolve(import.meta.dirname, "../..");
const card = (taskNo: string, data: Record<string, any> = {}): UnitCard => ({ id: `경영관리8/${taskNo}`, taskNo, title: `과제 ${taskNo}`, status: "active", dataRev: 3, data: { id: `경영관리8/${taskNo}`, taskNo, ...data } });
const bul = (label: string, items: string[]): Block => ({ kind: "bullets", label, title: "", variant: "", text: "", items, cells: [], rows: [], series: [], badge: "" });
const spec = (taskNo: string, items: string[]): ReportSectionSpec =>
  ({
    version: 3,
    card: { id: `경영관리8/${taskNo}`, taskNo, title: "과제" },
    business: { no: 8, name: "재무예산관리" },
    task: { no: taskNo, title: "과제", bp: false },
    sub: { mark: "", title: "", markers: [] },
    rows: [],
    results: [],
    caption: "",
    module: 1,
    blocks: [bul("추진내용", items)],
    mg: { indicator: "재무예산관리", parts: [{ key: "1.1.가", evalNo: 1, evalTitle: "재무구조", themeNo: 1, themeTitle: "위험관리", mark: "가", title: "밴드형 위험관리 체계", story: "", why: "" }], at: ["1.1.가"] },
  }) as any;

const ORIG = "자금운용 관련 전담부서 및 명문화된 검토 규정이 없어 위험 상품 운용 시 전문가 자문이 임의적으로 이루어지고 있어 체계 구축이 필요(일반관리비 비율 0.298)";

function materials(): MgUnitMaterials {
  const cards = [
    card("8-2", { kpi: { rows: [{ name: "자금운용 수익률", unit: "%", prev: "3.1", target: "3.5" }] } }),
    card("8-1", {
      findings: { rows: [{ finding: ["∙ 자금운용 전담부서 및 명문화된 검토 규정이 없어 위험 상품 운용 시 전문가 자문이 임의적"], plan: ["∙ 자금운용 심의 규정 신설"] }] },
      kpi: { rows: [{ name: "부채비율", unit: "%", prev: "31.7", target: "31" }] },
    }),
  ];
  const report2025: UnitChunk[] = [
    { chunk_key: "rpt25-mg-08/d1", title: "2025 보고서 평가내용 1", text: "", meta: { chapter: "detail", eval_no: 1, eval_title: "재무구조 안정화 노력과 성과" } },
    { chunk_key: "rpt25-mg-08/p1", title: "2025 보고서 전년 대비 평가내용 1", text: "구분 | ’24까지 | ’25\n\n∙ 위험관리 4,321건 | ∙ 밴드형 관리 | 〃", meta: { chapter: "prior", eval_no: 1 } },
    { chunk_key: "rpt25-mg-08/o", title: "2025 보고서 성과분석 가. 계량", text: "구분 | ’24 실적 | 목표 | 실적 | 달성률\n\n부채비율 | 32.1 | 31.6 | 31.7 | 99.7%", meta: { chapter: "outcome", mark: "가" } },
  ];
  return {
    unit: "MG-8",
    year: 2026,
    cards,
    drafts: [{ cardId: "경영관리8/8-1", updatedAt: "2026-10-16T00:00:00Z", spec: spec("8-1", ["자금운용 심의위원회 신설로 위험상품 투자 17건 사전 심의"]) }],
    report2025,
    evaluator: [{ chunk_key: "plan-2607/eval25/MG-8/a", title: "’25 평가위원 의견 · 재무예산관리", text: ORIG, meta: { sub_label: "재무예산관리", findings: [{ no: 2, text: ORIG }] } }],
    handbook: [{ chunk_key: "plan-2607/handbook26/MG-8/x", title: "편람 · 재무예산관리 · 비계량", text: "지표정의: 재무 건전성", unit_type: "handbook_indicator", meta: {} }],
    outline: [
      { card_id: "경영관리8/8-2", section: "평가내용 1.", subsection: null, sort: 1 },
      { card_id: "경영관리8/8-1", section: "평가내용 1.", subsection: null, sort: 2 },
    ],
    kpiInputs: [{ "경영관리8/8-1#0": "30.5" }],
  };
}

function input(overwrite = false): UnitAiInput {
  const m = materials();
  const outcome = buildOutcomePart(m).part;
  return {
    materials: m,
    corrective: [{ chunk_key: "corr25-2610/MG-8/01", title: "'25 지적 시정조치 계획 · 지표8 1번", text: "조치계획: 자금운용 규정 개정으로 위원 9명 위촉", unit_type: "corrective_action", meta: {} }],
    core: [{ chunk_key: "core25-mg/3-1", title: "핵심공통항목 '25 · 재무예산관리", text: "부채비율 31.7 · 자산 1,234억", unit_type: "core_item", meta: {} }],
    indicator: "재무예산관리",
    parts: { findings: buildFindingsPart(m).part, prior: buildPriorPart(m).part, outcome: { ...outcome, kpi: outcome.kpi.map((k) => ({ ...k, human: { ...k.human, checked: k.code.name === "부채비율" } })) } },
    overwrite,
  };
}

test("쓸 칸: 지적 조치·전년 대비 둘·계량(고른 행만)·비계량 둘·개선계획 둘, 빈 칸만이 기본이고 덮어쓰기는 쓴 칸도", () => {
  const x = input();
  const cells = unitAiCells(x.parts, 2026, "MG-8");
  assert.deepEqual(
    cells.map((c) => `${c.row}.${c.field}`),
    ["F1.actions", "P1.now", "P1.effect", "K1.analysis", "Q1.result", "Q1.analysis", "L1.self", "L1.plan"],
    "계량은 고른 행(8-1 부채비율)만 — 8-2 수익률(K2)은 고르지 않아 빠짐",
  );
  assert.equal(cells[0].path, "rows.0.ai.actions");
  assert.equal(cells[3].path, "kpi.0.ai.analysis");
  assert.equal(cells[0].label, "조치 및 개선실적");
  assert.equal(cells[1].label, "’26년도 주요실적");
  const filled = { ...x.parts, findings: { ...x.parts.findings!, rows: (x.parts.findings as any).rows.map((r: any) => ({ ...r, ai: { actions: ["이미 쓴 글"] } })) } } as any;
  const c2 = unitAiCells(filled, 2026, "MG-8");
  assert.ok(!unitAiTargets(c2, false).some((c) => c.row === "F1"), "빈 칸만 — 쓴 칸은 빠짐");
  assert.ok(unitAiTargets(c2, true).some((c) => c.row === "F1"), "덮어쓰기 — 쓴 칸도");
});

test("요청 글: 자리표시가 남지 않고, 행 열쇠·재료 블록(카드 원장·과제별 초안 목차 순·실적 입력·평가위원 지적·시정조치 약속 표지·2025 같은 장·핵심공통항목·편람)이 들어감", () => {
  const p = reportUnitPromptsMg().prompts;
  const text = unitAiPrompt(p, input());
  assert.doesNotMatch(text, /\{\{\w+\}\}/);
  for (const phrase of ["[F1] 카드 8-1 지적 1행", "[P1] 평가내용1", "[K1] 계량 「부채비율」", "[Q1] 비계량", "[L1] 향후 개선계획", 'field="actions"', "### 8-1 과제별 초안", "### 8-2 — 과제별 초안 없음", "- 8-1 부채비율: 30.5", "※ 시정조치 계획 — 조치계획은", "2025 보고서 전년 대비 평가내용 1", "핵심공통항목 '25", "편람 · 재무예산관리", "달성률 101.6%", "쓸 칸」 8개"])
    assert.ok(text.includes(phrase), phrase);
  assert.ok(text.indexOf("### 카드 8-2") < text.indexOf("### 카드 8-1"), "카드는 목차 순(sort)");
  assert.ok(!text.includes("2025 보고서 평가내용 1\n"), "2025 세부평가내용별 본문은 넣지 않음(카드 밖 장만)");
  assert.deepEqual(orderedCards(materials()).map((c) => c.taskNo), ["8-2", "8-1"]);
  // 빈 칸만 모드: 쓴 칸은 「이미 쓴 칸」으로만
  const x = input();
  (x.parts.findings as any).rows[0].ai.actions = ["이미 쓴 조치"];
  const t2 = unitAiPrompt(p, x);
  assert.ok(t2.includes("- 이미 쓴 칸 조치 및 개선실적(쓰지 않음): 이미 쓴 조치"));
  assert.match(unitAiPrompt(p, { ...x, overwrite: true }), /field="actions"\(조치 및 개선실적\) — 약 \d+자 안팎\(최대 \d줄 · 한 줄 \d+자 안팎\) · 지금 글: 이미 쓴 조치/);
});

test("요청 글: 카드 전용 자료·보고서 추가자료 원문은 넣지 않음(금기 4 — 사용자 확인 2026-10-16) — 재료에 섞여 와도 안 씀, 조회 코드도 그 표를 읽지 않음", () => {
  const x = input();
  // 누가 재료 객체에 첨부 글을 끼워 넣어도(카드 data의 첨부 칸·재료의 files) 요청 글에 나오지 않음
  (x.materials as any).files = [{ name: "비밀첨부.pdf", text: "카드전용자료원문 777,777" }];
  (x.materials as any).reportMaterials = [{ name: "추가자료.hwp", text: "보고서추가자료원문" }];
  const text = unitAiPrompt(reportUnitPromptsMg().prompts, x);
  assert.ok(!text.includes("카드전용자료원문") && !text.includes("보고서추가자료원문") && !text.includes("비밀첨부"));
  // 재료를 읽는 코드(조회·서버 액션·이 모듈)는 첨부 표·저장 글을 부르지 않음
  for (const f of ["lib/reports/unit-parts-ai.ts", "lib/reports/unit-parts-queries.ts", "app/(app)/reports/business/[unit]/parts/actions.ts"]) {
    const src = readFileSync(resolve(ROOT, f), "utf8").replace(/^\s*\/\/.*$/gm, "");
    for (const banned of ["card_materials", "report_materials", "loadMaterialTexts", "parsed_text", "loadCardBundle"]) assert.ok(!src.includes(banned), `${f}에 ${banned}`);
  }
});

test("답 정리: 모르는 행은 버리고, 코드·사람 칸과 빈 칸만 모드의 쓴 칸은 거절, 줄 정리·상한, 빈 답 칸은 쓰지 않음", () => {
  const x = input();
  (x.parts.prior as any).rows[0].ai.now = ["사람이 쓴 실적"];
  const targets = unitAiTargets(unitAiCells(x.parts, 2026, "MG-8"), false);
  const known = unitAiKnownNumbers(x);
  const r = applyUnitAiAnswer(
    x.parts,
    targets,
    {
      cells: [
        { row: "[F1]", field: "actions", lines: ["∙ 자금운용 심의위원회 신설로 위험상품 17건 사전 심의", "- 심의 규정 제정", " "] },
        { row: "F1", field: "actions", lines: ["두 번째(버림)"] },
        { row: "F1", field: "finding", lines: ["지적 글 고쳐 쓰기"] },
        { row: "P1", field: "upTo", lines: ["’25까지 고쳐 쓰기"] },
        { row: "P1", field: "now", lines: ["사람 글 덮기"] },
        { row: "P1", field: "effect", lines: ["1", "2", "3", "4", "5", "6", "7"] },
        { row: "K2", field: "analysis", lines: ["고르지 않은 행"] },
        { row: "X9", field: "actions", lines: ["모르는 행"] },
        { row: "Q1", field: "result", lines: [] },
      ],
      note: "근거가 모자란 칸이 있음",
    },
    known,
  );
  const f = r.parts.findings as any;
  assert.deepEqual(f.rows[0].ai.actions, ["자금운용 심의위원회 신설로 위험상품 17건 사전 심의", "- 심의 규정 제정"], "앞 기호 걷음·「- 」 하위 줄 그대로·빈 줄 뺌·두 번째 답 무시");
  assert.deepEqual(f.rows[0].code.finding, (x.parts.findings as any).rows[0].code.finding, "지적 글(코드 칸)은 그대로");
  const pr = r.parts.prior as any;
  assert.deepEqual(pr.rows[0].ai.now, ["사람이 쓴 실적"], "빈 칸만 모드 — 쓴 칸은 덮지 않음");
  assert.equal(pr.rows[0].ai.effect.length, 6, "칸 줄 수 상한(6)");
  assert.deepEqual((r.parts.outcome as any).qual[0].ai.result, [], "빈 답 칸은 쓰지 않음");
  assert.equal(r.filled.findings, 1);
  assert.equal(r.filled.prior, 1);
  assert.ok(r.notes.some((n) => n === "모르는 행 1개를 버림(요청에 없는 행 열쇠)"));
  assert.ok(r.notes.some((n) => n.startsWith("쓸 수 없는 칸 4개를 거절") && n.includes("F1.finding") && n.includes("P1.upTo") && n.includes("P1.now") && n.includes("K2.analysis")));
  assert.ok(r.notes.some((n) => n.startsWith("같은 칸을 두 번")));
  assert.ok(r.notes.some((n) => n.startsWith("줄이 6개를 넘는 칸 1개")));
  assert.ok(r.notes.includes("AI 메모: 근거가 모자란 칸이 있음"));
  assert.ok(r.warnings.outcome!.some((w) => w.startsWith(`${UNIT_AI_WARN} 쓸 칸 5개 중 5개를 채우지 않음`)));
});

test("숫자 대조: 근거 = 카드·과제별 초안·실적 입력·앱 달성률·2025 보고서·핵심공통항목, 평가위원 지적 원문·시정조치 계획의 수치는 근거 아님 · 【확인】 안 숫자는 안 셈", () => {
  const x = input();
  const targets = unitAiTargets(unitAiCells(x.parts, 2026, "MG-8"), false);
  const r = applyUnitAiAnswer(
    x.parts,
    targets,
    {
      cells: [
        { row: "F1", field: "actions", lines: ["심의 17건(초안) · 부채비율 31.7(카드·전년 표) · 4,321건(전년 표) · 1,234억(핵심공통항목)"] },
        { row: "K1", field: "analysis", lines: ["실적 30.5로 목표 31 대비 달성률 101.6%"] },
        { row: "P1", field: "now", lines: ["일반관리비 비율 0.298(평가위원 지적 수치) · 위원 99명(시정조치 계획 수치 아님 — 지어냄) · 위원 9명(약속)"] },
        { row: "Q1", field: "result", lines: ["【확인: ’26년 실적 55건】"] },
      ],
      note: "",
    },
    unitAiKnownNumbers(x),
  );
  assert.deepEqual(r.unknownNumbers.sort(), ["0.298", "99"].sort(), "평가위원 지적 수치·지어낸 수치만 없는 숫자(한 자리 수 9는 대조하지 않음)");
  assert.equal(r.needs, 1);
  assert.ok(r.warnings.prior!.some((w) => w.startsWith(`${UNIT_AI_WARN} 근거에 없는 숫자 2개`)));
  assert.ok(r.warnings.outcome!.some((w) => w === `${UNIT_AI_WARN} 【확인】 1곳 — 근거가 없어 채울 자료를 적어 둔 자리`));
  assert.ok(!(r.warnings.findings ?? []).some((w) => w.includes("없는 숫자")), "근거에 있는 숫자는 경고 없음");
});

test("칸 글자 예산: 요청 글의 쓸 칸마다 「약 N자 안팎(최대 M줄)」(이미 쓴 칸은 없음) · 시스템에 예산 규칙 · 답이 예산의 1.3배를 넘으면 자르지 않고 경고", () => {
  const p = reportUnitPromptsMg().prompts;
  const x = input();
  const budgets = unitAiBudgetsOf(x);
  const text = unitAiPrompt(p, x);
  const k1 = budgets.cells["K1|analysis"];
  assert.ok(text.includes(`- 쓸 칸 field="analysis"(성과 분석) — 약 ${k1.chars}자 안팎(최대 ${k1.lines}줄 · 한 줄 ${Math.round(k1.chars / k1.lines)}자 안팎)`), "계량 칸 예산");
  assert.ok(text.includes(`field="actions"(조치 및 개선실적) — 약 ${budgets.cells["F1|actions"].chars}자 안팎`));
  (x.parts.findings as any).rows[0].ai.actions = ["이미 쓴 조치"];
  assert.ok(!/이미 쓴 칸 조치 및 개선실적[^\n]*약 \d+자/.test(unitAiPrompt(p, x)), "이미 쓴 칸에는 예산을 적지 않음");
  assert.ok(p.system.system.includes("칸 예산") && p.system.system.includes("덜 중요한 하위 줄") && p.system.system.includes("【확인: …】은 남깁니다"));
  // 답 정리: F1은 예산의 1.3배 넘음 → 경고(자르지 않음), K1은 예산 안 → 경고 없음
  const y = input();
  const b = unitAiBudgetsOf(y);
  const targets = unitAiTargets(unitAiCells(y.parts, 2026, "MG-8"), false);
  const longLine = "가".repeat(Math.ceil(b.cells["F1|actions"].chars * 1.3) + 5);
  const r = applyUnitAiAnswer(y.parts, targets, { cells: [{ row: "F1", field: "actions", lines: [longLine] }, { row: "K1", field: "analysis", lines: ["가".repeat(b.cells["K1|analysis"].chars)] }], note: "" }, unitAiKnownNumbers(y), b);
  assert.deepEqual((r.parts.findings as any).rows[0].ai.actions, [longLine], "자르지 않음");
  assert.ok(r.warnings.findings!.includes(`${UNIT_AI_WARN} 칸 글이 길어 쪽이 넘칠 수 있음: F1 조치 및 개선실적 ${longLine.length}자 / 예산 ${b.cells["F1|actions"].chars}자`));
  assert.ok(!(r.warnings.outcome ?? []).some((w) => w.includes("칸 글이 길어")), "예산 안이면 경고 없음");
  // 예산을 안 주면(옛 호출) 경고도 없음
  const r2 = applyUnitAiAnswer(y.parts, targets, { cells: [{ row: "F1", field: "actions", lines: [longLine] }], note: "" }, unitAiKnownNumbers(y));
  assert.ok(!(r2.warnings.findings ?? []).some((w) => w.includes("칸 글이 길어")));
});

test("칸 예산으로도 앞 장이 2025 쪽에 안 들면(코드·사람 칸이 긺) 전년 대비 부분에 한 번 알림", () => {
  const y = input();
  (y.parts.prior as any).rows[0].human.upTo = ["가".repeat(900)];
  const b = unitAiBudgetsOf(y);
  assert.equal(b.front.fits, false);
  const targets = unitAiTargets(unitAiCells(y.parts, 2026, "MG-8"), false);
  const r = applyUnitAiAnswer(y.parts, targets, { cells: [{ row: "P1", field: "now", lines: ["실적"] }], note: "" }, unitAiKnownNumbers(y), b);
  assert.ok(r.warnings.prior!.some((w) => w.startsWith(`${UNIT_AI_WARN} 앞 장(지적사항 조치실적 + 전년 대비)은 AI 칸을 비워도 어림`) && w.includes("2025 1쪽에 들지 않음")));
  assert.ok(!(r.warnings.findings ?? []).some((w) => w.includes("앞 장")), "앞 장 알림은 한 번만");
});

test("답 스키마: 행 열쇠·칸 이름은 문자열(한 값 enum·literal 없음) · 모델용 스키마에 schema.md 설명", () => {
  const json = JSON.stringify(z.toJSONSchema(UnitAiOut));
  assert.ok(!json.includes('"enum"') && !json.includes('"const"'), json);
  const model = JSON.stringify(z.toJSONSchema(reportUnitPromptsMg().schema));
  assert.ok(model.includes("행 열쇠") && model.includes("칸 이름"));
  assert.ok(!model.includes('"enum"') && !model.includes('"const"'));
  assert.match(reportUnitPromptsMg().prompts.version, /^report-unit-mg@[0-9a-f]{8}$/);
});

test("AI 경고 갈아 끼우기: 앞 AI 채우기 경고만 빼고 새 것을 붙임(재료 경고는 그대로)", () => {
  assert.deepEqual(withAiWarnings(["미반영 지적: 지적 ③", `${UNIT_AI_WARN} 옛 경고`], [`${UNIT_AI_WARN} 새 경고`]), ["미반영 지적: 지적 ③", `${UNIT_AI_WARN} 새 경고`]);
});
