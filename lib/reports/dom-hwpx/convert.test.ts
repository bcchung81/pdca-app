// 화면 배치 스냅숏 → 한글(HWPX) 범용 변환기(시험판 2026-10-28) 테스트 — 합성 스냅숏만(기관 원문·실명 없음).
// 지키는 것: 세로로 쌓인 두 글 흐름 → 문단 둘(사이 빈틈 = 문단 위 간격) · 가로로 나란한 꾸민 상자 셋 → 한 행 세 칸 표(열 폭 = 상자 폭) ·
// 테두리·배경 → 칸 테두리/배경(굵기·색·채움) + 안 여백 = 테두리 + 안 여백 · 칩(테두리 있는 인라인 상자 → 글자 테두리, 배경만 → 음영) ·
// 절대 위치 ::before 한 글자(왼쪽 안 여백 안) → 문단 글머리표 · 그라데이션 → 색 평균 + 근사 기록 ·
// 줄 상자 → (나) linesegarray 시작 글자·세로 위치, (가)는 줄 배치 없음 · 표 칸 자리 빠짐·겹침 없음 · validateHwpx 통과 ·
// 한 줄 글 → 줄 넘김 SQUEEZE(여러 줄은 BREAK — 쓰기 계층 기본값) · 끝 열 칸 폭 여유 · 정렬 대응 표(justify·text-align-last·text-justify) ·
// 어절 단위 양쪽 정렬에서 화면이 어절 가운데서 줄을 나눴으면 왼쪽 정렬 · word-break 대응 표(이름과 뜻이 반대) · SVG 그림(PNG) → 한글 그림 자리·크기 ·
// 배경 그림 층 자리(background-size·position·repeat): 안쪽 가는 선 → 격자 경계선(채운 칸 뒤로 가려짐, 상자를 칠하지 않음)·가장자리 가는 선 → 칸 테두리 한 변·
// 홀로 있는 선 → 가는 칸 · 대부분 투명·일부만 칠하는 층 → 칠하지 않음 · 그라데이션 멈춤 읽기·평균 ·
// 위첨자(둘레 글보다 작은 글을 1/4 이상 올림·super) → supscript + 둘레 글 크기, 칩의 작은 줄 맞춤 이동 → 글자 위치 음수(한글은 음수가 위) · 아래첨자 ·
// 원본 그림(pictures 옵션): 글 속·블록 <img> → 한글 그림(같은 주소 한 벌, 조상이 자른 부분은 그림 자르기) · 칸 배경 url → 칸 그림 채우기(채우기 방식 표) ·
// 옵션이 없으면 예전 그대로(생략·자리만), 바이트가 없으면 같은 크기 빈 그림 ·
// 줄 간격(2026-10-28): line-height 0·font-size 0 문단 상자에 줄 높이를 준 인라인 블록 줄(원본 배치 카드) → 잰 줄 간격·줄 상자 높이(겹침 0) ·
// 큰 글자 상자 안 작은 글 → 비율 기준은 글 크기 · 겹침 점검(overlapCheck): 줄 간격 < 글자 × 0.9 문단·같은 칸 세로 겹침 문단(표 안까지) ·
// 글 보존(2026-10-28): 딱지(안에 블록이 든 inline-block) 옆 글자 크기 0 inline이 감싼 글 → 버리지 않고 딱지와 한 행 나란히 ·
// 격자에서 칸을 얻지 못하는 글 흐름(상자 높이가 거의 0이고 글이 상자 밖으로 넘침) → 버리지 않고 차례로 쌓음 · 딱지 아래 줄로 감긴 글은 옆 상자가 아님(글 보존) ·
// 소스 규칙: 추출기·변환기·스냅숏·사본 뜨기(capture)·판정(policy)·그림 받기(pictures)에 화면 클래스(k-…)·블록 종류 이름·클래스 선택자가 없음(범용성).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import JSZip from "jszip";
import { validateHwpx } from "kordoc";
import type { Para, Table } from "../../hwp/model.ts";
import { BLOCK_KINDS } from "../blocks.ts";
import { REPORT_PAGE_MM } from "../section-hwpx.ts";
import { alignOf, gradientMean, imageFillMode, lastAlignOf, lenMm, overlapCheck, parseGradient, snapshotHwpxInput, snapshotToHwpx, splitTop, wordBreakOf } from "./convert.ts";
import type { LayoutSnapshot, Rect, SnapBox, SnapNode, SnapPseudo, SnapStyle, SnapText } from "./snapshot.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** 시험 쪽 정의: 경평 초안 판면(section-hwpx.ts REPORT_PAGE_MM) — 변환기는 쪽 정의를 인자로 받음 */
const PAGE = REPORT_PAGE_MM;
const HU = 7200 / 25.4;
const hu = (v: number) => Math.round(v * HU);
const side = (w = 0, style = "none", color = "rgb(0, 0, 0)") => ({ w, style, color });
function style(o: Partial<SnapStyle> = {}): SnapStyle {
  return {
    display: "block",
    position: "static",
    bg: "rgba(0, 0, 0, 0)",
    bgImage: "none",
    border: [side(), side(), side(), side()],
    pad: [0, 0, 0, 0],
    radius: "0px",
    shadow: "none",
    clipPath: "none",
    opacity: 1,
    fontFamily: '"KcaBody", serif',
    fontSize: 10,
    fontWeight: 300,
    fontStyle: "normal",
    color: "rgb(17, 17, 17)",
    lineHeight: 15,
    textAlign: "justify",
    textAlignLast: "auto",
    textJustify: "",
    letterSpacing: 0,
    wordSpacing: 0,
    verticalAlign: "baseline",
    textIndent: 0,
    textDecoration: "none",
    whiteSpace: "normal",
    wordBreak: "keep-all",
    ...o,
  };
}
const rect = (x: number, y: number, w: number, h: number): Rect => ({ x, y, w, h });
/** 한 줄 글(줄 부분 하나) */
const text = (t: string, r: Rect): SnapText => ({ kind: "text", text: t, frags: [{ at: 0, ...r }] });
const box = (tag: string, r: Rect, children: SnapNode[], st: Partial<SnapStyle> = {}, extra: Partial<SnapBox> = {}): SnapBox => ({ kind: "box", tag, rect: r, style: style(st), children, ...extra });
const snap = (children: SnapNode[], h = 100): LayoutSnapshot => ({ version: 1, frame: { w: 170, h }, root: box("div", rect(0, 0, 170, h), children) });
const allBorder = (w: number, color: string): SnapStyle["border"] => [side(w, "solid", color), side(w, "solid", color), side(w, "solid", color), side(w, "solid", color)];

const texts = (p: Para) => p.items.map((it) => (it.kind === "text" ? it.text : "")).join("");
function tablesIn(ps: Para[], out: Table[] = []): Table[] {
  for (const p of ps)
    for (const it of p.items)
      if (it.kind === "obj" && it.obj.kind === "table") {
        out.push(it.obj);
        for (const c of it.obj.cells) tablesIn(c.paras, out);
      }
  return out;
}
/** 표 칸 자리: 행·열 자리마다 칸이 꼭 하나, 첫 행 칸 폭 합 = 표 폭 */
function checkGrid(t: Table) {
  const seen = Array.from({ length: t.rows }, () => Array.from({ length: t.cols }, () => 0));
  for (const c of t.cells) for (let r = c.row; r < c.row + c.rowSpan; r++) for (let k = c.col; k < c.col + c.colSpan; k++) seen[r][k] += 1;
  assert.ok(seen.every((row) => row.every((v) => v === 1)), `칸 자리가 비거나 겹침 ${JSON.stringify(seen)}`);
  const row0 = t.cells.filter((c) => c.row === 0).reduce((a, c) => a + c.width, 0);
  assert.equal(row0, t.pos.width);
}

test("세로로 쌓인 두 글 흐름 → 문단 둘, 사이 빈틈은 둘째 문단 위 간격 · 표 없음", () => {
  const s = snap([box("p", rect(0, 0, 170, 6), [text("첫째 문단", rect(0, 0.5, 20, 4))]), box("p", rect(0, 10, 170, 6), [text("둘째 문단", rect(0, 10.5, 20, 4))])]);
  const { input } = snapshotHwpxInput(s, { lines: false, page: PAGE });
  assert.equal(input.paras.length, 2);
  assert.deepEqual(input.paras.map(texts), ["첫째 문단", "둘째 문단"]);
  assert.equal(tablesIn(input.paras).length, 0);
  const pp = input.doc.paraPrs;
  assert.equal(pp[input.paras[0].paraPr].before, 0);
  assert.equal(pp[input.paras[1].paraPr].before, hu(4));
  // 줄 높이 15pt ÷ 글자 10pt → 150%, keep-all → 한글 어절 단위(BREAK_WORD)
  assert.equal(pp[input.paras[0].paraPr].lineSpacing, 150);
  assert.equal(pp[input.paras[0].paraPr].breakNonLatin, "BREAK_WORD");
});

