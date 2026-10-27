// 경영관리 지표 단위 카드 밖 부분(R5a 결정론 코어 — unit-parts-mg.ts·unit-parts-html.ts·unit-parts-md.ts) 시험.
// 지키는 것: 지적 짝(짝·미반영·원문 다름·짝 없음) · 비고 쪽 · 평가내용 행(목차 대응 우선, 없으면 MG_CARD_EVALS) · 달성률(극성 둘·범위·숫자 아님·0 나누기·미입력) ·
// 계량 행 기본 체크·2025 셈 방향 · 표지 · 재료 판 · 지표별 부분 · HTML 이스케이프·장 순서 · 마크다운 → draftToKcaHwpx → validateHwpx ·
// 「2025 틀 재현」(git 밖 로컬 조각 resources/knowledge/_chunks/rpt25-mg-*.jsonl — 없으면 건너뜀).

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { parse, validateHwpx } from "kordoc";
import { draftToKcaHwpx } from "../hwpx/generate.ts";
import type { Block } from "./blocks.ts";
import type { ReportSectionSpec } from "./section.ts";
import { unitPartsHtml } from "./unit-parts-html.ts";
import { unitPartsMarkdown } from "./unit-parts-md.ts";
import {
  type MgUnitMaterials,
  type UnitCard,
  type UnitChunk,
  buildCoverPart,
  buildFindingsPart,
  buildOutcomePart,
  buildPriorPart,
  buildUnitPartsMg,
  cardEvals,
  cellBullets,
  evalShort,
  findingRemark,
  findingRowParts,
  findings2025Rows,
  inferPolarity,
  kpi2025Rows,
  kpiRate,
  mgUnitPartKeys,
  readNumber,
  sourceChanges,
  table2025Rows,
  unitPartsSource,
} from "./unit-parts-mg.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const card = (taskNo: string, data: Record<string, any> = {}, over: Partial<UnitCard> = {}): UnitCard => ({ id: `경영관리8/${taskNo}`, taskNo, title: `과제 ${taskNo}`, status: "active", dataRev: 0, data: { id: `경영관리8/${taskNo}`, ...data }, ...over });
const findingRows = (...rows: string[][]) => ({ findings: { rows: rows.map((f) => ({ finding: f.map((x) => `∙ ${x}`), plan: ["∙ 개선방안"] })) } });
const evaluator = (findings: Array<{ no: number; text: string }>, key = "plan-2607/eval25/MG-8/a/p02"): UnitChunk => ({ chunk_key: key, text: "", meta: { sub_label: "재무예산관리", findings } });

const ORIG_A = "①구분회계를 통한 사업단위별 손익 분석이 이루어지고 있으나 전파진흥원 자체 사업의 영업적자가 확대되고 있어 사업별 세밀한 손익 분석과 이를 성과 관리 체계와 연계하는 노력이 필요한 것으로 판단된다.";
const ORIG_B = "②자금운용 관련 전담부서 및 명문화된 검토 규정이 없어 위험 상품 운용 시 전문가 자문이 임의적으로 이루어지고 있는 만큼 자금운용 전문성을 제도적으로 뒷받침하는 체계 구축이 필요할 것으로 판단된다.";
const ORIG_C = "③일반관리비 비율이 전년 0.218에서 0.298로 크게 상승하여 계량지표 관리에 유의할 필요가 있다.";

test("지적 행 모으기: 활성 카드의 지적 행을 과제번호 순으로(「지적사항 없음」 줄·보관 카드 제외), 원문과 짝 · 원문 다름 · 짝 없음 · 미반영 지적", () => {
  const cards = [
    card("8-3", findingRows(["자체 사업의 영업 적자가 확대되고 있어 사업별 세밀한 손익 분석과 이를 성과 관리 체계와 연계하는 노력 필요"])),
    card("8-1", findingRows(["위험상품 투자 때 전문가 자문이 임의적 — 내부 심의 절차 마련"], ["직원 교육 만족도 조사 확대"], ["경영평가 지적사항 없음"])),
    card("8-2", findingRows(["자금운용 관련 전담부서 및 명문화된 검토 규정이 없어 위험 상품 운용 시 전문가 자문이 임의적"]), { status: "retired" }),
  ];
  const { part, warnings } = buildFindingsPart({ cards, evaluator: [evaluator([{ no: 1, text: ORIG_A }, { no: 2, text: ORIG_B }, { no: 3, text: ORIG_C }])] });
  assert.deepEqual(
    part.rows.map((r) => [r.code.cardId, r.code.rowIndex]),
    [
      ["경영관리8/8-1", 0],
      ["경영관리8/8-1", 1],
      ["경영관리8/8-3", 0],
    ],
    "과제번호 순, 없음 줄·보관 카드 제외",
  );
  assert.ok(part.rows.every((r) => r.id.startsWith(`${r.code.cardId}#t`)), "id = 카드 id#지적 글 열쇠(행 번호 아님)");
  const [r1, r2, r3] = part.rows;
  assert.equal(r1.code.source?.no, 2);
  assert.ok(r1.code.differs, "짝 문턱(0.25) 이상이지만 자동 짝 문턱(0.5) 아래 → 원문 다름");
  assert.equal(r2.code.source, null, "겹치는 원문이 없는 행");
  assert.equal(r3.code.source?.no, 1);
  assert.equal(r3.code.differs, false);
  assert.deepEqual(r3.code.finding, ["자체 사업의 영업 적자가 확대되고 있어 사업별 세밀한 손익 분석과 이를 성과 관리 체계와 연계하는 노력 필요"], "칸 글 = 카드 지적 줄(앞 기호 걷음)");
  assert.deepEqual(r3.code.plan, ["개선방안"]);
  assert.deepEqual(r3.ai.actions, [], "조치 및 개선실적은 AI 칸 — 비움");
  assert.deepEqual(part.code.unmatched.map((o) => o.no), [3]);
  assert.ok(warnings.includes("미반영 지적: (재무예산관리) 지적 ③ — 지표 안 어느 카드의 「지적 및 개선방안」에도 없음"));
  assert.ok(warnings.some((w) => w.startsWith("원문 다름: 8-1 지적 1행 ↔ (재무예산관리) 지적 ②")));
  assert.ok(warnings.some((w) => w.startsWith("원문 짝 없음: 8-1 지적 2행")));
});

