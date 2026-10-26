// html.ts 직접 시험: 단위 변환·글꼴 후보·글자 모양 CSS·자간/빈칸·선·채우기·변환 행렬·칸 줄 좌표·표 격자·문단 HTML을 작은 입력으로.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applyMat, borderFillCss, cellContentHeight, cellLines, charBaseCss, escHtml, f3, fontStack, gradientCss, HW_CSS, HWP_FALLBACK_FACE, lineWidthPx, paraHtml, px, shapeMatrix, sharedEdgeSkips, spacingAttrs, tableGrid, tableHtml } from "./html.ts";
import type { Border, BorderFill, Cell, CharPr, Fill, HwpDoc, LineSeg, Para, ParaPr, Table } from "./model.ts";

const cp = (over: Partial<CharPr> = {}): CharPr => ({ height: 1000, face: Array(7).fill("함초롬바탕"), ratio: Array(7).fill(100), spacing: Array(7).fill(0), relSize: Array(7).fill(100), offset: Array(7).fill(0), bold: false, italic: false, underline: "", underlineColor: null, strike: false, strikeColor: null, supscript: false, subscript: false, outline: false, shadow: "", shadowColor: null, shadowX: 0, shadowY: 0, emboss: false, engrave: false, color: "#000000", shade: null, kerning: false, useFontSpace: false, borderFill: 0, ...over });
const pp = (over: Partial<ParaPr> = {}): ParaPr => ({ align: "JUSTIFY", breakLatin: "KEEP_WORD", breakNonLatin: "KEEP_WORD", condense: 0, lineSpacingType: "PERCENT", lineSpacing: 160, left: 0, right: 0, indent: 0, before: 0, after: 0, vertAlign: "BASELINE", snapToGrid: true, fontLineHeight: false, keepWithNext: false, borderFill: 0, borderOffset: [0, 0, 0, 0], tabDef: 0, headingType: "NONE", headingId: 0, headingLevel: 0, autoSpaceEAsianEng: false, autoSpaceEAsianNum: false, ...over });
const edge = (type: string, width: number, color = "#000000"): Border => ({ type, width, color }) as Border;
const bf = (l: Border, r = l, t = l, b = l, fill: Fill | null = null): BorderFill => ({ left: l, right: r, top: t, bottom: b, diagonal: edge("NONE", 0), fill }) as unknown as BorderFill;
const none = edge("NONE", 0);
const line = (vertpos: number, vertsize: number, over: Partial<LineSeg> = {}): LineSeg => ({ textpos: 0, vertpos, vertsize, textheight: vertsize, baseline: Math.round(vertsize * 0.85), spacing: 600, horzpos: 0, horzsize: 10000, flags: 0, ...over });
const para = (text: string, lines: LineSeg[]): Para => ({ paraPr: 0, style: 0, items: [{ kind: "text", pos: 0, charPr: 0, text }], lines, length: text.length + 1, pageBreak: false });
const cell = (row: number, col: number, width: number, over: Partial<Cell> = {}): Cell => ({ row, col, rowSpan: 1, colSpan: 1, width, height: 1000, margin: [0, 0, 0, 0], ownMargin: false, borderFill: 0, vertAlign: "TOP", paras: [], ...over });
const table = (cols: number, rows: number, width: number, cells: Cell[]): Table => ({
  kind: "table",
  pos: { treatAsChar: true, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width, height: 2000, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
  rows, cols, cellSpacing: 0, inMargin: [0, 0, 0, 0], borderFill: 0, pageBreak: "NONE", repeatHeader: false, cells,
});
const ctxOf = (paraPrs: ParaPr[], borderFills: (BorderFill | null)[] = [null]) => ({ doc: { format: "hwp", faces: {}, charPrs: [cp()], paraPrs, borderFills, tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] } as unknown as HwpDoc, imageUrl: () => null });

