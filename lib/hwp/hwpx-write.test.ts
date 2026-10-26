// hwpx-write.ts 직접 시험: 값 적기 도우미와 hwpxFiles(작은 문서 → 파일 묶음)의 짜임·이스케이프·그림 처리·꼬리말·쪽 번호.
// 원본 카드 59장 왕복은 hwpx.test.ts가 봅니다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { type HwpxInput, hwpxFiles, isPageField, mmText, numberingStarts, positionMap, xmlText } from "./hwpx-write.ts";
import type { CharPr, HwpDoc, Inline, ObjPos, Para, ParaPr, Pic } from "./model.ts";

const cp = (): CharPr => ({ height: 1000, face: Array(7).fill("함초롬바탕"), ratio: Array(7).fill(100), spacing: Array(7).fill(0), relSize: Array(7).fill(100), offset: Array(7).fill(0), bold: false, italic: false, underline: "", underlineColor: null, strike: false, strikeColor: null, supscript: false, subscript: false, outline: false, shadow: "", shadowColor: null, shadowX: 0, shadowY: 0, emboss: false, engrave: false, color: "#000000", shade: null, kerning: false, useFontSpace: false, borderFill: 0 });
const pp = (): ParaPr => ({ align: "JUSTIFY", breakLatin: "KEEP_WORD", breakNonLatin: "KEEP_WORD", condense: 0, lineSpacingType: "PERCENT", lineSpacing: 160, left: 0, right: 0, indent: 0, before: 0, after: 0, vertAlign: "BASELINE", snapToGrid: true, fontLineHeight: false, keepWithNext: false, borderFill: 0, borderOffset: [0, 0, 0, 0], tabDef: 0, headingType: "NONE", headingId: 0, headingLevel: 0, autoSpaceEAsianEng: false, autoSpaceEAsianNum: false });
const doc = (): HwpDoc => ({ format: "hwp", faces: {}, charPrs: [cp()], paraPrs: [pp()], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: new Map(), sections: [] }) as unknown as HwpDoc;
const para = (items: Inline[], over: Partial<Para> = {}): Para => ({ paraPr: 0, style: 0, items, lines: [], length: 1, pageBreak: false, ...over });
const text = (t: string, pos = 0): Inline => ({ kind: "text", pos, charPr: 0, text: t });
const page = { width: 59528, height: 84188, left: 8504, right: 8504, top: 5668, bottom: 4252, header: 4252, footer: 4252, gutter: 0, landscape: false };
const pos: ObjPos = { treatAsChar: true, affectLineSpacing: false, vertRelTo: "PARA", horzRelTo: "PARA", vertAlign: "TOP", horzAlign: "LEFT", vertOffset: 0, horzOffset: 0, width: 1000, height: 1000, wrap: "TOP_AND_BOTTOM", zOrder: 0, outMargin: [0, 0, 0, 0] };
const pic = (bin: number): Pic => ({ kind: "pic", pos, orgW: 1000, orgH: 1000, curW: 1000, curH: 1000, crop: [0, 0, 1000, 1000], inMargin: [0, 0, 0, 0], bin, borderColor: null, borderWidth: 0, bright: 0, contrast: 0, effect: "REAL_PIC" });
const input = (paras: Para[], over: Partial<HwpxInput> = {}): HwpxInput => ({ doc: doc(), page, paras, images: new Map(), ...over });
const dec = new TextDecoder();
const read = (f: Map<string, Uint8Array>, path: string) => dec.decode(f.get(path)!);

test("xmlText: XML에서 못 쓰는 글자(조종 문자·서로게이트 짝 없음)는 빼고 &<>\" 는 이스케이프, 탭·줄바꿈은 남김", () => {
  assert.equal(xmlText(`a&b<c>"d"`), "a&amp;b&lt;c&gt;&quot;d&quot;");
  assert.equal(xmlText("a\u0000b\u0001c\u000bd￾e￿"), "abcde");
  assert.equal(xmlText("t\tn\nr\r"), "t\tn\nr\r");
  assert.equal(xmlText("한글😀"), "한글😀", "짝이 맞는 서로게이트(이모지)는 한 글자로 남김");
  assert.equal(xmlText(""), "");
});

test("mmText: 정수는 소수 한 자리, 0·비수는 0.1 mm, 소수 둘째 자리 반올림", () => {
  assert.equal(mmText(2), "2.0 mm");
  assert.equal(mmText(0), "0.1 mm");
  assert.equal(mmText(Number.NaN), "0.1 mm");
  assert.equal(mmText(0.125), "0.13 mm");
  assert.equal(mmText(0.4), "0.4 mm");
});

test("isPageField: 쪽 번호 자리표시 글만 참", () => {
  assert.equal(isPageField({ kind: "text", pos: 0, charPr: 0, text: "0", attrs: ' data-hw-field="page"' }), true);
  assert.equal(isPageField({ kind: "text", pos: 0, charPr: 0, text: "0" }), false);
  assert.equal(isPageField({ kind: "br", pos: 0, charPr: 0 }), false);
});

test("positionMap: 읽지 않은 조종 문자 자리(8칸)만큼 뒤 글자 위치를 당김, 틈이 없으면 그대로", () => {
  assert.equal(positionMap(para([text("가나", 0), text("다", 2)]))(2), 2);
  const gap = positionMap(para([text("가", 0), text("나", 9)]));
  assert.equal(gap(0), 0);
  assert.equal(gap(9), 1, "가(1글자) 뒤 8칸 틈이 빠짐");
  assert.equal(gap(5), 1, "틈 안의 위치는 틈 시작까지만");
  // zero 항목·정수 아닌 위치는 건너뜀
  assert.equal(positionMap(para([{ kind: "zero", pos: 99, charPr: 0, text: " " }, text("가", 0)]))(10), 10);
});