const bul = (label: string, items: string[]): Block => ({ kind: "bullets", label, title: "", variant: "", text: "", items, cells: [], rows: [], series: [], badge: "" });
function mgSpec(): ReportSectionSpec {
  const parts = [
    { key: "1.1.가", evalNo: 1, evalTitle: "재무구조", themeNo: 1, themeTitle: "위험관리", mark: "가", title: "밴드형 위험관리 체계", story: "", why: "" },
    { key: "1.1.나", evalNo: 1, evalTitle: "재무구조", themeNo: 1, themeTitle: "위험관리", mark: "나", title: "자금운용 전문성 강화", story: "", why: "" },
  ] as any;
  return {
    version: 3,
    card: { id: "경영관리8/8-1", taskNo: "8-1", title: "과제" },
    business: { no: 8, name: "재무예산관리" },
    task: { no: "8-1", title: "과제", bp: false },
    sub: { mark: "", title: "", markers: ["지적개선"] },
    rows: [],
    results: [],
    caption: "",
    module: 2,
    blocks: [bul("추진내용", ["사업군별 밴드형 위험수준 관리와 월별 모니터링"]), bul("추진내용", ["자금운용 전담 검토 규정 신설과 전문가 자문 위원회 운영"])],
    mg: { indicator: "재무예산관리", parts, at: ["1.1.가", "1.1.나"] },
  };
}

test("비고 쪽(Q7): 행마다 지적개선 절(그 행만 남긴 카드로 mgFindingParts) → 지표 시작 쪽 + 지표 안 쪽 − 1, 이어진 쪽은 「~」·떨어진 쪽은 「, 」", () => {
  const c = { findings: { rows: [{ finding: ["∙ 밴드형 위험수준 관리 미흡"], plan: [] }, { finding: ["∙ 자금운용 전담 검토 규정 없음, 전문가 자문 임의"], plan: [] }] } };
  assert.deepEqual(findingRowParts(mgSpec(), c, 0), ["1.1.가"]);
  assert.deepEqual(findingRowParts(mgSpec(), c, 1), ["1.1.나"]);
  assert.deepEqual(findingRowParts(null, c, 0), [], "초안이 없으면 절 없음");
  // 저장 뒤 원장 맨 앞에 행이 끼어 번호가 밀려도, 저장된 지적 글로 지금 행을 찾음(못 찾으면 번호)
  const shifted = { findings: { rows: [{ finding: ["∙ 새로 끼운 지적"], plan: [] }, ...c.findings.rows] } };
  assert.deepEqual(findingRowParts(mgSpec(), shifted, 1, ["자금운용 전담 검토 규정 없음, 전문가 자문 임의"]), ["1.1.나"], "글로 찾음(번호 1이면 「밴드형」 행)");
  assert.deepEqual(findingRowParts(mgSpec(), shifted, 1, ["원장에 없는 글"]), ["1.1.가"], "못 찾으면 번호");
  const page = (k: string) => ({ "1.1.가": 3, "1.1.나": 4, "2.1.가": 6, "3.1.0": 7 })[k] ?? null;
  assert.equal(findingRemark(72, ["1.1.가"], page), "p.74");
  assert.equal(findingRemark(72, ["1.1.가", "1.1.나"], page), "p.74, 75");
  assert.equal(findingRemark(72, ["2.1.가", "1.1.가", "1.1.나"], page), "p.74, 75, 77");
  assert.equal(findingRemark(60, ["1.1.가", "1.1.나", "9.9.9", "2.1.가"], (k) => ({ "1.1.가": 3, "1.1.나": 4, "2.1.가": 5, "9.9.9": 6 })[k] ?? null), "p.62~65");
  assert.equal(findingRemark(72, ["없는 절"], page), "", "쪽을 모르면 빈 글");
  assert.equal(findingRemark(0, ["1.1.가"], page), "", "지표 시작 쪽이 없으면 빈 글");
});

