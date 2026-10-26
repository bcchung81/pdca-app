// 한글(HWP 5) 읽기·원본 그대로 HTML: 원본 카드 파일 3개(59장)로 구조를, 작은 표로 격자 규칙을 확인합니다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { borderFillCss, cellContentHeight, HW_CSS, paraHtml, sharedEdgeSkips, spacingAttrs, tableGrid, tableHtml } from "./html.ts";
import { readHwp5 } from "./hwp5.ts";
import { extractCardLayouts, isCardTable, layoutDoc } from "./layout.ts";
import type { Border, BorderFill, Cell, CharPr, HwpDoc, LineSeg, Para, ParaPr, Pic, Table } from "./model.ts";
import { cardSourceFile } from "../cards/file-names.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const file = (g: number) => join(ROOT, "data/cards/260916", cardSourceFile(g));
const has = [1, 2, 3].every((g) => existsSync(file(g)));

const docs = new Map<number, HwpDoc>();
const doc = (g: number) => {
  if (!docs.has(g)) docs.set(g, readHwp5(readFileSync(file(g))));
  return docs.get(g)!;
};

function walk(ps: Para[], f: (p: Para) => void) {
  for (const p of ps) {
    f(p);
    for (const it of p.items)
      if (it.kind === "obj") {
        const o = it.obj;
        if (o.kind === "table") for (const c of o.cells) walk(c.paras, f);
        else if (o.kind !== "pic" && o.text) walk(o.text.paras, f);
      }
  }
}

test("원본 카드 파일: 카드 표 59장을 떼고, 줄 배치·글자 모양이 있음", { skip: !has && "원본 한글 파일 없음" }, () => {
  const counts = [1, 2, 3].map((g) => extractCardLayouts(doc(g)).length);
  assert.deepEqual(counts, [20, 21, 18]);
  const d = doc(1);
  let paras = 0;
  let withLines = 0;
  walk(d.sections[0].paras, (p) => {
    paras++;
    if (p.lines.length) withLines++;
  });
  assert.ok(paras > 2000 && withLines / paras > 0.95, `줄 배치 ${withLines}/${paras}`);
  // 카드 표는 「과제명」으로 시작
  const first = extractCardLayouts(d)[0].blocks[0];
  assert.ok(first.kind === "table" && isCardTable(first.table));
});

test("글자 겹침(tcps): 글머리 「∙+전각 빈칸」과 AX 번호 딱지를 읽음", { skip: !has && "원본 한글 파일 없음" }, () => {
  const composes: string[] = [];
  walk(doc(1).sections[0].paras, (p) => {
    for (const it of p.items) if (it.kind === "compose") composes.push(`${it.chars}|${it.border}`);
  });
  assert.ok(composes.includes("∙　|0"), "글머리 겹침");
  assert.ok(composes.some((c) => c.startsWith("❶")), "AX 번호 딱지");
});

test("배치: 쓰인 모양만 번호를 다시 매기고 그림 원본 id를 기억함", { skip: !has && "원본 한글 파일 없음" }, () => {
  const l = extractCardLayouts(doc(1))[0];
  assert.ok(l.charPrs.length < doc(1).charPrs.length && l.paraPrs.length < doc(1).paraPrs.length);
  assert.ok(l.bins.length > 0 && l.bins.every((b) => doc(1).bins.has(b.src)));
  // 다시 매긴 번호가 모두 표 안에 있음
  const d = layoutDoc(l);
  for (const b of l.blocks)
    if (b.kind === "table")
      walk(
        b.table.cells.flatMap((c) => c.paras),
        (p) => {
          assert.ok(d.paraPrs[p.paraPr], "문단 모양");
          for (const it of p.items) assert.ok(d.charPrs[it.charPr], "글자 모양");
        },
      );
  const html = tableHtml({ doc: d, imageUrl: () => null }, (l.blocks[0] as { table: Table }).table);
  assert.match(html, /^<table class="hw-t"/);
  assert.ok(html.replace(/<[^>]+>/g, "").includes("과제명"));
});