test("numberingStarts: 번호 목록이 없으면 빈 배열", () => {
  assert.deepEqual(numberingStarts(doc(), [para([text("가")])]), []);
});

test("hwpxFiles: 필수 파일 묶음과 mimetype, 제목·글 이스케이프, 첫 문단에 쪽 정의, 미리보기 글", () => {
  const f = hwpxFiles(input([para([text("제1 <장> & \u0001끝")]), para([text("둘째")])], { title: 'A&"B"' }));
  assert.deepEqual([...f.keys()].sort(), ["Contents/content.hpf", "Contents/header.xml", "Contents/section0.xml", "META-INF/container.xml", "Preview/PrvText.txt", "mimetype"]);
  assert.equal(read(f, "mimetype"), "application/hwp+zip");
  assert.match(read(f, "Contents/content.hpf"), /<opf:title>A&amp;&quot;B&quot;<\/opf:title>/);
  const sec = read(f, "Contents/section0.xml");
  assert.ok(sec.includes("&lt;장&gt;") && sec.includes("&amp;") && !sec.includes("\u0001"));
  assert.equal(sec.match(/<hp:secPr/g)?.length, 1, "구역 정의는 첫 문단에만");
  assert.match(sec, /width="59528"/);
  assert.equal(read(f, "Preview/PrvText.txt").split("\r\n").length, 2);
  assert.ok(read(f, "Contents/header.xml").startsWith("<?xml"));
});

test("hwpxFiles: 빈 문단 목록도 만들어지고, 공백은 nbSpace로 쓰지 않는 글과 구분", () => {
  const f = hwpxFiles(input([]));
  assert.match(read(f, "Contents/section0.xml"), /<hs:sec [^>]*><\/hs:sec>$/);
  assert.equal(read(f, "Preview/PrvText.txt"), "");
  const sp = read(hwpxFiles(input([para([text("a b　c")])])), "Contents/section0.xml");
  assert.ok(sp.includes("<hp:nbSpace/>"));
});

test("hwpxFiles: 쓰인 그림만 BinData에 넣고(jpeg → jpg), 바이트가 없으면 빈 그림(png), 안 쓴 그림은 뺌", () => {
  const items: Inline[] = [{ kind: "obj", pos: 0, charPr: 0, obj: pic(3) }, { kind: "obj", pos: 8, charPr: 0, obj: pic(1) }, { kind: "obj", pos: 16, charPr: 0, obj: pic(2) }];
  const images = new Map([[1, { data: new Uint8Array([1, 2]), ext: "JPEG" }], [3, { data: new Uint8Array([9]), ext: "png" }], [7, { data: new Uint8Array([7]), ext: "png" }]]);
  const f = hwpxFiles(input([para(items)], { images }));
  assert.deepEqual([...f.keys()].filter((k) => k.startsWith("BinData/")).sort(), ["BinData/image1.jpg", "BinData/image2.png", "BinData/image3.png"]);
  assert.deepEqual([...f.get("BinData/image1.jpg")!], [1, 2]);
  assert.ok(f.get("BinData/image2.png")!.length > 8, "없는 그림은 대체 PNG");
  const hpf = read(f, "Contents/content.hpf");
  assert.match(hpf, /href="BinData\/image1\.jpg" media-type="image\/jpg"/);
  assert.ok(hpf.indexOf("image1") < hpf.indexOf("image2") && hpf.indexOf("image2") < hpf.indexOf("image3"), "그림 id 순서");
  assert.ok(!hpf.includes("image7"));
});

test("hwpxFiles: 꼬리말과 쪽 번호 위치는 첫 문단 조종으로, 모르는 위치는 아래 가운데", () => {
  const footer = { applyTo: "BOTH" as const, vertAlign: "BOTTOM" as const, paras: [para([text("꼬리")])] };
  const withBoth = read(hwpxFiles(input([para([text("a")])], { footer, pageNum: { position: 6, format: 0, prefix: "", suffix: "", dash: "-", charPr: 0 } })), "Contents/section0.xml");
  assert.match(withBoth, /<hp:footer [^>]*applyPageType="BOTH"/);
  assert.ok(withBoth.includes("꼬리"));
  assert.match(withBoth, /<hp:pageNum pos="BOTTOM_RIGHT" formatType="DIGIT" sideChar="-"\/>/);
  const unknown = read(hwpxFiles(input([para([text("a")])], { pageNum: { position: 99, format: 0, prefix: "", suffix: "", dash: "<", charPr: 0 } })), "Contents/section0.xml");
  assert.match(unknown, /pos="BOTTOM_CENTER" formatType="DIGIT" sideChar="&lt;"/);
  assert.ok(!unknown.includes("<hp:footer"));
  const none = read(hwpxFiles(input([para([text("a")])])), "Contents/section0.xml");
  assert.ok(!none.includes("pageNum") && !none.includes("<hp:footer"));
});

test("hwpxFiles: 쪽 번호 자리표시 글은 자동 번호 조종으로 바뀜, 첫 문단 쪽 나눔은 지움", () => {
  const f = read(hwpxFiles(input([para([{ kind: "text", pos: 0, charPr: 0, text: "0", attrs: ' data-hw-field="page"' }], { pageBreak: true })])), "Contents/section0.xml");
  assert.match(f, /<hp:autoNum num="1" numType="PAGE">/);
  assert.match(f, /pageBreak="0"/);
});

test("hwpxFiles: 같은 입력이면 결과 바이트가 같음(재현성)", () => {
  const mk = () => hwpxFiles(input([para([text("재현")])]));
  const a = mk();
  const b = mk();
  for (const [k, v] of a) assert.deepEqual([...v], [...b.get(k)!], k);
});
