// 원본 배치의 묶음 제목 표(layout.lead): 묶음 여럿을 합친 파일(합본)도 카드마다 자기 묶음의 제목 표 — 합성 한글 모델(기관 원문 아님)
import assert from "node:assert/strict";
import { test } from "node:test";
import { extractCardLayouts } from "./layout.ts";
import type { CharPr, HwpDoc, Para, ParaPr, Table } from "./model.ts";

const textPara = (text: string): Para => ({ paraPr: 0, style: 0, items: [{ kind: "text", pos: 0, charPr: 0, text }], lines: [], length: text.length + 1, pageBreak: false });
const table = (texts: string[]): Table => ({
  kind: "table",
  pos: { treatAsChar: false, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width: 40000, height: 1000, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] },
  rows: 1,
  cols: texts.length,
  cellSpacing: 0,
  inMargin: [0, 0, 0, 0],
  borderFill: 0,
  pageBreak: "TABLE",
  repeatHeader: false,
  cells: texts.map((t, col) => ({ row: 0, col, rowSpan: 1, colSpan: 1, width: 10000, height: 1000, margin: [0, 0, 0, 0], ownMargin: false, borderFill: 0, vertAlign: "TOP", paras: [textPara(t)] })),
});
const tablePara = (...texts: string[]): Para => ({ paraPr: 0, style: 0, items: [{ kind: "obj", pos: 0, charPr: 0, obj: table(texts) }], lines: [], length: 9, pageBreak: false });
// 배치가 쓰는 모양만 채운 최소 모양(글꼴·테두리 없음)
const doc = (paras: Para[]): HwpDoc => ({
  format: "hwp",
  faces: {},
  charPrs: [{ face: [], borderFill: 0 } as unknown as CharPr],
  paraPrs: [{ borderFill: 0, tabDef: 0, headingType: "NONE" } as unknown as ParaPr],
  borderFills: [null],
  tabDefs: [],
  bullets: [],
  numberings: [],
  bins: new Map(),
  sections: [{ page: null, paras }],
});
const title = (n: number) => tablePara(`(주요사업${n}) 시험 사업 ${n}`);
const card = (no: string) => tablePara("과제명(과제번호)", `시험 과제 (과제번호 : ${no})`);
const leads = (d: HwpDoc) => extractCardLayouts(d).map((l) => (l.lead?.kind === "table" ? l.lead.table.cells[0].paras[0].items.map((i) => (i.kind === "text" ? i.text : "")).join("") : null));

test("합본(제목 표를 앞에 모으고 카드 묶음마다 「[주요사업N]」 머리 줄): 카드마다 그 묶음의 제목 표, 머리 줄은 앞 카드 배치에 안 붙음", () => {
  const d = doc([title(1), title(2), title(3), textPara("[주요사업1]"), card("1-가"), card("1-나"), textPara("[주요사업3]"), card("1-가"), textPara("[ 주요사업 2 ]"), card("1-가")]);
  assert.deepEqual(leads(d), ["(주요사업1) 시험 사업 1", "(주요사업1) 시험 사업 1", "(주요사업3) 시험 사업 3", "(주요사업2) 시험 사업 2"]);
  assert.deepEqual(extractCardLayouts(d).map((l) => l.blocks.length), [1, 1, 1, 1], "다음 묶음 머리 줄에서 앞 카드 배치가 끝남");
});

test("제목 표가 카드 묶음 앞마다 있으면 가장 가까운 제목 표, 하나뿐이면 모든 카드가 그 표(예전과 같음)", () => {
  assert.deepEqual(leads(doc([title(1), card("1-가"), title(2), card("1-가"), card("2-가")])), ["(주요사업1) 시험 사업 1", "(주요사업2) 시험 사업 2", "(주요사업2) 시험 사업 2"]);
  assert.deepEqual(leads(doc([title(2), card("1-가"), card("1-나")])), ["(주요사업2) 시험 사업 2", "(주요사업2) 시험 사업 2"]);
  assert.deepEqual(leads(doc([card("1-가")])), [null], "제목 표 없음");
});