const skeleton = (evals: Array<[number, string]>, prior: Record<number, string> = {}): UnitChunk[] => [
  ...evals.map(([no, title]) => ({ chunk_key: `rpt25-mg-08/MG-8/${no}/1/가`, text: "", meta: { chapter: "detail", eval_no: no, eval_title: title } })),
  ...Object.entries(prior).map(([no, text]) => ({ chunk_key: `rpt25-mg-08/MG-8/prior/${no}`, text, meta: { chapter: "prior", eval_no: Number(no) } })),
];

test("평가내용 행(prior): 2025 골격 번호·제목, 카드 ↔ 평가내용은 목차(1단·「걸침」·뺀 과제)가 있으면 그것 · 없으면 MG_CARD_EVALS, ’25까지 = 2025 「’25」 칸만(2026-10-16 사용자 결정)", () => {
  const prior1 = "’24년도까지의 주요실적 | ’25년도 주요실적 | 개선효과\n\n∙ 재무위험의 식별, / 목표조정 / - 세부 줄 | ∙ 밴드형 위험관리 | ∙ 개선 효과 | 표 | 칸";
  const rpt = skeleton([[1, "재무구조의 안정성"], [2, "예산편성"], [3, "재무성과"]], { 1: prior1 });
  const cards = [card("8-1"), card("8-2"), card("8-3")];
  const { part, warnings } = buildPriorPart({ cards, report2025: rpt });
  assert.deepEqual(part.rows.map((r) => [r.id, r.code.title, r.code.cards.map((c) => c.taskNo)]), [["prior/1", "재무구조의 안정성", ["8-1"]], ["prior/2", "예산편성", ["8-2"]], ["prior/3", "재무성과", ["8-3"]]], "목차 없음 → MG_CARD_EVALS(8-1→1·8-2→2·8-3→3)");
  assert.deepEqual(part.rows[0].human.upTo, ["밴드형 위험관리"], "둘째 칸(’25)만 — 첫째 칸(’24까지)은 넣지 않음");
  assert.deepEqual(part.rows[1].human.upTo, []);
  assert.deepEqual([part.rows[0].ai.now, part.rows[0].ai.effect], [[], []]);
  assert.deepEqual(warnings, []);
  const outline = [
    { card_id: "경영관리8/8-1", section: "평가내용 1. 재무구조", subsection: "평가내용 1·3에 걸침" },
    { card_id: "경영관리8/8-2", section: "평가내용 3. 재무성과", subsection: null },
    { card_id: "경영관리8/8-3", section: "평가내용 3. 재무성과", subsection: null, included: false },
  ];
  const withOutline = buildPriorPart({ cards, report2025: rpt, outline });
  assert.deepEqual(withOutline.part.rows.map((r) => r.code.cards.map((c) => c.taskNo)), [["8-1"], [], ["8-1", "8-2"]], "목차 대응이 먼저, 뺀 과제는 어디에도 없음");
  assert.deepEqual(withOutline.warnings, ["전년 대비: 평가내용2 — 대응 카드 없음(올해 칸을 채울 과제별 초안이 없음)"]);
  assert.deepEqual(cardEvals({ id: "x", taskNo: "99-9" }, [1, 2]), [1, 2], "대응표에 없는 과제는 평가내용 모두");
});

test("2025 표 칸 읽기: 「∙」 새 불릿 · 「-」 하위 줄 · 그 밖은 이어진 줄, 「〃」는 빈 칸 · 머리 문단은 뺌", () => {
  assert.deepEqual(cellBullets("∙ 가나다, / 라마 / - 하위 / ∙ 둘째"), ["가나다, 라마", "- 하위", "둘째"]);
  assert.deepEqual(cellBullets("〃"), []);
  assert.deepEqual(table2025Rows("머리 | 칸\n\n가 | 나\n\n다 | 라"), [["가", "나"], ["다", "라"]]);
  assert.deepEqual(kpi2025Rows("구분 | ’24년 / 실적 | ’25년 | 성과 분석\n\n〃 | 〃 | 목표 | 실적 | 달성률 | 〃\n\n윤리위험지수 / (하향지표) | 13.74점 | 13.5점 | 13.32점 | 101.4% | ∙ 감소\n\n- ※ 목표설정 : 4.0점 미만 105%"), [
    { name: "윤리위험지수 (하향지표)", prev: "13.74점", target: "13.5점", actual: "13.32점", rate: "101.4%" },
  ]);
  assert.deepEqual(findings2025Rows("지적/권고 사항 | 조치 | 비고\n\n∙ 첫 지적 / 이어짐 | ∙ 조치 | p.5\n\n〃 | 〃 | 〃\n\n∙ 둘째 | 〃 | ∙ 조치 | p.6"), [["첫 지적 이어짐"], ["둘째"]]);
});

