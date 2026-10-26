// 한글 HWPX 쓰기(hwpx-write.ts)·읽기(hwpx.ts): 원본 카드 59장을 배치 → HWPX → 다시 읽어 배치가 같은지(칸·크기·테두리/배경·글자/문단 모양·글·
// 줄 배치·도형 행렬·그림), 짜임이 한글 규칙(여백·탭 두 벌, 음수 위치, 번호 시작)대로인지 확인합니다.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { DOMParser } from "@xmldom/xmldom";
import { validateHwpx } from "kordoc";
import { writeHwpxPackage } from "../hwpx/postprocess.ts";
import { buildLayouts } from "../cards/layout-build.ts";
import { layoutHwpxFiles } from "../cards/layout-hwpx.ts";
import { readHwp5 } from "./hwp5.ts";
import { readHwpx } from "./hwpx.ts";
import { hwpxFiles, mmText, numberingStarts, positionMap } from "./hwpx-write.ts";
import { type CardLayout, extractCardLayouts } from "./layout.ts";
import type { CharPr, HwpDoc, Para, ParaPr } from "./model.ts";
import { cardSourceFile } from "../cards/file-names.ts";
import { NO_SEED_CARDS, seedCards } from "../testing/originals.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROOT = resolve(import.meta.dirname, "../..");
const file = (g: number) => join(ROOT, "data/cards/260916", cardSourceFile(g));
const has = [1, 2, 3].every((g) => existsSync(file(g)));
const seed = { cards: seedCards() };
const dec = new TextDecoder();

// 비교용: 번호 대신 값(글자·문단 모양·테두리/배경), 키 차례 무시. 빈 채우기·무늬 없는 무늬 색·원값 비트(attr)는 뺌, 행렬 값은 한글처럼 소수 여섯째 자리
const noFill = (x: any) => x && typeof x === "object" && "pattern" in x && "gradation" in x && !x.color && !x.patternColor && !x.gradation && !x.image && x.pattern < 0;
const sorted = (v: any): any =>
  JSON.parse(
    JSON.stringify(v, (_k, x) =>
      noFill(x)
        ? null
        : typeof x === "number" && !Number.isInteger(x)
          ? Math.round(x * 1e6) / 1e6
          : x && typeof x === "object" && !Array.isArray(x)
          ? Object.fromEntries(
              Object.keys(x)
                .sort()
                .filter((k) => k !== "attr" && !(k === "patternColor" && x.pattern < 0))
                .map((k) => [k, x[k]]),
            )
          : x,
    ),
  );
function canon(l: CardLayout) {
  const cp = (i: number) => sorted({ ...l.charPrs[i], borderFill: l.borderFills[l.charPrs[i]?.borderFill] ?? null });
  const pp = (i: number) => {
    const v: any = { ...l.paraPrs[i] };
    v.borderFill = l.borderFills[v.borderFill] ?? null;
    v.tabDef = l.tabDefs[v.tabDef] ?? null;
    v.headingId = v.headingType === "BULLET" ? l.bullets[v.headingId - 1]?.char : v.headingType === "NONE" ? 0 : "N";
    return sorted(v);
  };
  const bf = (i: number) => sorted(l.borderFills[i] ?? null);
  const obj = (o: any): any => {
    if (o.kind === "table")
      return { ...o, borderFill: bf(o.borderFill), zones: (o.zones ?? []).map((z: any) => ({ ...z, borderFill: bf(z.borderFill) })), cells: o.cells.map((c: any) => ({ ...c, borderFill: bf(c.borderFill), paras: c.paras.map(para) })) };
    if (o.kind === "pic") return { ...o, pos: { ...o.pos, comment: String(o.pos.comment ?? "").replace(/\r\n/g, "\n") }, borderColor: o.borderWidth ? o.borderColor : null };
    return { ...o, text: o.text ? { ...o.text, paras: o.text.paras.map(para) } : null, children: o.children.map(obj) };
  };
  const para = (p: Para): any => {
    const at = positionMap(p);
    return {
      pp: pp(p.paraPr),
      pageBreak: p.pageBreak,
      head: p.head ?? null,
      end: p.endCharPr === undefined ? null : cp(p.endCharPr),
      lines: p.lines.map((x) => ({ ...x, textpos: at(x.textpos) })),
      items: p.items.map((it: any) => {
        const pos = at(it.pos);
        if (it.kind === "obj") return { kind: "obj", pos, cp: cp(it.charPr), o: obj(it.obj) };
        if (it.kind === "compose") return { ...it, pos, charPr: cp(it.charPr), charPrs: it.charPrs.map((c: number) => (c >= 0 ? cp(c) : -1)) };
        return { ...it, pos, charPr: cp(it.charPr) };
      }),
    };
  };
  return sorted({
    page: l.page,
    faces: Object.keys(l.faces).sort(),
    lead: l.lead?.kind === "table" ? obj(l.lead.table) : null,
    blocks: l.blocks.map((b, i) =>
      b.kind === "table"
        ? { t: obj(b.table), host: b.host ? { ...b.host, paraPr: pp(b.host.paraPr), charPr: cp(b.host.charPr), endCharPr: b.host.endCharPr === undefined ? null : cp(b.host.endCharPr), pageBreak: i === 0 ? null : Boolean(b.host.pageBreak) } : null }
        : { p: para(b.para) },
    ),
  });
}