const cell = (row: number, col: number, width: number, colSpan = 1, rowSpan = 1): Cell => ({
  row,
  col,
  rowSpan,
  colSpan,
  width,
  height: 1000,
  margin: [0, 0, 0, 0],
  ownMargin: false,
  borderFill: 0,
  vertAlign: "TOP",
  paras: [],
});
const table = (cols: number, rows: number, width: number, cells: Cell[]): Table => ({
  kind: "table",
  pos: { treatAsChar: true, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width, height: 2000, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
  rows,
  cols,
  cellSpacing: 0,
  inMargin: [0, 0, 0, 0],
  borderFill: 0,
  pageBreak: "NONE",
  repeatHeader: false,
  cells,
});

test("표 격자: 윗행에서 내려온 병합 칸이 빠진 행도 경계가 맞음(원본 PDF와 같게)", () => {
  // 1행: 왼칸 · 가운데 화살표(두 행 병합) · 오른칸, 2행: 왼칸 · 오른칸(가운데는 윗행에서 내려옴)
  const t = table(3, 2, 42429, [cell(0, 0, 20563), cell(0, 1, 1303, 1, 2), cell(0, 2, 20563), cell(1, 0, 20563), cell(1, 2, 20563)]);
  assert.deepEqual(tableGrid(t).xs, [0, 20563, 21866, 42429]);
});

test("표 격자: 한 칸짜리 전체 행(행 폭이 표보다 짧음)은 다른 행 경계를 흔들지 않음", () => {
  const t = table(3, 2, 30000, [cell(0, 0, 29000, 3), cell(1, 0, 10000), cell(1, 1, 10000), cell(1, 2, 10000)]);
  assert.deepEqual(tableGrid(t).xs, [0, 10000, 20000, 30000]);
});

test("원본 그대로 CSS: 글자처럼 놓인 개체 속은 줄 정렬·간격을 물려받지 않음", () => {
  assert.match(HW_CSS, /\.hw-o\{[^}]*text-align:left[^}]*letter-spacing:0[^}]*word-spacing:0/);
});

test("원본 그대로 CSS: 표 테두리는 칸 내용 위(칸보다 넓은 그림이 선을 덮지 않음 — 원본 PDF는 칸 내용 뒤에 테두리를 그림)", () => {
  const z = (sel: RegExp) => Number(HW_CSS.match(sel)?.[1]);
  const border = z(/\.hw-c\.hw-bd::before\{[^}]*z-index:(\d+)/);
  const content = z(/\.hw-cc\{[^}]*z-index:(\d+)/);
  assert.ok(border > content, `테두리 z ${border} > 칸 내용 z ${content}`);
});

// ───────────────────────── 행 높이·문단 배치 규칙(원본 PDF와 대조해 정한 한글 동작)

const line = (vertpos: number, vertsize: number, over: Partial<LineSeg> = {}): LineSeg => ({ textpos: 0, vertpos, vertsize, textheight: vertsize, baseline: Math.round(vertsize * 0.85), spacing: 600, horzpos: 0, horzsize: 10000, flags: 0, ...over });
const textPara = (vertpos: number, vertsize = 1000, text = "가"): Para => ({ paraPr: 0, style: 0, items: [{ kind: "text", pos: 0, charPr: 0, text }], lines: [line(vertpos, vertsize)], length: text.length + 1, pageBreak: false });
const withParas = (c: Cell, ...paras: Para[]): Cell => ({ ...c, paras });

test("행 높이: 열마다 쌓은 칸 높이로 경계를 정함(행마다 칸이 엇갈린 도식 표)", () => {
  // 2열: 왼쪽은 1행 + 2행 병합, 오른쪽은 2행 병합 + 1행 — 경계 = 각 칸 위 경계 + 높이의 최댓값
  const t = table(2, 3, 20000, [cell(0, 0, 10000, 1, 1), cell(0, 1, 10000, 1, 2), cell(1, 0, 10000, 1, 2), cell(2, 1, 10000, 1, 1)]);
  t.cells[0].height = 1000;
  t.cells[1].height = 2500;
  t.cells[2].height = 2000;
  t.cells[3].height = 500;
  assert.deepEqual(tableGrid(t).hs, [1000, 1500, 500]);
});

