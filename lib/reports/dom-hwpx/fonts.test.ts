// 빠진 글꼴 갈래 대응(2026-11-17) 테스트 — 합성 스냅숏만(기관 원문·실명 없음).
// 지키는 것: 글꼴을 다 갖춘 표지(되돌리기 표 없음)는 옵션이 없을 때와 바이트까지 같음 ·
// 빠진 갈래(맑은 고딕·HY헤드라인M)의 한 줄 딱지 칸은 글 폭 × 0.2만큼 넓히고 뒤 열을 밀어 표 폭은 그대로 ·
// 화면에서 여러 줄인 딱지 글·다른 갈래만 빠진 경우는 넓히지 않음 · 오른쪽 빈자리가 모자라면 그만큼만 · 한글 대체 글꼴(substFont)은 함초롬돋움

import assert from "node:assert/strict";
import { test } from "node:test";
import JSZip from "jszip";
import type { Para, Table } from "../../hwp/model.ts";
import { REPORT_PAGE_MM } from "../section-hwpx.ts";
import { snapshotHwpxInput, snapshotToHwpx } from "./convert.ts";
import { spacingUndoFor } from "./policy.ts";
import type { LayoutSnapshot, Rect, SnapBox, SnapNode, SnapStyle, SnapText } from "./snapshot.ts";

const PAGE = REPORT_PAGE_MM;
const hu = (v: number) => Math.round((v * 7200) / 25.4);
const side = () => ({ w: 0, style: "none", color: "rgb(0, 0, 0)" });
const HEAD = 'KcaQuoteSans, KcaHead, HY헤드라인M, H2hdrM, "Noto Sans KR", sans-serif';
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
    fontFamily: HEAD,
    fontSize: 12,
    fontWeight: 400,
    fontStyle: "normal",
    color: "rgb(17, 17, 17)",
    lineHeight: 16,
    textAlign: "left",
    textAlignLast: "auto",
    textJustify: "",
    letterSpacing: -0.24,
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
const text = (t: string, r: Rect): SnapText => ({ kind: "text", text: t, frags: [{ at: 0, ...r }] });
const box = (tag: string, r: Rect, children: SnapNode[], st: Partial<SnapStyle> = {}): SnapBox => ({ kind: "box", tag, rect: r, style: style(st), children });
const snap = (children: SnapNode[]): LayoutSnapshot => ({ version: 1, frame: { w: 170, h: 30 }, root: box("div", rect(0, 0, 170, 30), children, { fontFamily: '"KcaBody", serif' }) });

/** 딱지(배경 있는 상자 — 한 줄 글 폭 16mm) + 이름(꾸밈 없는 상자 → 글 흐름) 한 띠 */
const chip = (t: SnapText = text("대상사업1", rect(2, 1, 16, 4)), st: Partial<SnapStyle> = {}) => box("span", rect(0, 0, 20, 6), [t], { bg: "rgb(215, 216, 215)", ...st });
const title = (w = 40, textW = 30) => box("span", rect(22, 0, w, 6), [text("사업 이름", rect(22, 1, textW, 4))]);
const HEAD_MISSING = spacingUndoFor("body dotum label");

function tablesIn(ps: Para[], out: Table[] = []): Table[] {
  for (const p of ps)
    for (const it of p.items)
      if (it.kind === "obj" && it.obj.kind === "table") {
        out.push(it.obj);
        for (const c of it.obj.cells) tablesIn(c.paras, out);
      }
  return out;
}
/** 첫 표 첫 행의 칸 폭(HWPUNIT, 열 차례)과 표 폭 */
function row0(s: LayoutSnapshot, spacingUndo?: ReturnType<typeof spacingUndoFor>) {
  const r = snapshotHwpxInput(s, { lines: false, page: PAGE, spacingUndo });
  const [t] = tablesIn(r.input.paras);
  return { widths: t.cells.filter((c) => c.row === 0).sort((a, b) => a.col - b.col).map((c) => c.width), table: t.pos.width, approx: r.approx.map((a) => a.kind) };
}

test("글꼴을 다 갖춘 표지(되돌리기 표 없음)는 옵션이 없을 때와 바이트까지 같음 · 딱지 칸 = 화면 상자 폭", async () => {
  const s = snap([chip(), title()]);
  assert.deepEqual(spacingUndoFor("body dotum label head"), []);
  const a = await snapshotToHwpx(s, { lines: false, page: PAGE });
  const b = await snapshotToHwpx(s, { lines: false, page: PAGE, spacingUndo: spacingUndoFor("body dotum label head") });
  assert.deepEqual(Buffer.from(b.bytes), Buffer.from(a.bytes));
  assert.equal(row0(s).widths[0], hu(20));
});

test("HY헤드라인M이 빠지면 한 줄 딱지 칸을 글 폭 × 0.2만큼 넓히고 뒤 열을 밀어 표 폭은 그대로", () => {
  const s = snap([chip(), title()]);
  const before = row0(s);
  const after = row0(s, HEAD_MISSING);
  assert.equal(after.widths[0], hu(20 + 16 * 0.2));
  assert.equal(after.table, before.table);
  assert.equal(after.widths.reduce((a, v) => a + v, 0), after.table);
  // 딱지 뒤 빈틈 칸은 그대로, 이름 칸이 그만큼 줄어듦
  assert.equal(after.widths.length, before.widths.length);
  assert.ok(Math.abs(after.widths[1] - before.widths[1]) <= 1);
  assert.ok(Math.abs(before.widths[2] - after.widths[2] - hu(16 * 0.2)) <= 2);
  assert.ok(after.approx.some((k) => k.includes("딱지")));
});

test("넓히지 않음: 화면에서 여러 줄인 딱지 글 · 다른 갈래(맑은 고딕)만 빠짐 · 오른쪽 빈자리 없음", () => {
  const two: SnapText = { kind: "text", text: "대상사업1", frags: [{ at: 0, ...rect(2, 1, 10, 2) }, { at: 3, ...rect(2, 3.5, 6, 2) }] };
  assert.equal(row0(snap([chip(two), title()]), HEAD_MISSING).widths[0], hu(20));
  assert.equal(row0(snap([chip(), title()]), spacingUndoFor("body dotum head")).widths[0], hu(20));
  // 이름 상자가 영역 오른쪽 끝까지(빈자리 0)
  assert.equal(row0(snap([chip(), title(148, 30)]), HEAD_MISSING).widths[0], hu(20));
});

test("오른쪽 빈자리가 모자라면 그만큼만 넓힘(이름 칸의 빠진 갈래 글 여유를 먼저 남김)", () => {
  // 빈자리 = 170 − 162(이름 상자 오른쪽) − 이름 글 10 × 0.2 = 6mm ≥ 딱지 여유 3.2mm → 다 넓힘
  assert.equal(row0(snap([chip(), title(140, 10)]), HEAD_MISSING).widths[0], hu(23.2));
  // 빈자리 = 170 − 162 − 30 × 0.2 = 2mm < 3.2mm → 2mm만
  assert.equal(row0(snap([chip(), title(140, 30)]), HEAD_MISSING).widths[0], hu(22));
});

test("한글 대체 글꼴: 빠진 갈래 글꼴 이름에 substFont 함초롬돋움", async () => {
  const { bytes } = await snapshotToHwpx(snap([chip(), title()]), { lines: false, page: PAGE, spacingUndo: HEAD_MISSING });
  const header = await (await JSZip.loadAsync(bytes)).file("Contents/header.xml")!.async("string");
  assert.match(header, /<hh:font id="\d+" face="HY헤드라인M" type="TTF" isEmbedded="0"><hh:substFont face="함초롬돋움"/);
});