const row = (target: string, actual: string, polarity: "up" | "down" = "up") => ({ code: { target, actual } as any, human: { checked: true, polarity } });

test("달성률: 높을수록 좋음 = 실적 ÷ 목표, 낮을수록 좋음 = 목표 ÷ 실적, 범위 목표·숫자 아님·0 나누기·미입력은 【확인】", () => {
  assert.deepEqual(kpiRate(row("36억원", "57억원")), { value: 158.3, text: "158.3%" });
  assert.deepEqual(kpiRate(row("31.6%", "31.7%", "down")), { value: 99.7, text: "99.7%" });
  assert.equal(kpiRate(row("1,194", "1,200")).text, "100.5%", "천 단위 쉼표");
  assert.equal(kpiRate(row("8.4(본원기준)", "8.4")).text, "100.0%", "괄호 덧붙임은 걷음");
  assert.equal(kpiRate(row("30%~35% 수준 유지", "31.5%")).text, "【확인: 범위 목표 — 달성 여부를 적음】");
  assert.equal(kpiRate(row("우수", "우수")).text, "【확인: 숫자로 못 읽는 값】");
  assert.equal(kpiRate(row("3등급", "3등급")).value, null, "등급은 크기 비교가 아님");
  assert.equal(kpiRate(row("11 / 14", "12")).value, null, "수가 둘");
  assert.equal(kpiRate(row("0건", "0건", "down")).text, "【확인: 0으로 나눌 수 없음】");
  assert.equal(kpiRate(row("0", "3")).text, "【확인: 0으로 나눌 수 없음】");
  assert.equal(kpiRate(row("90", "")).text, "【확인: 실적 미입력】");
  assert.equal(readNumber("-"), null);
  assert.equal(readNumber("年 6만원"), 6);
});

test("2025 셈 방향 추론: 달성률과 맞는 쪽(목표 = 실적·숫자 아님이면 정하지 않음)", () => {
  assert.equal(inferPolarity({ target: "31.6%", actual: "31.7%", rate: "99.7%" }), "down");
  assert.equal(inferPolarity({ target: "13.5점", actual: "13.32점", rate: "101.4%" }), "down");
  assert.equal(inferPolarity({ target: "36억원", actual: "57억원", rate: "158.3%" }), "up");
  assert.equal(inferPolarity({ target: "100%", actual: "100%", rate: "100.0%" }), null);
  assert.equal(inferPolarity({ target: "4등급", actual: "3등급", rate: "100.0%" }), null);
  assert.equal(inferPolarity({ target: "0건", actual: "0건", rate: "100.0%" }), null);
});

test("계량 표(Q5): 카드 계량 행 전부가 후보, 2025 표와 이름이 같은 행만 미리 체크 · 극성 기본은 2025 셈 방향 · 실적은 부서 입력(kpiKeyedRows) · 비계량·개선계획은 평가내용 줄임", () => {
  const kpi = { rows: [{ name: "부채비율", unit: "%", prev: "31.7%", target: "31.0%" }, { name: "-", prev: "", target: "" }, { name: "자산 운용 수익률", unit: "%", prev: "3.18", target: "3.3" }, { name: "영업이익률", prev: "0.6%", target: "0.9%" }] };
  const rpt = [
    ...skeleton([[1, "재무구조의 안정성 및 건전성 유지를 위한 기관의 노력과 성과"], [2, "예산편성(예비타당성 조사 등)을 통한 집행을 위한 노력과 성과"]]),
    { chunk_key: "k", text: "구분 | ’24년 / 실적 | ’25년 | 성과 분석\n\n〃 | 〃 | 목표 | 실적 | 달성률 | 〃\n\n부채비율 | 32.1% | 31.6% | 31.7% | 99.7% | ∙ 감소\n\n자산운용수익률 | 3.79% | 2.83% | 3.18% | 112.4% | ∙ 개선", meta: { chapter: "outcome", mark: "가" } },
  ];
  const { part, warnings } = buildOutcomePart({ cards: [card("8-1", { kpi })], report2025: rpt, kpiInputs: [{ "경영관리8/8-1#부채비율": "30.5%" }, { "경영관리8/8-1#부채비율": "30.5%", "경영관리8/8-1#자산 운용 수익률": "" }] });
  assert.deepEqual(part.kpi.map((k) => [k.id, k.human.checked, k.human.polarity, k.code.match2025, k.code.actual]), [
    ["경영관리8/8-1#부채비율", true, "down", "부채비율", "30.5%"],
    ["경영관리8/8-1#자산 운용 수익률", true, "up", "자산운용수익률", ""],
    ["경영관리8/8-1#영업이익률", false, "up", null, ""],
  ], "빈 자리표시 행(-)은 빼고 지표 이름을 키로");
  assert.equal(kpiRate(part.kpi[0]).text, "101.6%");
  assert.deepEqual(part.qual.map((r) => [r.id, r.human.label]), [["qual/1", "재무구조의 안정성 및 건전성 유지"], ["qual/2", "예산편성을 통한 집행"]]);
  assert.deepEqual(part.plan.map((r) => [r.id, r.ai.self, r.ai.plan]), [["plan/1", [], []], ["plan/2", [], []]]);
  assert.deepEqual(warnings, ["계량 표: 실적 미입력 1행(8-1 자산 운용 수익률) — 부서 경평 초안 「계량 실적」 입력이 필요"], "체크한 행만 경고");
  const conflict = buildOutcomePart({ cards: [card("8-1", { kpi })], report2025: rpt, kpiInputs: [{ "경영관리8/8-1#부채비율": "30.5%" }, { "경영관리8/8-1#부채비율": "30.9%" }] });
  assert.equal(conflict.part.kpi[0].code.actual, "30.5%");
  assert.ok(conflict.warnings[0].includes("부서 보고서마다 입력값이 다름"));
  assert.equal(evalShort("효율적인 예산편성 및 투명한 집행을 위한 기관의 노력과 성과"), "효율적인 예산편성 및 투명한 집행");
});