test("행 높이: 병합 칸이 그 행들 합보다 크면 마지막 행이 늘고, 내용이 저장한 높이보다 크면 그 행이 늚", () => {
  const span = table(2, 2, 20000, [cell(0, 0, 10000, 1, 2), cell(0, 1, 10000), cell(1, 1, 10000)]);
  span.cells[0].height = 5050;
  span.cells[1].height = 1567;
  span.cells[2].height = 3250;
  assert.deepEqual(tableGrid(span).hs, [1567, 3483]);
  // 저장한 높이 282인데 글이 1000(+ 안 여백 282)이면 1282
  const grow = table(1, 1, 10000, [withParas({ ...cell(0, 0, 10000), height: 282, margin: [141, 141, 141, 141] }, textPara(0, 1000))]);
  assert.equal(cellContentHeight(grow.cells[0]), 1282);
  assert.deepEqual(tableGrid(grow).hs, [1282]);
});

const cp = (): CharPr => ({ height: 1000, face: Array(7).fill("함초롬바탕"), ratio: Array(7).fill(100), spacing: Array(7).fill(0), relSize: Array(7).fill(100), offset: Array(7).fill(0), bold: false, italic: false, underline: "", underlineColor: null, strike: false, strikeColor: null, supscript: false, subscript: false, outline: false, shadow: "", shadowColor: null, shadowX: 0, shadowY: 0, emboss: false, engrave: false, color: "#000000", shade: null, kerning: false, useFontSpace: false, borderFill: 0 });
const pp = (over: Partial<ParaPr> = {}): ParaPr => ({ align: "JUSTIFY", breakLatin: "KEEP_WORD", breakNonLatin: "KEEP_WORD", condense: 0, lineSpacingType: "PERCENT", lineSpacing: 160, left: 0, right: 0, indent: 0, before: 0, after: 0, vertAlign: "BASELINE", snapToGrid: true, fontLineHeight: false, keepWithNext: false, borderFill: 0, borderOffset: [0, 0, 0, 0], tabDef: 0, headingType: "NONE", headingId: 0, headingLevel: 0, autoSpaceEAsianEng: false, autoSpaceEAsianNum: false, ...over });
const ctxOf = (paraPrs: ParaPr[]) => ({ doc: { format: "hwp", faces: {}, charPrs: [cp(), { ...cp(), height: 900 }], paraPrs, borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] } as HwpDoc, imageUrl: () => null });
const opts = { first: true, last: true, prevAfter: 0, width: 10000, depth: 1 };

test("세로 정렬 가운데 문단: 저장한 기준선(줄 가운데)에 글자 상자를 가운데 둔 기준선으로", () => {
  const p: Para = { ...textPara(0, 1000), lines: [line(0, 1000, { baseline: 500 })] };
  assert.match(paraHtml(ctxOf([pp({ vertAlign: "CENTER" })]), p, opts).html, /class="hw-bl" style="height:11\.333px"/, "500 + 0.35×1000 = 850");
  assert.match(paraHtml(ctxOf([pp()]), { ...textPara(0, 1000) }, opts).html, /class="hw-bl" style="height:11\.333px"/, "기준선 정렬은 저장한 850 그대로");
});

test("표 폭이 가장 넓은 행보다 넓으면: 남는 폭은 저장된 줄 폭이 가리키는 열에(없으면 행 마지막 칸이 늘어남)", () => {
  // 1행: 두 열 병합 칸(칸 폭 5000인데 한글이 5454로 배치해 줄 폭 5454로 저장) · 오른칸, 2행: 왼칸 · 빈 좁은 칸 · 오른칸
  const laid = (c: Cell, w: number): Cell => withParas(c, { ...textPara(0), lines: [line(0, 1000, { horzsize: w })] });
  const t = table(3, 2, 9454, [laid(cell(0, 0, 5000, 2), 5454), laid(cell(0, 2, 4000), 4000), laid(cell(1, 0, 4000), 4000), cell(1, 1, 1000), laid(cell(1, 2, 4000), 4000)]);
  assert.deepEqual(tableGrid(t, () => 0).xs, [0, 4000, 5454, 9454], "둘째 열이 454 넓어짐(6-가 원본 PDF와 같음)");
  assert.deepEqual(tableGrid(t).xs, [0, 4000, 5000, 9454], "문단 모양을 모르면 행 마지막 칸이 늘어남");
  // 줄 폭이 칸 폭과 같으면(증거 없음) 그대로
  const plain = table(3, 2, 9454, [laid(cell(0, 0, 5000, 2), 5000), laid(cell(0, 2, 4000), 4454), laid(cell(1, 0, 4000), 4000), cell(1, 1, 1000), laid(cell(1, 2, 4000), 4454)]);
  assert.deepEqual(tableGrid(plain, () => 0).xs, [0, 4000, 5000, 9454]);
});

