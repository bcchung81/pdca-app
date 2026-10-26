// 지표 단위 부분 병합·칸 고치기(lib/reports/unit-parts-edit.ts — R5b 뒷단) 시험.
// 지키는 것: 다시 채우기는 code 칸만 새 값·ai·human 칸은 남김 · 행 정체로 짝(지적 = 카드 id#지적 글 열쇠 — 옛 카드 id#행 번호도 같은 글로 이행, 평가내용 = 번호, 계량 = kpiKey) · 새 행·사라진 행·행 글 바뀜 경고 ·
// 계량 표 경고는 사람이 고른 행으로 다시 셈 · 칸 고치기는 허용 경로(ai·human)만·code 칸 거절·형식 검사·하나라도 틀리면 아무것도 안 바꿈 ·
// 트리거 문구 = 서버 문구(마이그레이션 글과 대조).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { applyUnitPartEdits, freshUnitPart, mergeUnitPart, readUnitPart, refreshOutcomeWarnings, UNIT_PART_CONFIRM_MSG, UNIT_PART_KEY_MSG } from "./unit-parts-edit.ts";
import type { FindingsPart, MgUnitMaterials, OutcomePart, PriorPart, UnitCard, UnitChunk } from "./unit-parts-mg.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const card = (taskNo: string, data: Record<string, any> = {}): UnitCard => ({ id: `경영관리8/${taskNo}`, taskNo, title: `과제 ${taskNo}`, status: "active", dataRev: 0, data: { id: `경영관리8/${taskNo}`, ...data } });
const findings = (...rows: string[]) => ({ findings: { rows: rows.map((f) => ({ finding: [`∙ ${f}`], plan: ["∙ 개선방안"] })) } });
const kpi = (...names: string[]) => ({ kpi: { rows: names.map((name) => ({ name, prev: "10", target: "12" })) } });
const skeleton = (n: number): UnitChunk[] => Array.from({ length: n }, (_, i) => ({ chunk_key: `rpt25-mg-08/${i + 1}`, text: "", meta: { chapter: "detail", eval_no: i + 1, eval_title: `평가내용 제목 ${i + 1}을 위한 노력과 성과` } }));

function materials(over: Partial<MgUnitMaterials> = {}): MgUnitMaterials {
  return {
    unit: "MG-8",
    year: 2026,
    cards: [card("8-1", { ...findings("첫 지적", "둘째 지적"), ...kpi("부채비율", "영업이익률") }), card("8-2", findings("8-2 지적"))],
    drafts: [],
    report2025: skeleton(2),
    evaluator: [],
    handbook: [],
    kpiInputs: [],
    ...over,
  };
}

test("freshUnitPart: 지표에 있는 부분만(혁신가점은 표지만), 부분 경고와 함께", () => {
  const m = materials();
  assert.equal(freshUnitPart(m, "findings")?.part.part, "findings");
  assert.equal((freshUnitPart(m, "findings")!.part as FindingsPart).rows.length, 3);
  assert.equal(freshUnitPart({ ...m, unit: "MG-13" }, "findings"), null);
  assert.equal(freshUnitPart({ ...m, unit: "MG-13" }, "cover")?.part.part, "cover");
});

test("readUnitPart: 부분 키·배열 모양이 맞을 때만", () => {
  const p = freshUnitPart(materials(), "outcome")!.part;
  assert.equal(readUnitPart(JSON.parse(JSON.stringify(p)), "outcome")?.part, "outcome");
  assert.equal(readUnitPart(p, "prior"), null, "다른 부분 키");
  assert.equal(readUnitPart({ part: "outcome", kpi: [] }, "outcome"), null, "배열이 빠짐");
  assert.equal(readUnitPart(null, "cover"), null);
  assert.equal(readUnitPart({ part: "cover", code: {} }, "cover"), null);
});

