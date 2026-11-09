// 새 도식 종류 2개 시험 — 2026-11-10, 경평 초안 프레임워크 확장 계획 P5: 갈래 × 단계 행렬(matrix)·재편 매핑도(remap).
// 지키는 것: 새 필드 없이 기존 답 필드(items·cells·rows)를 다시 씀, 정리(cleanBlocks)의 자리 지킴·되돌림(선 하나뿐 → 전후 비교 표, 경영관리 → 기존 표),
// 경영관리 답 스키마·구성안 정리에는 새 종류가 없음(MG_BLOCK_KINDS), 그리기(section-html)·판면 어림(fit)이 같은 폭·같은 판정, 반 폭으로 두지 않음.
// 원고(section-md)·옛 한글 렌더러(section-hwpx)는 section-md·section-hwpx 시험의 「블록 21종」 표본이 봄. 판 해시(경영관리 불변)는 prompts 시험.

import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { BLOCK_KINDS, type Block, type BlockCell, type BlockOutput, MG_BLOCK_KINDS, REMAP_FROM_MAX, blockBullets, blockOutSchema, cleanBlocks, matrixCorner, matrixRows, remapLinks } from "./blocks.ts";
import { MATRIX_MM, REMAP, blockHeight, blockWidth, canonicalBlock, remapMm, slotOf } from "./fit.ts";
import { BIZ_ONLY_SHAPES, SHAPES, cellRange, defaultCells } from "./frameworks.ts";
import { cleanPlanBlock } from "./composition.ts";
import { mgOutlineOutSchema } from "./mg-outline.ts";
import { cleanSpan } from "./layout.ts";
import type { ReportSectionSpec } from "./section.ts";
import { blocksSampleHtml, sectionHtml } from "./section-html.ts";
import { reportDraftPrompts, reportDraftPromptsMg } from "../prompts/sets.ts";

