// 경평 초안 → 한글(HWPX) 화면 양식(lib/reports/section-hwpx.ts) 테스트 — 2026-10-21 「A안」.
// 지키는 것: 블록 19종 × 모양·그림 자리·추진성과·머리가 예외 없이 변환되고 validateHwpx 통과·readHwpx로 다시 읽힘 · 화면에 보이는 글이 모두 한글 글에 있음 ·
// 최상위 표 폭 = 본문 170mm(칸 폭 합) · 쪽 정의(216×303 맞쪽·여백)·글꼴 이름·줄간격 160% · 그림 자리 상자 = 크기 등급 mm · 모르는 종류·옛 spec → 경고 ·
// 모든 문단 모양의 줄 나눔 = 한글 어절 단위(breakNonLatinWord BREAK_WORD — 이름과 뜻이 반대)·영문 단어 단위 · 핵심 수치 칸의 【확인: …】은 10.5pt(나머지 수치는 15pt) ·
// 모든 글자 모양의 빈칸 폭 = 글꼴 빈칸(useFontSpace="1" — 화면 브라우저와 같음) ·
// 머리 세 문단(대상사업·실행과제·소항목)과 상자 머리·표 머리 칸·수치 칸의 줄간격 = 화면 CSS line-height × 100(REPORT_STYLE.lh 한 곳) ·
// 화면 CSS(REPORT_CSS) 고정(공용 값을 바꾸면 함께 바뀜이 드러남) · 칸 사이 기호 칸·좁은 칸 안 여백은 화면·판면 어림·한글이 같은 값.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import JSZip from "jszip";
import { validateHwpx } from "kordoc";
import { readHwpx } from "../hwp/hwpx.ts";
import { hangCheck } from "../hwpx/hang.ts";
import type { HwpDoc, Para, Table } from "../hwp/model.ts";
import { BLOCK_KINDS, type Block, type BlockCell, FIGURE_LABEL, type Figure, VARIANTS, figureMm } from "./blocks.ts";
import { PAGE_MM, blockWidth, slotOf } from "./fit.ts";
import { REPORT_CSS, REPORT_STYLE } from "./section-css.ts";
import { sectionBodyHtml } from "./section-html.ts";
import { HWPX_FACES, REPORT_PAGE_MM, sectionHwpxInput, sectionToHwpx } from "./section-hwpx.ts";
import type { ReportSectionSpec } from "./section.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
const block = (b: Partial<Block> & Pick<Block, "kind">): Block => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...b });
const cell = (head: string, bullets: string[] = [], extra: Partial<BlockCell> = {}): BlockCell => ({ head, tag: "", bullets, note: "", ...extra });
const fig = (kind: Figure["kind"], desc: string, pos: Figure["pos"], size: Figure["size"]): Figure => ({ kind, desc, pos, size });

function makeSpec(blocks: Block[], extra: Partial<ReportSectionSpec> = {}): ReportSectionSpec {
  return {
    version: 3,
    card: { id: "주요사업1/1-가", taskNo: "1-가", title: "과제명" },
    business: { no: 1, name: "방송미디어 진흥" },
    task: { no: "1-1", title: "실행과제 제목", bp: true },
    sub: { mark: "가", title: "AI 판독 **확산**", markers: ["지적개선", "신규", "AI"], chip: "수신환경" },
    rows: [],
    results: [],
    caption: "",
    blocks,
    story: "단계 전개형",
    module: 1,
    ...extra,
  };
}

const HU = 7200 / 25.4;
const mm = (v: number) => Math.round(v * HU);
const four = [cell("가 칸", ["가1 글", "가2 **강조** 글"], { tag: "T1", note: "가 덧글" }), cell("나 칸", ["나1 글"]), cell("다 칸", ["다1 글"], { note: "다 덧글" }), cell("라 칸", ["라1 글"])];