test("가로로 나란한 꾸민 상자 셋 → 한 행 세 칸 표(열 폭 = 상자 폭) · 칸 자리 빠짐·겹침 없음", () => {
  const cell = (x: number, w: number, t: string) => box("div", rect(x, 0, w, 20), [text(t, rect(x + 1, 1, 10, 4))], { border: allBorder(0.5, "rgb(75, 76, 75)") });
  const s = snap([cell(0, 50, "가"), cell(50, 60, "나"), cell(110, 60, "다")]);
  const { input } = snapshotHwpxInput(s, { lines: false, page: PAGE });
  assert.equal(input.paras.length, 1);
  const [t] = tablesIn(input.paras);
  assert.equal(t.rows, 1);
  assert.equal(t.cols, 3);
  checkGrid(t);
  const ws = [...t.cells].sort((a, b) => a.col - b.col).map((c) => c.width);
  assert.deepEqual(ws, [hu(50) - hu(0), hu(110) - hu(50), hu(170) - hu(110)]);
  assert.deepEqual([...t.cells].sort((a, b) => a.col - b.col).map((c) => texts(c.paras[0])), ["가", "나", "다"]);
});

test("테두리·배경이 있는 칸 → 칸 테두리/배경(굵기·색·채움) · 안 여백 = 테두리 + 안 여백", () => {
  const b = box("div", rect(10, 0, 100, 20), [text("칸 글", rect(13, 2, 10, 4))], { border: allBorder(0.5, "rgb(126, 127, 126)"), bg: "rgb(215, 216, 215)", pad: [1, 2, 1, 2] });
  const { input } = snapshotHwpxInput(snap([b]), { lines: false, page: PAGE });
  const [t] = tablesIn(input.paras);
  checkGrid(t);
  const c = t.cells[0];
  const bf = input.doc.borderFills[c.borderFill]!;
  assert.deepEqual([bf.left, bf.top].map((x) => [x.type, x.width, x.color]), [
    ["SOLID", 0.5, "#7E7F7E"],
    ["SOLID", 0.5, "#7E7F7E"],
  ]);
  assert.equal(bf.fill?.color, "#D7D8D7");
  assert.deepEqual(c.margin, [hu(12.5) - hu(10), hu(110) - hu(107.5), hu(1.5), hu(20) - hu(18.5)]);
  // 영역보다 좁은 표: 품은 문단의 왼쪽 여백 = 왼쪽 빈틈
  assert.equal(input.doc.paraPrs[input.paras[0].paraPr].left, hu(10));
});

test("칩: 테두리 있는 인라인 상자 → 글자 테두리/배경 · 배경만 → 음영 · 화면 1px 선 → 한글 가는 선 0.12mm", () => {
  const chip = box("span", rect(20, 0.5, 12, 4), [text("칩", rect(21, 0.5, 4, 4))], { display: "inline-block", border: allBorder(25.4 / 96, "rgb(75, 76, 75)"), bg: "rgb(255, 255, 255)" });
  const shade = box("span", rect(40, 0.5, 12, 4), [text("음영", rect(40, 0.5, 8, 4))], { display: "inline", bg: "rgb(255, 241, 184)" });
  const p = box("p", rect(0, 0, 170, 6), [text("앞 글 ", rect(0, 0.5, 18, 4)), chip, text(" 가운데 ", rect(33, 0.5, 6, 4)), shade]);
  const { input, approx } = snapshotHwpxInput(snap([p]), { lines: false, page: PAGE });
  const items = input.paras[0].items.filter((it) => it.kind === "text") as Extract<Para["items"][number], { kind: "text" }>[];
  const chipRun = items.find((it) => it.text === "칩")!;
  const cp = input.doc.charPrs[chipRun.charPr];
  assert.ok(cp.borderFill > 0, "칩 글자에 테두리/배경");
  const bf = input.doc.borderFills[cp.borderFill]!;
  assert.equal(bf.left.width, 0.12);
  assert.equal(bf.fill?.color, "#FFFFFF");
  const shadeRun = items.find((it) => it.text === "음영")!;
  assert.equal(input.doc.charPrs[shadeRun.charPr].shade, "#FFF1B8");
  assert.equal(input.doc.charPrs[shadeRun.charPr].borderFill, 0);
  assert.equal(texts(input.paras[0]), "앞 글 칩 가운데 음영");
  assert.ok(approx.some((a) => a.kind.startsWith("화면 1px 선")));
});

test("절대 위치 ::before 한 글자(왼쪽 안 여백 안) → 문단 글머리표 · 그라데이션 → 색 평균 + 근사 기록", () => {
  const before: SnapPseudo = { text: "•", style: style({ position: "absolute", display: "block" }), rect: rect(0.2, 0, 1.5, 5) };
  const li = box("li", rect(0, 0, 170, 6), [text("글머리 문단", rect(3.5, 0.5, 20, 4))], { display: "list-item", position: "relative", pad: [0, 0, 0, 3.5] }, { before });
  const grad = box("div", rect(0, 10, 170, 8), [text("띠", rect(1, 11, 4, 4))], { bgImage: "linear-gradient(90deg, rgb(215, 216, 215) 0%, rgb(255, 255, 255) 100%)" });
  const { input, approx } = snapshotHwpxInput(snap([li, grad]), { lines: false, page: PAGE });
  const pp = input.doc.paraPrs[input.paras[0].paraPr];
  assert.equal(pp.headingType, "BULLET");
  assert.equal(input.doc.bullets[pp.headingId - 1].char, "•");
  assert.equal(input.doc.bullets[pp.headingId - 1].head.textOffset, hu(3.5 - 1.7));
  assert.equal(texts(input.paras[0]), "글머리 문단");
  const [t] = tablesIn(input.paras);
  // (215+255)/2 = 235(EB) · (216+255)/2 = 235.5 → 236(EC)
  assert.equal(input.doc.borderFills[t.cells[0].borderFill]!.fill?.color, "#EBECEB");
  assert.ok(approx.some((a) => a.kind === "그라데이션 배경 → 색 평균 단색"));
});

test("줄 상자 → (나) linesegarray 시작 글자·세로 위치 · (가)는 줄 배치 없음 · 두 판 모두 validateHwpx 통과", async () => {
  // 표 다음의 두 줄 문단: 「가나다라 」(0~4) 다음 줄 「마바사」(5~) — 줄 높이 15pt(5.29mm).
  // (첫 문단은 쓰기 계층이 구역 정의 조종 문자만큼 둘째 줄부터 시작 위치를 미루므로 둘째 문단으로 시험)
  const L = (15 * 25.4) / 72;
  const t: SnapText = { kind: "text", text: "가나다라 마바사", frags: [{ at: 0, x: 0, y: 21, w: 30, h: 4 }, { at: 5, x: 0, y: 21 + L, w: 20, h: 4 }] };
  const s = snap([box("div", rect(0, 0, 60, 10), [text("칸", rect(1, 1, 4, 4))], { border: allBorder(0.5, "rgb(0, 0, 0)") }), box("p", rect(0, 20, 40, 2 * L), [t], { textAlign: "left" })]);
  const a = snapshotHwpxInput(s, { lines: false, page: PAGE });
  assert.equal(a.input.paras[1].lines.length, 0);
  const b = snapshotHwpxInput(s, { lines: true, page: PAGE });
  const ls = b.input.paras[1].lines;
  assert.deepEqual(
    ls.map((l) => l.textpos),
    [0, 5],
  );
  assert.ok(Math.abs(ls[1].vertpos - ls[0].vertpos - hu(L)) <= 1, `줄 간격 ${ls[1].vertpos - ls[0].vertpos} ≈ ${hu(L)}`);
  assert.equal(ls[0].vertpos, hu(23 - L / 2));
  assert.equal(ls[0].vertsize, 1000);
  assert.equal(ls[0].spacing, hu(L) - 1000);
  for (const lines of [false, true]) {
    const { bytes } = await snapshotToHwpx(s, { lines, page: PAGE });
    const v: any = await (validateHwpx as any)(Buffer.from(bytes));
    assert.equal(v.ok, true, JSON.stringify(v.issues));
    const zip = await JSZip.loadAsync(bytes);
    const sec = await zip.file("Contents/section0.xml")!.async("string");
    if (lines) assert.match(sec, /<hp:lineseg textpos="0"[^>]*\/><hp:lineseg textpos="5"/);
    else assert.doesNotMatch(sec, /<hp:linesegarray>/);
  }
});