test("다시 채우기(지적): code 칸은 새 값, ai 칸(조치 문장)은 같은 지적 행(같은 id, 글을 고친 행은 같은 행 번호)에 남김 · 새 행·사라진 행(쓴 글 수)·행 글 바뀜 경고 · 처음 채우기는 경고 없음", () => {
  const first = freshUnitPart(materials(), "findings")!;
  assert.deepEqual(mergeUnitPart(null, first), first, "저장된 것이 없으면 새로 만든 그대로");
  const saved = first.part as FindingsPart;
  saved.rows[0].ai.actions = ["조치 실적 문장"];
  saved.rows[2].ai.actions = ["8-2 조치", "둘째 줄"];
  // 재료가 바뀜: 8-1 둘째 지적 글이 바뀌고, 8-1에 셋째 행이 생기고, 8-2가 보관됨
  const m2 = materials({ cards: [card("8-1", { ...findings("첫 지적", "둘째 지적 고침", "셋째 지적"), ...kpi("부채비율") }), { ...card("8-2", findings("8-2 지적")), status: "retired" }] });
  const { part, warnings } = mergeUnitPart(saved, freshUnitPart(m2, "findings")!);
  const rows = (part as FindingsPart).rows;
  assert.deepEqual(
    rows.map((r) => [r.code.cardId, r.code.rowIndex]),
    [
      ["경영관리8/8-1", 0],
      ["경영관리8/8-1", 1],
      ["경영관리8/8-1", 2],
    ],
    "행 목록·순서는 새 재료",
  );
  assert.deepEqual(rows[0].ai.actions, ["조치 실적 문장"], "ai 칸 남김");
  assert.deepEqual(rows[1].code.finding, ["둘째 지적 고침"], "code 칸은 새 값");
  assert.deepEqual(rows[2].ai.actions, []);
  assert.deepEqual(warnings.filter((w) => /^(새 행|사라진 행|행 글이 바뀜)/.test(w)), [
    "행 글이 바뀜: 지적 8-1 2행 — 남긴 칸(AI·사람이 쓴 글)이 새 행 글과 맞는지 확인",
    "새 행: 지적 8-1 3행 — 재료에 새로 생김(AI·사람 칸은 비어 있음)",
    "사라진 행: 지적 8-2 1행 — 재료에서 빠짐(쓴 글 2줄이 함께 빠짐)",
  ]);
  assert.ok(warnings.some((w) => w.startsWith("원문 짝 없음")), "부분 경고(코어)는 새 재료로");
});