test("진하게: 자간·장평이 없어도 글자 간격 맞춤 대상(data-b) — 한글은 보통 굵기 폭으로 배치", () => {
  assert.match(spacingAttrs({ ...cp(), bold: true }, 0, { ratioInLine: false }).attrs, /data-b="1"/);
  assert.doesNotMatch(spacingAttrs(cp(), 0, { ratioInLine: false }).attrs, /data-b/);
});

test("줄 앞 빈칸은 줄이 넘쳐 빈칸을 줄일 때도 제 폭(줄의 단어 간격을 물려받지 않음)", () => {
  assert.match(HW_CSS, /\.hw-lead\{[^}]*word-spacing:0/);
});

test("정렬: 양쪽 정렬은 빈칸에만(동아시아 기호 옆 늘림 없음), 배분 정렬은 fit.ts가 글자 사이마다 나눔, 고정폭 빈칸은 늘지 않음", () => {
  const two: Para = { ...textPara(0, 1000, "가 □ 나다"), lines: [line(0, 1000), line(1600, 1000, { textpos: 3 })] };
  const justified = paraHtml(ctxOf([pp({ align: "JUSTIFY" })]), two, opts).html;
  assert.match(justified, /text-align:justify;text-align-last:justify;text-justify:inter-word/, "첫 줄(마지막 줄 아님)");
  assert.doesNotMatch(justified, /data-dist/);
  // 쪽 보기에서 자른 조각: 문단이 다음 쪽에 이어지면 조각 끝 줄도 늘림(원본 PDF), 문단 끝 줄은 늘리지 않음
  const one: Para = { ...textPara(0, 1000, "가 □ 나다"), lines: [line(0, 1000)] };
  assert.match(paraHtml(ctxOf([pp({ align: "JUSTIFY" })]), { ...one, more: true }, opts).html, /text-align:justify;text-align-last:justify/);
  assert.match(paraHtml(ctxOf([pp({ align: "JUSTIFY" })]), one, opts).html, /text-align:left;text-align-last:left/);
  const dist = paraHtml(ctxOf([pp({ align: "DISTRIBUTE" })]), textPara(0, 1000, "가나 다"), opts).html;
  assert.match(dist, /class="hw-l" data-dist="1"/);
  assert.match(dist, /text-justify:inter-character/);
  assert.match(HW_CSS, /\.hw-l \[data-w="q"\]\{display:inline-block\}/);
  assert.match(HW_CSS, /\.hw-edit \[data-w="q"\]\{display:inline!important\}/);
});

test("줄 끝 빈칸: 글자 모양이 달라 조각이 나뉘어도 모두 폭 없이(편집 글자는 남김)", () => {
  const p: Para = { ...textPara(0), items: [{ kind: "text", pos: 0, charPr: 0, text: "가나 " }, { kind: "text", pos: 3, charPr: 1, text: " " }], lines: [line(0, 1000)], length: 5 };
  const html = paraHtml(ctxOf([pp()]), p, opts).html;
  assert.match(html, /<span class="hw-ts">  <\/span>/);
});