test("표지: 편람 지표 조각(비계량·가점 — 계량 구성요소는 뺌)의 지표정의·세부평가내용 머리 문장·가중치·평가방법, 판 표지는 revisionNote 그대로, 담당자 표는 사람 칸(빈 틀)", () => {
  const text = "지표정의: • 지속가능하고 건전한 재무구조 및\n합리적 예산운용을 평가한다.\n\n적용대상(배점): • 위탁집행형 준정부기관 : 비계량 3점\n\n세부평가내용: ① 재무구조의 안정성 및 건전성 유지를\n위한 기관의 노력과 성과\n- 부채 및 유동성 관리\n② 사업선정 및 타당성 확보\n(예비타당성 조사 등)를 통한 예산편성\n* 덧붙임";
  const handbook: UnitChunk[] = [
    { chunk_key: "plan-2607/handbook26/MG-8/k1", title: "'26 편람 · 재무예산관리 · 비계량", text, unit_type: "handbook_indicator", meta: { weight_quasi_gov: 3, weight_basis: "위탁집행형 준정부기관" } },
    { chunk_key: "plan-2607/handbook26/MG-8/k0", title: "'26 편람 · 재무예산관리 · 계량 (1/2)", text, unit_type: "handbook_indicator", meta: { weight_quasi_gov: 1 } },
    { chunk_key: "plan-2607/handbook26/BZ-1", title: "'26 편람 · 주요사업1 · 비계량", text, unit_type: "handbook_indicator", meta: {} },
  ];
  const { part, warnings } = buildCoverPart({ unit: "MG-8", handbook });
  assert.equal(part.code.indicator, "재무예산관리");
  assert.equal(part.code.components.length, 2, "계량 구성요소는 뺌");
  const [c, z] = part.code.components;
  assert.deepEqual([c.kind, c.method, c.weight, c.weightBasis, c.note], ["비계량", "9등급 평가", 3, "위탁집행형 준정부기관", ""]);
  assert.equal(c.definition, "지속가능하고 건전한 재무구조 및 합리적 예산운용을 평가한다.");
  assert.deepEqual(c.criteria, ["재무구조의 안정성 및 건전성 유지를 위한 기관의 노력과 성과", "사업선정 및 타당성 확보(예비타당성 조사 등)를 통한 예산편성"]);
  assert.match(z.note, /7월판 개선\(안\) 기준/, "7월판이 다른 조각은 판 표지");
  assert.equal(z.weight, null);
  assert.deepEqual(part.human.contacts, []);
  assert.deepEqual(warnings, []);
  assert.deepEqual(buildCoverPart({ unit: "MG-8", handbook: [] }).warnings, ["표지: 편람 지표 조각(비계량·가점)이 없음 — 표지를 채우지 못함"]);
});

test("지표별 부분: 지표 1~11은 넷, 혁신가점 12~14는 표지만, 모르는 단위는 없음", () => {
  assert.deepEqual(mgUnitPartKeys("MG-1"), ["cover", "findings", "prior", "outcome"]);
  assert.deepEqual(mgUnitPartKeys("MG-11"), ["cover", "findings", "prior", "outcome"]);
  assert.deepEqual(mgUnitPartKeys("MG-12"), ["cover"]);
  assert.deepEqual(mgUnitPartKeys("BZ-1"), []);
});

function materials(over: Partial<MgUnitMaterials> = {}): MgUnitMaterials {
  return {
    unit: "MG-8",
    year: 2026,
    cards: [card("8-1", { kpi: { rows: [{ name: "부채비율", prev: "31.7%", target: "31%" }] }, ...findingRows(["<script>alert(1)</script> 자금 | 운용"]) }), card("8-2")],
    drafts: [{ cardId: "경영관리8/8-1", updatedAt: "2026-10-16T01:00:00Z", spec: mgSpec() }],
    report2025: skeleton([[1, "재무구조"], [2, "예산편성"]], { 1: "머리\n\n∙ 지난 실적 | ∙ ’25 실적 | ∙ 효과" }),
    evaluator: [],
    handbook: [],
    kpiInputs: [{ "경영관리8/8-1#부채비율": "30%" }],
    ...over,
  };
}

