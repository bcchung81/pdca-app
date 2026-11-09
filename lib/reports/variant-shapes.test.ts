// 모양 변형 뒤 절반 시험 — 2026-11-09, 경평 초안 프레임워크 확장 계획 P4(뒤 절반): PDCA 5·6칸, 우수사례 STEP 흐름·인용형(case:steps·quote),
// 협업 가로형·수렴형(hub:row·converge), 2단 라벨 흐름 표(table:cascade — 묶음 사이 ▼).
// 지키는 것: 정리(cleanBlocks)의 되돌림(칸 모자람·원문에 없는 인용·묶음 하나 → 예전 모양), 경영관리는 PDCA 4칸 그대로(cellRange·cleanBlocks·블록 고치기 모양 목록),
// 그리기(section-html)·판면 어림(fit)·원고(section-md)가 같은 판정, 새 모양은 주요사업 전용(경영관리 목록은 block-shape·composition·outline-view 시험).
// 모양이 없는 pdca 4칸·case·hub·ladder 출력이 예전 그대로인지는 strategy-pdca·section-hwpx·render 시험과 아래 「예전 출력」 시험이 봄.

import assert from "node:assert/strict";
import { test } from "node:test";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Block, type BlockCell, type BlockOutput, PDCA_RING, VARIANTS, caseLabel, cleanBlocks, isGridTable, isLadderTable, pdcaMark } from "./blocks.ts";
import { SHAPE_GAP_MM, blockHeight, blockWidth, canonicalBlock, hollowBoxes, slotOf } from "./fit.ts";
import { BIZ_ONLY_SHAPES, SHAPES, cellRange, clampCells, defaultCells } from "./frameworks.ts";
import { checkBlock, shapeMenuText } from "./block-edit.ts";
import { type ReportSectionSpec, priorQuoteIssues, sourceKey } from "./section.ts";
import { blocksSampleHtml } from "./section-html.ts";
import { sectionMarkdown } from "./section-md.ts";

const out = (b: Omit<Partial<BlockOutput>, "kind"> & { kind: any }): BlockOutput => ({ label: "", title: "", variant: "", text: "", items: [], cells: [], rows: [], series: [], badge: "", evidence: "", figures: [], ...b }) as BlockOutput;
const cell = (head: string, bullets: string[] = [], o: Partial<BlockCell> = {}): BlockCell => ({ head, tag: "", bullets, note: "", ...o });
const blk = (kind: Block["kind"], variant: string, x: Partial<Block> = {}): Block => ({ kind, label: "", title: "", variant, text: "", items: [], cells: [], rows: [], series: [], badge: "", ...x });
const line = (s: unknown, max = 400) => String(s ?? "").trim().slice(0, max);
const clean = (xs: BlockOutput[], found: (s: string) => boolean = () => true, opts: { mg?: boolean } = {}) => cleanBlocks(xs, line, found, opts);
const spec = (blocks: Block[], mg = false): ReportSectionSpec =>
  ({ version: 3, card: { id: "x", taskNo: "1-가", title: "t" }, business: { no: 1, name: "b" }, task: { no: "1-1", title: "t", bp: false }, sub: { mark: "가", title: "제목", markers: [] }, rows: [], results: [], caption: "", blocks, module: 1, ...(mg ? { mg: {} } : {}) }) as ReportSectionSpec;
const md = (b: Block) => sectionMarkdown(spec([b])).md;
const six = ["계획", "실행", "점검", "개선", "확산", "정착"].map((h) => cell(h, [`${h} 글`]));
const NEW = ["case:steps", "case:quote", "hub:row", "hub:converge", "table:cascade"];

// ---------------------------------------------------------------------------
// 모양 목록·칸 범위

