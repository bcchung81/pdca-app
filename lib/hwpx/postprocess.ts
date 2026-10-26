// kordoc 산출 HWPX → KCA 양식 정합(후처리). report-harness scripts/postprocess_hwpx.py 중 이 앱에 필요한 단계를 옮긴 것.
// 입력은 kordoc markdownToHwpx가 만든 규칙적인 XML이라 문자열 단위로 다룹니다(문단은 깊이를 세어 최상위만).
//
// 옮긴 단계(규칙 번호):
//  · form_sizes — □·ㅇ·대시 15pt, ※·＊ 13pt, 제목 24pt(kordoc이 sizes 인자를 따르지 않음 — □ 17pt·대시 14pt·제목 25pt로 나옴)
//  · sender_size(R018) — 발신 줄 12pt
//  · star_restore(R011) — kordoc 4.15가 ＊ 각주 줄을 ※로 바꿔 내므로, 초안에서 ＊였던 줄의 기호를 되돌림
//  · highlight(R040) — ==…== 표지를 지우고 노란 음영(#FFFF00)+볼드 run으로
//  · canonicalize_package(R043) — version.xml·settings.xml·manifest.xml·container.rdf 보강, 디렉터리 엔트리 제거,
//    한컴 정품 순서·압축(내부망 자료교환이 kordoc 최소 패키지를 hwpx로 못 알아보고 반려하던 문제)
// 옮기지 않은 것: 머리말 배너(R030)·계층 간격 스페이서(R013)·제목 박스 3행 원형(R084)·열 폭 재배분 등 — hwpx-recipe.md §3.5 참고.

import JSZip from "jszip";
import { FORM_SIZES_PT, HIGHLIGHT_SHADE, SENDER_SIZE_PT, TITLE_SIZE_PT } from "./kca-profile.ts";

// ---------------------------------------------------------------------------
// 글자 모양(charPr) 복제