const all = (() => {
  const out: { g: number; card: any; layout: CardLayout; orig: CardLayout; images: Map<string, { data: Uint8Array; ext: string }> }[] = [];
  if (!has) return out;
  for (const g of [1, 2, 3]) {
    const cards = seed.cards.filter((c) => c.id.startsWith(`주요사업${g}/`));
    const doc = readHwp5(readFileSync(file(g)));
    const orig = extractCardLayouts(doc);
    for (const b of buildLayouts(doc, cards).built)
      out.push({ g, card: cards[b.index], layout: b.layout, orig: orig[b.index] ?? orig.find((o) => JSON.stringify(o.blocks[0]).includes(`과제번호 : ${cards[b.index].taskNo}`))!, images: new Map(b.images.map((im) => [im.key, { data: im.data, ext: im.key.split(".").pop()! }])) });
  }
  return out;
})();

test("59장: 원본 배치 → HWPX → 다시 읽은 배치가 원본과 같음(칸·크기·테두리/배경·모양·글·줄 배치·도형 행렬·그림·글자 겹침)", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  assert.equal(all.length, 59);
  for (const x of all) {
    const files = layoutHwpxFiles(x.card, x.layout, x.images)!;
    const back = extractCardLayouts(await readHwpx((await writeHwpxPackage(files)).bytes));
    assert.equal(back.length, 1, `${x.g}/${x.card.taskNo}`);
    assert.deepEqual(canon(back[0]), canon(x.orig), `${x.g}/${x.card.taskNo}`);
  }
});