/** 블록 19종 × 모양 전부(variant 목록의 모든 값) + 그림 자리 조합 */
const SAMPLES: Record<string, Block> = {
  bullets: block({ kind: "bullets", title: "불릿 제목", items: ["첫째 불릿 【확인: ’26년 검사 건수】 예정", "무선국 ^{’25년}100국 → ^{’26년}200국", "굵게 **핵심** 글"], figures: [fig("photo", "설악산 현장 측정 차량", "right", "M"), fig("illust", "왼쪽 삽화", "left", "S")] }),
  "cards:plus": block({ kind: "cards", variant: "plus", title: "카드 제목", cells: four.slice(0, 3) }),
  "cards:arrow": block({ kind: "cards", variant: "arrow", cells: four.slice(0, 2), figures: [fig("screen", "시스템 화면", "right", "L")] }),
  "cards:plain": block({ kind: "cards", variant: "plain", cells: four }),
  "cards:vs": block({ kind: "cards", variant: "vs", cells: four.slice(0, 2) }),
  "compare:table": block({ kind: "compare", variant: "table", title: "비교 제목", rows: [{ key: "속도", before: ["느림"], after: ["빠름", "안정"] }, { key: "비용", before: ["많음"], after: ["적음"] }] }),
  "compare:panels": block({ kind: "compare", variant: "panels", items: ["As-Is: 수작업", "To-Be: 자동판독"], rows: [{ key: "수신", before: ["① 육안 판독"], after: ["① AI 판독"] }, { key: "", before: ["측정 느림"], after: ["측정 빠름"] }], figures: [fig("photo", "기존 현장", "left", "S"), fig("photo", "개선 현장", "right", "S")] }),
  "compare:diag": block({ kind: "compare", variant: "diag", items: ["현황·문제: 사각지대", "추진방향: 보완"], rows: [{ key: "", before: ["음영 지역"], after: ["중계 보강"] }], figures: [fig("illust", "가운데 개념도", "center", "M")] }),
  "steps:row": block({ kind: "steps", variant: "row", cells: [cell("Step 1 수요조사", ["현장 의견 120건"], { note: "결과 1" }), cell("시범운영", ["3개 지역"], { tag: "T" }), cell("확산", ["전국"])] }),
  "steps:zigzag": block({ kind: "steps", variant: "zigzag", cells: [cell("1단계 진단", ["진단 글"]), cell("설계", ["설계 글"], { note: "설계 결과" }), cell("실행", ["실행 글"]), cell("환류", ["환류 글"])] }),
  "timeline:chevron": block({ kind: "timeline", variant: "chevron", cells: [cell("’24년", ["착수"]), cell("’25년", ["확산"], { note: "당해 성과" })] }),
  "timeline:dots": block({ kind: "timeline", variant: "dots", cells: [cell("2023", ["시작 글"]), cell("2024", ["중간 글"], { note: "전환점" }), cell("2025", ["올해 글"])] }),
  "hub:2": block({ kind: "hub", cells: [cell("KCA", ["총괄", "조정"]), cell("기관 A", ["자료 제공", "검증"]), cell("기관 B", ["현장 지원"])], figures: [fig("logo", "해양경찰청･KCA･KOMSA 기관 로고", "center", "M")] }),
  "hub:list": block({ kind: "hub", cells: [cell("KCA", ["총괄"]), cell("기관 A", ["자료"]), cell("기관 B", ["현장"]), cell("기관 C", ["홍보"])] }),
  voices: block({ kind: "voices", title: "목소리 제목", cells: [cell("현장 검사관", ["위험해요"]), cell("", ["빨라졌어요"]), cell("주민", ["좋아요"])] }),
  define: block({ kind: "define", title: "용어 정의", text: "정의 본문", items: ["입력", "처리", "출력"] }),
  band: block({ kind: "band", label: "핵심 가치", text: "띠 메시지" }),
  "band:nolabel": block({ kind: "band", text: "라벨 없는 띠" }),
  banner: block({ kind: "banner", text: "배너 메시지" }),
  quotes: block({ kind: "quotes", cells: [cell("정부 지시", ["원문 인용"], { tag: "정부", note: "(’26.3.)" }), cell("CEO 방침", ["둘째 인용"])] }),
  "quotes:one": block({ kind: "quotes", cells: [cell("현장 요청", ["하나뿐인 인용"])] }),
  case: block({ kind: "case", label: "우수사례", title: "대통령상 수상", items: ["수상명 | 2025년 대상", "일시 : 6월", "그 밖 줄"], figures: [fig("photo", "시상식 사진", "right", "M")] }),
  "case:nofig": block({ kind: "case", title: "사진 없는 사례", items: ["줄 하나"] }),
  chart: block({ kind: "chart", title: "막대 제목", series: [{ label: "’24년", value: "5건" }, { label: "’25년", value: "10건" }, { label: "’26년", value: "【확인: ’26년 건수】" }], badge: "2배 증가" }),
  subhead: block({ kind: "subhead", text: "소제목 글" }),
  stats: block({ kind: "stats", cells: [cell("24종", ["유형 수"], { tag: "구분A", note: "기준일 9월" }), cell("97%", ["신뢰도"]), cell("【확인: ’26년 국수】", ["무선국"])] }),
  qa: block({ kind: "qa", title: "Q&A 제목", cells: [cell("왜 필요한가?", ["위험 때문"]), cell("어떻게?", ["자동화", "추가 설명"])] }),
  "table:": block({ kind: "table", variant: "", title: "수치 표", items: ["구분", "’25년", "’26년"], cells: [cell("건수", ["10", "20"]), cell("비용", ["3억", ""])] }),
  "table:result": block({ kind: "table", variant: "result", cells: [cell("가", ["내용1"]), cell("나", ["내용2", "내용3"])], series: [{ label: "검사 건수", value: "1,240건" }], text: "목표 초과" }),
  "table:bars": block({ kind: "table", variant: "bars", items: ["구분", "’24", "’25", "’26"], cells: [cell("건수", ["10건", "20건", "40건"]), cell("비율", ["50%", "글자", "100%"])] }),
  "table:chevron": block({ kind: "table", variant: "chevron", items: ["구분", "1단계", "2단계", "3단계"], cells: [cell("내용", ["진단 내용", "설계 내용", "실행 내용"])] }),
  "table:ladder": block({ kind: "table", variant: "ladder", cells: [cell("큰 라벨", ["가"], { tag: "하위1" }), cell("", ["나"], { tag: "하위2" }), cell("다른", ["다"], { tag: "하위3" })] }),
  strategy: block({ kind: "strategy", text: "목표 띠 글", items: ["목표", "전략", "과제", "지표"], cells: [cell("전략A", ["과제1"], { tag: "S1", note: "지표1" }), cell("전략B", ["과제2"], { note: "지표2" }), cell("전략C", ["과제3"])] }),
  pdca: block({ kind: "pdca", text: "환류 글", cells: four }),
};

/** 같은 블록을 라벨 사다리 행(150mm 칸)과 전폭(170mm) 두 자리에 */
const placed = (b: Block): Block[] => [{ ...b, label: "추진내용" }, { ...b, label: "", figures: b.figures?.map((f) => ({ ...f })) }];

/** 배치 조합(단 띠·전폭·가로 반씩·행 끝 막대·지도) + 추진성과(3칸·불릿·강조 띠) */
const layoutSpec = makeSpec(
  [
    block({ kind: "bullets", label: "Step 1 추진배경", items: ["배경 불릿"] }),
    block({ kind: "bullets", label: "Step 1 추진배경", items: ["같은 라벨 둘째"] }),
    block({ kind: "chart", label: "Step 1 추진배경", series: [{ label: "’25", value: "1" }, { label: "’26", value: "2" }] }),
    block({ kind: "cards", label: "추진내용", variant: "plain", span: "half", cells: four.slice(0, 2) }),
    block({ kind: "bullets", label: "추진내용", span: "half", items: ["반 폭 불릿"] }),
    block({ kind: "steps", label: "’25년 전개", layout: "stage", variant: "row", cells: [cell("가", ["가 글"]), cell("나", ["나 글"])] }),
    block({ kind: "table", label: "’25년 전개", layout: "stage", items: ["구분", "값1", "값2"], cells: [cell("행", ["1", "2"])] }),
    block({ kind: "bullets", label: "넓게", layout: "full", items: ["전폭 불릿"], figures: [fig("map", "전국 지도", "right", "MAP")] }),
    block({ kind: "stats", span: "half", cells: [cell("1건", ["설명"]), cell("2건", ["설명"])] }),
    block({ kind: "qa", span: "half", cells: [cell("질문?", ["답"])] }),
  ],
  {
    results: ["검사 시간 50% 절감", "【확인: ’26년 실적】"],
    resultCards: [
      { tag: "효율", headline: "소요시간", figure: "50%" },
      { tag: "", headline: "만족도", figure: "4.5점" },
    ],
    resultBand: "50% 단축!",
  },
);
const chartResultSpec = makeSpec([block({ kind: "bullets", items: ["본문"] })], { results: ["성과 글"], resultChart: { title: "추이", series: [{ label: "’25년", value: "10" }, { label: "’26년", value: "20" }], badge: "" } });