class CharPrs {
  header: string;
  private defs = new Map<string, string>();
  private added: string[] = [];
  private cache = new Map<string, string>();
  private next: number;
  constructor(header: string) {
    this.header = header;
    for (const m of header.matchAll(/<hh:charPr id="(\d+)"[\s\S]*?<\/hh:charPr>/g)) this.defs.set(m[1], m[0]);
    this.next = Math.max(-1, ...[...this.defs.keys()].map(Number)) + 1;
  }
  height(id: string): number | null {
    const m = /height="(\d+)"/.exec(this.defs.get(id) ?? "");
    return m ? Number(m[1]) : null;
  }
  /** base를 바꾼 복제본 id(같은 변환은 한 번만) */
  derive(id: string, key: string, change: (xml: string) => string): string {
    const k = `${id}|${key}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const base = this.defs.get(id);
    if (!base) return id;
    // id를 먼저 바꾼 뒤 변환(변환이 여는 태그 앞을 건드려도 id가 겹치지 않게)
    const nid = String(this.next);
    const renamed = base.replace(/<hh:charPr id="\d+"/, `<hh:charPr id="${nid}"`);
    const xml = change(renamed);
    if (xml === renamed) return id;
    this.next += 1;
    this.defs.set(nid, xml);
    this.added.push(xml);
    this.cache.set(k, nid);
    return nid;
  }
  sized(id: string, pt: number): string {
    const h = Math.round(pt * 100);
    return this.height(id) === h ? id : this.derive(id, `h${h}`, (x) => x.replace(/height="\d+"/, `height="${h}"`));
  }
  highlighted(id: string): string {
    return this.derive(id, "hl", (x) => {
      let y = x.replace(/shadeColor="[^"]*"/, `shadeColor="${HIGHLIGHT_SHADE}"`);
      if (!/\sbold="1"/.test(y)) y = y.replace(/^(<hh:charPr\b[^>]*?)(\s*\/?>)/, '$1 bold="1"$2');
      if (!/<hh:bold\/>/.test(y)) y = y.replace(/<\/hh:charPr>/, "<hh:bold/></hh:charPr>");
      return y;
    });
  }
  /** 추가한 글자 모양을 머리말(header.xml)에 넣은 결과 */
  finish(): string {
    if (!this.added.length) return this.header;
    const total = this.defs.size;
    return this.header
      .replace(/<hh:charProperties itemCnt="\d+">/, `<hh:charProperties itemCnt="${total}">`)
      .replace(/<\/hh:charProperties>/, `${this.added.join("")}</hh:charProperties>`);
  }
}

// ---------------------------------------------------------------------------
// 문단 모양(paraPr) 복제

export interface ParaSpec {
  align?: "LEFT" | "RIGHT" | "CENTER" | "JUSTIFY" | "DISTRIBUTE";
  /** HWPUNIT(1pt = 100). intent 음수 = 내어쓰기(첫 줄 뒤 줄들을 들임) */
  left?: number;
  right?: number;
  intent?: number;
  prev?: number;
  next?: number;
  /** 줄 간격 % */
  lineSpacing?: number;
}

class ParaPrs {
  private base: string | null;
  private next: number;
  private count: number;
  private added: string[] = [];
  private cache = new Map<string, string>();
  constructor(header: string) {
    const all = [...header.matchAll(/<hh:paraPr id="(\d+)"[\s\S]*?<\/hh:paraPr>/g)];
    this.base = all.find((m) => m[1] === "0")?.[0] ?? all[0]?.[0] ?? null;
    this.count = all.length;
    this.next = Math.max(-1, ...all.map((m) => Number(m[1]))) + 1;
  }
  /** 기본 문단 모양(id 0)을 바꾼 새 문단 모양 id(같은 모양은 한 번만) */
  get(spec: ParaSpec): string {
    const key = JSON.stringify(spec);
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (!this.base) return "0";
    const id = String(this.next++);
    const set = (xml: string, tag: string, v: number | undefined) => (v === undefined ? xml : xml.replace(new RegExp(`<hc:${tag} value="-?\\d+"`), `<hc:${tag} value="${v}"`));
    let xml = this.base.replace(/<hh:paraPr id="\d+"/, `<hh:paraPr id="${id}"`);
    if (spec.align) xml = xml.replace(/<hh:align horizontal="[A-Z_]+"/, `<hh:align horizontal="${spec.align}"`);
    xml = set(xml, "intent", spec.intent);
    xml = set(xml, "left", spec.left);
    xml = set(xml, "right", spec.right);
    xml = set(xml, "prev", spec.prev);
    xml = set(xml, "next", spec.next);
    if (spec.lineSpacing !== undefined) xml = xml.replace(/<hh:lineSpacing type="[A-Z_]+" value="\d+"/, `<hh:lineSpacing type="PERCENT" value="${spec.lineSpacing}"`);
    this.added.push(xml);
    this.cache.set(key, id);
    return id;
  }
  /** 추가한 문단 모양을 머리말에 넣은 결과 */
  finish(header: string): string {
    if (!this.added.length) return header;
    return header
      .replace(/<hh:paraProperties itemCnt="\d+">/, `<hh:paraProperties itemCnt="${this.count + this.added.length}">`)
      .replace(/<\/hh:paraProperties>/, `${this.added.join("")}</hh:paraProperties>`);
  }
}

/** kordoc 서식 프로필의 굵은 글꼴은 bold="1" 속성만 있음 — 한컴이 읽는 <hh:bold/> 요소를 채움 */
export function normalizeBold(header: string): string {
  return header.replace(/<hh:charPr\b[^>]*\sbold="1"[^>]*>[\s\S]*?<\/hh:charPr>/g, (x) => (/<hh:bold\/>/.test(x) ? x : x.replace(/(<hh:offset\b[^>]*\/>)/, "$1<hh:bold/>")));
}

// ---------------------------------------------------------------------------
// 문단

/** 최상위 문단(표 안 문단 제외)의 [시작, 끝] 위치 */
function topParagraphs(xml: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const re = /<hp:p\b[^>]*>|<\/hp:p>/g;
  let depth = 0;
  let start = -1;
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        out.push([start, re.lastIndex]);
        start = -1;
      }
    } else {
      if (depth === 0) start = m.index;
      depth += 1;
    }
  }
  return out;
}

/** 문단 바로 아래 run들의 글(표 안 글 제외) */
function directText(p: string): string {
  if (/<hp:tbl\b/.test(p)) return "";
  return [...p.matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, ""))
    .join("")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

type Kind = "dae" | "yo" | "dash" | "star" | "cham" | "arrow" | "sending" | "table" | "other";
const SENDING = /^<\s*['’]?\d/;

export function classifyParagraph(p: string): Kind {
  if (/<hp:tbl\b/.test(p)) return "table";
  const t = directText(p).trim();
  if (!t) return "other";
  if (t.startsWith("□")) return "dae";
  if (t[0] === "ㅇ" || t[0] === "○") return "yo";
  if (t.startsWith("＊")) return "star";
  if (t.startsWith("※")) return "cham";
  if (t.startsWith("☞")) return "arrow";
  if (SENDING.test(t)) return "sending";
  if (t.startsWith("-")) return "dash";
  return "other";
}

/** run의 charPrIDRef를 f로 바꿈(문단 바로 아래 run만) */
function mapRuns(p: string, f: (id: string) => string): { xml: string; changed: number } {
  let changed = 0;
  const xml = p.replace(/<hp:run charPrIDRef="(\d+)"/g, (all, id: string) => {
    const nid = f(id);
    if (nid === id) return all;
    changed += 1;
    return `<hp:run charPrIDRef="${nid}"`;
  });
  return { xml, changed };
}

/** ==…== 표지 → 노란 음영+볼드 run(한 hp:t 안의 글에서만, 짝이 맞을 때) */
function highlightRuns(p: string, cp: CharPrs): { xml: string; count: number } {
  let count = 0;
  const xml = p.replace(/<hp:run charPrIDRef="(\d+)"><hp:t>([^<]*==[^<]*==[^<]*)<\/hp:t><\/hp:run>/g, (all, id: string, text: string) => {
    const parts = text.split(/(==[^=]+?==)/);
    if (parts.length < 3) return all;
    const hl = cp.highlighted(id);
    return parts
      .filter((s) => s !== "")
      .map((s) => {
        if (/^==[^=]+==$/.test(s)) {
          count += 1;
          return `<hp:run charPrIDRef="${hl}"><hp:t>${s.slice(2, -2)}</hp:t></hp:run>`;
        }
        return `<hp:run charPrIDRef="${id}"><hp:t>${s}</hp:t></hp:run>`;
      })
      .join("");
  });
  return { xml, count };
}

export interface PostSummary {
  paragraphs: Partial<Record<Kind, number>>;
  sizedRuns: number;
  titleRuns: number;
  senderRuns: number;
  starsRestored: number;
  highlights: number;
  package: { added: string[]; dirsRemoved: number };
}

/**
 * section XML 한 개와 header를 KCA 양식으로. starLines = 초안의 ※·＊ 줄이 순서대로 ＊였는지(※로 바뀐 줄 되돌리기용).
 */
export function postprocessSection(section: string, cp: CharPrs, starLines: boolean[], sum: PostSummary): string {
  const ranges = topParagraphs(section);
  let out = "";
  let last = 0;
  let refIndex = 0;
  for (const [a, b] of ranges) {
    out += section.slice(last, a);
    let p = section.slice(a, b);
    const kind = classifyParagraph(p);
    sum.paragraphs[kind] = (sum.paragraphs[kind] ?? 0) + 1;
    // ＊ 각주: kordoc이 ※로 바꿔 낸 줄을 초안 순서대로 되돌림(R011)
    if (kind === "cham" || kind === "star") {
      const wasStar = starLines[refIndex++] === true;
      if (wasStar && kind === "cham") {
        p = p.replace(/<hp:t>※/, "<hp:t>＊");
        sum.starsRestored += 1;
      }
    }
    const pt = kind === "sending" ? SENDER_SIZE_PT : (FORM_SIZES_PT as Record<string, number>)[kind];
    if (pt) {
      const r = mapRuns(p, (id) => (cp.height(id) === 1300 && kind !== "sending" ? id : cp.sized(id, pt)));
      p = r.xml;
      if (kind === "sending") sum.senderRuns += r.changed;
      else sum.sizedRuns += r.changed;
    }
    const h = highlightRuns(p, cp);
    p = h.xml;
    sum.highlights += h.count;
    // 제목 박스(kordoc이 이름 붙인 칸 __kordoc_h1)의 글 24pt
    if (/name="__kordoc_h1"/.test(p)) {
      p = p.replace(/(<hp:tc name="__kordoc_h1"[\s\S]*?<\/hp:tc>)/, (cell) => {
        const r = mapRuns(cell, (id) => cp.sized(id, TITLE_SIZE_PT));
        sum.titleRuns += r.changed;
        return r.xml;
      });
    }
    out += p;
    last = b;
  }
  return out + section.slice(last);
}

// ---------------------------------------------------------------------------
// 패키지 정합(R043) — 한컴 정품 실측('26.7.29, 도식 Pool.hwpx)의 멤버 구성·순서·압축

const VERSION_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
  '<hv:HCFVersion xmlns:hv="http://www.hancom.co.kr/hwpml/2011/version" ' +
  'tagetApplication="WORDPROCESSOR" major="5" minor="1" micro="1" buildNumber="0" ' +
  'os="1" xmlVersion="1.5" application="Hancom Office Hangul" ' +
  'appVersion="12, 0, 0, 3747 WIN32LEWindows_10"/>';
const SETTINGS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
  '<ha:HWPApplicationSetting xmlns:ha="http://www.hancom.co.kr/hwpml/2011/app" ' +
  'xmlns:config="urn:oasis:names:tc:opendocument:xmlns:config:1.0">' +
  '<ha:CaretPosition listIDRef="0" paraIDRef="0" pos="0"/>' +
  '<config:config-item-set name="PrintInfo">' +
  '<config:config-item name="PrintAutoFootNote" type="boolean">false</config:config-item>' +
  '<config:config-item name="PrintAutoHeadNote" type="boolean">false</config:config-item>' +
  '<config:config-item name="PrintMethod" type="short">0</config:config-item>' +
  '<config:config-item name="OverlapSize" type="short">0</config:config-item>' +
  '<config:config-item name="PrintCropMark" type="short">0</config:config-item>' +
  '<config:config-item name="BinderHoleType" type="short">0</config:config-item>' +
  '<config:config-item name="ZoomX" type="short">100</config:config-item>' +
  '<config:config-item name="ZoomY" type="short">100</config:config-item>' +
  "</config:config-item-set></ha:HWPApplicationSetting>";
const MANIFEST_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><odf:manifest xmlns:odf="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"/>';
const SECTION_RE = /^Contents\/section(\d+)\.xml$/;
const MEDIA = /\.(png|jpe?g|gif|bmp|tiff?|wmf|emf)$/i;

function containerRdf(sections: string[]): string {
  const ns0 = 'xmlns:ns0="http://www.hancom.co.kr/hwpml/2016/meta/pkg#"';
  const pkg = "http://www.hancom.co.kr/hwpml/2016/meta/pkg#";
  const parts = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    `<rdf:Description rdf:about=""><ns0:hasPart ${ns0} rdf:resource="Contents/header.xml"/></rdf:Description>`,
    `<rdf:Description rdf:about="Contents/header.xml"><rdf:type rdf:resource="${pkg}HeaderFile"/></rdf:Description>`,
  ];
  for (const s of sections) {
    parts.push(`<rdf:Description rdf:about=""><ns0:hasPart ${ns0} rdf:resource="${s}"/></rdf:Description>`);
    parts.push(`<rdf:Description rdf:about="${s}"><rdf:type rdf:resource="${pkg}SectionFile"/></rdf:Description>`);
  }
  parts.push(`<rdf:Description rdf:about=""><rdf:type rdf:resource="${pkg}Document"/></rdf:Description></rdf:RDF>`);
  return parts.join("");
}

function containerXml(names: Set<string>): string {
  const roots = ['<ocf:rootfile full-path="Contents/content.hpf" media-type="application/hwpml-package+xml"/>'];
  if (names.has("Preview/PrvText.txt")) roots.push('<ocf:rootfile full-path="Preview/PrvText.txt" media-type="text/plain"/>');
  roots.push('<ocf:rootfile full-path="META-INF/container.rdf" media-type="application/rdf+xml"/>');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>' +
    '<ocf:container xmlns:ocf="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:hpf="http://www.hancom.co.kr/schema/2011/hpf">' +
    `<ocf:rootfiles>${roots.join("")}</ocf:rootfiles></ocf:container>`
  );
}

const FIXED_ORDER: Record<string, number> = {
  mimetype: 0,
  "version.xml": 1,
  "Contents/header.xml": 3,
  "Preview/PrvText.txt": 5,
  "settings.xml": 6,
  "Preview/PrvImage.png": 7,
  "META-INF/container.rdf": 8,
  "Contents/content.hpf": 9,
  "META-INF/container.xml": 10,
  "META-INF/manifest.xml": 11,
};
function orderKey(name: string): [number, string] {
  if (name in FIXED_ORDER) return [FIXED_ORDER[name], ""];
  if (name.startsWith("BinData/")) return [2, name.replace(/\d+/g, (d) => d.padStart(8, "0"))];
  const s = SECTION_RE.exec(name);
  if (s) return [4, s[1].padStart(8, "0")];
  return [12, name];
}

export function canonicalizePackage(files: Map<string, Uint8Array>): { order: string[]; added: string[]; dirsRemoved: number } {
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let dirsRemoved = 0;
  for (const n of [...files.keys()])
    if (n.endsWith("/")) {
      files.delete(n);
      dirsRemoved += 1;
    }
  for (const n of [...files.keys()]) if (n.startsWith("Scripts/")) files.delete(n);
  const sections = [...files.keys()].filter((n) => SECTION_RE.test(n)).sort();
  const added: string[] = [];
  for (const [name, content] of [
    ["version.xml", VERSION_XML],
    ["settings.xml", SETTINGS_XML],
    ["META-INF/manifest.xml", MANIFEST_XML],
  ] as const)
    if (!files.has(name)) {
      files.set(name, enc.encode(content));
      added.push(name);
    }
  if (!files.has("META-INF/container.rdf")) {
    files.set("META-INF/container.rdf", enc.encode(containerRdf(sections)));
    added.push("META-INF/container.rdf");
  }
  const cx = files.get("META-INF/container.xml");
  if (cx && !dec.decode(cx).includes("container.rdf")) files.set("META-INF/container.xml", enc.encode(containerXml(new Set(files.keys()))));
  const hpf = files.get("Contents/content.hpf");
  if (hpf) {
    const t = dec.decode(hpf);
    if (!t.includes('href="settings.xml"') && t.includes("</opf:manifest>"))
      files.set("Contents/content.hpf", enc.encode(t.replace("</opf:manifest>", '<opf:item id="settings" href="settings.xml" media-type="application/xml"/></opf:manifest>')));
  }
  const order = [...files.keys()].sort((a, b) => {
    const [x, y] = [orderKey(a), orderKey(b)];
    return x[0] - y[0] || x[1].localeCompare(y[1]);
  });
  return { order, added, dirsRemoved };
}

// ---------------------------------------------------------------------------

/** HWPX 바이트 → 파일 묶음(디렉터리 엔트리는 빈 값) */
export async function readHwpxFiles(input: Uint8Array): Promise<Map<string, Uint8Array>> {
  const zip = await JSZip.loadAsync(input);
  const files = new Map<string, Uint8Array>();
  for (const [name, f] of Object.entries(zip.files)) files.set(name, f.dir ? new Uint8Array() : await f.async("uint8array"));
  return files;
}

/** 파일 묶음 → 한컴 정품 순서·압축의 HWPX(R043): mimetype·version.xml·그림은 STORED, 나머지 DEFLATE */
export async function writeHwpxPackage(files: Map<string, Uint8Array>): Promise<{ bytes: Uint8Array; added: string[]; dirsRemoved: number }> {
  const pkg = canonicalizePackage(files);
  const out = new JSZip();
  for (const name of pkg.order) {
    const stored = name === "mimetype" || name === "version.xml" || name.startsWith("BinData/") || MEDIA.test(name);
    out.file(name, files.get(name)!, { compression: stored ? "STORE" : "DEFLATE", createFolders: false });
  }
  const bytes = await out.generateAsync({ type: "uint8array", mimeType: "application/hwp+zip" });
  return { bytes, added: pkg.added, dirsRemoved: pkg.dirsRemoved };
}

/** kordoc HWPX → KCA 양식 정합 HWPX */
export async function postprocessKca(input: Uint8Array, starLines: boolean[]): Promise<{ bytes: Uint8Array; summary: PostSummary }> {
  const files = await readHwpxFiles(input);
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  const sum: PostSummary = { paragraphs: {}, sizedRuns: 0, titleRuns: 0, senderRuns: 0, starsRestored: 0, highlights: 0, package: { added: [], dirsRemoved: 0 } };
  const headerBytes = files.get("Contents/header.xml");
  if (headerBytes) {
    const cp = new CharPrs(dec.decode(headerBytes));
    for (const name of [...files.keys()].filter((n) => SECTION_RE.test(n)).sort()) files.set(name, enc.encode(postprocessSection(dec.decode(files.get(name)!), cp, starLines, sum)));
    files.set("Contents/header.xml", enc.encode(cp.finish()));
  }
  const pkg = await writeHwpxPackage(files);
  sum.package = { added: pkg.added, dirsRemoved: pkg.dirsRemoved };
  return { bytes: pkg.bytes, summary: sum };
}

export { CharPrs, ParaPrs };