test("VARIANTS: case·hub 첫째는 빈 글(예전 상자 그대로) + 새 모양, table 끝에 cascade, SHAPES·주요사업 전용, 칸 범위·보통 칸 수", () => {
  assert.deepEqual(VARIANTS.case, ["", "steps", "quote"]);
  assert.deepEqual(VARIANTS.hub, ["", "row", "converge"]);
  assert.equal(VARIANTS.table?.at(-1), "cascade");
  for (const code of NEW) {
    const s = SHAPES.find((x) => x.code === code);
    assert.ok(s, code);
    assert.ok(BIZ_ONLY_SHAPES.includes(code), `${code}는 주요사업 전용`);
  }
  assert.equal(SHAPES.find((x) => x.code === "case:steps")!.group, "own", "우수사례·협업 모양은 이 과제만의 요소");
  assert.deepEqual(cellRange("case", "steps"), { min: 2, max: 4 });
  assert.deepEqual(cellRange("case", "quote"), { min: 2, max: 3 });
  assert.deepEqual(cellRange("hub", "row"), { min: 3, max: 5 });
  assert.deepEqual(cellRange("hub", "converge"), { min: 3, max: 5 });
  assert.deepEqual(cellRange("table", "cascade"), cellRange("table", "ladder"));
  assert.deepEqual([defaultCells("case", "steps"), defaultCells("case", "quote"), defaultCells("hub", "row"), defaultCells("hub", "converge"), defaultCells("table", "cascade")], [3, 2, 3, 4, 4]);
  assert.ok(isLadderTable({ kind: "table", variant: "cascade" }) && !isGridTable({ kind: "table", variant: "cascade" }), "흐름 표는 2단 라벨 칸(값 열 표 아님)");
});