const out = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = []): BlockCell => ({ head, tag: "", bullets, note: "" });
const blk = (kind: Block["kind"], x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const clean = (xs: BlockOutput[], opts: { mg?: boolean } = {}) => cleanBlocks(xs, line, () => true, opts).blocks;
const spec = (blocks: Block[]): ReportSectionSpec =>
  ({ version: 3, card: { id: "x", taskNo: "1-가", title: "t" }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, sub: { mark: "가", title: "제목", markers: [] }, rows: [], results: [], caption: "", blocks, module: 1 }) as ReportSectionSpec;

const MATRIX = out({ kind: "matrix", items: ["구분", "현황", "추진내용", "성과"], cells: [cell("① 전파", ["민원 증가", "측정망 확충", "민원 30% 감소"]), cell("방송", ["음영 지역", "", "음영 해소"]), cell("시험", ["대기", "온라인 접수", "기간 단축"])] });
const REMAP_OUT = out({ kind: "remap", rows: [{ key: "전파본부", before: ["관리팀", "정책팀"], after: ["전파 업무 일원화"] }, { key: "방송본부", before: ["정책팀", "방송팀"], after: ["융합 대응"] }] });

// ---------------------------------------------------------------------------
// 종류 목록·모양 목록

test("BLOCK_KINDS = 공용 19종(MG_BLOCK_KINDS) + matrix·remap, 모양 없는 종류라 SHAPES 코드가 종류 이름 — 주요사업 전용·칸 범위·보통 칸 수·반 폭 불가", () => {
  assert.equal(MG_BLOCK_KINDS.length, 19);
  assert.deepEqual([...BLOCK_KINDS], [...MG_BLOCK_KINDS, "matrix", "remap"]);
  for (const code of ["matrix", "remap"]) {
    const s = SHAPES.find((x) => x.code === code);
    assert.ok(s && s.kind === code && s.variant === "" && s.group === "base", code);
    assert.ok(BIZ_ONLY_SHAPES.includes(code), `${code}는 주요사업 전용`);
    assert.equal(cleanSpan(code, "half"), undefined, `${code}는 반 폭으로 두지 않음`);
  }
  assert.deepEqual(cellRange("matrix"), { min: 2, max: 4 });
  assert.deepEqual(cellRange("remap"), { min: 1, max: 5 });
  assert.deepEqual([defaultCells("matrix"), defaultCells("remap")], [3, 3]);
});

test("답 스키마 종류: 설명 없음(검증용)·주요사업 설명은 matrix·remap 포함, 경영관리 집필·구성안 설명은 공용 19종만(경영관리 답 스키마 불변)", () => {
  const kinds = (s: z.ZodType) => JSON.stringify(z.toJSONSchema(s));
  assert.ok(kinds(blockOutSchema()).includes('"matrix"'));
  assert.ok(kinds(blockOutSchema(reportDraftPrompts().prompts.schema)).includes('"remap"'));
  const mg = kinds(blockOutSchema(reportDraftPromptsMg().prompts.schema));
  assert.ok(mg.includes('"pdca"') && !mg.includes('"matrix"') && !mg.includes('"remap"'));
  const mgOutline = kinds(mgOutlineOutSchema());
  assert.ok(mgOutline.includes('"pdca"') && !mgOutline.includes('"matrix"') && !mgOutline.includes('"remap"'));
});

test("cleanPlanBlock: 주요사업 구성안은 matrix·remap을 받고(칸 수 범위로), 경영관리 구성안은 모르는 종류로 버림 — 대안(alts)의 새 종류도 경영관리는 버림", () => {
  const ids = new Set<string>();
  const b = { kind: "matrix", variant: "", label: "추진내용", purpose: "", cells: 9, materials: [], figures: [], alts: [{ kind: "remap", variant: "", why: "재편" }] } as any;
  const biz = cleanPlanBlock(b, ids);
  assert.equal(biz?.kind, "matrix");
  assert.equal(biz?.cells, 4, "갈래 열은 4개까지");
  assert.deepEqual(biz?.alts?.map((a) => a.kind), ["remap"]);
  assert.equal(cleanPlanBlock(b, ids, true), null);
  const mgAlt = cleanPlanBlock({ ...b, kind: "table", alts: [{ kind: "remap", variant: "", why: "" }, { kind: "cards", variant: "plain", why: "" }] }, ids, true);
  assert.deepEqual(mgAlt?.alts?.map((a) => a.kind), ["cards"]);
});

// ---------------------------------------------------------------------------
// 정리(cleanBlocks)

test("cleanBlocks matrix: items = [구석, 행 머리 2~4], 열 4개까지, 칸 값은 행 수에 맞춰 자리를 지킴(빈 칸 = 빈 글) — 구석 없이 행 머리만 적은 답은 모두 행 머리로", () => {
  const [m] = clean([MATRIX]);
  assert.equal(m.kind, "matrix");
  assert.deepEqual(m.items, ["구분", "현황", "추진내용", "성과"]);
  assert.deepEqual(m.cells[1].bullets, ["음영 지역", "", "음영 해소"]);
  assert.deepEqual(matrixRows(m), ["현황", "추진내용", "성과"]);
  assert.equal(matrixCorner({ items: ["", "가"] }), "구분", "빈 구석 머리는 「구분」으로 그림");
  // 행 머리 다섯·열 다섯 → 4·4, 값이 모자라면 빈 칸으로 채움
  const [big] = clean([out({ kind: "matrix", items: ["", "a", "b", "c", "d", "e"], cells: ["1", "2", "3", "4", "5"].map((h) => cell(h, ["x"])) })]);
  assert.deepEqual(big.items, ["", "a", "b", "c", "d"]);
  assert.equal(big.cells.length, 4);
  assert.deepEqual(big.cells[0].bullets, ["x", "", "", ""]);
  // 구석 없이 행 머리만(items 셋 = 열마다 값 셋)
  const [noCorner] = clean([out({ ...MATRIX, items: ["현황", "추진내용", "성과"] })]);
  assert.deepEqual(noCorner.items, ["", "현황", "추진내용", "성과"]);
  assert.deepEqual(noCorner.cells[0].bullets, ["민원 증가", "측정망 확충", "민원 30% 감소"]);
  // 행 하나·열 하나면 뺌
  assert.equal(clean([out({ kind: "matrix", items: ["구분", "현황"], cells: [cell("가", ["x"]), cell("나", ["y"])] })]).length, 0);
  assert.equal(clean([out({ ...MATRIX, cells: [cell("가", ["x", "y", "z"])] })]).length, 0);
  // 칸 값(문장)만 문체 점검 — 행 머리·빈 칸은 뺌
  assert.deepEqual(blockBullets(m).length, 8);
});

test("cleanBlocks remap: 행 = TO-BE(이름 없는 행·AS-IS 없는 행은 뺌), AS-IS 이름은 처음 나온 순서로 REMAP_FROM_MAX개까지, 선이 둘 미만이면 전후 비교 표", () => {
  const [r] = clean([REMAP_OUT]);
  assert.equal(r.kind, "remap");
  const g = remapLinks(r.rows);
  assert.deepEqual(g.from, ["관리팀", "정책팀", "방송팀"]);
  assert.deepEqual(g.links, [[0, 0], [1, 0], [1, 1], [2, 1]]);
  // 이름 없는 행·같은 행 안 겹친 이름
  const [r2] = clean([out({ kind: "remap", rows: [{ key: "", before: ["가"], after: [] }, { key: "통합", before: ["가", "가", "나"], after: [] }] })]);
  assert.deepEqual(r2.rows, [{ key: "통합", before: ["가", "나"], after: [] }]);
  assert.equal(r2.kind, "remap", "둘이 하나로(선 둘)는 재편 매핑도");
  // AS-IS 이름이 넘치면 뒤 이름을 뺌(이미 나온 이름은 남음 — 한 행의 AS-IS는 원래 정리대로 4개까지)
  const [r3] = clean([out({ kind: "remap", rows: [{ key: "A", before: ["분류1", "분류2", "분류3", "분류4"], after: [] }, { key: "B", before: ["분류5", "분류1", "분류6", "분류7"], after: [] }] })]);
  assert.equal(remapLinks(r3.rows).from.length, REMAP_FROM_MAX);
  assert.deepEqual(r3.rows[1].before, ["분류5", "분류1", "분류6"]);
  // 1 → 1뿐이면 전후 비교 표(구분 = TO-BE · 기존 = AS-IS · 개선 = 설명)
  const [one] = clean([out({ kind: "remap", rows: [{ key: "새 팀", before: ["옛 팀"], after: ["이름만 바꿈"] }] })]);
  assert.deepEqual([one.kind, one.variant, one.rows[0].key], ["compare", "table", "새 팀"]);
});

test("cleanBlocks 경영관리(opts.mg): 행렬 → 쉐브론 머리 표(행 = 갈래, 열 머리 = 단계, 빈 구석은 「구분」), 재편 매핑도 → 전후 비교 표", () => {
  const [m, r] = clean([out({ ...MATRIX, items: ["", "현황", "추진내용", "성과"] }), REMAP_OUT], { mg: true });
  assert.deepEqual([m.kind, m.variant], ["table", "chevron"]);
  assert.deepEqual(m.items, ["구분", "현황", "추진내용", "성과"]);
  assert.deepEqual(m.cells[0], { head: "① 전파", tag: "", bullets: ["민원 증가", "측정망 확충", "민원 30% 감소"], note: "" });
  assert.deepEqual([r.kind, r.variant, r.rows.length], ["compare", "table", 2]);
});

// ---------------------------------------------------------------------------
// 그리기·판면 어림

test("행렬 그리기: 머리 줄 = 구석 + 「① 갈래」(AI가 적은 앞 번호는 걷고 코드가 다시), 행마다 단계 머리 + 칸 값 불릿(빈 칸은 빈 칸), 행 머리 열 폭 = MATRIX_MM.rowHead", () => {
  const [m] = clean([MATRIX]);
  const html = blocksSampleHtml([m]);
  assert.match(html, /<table class="k-tbl k-mx">/);
  assert.ok(html.includes(`<col style="width:${((MATRIX_MM.rowHead / 170) * 100).toFixed(2)}%">`), "전폭 170mm에서 행 머리 열 폭");
  assert.ok(html.includes("<th scope=\"col\">구분</th><th scope=\"col\">① 전파</th><th scope=\"col\">② 방송</th><th scope=\"col\">③ 시험</th>"));
  assert.ok(html.includes('<tr><th scope="row">추진내용</th><td><ul><li>측정망 확충</li></ul></td><td></td><td><ul><li>온라인 접수</li></ul></td></tr>'));
});

test("재편 매핑도 그리기: AS-IS 상자 = 처음 나온 순서로 한 번씩, 선 = 연결마다 SVG 선 하나(끝은 자리 가운데 — (i + 0.5) ÷ 상자 수), 열 폭 = remapMm, 고치기 표지는 한 곳에만 나온 AS-IS 이름만", () => {
  const [r] = clean([REMAP_OUT]);
  const html = blocksSampleHtml([r]);
  assert.equal([...html.matchAll(/<div class="k-remap__box">/g)].length, 3);
  assert.equal([...html.matchAll(/<div class="k-remap__box k-remap__box--to">/g)].length, 2);
  const paths = [...html.matchAll(/<path d="M0 ([\d.]+) L100 ([\d.]+)"\/>/g)].map((x) => [Number(x[1]), Number(x[2])]);
  assert.deepEqual(paths, [[16.67, 25], [50, 25], [50, 75], [83.33, 75]]);
  const g = remapMm(170);
  assert.ok(html.includes(`grid-template-columns:${((g.from / 170) * 100).toFixed(2)}% ${((REMAP.linkMm / 170) * 100).toFixed(2)}% minmax(0,1fr)`));
  // 고치기 표지(과제별 초안 화면): 「정책팀」은 두 TO-BE에 나와 표지 없음, 「관리팀」·「방송팀」은 그 자리로, TO-BE 이름·설명은 행 경로
  const ed = sectionHtml(spec([r]), [], { editMarks: true });
  assert.ok(ed.includes('data-t="blocks.0.rows.0.before.0"') && ed.includes('data-t="blocks.0.rows.1.before.1"'));
  assert.ok(!ed.includes("rows.0.before.1") && !ed.includes("rows.1.before.0"), "여러 TO-BE에 나온 이름은 고치면 선이 갈라져 표지 없음");
  assert.ok(ed.includes('data-t="blocks.0.rows.1.key"') && ed.includes('data-t="blocks.0.rows.0.after.0"'));
});

test("판면 어림 기준값(사다리 칸 150mm, 보통 모양 canonicalBlock): 행렬 3열 × 3행 43mm, 재편 매핑도 TO-BE 2행 46mm·3행 67mm — 칸 폭은 그리기와 같은 값, 글이 길면 높아짐", () => {
  const mm = (b: Block) => Math.round(blockHeight(b, blockWidth(b)));
  assert.equal(mm(canonicalBlock("matrix", "", 3, "라벨")), 43);
  assert.equal(mm(canonicalBlock("remap", "", 2, "라벨")), 46);
  assert.equal(mm(canonicalBlock("remap", "", 3, "라벨")), 67);
  // 칸 폭: 행렬 갈래 열 = (폭 − 행 머리 열) ÷ 열 수, 재편 매핑도 TO-BE 상자 = remapMm.to에서 안 여백·테두리
  const w = 150;
  const s = slotOf(blk("matrix", { cells: [cell("a"), cell("b")] }), w);
  assert.ok(Math.abs(s.head - ((w - MATRIX_MM.rowHead) / 2 - (8 * 25.4) / 96)) < 1e-9);
  const r = slotOf(blk("remap"), w);
  assert.ok(r.head < remapMm(w).to && r.note < remapMm(w).from && r.body < r.head);
  // 글이 길면 높아짐(칸 값 한 줄 → 여러 줄, TO-BE 설명 한 줄 → 여러 줄)
  const short = blk("matrix", { items: ["구분", "현황", "성과"], cells: [cell("가", ["짧음", "짧음"]), cell("나", ["짧음", "짧음"])] });
  const long = { ...short, cells: [cell("가", ["가".repeat(60), "짧음"]), short.cells[1]] };
  assert.ok(blockHeight(long, w) > blockHeight(short, w));
  const r1 = blk("remap", { rows: [{ key: "A", before: ["x", "y"], after: ["짧음"] }] });
  assert.ok(blockHeight({ ...r1, rows: [{ ...r1.rows[0], after: ["가".repeat(80)] }] }, w) > blockHeight(r1, w));
});