const none = { type: "none" as const, title: "", rows: [], steps: [], actions: [] };
const v2Spec = makeSpec([], {
  version: 2,
  blocks: undefined,
  context: [{ chip: "정부", title: "정부 방침", quote: "인용 원문", cite: "(’26.1.)" }],
  banner: "메시지 띠 글",
  rows: [
    { label: "추진배경", bullets: ["배경 불릿"], diagram: { type: "card_grid", title: "", rows: [], steps: [{ title: "문제A", bullets: ["a"], note: "" }, { title: "문제B", bullets: ["b"], note: "" }], actions: [] } },
    { label: "추진내용", bullets: ["내용 불릿"], diagram: { type: "process_flow", title: "흐름", rows: [], steps: [{ title: "수집", bullets: ["자료 수집"], note: "" }, { title: "분석", bullets: ["분석"], note: "끝" }], actions: [] }, chart: { title: "추이", series: [{ label: "’25", value: "1" }, { label: "’26", value: "2" }], badge: "" } },
    { label: "추진실적", bullets: ["실적"], diagram: { type: "action_table", title: "", rows: [], steps: [], actions: [{ effort: "노력A", result: "성과A" }] } },
    { label: "추진방향", bullets: [], diagram: { type: "timeline", title: "", rows: [], steps: [{ title: "’26", bullets: ["계획"], note: "" }], actions: [] } },
    { label: "현황 및 문제점", bullets: [], diagram: { type: "before_after", title: "", rows: [{ key: "가", before: ["전"], after: ["후"] }], steps: [], actions: [] } },
    { label: "추진노력", bullets: ["글만"], diagram: none },
  ],
  cases: [{ tab: "우수사례", title: "수상", items: ["대상"] }],
  results: ["옛 성과"],
});
const v1Spec = makeSpec([], { version: 1, blocks: undefined, rows: [{ label: "추진내용", bullets: ["v1 불릿"], diagram: none }], results: ["v1 성과"] });

// ───────────────────────── 읽기 도우미

const tablesOf = (ps: Para[]): Table[] => ps.flatMap((p) => p.items.flatMap((it) => (it.kind === "obj" && it.obj.kind === "table" ? [it.obj] : [])));
function allTables(ps: Para[], out: Table[] = []): Table[] {
  for (const t of tablesOf(ps)) {
    out.push(t);
    for (const c of t.cells) allTables(c.paras, out);
  }
  return out;
}
function textOf(ps: Para[], out: string[] = []): string[] {
  for (const p of ps) {
    out.push(p.items.map((it) => (it.kind === "text" ? it.text : "")).join(""));
    for (const t of tablesOf([p])) for (const c of t.cells) textOf(c.paras, out);
  }
  return out;
}
const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
/** 화면에 보이는 글 조각: 화면 렌더러 출력에서 화면 읽기 전용 캡션(sr)을 걷고 태그 사이 글만(svg 막대의 값·라벨 글 포함) */
function screenChunks(spec: ReportSectionSpec): string[] {
  const html = sectionBodyHtml(spec)
    .replace(/<caption class="sr">[\s\S]*?<\/caption>/g, "")
    .replace(/<span class="sr">[\s\S]*?<\/span>/g, "");
  return html
    .split(/<[^>]+>/)
    .map((x) => norm(decode(x)))
    .filter(Boolean);
}

async function convert(spec: ReportSectionSpec): Promise<{ bytes: Uint8Array; warnings: string[]; doc: HwpDoc; text: string }> {
  const { bytes, warnings } = await sectionToHwpx(spec);
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const doc = await readHwpx(bytes);
  return { bytes, warnings, doc, text: norm(textOf(doc.sections[0].paras).join(" ")) };
}

function checkText(name: string, spec: ReportSectionSpec, text: string) {
  for (const x of screenChunks(spec)) assert.ok(text.includes(x), `${name}: 화면 글 「${x}」가 한글 파일에 없음`);
}

function checkWidths(name: string, doc: HwpDoc) {
  const paras = doc.sections[0].paras;
  for (const t of tablesOf(paras)) assert.ok(Math.abs(t.pos.width - mm(PAGE_MM.width)) <= 1, `${name}: 최상위 표 폭 ${t.pos.width} ≠ ${mm(PAGE_MM.width)}`);
  for (const t of allTables(paras)) {
    const row0 = t.cells.filter((c) => c.row === 0).reduce((a, c) => a + c.width, 0);
    assert.ok(Math.abs(row0 - t.pos.width) <= 1, `${name}: 표 칸 폭 합 ${row0} ≠ 표 폭 ${t.pos.width}`);
    // 칸 짜임: 행·열 자리마다 칸이 꼭 하나(합친 칸 포함 — 빈 자리·겹침이 있으면 한글이 표를 못 읽음)
    const seen = Array.from({ length: t.rows }, () => Array.from({ length: t.cols }, () => 0));
    for (const c of t.cells) for (let r = c.row; r < c.row + c.rowSpan; r++) for (let k = c.col; k < c.col + c.colSpan; k++) seen[r][k] += 1;
    assert.ok(seen.every((row) => row.every((v) => v === 1)), `${name}: 표 칸 자리가 비거나 겹침 ${JSON.stringify(seen)}`);
  }
}

// ───────────────────────── 시험