test("PDCA 칸 수: 주요사업 4~6, 경영관리(mg) 4 그대로 — clampCells·블록 고치기 모양 목록 글도 트랙대로", () => {
  assert.deepEqual(cellRange("pdca"), { min: 4, max: 6 });
  assert.deepEqual(cellRange("pdca", "", true), { min: 4, max: 4 });
  assert.equal(clampCells("pdca", "", 6), 6);
  assert.equal(clampCells("pdca", "", 6, true), 4);
  const s = spec([blk("cards", "plain", { label: "라벨", cells: [cell("가", ["a"]), cell("나", ["b"]), cell("다", ["c"]), cell("라", ["d"]), cell("마", ["e"])] })]);
  assert.match(shapeMenuText(s, 0, { mg: false, avail: {} }).shapes, /pdca PDCA 순환\(4~6개/);
  const mg = shapeMenuText({ ...s, mg: {} as any }, 0, { mg: true, avail: {} }).shapes;
  assert.match(mg, /pdca PDCA 순환\(4개/);
  for (const code of BIZ_ONLY_SHAPES) assert.ok(!mg.includes(`${code} `), `경영관리 목록에 ${code} 없음`);
});

// ---------------------------------------------------------------------------
// 코드가 정하는 값·정리

test("pdcaMark: 4칸은 P·D·C·A(예전 그대로), 5·6칸은 칩이 비거나 길면 칸 번호, 두 글자 이하 칩은 그대로 · 6칸 고리 자리", () => {
  assert.deepEqual([0, 1, 2, 3].map((i) => pdcaMark("", i)), ["P", "D", "C", "A"]);
  assert.deepEqual([0, 1, 2, 3].map((i) => pdcaMark("", i, 4)), ["P", "D", "C", "A"]);
  assert.deepEqual([0, 1, 2, 3, 4].map((i) => pdcaMark("", i, 5)), ["1", "2", "3", "4", "5"]);
  assert.equal(pdcaMark("Step 6", 5, 6), "6");
  assert.equal(pdcaMark("F", 5, 6), "F");
  assert.deepEqual(PDCA_RING.map(([r, c]) => `${r}${c}`), ["00", "01", "02", "12", "11", "10"], "위 줄 1·2·3, 아래 줄 4(3 아래)·5·6");
  assert.deepEqual(caseLabel("접수 | 아이디어 120건"), { label: "접수", text: "아이디어 120건" });
  assert.equal(caseLabel("그냥 글"), null);
});

test("cleanBlocks pdca: 주요사업 5·6칸은 그대로(7칸이면 6칸까지), 경영관리(mg)는 4칸까지 자름(예전 그대로), 3칸은 단계 흐름", () => {
  const seven = [...six, cell("일곱", ["x"])];
  assert.deepEqual(clean([out({ kind: "pdca", cells: six.slice(0, 5) }), out({ kind: "pdca", cells: seven })]).blocks.map((b) => [b.kind, b.cells.length]), [["pdca", 5], ["pdca", 6]]);
  assert.deepEqual(clean([out({ kind: "pdca", cells: six })], () => true, { mg: true }).blocks.map((b) => [b.kind, b.cells.length]), [["pdca", 4]]);
  assert.equal(clean([out({ kind: "pdca", cells: six.slice(0, 3) })]).blocks[0].kind, "steps");
  // 블록 고치기(checkBlock): 경영관리 규칙이면 4칸, 주요사업이면 6칸
  const before = blk("pdca", "", { cells: six.slice(0, 4) });
  const mg = checkBlock(before, out({ kind: "pdca", cells: six }), line, () => true, { mg: true, avail: {} });
  const biz = checkBlock(before, out({ kind: "pdca", cells: six }), line, () => true, { mg: false, avail: {} });
  assert.ok(mg.ok && biz.ok);
  if (mg.ok && biz.ok) assert.deepEqual([mg.block.cells.length, biz.block.cells.length], [4, 6]);
});

test("cleanBlocks case: STEP 흐름은 2~4줄(1줄이면 예전 상자), 인용형은 첫 줄 인용을 원문에서 찾아야(못 찾으면 그 줄을 빼고 예전 상자) + 결과 줄이 있어야", () => {
  const ev = { evidence: "근거 원문" };
  assert.deepEqual(clean([out({ kind: "case", variant: "steps", title: "t", items: ["a", "b", "c", "d", "e"], ...ev })]).blocks[0].items.length, 4);
  assert.equal(clean([out({ kind: "case", variant: "steps", title: "t", items: ["a"], ...ev })]).blocks[0].variant, "");
  const hay = sourceKey("현장 검사관은 판독이 정말 빨라졌다고 말했다");
  const found = (q: string) => sourceKey(q).length >= 6 && hay.includes(sourceKey(q));
  const ok = clean([out({ kind: "case", variant: "quote", title: "t", items: ["검사관 | “판독이 정말 빨라졌다”", "우수기관 선정", "셋째", "넷째"], evidence: "현장 검사관은" })], found);
  assert.equal(ok.blocks[0].variant, "quote");
  assert.equal(ok.blocks[0].items.length, 3, "인용 + 결과 2줄까지");
  const bad = clean([out({ kind: "case", variant: "quote", title: "t", items: ["지어낸 인용 문장입니다", "우수기관 선정", "둘째 결과"], evidence: "현장 검사관은" })], found);
  assert.equal(bad.blocks[0].variant, "");
  assert.deepEqual(bad.blocks[0].items, ["우수기관 선정", "둘째 결과"], "찾지 못한 인용 줄만 뺌");
  assert.match(bad.dropped.join(" "), /찾지 못한 인용 1개/);
  assert.equal(clean([out({ kind: "case", variant: "quote", title: "t", items: ["판독이 정말 빨라졌다"], evidence: "현장 검사관은" })], found).blocks[0].variant, "", "결과 줄이 없으면 예전 상자");
});

test("cleanBlocks hub·table: 가로형·수렴형은 가운데 + 기관 둘 이상(모자라면 예전 협업 구조), 흐름 표는 큰 라벨 묶음이 하나면 2단 라벨 표로", () => {
  const hub = (variant: string, n: number) => clean([out({ kind: "hub", variant, cells: ["KCA", "가", "나", "다"].slice(0, n).map((h) => cell(h, ["역할"])) })]).blocks[0];
  assert.equal(hub("row", 3).variant, "row");
  assert.equal(hub("converge", 4).variant, "converge");
  assert.equal(hub("row", 2).variant, "");
  const cas = (heads: string[]) => clean([out({ kind: "table", variant: "cascade", cells: heads.map((h) => cell(h, ["내용"])) })]).blocks[0];
  assert.equal(cas(["현황", "", "조치"]).variant, "cascade");
  assert.equal(cas(["현황", "", "현황"]).variant, "ladder");
});

// ---------------------------------------------------------------------------
// 그리기

test("PDCA HTML: 5칸은 한 줄(k-pdca--5·▶ 넷·번호 표지), 6칸은 고리(k-pdca--6 — 칸 자리 grid-area·▶▶▼◀◀▲·환류 띠)", () => {
  const h5 = blocksSampleHtml([blk("pdca", "", { cells: six.slice(0, 5) })]);
  assert.match(h5, /<div class="k-pdca k-pdca--5">/);
  assert.equal((h5.match(/class="k-join"[^>]*>▶</g) ?? []).length, 4);
  assert.deepEqual([...h5.matchAll(/k-pdca__m">([^<]*)</g)].map((m) => m[1]), ["1", "2", "3", "4", "5"]);
  const h6 = blocksSampleHtml([blk("pdca", "", { text: "점검 결과를 다음 계획에", cells: six })]);
  assert.match(h6, /<div class="k-pdca k-pdca--6">/);
  assert.deepEqual([...h6.matchAll(/<div class="k-card" style="grid-area:(\d\/\d)">/g)].map((m) => m[1]), ["1/1", "1/3", "1/5", "3/5", "3/3", "3/1"]);
  assert.deepEqual([...h6.matchAll(/k-join" aria-hidden="true" style="grid-area:\d\/\d">([^<])</g)].map((m) => m[1]), ["▶", "▶", "▼", "◀", "◀", "▲"]);
  assert.match(h6, /k-pdca__fb">↺ 점검 결과를 다음 계획에/);
  // 4칸은 예전 그대로(수정자·grid-area 없음, P·D·C·A)
  const h4 = blocksSampleHtml([blk("pdca", "", { cells: six.slice(0, 4) })]);
  assert.match(h4, /<div class="k-pdca"><div class="k-card"><div class="k-card__h"><span class="k-pdca__m">P<\/span>/);
  assert.doesNotMatch(h4, /k-pdca--|grid-area/);
});

test("우수사례 HTML: STEP 흐름은 단계 칸(STEP n 띠 + 「단계 이름」 굵게) 사이 ▶, 인용형은 화자 칩 + “인용” + 결과 띠, 모양 없으면 예전 줄 목록", () => {
  const st = blocksSampleHtml([blk("case", "steps", { title: "공모전 대상", items: ["접수 | 아이디어 120건", "심사 2차", "시상"] })]);
  assert.match(st, /<ol class="k-case__steps" style="grid-template-columns:minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\) 3\.5mm minmax\(0,1fr\)">/);
  assert.match(st, /<li class="k-case__st"><b class="k-case__sn">STEP 1<\/b><b class="k-case__sl">접수<\/b> 아이디어 /);
  assert.match(st, /<b class="k-case__sn">STEP 2<\/b>심사 2차/);
  assert.equal((st.match(/<li class="k-join" aria-hidden="true">▶<\/li>/g) ?? []).length, 2);
  const q = blocksSampleHtml([blk("case", "quote", { title: "현장 호평", items: ["현장 검사관 | “판독이 빨라졌다”", "’26 우수기관 선정"] })]);
  assert.match(q, /<p class="k-case__q"><span class="k-tag">현장 검사관<\/span>“판독이 빨라졌다”<\/p><p class="k-case__res">/);
  assert.doesNotMatch(q, /““/, "AI가 붙인 따옴표는 걷고 한 번만");
  const plain = blocksSampleHtml([blk("case", "", { title: "t", items: ["수상명 | 대상", "그 밖"] })]);
  assert.match(plain, /<div class="k-case__b"><ul><li class="k-case__kv"><span class="k-tag">수상명<\/span>대상<\/li><li>그 밖<\/li><\/ul><\/div>/);
});

test("협업 HTML: 가로형은 앞 절반 기관 · 손 잡기 · 가운데 · 손 잡기 · 뒤 절반(열 비는 판면 어림과 같음), 수렴형은 기관 줄 → ▼ → 가운데 결과 칸", () => {
  const cells = [cell("KCA", ["공동 결과"]), cell("과기정통부", ["정책"]), cell("지자체", ["현장"]), cell("통신 3사", ["투자"]), cell("제조사", ["단말"])];
  const row = blocksSampleHtml([blk("hub", "row", { cells })]);
  assert.match(row, /<div class="k-hub k-hub--row" style="grid-template-columns:minmax\(0,1fr\) 3mm minmax\(0,1fr\) 9mm minmax\(0,1\.2fr\) 9mm minmax\(0,1fr\) 3mm minmax\(0,1fr\)">/);
  assert.deepEqual([...row.matchAll(/<h6 class="k-hub__name">([^<]*)</g)].map((m) => m[1]), ["과기정통부", "지자체", "KCA", "통신 3사", "제조사"]);
  const conv = blocksSampleHtml([blk("hub", "converge", { cells: cells.slice(0, 4) })]);
  assert.match(conv, /<div class="k-hubc"><div class="k-hubc__nodes" style="grid-template-columns:repeat\(3,minmax\(0,1fr\)\)">/);
  assert.match(conv, /<div class="k-hubc__arr" aria-hidden="true">▼<\/div><section class="k-hub__node k-hub__node--center"><h6 class="k-hub__name">KCA<\/h6>/);
  // 기관 둘인 가로형의 칸 폭은 예전 협업 구조와 같음
  assert.deepEqual(slotOf(blk("hub", "row", { cells: cells.slice(0, 3) }), 150), slotOf(blk("hub", "", { cells: cells.slice(0, 3) }), 150));
});

test("흐름 표 HTML: 큰 라벨 묶음 사이에만 ▼ 줄(열 수만큼 합침), 2단 라벨 표는 ▼ 없음 — 높이는 ▼ 줄마다 SHAPE_GAP_MM.ladderArrow", () => {
  const cells = [cell("현황", ["가"], { tag: "하위1" }), cell("", ["나"], { tag: "하위2" }), cell("조치", ["다"], { tag: "하위3" }), cell("성과", ["라"])];
  const h = blocksSampleHtml([blk("table", "cascade", { cells })]);
  assert.equal((h.match(/<tr class="k-lad__arr" aria-hidden="true"><td colspan="3">▼<\/td><\/tr>/g) ?? []).length, 2);
  const lad = blocksSampleHtml([blk("table", "ladder", { cells })]);
  assert.doesNotMatch(lad, /k-lad__arr/);
  assert.equal(h.replace(/<tr class="k-lad__arr"[^]*?<\/tr>/g, ""), lad, "▼ 줄을 빼면 2단 라벨 표와 같은 글");
  const w = 150;
  assert.equal(Math.round((blockHeight(blk("table", "cascade", { cells }), w) - blockHeight(blk("table", "ladder", { cells }), w)) * 1000) / 1000, 2 * SHAPE_GAP_MM.ladderArrow);
});

// ---------------------------------------------------------------------------
// 판면 어림 기준값·빈 칸

test("판면 어림 기준값(보통 모양 — canonicalBlock): PDCA 4·5칸 37mm·6칸 고리 72mm, 우수사례 25mm(예전 3줄)·27mm(STEP 3단계)·27mm(인용 + 결과 1줄), 협업 가로형 30mm(3칸)·수렴형 60mm(4칸), 흐름 표 53mm(4행 — 2단 라벨 표 49mm + ▼ 한 줄)", () => {
  const mm = (kind: Block["kind"], variant: string, n = defaultCells(kind, variant), label = "라벨") => {
    const b = canonicalBlock(kind, variant, n, label);
    return Math.round(blockHeight(b, blockWidth(b)));
  };
  assert.deepEqual([mm("pdca", "", 4), mm("pdca", "", 5), mm("pdca", "", 6)], [37, 37, 72]);
  assert.deepEqual([mm("case", "", 3, ""), mm("case", "steps", 3, ""), mm("case", "quote", 2, ""), mm("case", "quote", 3, "")], [25, 27, 27, 33]);
  assert.deepEqual([mm("hub", "", 3), mm("hub", "row", 3), mm("hub", "row", 5), mm("hub", "converge", 4)], [30, 30, 30, 60]);
  assert.deepEqual([mm("table", "ladder", 4), mm("table", "cascade", 4)], [49, 53]);
  // 견본은 모양대로 그려짐(보통 칸 수가 모양 범위 안)
  assert.equal(canonicalBlock("pdca", "", 6, "").cells.length, 6);
  assert.equal(canonicalBlock("case", "steps", 3, "").items.length, 3);
  assert.match(blocksSampleHtml([canonicalBlock("case", "steps", 3, "")]), /STEP 3/);
  assert.match(blocksSampleHtml([canonicalBlock("table", "cascade", 4, "")]), /k-lad__arr/);
});

test("PDCA 6칸 고리: 칸 폭은 세 칸 폭, 높이는 두 줄(긴 글은 그 줄만 높임), 빈 칸 비교는 줄마다(위 1~3 · 아래 4~6)", () => {
  const w = 150;
  const s4 = slotOf(blk("pdca", "", { cells: six.slice(0, 4) }), w);
  const s6 = slotOf(blk("pdca", "", { cells: six }), w);
  assert.ok(s6.body > s4.body * 1.3, "세 칸 폭이 네 칸 폭보다 넓음");
  const b6 = blk("pdca", "", { label: "순환", cells: six });
  assert.ok(blockHeight(b6, w) > blockHeight(blk("pdca", "", { label: "순환", cells: six.slice(0, 4) }), w) * 1.6, "두 줄");
  // 위 줄이 길고 아래 줄이 짧으면 아래 줄끼리는 빈 칸이 아님
  const long = "가".repeat(120);
  const top = six.map((c, i) => (i < 3 ? { ...c, bullets: [long] } : c));
  const hollow = hollowBoxes([blk("pdca", "", { label: "순환", cells: top })]);
  assert.deepEqual(hollow, [], "위 줄 셋은 같이 길고 아래 줄 셋은 같이 짧음");
});

// ---------------------------------------------------------------------------
// 원고·전년 인용

test("원고: PDCA 6칸은 번호 표지로 칸 차례대로, STEP 흐름 「STEP n 」, 인용형 “인용” + → 결과, 수렴형은 기관 뒤 [결과], 흐름 표는 묶음 사이 ▼ 행", () => {
  const p = md(blk("pdca", "", { cells: six }));
  assert.match(p, /ㅇ \*\*\[1\] 계획\*\*/);
  assert.match(p, /ㅇ \*\*\[6\] 정착\*\*/);
  const st = md(blk("case", "steps", { title: "공모전", items: ["접수 | 120건", "심사"] }));
  assert.match(st, /- STEP 1 접수 \| 120건/);
  assert.match(st, /- STEP 2 심사/);
  const q = md(blk("case", "quote", { title: "호평", items: ["검사관 | 빨라졌다", "우수기관 선정"] }));
  assert.match(q, /- 검사관: “빨라졌다”/);
  assert.match(q, /- → 우수기관 선정/);
  const c = md(blk("hub", "converge", { cells: [cell("공동 결과", ["120곳"]), cell("기관 A", ["측정"])] }));
  assert.ok(c.indexOf("기관 A") < c.indexOf("[결과] 공동 결과"), c);
  const t = md(blk("table", "cascade", { cells: [cell("현황", ["가"]), cell("조치", ["나"])] }));
  assert.match(t, /\| 현황 \| 가 \|\n\| ▼ \| +\|\n\| 조치 \| 나 \|/);
});

test("전년 인용: 우수사례 인용형의 인용 줄(「화자 | 인용」이면 인용 글)도 2025 보고서 글에서만 찾으면 알림", () => {
  const b = blk("case", "quote", { title: "호평", items: ["검사관 | 판독 속도가 두 배로 빨라졌다", "’25 우수기관 선정"] });
  const past = "2025 보고서: 판독 속도가 두 배로 빨라졌다는 평가";
  assert.match(priorQuoteIssues([b], [], past, sourceKey("올해 카드 글"))[0] ?? "", /전년 인용: 「판독 속도가 두 배로 빨라졌다」/);
  assert.deepEqual(priorQuoteIssues([b], [], past, sourceKey("올해도 판독 속도가 두 배로 빨라졌다")), []);
});