test("격자: 맞닿은 표 행(같은 열 경계)·여러 행에 걸친 칸 → 한 표, 칸 합치기 · 칸 자리 빠짐·겹침 없음", () => {
  const c = (x: number, y: number, w: number, h: number, t: string) => box("td", rect(x, y, w, h), [text(t, rect(x + 1, y + 1, 4, 4))], { display: "table-cell", border: allBorder(0.5, "rgb(0, 0, 0)") });
  // 2행 × 3열, 가운데 열은 두 행에 걸침
  const s = snap([c(0, 0, 40, 10, "가"), c(40, 0, 20, 20, "걸침"), c(60, 0, 110, 10, "나"), c(0, 10, 40, 10, "다"), c(60, 10, 110, 10, "라")]);
  const { input } = snapshotHwpxInput(s, { lines: false, page: PAGE });
  const ts = tablesIn(input.paras);
  assert.equal(ts.length, 1);
  checkGrid(ts[0]);
  assert.equal(ts[0].rows, 2);
  assert.equal(ts[0].cols, 3);
  const span = ts[0].cells.find((x) => texts(x.paras[0]) === "걸침")!;
  assert.equal(span.rowSpan, 2);
});

test("소스 규칙: 추출기·변환기·스냅숏·사본 뜨기·판정에 화면 클래스 이름(k-…)·블록 종류 이름·클래스 선택자가 없음", () => {
  for (const f of ["extract.ts", "convert.ts", "snapshot.ts", "capture.ts", "policy.ts", "read-body.ts", "pictures.ts"]) {
    const src = readFileSync(new URL(`./${f}`, import.meta.url), "utf8");
    assert.doesNotMatch(src, /(^|[^\w-])k-[a-z]/m, `${f}: 화면 클래스 이름`);
    assert.doesNotMatch(src, /className|classList/, `${f}: 클래스로 가름`);
    assert.doesNotMatch(src, /querySelector(All)?\(\s*["'`][^"'`]*[.#[]/, `${f}: 클래스·id·속성 선택자`);
    // 블록 종류 이름(따옴표 글) — "table"은 한글 모델의 개체 종류(kind: "table")라 뺌
    for (const k of BLOCK_KINDS.filter((x) => x !== "table")) assert.ok(!src.includes(`"${k}"`) && !src.includes(`'${k}'`), `${f}: 블록 종류 「${k}」`);
  }
});

/** 여러 줄 글(줄마다 [시작 글자, 세로 위치]) */
const lined = (t: string, x: number, w: number, starts: [number, number][]): SnapText => ({ kind: "text", text: t, frags: starts.map(([at, y]) => ({ at, x, y, w, h: 4 })) });
const ppOf = (input: ReturnType<typeof snapshotHwpxInput>["input"], p: Para) => input.doc.paraPrs[p.paraPr];

test("한 줄 글 → 줄 넘김 SQUEEZE(한글이 자간을 줄여 한 줄로) · 여러 줄·줄바꿈 있는 글은 BREAK(파일에 기본값) · 상자 안 칩 글도", async () => {
  const one = box("p", rect(0, 0, 170, 6), [text("한 줄 제목", rect(0, 0.5, 30, 4))], { textAlign: "left" });
  const two = box("p", rect(0, 10, 40, 11), [lined("여러 줄 문단 글입니다", 0, 40, [[0, 10.5], [7, 15.5]])], { textAlign: "left" });
  const br = box("p", rect(0, 25, 40, 11), [text("윗줄", rect(0, 25.5, 10, 4)), { kind: "br" }, text("아랫줄", rect(0, 30.5, 12, 4))], { textAlign: "left" });
  // 글 폭에 딱 맞춘 작은 상자(칩) 안 글
  const chip = box("span", rect(100, 40, 8, 4.5), [text("사진", rect(101, 40, 6, 4))], { border: allBorder(0.3, "rgb(0, 0, 0)"), pad: [0, 1, 0, 1], textAlign: "center" });
  const { input, stats } = snapshotHwpxInput(snap([one, two, br, chip]), { lines: false, page: PAGE });
  assert.equal(ppOf(input, input.paras[0]).lineWrap, "SQUEEZE");
  assert.equal(ppOf(input, input.paras[1]).lineWrap, undefined);
  assert.equal(ppOf(input, input.paras[2]).lineWrap, undefined);
  const [t] = tablesIn(input.paras);
  assert.equal(texts(t.cells[0].paras[0]), "사진");
  assert.equal(input.doc.paraPrs[t.cells[0].paras[0].paraPr].lineWrap, "SQUEEZE");
  assert.equal(stats.squeezed, 2);
  const { bytes } = await snapshotToHwpx(snap([one, two, br, chip]), { lines: false, page: PAGE });
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const head = await (await JSZip.loadAsync(bytes)).file("Contents/header.xml")!.async("string");
  assert.match(head, /lineWrap="SQUEEZE"/);
  assert.match(head, /lineWrap="BREAK"/);
});

test("칸 폭 여유: 영역 왼쪽에 붙은 열 나눔 띠는 끝 열을 영역 오른쪽 끝까지 넓힘 · 가운데 놓인 띠는 그대로", () => {
  const chip = (x: number) => box("span", rect(x, 0, 20, 6), [text("머리", rect(x + 2, 1, 16, 4))], { bg: "rgb(215, 216, 215)" });
  const title = (x: number) => box("span", rect(x, 0, 28, 6), [text("한 줄 이름", rect(x, 1, 28, 4))], { textAlign: "left" });
  const left = snapshotHwpxInput(snap([chip(0), title(22)]), { lines: false, page: PAGE });
  const [t1] = tablesIn(left.input.paras);
  checkGrid(t1);
  assert.equal(t1.pos.width, hu(170) - hu(0));
  const mid = snapshotHwpxInput(snap([chip(60), title(82)]), { lines: false, page: PAGE });
  const [t2] = tablesIn(mid.input.paras);
  assert.equal(t2.pos.width, hu(110) - hu(60));
  assert.equal(mid.input.doc.paraPrs[mid.input.paras[0].paraPr].align, "CENTER");
});

test("정렬 대응 표: text-align·text-align-last·text-justify → 한글 정렬(여러 줄·마지막 줄)", () => {
  const A = (textAlign: string, textAlignLast = "auto", textJustify = "") => ({ textAlign, textAlignLast, textJustify });
  const rows: [ReturnType<typeof A>, string, string][] = [
    [A("justify"), "JUSTIFY", "LEFT"],
    [A("justify", "auto", "inter-character"), "JUSTIFY", "LEFT"],
    [A("justify", "justify"), "DISTRIBUTE", "DISTRIBUTE"],
    [A("justify", "auto", "none"), "LEFT", "LEFT"],
    [A("justify", "center"), "JUSTIFY", "CENTER"],
    [A("left", "justify"), "LEFT", "DISTRIBUTE"],
    [A("start"), "LEFT", "LEFT"],
    [A("center"), "CENTER", "CENTER"],
    [A("-webkit-center"), "CENTER", "CENTER"],
    [A("right"), "RIGHT", "RIGHT"],
    [A("end"), "RIGHT", "RIGHT"],
  ];
  for (const [st, many, last] of rows) assert.deepEqual([alignOf(st), lastAlignOf(st)], [many, last], JSON.stringify(st));
});

test("정렬: 여러 줄 양쪽 → JUSTIFY · 마지막 줄까지 펴면 DISTRIBUTE(한 줄 글도) · 한 줄 양쪽 글은 펴지 않음", () => {
  const p = (y: number, st: Partial<SnapStyle>, multi: boolean) =>
    box("p", rect(0, y, 40, multi ? 11 : 6), [multi ? lined("양쪽 정렬 문단 글", 0, 40, [[0, y + 0.5], [6, y + 5.5]]) : text("한 줄 글", rect(0, y + 0.5, 40, 4))], st);
  const { input } = snapshotHwpxInput(snap([p(0, {}, true), p(20, { textAlignLast: "justify" }, true), p(40, { textAlignLast: "justify" }, false), p(60, {}, false)]), { lines: false, page: PAGE });
  assert.deepEqual(
    input.paras.map((x) => ppOf(input, x).align),
    ["JUSTIFY", "DISTRIBUTE", "DISTRIBUTE", "LEFT"],
  );
});

test("어절 단위 양쪽 정렬에서 화면이 어절 가운데(닫는 괄호 뒤)서 줄을 나눴으면 왼쪽 정렬 · 글자 단위면 양쪽 그대로", () => {
  // 「통합(’26.9.)」 뒤 「에」에서 화면 줄바꿈 — 한글 어절 단위는 여기서 못 나눔
  const t = "코레일 통합(’26.9.)에 맞춰";
  const at = t.indexOf("에");
  const mk = (wordBreak: string) => box("li", rect(0, 0, 37, 11), [lined(t, 0, 37, [[0, 0.5], [at, 5.5]])], { wordBreak });
  const keep = snapshotHwpxInput(snap([mk("keep-all")]), { lines: false, page: PAGE });
  assert.equal(ppOf(keep.input, keep.input.paras[0]).align, "LEFT");
  assert.ok(keep.approx.some((a) => a.kind.startsWith("어절 단위 양쪽 정렬인데")));
  const norm = snapshotHwpxInput(snap([mk("normal")]), { lines: false, page: PAGE });
  assert.equal(ppOf(norm.input, norm.input.paras[0]).align, "JUSTIFY");
  // 공백에서 나눈 어절 단위 문단은 양쪽 그대로
  const sp = snapshotHwpxInput(snap([box("li", rect(0, 0, 37, 11), [lined(t, 0, 37, [[0, 0.5], [4, 5.5]])])]), { lines: false, page: PAGE });
  assert.equal(ppOf(sp.input, sp.input.paras[0]).align, "JUSTIFY");
});

test("word-break 대응 표: keep-all → 어절(BREAK_WORD) · normal·break-word → 글자(KEEP_WORD) · break-all → 영문도 글자 — 문단마다", () => {
  assert.deepEqual(wordBreakOf("keep-all"), { nonLatin: "BREAK_WORD", latin: "KEEP_WORD" });
  assert.deepEqual(wordBreakOf("normal"), { nonLatin: "KEEP_WORD", latin: "KEEP_WORD" });
  assert.deepEqual(wordBreakOf("break-word"), { nonLatin: "KEEP_WORD", latin: "KEEP_WORD" });
  assert.deepEqual(wordBreakOf("break-all"), { nonLatin: "KEEP_WORD", latin: "BREAK_WORD" });
  const p = (y: number, wordBreak: string) => box("p", rect(0, y, 170, 6), [text("문단", rect(0, y + 0.5, 10, 4))], { wordBreak });
  const { input } = snapshotHwpxInput(snap([p(0, "keep-all"), p(10, "normal"), p(20, "break-all")]), { lines: false, page: PAGE });
  assert.deepEqual(
    input.paras.map((x) => [ppOf(input, x).breakNonLatin, ppOf(input, x).breakLatin]),
    [
      ["BREAK_WORD", "KEEP_WORD"],
      ["KEEP_WORD", "KEEP_WORD"],
      ["KEEP_WORD", "BREAK_WORD"],
    ],
  );
});

test("SVG 그림(PNG) → 한글 그림(글자처럼 취급, 화면 상자 크기) · 같은 그림은 한 벌 · 그리지 못한 SVG는 자리만 · validateHwpx 통과", async () => {
  // 1×1 투명 PNG(합성)
  const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const svg = (x: number, y: number, image?: { png: string; w: number; h: number }) => box("svg", rect(x, y, 6, 24), [], {}, { replaced: "svg", ...(image ? { image } : {}) });
  const cellBox = (x: number, w: number, t: string) => box("div", rect(x, 0, w, 24), [text(t, rect(x + 1, 1, 10, 4))], { border: allBorder(0.5, "rgb(0, 0, 0)") });
  const s = snap([cellBox(0, 60, "앞"), svg(62, 0, { png, w: 23, h: 91 }), cellBox(70, 60, "뒤"), svg(80, 40, { png, w: 23, h: 91 }), svg(120, 40)]);
  const { input, stats, approx } = snapshotHwpxInput(s, { lines: false, page: PAGE });
  assert.equal(stats.pics, 2);
  assert.equal(input.images.size, 1);
  assert.deepEqual([...input.images.values()][0].data.slice(0, 4), Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
  const pics: any[] = [];
  const walk = (ps: Para[]) => {
    for (const p of ps)
      for (const it of p.items)
        if (it.kind === "obj") {
          if (it.obj.kind === "pic") pics.push(it.obj);
          else if (it.obj.kind === "table") for (const c of it.obj.cells) walk(c.paras);
        }
  };
  walk(input.paras);
  assert.equal(pics.length, 2);
  for (const p of pics) {
    assert.deepEqual([p.curW, p.curH, p.pos.treatAsChar], [hu(6), hu(24), true]);
    assert.equal(p.bin, 1);
  }
  assert.ok(approx.some((a) => a.kind === "SVG 도형 → 자리만(생략)"));
  const { bytes } = await snapshotToHwpx(s, { lines: false, page: PAGE });
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("BinData/image1.png"));
  assert.match(await zip.file("Contents/section0.xml")!.async("string"), /<hp:pic [^>]*>.*<hc:img binaryItemIDRef="image1"/);
});

/** 표 안 모든 칸(깊이 상관없이) */
function cellsIn(ps: Para[]): Table["cells"] {
  return tablesIn(ps).flatMap((t) => t.cells);
}
const PX = 25.4 / 96;

test("배경 안쪽 가는 선(한 줄 크기·no-repeat) → 상자를 칠하지 않고 그 자리 격자 경계선 · 선을 가로지르는 채운 상자는 선을 가림 · 화면 채움 기록에 어두운 색 없음", async () => {
  // 연혁 띠 꼴(합성): 꾸밈 없는 상자 위 8.2mm 자리에 0.8px 가로 선 배경, 흰 점 셋이 선에 걸쳐 있음 · 위에 칩 글, 아래에 글
  const line = { bgImage: "linear-gradient(rgb(75, 76, 75), rgb(75, 76, 75))", bgSize: "100% 0.8px", bgPosition: `0px ${(8.2 / PX).toFixed(4)}px`, bgRepeat: "no-repeat" };
  const dot = (x: number) => box("span", rect(x, 18, 3.2, 3.2), [], { bg: "rgb(255, 255, 255)", radius: "50%" });
  const label = (x: number, t: string) => box("p", rect(x, 12, 40, 5), [text(t, rect(x, 12.5, 20, 4))], { textAlign: "left" });
  const body = (x: number, t: string) => box("p", rect(x, 23, 40, 5), [text(t, rect(x, 23.5, 30, 4))], { textAlign: "left" });
  const strip = box("ol", rect(10, 10, 150, 20), [label(10, "첫 단계"), label(60, "둘째 단계"), label(110, "셋째 단계"), dot(30), dot(80), dot(130), body(10, "첫 글"), body(60, "둘째 글"), body(110, "셋째 글")], { display: "grid", ...line });
  const s = snap([strip]);
  const { input, fills, stats, approx } = snapshotHwpxInput(s, { lines: false, page: PAGE });
  assert.ok(!fills.some((f) => f.color === "#4B4C4B"), "선 색으로 칠한 칸이 없음");
  assert.ok(approx.some((a) => a.kind === "가는 선 배경(그라데이션) → 그 자리 칸 경계선"));
  const cells = cellsIn(input.paras);
  const bfOf = (c: (typeof cells)[number]) => input.doc.borderFills[c.borderFill]!;
  const ruled = cells.filter((c) => bfOf(c).top.color === "#4B4C4B");
  // 점 사이·양 끝 빈 칸 4개에 위 변, 흰 점 칸에는 없음
  assert.equal(ruled.length, 4);
  assert.equal(stats.rules, 4);
  for (const c of ruled) assert.deepEqual([bfOf(c).top.type, bfOf(c).top.width, bfOf(c).fill], ["SOLID", 0.12, null]);
  const dots = cells.filter((c) => bfOf(c).fill?.color === "#FFFFFF");
  assert.equal(dots.length, 3);
  for (const c of dots) assert.equal(bfOf(c).top.type, "NONE");
  for (const t of tablesIn(input.paras)) checkGrid(t);
  // 글은 그대로
  const all = (ps: Para[]): string => ps.map((p) => texts(p) + p.items.map((it) => (it.kind === "obj" && it.obj.kind === "table" ? it.obj.cells.map((c) => all(c.paras)).join("") : "")).join("")).join("");
  for (const t of ["첫 단계", "둘째 단계", "셋째 단계", "첫 글", "둘째 글", "셋째 글"]) assert.ok(all(input.paras).includes(t), t);
  const { bytes } = await snapshotToHwpx(s, { lines: false, page: PAGE });
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});

test("배경 가장자리 가는 선(아래 끝·폭 전체) → 칸 테두리 아래 변(칠하지 않음) · 홀로 있는 선 → 가는 칸 하나(위 변)", () => {
  const under = box("div", rect(0, 0, 170, 8), [text("밑줄 띠", rect(1, 1, 20, 4))], { bgImage: "linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))", bgSize: "100% 1px", bgPosition: "0% 100%", bgRepeat: "no-repeat" });
  const lone = box("div", rect(0, 12, 170, 6), [], { bgImage: "linear-gradient(rgb(126, 127, 126), rgb(126, 127, 126))", bgSize: "50% 2px", bgPosition: `0px ${(3 / PX).toFixed(3)}px`, bgRepeat: "no-repeat" });
  const { input, fills } = snapshotHwpxInput(snap([under, lone]), { lines: false, page: PAGE });
  assert.equal(fills.length, 0);
  const [t1, t2] = tablesIn(input.paras);
  const b1 = input.doc.borderFills[t1.cells[0].borderFill]!;
  assert.deepEqual([b1.bottom.type, b1.bottom.width, b1.bottom.color, b1.top.type, b1.fill], ["SOLID", 0.12, "#000000", "NONE", null]);
  assert.equal(texts(t1.cells[0].paras[0]), "밑줄 띠");
  // 2px 선은 0.5mm 굵기 표에서 가장 가까운 값, 폭은 상자의 절반
  const b2 = input.doc.borderFills[t2.cells[0].borderFill]!;
  assert.deepEqual([b2.top.type, b2.top.width, b2.top.color], ["SOLID", 0.5, "#7E7F7E"]);
  assert.equal(t2.pos.width, hu(85));
});

test("대부분 투명한 층(대각선 그라데이션)·상자 일부만 칠하는 층 → 칠하지 않음 · 꽉 찬 층은 색 평균 그대로 · 여러 층은 아래부터 섞음", () => {
  const diag = box("div", rect(0, 0, 50, 20), [text("대각", rect(1, 1, 8, 4))], {
    border: allBorder(0.5, "rgb(0, 0, 0)"),
    bgImage: "linear-gradient(to right top, rgba(0, 0, 0, 0) calc(50% - 0.533333px), rgb(170, 170, 170) 50%, rgba(0, 0, 0, 0) calc(50% + 0.533333px))",
  });
  const corner = box("div", rect(60, 0, 50, 20), [text("구석", rect(61, 1, 8, 4))], { border: allBorder(0.5, "rgb(0, 0, 0)"), bgImage: "linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))", bgSize: "20% 20%", bgRepeat: "no-repeat" });
  const both = box("div", rect(120, 0, 50, 20), [text("둘", rect(121, 1, 8, 4))], {
    border: allBorder(0.5, "rgb(0, 0, 0)"),
    bgImage: "linear-gradient(to right top, rgba(0, 0, 0, 0) calc(50% - 0.533333px), rgb(170, 170, 170) 50%, rgba(0, 0, 0, 0) calc(50% + 0.533333px)), linear-gradient(rgb(238, 238, 238), rgb(255, 255, 255))",
    bgSize: "auto, auto",
    bgPosition: "0% 0%, 0% 0%",
    bgRepeat: "repeat, repeat",
  });
  const { input, approx } = snapshotHwpxInput(snap([diag, corner, both]), { lines: false, page: PAGE });
  const fillOf = (t: string) => {
    const c = cellsIn(input.paras).find((x) => x.paras.some((p) => texts(p) === t))!;
    return input.doc.borderFills[c.borderFill]!.fill?.color ?? null;
  };
  assert.equal(fillOf("대각"), null);
  assert.equal(fillOf("구석"), null);
  // 아래 층(238→255 평균 246.5)만 칠함, 위 대각선 층은 생략
  assert.equal(fillOf("둘"), "#F7F7F7");
  assert.ok(approx.some((a) => a.kind.startsWith("배경 그림이 상자 대부분을 칠하지 않음")));
});

test("그라데이션 읽기: 맨 위 수준 나누기·계산값 길이(px·%·calc)·멈춤 자리 채우기·선을 따라 잰 평균(불투명도·색)", () => {
  assert.deepEqual(splitTop("linear-gradient(rgb(1, 2, 3), red), url(a.png)", ","), ["linear-gradient(rgb(1, 2, 3), red)", "url(a.png)"]);
  assert.deepEqual(splitTop("calc(100% - 3px) 90%", " "), ["calc(100% - 3px)", "90%"]);
  assert.equal(lenMm("96px", 0), 25.4);
  assert.equal(lenMm("50%", 40), 20);
  assert.ok(Math.abs((lenMm("calc(100% - 3px)", 10) as number) - (10 - 3 * PX)) < 1e-9);
  assert.equal(lenMm("auto", 10), null);
  // 두 자리 멈춤(0 40%)이 계산값에서 둘로 풀린 꼴: 40%까지 짙은 색, 뒤는 옅은 색 → 넓이로 잰 평균
  const hard = parseGradient("linear-gradient(90deg, rgb(75, 76, 75) 0px, rgb(75, 76, 75) 40%, rgb(238, 238, 238) 40%)", 100)!;
  assert.deepEqual(hard.stops.map((x) => x.at), [0, 0.4, 0.4]);
  const m = gradientMean(hard);
  assert.equal(m.a, 1);
  assert.ok(Math.abs(m.r - (0.4 * 75 + 0.6 * 238)) < 1e-9);
  // 자리 없는 멈춤은 고르게, 양 끝 투명 → 평균 불투명도 0.88
  const fade = parseGradient("linear-gradient(90deg, rgba(0, 0, 0, 0), rgb(255, 255, 255) 12%, rgb(255, 255, 255) 88%, rgba(0, 0, 0, 0))", 100)!;
  assert.deepEqual(fade.stops.map((x) => x.at), [0, 0.12, 0.88, 1]);
  assert.ok(Math.abs(gradientMean(fade).a - 0.88) < 1e-9);
  // 반복 그라데이션은 한 주기(px 자리 → 선 길이에 대한 몫)
  const rep = parseGradient("repeating-linear-gradient(45deg, rgb(241, 242, 241) 0px, rgb(241, 242, 241) 5px, rgb(230, 231, 230) 5px, rgb(230, 231, 230) 10px)", 50)!;
  assert.equal(rep.repeating, true);
  assert.ok(Math.abs(gradientMean(rep).r - 235.5) < 1e-9);
  assert.equal(parseGradient("url(a.png)", 10), null);
});

test("위첨자: 둘레 글보다 작은 글을 1/4 이상 올림 → supscript + 둘레 글 크기(카드 원본 방식) · 칩의 작은 이동·같은 크기 글 → 글자 위치 음수(한글은 음수가 위) · 내림 → 아래첨자", async () => {
  // 10.6pt 글 안: 6.1pt 위첨자(4pt 올림 = 5.333px), 8pt 칩(1.5pt 올림 = 2px), 같은 크기 글 2px 올림, 6.1pt 4pt 내림, super
  const sup = box("sup", rect(30, 0.5, 5, 2.4), [text("’25년", rect(30, 0.5, 5, 2.4))], { display: "inline", fontSize: 6.1, verticalAlign: "5.33333px", lineHeight: 0 });
  const chip = box("span", rect(40, 0.5, 10, 4), [text("칩", rect(41, 0.5, 4, 4))], { display: "inline-block", fontSize: 8, verticalAlign: "2px", border: allBorder(PX, "rgb(0, 0, 0)") });
  const same = box("span", rect(55, 0.5, 6, 4), [text("같은", rect(55, 0.5, 6, 4))], { display: "inline", fontSize: 10.6, verticalAlign: "2px" });
  const low = box("sub", rect(65, 2, 5, 2.4), [text("아래", rect(65, 2, 5, 2.4))], { display: "inline", fontSize: 6.1, verticalAlign: "-5.33333px" });
  const kw = box("sup", rect(75, 0.5, 3, 2.4), [text("주", rect(75, 0.5, 3, 2.4))], { display: "inline", fontSize: 8.8, verticalAlign: "super" });
  const p = box("p", rect(0, 0, 170, 6), [text("수치 ", rect(0, 0.5, 20, 4)), sup, text(" 18대 ", rect(35, 0.5, 5, 4)), chip, same, low, kw], { fontSize: 10.6, textAlign: "left" });
  const { input } = snapshotHwpxInput(snap([p]), { lines: false, page: PAGE });
  const run = (t: string) => {
    const it = input.paras[0].items.find((x) => x.kind === "text" && x.text.includes(t))!;
    const c = input.doc.charPrs[it.charPr];
    return [c.supscript, c.subscript, c.offset[0], c.height];
  };
  assert.deepEqual(run("’25년"), [true, false, 0, 1060]);
  assert.deepEqual(run("칩"), [false, false, -19, 800]);
  assert.deepEqual(run("같은"), [false, false, -14, 1060]);
  assert.deepEqual(run("아래"), [false, true, 0, 1060]);
  assert.deepEqual(run("주"), [true, false, 0, 1060]);
  const { bytes } = await snapshotToHwpx(snap([p]), { lines: false, page: PAGE });
  const head = await (await JSZip.loadAsync(bytes)).file("Contents/header.xml")!.async("string");
  // 쓰기 계층이 위첨자를 <hh:supscript/>로, 글자 위치 0으로 적음
  assert.ok(
    head.split("</hh:charPr>").some((c) => /height="1060"/.test(c) && /<hh:offset hangul="0"/.test(c) && c.includes("<hh:supscript/>")),
    "높이 10.6pt·글자 위치 0·위첨자 글자 모양",
  );
  assert.match(head, /<hh:offset hangul="-19"/);
});

test("바탕과 같은 채움은 꾸밈 아님: 흰 바탕 위 흰 상자(테두리 없음)는 감싸지 않고 안 글이 문단 · 어두운 바탕 위 흰 상자·그림자 있는 흰 상자는 칸 그대로", () => {
  const para = (y: number, t: string) => box("p", rect(0, y, 170, 6), [text(t, rect(0, y + 0.5, 20, 4))]);
  // 문서 틀처럼 흰 채움만 있는 상자(과제관리카드 .kca-card) → 표 없음
  const plain = snapshotHwpxInput(snap([box("div", rect(0, 0, 170, 20), [para(0, "첫 글"), para(10, "둘째 글")], { bg: "rgb(255, 255, 255)" })]), { lines: false, page: PAGE });
  assert.equal(tablesIn(plain.input.paras).length, 0);
  assert.deepEqual(plain.input.paras.map(texts), ["첫 글", "둘째 글"]);
  // 어두운 바탕 위 흰 상자는 보임 → 바깥 칸 안에 흰 칸
  const onDark = snapshotHwpxInput(snap([box("div", rect(0, 0, 170, 20), [box("div", rect(10, 5, 40, 8), [text("흰 칸", rect(11, 6, 10, 4))], { bg: "rgb(255, 255, 255)" })], { bg: "rgb(75, 76, 75)" })]), { lines: false, page: PAGE });
  const ts = tablesIn(onDark.input.paras);
  assert.equal(ts.length, 2);
  assert.equal(onDark.input.doc.borderFills[ts[1].cells[0].borderFill]?.fill?.color, "#FFFFFF");
  // 흰 상자라도 그림자(고리)가 있으면 보이는 상자
  const ring = snapshotHwpxInput(snap([box("span", rect(10, 0, 4, 4), [text("A", rect(11, 0.5, 2, 3))], { bg: "rgb(255, 255, 255)", shadow: "rgb(75, 76, 75) 0px 0px 0px 0.64px inset" })]), { lines: false, page: PAGE });
  assert.equal(tablesIn(ring.input.paras).length, 1);
});

test("테두리 덧그림 의사요소(글 없는 절대 위치 ::before가 상자를 선 굵기 반쯤 넘쳐 덮고 가는 선만 그림) → 칸 테두리 변 · 채움이 있는 의사요소는 도형(생략 기록)", () => {
  const C = "rgb(25, 45, 135)";
  const lines = {
    bgImage: `linear-gradient(to right, ${C} 0px, ${C} 1px, rgba(0, 0, 0, 0) 1px), none, none, linear-gradient(to top, ${C} 0px, ${C} 1px, rgba(0, 0, 0, 0) 1px)`,
    bgSize: "1px 100%, auto, auto, 100% 1px",
    bgPosition: "0px 0px, 0% 0%, 0% 0%, 0px 100%",
    bgRepeat: "no-repeat, repeat, repeat, no-repeat",
  };
  const before: SnapPseudo = { text: "", style: style({ position: "absolute", display: "block", ...lines }), rect: rect(9.9, -0.1, 100.2, 20.2) };
  const cell = box("td", rect(10, 0, 100, 20), [text("칸 글", rect(12, 2, 10, 4))], { display: "table-cell", position: "relative" }, { before });
  const r = snapshotHwpxInput(snap([cell]), { lines: false, page: PAGE });
  const [t] = tablesIn(r.input.paras);
  assert.ok(t, "덧그림 선이 있는 상자는 칸");
  const bf = r.input.doc.borderFills[t.cells[0].borderFill]!;
  assert.deepEqual([bf.left.type, bf.left.width, bf.left.color, bf.bottom.type, bf.top.type, bf.right.type, bf.fill], ["SOLID", 0.12, "#192D87", "SOLID", "NONE", "NONE", null]);
  assert.ok(!r.approx.some((a) => a.kind.startsWith("의사요소 도형")), "덧그림은 생략 기록 없음");
  assert.ok(!r.approx.some((a) => a.kind.startsWith("그림 배경(url)")), "none 층은 그림 배경으로 세지 않음");
  // 채움이 있는 절대 위치 의사요소(삼각형 등 도형)는 덧그림이 아님
  const shape: SnapPseudo = { text: "", style: style({ position: "absolute", display: "block", bg: "rgb(75, 76, 75)" }), rect: rect(10, 0, 100, 20) };
  const r2 = snapshotHwpxInput(snap([box("div", rect(10, 0, 100, 20), [text("글", rect(12, 2, 10, 4))], { position: "relative" }, { before: shape })]), { lines: false, page: PAGE });
  assert.equal(tablesIn(r2.input.paras).length, 0);
  assert.ok(r2.approx.some((a) => a.kind.startsWith("의사요소 도형")));
});

test("글자 크기 0으로 그린 빈칸(줄 끝 빈칸 — 추출기가 낱말 경계로 남김) → 둘레 글 크기의 빈칸(낱말이 붙지 않음)", () => {
  const zero = box("span", rect(20, 0.5, 0, 0), [{ kind: "text", text: " ", frags: [] }], { display: "inline", fontSize: 0 });
  const p = box("p", rect(0, 0, 170, 12), [text("국민", rect(0, 0.5, 8, 4)), zero, text("접근성", rect(0, 6.5, 12, 4))], { fontSize: 12 });
  const { input } = snapshotHwpxInput(snap([p]), { lines: false, page: PAGE });
  assert.equal(texts(input.paras[0]), "국민 접근성");
  const space = input.paras[0].items.find((it) => it.kind === "text" && it.text === " ");
  assert.ok(space && space.kind === "text");
  assert.equal(input.doc.charPrs[space.charPr].height, 1200);
});

// ───────────────────────── 원본 그림(pictures 옵션 — 2026-10-28)

const PIC_URL = "https://proj.supabase.example/storage/v1/object/sign/card-originals/u/a.jpg?token=t";
const BG_URL = "https://proj.supabase.example/storage/v1/object/sign/card-originals/u/b.png?token=t";
const JPG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46]);
const PNG_BYTES = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const PICS = new Map([
  [PIC_URL, { data: JPG_BYTES, ext: "jpg" }],
  [BG_URL, { data: PNG_BYTES, ext: "png" }],
]);
/** 모든 그림 개체(깊이 상관없이) */
function picsIn(ps: Para[], out: any[] = []): any[] {
  for (const p of ps)
    for (const it of p.items)
      if (it.kind === "obj") {
        if (it.obj.kind === "pic") out.push(it.obj);
        else if (it.obj.kind === "table") for (const c of it.obj.cells) picsIn(c.paras, out);
      }
  return out;
}
const imgBox = (r: Rect, url: string, extra: Partial<SnapBox> = {}, st: Partial<SnapStyle> = {}) => box("img", r, [], { display: "inline-block", ...st }, { replaced: "img", src: { url }, ...extra });

test("원본 그림: 글 속 <img> → 문단 안 그림 개체(화면 상자 크기, 글자처럼 취급) · 블록 <img> → 그림 문단 · 같은 주소는 한 벌 · validateHwpx 통과", async () => {
  const line = box("p", rect(0, 0, 170, 30), [text("앞 글 ", rect(0, 20, 12, 4)), imgBox(rect(12, 0, 40, 24), PIC_URL), text(" 뒤 글", rect(52, 20, 12, 4))], { textAlign: "left" });
  const block = imgBox(rect(10, 40, 60, 30), PIC_URL, {}, { display: "block" });
  const s = snap([line, block]);
  const { input, stats, approx } = snapshotHwpxInput(s, { lines: false, page: PAGE, pictures: PICS });
  assert.equal(stats.images, 2);
  assert.equal(stats.imageVoids, 0);
  assert.equal(stats.pics, 0);
  assert.equal(input.images.size, 1);
  assert.deepEqual([...input.images.values()][0], { data: JPG_BYTES, ext: "jpg" });
  // 글 속 그림: 앞뒤 글과 한 문단
  assert.equal(texts(input.paras[0]), "앞 글  뒤 글");
  assert.ok(input.paras[0].items.some((it) => it.kind === "obj" && it.obj.kind === "pic"));
  const ps = picsIn(input.paras);
  assert.deepEqual(
    ps.map((p) => [p.curW, p.curH, p.pos.treatAsChar, p.bin]),
    [
      [hu(40), hu(24), true, 1],
      [hu(60), hu(30), true, 1],
    ],
  );
  assert.ok(!approx.some((a) => /그림·대체 대상/.test(a.kind)));
  const { bytes } = await snapshotToHwpx(s, { lines: false, page: PAGE, pictures: PICS });
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const zip = await JSZip.loadAsync(bytes);
  assert.ok(zip.file("BinData/image1.jpg"));
});

test("원본 그림: 조상이 잘라 낸 <img>(clip) → 보이는 크기 + 한글 그림 자르기(원래 크기 = 화면 상자) · 다 잘린 그림은 생략", () => {
  const img = imgBox(rect(0, -2, 50, 34), PIC_URL, { src: { url: PIC_URL, clip: rect(0, 0, 50, 30) } }, { display: "block", position: "absolute" });
  const gone = imgBox(rect(0, 40, 10, 10), PIC_URL, { src: { url: PIC_URL, clip: rect(0, 40, 0, 0) } }, { display: "block" });
  const { input, approx } = snapshotHwpxInput(snap([box("span", rect(0, 0, 50, 30), [img], { display: "inline-block" }), gone]), { lines: false, page: PAGE, pictures: PICS });
  const [p] = picsIn(input.paras);
  assert.equal(picsIn(input.paras).length, 1);
  assert.deepEqual([p.orgW, p.orgH, p.curW, p.curH], [hu(50), hu(34), hu(50), hu(30)]);
  assert.deepEqual(p.crop, [0, hu(2), hu(50), hu(2) + hu(30)]);
  assert.ok(approx.some((a) => a.kind === "다 잘려 안 보이는 그림 생략"));
});

test("원본 그림: 칸 배경 url(100% 100%·반복 없음) → 칸 그림 채우기(TOTAL) · 배경색과 함께 · 그림만 있어도 꾸민 칸 · validateHwpx 통과", async () => {
  const cell = (x: number, bg: string) => box("td", rect(x, 0, 50, 20), [text("칸", rect(x + 1, 1, 10, 4))], { display: "table-cell", bg, bgImage: `url("${BG_URL}")`, bgSize: "100% 100%", bgRepeat: "no-repeat", bgPosition: "0% 0%" });
  const s = snap([cell(0, "rgba(0, 0, 0, 0)"), cell(50, "rgb(255, 0, 0)")]);
  const { input, stats } = snapshotHwpxInput(s, { lines: false, page: PAGE, pictures: PICS });
  assert.equal(stats.imageFills, 2);
  const [t] = tablesIn(input.paras);
  const fills = t.cells.map((c) => input.doc.borderFills[c.borderFill]?.fill);
  assert.deepEqual(
    fills.map((f) => [f?.color ?? null, f?.image?.mode, f?.image?.bin]),
    [
      [null, "TOTAL", 1],
      ["#FF0000", "TOTAL", 1],
    ],
  );
  const { bytes } = await snapshotToHwpx(s, { lines: false, page: PAGE, pictures: PICS });
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
  const zip = await JSZip.loadAsync(bytes);
  assert.match(await zip.file("Contents/header.xml")!.async("string"), /<hc:imgBrush mode="TOTAL"><hc:img binaryItemIDRef="image1"/);
  assert.ok(zip.file("BinData/image1.png"));
});

test("원본 그림: pictures 옵션이 없으면 예전 그대로(글 속 <img> 생략·블록 <img> 자리만·배경 url 생략) · 옵션이 있어도 바이트가 없으면 같은 크기 빈 그림·배경 생략", () => {
  const line = box("p", rect(0, 0, 170, 30), [text("글 ", rect(0, 20, 8, 4)), imgBox(rect(8, 0, 40, 24), PIC_URL)], { textAlign: "left" });
  const bgCell = box("td", rect(0, 40, 50, 20), [text("칸", rect(1, 41, 10, 4))], { display: "table-cell", border: allBorder(0.5, "rgb(0, 0, 0)"), bgImage: `url("${BG_URL}")`, bgSize: "100% 100%", bgRepeat: "no-repeat" });
  const s = snap([line, bgCell]);
  const without = snapshotHwpxInput(s, { lines: false, page: PAGE });
  const strip = (x: any) => JSON.stringify(x, (k, v) => (v instanceof Map ? [...v] : v));
  // 원본 그림 옵션이 없는 판(예전 동작): 그림·그림 채우기 없음
  assert.equal(picsIn(without.input.paras).length, 0);
  assert.equal(without.input.images.size, 0);
  assert.ok(without.approx.some((a) => a.kind === "글 속 그림·대체 대상 생략"));
  assert.ok(without.approx.some((a) => a.kind === "그림 배경(url) 생략"));
  assert.ok(!without.input.doc.borderFills.some((b) => b?.fill?.image));
  // 빈 지도(받은 그림 없음): 빈 그림 자리만, 배경 생략
  const empty = snapshotHwpxInput(s, { lines: false, page: PAGE, pictures: new Map() });
  const ps = picsIn(empty.input.paras);
  assert.equal(ps.length, 1);
  assert.deepEqual([ps[0].curW, ps[0].curH], [hu(40), hu(24)]);
  assert.equal(empty.input.images.size, 0);
  assert.equal(empty.stats.imageVoids, 1);
  assert.ok(empty.approx.some((a) => a.kind === "그림 배경(url) — 그림을 받지 못해 생략"));
  assert.ok(!empty.input.doc.borderFills.some((b) => b?.fill?.image));
  // 고정 자료(경평 초안 화면)는 옵션이 없을 때 결과가 옵션 전과 같아야 함 — 같은 입력 두 번이 같은 결과(결정론)
  assert.equal(strip(snapshotHwpxInput(s, { lines: false, page: PAGE }).input), strip(without.input));
});

test("배경 그림 채우기 방식 대응 표(imageFillMode): 100% 100% → TOTAL · 반복 → TILE·한 방향 · auto 크기 + 위치 → 아홉 자리 · cover → ZOOM(근사) · 길이 크기 → TOTAL(근사)", () => {
  assert.deepEqual(imageFillMode("100% 100%", "0% 0%", "no-repeat"), { mode: "TOTAL", exact: true });
  assert.deepEqual(imageFillMode("auto", "0% 0%", "repeat"), { mode: "TILE", exact: true });
  assert.deepEqual(imageFillMode("auto", "0% 100%", "repeat-x"), { mode: "TILE_HORZ_BOTTOM", exact: true });
  assert.deepEqual(imageFillMode("auto", "100% 0%", "repeat-y"), { mode: "TILE_VERT_RIGHT", exact: true });
  assert.deepEqual(imageFillMode("auto", "50% 50%", "no-repeat"), { mode: "CENTER", exact: true });
  assert.deepEqual(imageFillMode("auto", "0% 0%", "no-repeat"), { mode: "LEFT_TOP", exact: true });
  assert.deepEqual(imageFillMode("auto", "50% 0%", "no-repeat"), { mode: "CENTER_TOP", exact: true });
  assert.deepEqual(imageFillMode("auto", "100% 50%", "no-repeat no-repeat"), { mode: "RIGHT_CENTER", exact: true });
  assert.deepEqual(imageFillMode("auto auto", "right bottom", "no-repeat"), { mode: "RIGHT_BOTTOM", exact: true });
  assert.deepEqual(imageFillMode("cover", "50% 50%", "no-repeat"), { mode: "ZOOM", exact: false });
  assert.deepEqual(imageFillMode("20px 10px", "0% 0%", "no-repeat"), { mode: "TOTAL", exact: false });
  assert.deepEqual(imageFillMode("auto", "30% 0%", "no-repeat"), { mode: "TOTAL", exact: false });
});

test("줄 간격: line-height 0·font-size 0 문단 상자에 줄 높이를 준 인라인 블록 줄(원본 배치 카드 모양) → 잰 줄 간격 · 한 줄은 줄 상자 높이 · 겹침 0", () => {
  const PT = 25.4 / 72;
  const pitch = 10 * 1.6 * PT; // 160%
  // 줄 하나 = 높이를 준 인라인 블록(line-height 0) — 글 부분은 줄 상자 위쪽에 놓임
  const line = (t: string, y: number, h: number) => box("span", rect(0, y, 150, h), [text(t, rect(0, y - 0.18, 140, 3.97))], { display: "inline-block", fontSize: 10, lineHeight: 0, textAlign: "left" });
  const wrap = (y: number, lines: SnapBox[]) => box("div", rect(0, y, 150, lines.reduce((a, l) => a + l.rect.h, 0)), lines, { fontSize: 0, lineHeight: 0, textAlign: "start" });
  const multi = wrap(10, [line("첫 줄 글입니다", 10, pitch), line("둘째 줄 글입니다", 10 + pitch, pitch)]);
  const single = wrap(30, [line("한 줄 이름", 30, 10 * 1.2 * PT)]);
  const s = snap([multi, single]);
  const a = snapshotHwpxInput(s, { lines: false, page: PAGE });
  assert.deepEqual(
    a.input.paras.map((p) => ppOf(a.input, p).lineSpacing),
    [160, 120],
  );
  assert.deepEqual([a.stats.tight, a.stats.stacked], [0, 0]);
  assert.ok(a.approx.some((x) => x.kind === "줄 높이 계산값 대신 화면에서 잰 줄 간격"));
  assert.ok(!a.approx.some((x) => x.kind.startsWith("겹침 점검")));
  // 줄 배치를 적어도 같은 칸 안 세로 겹침 0, 줄 사이 = 잰 줄 간격
  const b = snapshotHwpxInput(s, { lines: true, page: PAGE });
  assert.deepEqual([b.stats.tight, b.stats.stacked], [0, 0]);
  const [l0, l1] = b.input.paras[0].lines;
  assert.equal(l1.vertpos - l0.vertpos, hu(pitch));
});

test("줄 간격: 큰 글자 상자(15pt) 안 작은 글(10.5pt 인라인 블록) → 비율 기준은 글 크기 — 여러 줄은 잰 간격, 한 줄은 상자 줄 높이", () => {
  const PT = 25.4 / 72;
  const inner = (y: number, lines: number) =>
    box("span", rect(0, y, 60, 5 * lines), [{ kind: "text", text: "’26년 이용 만족도(%)", frags: Array.from({ length: lines }, (_, i) => ({ at: i * 7, x: 0, y: y + 0.5 + 5 * i, w: 50, h: 4.23 })) }], { display: "inline-block", fontSize: 10.5, lineHeight: 14.175 });
  const p = (y: number, lines: number) => box("p", rect(0, y, 60, Math.max(19.5 * PT, 5 * lines)), [inner(y, lines)], { fontSize: 15, lineHeight: 19.5, textAlign: "left" });
  const { input, stats } = snapshotHwpxInput(snap([p(0, 2), p(20, 1)]), { lines: false, page: PAGE });
  assert.deepEqual(
    input.paras.map((x) => ppOf(input, x).lineSpacing),
    [Math.round((5 / (10.5 * PT)) * 100), Math.round((19.5 / 10.5) * 100)],
  );
  assert.equal(stats.tight, 0);
});

test("겹침 점검(overlapCheck): 줄 간격 < 글자 크기 × 0.9인 글 문단 · 줄 배치에서 앞 줄과 세로로 겹치는 문단 — 표 칸 안까지, 글 없는 문단은 줄 간격을 보지 않음", () => {
  const pp = (lineSpacingType: string, lineSpacing: number) => ({ lineSpacingType, lineSpacing }) as any;
  const doc = { charPrs: [{ height: 1000 }, { height: 100 }], paraPrs: [pp("PERCENT", 160), pp("PERCENT", 0), pp("PERCENT", 85), pp("FIXED", 800), pp("AT_LEAST", 500)] } as any;
  const seg = (vertpos: number) => ({ textpos: 0, vertpos, vertsize: 1000, textheight: 1000, baseline: 850, spacing: 600, horzpos: 0, horzsize: 10000, flags: 0 });
  const para = (paraPr: number, text: string, lines: ReturnType<typeof seg>[] = [], items: any[] = []): Para =>
    ({ paraPr, style: 0, items: text ? [{ kind: "text", pos: 0, charPr: 0, text }, ...items] : items, lines, length: text.length + 1, pageBreak: false }) as Para;
  const cell = (paras: Para[]) => ({ paras }) as any;
  const table = { kind: "table", cells: [cell([para(1, "칸 안 0%"), para(0, "칸 안 160%")])] } as any;
  const paras = [
    para(0, "보통", [seg(0), seg(1600)]),
    para(0, "앞 줄과 겹침", [seg(2000)]), // 앞 줄 1600 + 글 높이 1000 × 0.9 = 2500보다 위
    para(2, "85%"),
    para(3, "고정 8pt"),
    para(4, "최소 5pt — 글 크기 10pt가 큼"),
    para(1, "", [], [{ kind: "obj", pos: 0, charPr: 1, obj: table }]), // 표만 든 문단(0%)은 보지 않음
    para(1, "   "), // 빈칸뿐인 문단도 보지 않음
  ];
  assert.deepEqual(overlapCheck({ doc, paras }), { tight: 3, stacked: 1 });
});

/** 문단 글 전부(표 칸 안 문단까지) */
function allTexts(ps: Para[], out: string[] = []): string[] {
  for (const p of ps) {
    out.push(texts(p));
    for (const it of p.items) if (it.kind === "obj" && it.obj.kind === "table") for (const c of it.obj.cells) allTexts(c.paras, out);
  }
  return out;
}
/** 딱지: inline-block 안 flex 안 블록 글(인라인 수준이 아니라 따로 항목이 됨 — 원본 배치 카드의 국정과제 번호 모양) */
const chip = (label: string, x: number, y: number, w: number) =>
  box("span", rect(x, y, w, 3.7), [box("span", rect(x, y, w, 3.7), [box("div", rect(x, y + 0.08, w, 3.5), [text(label, rect(x + 2.5, y + 0.17, w - 5, 3.7))], { fontSize: 10 })], { display: "flex", fontSize: 10.48 })], {
    display: "inline-block",
    fontSize: 10.48,
  });

test("글 보존: 딱지 옆 글자 크기 0 inline(높이 0 상자)이 감싼 인라인 블록 글 → 버리지 않고 딱지와 한 행 두 칸 · 쌓지 않음", () => {
  // 화면: 「#14」 딱지 옆에 글. 글을 감싼 inline은 글자 크기 0이라 상자 높이 0 — 안의 inline-block 글은 그 상자 밖에 그려짐
  const words = "소통하고 혁신하는 정부";
  const wrapper = box("span", rect(30, 20, 37.3, 0), [box("span", rect(30, 20, 37.3, 3.7), [text(words, rect(31.8, 19.97, 30, 3.97))], { display: "inline-block", fontSize: 10.48, textAlign: "left" })], { display: "inline", fontSize: 0 });
  const line = box("div", rect(19, 20, 48.3, 3.7), [chip("#14", 19, 20, 11), wrapper], { fontSize: 0, textAlign: "left" });
  const { input, approx } = snapshotHwpxInput(snap([line]), { lines: false, page: PAGE });
  const all = allTexts(input.paras);
  assert.ok(all.includes(words), `글이 빠짐 ${JSON.stringify(all)}`);
  assert.ok(all.includes("#14"));
  assert.ok(!approx.some((x) => x.kind === "아주 작은 상자(0.3mm 이하) 생략" || x.kind === "겹친 상자 → 차례로 쌓음"), JSON.stringify(approx));
  const t = tablesIn(input.paras).find((x) => x.cells.some((c) => c.paras.some((p) => texts(p) === words)));
  assert.ok(t, "딱지와 글이 한 표에 나란히 있지 않음");
  const at = (w: string) => t.cells.find((c) => c.paras.some((p) => texts(p) === w))!;
  assert.equal(at("#14").row, at(words).row);
  assert.ok(at("#14").col < at(words).col);
});

test("글 보존: 격자에서 칸을 얻지 못하는 글 흐름(상자 높이 0.1mm — 글은 상자 밖으로 넘침) → 버리지 않고 차례로 쌓음", () => {
  const deco = { border: allBorder(0.26, "rgb(0, 0, 0)") };
  // 세로 가는 선 배경(x 65mm)이 있는 상자 → 격자 배치. 안: 위 상자 · 얇은 글 상자 · 아래 상자 — 얇은 글 상자의 위아래 경계(10·10.2)는 한 경계로 묶여 칸을 못 얻음
  const vline = { bgImage: "linear-gradient(rgb(0, 0, 0), rgb(0, 0, 0))", bgSize: "0.8px 100%", bgPosition: `${(65 / PX).toFixed(4)}px 0px`, bgRepeat: "no-repeat" };
  const thin = box("div", rect(0, 10, 60, 0.1), [text("넘쳐 보이는 글", rect(0, 10, 40, 4))], { textAlign: "left" });
  const holder = box("div", rect(0, 5, 90, 10), [box("div", rect(0, 5, 60, 5), [], deco), thin, box("div", rect(0, 10.2, 60, 4.8), [], deco)], vline);
  const { input, approx } = snapshotHwpxInput(snap([holder]), { lines: false, page: PAGE });
  assert.ok(allTexts(input.paras).includes("넘쳐 보이는 글"), "글이 빠짐");
  assert.ok(!approx.some((x) => x.kind === "아주 작은 상자(0.3mm 이하) 생략"), JSON.stringify(approx));
  assert.ok(approx.some((x) => x.kind === "겹친 상자 → 차례로 쌓음"), JSON.stringify(approx));
});

test("글 보존: 딱지 아래 줄까지 감긴 글은 딱지 옆 글이 아님 — 블록 폭 그대로(왼쪽 여백 = 블록 왼쪽) 차례로 쌓아 글 보존", () => {
  const words = "지속가능미래를 위한 탄소중립 실현";
  const flow: SnapText = { kind: "text", text: words, frags: [{ at: 0, x: 31.8, y: 20, w: 35, h: 3.97 }, { at: 16, x: 19, y: 23.7, w: 8, h: 3.97 }] };
  const wrapper = box("span", rect(19, 20, 48.3, 0), [box("span", rect(19, 20, 48.3, 7.4), [flow], { display: "inline", fontSize: 10.48, textAlign: "left" })], { display: "inline", fontSize: 0 });
  const line = box("div", rect(19, 20, 48.3, 7.4), [chip("#40", 19, 20, 11), wrapper], { fontSize: 0, textAlign: "left" });
  const { input, approx } = snapshotHwpxInput(snap([line]), { lines: false, page: PAGE });
  const all = allTexts(input.paras);
  assert.ok(all.includes(words) && all.includes("#40"), JSON.stringify(all));
  assert.ok(approx.some((x) => x.kind === "겹친 상자 → 차례로 쌓음"));
  // 글 문단은 블록 왼쪽(19mm)부터 — 딱지 오른쪽(30mm)으로 좁히면 둘째 줄 자리가 사라짐
  const para = input.paras.find((p) => texts(p) === words)!;
  assert.equal(ppOf(input, para).left, hu(19));
});