test("블록 19종 × 모양 전부(라벨 사다리 칸·전폭): 예외 없이 변환 → validateHwpx 통과 → 다시 읽힘 · 화면 글 보존 · 최상위 표 170mm", async () => {
  const kinds = new Set(Object.keys(SAMPLES).map((k) => k.split(":")[0]));
  assert.deepEqual([...kinds].sort(), [...BLOCK_KINDS].sort(), "19종 모두");
  for (const [kind, vs] of Object.entries(VARIANTS)) for (const v of vs ?? []) assert.ok(Object.values(SAMPLES).some((b) => b.kind === kind && b.variant === v), `${kind}:${v} 표본 없음`);
  for (const [name, b] of Object.entries(SAMPLES)) {
    const spec = makeSpec(placed(b));
    const { warnings, doc, text } = await convert(spec);
    assert.deepEqual(warnings, [], name);
    checkText(name, spec, text);
    checkWidths(name, doc);
  }
});

test("배치 조합·머리·추진성과(3칸·불릿·강조 띠·막대): 화면 글 보존 · 표 폭", async () => {
  for (const [name, spec] of [
    ["배치", layoutSpec],
    ["추진성과 막대", chartResultSpec],
  ] as const) {
    const { warnings, doc, text } = await convert(spec);
    assert.deepEqual(warnings, [], name);
    checkText(name, spec, text);
    checkWidths(name, doc);
    for (const x of ["대상사업1", "방송미디어 진흥", "1-1", "실행과제 제목", "BP", "가. [수신환경] AI 판독 확산", "지적개선", "신규", "AI", "추진성과"]) assert.ok(text.includes(x), `${name}: 「${x}」`);
  }
});

test("쪽 정의 216×303mm 맞쪽·여백, 글꼴 이름(대체 글꼴 함께), 본문 줄간격 160%", async () => {
  const { bytes, doc } = await convert(layoutSpec);
  const page = doc.sections[0].page!;
  assert.deepEqual(
    [page.width, page.height, page.left, page.right, page.top, page.bottom, page.header, page.footer, page.gutter, page.landscape],
    [mm(216), mm(303), mm(23), mm(23), mm(15.5), mm(12.5), mm(10), mm(10), 0, false],
  );
  assert.ok(Math.abs(page.width - page.left - page.right - mm(PAGE_MM.width)) <= 2, "본문 폭 170mm");
  assert.ok(Math.abs(page.height - page.top - page.bottom - page.header - page.footer - mm(PAGE_MM.height)) <= 2, "본문 높이 255mm");
  assert.deepEqual([REPORT_PAGE_MM.width - REPORT_PAGE_MM.inside - REPORT_PAGE_MM.outside, REPORT_PAGE_MM.height - REPORT_PAGE_MM.top - REPORT_PAGE_MM.bottom - REPORT_PAGE_MM.header - REPORT_PAGE_MM.footer], [PAGE_MM.width, PAGE_MM.height]);
  const zip = await JSZip.loadAsync(bytes);
  const sec = await zip.file("Contents/section0.xml")!.async("string");
  assert.match(sec, /gutterType="LEFT_RIGHT"/, "맞쪽");
  const head = await zip.file("Contents/header.xml")!.async("string");
  for (const f of Object.values(HWPX_FACES)) assert.ok(head.includes(`face="${f}"`), f);
  assert.match(head, /face="KoPub바탕체 Light" type="TTF" isEmbedded="0"><hh:substFont face="함초롬바탕"/);
  assert.match(head, /face="KoPub돋움체 Bold" type="TTF" isEmbedded="0"><hh:substFont face="함초롬돋움"/);
  assert.ok(!/isEmbedded="1"/.test(head), "글꼴을 넣지 않음");
  // 본문 크기(10.6pt) 글이 든 문단은 모두 160%(막대·빈 칸·표 문단만 100%)
  const bodyCp = new Set(doc.charPrs.flatMap((c, i) => (c.height === 1060 && c.face[0] === HWPX_FACES.body ? [i] : [])));
  const visit = (ps: Para[]) => {
    for (const p of ps) {
      if (p.items.some((it) => it.kind === "text" && bodyCp.has(it.charPr) && it.text.trim())) {
        const pp = doc.paraPrs[p.paraPr];
        assert.deepEqual([pp.lineSpacingType, pp.lineSpacing], ["PERCENT", 160]);
      }
      for (const t of tablesOf([p])) for (const c of t.cells) visit(c.paras);
    }
  };
  visit(doc.sections[0].paras);
  assert.ok(bodyCp.size > 0);
});

test("그림 자리: 크기 등급 mm 그대로의 점선 상자(자리 left·right·center, 패널 안·협업 가운데·사례 옆·지도·로고)", async () => {
  const blocks = [SAMPLES.bullets, SAMPLES["cards:arrow"], SAMPLES["compare:panels"], SAMPLES["compare:diag"], SAMPLES["hub:2"], SAMPLES.case, block({ kind: "bullets", label: "지도", items: ["지도 옆 글"], figures: [fig("map", "전국 지도", "left", "MAP")] }), block({ kind: "table", items: ["a", "b", "c"], cells: [cell("x", ["1", "2"]), cell("y", ["3", "4"])], figures: [fig("illust", "가로 삽화", "right", "W")] })];
  const want = blocks.flatMap((b) => b.figures ?? []);
  const { doc } = await convert(makeSpec(blocks));
  const labels = new Set(Object.values(FIGURE_LABEL));
  const boxes = allTables(doc.sections[0].paras).filter((t) => t.cells.length === 1 && labels.has(t.cells[0].paras[0]?.items.map((it) => (it.kind === "text" ? it.text : "")).join("") ?? ""));
  assert.equal(boxes.length, want.length, "그림마다 상자 하나");
  const got = boxes.map((t) => `${t.pos.width}x${t.cells[0].height}`).sort();
  assert.deepEqual(got, want.map((f) => `${mm(figureMm(f).w)}x${mm(figureMm(f).h)}`).sort());
  for (const t of boxes) {
    const bf = doc.borderFills[t.cells[0].borderFill]!;
    assert.equal(bf.left.type, "DASH", "점선 상자");
    assert.equal(t.cells[0].width, t.pos.width);
  }
});

