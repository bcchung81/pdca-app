// 쪽 보기: 표를 쪽 경계에서 나누는 한글 규칙(작은 표) + 원본 카드 59장의 표 첫 쪽 높이가 파일 값과 같음
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { tableGrid } from "./html.ts";
import { readHwp5 } from "./hwp5.ts";
import { extractCardLayouts, layoutDoc, layoutStartY } from "./layout.ts";
import type { Cell, LineSeg, Para, Table } from "./model.ts";
import { TABLE_BOTTOM_MIN, layoutPages, pagesHtml, paginateTable, sliceParaLines } from "./pages.ts";
import { cardSourceFile } from "../cards/file-names.ts";

const ROOT = resolve(import.meta.dirname, "../..");
const file = (g: number) => join(ROOT, "data/cards/260916", cardSourceFile(g));
const has = [1, 2, 3].every((g) => existsSync(file(g)));

const line = (vertpos: number, textpos = 0, vertsize = 1000, spacing = 600): LineSeg => ({ textpos, vertpos, vertsize, textheight: vertsize, baseline: 850, spacing, horzpos: 0, horzsize: 10000, flags: 0 });
/** 글 문단: 줄 세로 위치들(줄마다 글자 두 개) */
const para = (...tops: number[]): Para => ({
  paraPr: 0,
  style: 0,
  items: [{ kind: "text", pos: 0, charPr: 0, text: "가나".repeat(tops.length) }],
  lines: tops.map((v, i) => line(v, i * 2)),
  length: tops.length * 2 + 1,
  pageBreak: false,
});
const cell = (row: number, col: number, height: number, paras: Para[], rowSpan = 1): Cell => ({
  row,
  col,
  rowSpan,
  colSpan: 1,
  width: 10000,
  height,
  margin: [0, 0, 425, 425],
  ownMargin: false,
  borderFill: 0,
  vertAlign: "TOP",
  paras,
});
const table = (rows: number, cols: number, cells: Cell[]): Table => ({
  kind: "table",
  pos: { treatAsChar: false, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width: cols * 10000, height: 0, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
  rows,
  cols,
  cellSpacing: 0,
  inMargin: [0, 0, 0, 0],
  borderFill: 0,
  pageBreak: "TABLE",
  repeatHeader: false,
  cells,
});
const pages = (t: Table, first: number, next = 100000) => paginateTable(t, first, next);
/** 첫 행: 한 줄(1000) + 안 여백(850) = 1850 */
const small = () => cell(0, 0, 1850, [para(0)]);

test("나눔: 줄 단위로 넣고(줄 아래 + 안 여백 ≤ 남은 공간), 내용이 행 높이를 정했으면 넣은 줄에서 끝남", () => {
  // r1: 줄 5개(1000 + 간격 600), 저장 높이 2000 < 내용 — 남은 공간 5000에 줄 2개(2600 + 850)
  const t = table(2, 1, [small(), cell(1, 0, 2000, [para(0, 1600, 3200, 4800, 6400)])]);
  const ps = pages(t, 1850 + 5000);
  assert.deepEqual(ps.map((p) => p.hs), [[1850, 3450], [5050]], "다음 쪽: 남은 줄 3개(4200) + 여백");
  const c = ps[1].cells.find((x) => x.cell.row === 1)!;
  assert.equal(c.paras?.[0].lines.length, 3);
  assert.equal(c.paras?.[0].items.map((i) => (i.kind === "text" ? i.text : "")).join(""), "가나가나가나", "넘어간 줄의 글만");
});

test("나눔: 저장 높이가 내용보다 크면 쪽 끝까지, 다음 쪽은 max(저장 높이 남은 것, 남은 줄 + 여백)", () => {
  const t = table(2, 1, [small(), cell(1, 0, 9000, [para(0, 1600, 3200, 4800, 6400)])]);
  assert.deepEqual(pages(t, 1850 + 5000).map((p) => p.hs), [[1850, 5000], [5050]]);
  const tall = table(2, 1, [small(), cell(1, 0, 12000, [para(0, 1600, 3200, 4800, 6400)])]);
  assert.deepEqual(pages(tall, 1850 + 5000).map((p) => p.hs), [[1850, 5000], [7000]]);
});

test("한 줄도 못 넣으면 행째 다음 쪽 — 앞 행은 그 행으로 이어지는 병합 칸의 저장 높이가 남았을 때만 쪽 끝까지 늘림", () => {
  const plain = table(2, 2, [cell(0, 0, 1850, [para(0)]), cell(0, 1, 1850, [para(0)]), cell(1, 0, 3000, [para(0)]), cell(1, 1, 3000, [para(0)])]);
  assert.deepEqual(pages(plain, 2500).map((p) => p.hs), [[1850], [3000]], "남은 650 < 첫 줄 1850, 늘리지 않음");
  const spanned = table(2, 2, [cell(0, 0, 8000, [para(0)], 2), cell(0, 1, 1850, [para(0)]), cell(1, 1, 3000, [para(0)])]);
  const ps = pages(spanned, 2500);
  assert.equal(ps[0].hs[0], 2500, "병합 칸(8000)이 남아 앞 행이 쪽 끝까지");
  assert.equal(ps[1].hs[0], 8000 - 2500, "다음 쪽 행 = 병합 칸 − 앞 쪽에 놓인 높이");
  assert.equal(ps[0].cells.find((c) => c.cell.rowSpan === 2)?.rowSpan, 1, "첫 쪽에서는 한 행만 덮음");
  assert.equal(ps[1].cells.find((c) => c.cell.rowSpan === 2)?.paras?.length, 0, "다음 쪽에서는 빈 칸으로 이어짐");
});

test("행의 칸 중 하나라도 첫 줄을 못 넣으면 행을 나누지 않음", () => {
  // 칸0은 한 줄이 들어가지만 칸1의 첫 줄(높이 3000)은 안 들어감
  const t = table(2, 2, [small(), cell(0, 1, 1850, [para(0)]), cell(1, 0, 2000, [para(0, 1600)]), cell(1, 1, 4000, [{ ...para(0), lines: [line(0, 0, 3000, 0)] }])]);
  assert.deepEqual(pages(t, 1850 + 3000).map((p) => p.hs), [[1850], [4000]]);
});

test("내용이 다 들어가고 저장 높이만 넘치면: 아래로 이어지는 병합 칸이 없으면 쪽 끝에서 끝내고, 있으면 남은 높이를 다음 쪽에", () => {
  const dropped = table(2, 1, [small(), cell(1, 0, 9000, [para(0)])]);
  assert.deepEqual(pages(dropped, 1850 + 5000).map((p) => p.hs), [[1850, 5000]], "남은 4000은 버림(원본 3-나)");
  const carried = table(3, 2, [small(), cell(0, 1, 1850, [para(0)]), cell(1, 0, 12000, [para(0)], 2), cell(1, 1, 9000, [para(0)]), cell(2, 1, 1850, [para(0)])]);
  const ps = pages(carried, 1850 + 5000);
  assert.deepEqual(ps[0].hs, [1850, 5000]);
  assert.deepEqual(ps[1].hs, [4000, 3000], "병합 칸이 다음 행으로 이어져 남은 저장 높이를 다음 쪽 맨 위에(원본 7-가), 뒤 행 = 12000 − 9000");
});

test("쪽을 넘은 줄: 파일의 쪽 경계와 같은 곳에서 나누면 새 쪽 첫 줄은 한글이 적은 세로 위치에", () => {
  // 파일: 세 줄 뒤 쪽이 바뀌고 새 쪽 첫 줄을 400(문단 위 간격)에 적음
  const p1 = para(0, 1600, 3200);
  const p2: Para = { ...para(400, 2000), items: [{ kind: "text", pos: 0, charPr: 0, text: "다라마바" }] };
  const t = table(1, 1, [cell(0, 0, 1000, [p1, p2])]);
  const ps = pages(t, 4200 + 850);
  assert.deepEqual(ps.map((p) => p.hs), [[5050], [3000 + 850]], "새 쪽 줄 위치 400·2000 그대로(아래 끝 3000)");
  assert.equal(ps[1].cells[0].gap, 400);
});

test("병합 칸이 정하는 뒤 행 높이는 앞 행이 쪽에서 나뉘며 늘어난(여백 두 번) 만큼 줄어듦", () => {
  // 칸0: 두 행 병합 20000, r0 칸1: 줄 6개(나뉨), r1 칸1: 작음
  const t = table(2, 2, [cell(0, 0, 20000, [para(0)], 2), cell(0, 1, 2000, [para(0, 1600, 3200, 4800, 6400, 8000)]), cell(1, 1, 1000, [para(0)])]);
  const ps = pages(t, 6000);
  const r0 = ps[0].hs[0] + ps[1].hs[0];
  assert.equal(ps[1].hs[1], 20000 - r0, "병합 칸 20000 − 실제로 놓인 앞 행 높이");
});

test("문단 줄 자르기: 그 줄들의 글만, 줄 시작 위치는 그대로", () => {
  const p: Para = { ...para(0, 1600, 3200), items: [{ kind: "text", pos: 0, charPr: 0, text: "가나다라마바" }] };
  const mid = sliceParaLines(p, 1, 2);
  assert.equal(mid.items.map((i) => (i.kind === "text" ? i.text : "")).join(""), "다라");
  assert.equal(mid.lines.length, 1);
  assert.equal(mid.more, true, "뒤 줄이 다음 쪽에 이어짐(끝 줄도 양쪽 정렬)");
  assert.equal(sliceParaLines(p, 2, 3).more, undefined, "문단 끝 조각");
  assert.equal(sliceParaLines(p, 0, 3), p);
});

test("원본 카드 59장: 여러 쪽 표 111개의 첫 쪽 조각 높이가 파일 값(pos.height)과 같음", { skip: !has && "원본 한글 파일 없음(data/cards/260916 — git 밖)" }, () => {
  let checked = 0;
  for (const g of [1, 2, 3]) {
    const doc = readHwp5(readFileSync(file(g)));
    const page = doc.sections[0].page!;
    const bodyH = page.height - page.top - page.bottom - page.header - page.footer;
    for (const p of doc.sections[0].paras)
      for (const it of p.items) {
        if (it.kind !== "obj" || it.obj.kind !== "table") continue;
        const t = it.obj;
        const total = tableGrid(t, (id) => doc.paraPrs[id]?.right ?? 0).hs.reduce((a, b) => a + b, 0);
        const single = p.items.filter((x) => x.kind === "obj").length === 1;
        const hostTop = single && p.lines.length ? p.lines[0].vertpos - (t.pos.treatAsChar ? 0 : doc.paraPrs[p.paraPr].before) : 0;
        const [, , ot, ob] = t.pos.outMargin;
        const top = hostTop + (t.pos.treatAsChar ? 0 : Math.max(0, t.pos.vertOffset)) + ot;
        const gap = Math.max(ob, TABLE_BOTTOM_MIN);
        const parts = paginateTable(t, bodyH - top - gap, bodyH - ot - gap);
        checked++;
        if (total > t.pos.height + 5) assert.ok(Math.abs(parts[0].height - t.pos.height) <= 6, `주요사업${g} 표 첫 쪽 ${parts[0].height} ≠ 파일 ${t.pos.height}`);
        else assert.equal(parts.length, 1, `주요사업${g} 한 쪽 표`);
      }
  }
  assert.equal(checked, 111);
});

test("원본 카드 59장: 쪽 보기로 그리면 카드마다 쪽이 나오고 쪽 크기·자리 값이 모두 숫자", { skip: !has && "원본 한글 파일 없음(data/cards/260916 — git 밖)" }, () => {
  for (const g of [1, 2, 3]) {
    extractCardLayouts(readHwp5(readFileSync(file(g)))).forEach((L, i) => {
      const ctx = { doc: layoutDoc(L), imageUrl: () => null };
      const ps = layoutPages(ctx, L.blocks, L.page!);
      assert.ok(ps.length >= 1, `쪽 수 ${ps.length}`);
      // 주요사업1 1-가(카드 + AX 붙임 5건)는 원본 PDF 2~8쪽과 같은 7쪽
      if (g === 1 && i === 0) assert.equal(ps.length, 7);
      for (const list of ps) for (const it of list) assert.ok(Number.isFinite(it.x) && Number.isFinite(it.y) && it.y >= 0, `자리 ${it.x},${it.y}`);
    });
  }
});

test("원본 카드 59장: 꼬리말(쪽 번호 자동 번호)·쪽 번호 위치를 읽고, 카드 첫 쪽 번호가 원본 PDF 쪽 번호와 같음", { skip: !has && "원본 한글 파일 없음(data/cards/260916 — git 밖)" }, () => {
  const d3 = readHwp5(readFileSync(file(3)));
  const f = d3.sections[0].footer;
  assert.equal(f?.vertAlign, "BOTTOM");
  assert.deepEqual(
    f?.paras[0].items.map((i) => (i.kind === "text" ? i.text + (i.attrs ?? "") : i.kind)),
    ["-", '0 data-hw-field="page"', "-"],
  );
  assert.equal(d3.sections[0].pageNum?.position, 5, "아래 가운데");
  assert.equal(readHwp5(readFileSync(file(1))).sections[0].pageNum, undefined);
  // 원본 PDF에서 확인한 카드 첫 쪽: 주요사업1 2-가 13쪽, 주요사업2 7-가 41쪽, 주요사업3 6-가 24쪽(59장 모두 같음을 확인해 둠)
  const firsts = [1, 2, 3].map((g) => extractCardLayouts(readHwp5(readFileSync(file(g)))).map((l) => l.firstPage));
  assert.equal(firsts[0][4], 13);
  assert.equal(firsts[1][19], 41);
  assert.equal(firsts[2][11], 24);
  for (const list of firsts) assert.ok(list.every((n, i) => typeof n === "number" && (i === 0 || n > (list[i - 1] as number))), "카드마다 뒤 쪽");
  // 쪽 보기: 꼬리말 자리표시에 원본 쪽 번호, 쪽 번호 위치는 「- n -」
  const L = extractCardLayouts(d3)[11];
  const html = pagesHtml({ doc: layoutDoc(L), imageUrl: () => null }, L.blocks, L.page!, 0, { footer: L.footer, pageNum: L.pageNum, firstPage: L.firstPage });
  assert.match(html, /data-hw-field="page"[^>]*>24</);
  assert.match(html, /class="hw-pn"[^>]*>- 25 -</);
  // 첫 쪽 시작 자리: 원본에서 쪽 나누기로 시작한 카드는 쪽 맨 위, 앞 카드 뒤 쪽 중간에 이어 시작한 카드(주요사업1 스무째)는 원본 자리
  const starts = [1, 2, 3].map((g) => extractCardLayouts(readHwp5(readFileSync(file(g)))).map((l) => layoutStartY(l)));
  assert.equal(starts[0][19], 17098);
  assert.deepEqual(starts.flat().filter((y) => y > 0), [17098], "59장 중 쪽 중간 시작은 한 장");
  // 그 위 빈자리에는 안내 글(첫 쪽만), 쪽 맨 위에서 시작하면 없음
  const L20 = extractCardLayouts(readHwp5(readFileSync(file(1))))[19];
  const note = { footer: L20.footer, firstPage: L20.firstPage, startNote: "앞 내용 자리" };
  const withNote = pagesHtml({ doc: layoutDoc(L20), imageUrl: () => null }, L20.blocks, L20.page!, layoutStartY(L20), note);
  assert.equal(withNote.match(/class="hw-prev"/g)?.length, 1);
  assert.doesNotMatch(pagesHtml({ doc: layoutDoc(L20), imageUrl: () => null }, L20.blocks, L20.page!, 0, note), /hw-prev/);
});

test("같은 문단의 띄운 표 + 글자처럼 놓은 딱지(주요사업2 다섯째 카드 AX 붙임): 딱지는 문단 줄(위), 띄운 표는 문단 위에서 떨어진 자리 — 원본 PDF", { skip: !has && "원본 한글 파일 없음(data/cards/260916 — git 밖)" }, () => {
  const layouts = extractCardLayouts(readHwp5(readFileSync(file(2))));
  const L = layouts.find((l) => l.blocks.some((b) => b.kind === "table" && b.host?.join))!;
  const bi = L.blocks.findIndex((b) => b.kind === "table" && b.host?.join);
  const label = L.blocks[bi];
  const float = L.blocks[bi - 1];
  assert.ok(label.kind === "table" && label.table.pos.treatAsChar && label.host?.lines.length === 1, "딱지는 그 줄 배치를 가짐");
  assert.ok(float.kind === "table" && !float.table.pos.treatAsChar);
  // 두 덩이만 새 쪽에 놓아 봄: 문단 위 0 → 딱지 = 바깥 위 여백(283), 띄운 표 = 세로 떨어짐(3740)
  const placed = layoutPages({ doc: layoutDoc(L), imageUrl: () => null }, [float, label], L.page!)[0];
  assert.equal(placed.length, 2);
  // 먼저 놓인 것은 띄운 표(첫 조각), 딱지는 그 문단 줄 자리 — HWPUNIT
  assert.equal(placed[1].y, 283, "딱지는 문단 줄(문단 위 + 바깥 여백)");
  assert.equal(placed[0].y, 3740, "띄운 표는 문단 위 + 세로 떨어짐(딱지 뒤가 아님)");
});