test("다시 채우기(지적) — 원장에서 행을 끼우거나 빼도 조치 문장이 같은 지적에 남음, 옛 id(카드 id#행 번호) 저장분도 같은 글로 짝지어 새 id로 옮김", () => {
  const saved = freshUnitPart(materials(), "findings")!.part as FindingsPart;
  saved.rows[0].ai.actions = ["첫 지적 조치"];
  saved.rows[1].ai.actions = ["둘째 지적 조치"];
  saved.rows[2].ai.actions = ["8-2 조치"];
  // 8-1 맨 앞에 행 하나 끼움 → 번호가 하나씩 밀림
  const m2 = materials({ cards: [card("8-1", { ...findings("끼운 지적", "첫 지적", "둘째 지적"), ...kpi("부채비율", "영업이익률") }), card("8-2", findings("8-2 지적"))] });
  const merged = mergeUnitPart(saved, freshUnitPart(m2, "findings")!);
  const rows = (merged.part as FindingsPart).rows;
  assert.deepEqual(
    rows.map((r) => [r.code.finding[0], r.ai.actions]),
    [
      ["끼운 지적", []],
      ["첫 지적", ["첫 지적 조치"]],
      ["둘째 지적", ["둘째 지적 조치"]],
      ["8-2 지적", ["8-2 조치"]],
    ],
  );
  assert.deepEqual(rows[1].id, saved.rows[0].id, "같은 지적은 행 번호가 밀려도 같은 id");
  assert.deepEqual(
    merged.warnings.filter((w) => /^(새 행|사라진 행|행 글이 바뀜)/.test(w)),
    ["새 행: 지적 8-1 1행 — 재료에 새로 생김(AI·사람 칸은 비어 있음)"],
    "밀린 행을 「행 글이 바뀜」으로 잘못 짝짓지 않음",
  );
  // 행을 뺌: 빠진 지적만 사라진 행, 뒤 행의 조치 문장은 그대로
  const m3 = materials({ cards: [card("8-1", { ...findings("둘째 지적"), ...kpi("부채비율") }), card("8-2", findings("8-2 지적"))] });
  const dropped = mergeUnitPart(saved, freshUnitPart(m3, "findings")!);
  assert.deepEqual((dropped.part as FindingsPart).rows.map((r) => r.ai.actions), [["둘째 지적 조치"], ["8-2 조치"]]);
  assert.deepEqual(dropped.warnings.filter((w) => /^(새 행|사라진 행|행 글이 바뀜)/.test(w)), ["사라진 행: 지적 8-1 1행 — 재료에서 빠짐(쓴 글 1줄이 함께 빠짐)"]);

  // 옛 저장분(2026-10-17 전 — id 「카드 id#행 번호」) + 그 뒤 원장 맨 앞에 행이 낌: 번호가 아니라 글로 짝
  const legacy = structuredClone(saved);
  legacy.rows.forEach((r) => (r.id = `${r.code.cardId}#${r.code.rowIndex}`));
  const fromLegacy = mergeUnitPart(legacy, freshUnitPart(m2, "findings")!);
  const lr = (fromLegacy.part as FindingsPart).rows;
  assert.deepEqual(lr.map((r) => r.ai.actions), [[], ["첫 지적 조치"], ["둘째 지적 조치"], ["8-2 조치"]]);
  assert.ok(lr.every((r) => /#t[0-9a-f]{8}$/.test(r.id)), "새 id로 옮김");
  assert.deepEqual(fromLegacy.warnings.filter((w) => /^(사라진 행|행 글이 바뀜)/.test(w)), []);
  // 옛 저장분 + 글을 고친 행(행 번호 그대로): 예전처럼 같은 번호로 짝짓고 경고
  const m4 = materials({ cards: [card("8-1", { ...findings("첫 지적", "둘째 지적 고침"), ...kpi("부채비율") }), card("8-2", findings("8-2 지적"))] });
  const edited = mergeUnitPart(legacy, freshUnitPart(m4, "findings")!);
  assert.deepEqual((edited.part as FindingsPart).rows.map((r) => r.ai.actions), [["첫 지적 조치"], ["둘째 지적 조치"], ["8-2 조치"]]);
  assert.ok(edited.warnings.includes("행 글이 바뀜: 지적 8-1 2행 — 남긴 칸(AI·사람이 쓴 글)이 새 행 글과 맞는지 확인"));
});

test("지적 행 id: 같은 글이면 행 번호와 상관없이 같은 id, 한 카드 안 같은 글은 「-2」", () => {
  const a = freshUnitPart(materials({ cards: [card("8-1", findings("가", "나", "가"))] }), "findings")!.part as FindingsPart;
  const b = freshUnitPart(materials({ cards: [card("8-1", findings("나", "가"))] }), "findings")!.part as FindingsPart;
  assert.equal(a.rows[0].id, b.rows[1].id);
  assert.equal(a.rows[1].id, b.rows[0].id);
  assert.equal(a.rows[2].id, `${a.rows[0].id}-2`);
  assert.equal(new Set(a.rows.map((r) => r.id)).size, 3);
});

test("다시 채우기(전년 대비·성과분석): human 칸(’25까지 글·계량 행 고르기·극성·구분)과 ai 칸은 남기고, 계량 실적(code)은 새 입력 · 계량 표 경고는 병합 뒤 행으로", () => {
  const p0 = freshUnitPart(materials(), "prior")!.part as PriorPart;
  p0.rows[0].human.upTo = ["사람이 줄인 글"];
  p0.rows[1].ai.now = ["’26 문장"];
  const prior = mergeUnitPart(p0, freshUnitPart(materials({ report2025: skeleton(3) }), "prior")!);
  const pr = (prior.part as PriorPart).rows;
  assert.deepEqual([pr[0].human.upTo, pr[1].ai.now, pr[2].id], [["사람이 줄인 글"], ["’26 문장"], "prior/3"]);
  assert.deepEqual(prior.warnings.filter((w) => w.startsWith("새 행")), ["새 행: 전년 대비 평가내용3 — 재료에 새로 생김(AI·사람 칸은 비어 있음)"]);

  const o0 = freshUnitPart(materials(), "outcome")!.part as OutcomePart;
  assert.deepEqual(o0.kpi.map((k) => k.human.checked), [false, false], "2025 표가 없어 미리 체크 없음");
  o0.kpi[1].human = { checked: true, polarity: "down" };
  o0.kpi[1].ai.analysis = ["성과 분석 문장"];
  o0.qual[0].human.label = "재무구조";
  o0.plan[1].ai.plan = ["’27 개선방안"];
  const fresh = freshUnitPart(materials({ kpiInputs: [{ "경영관리8/8-1#1": "1.1%" }] }), "outcome")!;
  assert.ok(fresh.warnings.includes("계량 표: 고른 행이 없음 — 2025 표와 이름이 같은 카드 계량 행이 없어 미리 체크하지 못함(행을 골라 주세요)"));
  const { part, warnings } = mergeUnitPart(o0, fresh);
  const o = part as OutcomePart;
  assert.deepEqual(o.kpi[1].human, { checked: true, polarity: "down" });
  assert.equal(o.kpi[1].code.actual, "1.1%", "실적 입력(code)은 새 값");
  assert.deepEqual(o.kpi[1].ai.analysis, ["성과 분석 문장"]);
  assert.equal(o.qual[0].human.label, "재무구조");
  assert.deepEqual(o.plan[1].ai.plan, ["’27 개선방안"]);
  assert.deepEqual(warnings, [], "사람이 고른 행(실적 있음)으로 다시 세면 「고른 행이 없음」 경고는 빠짐");
});

test("다시 채우기(표지): 담당자 표(human)는 남기고 편람(code)은 새 값", () => {
  const c0 = freshUnitPart(materials(), "cover")!.part;
  assert.equal(c0.part, "cover");
  if (c0.part !== "cover") return;
  c0.human.contacts = [{ role: "팀장", name: "홍길동", phone: "000", email: "a@kca.kr" }];
  const hb: UnitChunk[] = [{ chunk_key: "plan-2607/handbook26/MG-8/k1", title: "'26 편람 · 재무예산관리 · 비계량", text: "지표정의: • 정의\n\n세부평가내용: ① 첫째", unit_type: "handbook_indicator", meta: { weight_quasi_gov: 3 } }];
  const { part, warnings } = mergeUnitPart(c0, freshUnitPart(materials({ handbook: hb }), "cover")!);
  assert.ok(part.part === "cover" && part.code.components.length === 1 && part.human.contacts[0].name === "홍길동");
  assert.deepEqual(warnings, []);
});

test("칸 고치기: ai·human 칸만(허용 경로), code 칸은 거절, 값 형식 검사, 글 정리, 하나라도 틀리면 아무것도 안 바꿈", () => {
  const f = freshUnitPart(materials(), "findings")!.part;
  const ok = applyUnitPartEdits(f, [{ path: "rows.1.ai.actions", value: ["  조치   <b>실적</b> ", "", "- 하위 줄"] }]);
  assert.ok(ok.ok);
  assert.deepEqual((ok.part as FindingsPart).rows[1].ai.actions, ["조치 b실적/b", "- 하위 줄"], "꺾쇠·빈 줄·겹친 공백 정리, 하위 줄 표기는 그대로");
  assert.equal(ok.changed, 1);
  assert.deepEqual((f as FindingsPart).rows[1].ai.actions, [], "원본은 그대로(복사본을 고침)");
  const same = applyUnitPartEdits(ok.part, [{ path: "rows.1.ai.actions", value: ["조치 b실적/b", "- 하위 줄"] }]);
  assert.ok(same.ok && same.changed === 0);

  const code = applyUnitPartEdits(f, [{ path: "rows.0.code.finding", value: ["지적 글 바꿈"] }]);
  assert.deepEqual(code, { ok: false, message: "재료에서 채우는 칸은 고칠 수 없습니다 — 「재료로 다시 채우기」로 바뀝니다." });
  assert.equal(applyUnitPartEdits(f, [{ path: "rows.0.id", value: "x" }]).ok, false);
  assert.equal(applyUnitPartEdits(f, [{ path: "rows.9.ai.actions", value: [] }]).ok, false, "없는 행");
  assert.equal(applyUnitPartEdits(f, [{ path: "rows.0.ai.actions", value: "글 하나" }]).ok, false, "글 목록 칸에 글");
  const partial = applyUnitPartEdits(f, [{ path: "rows.0.ai.actions", value: ["먼저"] }, { path: "rows.0.code.plan", value: [] }]);
  assert.equal(partial.ok, false, "하나라도 틀리면 거절");

  const o = freshUnitPart(materials(), "outcome")!.part;
  const r = applyUnitPartEdits(o, [
    { path: "kpi.0.human.checked", value: true },
    { path: "kpi.0.human.polarity", value: "down" },
    { path: "qual.1.human.label", value: " 예산 편성 " },
    { path: "plan.0.ai.self", value: ["자체평가"] },
  ]);
  assert.ok(r.ok && r.changed === 4);
  const op = r.part as OutcomePart;
  assert.deepEqual([op.kpi[0].human, op.qual[1].human.label, op.plan[0].ai.self], [{ checked: true, polarity: "down" }, "예산 편성", ["자체평가"]]);
  assert.equal(applyUnitPartEdits(o, [{ path: "kpi.0.human.polarity", value: "sideways" }]).ok, false);
  assert.equal(applyUnitPartEdits(o, [{ path: "kpi.0.human.checked", value: "true" }]).ok, false);
  assert.equal(applyUnitPartEdits(o, [{ path: "kpi.0.code.actual", value: "99" }]).ok, false, "실적은 부서 입력(code)");
  assert.equal(applyUnitPartEdits(o, [{ path: "qual.0.ai.self", value: [] }]).ok, false, "비계량에는 self 칸이 없음");

  const c = freshUnitPart(materials(), "cover")!.part;
  const cr = applyUnitPartEdits(c, [{ path: "human.contacts", value: [{ role: "팀장", name: "홍길동" }, { role: " ", name: "" }, "잘못"] }]);
  assert.ok(cr.ok && cr.part.part === "cover");
  if (cr.ok && cr.part.part === "cover") assert.deepEqual(cr.part.human.contacts, [{ role: "팀장", name: "홍길동", phone: "", email: "" }], "빈 줄은 뺌");
  assert.equal(applyUnitPartEdits(c, [{ path: "code.indicator", value: "x" }]).ok, false);
});

test("계량 표 경고 갈아 끼우기: 사람이 행을 고르거나 극성을 바꾸면 계량 표 경고만 다시 셈", () => {
  const o = freshUnitPart(materials({ kpiInputs: [{ "경영관리8/8-1#0": "9" }] }), "outcome")!;
  const before = o.part as OutcomePart;
  const r = applyUnitPartEdits(before, [{ path: "kpi.0.human.checked", value: true }, { path: "kpi.1.human.checked", value: true }]);
  assert.ok(r.ok);
  const w = refreshOutcomeWarnings(["다른 경고", ...o.warnings], before, r.part as OutcomePart);
  assert.deepEqual(w, ["다른 경고", "계량 표: 실적 미입력 1행(8-1 영업이익률) — 부서 경평 초안 「계량 실적」 입력이 필요"]);
});

test("트리거 문구 = 서버 문구(마이그레이션 글에 같은 문장)", () => {
  const sql = readFileSync(resolve(import.meta.dirname, "../../supabase/migrations/20261016100000_unit_report_parts.sql"), "utf8");
  assert.ok(sql.includes(UNIT_PART_CONFIRM_MSG));
  assert.ok(sql.includes(UNIT_PART_KEY_MSG));
});
