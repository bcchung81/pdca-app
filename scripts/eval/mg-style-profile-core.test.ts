// 스타일 프로필 셈(mg-style-profile-core.ts) 시험 — 가짜 글만.
import assert from "node:assert/strict";
import test from "node:test";
import type { Block } from "../../lib/reports/blocks.ts";
import { type StyleContext, isDataBlock, isPlanBlock, perfCells, proseBullets, styleChecks, styleProfile, visibleChars, visibleText } from "./mg-style-profile-core.ts";

const blk = (o: Partial<Block>): Block => ({ kind: "bullets", label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", ...o });
const cell = (bullets: string[], head = "") => ({ head, tag: "", bullets, note: "" });
const ctx = (o: Partial<StyleContext> = {}): StyleContext => ({ pages: 2, heightMm: 500, targetMm: 510, repeatFigures: 0, repeatSentences: 0, hollow: 0, ...o });

test("보이는 글자: 그림 참조·태그·엔티티·표 기호·style·공백 제외 — md와 HTML 같은 함수", () => {
  assert.equal(visibleChars("<tr><td>가 나</td></tr>\n| --- | --- |\n![그림](a.png)다&nbsp;"), 3);
  assert.equal(visibleChars("<html><head><style>p{color:red}</style></head><body><p>가<b>나</b></p><script>x()</script>다 라</body></html>"), 4);
});

test("보이는 글: 인라인 태그 사이 수량이 안 끊기고, 상자 사이는 줄이 나뉨", () => {
  assert.equal(visibleText("<body><p>158<b>건</b></p><p>다</p>").trim(), "158건\n다");
});

test("HTML이 있으면 쪽당 글자·수량은 HTML 보이는 글로 잼", () => {
  const blocks = [blk({ items: ["가짜 3건"] })];
  const spec = { blocks, at: ["a"], parts: [{ key: "a", title: "절" }] };
  const p = styleProfile(spec, ctx({ html: "<body><h1>머리 띠 10건</h1><p>가짜 3건</p></body>" }));
  assert.equal(p.visibleChars, 10);
  assert.equal(p.qtyTokens, 2);
  assert.equal(styleProfile(spec, ctx()).qtyTokens, 1);
});

test("칸 불릿: 추진성과·수치 표·위첨자 제외, 수치 표 값 칸은 따로", () => {
  const blocks = [blk({ items: ["가짜 불릿 하나", "둘^{’25}셋"] }), blk({ label: "추진성과", items: ["빠짐"] }), blk({ kind: "table", variant: "bars", items: ["머리"], cells: [cell(["3건", "4건"], "행")] })];
  assert.deepEqual(proseBullets(blocks), ["가짜 불릿 하나", "둘셋"]);
  const p = styleProfile({ blocks, at: ["a", "a", "a"], parts: [{ key: "a", title: "절 12건" }] }, ctx());
  assert.equal(p.bullets, 2);
  assert.equal(p.tableValueCells, 2);
});

test("데이터 블록: 값이 수치인 수치 표만(stats·chart·값 없는 표 제외)", () => {
  assert.equal(isDataBlock(blk({ kind: "table", cells: [cell(["3건"])] })), true);
  assert.equal(isDataBlock(blk({ kind: "table", cells: [cell(["가짜"])] })), false);
  assert.equal(isDataBlock(blk({ kind: "table", variant: "ladder", cells: [cell(["3건"])] })), false);
  assert.equal(isDataBlock(blk({ kind: "stats", cells: [cell(["3건"])] })), false);
});

test("추진성과 수치 칸: 머리 숫자·불릿 수량 토큰·차트 항목", () => {
  const b = blk({ kind: "stats", label: "추진성과", cells: [cell(["가짜 성과"], "31건"), cell(["정성 성과만"], ""), cell(["참여 5명 달성"], "")] });
  assert.equal(perfCells([b]), 2);
  assert.equal(perfCells([blk({ kind: "chart", label: "추진성과", series: [{ label: "’25", value: "2만" }, { label: "’26", value: "없음" }] })]), 1);
  assert.equal(perfCells([blk({ items: ["3건"] })]), 0);
});

test("계획 블록: 글이 모두 계획 표지 — 계획 대비 결과는 계획 아님", () => {
  assert.equal(isPlanBlock(blk({ label: "향후", items: ["’26.12월까지 확대 예정", "내년 계획 수립 예정"] })), true);
  assert.equal(isPlanBlock(blk({ label: "향후", items: ["확대 예정", "이미 달성한 3건"] })), false);
  assert.equal(isPlanBlock(blk({ items: ["계획 대비 3배 달성"] })), false);
  assert.equal(isPlanBlock(blk({})), false);
});

test("프로필 셈과 기준 비교", () => {
  const blocks = [
    blk({ items: ["가짜 불릿 열두 글자 넘게 적음", "또 다른 가짜 불릿 하나를 적음"] }),
    blk({ kind: "table", cells: [cell(["3건", "4건"], "행")] }),
    blk({ kind: "stats", label: "추진성과", cells: [cell(["가짜"], "31건"), cell(["가짜"], "5명")] }),
    blk({ label: "향후", items: ["확대 예정"] }),
  ];
  const parts = [{ key: "a", title: "수단으로 31건 달성" }];
  const p = styleProfile({ blocks, at: ["a", "a", "a", "a"], parts }, ctx());
  const s = p.sections[0];
  assert.deepEqual([s.dataBlocks, s.perfCells, s.planBlocks, s.titleHasFigure], [1, 2, 1, true]);
  assert.equal(Math.round(p.volumePct ?? 0), 98);
  assert.equal(p.charsPerPage, p.visibleChars / 2);
  const c = styleChecks(p, { charsPerPage: 1, qtyPerPage: 1000, bulletChars: 5 });
  assert.equal(c.charsPerPage, true);
  assert.equal(c.qtyPerPage, false);
  assert.equal(c.bulletAvgLen, true);
  assert.equal(c.sections, false); // 절 1개
  assert.equal(c.dataBlocks && c.perfCells && c.planBlocks && c.volume, true);
  assert.equal(styleChecks(styleProfile({ blocks, at: ["a", "a", "a", "a"], parts }, ctx({ pages: null, heightMm: null })), { charsPerPage: 1, qtyPerPage: null, bulletChars: 5 }).charsPerPage, null);
});