test("원본처럼 꼬리말(쪽 번호 자동 번호)·쪽 번호 위치를 한글 파일에 쓰고, 다시 읽으면 같음", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  const x = all.find((y) => y.g === 3 && y.card.taskNo === "6-가")!;
  const files = layoutHwpxFiles(x.card, x.layout, x.images)!;
  const sec = dec.decode(files.get("Contents/section0.xml")!);
  assert.match(sec, /<hp:footer id="\d+" applyPageType="BOTH"><hp:subList [^>]*vertAlign="BOTTOM"[^>]*>.*<hp:autoNum num="1" numType="PAGE">/);
  assert.match(sec, /<hp:pageNum pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="-"\/>/);
  const back = extractCardLayouts(await readHwpx((await writeHwpxPackage(files)).bytes))[0];
  const items = (l: CardLayout) => l.footer?.paras.map((p) => p.items.map((i: any) => (i.kind === "text" ? i.text + (i.attrs ?? "") : i.kind)));
  assert.deepEqual(items(back), items(x.orig));
  assert.equal(back.pageNum?.position, 5);
  const v: any = await (validateHwpx as any)(Buffer.from((await writeHwpxPackage(files)).bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});

test("HWPX 짜임: 머리·본문·목록이 올바른 XML, kordoc 검사 통과, 그림은 BinData에 담김", { skip: NO_SEED_CARDS || (!has && "원본 한글 파일 없음") }, async () => {
  const x = all.find((y) => y.g === 1 && y.card.taskNo === "1-가")!;
  const files = layoutHwpxFiles(x.card, x.layout, x.images)!;
  for (const name of ["Contents/header.xml", "Contents/section0.xml", "Contents/content.hpf", "META-INF/container.xml"]) {
    const errors: string[] = [];
    new DOMParser({ onError: (level: string, msg: string) => void (level !== "warning" && errors.push(msg)) }).parseFromString(dec.decode(files.get(name)!), "text/xml");
    assert.deepEqual(errors, [], name);
  }
  const bins = [...files.keys()].filter((k) => k.startsWith("BinData/"));
  assert.ok(bins.length > 0 && bins.every((k) => /\.(png|jpg)$/.test(k)), "그림은 웹 형식으로");
  const hpf = dec.decode(files.get("Contents/content.hpf")!);
  for (const k of bins) assert.ok(hpf.includes(`href="${k}"`), `목록에 ${k}`);
  const { bytes } = await writeHwpxPackage(files);
  const v: any = await (validateHwpx as any)(Buffer.from(bytes));
  assert.equal(v.ok, true, JSON.stringify(v.issues));
});

// ───────────────────────── 작은 문서로 한글 규칙

const charPr = (over: Partial<CharPr> = {}): CharPr => ({
  height: 1000,
  face: Array(7).fill("함초롬바탕"),
  ratio: Array(7).fill(100),
  spacing: Array(7).fill(0),
  relSize: Array(7).fill(100),
  offset: Array(7).fill(0),
  bold: false,
  italic: false,
  underline: "",
  underlineColor: null,
  strike: false,
  strikeColor: null,
  supscript: false,
  subscript: false,
  outline: false,
  shadow: "",
  shadowColor: null,
  shadowX: 0,
  shadowY: 0,
  emboss: false,
  engrave: false,
  color: "#000000",
  shade: null,
  kerning: false,
  useFontSpace: false,
  borderFill: 0,
  ...over,
});
const paraPr = (over: Partial<ParaPr> = {}): ParaPr => ({
  align: "JUSTIFY",
  breakLatin: "KEEP_WORD",
  breakNonLatin: "KEEP_WORD",
  condense: 0,
  lineSpacingType: "PERCENT",
  lineSpacing: 160,
  left: 0,
  right: 0,
  indent: 0,
  before: 0,
  after: 0,
  vertAlign: "BASELINE",
  snapToGrid: true,
  fontLineHeight: false,
  keepWithNext: false,
  borderFill: 0,
  borderOffset: [0, 0, 0, 0],
  tabDef: 0,
  headingType: "NONE",
  headingId: 0,
  headingLevel: 0,
  autoSpaceEAsianEng: false,
  autoSpaceEAsianNum: false,
  ...over,
});
const tinyDoc = (over: Partial<HwpDoc> = {}): HwpDoc => ({ format: "hwp", faces: {}, charPrs: [charPr()], paraPrs: [paraPr()], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [], ...over });
const page = { width: 59528, height: 84186, left: 5669, right: 5669, top: 4251, bottom: 4251, header: 2834, footer: 2834, gutter: 0, landscape: false };
const para = (text: string, over: Partial<Para> = {}): Para => ({ paraPr: 0, style: 0, items: [{ kind: "text", pos: 0, charPr: 0, text }], lines: [], length: text.length + 1, pageBreak: false, ...over });

test("여백·들여쓰기·탭 위치: HWPUNIT(hp:case HwpUnitChar)과 2배(hp:default)를 함께 적고, 다시 읽으면 HWPUNIT", async () => {
  const doc = tinyDoc({ paraPrs: [paraPr({ left: 1500, indent: -700, before: 60 })], tabDefs: [{ autoLeft: false, autoRight: false, stops: [{ pos: 36836, kind: "RIGHT", leader: 0 }] }] });
  const files = hwpxFiles({ doc, page, paras: [para("가")], images: new Map() });
  const head = dec.decode(files.get("Contents/header.xml")!);
  assert.match(head, /<hp:case [^>]*HwpUnitChar"><hh:margin><hc:intent value="-700" unit="HWPUNIT"\/><hc:left value="1500"/);
  assert.match(head, /<hp:default><hh:margin><hc:intent value="-1400" unit="HWPUNIT"\/><hc:left value="3000"/);
  assert.match(head, /<hh:tabItem pos="36836" type="RIGHT" leader="NONE" unit="HWPUNIT"\/><\/hp:case><hp:default><hh:tabItem pos="73672"/);
  const back = await readHwpx((await writeHwpxPackage(files)).bytes);
  assert.deepEqual([back.paraPrs[0].left, back.paraPrs[0].indent, back.paraPrs[0].before, back.tabDefs[0].stops[0].pos], [1500, -700, 60, 36836]);
});

test("음수 위치·지금 크기는 부호 없는 32비트로 적고, 다시 읽으면 음수", async () => {
  const pos = { treatAsChar: true, affectLineSpacing: false, vertRelTo: "PARA" as const, horzRelTo: "PARA" as const, vertAlign: "TOP" as const, horzAlign: "LEFT" as const, vertOffset: -487, horzOffset: 0, width: 2443, height: 522, wrap: "TOP_AND_BOTTOM" as const, zOrder: 1, outMargin: [0, 0, 0, 0] as [number, number, number, number] };
  const rect = { kind: "rect" as const, pos, curW: 2443, curH: -800, x: 0, y: 521, line: null, fill: null, round: 10, shadow: null, text: null, children: [], points: [], geo: { orgW: 1293, orgH: 940, flipH: false, flipV: false, angle: 0, cx: 1221, cy: 400, trans: [1, 0, 0, 0, 1, 521], pairs: [[[1.889404, 0, 0, 0, -0.851064, 279], [1, 0, 0, 0, 1, 0]]] as [number[], number[]][], groupLevel: 0 } };
  const files = hwpxFiles({ doc: tinyDoc(), page, paras: [{ ...para(""), items: [{ kind: "obj", pos: 0, charPr: 0, obj: rect }] }], images: new Map() });
  const sec = dec.decode(files.get("Contents/section0.xml")!);
  assert.match(sec, /<hp:curSz width="2443" height="4294966496"\/>/);
  assert.match(sec, /vertOffset="4294966809"/);
  assert.match(sec, /<hc:scaMatrix e1="1.889404" e2="0" e3="0" e4="0" e5="-0.851064" e6="279"\/>/);
  const back = await readHwpx((await writeHwpxPackage(files)).bytes);
  const o: any = back.sections[0].paras[0].items.find((it) => it.kind === "obj");
  assert.deepEqual([o.obj.curH, o.obj.pos.vertOffset, o.obj.geo.pairs[0][0][4]], [-800, -487, -0.851064]);
});

test("번호: 원본 문서에서 이어 센 번호(다.)는 그 수준의 시작 번호로 맞춰 한 장만 써도 같은 번호", () => {
  const nb = { levels: [{ head: { align: "LEFT" as const, instWidth: true, autoIndent: true, widthAdjust: 0, textOffset: 50, textOffsetPercent: true, numFormat: 8, charPr: -1 }, format: "^1." }], start: 1 };
  const doc = tinyDoc({ numberings: [nb], paraPrs: [paraPr({ headingType: "NUMBER", headingId: 1, headingLevel: 0 })] });
  const ps = [para("a", { head: "다." }), para("b", { head: "라." })];
  assert.deepEqual(numberingStarts(doc, ps), [[3]]);
  const head = dec.decode(hwpxFiles({ doc, page, paras: ps, images: new Map() }).get("Contents/header.xml")!);
  assert.match(head, /<hh:paraHead start="3" level="1"[^>]*numFormat="HANGUL_SYLLABLE"[^>]*>\^1\.<\/hh:paraHead>/);
  assert.deepEqual(numberingStarts(doc, [para("a", { head: "가." })]), [[1]], "처음부터 세던 번호는 그대로");
});

test("줄 배치 위치: 읽지 않은 조종 문자(8칸) 자리만큼 당기고, 글이 바뀐 문단은 줄 배치를 빼서 한글이 다시 조판", () => {
  const p = para("", { items: [{ kind: "text", pos: 8, charPr: 0, text: "가나다" }], lines: [{ textpos: 0, vertpos: 0, vertsize: 1000, textheight: 1000, baseline: 850, spacing: 600, horzpos: 0, horzsize: 1000, flags: 0 }, { textpos: 10, vertpos: 1600, vertsize: 1000, textheight: 1000, baseline: 850, spacing: 600, horzpos: 0, horzsize: 1000, flags: 0 }] });
  const at = positionMap(p);
  assert.deepEqual([at(0), at(8), at(10)], [0, 0, 2]);
  const sec = (q: Para) => dec.decode(hwpxFiles({ doc: tinyDoc(), page, paras: [para("앞"), q], images: new Map() }).get("Contents/section0.xml")!);
  assert.match(sec(p), /<hp:lineseg textpos="2" vertpos="1600"/);
  assert.ok(!sec({ ...p, flow: true }).includes('vertpos="1600"'), "흘려 그린 문단은 줄 배치 없음");
  assert.equal(mmText(0.12), "0.12 mm");
  assert.equal(mmText(1), "1.0 mm");
});

test("글 속 묶음 빈칸·고정폭 빈칸은 한글 요소로, 글자 겹침은 hp:compose로", async () => {
  const p: Para = { ...para(""), items: [{ kind: "compose", pos: 0, charPr: 0, chars: "∙　", border: 0, size: -4, spread: 1, charPrs: [0, -1] }, { kind: "text", pos: 8, charPr: 0, text: "가 나 다" }] };
  const sec = dec.decode(hwpxFiles({ doc: tinyDoc(), page, paras: [p], images: new Map() }).get("Contents/section0.xml")!);
  assert.match(sec, /<hp:compose circleType="CHAR" charSz="-4" composeType="OVERLAP" charPrCnt="2" composeText="∙　"><hp:charPr prIDRef="0"\/><hp:charPr prIDRef="4294967295"\/><\/hp:compose>/);
  assert.match(sec, /<hp:t>가<hp:nbSpace\/>나<hp:fwSpace\/>다<\/hp:t>/);
  const back = await readHwpx((await writeHwpxPackage(hwpxFiles({ doc: tinyDoc(), page, paras: [p], images: new Map() }))).bytes);
  const items = back.sections[0].paras[0].items;
  assert.deepEqual(
    items.map((it) => (it.kind === "text" ? it.text : it.kind === "compose" ? `[${it.chars}|${it.spread}]` : it.kind)),
    ["[∙　|1]", "가 나 다"],
  );
});