test("재료 판: 카드 원장 판·초안 저장 시각·실적 입력이 바뀌거나 카드·초안이 생기고 빠지면 「재료가 바뀜」 사유", () => {
  const m = materials();
  const saved = unitPartsSource(m);
  assert.deepEqual(saved.cards, { "경영관리8/8-1": 0, "경영관리8/8-2": 0 });
  assert.deepEqual(saved.drafts, { "경영관리8/8-1": "2026-10-16T01:00:00Z" });
  assert.match(saved.inputs, /^[0-9a-f]{8}$/);
  assert.deepEqual(sourceChanges(saved, unitPartsSource(m)), [], "같은 재료면 바뀐 것 없음");
  assert.deepEqual(unitPartsSource({ ...m, kpiInputs: [{ "경영관리8/8-1#부채비율": "30%", "다른카드#0": "1" }] }).inputs, saved.inputs, "이 지표 카드 계량 행 밖의 입력은 판에 안 셈");
  const now = unitPartsSource({
    ...m,
    cards: [{ ...m.cards[0], dataRev: 2 }, card("8-3")],
    drafts: [{ cardId: "경영관리8/8-1", updatedAt: "2026-10-17T00:00:00Z", spec: mgSpec() }, { cardId: "경영관리8/8-3", updatedAt: "x", spec: mgSpec() }],
    kpiInputs: [{ "경영관리8/8-1#0": "29%" }],
  });
  assert.deepEqual(sourceChanges(saved, now), ["카드 8-1 원장이 바뀜", "카드 8-3가 새로 들어옴", "카드 8-2가 빠짐(보관 등)", "8-1 과제별 초안이 바뀜", "8-3 과제별 초안이 새로 생김", "계량 실적 입력이 바뀜"]);
});

test("한꺼번에 만들기: 지표 1~11은 네 부분 + 초안 없는 카드 경고, 혁신가점은 표지만", () => {
  const { parts, warnings } = buildUnitPartsMg(materials());
  assert.ok(parts.cover && parts.findings && parts.prior && parts.outcome);
  assert.ok(warnings.includes("초안 없음: 8-2 — 전년 대비·성과분석 문장의 재료가 카드 원장 칸뿐"));
  const bonus = buildUnitPartsMg(materials({ unit: "MG-13" }));
  assert.equal(bonus.parts.indicator, "AI 활용 혁신");
  assert.deepEqual([bonus.parts.findings, bonus.parts.prior, bonus.parts.outcome], [null, null, null]);
  assert.ok(!bonus.warnings.some((w) => w.startsWith("초안 없음")), "표지만 있는 지표는 초안 경고 없음");
});

test("미리보기 HTML: 모든 글 이스케이프 · 장 순서(표지 → Ⅰ 지적 → Ⅱ 전년 대비 → Ⅳ 성과분석) · MG-1은 한 칸 밀림 · 체크한 계량 행만 · 【확인】은 노란 칸 · 비고는 그릴 때 받은 값", () => {
  const { parts } = buildUnitPartsMg(materials({ handbook: [{ chunk_key: "plan-2607/handbook26/MG-8/k1", title: "'26 편람 · 재무예산관리 · 비계량", text: "지표정의: • 정의\n\n세부평가내용: ① 첫째", unit_type: "handbook_indicator", meta: { weight_quasi_gov: 3 } }] }));
  parts.outcome!.kpi[0].human.checked = true;
  const html = unitPartsHtml(parts, { remarks: { [parts.findings!.rows[0].id]: "p.74" } });
  assert.ok(!html.includes("<script>"), "카드 글의 태그는 이스케이프");
  assert.ok(html.includes("&lt;script&gt;alert(1)&lt;/script&gt; 자금 | 운용"));
  const order = ["재무예산관리", "9등급 평가", "Ⅰ. 2025년도 경영실적평가 지적사항 조치실적", "Ⅱ. 전년 대비 주요 추진실적", "평가내용1", "’25년도까지의 주요실적", "’26년도 주요실적", "Ⅳ. 성과분석 및 환류", "가. 계량 성과지표", "나. 비계량 성과지표", "향후 개선계획", "’27년 개선방안"];
  const at = order.map((x) => html.indexOf(x));
  assert.ok(at.every((i) => i >= 0), JSON.stringify(order.filter((_, i) => at[i] < 0)));
  assert.deepEqual([...at].sort((a, b) => a - b), at, "장 순서");
  assert.ok(!html.includes("Ⅲ."), "Ⅲ(세부평가내용별)은 과제별 초안 자리라 그리지 않음");
  assert.ok(html.includes(">p.74<"));
  assert.ok(html.includes("96.8%"), "2025 같은 이름 행이 없으면 극성 기본 up: 30 ÷ 31");
  assert.ok(!html.includes("원문 다름"), "marks 끄면 화면 꼬리표 없음");
  const one = unitPartsHtml({ ...parts, unit: "MG-1" });
  assert.ok(one.includes("Ⅱ. 2025년도 경영실적평가 지적사항 조치실적") && one.includes("Ⅴ. 성과분석 및 환류"), "MG-1은 지표관리 방향 자리만큼 밀림");
  const need = unitPartsHtml({ ...parts, outcome: { ...parts.outcome!, kpi: [{ ...parts.outcome!.kpi[0], code: { ...parts.outcome!.kpi[0].code, actual: "" } }] } });
  assert.ok(need.includes('<span class="k-need" title="담당자 확인 — 채울 자료">실적 미입력</span>'));
  const off = unitPartsHtml({ ...parts, outcome: { ...parts.outcome!, kpi: parts.outcome!.kpi.map((k) => ({ ...k, human: { ...k.human, checked: false } })) } });
  assert.ok(!off.includes("부채비율"), "체크하지 않은 행은 그리지 않음");
});