test("줄 끝 글자(뒤 자간 없음)는 줄의 진짜 마지막 — 글 뒤에 글자처럼 놓인 개체(「신규」 딱지)가 이어지면 앞 글자도 자간을 붙임", () => {
  const badge = { kind: "rect" as const, pos: { ...table(1, 1, 2026, []).pos, width: 2026, height: 802 }, curW: 2026, curH: 802, x: 0, y: 0, line: null, fill: null, round: 0, shadow: null, text: null, children: [], points: [] };
  const spaced = (text: string, withBadge: boolean): Para => ({ ...textPara(0), items: [{ kind: "text", pos: 0, charPr: 2, text }, ...(withBadge ? [{ kind: "obj" as const, pos: text.length, charPr: 2, obj: badge }] : [])], length: text.length + (withBadge ? 9 : 1) });
  const ctx = ctxOf([pp()]);
  ctx.doc.charPrs.push({ ...cp(), spacing: Array(7).fill(-19) });
  assert.match(paraHtml(ctx, spaced("지원)", false), opts).html, /data-s="-19" data-l="1"[^>]*>\)</, "줄 끝 글자");
  assert.doesNotMatch(paraHtml(ctx, spaced("지원) ", true), opts).html, /data-l="1"/, "딱지 앞 글자는 줄 끝이 아님");
});

test("글자처럼 놓은 개체가 줄보다 낮으면 줄 아래쪽에 붙이고, 띄운 개체는 문단 기준 자리에 두고 칸이 그 아래 끝까지 늘어남", () => {
  const box = { kind: "rect" as const, pos: { ...table(1, 1, 6283, []).pos, width: 6283, height: 885 }, curW: 6283, curH: 885, x: 0, y: 0, line: null, fill: null, round: 0, shadow: null, text: null, children: [], points: [] };
  const inline: Para = { ...textPara(0), items: [{ kind: "obj", pos: 0, charPr: 0, obj: box }, { kind: "text", pos: 8, charPr: 0, text: "가" }] };
  assert.match(paraHtml(ctxOf([pp()]), inline, opts).html, /<span class="hw-ov" style="top:1\.533px">/, "1000 − 885 = 115");
  const float = { ...table(1, 1, 42247, []), pos: { ...table(1, 1, 42247, []).pos, treatAsChar: false, vertRelTo: "PARA" as const, horzRelTo: "PARA" as const, height: 1282, outMargin: [141, 141, 141, 141] as [number, number, number, number] } };
  const host: Para = { ...textPara(13052), items: [{ kind: "obj", pos: 0, charPr: 0, obj: float }] };
  const html = paraHtml(ctxOf([pp({ left: 300 })]), host, opts).html;
  assert.match(html, /position:relative;min-height:20\.853px/, "141 + 1282 + 141 = 1564");
  assert.match(html, /<span class="hw-fl" style="left:5\.88px;top:1\.88px">/, "문단 여백 300 + 바깥 여백 141, 위 141");
  const c = withParas({ ...cell(0, 0, 43294), height: 5050, margin: [283, 283, 425, 425] }, textPara(0), host);
  assert.equal(cellContentHeight(c), 13052 + 1564 + 850);
});

// ───────────────────────── 글자 밖 모양(원본 PDF 쪽 그림과 대조해 정한 규칙)

const edge = (type: string, width: number, color = "#000000"): Border => ({ type, width, color }) as Border;
const bfOf = (l: Border, r: Border, t: Border, b: Border): BorderFill => ({ left: l, right: r, top: t, bottom: b, fill: null }) as unknown as BorderFill;