test("모르는 블록 종류·옛 spec(v1·v2): 예외 없음 + warnings, 글은 남음", async () => {
  const unknown = makeSpec([{ ...block({ kind: "bullets" }), kind: "mystery" as any, title: "미지 제목", text: "미지 글", items: ["미지 항목"], cells: [cell("미지 칸", ["칸 글"])] }]);
  const u = await convert(unknown);
  assert.equal(u.warnings.length, 1);
  assert.ok(u.warnings[0].includes("mystery"));
  for (const x of ["미지 제목", "미지 글", "미지 항목", "미지 칸", "칸 글"]) assert.ok(u.text.includes(x), x);
  for (const [name, spec, texts] of [
    ["v2", v2Spec, ["정부 방침", "인용 원문", "추진배경", "문제A", "✚", "메시지 띠 글", "흐름", "수집", "자료 수집", "노력A", "성과A", "’26", "전", "후", "글만", "수상", "대상", "옛 성과", "추진 노력"]],
    ["v1", v1Spec, ["추진내용", "v1 불릿", "v1 성과"]],
  ] as const) {
    const r = await convert(spec);
    assert.equal(r.warnings.length, 1, name);
    assert.ok(r.warnings[0].includes(`v${spec.version}`), name);
    for (const x of texts) assert.ok(r.text.includes(x), `${name}: 「${x}」`);
    checkText(name, spec, r.text);
    checkWidths(name, r.doc);
  }
});

test("같은 값은 모양 표에 한 번만(등록기) · 같은 spec → 같은 파일 묶음(재현성)", () => {
  const a = sectionHwpxInput(layoutSpec).input.doc;
  const key = (xs: unknown[]) => xs.map((x) => JSON.stringify(x));
  for (const [name, xs] of [
    ["charPrs", a.charPrs],
    ["paraPrs", a.paraPrs],
    ["borderFills", a.borderFills.slice(1)],
  ] as const)
    assert.equal(new Set(key(xs as unknown[])).size, xs.length, `${name} 중복 없음`);
  assert.deepEqual(sectionHwpxInput(layoutSpec).input, sectionHwpxInput(layoutSpec).input);
});

// 값 객체(REPORT_STYLE)로 옮길 때 바이트까지 같음을 확인한 고정값 — 2026-10-21 사이 칸 5 → 3.5mm·기호 13 → 10pt·시기 화살표 4.2 → 3.2mm·좁은 칸 안 여백 3px로 갱신.
// 2026-10-26 글꼴 별칭·표지 갱신(report-fonts.ts): 별칭 @font-face(local만)·표지 덮기 규칙을 더하고, 글꼴 목록에 별칭을 넣고 KoPubWorld를 빼고,
// 제목·라벨 −0.02em을 같은 값의 변수(--k-ls-head·--k-ls-label-t)로 바꿈. 이 네 가지를 되돌린 글이 옛 고정값 3575b10a…과 같음을 확인 —
// 표지가 없으면(글꼴 없는 PC) 계산값은 예전과 같음(report-fonts.test.ts fontSpacingFor(""))
// 2026-10-28 사용자 승인 화면 변경(dabe660f… → 335987e3…): 본문 글 글자 단위 규칙(word-break:normal — 불릿·패널·협업 역할·시기 점·수치 설명·정의·목소리·표 값 칸),
// 괄호 + 조사 묶음 .k-nb(white-space:nowrap), 전후 비교 표 화살표 열 머리 바탕 투명
// 2026-10-28 수치 띠를 2025 추진성과 행 모양으로(335987e3… → 771dac2d…): 수치 띠가 추진성과 상자(.k-result)를 같이 써서 큰 수치 칸 규칙(.k-stats·.k-stat·__v·__d·__n·__v .k-need)을 지우고
// 그 자리에 안내 주석 한 줄 — REPORT_STYLE의 수치 칸 전용 값(pt.statNeed·lh.stat·lh.statNote)도 지움
test("화면 CSS(REPORT_CSS) 고정 — 화면·한글 공용 값(REPORT_STYLE)을 바꾸면 이 값도 바뀜", () => {
  assert.equal(createHash("sha256").update(REPORT_CSS).digest("hex"), "771dac2d4cdf0155bda234b0f86760f0e1996cc452d37d927c1fc63adfdce4ab");
});