test("개조식 마크다운: 장 □ · 평가내용 2열 머리 표 · 계량 2단 머리 · 칸의 「|」 이스케이프 · 【확인】 그대로 → draftToKcaHwpx 변환·validateHwpx 통과·다시 읽힘", async () => {
  const { parts } = buildUnitPartsMg(materials());
  parts.outcome!.kpi[0].human.checked = true;
  parts.outcome!.kpi[0].code.actual = "";
  const md = unitPartsMarkdown(parts, { remarks: { [parts.findings!.rows[0].id]: "p.74" } });
  const l = md.split("\n");
  assert.equal(l[0], "재무예산관리 2026년도 경영실적보고서 카드 밖 부분 초안");
  assert.ok(l.includes("□ Ⅰ. 2025년도 경영실적평가 지적사항 조치실적"));
  assert.ok(l.includes("| ∙ <script>alert(1)</script> 자금 \\| 운용 |   | p.74 |"), "칸 글의 세로줄은 이스케이프");
  assert.ok(l.includes("| 평가내용1 | 재무구조 |"));
  assert.ok(l.includes("| 구분 | ’25년 실적 | ’26년 > 목표 | ’26년 > 실적 | ’26년 > 달성률 | 성과 분석 |"));
  assert.ok(l.includes("| 부채비율 | 31.7% | 31% | 【확인: 실적 미입력】 |   |   |"));
  assert.ok(l.includes("ㅇ **2. 향후 개선계획**"));
  const { bytes, warnings } = await draftToKcaHwpx(md.replace("<script>alert(1)</script> ", ""));
  assert.ok(warnings.every((w) => w.includes("요약박스")), JSON.stringify(warnings));
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const back: any = await parse(Buffer.from(bytes));
  assert.ok(back.success);
  for (const x of ["지적사항 조치실적", "전년 대비 주요 추진실적", "평가내용1", "’25 실적", "성과분석 및 환류", "부채비율", "향후 개선계획"]) assert.ok(back.markdown.includes(x), `「${x}」가 한글 파일에 없음`);
});

// ---------------------------------------------------------------------------
// 2025 틀 재현 — 같은 코어에 2025 보고서 조각(평가내용 골격·표 칸)을 재료로 넣어 2025 표의 행 수·값이 다시 나오는지

const CHUNKS = resolve(import.meta.dirname, "../../resources/knowledge/_chunks");
const UNITS = Array.from({ length: 11 }, (_, i) => i + 1);
const fileOf = (n: number) => resolve(CHUNKS, `rpt25-mg-${String(n).padStart(2, "0")}.jsonl`);
const HAVE = UNITS.every((n) => existsSync(fileOf(n)));
const load = (n: number): UnitChunk[] => readFileSync(fileOf(n), "utf8").trim().split("\n").map((x) => JSON.parse(x));

/** 2025 지적 표 행 수(PDF 지적 칸 「∙」 행 — 「〃」 병합 행은 셈하지 않음, 2026-10-16 조각 글로 확인) */
const FINDINGS_2025: Record<number, number> = { 1: 8, 2: 4, 3: 1, 4: 2, 5: 2, 6: 3, 7: 4, 8: 3, 9: 4, 10: 2, 11: 3 };
/** 2025 계량 표 행 수 */
const KPI_2025: Record<number, number> = { 1: 9, 2: 5, 3: 8, 4: 5, 5: 4, 6: 8, 7: 9, 8: 6, 9: 9, 10: 6, 11: 5 };
/**
 * 2025 달성률을 코어가 다시 못 내는 행과 까닭(숫자로 셀 수 없음 — 코어는 【확인】로 남김, 사람이 적음).
 * MG-9 조직몰입도는 4.12 ÷ 4.04 = 101.98%를 2025 표가 101.9%로 적음(원 자료 소수 자리 차이 — 코어는 표에 적힌 값으로 셈)
 */