test("단위 변환·이스케이프: 75 HWPUNIT = 1px, 소수 셋째 자리, 따옴표까지 이스케이프", () => {
  assert.equal(px(75), 1);
  assert.equal(px(100), 1.333);
  assert.equal(f3(1.23456), "1.235");
  assert.equal(f3(2), "2");
  assert.equal(escHtml(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  assert.ok(Math.abs(lineWidthPx(25.4) - 96) < 1e-9);
});

test("글꼴 후보: 중복 없이 한글 대체 글꼴 포함, 명조·바탕 계열은 serif, 빈 이름은 sans-serif", () => {
  assert.equal(fontStack("맑은 고딕"), `'맑은 고딕','${HWP_FALLBACK_FACE}',sans-serif`);
  assert.equal(fontStack("함초롬바탕"), `'함초롬바탕','${HWP_FALLBACK_FACE}',serif`);
  assert.equal(fontStack(HWP_FALLBACK_FACE), `'${HWP_FALLBACK_FACE}',serif`);
  assert.equal(fontStack(""), `'${HWP_FALLBACK_FACE}',sans-serif`);
  assert.equal(fontStack("a'b"), `'ab','${HWP_FALLBACK_FACE}',sans-serif`);
});

test("글자 모양 CSS: 기본, 굵게·기울임·색·음영·밑줄·취소선, 첨자·글자 위치, 상대 크기", () => {
  assert.match(charBaseCss(cp(), 0), /^font-family:.*;font-size:13\.333px$/);
  const css = charBaseCss(cp({ bold: true, italic: true, color: "#ff0000", shade: "#ffff00", underline: "BOTTOM", strike: true, underlineColor: "#00f" }), 0);
  for (const s of ["font-weight:700", "font-style:italic", "color:#ff0000", "background-color:#ffff00", "text-decoration:underline line-through", "text-decoration-color:#00f"]) assert.ok(css.includes(s), s);
  assert.match(charBaseCss(cp({ underline: "TOP" }), 0), /text-decoration:overline/);
  assert.match(charBaseCss(cp({ supscript: true }), 0), /font-size:8\.533px;vertical-align:5\.92\d?px/);
  assert.match(charBaseCss(cp({ subscript: true }), 0), /vertical-align:-2px/);
  assert.match(charBaseCss(cp({ offset: [0, 50, 0, 0, 0, 0, 0] }), 1), /vertical-align:6\.667px/);
  assert.match(charBaseCss(cp({ relSize: [50, 100, 100, 100, 100, 100, 100] }), 0), /font-size:6\.667px/);
  assert.ok(!charBaseCss(cp({ color: "#000000" }), 0).includes("color:"));
  // 언어에 글꼴이 비면 첫 언어 글꼴
  assert.match(charBaseCss(cp({ face: ["가나", "", "", "", "", "", ""] }), 1), /'가나'/);
});

test("자간·장평·빈칸 표시: 기본은 비어 있고, 자간·장평·빈칸 종류·줄 끝·진하게·음영을 표시", () => {
  assert.deepEqual(spacingAttrs(cp(), 0, { ratioInLine: false }), { attrs: "", css: "" });
  const a = spacingAttrs(cp({ spacing: [-5, 0, 0, 0, 0, 0, 0], ratio: [90, 100, 100, 100, 100, 100, 100], bold: true, shade: "#abc" }), 0, { ratioInLine: false, space: "q", last: true });
  assert.equal(a.attrs, ' data-s="-5" data-r="90" data-w="q" data-l="1" data-b="1" data-sh="#abc"');
  assert.ok(!a.css.includes("letter-spacing"), "줄 끝 글자는 자간 CSS 없음");
  // 장평을 줄 단위로 처리하면 data-r 없음
  assert.ok(!spacingAttrs(cp({ ratio: Array(7).fill(80) }), 0, { ratioInLine: true }).attrs.includes("data-r"));
  assert.match(spacingAttrs(cp({ spacing: Array(7).fill(10) }), 0, { ratioInLine: false }).css, /letter-spacing:0\.1em/);
  // 보통 빈칸은 1/2em - 0.3em
  assert.match(spacingAttrs(cp(), 0, { ratioInLine: false, space: "h" }).css, /word-spacing:0\.2em/);
  assert.match(spacingAttrs(cp(), 0, { ratioInLine: false, space: "f" }).css, /^$|word-spacing/);
});

test("칸 테두리·채우기: null 칸, 선 없음, 색·그러데이션·그림(방식별 크기·반복·자리), 그림 주소 없으면 건너뜀", () => {
  assert.deepEqual(borderFillCss(null, () => null), { style: "", border: false });
  assert.deepEqual(borderFillCss(bf(none), () => null), { style: "", border: false });
  const solid = borderFillCss(bf(edge("SOLID", 0.12), none, none, none, { color: "#eee", patternColor: null, pattern: -1, image: null, gradation: null }), () => null);
  assert.equal(solid.border, true);
  assert.match(solid.style, /--hw-gl:linear-gradient\(to right/);
  assert.match(solid.style, /--hw-rw:0px;/);
  assert.match(solid.style, /background-color:#eee;$/);
  // skip 변은 층 없이 굵기만
  assert.match(borderFillCss(bf(edge("SOLID", 0.12)), () => null, new Set(["l"])).style, /--hw-gl:none;--hw-lw:0\.4\d+px/);
  // 무늬가 있는 색 채우기도 배경색
  assert.match(borderFillCss(bf(none, none, none, none, { color: "#123", patternColor: "#fff", pattern: 2, image: null, gradation: null }), () => null).style, /background-color:#123/);
  const img = (mode: string) => borderFillCss(bf(none, none, none, none, { color: null, patternColor: null, pattern: -1, image: { mode, bin: 1, bright: 0, contrast: 0, effect: "" }, gradation: null }), (b) => `u${b}`).style;
  assert.match(img("TOTAL"), /background-size:100% 100%;background-repeat:no-repeat;background-position:left top/);
  assert.match(img("TILE_ALL"), /background-size:auto;background-repeat:repeat/);
  assert.match(img("CENTER"), /background-position:center/);
  assert.equal(borderFillCss(bf(none, none, none, none, { color: null, patternColor: null, pattern: -1, image: { mode: "TOTAL", bin: 1, bright: 0, contrast: 0, effect: "" }, gradation: null }), () => null).style, "");
});

test("무늬 선: 점선·파선·이중선이 각각 다른 층, 선 굵기는 CSS 변수", () => {
  const style = (t: string) => borderFillCss(bf(edge(t, 0.3)), () => null).style;
  assert.match(style("DOT"), /conic-gradient/);
  assert.match(style("DASH"), /repeat-y/);
  assert.match(style("LONG_DASH"), /repeat-y/);
  assert.match(style("DOUBLE_SLIM"), /linear-gradient\(to right,#000000 0/);
  assert.notEqual(style("DOT"), style("LONG_DASH"));
  // 세로 변·가로 변 방향이 다름
  const tb = borderFillCss(bf(none, none, edge("DASH", 0.3), edge("DASH", 0.3)), () => null).style;
  assert.match(tb, /--hw-gt:.*repeat-x/);
  assert.match(tb, /--hw-gb:.*0 100%/);
});

test("그러데이션: 줄무늬는 linear, 그 밖은 radial(중심), 색 위치·색 없음 기본 흑백", () => {
  const fill = (g: object): Fill => ({ color: null, patternColor: null, pattern: -1, image: null, gradation: g as Fill["gradation"] });
  assert.equal(gradientCss(fill({ type: 1, angle: 90, cx: 0, cy: 0, colors: ["#fff", "#000"] })), "linear-gradient(90deg,#fff,#000)");
  assert.equal(gradientCss(fill({ type: 0, angle: 0, cx: 0, cy: 0, colors: [] })), "linear-gradient(0deg,#FFFFFF,#000000)");
  assert.equal(gradientCss(fill({ type: 2, angle: 0, cx: 20, cy: -40, colors: ["#111", "#222", "#333"], positions: [0, 50, 100] })), "radial-gradient(circle at 60% 30%,#111 0%,#222 50%,#333 100%)");
  assert.equal(gradientCss(fill({ type: 2, angle: 0, cx: 0, cy: 0, colors: ["#111", "#222"], positions: [0] })), "radial-gradient(circle at 50% 50%,#111,#222)");
});

test("변환 행렬: 없거나 6개가 아니면 null, 이동만이면 그대로, (크기, 회전) 쌍은 바깥부터 곱함", () => {
  const geo = (trans: number[], pairs: [number[], number[]][] = []) => ({ orgW: 10, orgH: 20, flipH: false, flipV: false, angle: 0, cx: 0, cy: 0, trans, pairs, groupLevel: 0 });
  assert.equal(shapeMatrix(undefined), null);
  assert.equal(shapeMatrix(geo([1, 0, 0])), null);
  const id = [1, 0, 0, 0, 1, 0];
  assert.deepEqual(shapeMatrix(geo([1, 0, 5, 0, 1, 7])), [1, 0, 5, 0, 1, 7]);
  const m = shapeMatrix(geo([1, 0, 5, 0, 1, 7], [[[2, 0, 0, 0, 3, 0], id]]))!;
  assert.deepEqual(applyMat(m, 1, 1), [7, 10]);
  // 90도 회전(x→-y)
  const r = shapeMatrix(geo(id, [[id, [0, -1, 0, 1, 0, 0]]]))!;
  assert.deepEqual(applyMat(r, 1, 0), [0, 1]);
});

test("칸 줄 좌표: 한 쪽 안에서는 이어지고, 위치가 되돌아가면 앞 줄 끝에 이어 붙이며 쪽 번호가 늘고, 줄 배치가 없으면 null", () => {
  const c = cell(0, 0, 1000, { paras: [para("가", [line(0, 1000), line(1600, 1000)]), para("나", [line(3200, 1000)])] });
  const ls = cellLines(c)!;
  assert.deepEqual(ls.map((l) => [l.p, l.i, l.top, l.page]), [[0, 0, 0, 0], [0, 1, 1600, 0], [1, 0, 3200, 0]]);
  // 쪽을 넘어 세로 위치가 0으로 돌아감
  const wrap = cellLines(cell(0, 0, 1000, { paras: [para("가", [line(0, 1000), line(1600, 1000), line(0, 1000)])] }))!;
  assert.equal(wrap[2].top, 3200);
  assert.equal(wrap[2].page, 1);
  assert.equal(cellLines(cell(0, 0, 1000, { paras: [para("가", [])] })), null);
  assert.deepEqual(cellLines(cell(0, 0, 1000)), []);
});

test("칸 내용 높이: 줄 배치 마지막 아래 + 안 여백, 줄 배치 없으면 0, 빈 칸 0", () => {
  const c = cell(0, 0, 1000, { margin: [0, 0, 100, 200], paras: [para("가", [line(0, 1000)])] });
  assert.equal(cellContentHeight(c), 1000 + 300);
  assert.equal(cellContentHeight({ ...c, paras: [para("가", [])] }), 0);
  assert.equal(cellContentHeight(cell(0, 0, 1000)), 0);
});

test("표 격자: 열 경계는 칸 폭 누적, 표 폭이 가장 넓은 행보다 좁아도 마지막 경계는 표 폭, 높이는 칸 높이 누적, 빈 경계는 고르게", () => {
  const g = tableGrid(table(3, 2, 3000, [cell(0, 0, 1000), cell(0, 1, 1000), cell(0, 2, 1000), cell(1, 0, 1000, { colSpan: 3, width: 3000, height: 2500 })]));
  assert.deepEqual(g.xs, [0, 1000, 2000, 3000]);
  assert.deepEqual(g.hs, [1000, 2500]);
  assert.equal(g.width, 3000);
  // 표 폭 값이 없으면 가장 넓은 행
  assert.equal(tableGrid(table(1, 1, 0, [cell(0, 0, 777)])).width, 777);
  // 병합 칸(2열)뿐이라 가운데 경계를 아는 칸이 없으면 앞뒤 사이 고르게
  const even = tableGrid(table(4, 1, 4000, [cell(0, 0, 4000, { colSpan: 4 })]));
  assert.deepEqual(even.xs, [0, 1000, 2000, 3000, 4000]);
  // 세로 병합 칸이 둘 행보다 크면 마지막 행이 늘어남
  const tall = tableGrid(table(2, 2, 2000, [cell(0, 0, 1000, { rowSpan: 2, height: 5000 }), cell(0, 1, 1000), cell(1, 1, 1000)]));
  assert.deepEqual(tall.hs, [1000, 4000]);
});

test("맞닿은 경계: 굵은 쪽만 칠함, 이웃이 없으면 칠함, 테두리 없는 칸은 건너뜀", () => {
  const thin = bf(edge("SOLID", 0.1));
  const thick = bf(edge("SOLID", 0.5));
  const cells = [cell(0, 0, 1), cell(0, 1, 1)].map((c, i) => ({ cell: c, row: 0, rowSpan: 1, i }));
  const skips = sharedEdgeSkips(cells, 1, 2, (c) => (c.col === 0 ? thin : thick));
  assert.deepEqual([...skips[0]], ["r"], "얇은 왼쪽 칸의 오른 변은 굵은 이웃에게");
  assert.deepEqual([...skips[1]], [], "굵은 쪽은 왼쪽 변도 이웃(얇음)이 못 맡으니 칠함");
  assert.deepEqual([...sharedEdgeSkips(cells, 1, 2, () => null)[0]], []);
  assert.deepEqual([...sharedEdgeSkips(cells, 1, 2, () => bf(none))[0]], []);
});

test("문단·표 HTML: 글이 escape되어 들어가고 표는 칸 수만큼 칸 상자가 생김, HW_CSS는 비어 있지 않음", () => {
  const ctx = ctxOf([pp()]);
  const html = paraHtml(ctx, para("<가&나>", [line(0, 1000)]), { first: true, last: true, prevAfter: 0, width: 10000, depth: 1 }).html;
  assert.ok(html.includes(">&lt;<") && html.includes(">&amp;<") && html.includes(">&gt;<"), "글자 단위 조각으로 쪼개져 각각 이스케이프");
  assert.ok(!html.includes("<가"));
  const c = cell(0, 0, 5000, { paras: [para("칸", [line(0, 1000)])] });
  const t = tableHtml(ctx, table(2, 1, 10000, [c, cell(0, 1, 5000, { paras: [para("둘", [line(0, 1000)])] })]));
  assert.ok(t.includes("칸"));
  assert.ok(t.includes("둘"));
  assert.ok(HW_CSS.length > 100);
});