test("칸 사이 기호 칸(REPORT_STYLE.join.gapMm 3.5mm)·좁은 칸 안 여백(boxPadX 3px): 화면 HTML·CSS·판면 어림(slotOf)·한글 양식이 같은 값", () => {
  const J = REPORT_STYLE.join.gapMm;
  const PAD = REPORT_STYLE.boxPadX;
  assert.equal(J, 3.5);
  assert.equal(PAD, 3);
  const PX = 25.4 / 96;
  const INDENT = 0.95 * 10.6 * (25.4 / 72);
  const plus = block({ kind: "cards", variant: "plus", cells: four.slice(0, 3) });
  const arrow = block({ kind: "cards", variant: "arrow", cells: four.slice(0, 3) });
  const tl = block({ kind: "timeline", variant: "chevron", cells: four.slice(0, 3) });
  const steps = block({ kind: "steps", variant: "row", cells: four.slice(0, 3) });
  const pdca = block({ kind: "pdca", cells: four });

  // 화면: 카드 묶음·시기 흐름 grid 열 템플릿(인라인), PDCA·시기 기본 템플릿(CSS), 칸 본문 안 여백
  const html = sectionBodyHtml(makeSpec([plus, arrow, tl]));
  assert.equal(html.match(/class="k-cards k-cards--join" style="grid-template-columns:minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\)"/g)?.length, 2, "✚·▶ 카드 묶음");
  assert.match(html, /<ol class="k-tl" style="grid-template-columns:1fr 3\.5mm 1fr 3\.5mm 1fr">/);
  assert.match(REPORT_CSS, /\.k-pdca\{display:grid;grid-template-columns:minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\);/);
  assert.match(REPORT_CSS, /ol\.k-tl\{display:grid;grid-template-columns:1fr 3\.5mm 1\.45fr 3\.5mm 1fr;/);
  for (const x of [".k-card__b{padding:2px 3px;", ".k-proc__b{padding:2px 3px}", ".k-tl__b{border:var(--k-hair) solid var(--k-g4);padding:1px 3px}", ".k-tl__sep svg{width:3.2mm;", "font:900 10pt/1 var(--k-f-label)}"])
    assert.ok(REPORT_CSS.includes(x), `CSS에 ${x}`);

  // 판면 어림: 칸 글 폭 = (놓인 폭 − 사이 칸) ÷ 칸 수 − 안 여백 좌우 3px − 불릿 들여쓰기 — 사다리 안(150mm 남짓)·전폭(170mm) 둘 다
  const near = (a: number, b: number, what: string) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} ≠ ${b}`);
  for (const label of ["추진내용", ""]) {
    const W = blockWidth({ ...plus, label });
    near(slotOf(plus, W).body, (W - 2 * J) / 3 - 2 * PAD * PX - INDENT, `카드 ✚ ${W}`);
    near(slotOf(arrow, W).body, (W - 2 * J) / 3 - 2 * PAD * PX - INDENT, `카드 ▶ ${W}`);
    near(slotOf(tl, W).body, (W - 2 * J) / 3 - 2 * PAD * PX - INDENT, `시기 ${W}`);
    near(slotOf(tl, W).note, (W - 2 * J) / 3 - 2 * PAD * PX, `시기 결과 줄 ${W}`);
    near(slotOf(steps, W).body, W / 3 - 2 * PAD * PX - INDENT, `단계 ${W}`);
    near(slotOf(pdca, W).body, (W - 3 * J) / 4 - 2 * PAD * PX - INDENT, `PDCA ${W}`);
  }

  // 한글: 같은 블록을 전폭으로 그린 표에서 기호 칸 폭 = 3.5mm, 본문 칸 좌우 여백 = 3px(1px = 75 HWPUNIT)
  const tableWith = (b: Block, mark: string) => {
    const t = allTables(sectionHwpxInput(makeSpec([b])).input.paras).find((x) => x.cells.some((c) => c.col === 1 && textOf(c.paras).join("") === mark));
    assert.ok(t, `${b.kind}:${b.variant} 표(${mark})`);
    return t;
  };
  for (const [b, mark, gaps] of [[plus, "✚", 2], [arrow, "▶", 2], [tl, "▶", 2], [pdca, "▶", 3]] as const) {
    const t = tableWith(b, mark);
    const gapCells = t.cells.filter((c) => c.col % 2 === 1);
    assert.equal(gapCells.length, gaps, `${b.kind} 기호 칸 수`);
    for (const c of gapCells) assert.ok(Math.abs(c.width - mm(J)) <= 1, `${b.kind}:${b.variant} 기호 칸 ${c.width} ≠ ${mm(J)}`);
    for (const c of t.cells.filter((x) => x.row === 1 && x.col % 2 === 0)) assert.deepEqual(c.margin.slice(0, 2), [PAD * 75, PAD * 75], `${b.kind} 본문 칸 좌우 여백`);
  }
  const flow = allTables(sectionHwpxInput(makeSpec([steps])).input.paras).find((x) => x.cols === 3 && x.cells.some((c) => textOf(c.paras).join("").includes("가1 글")));
  assert.ok(flow, "단계 흐름 표");
  for (const c of flow.cells.filter((x) => x.row === 1)) assert.deepEqual(c.margin.slice(0, 2), [PAD * 75, PAD * 75], "단계 본문 칸 좌우 여백");
});

// ───────────────────────── 2회차

test("【확인: …】은 괄호 그대로 + 노란 음영(따로 붙인 「확인」 칩 없음) — 다시 읽은 글에 원래 개수만큼", async () => {
  const spec = makeSpec([SAMPLES.bullets, SAMPLES.stats, SAMPLES.chart]);
  const want = (JSON.stringify(spec).match(/【확인:/g) ?? []).length;
  assert.ok(want >= 3);
  const { doc } = await convert(spec);
  const texts = textOf(doc.sections[0].paras);
  const got = texts.join("\n");
  // 막대의 【확인】 칸은 점선 빈 막대 + 「확인」 글이라 괄호 글 개수에서 뺌
  const bars = (JSON.stringify(spec.blocks).match(/"value":"【확인:/g) ?? []).length;
  assert.equal((got.match(/【확인:/g) ?? []).length, want - bars);
  assert.ok(!/(^|\s)확인 /.test(got.replace(/【확인:/g, "")), "확인 칩 없음");
  const run = [...doc.sections[0].paras, ...allTables(doc.sections[0].paras).flatMap((t) => t.cells.flatMap((c) => c.paras))].flatMap((p) => p.items).find((it) => it.kind === "text" && it.text.startsWith("【확인: "));
  assert.ok(run && run.kind === "text");
  assert.ok(doc.charPrs[run.charPr].shade, "노란 음영");
});

// 2026-10-28: 본문 글은 2025 최종본처럼 글자 단위(KEEP_WORD — 이름과 뜻이 반대), 제목·라벨·머리·칩은 어절 단위(BREAK_WORD) — 화면 section-css와 같은 갈래
test("줄 나눔: 불릿·본문 문단은 breakNonLatinWord=KEEP_WORD(글자 단위), 머리·라벨 문단은 BREAK_WORD(어절 단위), 영문은 늘 KEEP_WORD(단어 단위)", async () => {
  const { bytes, doc } = await convert(makeSpec(Object.values(SAMPLES)));
  assert.ok(doc.paraPrs.length > 0);
  for (const pp of doc.paraPrs) assert.equal(pp.breakLatin, "KEEP_WORD");
  for (const pp of doc.paraPrs.filter((x) => x.headingType === "BULLET")) assert.equal(pp.breakNonLatin, "KEEP_WORD", "불릿 = 본문");
  const paras = [...doc.sections[0].paras, ...allTables(doc.sections[0].paras).flatMap((t) => t.cells.flatMap((c) => c.paras))];
  const textOf = (p: Para) => p.items.map((it) => (it.kind === "text" ? it.text : "")).join("");
  const sub = paras.find((p) => textOf(p).includes("AI 판독"))!;
  assert.equal(doc.paraPrs[sub.paraPr].breakNonLatin, "BREAK_WORD", "소항목 제목 = 어절 단위");
  const head = await (await JSZip.loadAsync(bytes)).file("Contents/header.xml")!.async("string");
  assert.match(head, /breakNonLatinWord="KEEP_WORD"/);
  assert.match(head, /breakNonLatinWord="BREAK_WORD"/);
  assert.doesNotMatch(head, /breakLatinWord="BREAK_WORD"/);
});

// 2026-10-28: 수치 띠 = 2025 추진성과 행(굵은 테두리 상자 + 진회색 라벨 칸 + 굵은 불릿 「뜻(수치)」) — 큰 수치 칸 띠는 버림
test("수치 띠: 사다리 밖이면 추진성과 상자(라벨 칸 + 굵은 불릿), 소항목 추진성과가 따로 있으면 「추진실적」 사다리 행(상자 하나)", async () => {
  const { doc, text } = await convert(makeSpec([SAMPLES.stats]));
  const runs = [...doc.sections[0].paras, ...allTables(doc.sections[0].paras).flatMap((t) => t.cells.flatMap((c) => c.paras))].flatMap((p) => p.items);
  const run = (pred: (t: string) => boolean) => {
    const r = runs.find((it) => it.kind === "text" && pred(it.text));
    assert.ok(r && r.kind === "text");
    return doc.charPrs[r.charPr];
  };
  assert.equal(run((t) => t === "추진성과").height, REPORT_STYLE.pt.resultLabel * 100, "라벨 칸 = 추진성과 상자 라벨 글자");
  assert.ok(text.includes("구분A 유형 수(24종, 기준일 9월)") && text.includes("신뢰도(97%)") && text.includes("무선국(【확인: ’26년 국수】)"), text);
  assert.equal(run((t) => t.includes("유형 수(")).height, REPORT_STYLE.pt.body * 100, "불릿은 본문 크기");
  assert.equal(run((t) => t.startsWith("【확인: ")).height, REPORT_STYLE.pt.body * 100, "【확인】도 본문 크기(큰 수치 칸 10.5pt 없음)");
  assert.ok(!runs.some((it) => it.kind === "text" && it.text === "97%"), "큰 수치 칸 없음");
  const own = await convert(makeSpec([SAMPLES.stats], { results: ["성과 줄"] }));
  const labels = textOf(own.doc.sections[0].paras).filter((t) => t === "추진성과" || t === "추진실적");
  assert.deepEqual(labels, ["추진실적", "추진성과"], "수치 띠는 사다리 행 「추진실적」, 추진성과 상자는 끝 하나");
});

test("빈칸 폭: 모든 글자 모양이 useFontSpace=1(글꼴의 빈칸 폭 — 화면과 같음)", async () => {
  const { bytes, doc } = await convert(layoutSpec);
  assert.ok(doc.charPrs.length > 0);
  assert.ok(doc.charPrs.every((c) => c.useFontSpace));
  const head = await (await JSZip.loadAsync(bytes)).file("Contents/header.xml")!.async("string");
  assert.equal(head.match(/<hh:charPr /g)?.length, head.match(/useFontSpace="1"/g)?.length);
  assert.ok(!/useFontSpace="0"/.test(head));
});

/** 글(문단 안 조각을 이은 것)이 조건에 맞는 첫 문단의 줄간격 % — 표 칸 안까지 */
function lineOf(doc: HwpDoc, pred: (t: string) => boolean): number {
  const find = (ps: Para[]): Para | undefined => {
    for (const p of ps) {
      if (pred(p.items.map((it) => (it.kind === "text" ? it.text : "")).join(""))) return p;
      for (const t of tablesOf([p])) for (const c of t.cells) {
        const got = find(c.paras);
        if (got) return got;
      }
    }
  };
  const p = find(doc.sections[0].paras);
  assert.ok(p, "문단 없음");
  const pp = doc.paraPrs[p.paraPr];
  assert.equal(pp.lineSpacingType, "PERCENT");
  return pp.lineSpacing;
}
/** 화면 CSS 규칙(.kca-dg-doc <선택자>{…})의 font 줄 높이 */
function cssLh(sel: string): number {
  const m = new RegExp(`\\.kca-dg-doc ${sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\{[^}]*?font:[^;}]*?/([0-9.]+) `).exec(REPORT_CSS);
  assert.ok(m, `CSS 규칙 ${sel}`);
  return Number(m[1]);
}

test("머리 세 문단 줄간격 = 화면 CSS line-height × 100: 대상사업 130 · 실행과제 125 · 소항목 130", async () => {
  const LH = REPORT_STYLE.lh;
  assert.deepEqual([LH.biz, LH.task, LH.sub], [1.3, 1.25, 1.3]);
  assert.deepEqual([cssLh(".k-biz"), cssLh(".k-task"), cssLh(".k-sub")], [LH.biz, LH.task, LH.sub]);
  const { doc } = await convert(layoutSpec);
  assert.equal(lineOf(doc, (t) => t.startsWith(" 대상사업1 ")), 130);
  assert.equal(lineOf(doc, (t) => t.startsWith(" 1-1 ")), 125);
  assert.equal(lineOf(doc, (t) => t.startsWith("가. [수신환경] ")), 130);
});

test("상자 머리·표 머리 칸·수치 칸 줄간격 = 화면 CSS line-height × 100(REPORT_STYLE.lh)", async () => {
  const LH = REPORT_STYLE.lh;
  const rows: Array<[sample: string, pred: (t: string) => boolean, css: string, lh: number, want: number]> = [
    ["table:", (t) => t === "구분", "table.k-tbl thead th", LH.tbl, 145],
    ["table:", (t) => t === "건수", "table.k-tbl tbody th", LH.tbl, 145],
    ["table:result", (t) => t === "가", "table.k-tbl tbody th", LH.tbl, 145],
    ["table:result", (t) => t === "추진실적", ".k-res__h", LH.resHead, 140],
    ["table:result", (t) => t === "1,240건", ".k-res__v", LH.resValue, 130],
    ["cards:plain", (t) => t.endsWith("가 칸"), ".k-card__h", LH.card, 150],
    ["steps:row", (t) => t.endsWith("수요조사"), ".k-proc__h", LH.proc, 155],
    ["timeline:chevron", (t) => t === "’24년", ".k-tl__h", LH.tl, 150],
    ["compare:table", (t) => t === "구 분", "table.k-ba thead th", LH.ba, 150],
    ["compare:panels", (t) => t.endsWith("수작업"), ".k-panel__h", LH.panel, 155],
    ["case", (t) => t.endsWith("대통령상 수상"), ".k-case__h", LH.caseHead, 155],
    ["quotes", (t) => t.endsWith("정부 지시"), ".k-ctx__head", LH.ctx, 150],
    ["chart", (t) => t.startsWith("막대 제목"), ".k-chart figcaption", LH.chart, 145],
    ["stats", (t) => t === "추진성과", ".k-result__label", LH.result, 130],
  ];
  for (const [sample, pred, css, lh, want] of rows) {
    assert.equal(cssLh(css), lh, `${css} CSS`);
    assert.equal(Math.round(lh * 100), want, css);
    const { doc } = await convert(makeSpec([SAMPLES[sample]]));
    assert.equal(lineOf(doc, pred), want, `${sample} — ${css}`);
  }
});

test("XML 금지 문자: 본문·모양·미리보기 글 모두 0", async () => {
  const bad = "\u0000\u0001\u0008\u000B\u000C\u000E\u001F￾￿\uD800";
  const spec = makeSpec([block({ kind: "bullets", title: `제목${bad}`, items: [`글${bad}끝`, `탭\t줄\n바꿈${bad}`] }), block({ kind: "chart", series: [{ label: `a${bad}`, value: `5${bad}` }, { label: "b", value: "9" }] })], { sub: { mark: "가", title: `소${bad}`, markers: [], chip: "" } });
  const { bytes } = await sectionToHwpx(spec, { title: `제목${bad}` });
  const zip = await JSZip.loadAsync(bytes);
  const re = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  for (const f of ["Contents/section0.xml", "Contents/header.xml", "Preview/PrvText.txt"]) {
    const t = await zip.file(f)!.async("string");
    assert.ok(t.length > 0 && !re.test(t), f);
  }
});

test("막대: 막대 칸 높이 비율 = 값 비율, 값 글 칸이 막대 바로 위(위 빈 칸 + 막대 = 같은 열 높이)", async () => {
  const spec = makeSpec([block({ kind: "chart", series: [{ label: "a", value: "5" }, { label: "b", value: "12" }, { label: "c", value: "20" }] })]);
  const { doc } = await convert(spec);
  const cols = allTables(doc.sections[0].paras).filter((t) => t.rows === 3 && t.cols === 3 && t.cells.some((c) => c.row === 2 && c.col === 1));
  assert.equal(cols.length, 3);
  const h = (t: Table, r: number) => t.cells.find((c) => c.row === r && c.col === 0)!.height;
  const bars = cols.map((t) => h(t, 2));
  for (const [i, v] of [5, 12, 20].entries()) assert.ok(Math.abs(bars[i] - (bars[2] * v) / 20) <= 1, `막대 ${v}: ${bars[i]}`);
  const total = cols.map((t) => h(t, 0) + h(t, 1) + h(t, 2));
  assert.ok(total.every((x) => Math.abs(x - total[0]) <= 1), "열 높이 같음(최소 높이 1 오차)");
  assert.equal(h(cols[2], 0), 1, "최대 막대 위 빈 칸은 최소");
});

test("점 연혁: 점 칸은 두 반 행을 합치고 선(위쪽 테두리)은 두 반 행의 경계", async () => {
  const { doc } = await convert(makeSpec([block({ kind: "timeline", variant: "dots", cells: [cell("’24", ["가"]), cell("’25", ["나"])] })]));
  const t = allTables(doc.sections[0].paras).find((x) => x.rows === 4 && x.cols === 6)!;
  assert.ok(t);
  const dots = t.cells.filter((c) => c.rowSpan === 2);
  assert.equal(dots.length, 2);
  assert.ok(dots.every((c) => c.row === 1));
  const lines = t.cells.filter((c) => c.row === 2 && c.rowSpan === 1 && doc.borderFills[c.borderFill]!.top.type === "SOLID");
  assert.equal(lines.length, 4);
});

test("글머리표 내어쓰기(2026-10-28): 화면 li(부호 0.05em·글 0.95em — REPORT_STYLE.bullet)와 같은 자리 — left = 부호 자리, intent = −(글 − 부호), 첫 줄 글 = 부호 + 「•」 폭 + 본문과의 거리 · 자동 내어쓰기 끔 · 점검 0", async () => {
  const B = REPORT_STYLE.bullet;
  const spec = makeSpec([SAMPLES.bullets, SAMPLES["cards:arrow"], SAMPLES.case]);
  const { input } = sectionHwpxInput(spec);
  const allParas = (ps: Para[]): Para[] => ps.flatMap((p) => [p, ...tablesOf([p]).flatMap((t) => t.cells.flatMap((c) => allParas(c.paras)))]);
  const bullets = allParas(input.paras).filter((p) => input.doc.paraPrs[p.paraPr].headingType === "BULLET");
  assert.ok(bullets.length >= 3);
  for (const p of bullets) {
    const pp = input.doc.paraPrs[p.paraPr];
    const em = input.doc.charPrs[p.endCharPr!].height;
    const head = input.doc.bullets[pp.headingId - 1].head;
    assert.equal(pp.left, Math.round(B.markEm * em), "첫 줄 = 부호 자리");
    assert.equal(pp.indent, -Math.round((B.padEm - B.markEm) * em), "둘째 줄부터 = 글 시작");
    assert.deepEqual([head.autoIndent, head.instWidth, head.textOffsetPercent], [false, true, false]);
    // 첫 줄 글 자리(부호 자리 + 「•」 0.4em + 본문과의 거리)가 둘째 줄 자리(left − intent)와 같음(반올림 2 HWPUNIT 안)
    assert.ok(Math.abs(pp.left + 0.4 * em + head.textOffset - (pp.left - pp.indent)) <= 2, `${em}`);
  }
  assert.equal(hangCheck(input).flat, 0);
  // 파일로 써서 다시 읽어도 같음
  const doc = await readHwpx((await sectionToHwpx(spec)).bytes);
  assert.equal(hangCheck({ doc, paras: doc.sections.flatMap((x) => x.paras) }).flat, 0);
});