const RATE_DIFF: Record<number, string[]> = {
  1: ["현장 근로자 무사고 달성"], // 0건 → 0건(0으로 나눌 수 없음)
  2: ["종합청렴도"], // 등급
  3: ["채용비위 지적건수"], // 「-」
  4: ["사이버안전사고 발생"], // 0건 → 0건
  6: ["공공데이터 평가 달성도"], // 「우수등급」
  7: ["지역사회공헌인정제 등급"], // 「최고등급」
  9: ["조직몰입도"], // 반올림 차이(위)
};
/** 비계량·향후 개선계획 행 수 — 코어는 평가내용마다 한 행(지시 — 구분 = 평가내용 줄임), 2025는 지표마다 다르게 묶음(아래 값과 다른 지표는 사람이 행을 나누거나 합침) */
const QUAL_2025: Record<number, number> = { 1: 3, 2: 3, 3: 4, 4: 8, 5: 5, 6: 3, 7: 4, 8: 3, 9: 3, 10: 3, 11: 4 };
const PLAN_2025: Record<number, number> = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3, 7: 3, 8: 3, 9: 4, 10: 3, 11: 3 };

test("2025 틀 재현(지표 1~11): 평가내용 행 = 2025 전년 대비 표 수, 지적 행 = 2025 지적 표(2025 지적 칸을 카드 행으로 넣으면 모두 짝·미반영 없음), 계량 행 = 2025 계량 표(모두 체크·달성률 재현 — 숫자로 못 세는 행만 다름), 비계량·개선계획은 평가내용마다(2025와 다른 지표는 묶음이 다름)", { skip: !HAVE && "원본 조각(resources/knowledge/_chunks/rpt25-mg-01~11.jsonl)이 없음" }, () => {
  const table: string[] = [];
  for (const n of UNITS) {
    const unit = `MG-${n}`;
    const rpt = load(n);
    const chapter = (ch: string, mark?: string) => rpt.find((c) => c.meta?.chapter === ch && (mark === undefined || c.meta?.mark === mark || (mark === "" && !c.meta?.mark)));
    const f25 = findings2025Rows(chapter("findings")!.text);
    const k25 = kpi2025Rows(chapter("outcome", "가")!.text);
    const c = card(`${n}-1`, {
      findings: { rows: f25.map((f) => ({ finding: f.map((x) => `∙ ${x}`), plan: [] })) },
      kpi: { rows: k25.map((k) => ({ name: k.name, prev: k.prev, target: k.target })) },
    });
    c.id = `경영관리${n}/${n}-1`;
    const inputs = Object.fromEntries(k25.map((k) => [`${c.id}#${k.name.trim().replace(/\s+/g, " ")}`, k.actual]));
    const { parts } = buildUnitPartsMg({ unit, year: 2025, cards: [c], drafts: [], report2025: rpt, evaluator: [evaluator(f25.map((f, i) => ({ no: i + 1, text: f.join(" ") })))], handbook: [], kpiInputs: [inputs] });
    const priorCount = rpt.filter((x) => x.meta?.chapter === "prior").length;
    assert.equal(parts.prior!.rows.length, priorCount, `${unit} 평가내용 행`);
    assert.ok(parts.prior!.rows.every((r) => r.human.upTo.length > 0), `${unit} ’24까지·’25 출발값`);
    assert.equal(f25.length, FINDINGS_2025[n], `${unit} 2025 지적 행`);
    assert.equal(parts.findings!.rows.length, FINDINGS_2025[n], `${unit} 코어 지적 행`);
    assert.ok(parts.findings!.rows.every((r) => r.code.source && !r.code.differs), `${unit} 지적 짝`);
    assert.deepEqual(parts.findings!.code.unmatched, [], `${unit} 미반영 없음`);
    assert.equal(parts.outcome!.kpi.length, KPI_2025[n], `${unit} 계량 행`);
    assert.ok(parts.outcome!.kpi.every((k) => k.human.checked), `${unit} 2025와 같은 이름 → 모두 체크`);
    const miss = parts.outcome!.kpi.filter((k, i) => kpiRate(k).text !== k25[i].rate).map((k) => k.code.name);
    assert.deepEqual(miss, RATE_DIFF[n] ?? [], `${unit} 2025 달성률을 다시 못 내는 행`);
    assert.equal(parts.outcome!.qual.length, priorCount, `${unit} 비계량 행 = 평가내용 수`);
    assert.equal(table2025Rows(chapter("outcome", "나")!.text).length, QUAL_2025[n], `${unit} 2025 비계량 행`);
    assert.equal(table2025Rows(rpt.find((x) => x.meta?.chapter === "outcome" && x.meta?.theme_no === 2)!.text).length, PLAN_2025[n], `${unit} 2025 개선계획 행`);
    table.push(`${unit} 평가내용 ${priorCount} · 지적 ${f25.length} · 계량 ${k25.length}(달성률 다름 ${miss.length}) · 비계량 2025 ${QUAL_2025[n]}/코어 ${priorCount} · 개선계획 2025 ${PLAN_2025[n]}/코어 ${priorCount}`);
  }
  assert.equal(table.length, 11);
});