test("칸 테두리: 네 변 모두 적음(없는 변도 — CSS 변수 상속으로 안쪽 표 칸이 바깥 칸 선을 물려받지 않게), 층 두께는 정수 px·선 굵기는 파일 값(한 장치 점 이상)", () => {
  const css = borderFillCss(bfOf(edge("SOLID", 0.12), edge("NONE", 0), edge("SOLID", 0.4), edge("NONE", 0)), () => null).style;
  assert.match(css, /--hw-gr:none;--hw-rw:0px;/);
  assert.match(css, /--hw-gb:none;--hw-bw:0px;/);
  // 0.12mm = 0.454px: 층 1px 안에 max(장치 점, 0.454px)만 칠함(1px보다 얇은 층은 크롬이 자리에 따라 안 그림)
  assert.match(css, /--hw-gl:linear-gradient\(to right,#000000 0 max\(var\(--hw-dp,1px\),0\.454px\),transparent max\(var\(--hw-dp,1px\),0\.454px\)\) 0 0\/1px 100% no-repeat/);
  assert.match(css, /--hw-gt:linear-gradient\(to bottom,#000000 0 max\(var\(--hw-dp,1px\),1\.512px\)[^;]*0 0\/100% 2px no-repeat/);
  // 점선은 원뿔 그러데이션 사분면(짧은 사각형 되풀이), 이중선은 선 둘
  assert.match(borderFillCss(bfOf(edge("DOT", 0.12), edge("DOT", 0.12), edge("DOT", 0.12), edge("DOT", 0.12)), () => null).style, /--hw-gt:conic-gradient\(at [^;]*repeat-x/);
  assert.match(borderFillCss(bfOf(edge("DOUBLE_SLIM", 0.5), edge("NONE", 0), edge("NONE", 0), edge("NONE", 0)), () => null).style, /--hw-gl:linear-gradient\(to right,#000000 0 max\(var\(--hw-dp,1px\),0\.472px\),transparent [^;]*,#000000 calc\(1\.89px - /);
  assert.equal(borderFillCss(bfOf(edge("NONE", 0), edge("NONE", 0), edge("NONE", 0), edge("NONE", 0)), () => null).border, false);
  assert.match(HW_CSS, /@media \(min-resolution:2dppx\)\{\.hw-doc\{--hw-dp:\.5px\}\}/);
});

test("맞닿은 칸 경계는 한 칸만 칠함(0.12mm 선이 두 겹이 되지 않게): 굵은 쪽, 같으면 왼쪽·위 칸 — 이웃이 없는 곳은 늘 칠함", () => {
  const thin = edge("SOLID", 0.12);
  const thick = edge("SOLID", 0.4);
  const none = edge("NONE", 0);
  const bfs = [bfOf(thin, thin, thin, thin), bfOf(thick, thick, thick, thick), bfOf(none, none, none, none)];
  const at = (row: number, col: number, bf: number, colSpan = 1, rowSpan = 1) => ({ cell: { ...cell(row, col, 1000, colSpan, rowSpan), borderFill: bf }, row, rowSpan });
  const skips = (cells: ReturnType<typeof at>[], rows: number, cols: number) => sharedEdgeSkips(cells, rows, cols, (c) => bfs[c.borderFill]).map((x) => [...x].sort().join(""));
  // 2×2 같은 굵기: 오른쪽·아래 칸의 왼쪽·위 변만 이웃에게 맡김(바깥 변은 늘 칠함)
  assert.deepEqual(skips([at(0, 0, 0), at(0, 1, 0), at(1, 0, 0), at(1, 1, 0)], 2, 2), ["", "l", "t", "lt"]);
  // 오른쪽 칸이 더 굵으면 그 칸이 칠하고 왼쪽 칸의 오른쪽 변을 뺌
  assert.deepEqual(skips([at(0, 0, 0), at(0, 1, 1)], 1, 2), ["r", ""]);
  // 왼쪽 칸이 더 굵으면 왼쪽 칸이 칠함
  assert.deepEqual(skips([at(0, 0, 1), at(0, 1, 0)], 1, 2), ["", "l"]);
  // 이웃 변이 없으면(선 없음) 내가 칠함
  assert.deepEqual(skips([at(0, 0, 2), at(0, 1, 0)], 1, 2), ["", ""]);
  // 병합 칸: 왼쪽 두 행 병합 칸 옆 두 칸 — 두 칸의 왼쪽 변은 병합 칸이, 병합 칸 오른쪽 변은 두 칸이 모두 같거나 가늘어 병합 칸이 칠함
  assert.deepEqual(skips([at(0, 0, 0, 1, 2), at(0, 1, 0), at(1, 1, 0)], 2, 2), ["", "l", "lt"]);
  // 경계 일부가 빈 자리면(이웃이 경계를 다 덮지 않음) 칠함
  assert.deepEqual(skips([at(0, 0, 0, 1, 2), at(0, 1, 0)], 2, 2), ["", "l"]);
  // 칠하지 않는 변도 굵기는 남김(다른 변 선이 모서리까지 닿게)
  assert.match(borderFillCss(bfs[0], () => null, new Set(["l"])).style, /--hw-gl:none;--hw-lw:0\.454px;/);
});

test("칸 내용은 칸 사각형(안 여백 포함)으로 자름 — 한글은 칸마다 그 사각형으로 잘라 그림(칸보다 넓은 안쪽 표·그림)", () => {
  const t = table(1, 1, 10000, [withParas({ ...cell(0, 0, 10000), margin: [141, 283, 141, 141] }, textPara(0))]);
  // 가로(칸 왼쪽·오른쪽 끝)로만 자름 — 위·아래는 자르지 않음(세로 정렬로 낮게 놓인 내용 상자로 자르면 첨자·딱지 테두리가 잘림)
  assert.match(tableHtml(ctxOf([pp()]), t), /--hw-ci:-9999px -3\.773px -9999px -1\.88px/);
  assert.match(HW_CSS, /\.hw-cc\{[^}]*clip-path:inset\(var\(--hw-ci,0\)\)/);
  assert.match(HW_CSS, /\.hw-cc:focus-within,\.hw-cc:has\(\.kc-anchor-hot\)\{clip-path:none\}/, "고치는 중·리뷰 표시 칸은 자르지 않음");
});

test("그림: 저장된 그림이 이미 자른 부분(범위 imgDim = 자르기 크기)이면 그대로, 원래 크기 그림은 자르기 영역만", () => {
  const pic = (over: Partial<Pic>): Pic => ({ kind: "pic", pos: { ...table(1, 1, 21569, []).pos, treatAsChar: true, width: 21569, height: 4876 }, orgW: 75780, orgH: 18240, curW: 21569, curH: 4876, crop: [0, 0, 33660, 8700], inMargin: [0, 0, 0, 0], bin: 1, borderColor: null, borderWidth: 0, bright: 0, contrast: 0, effect: "REAL_PIC", ...over }) as Pic;
  const ctx = { ...ctxOf([pp()]), imageUrl: () => "x.png" };
  const html = (p: Pic) => paraHtml(ctx, { ...textPara(0), items: [{ kind: "obj", pos: 0, charPr: 0, obj: p }] }, opts).html;
  assert.match(html(pic({ imgDim: [33660, 8700] })), /<img class="hw-o hw-pic" src="x\.png"/, "주요사업2 열일곱째 카드: 잘린 그림 전체");
  assert.match(html(pic({ imgDim: [75780, 18240] })), /overflow:hidden"><img src="x\.png" alt="" style="position:absolute;left:0px;top:0px;width:647\.454px/, "원래 크기 그림은 자르기");
});

test("글자 음영: 조각에 음영 색 표시(fit.ts가 줄 글자 높이 한 칸만 칠함), 줄 끝 빈칸 음영은 폭 없이 글 끝 뒤에", () => {
  assert.match(spacingAttrs({ ...cp(), shade: "#FFFF00" }, 0, { ratioInLine: false }).attrs, /data-sh="#FFFF00"/);
  const ctx = ctxOf([pp({ align: "LEFT" })]);
  ctx.doc.charPrs.push({ ...cp(), shade: "#FFFF00" }, { ...cp(), height: 1200, shade: "#FFFF00" });
  const p: Para = { ...textPara(0), items: [{ kind: "text", pos: 0, charPr: 2, text: "가나" }, { kind: "text", pos: 2, charPr: 3, text: " " }], length: 4, lines: [line(0, 1200)] };
  const h = paraHtml(ctx, p, opts).html;
  // 12pt 빈칸 = 6pt(8px) 음영, 줄 글자 높이 16px, 기준선 위 85%
  assert.match(h, /<span class="hw-tsh" style="width:8px;margin-right:-8px;--hw-sh:#FFFF00;--hw-shh:16px;--hw-sht:-13\.6px"><\/span><span class="hw-ts"> <\/span>/);
});
