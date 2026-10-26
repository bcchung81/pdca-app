// 과제관리카드 원본 배치(카드 한 장 분량). 한글 문서에서 카드 표(첫 칸이 「과제명」)와 그 뒤 붙임(AX 연계과제 표 등)을 떼어,
// 쓰인 모양(글자·문단·테두리·글머리·번호·탭·그림)만 번호를 다시 매겨 담습니다. 카드 화면(lib/cards/layout-render.ts)이
// 이 배치와 카드 JSON으로 원본 그대로 그립니다. 입출력 없는 순수 함수(그림 바이트는 담지 않고 형식만).

import type { BorderFill, Bullet, CharPr, HeadFoot, HwpDoc, Inline, LineSeg, Numbering, PageDef, PageNumPos, Para, ParaPr, Shape, TabDef, Table } from "./model.ts";
import { layoutPages } from "./pages.ts";

/** 표를 품은 문단(표 말고 다른 글은 없음): 문단·글자 모양과 줄 배치 — 한글 파일로 다시 쓸 때 */
export interface TableHost {
  paraPr: number;
  charPr: number;
  endCharPr?: number;
  /** 그 문단에 표 하나만 있을 때의 줄 배치(다른 글·표가 있으면 비움) */
  lines: LineSeg[];
  /** 쪽 나누기 앞에서 시작(붙임이 새 쪽에서 시작하는 등) */
  pageBreak?: boolean;
  /**
   * 앞 덩이(띄운 표)와 같은 문단의 글자처럼 놓은 표(AX 붙임 딱지 등). 한글은 이 표를 문단 줄(문단 위)에 두고 띄운 표는 문단 위에서
   * 세로 떨어진 자리에 둠 — 쪽 보기는 문단 위 자리를 같이 쓰고, 이어 보기는 이 표를 먼저, 한글 파일은 한 문단으로. lines는 그 줄
   */
  join?: boolean;
}

/** 카드 배치 한 덩이: 표 하나 또는 표 사이 문단 하나 */
export type LayoutBlock = { kind: "table"; table: Table; host?: TableHost } | { kind: "para"; para: Para };

export interface CardLayout {
  v: 1;
  faces: HwpDoc["faces"];
  charPrs: CharPr[];
  paraPrs: ParaPr[];
  /** id 1부터([0]은 비움) */
  borderFills: (BorderFill | null)[];
  tabDefs: TabDef[];
  bullets: Bullet[];
  numberings: Numbering[];
  /** 그림(새 id → 형식·원본 문서의 id). 저장소 이름(key)은 적재할 때 채움 */
  bins: { id: number; ext: string; src: number; key: string | null }[];
  /** 쪽 본문 폭(표 사이 문단 폭) */
  textWidth: number;
  /** 쪽 크기·여백(원본 구역 정의) */
  page?: PageDef;
  /** 문서 첫머리의 묶음 제목 표(「(주요사업N) …」) — 한글 파일로 내려받을 때 맨 위에 두어 다시 올리면 묶음을 알 수 있게 */
  lead?: LayoutBlock;
  /** 꼬리말(쪽 번호 자동 번호는 자리표시) — 쪽 보기 */
  footer?: HeadFoot;
  /** 쪽 번호 위치(pgnp) — 쪽 보기(원본에서 이 카드 앞에 놓인 경우만) */
  pageNum?: PageNumPos;
  /** 원본 문서에서 이 카드 첫 쪽의 쪽 번호(쪽 보기 — 원본과 같은 번호) */
  firstPage?: number;
  blocks: LayoutBlock[];
}

const plain = (p: Para) =>
  p.items
    .map((i) => (i.kind === "text" ? i.text : ""))
    .join("")
    .replace(/\s+/g, "");

/** 묶음 제목 표: 첫 칸 글이 「(주요사업N)」으로 시작 */
export function isGroupTitleTable(t: Table): boolean {
  const first = t.cells.find((c) => c.row === 0 && c.col === 0) ?? t.cells[0];
  return Boolean(first) && /^\(주요사업\d+\)/.test(first.paras.map(plain).join(""));
}

/** 카드 표: 첫 칸 글이 「과제명」으로 시작 */
export function isCardTable(t: Table): boolean {
  const first = t.cells.find((c) => c.row === 0 && c.col === 0) ?? t.cells[0];
  const text = first ? first.paras.map(plain).join("") : "";
  return text.startsWith("과제명") || /^과제\(과제번호\)/.test(text); // 경영관리 8-x 카드는 첫 칸이 「과제(과제번호)」
}

/** 경영관리 파일의 묶음 제목 줄(「[안전 및 책임경영]」) — 앞 카드의 배치는 여기서 끝나고 뒤 목차 표는 카드에 안 붙음 */
const isBundleHeading = (b: LayoutBlock) => b.kind === "para" && /^\[[^\]]{2,20}\]$/.test(plain(b.para));

/** 문서의 최상위 덩이(표는 하나씩, 글 문단은 그대로) — 한 문단에 표가 여럿이면 나눔 */
function topBlocks(doc: HwpDoc): LayoutBlock[] {
  const out: LayoutBlock[] = [];
  for (const s of doc.sections)
    s.paras.forEach((p, pi) => {
      const tables = p.items.filter((i): i is Extract<Inline, { kind: "obj" }> => i.kind === "obj" && i.obj.kind === "table");
      const alone = tables.length === 1 && p.items.every((i) => i.kind === "obj" || ((i.kind === "text" || i.kind === "gen") && !i.text.trim()));
      const add = (b: LayoutBlock) => {
        blockParaIndex.set(b, pi);
        out.push(b);
      };
      if (tables.length)
        tables.forEach((t, k) => {
          // 띄운 표 뒤의 글자처럼 놓은 표: 같은 문단의 줄에 있음(앞 덩이와 문단 위를 같이 씀)
          const join = k > 0 && !tables[k - 1].obj.pos.treatAsChar && t.obj.pos.treatAsChar;
          const line = join ? p.lines.filter((l) => l.textpos <= t.pos).pop() : undefined;
          add({
            kind: "table",
            table: t.obj as Table,
            host: { paraPr: p.paraPr, charPr: t.charPr, endCharPr: p.endCharPr, lines: alone ? p.lines : line ? [line] : [], pageBreak: join ? false : p.pageBreak, ...(join ? { join: true } : {}) },
          });
        });
      else add({ kind: "para", para: p });
    });
  return out;
}

/**
 * 카드마다 배치를 뗌: 카드 표부터 다음 카드 표 앞까지(붙임 표·사이 문단). 첫 카드 앞(표지·목차)은 뺌.
 * 끝의 빈 문단은 뺍니다(다음 카드와의 사이 간격).
 */
export function extractCardLayouts(doc: HwpDoc): CardLayout[] {
  const blocks = topBlocks(doc);
  const starts = blocks.map((b, i) => (b.kind === "table" && isCardTable(b.table) ? i : -1)).filter((i) => i >= 0);
  const sec = doc.sections.find((s) => s.page) ?? doc.sections[0];
  const page = sec?.page ?? null;
  const lead = blocks.find((b) => b.kind === "table" && isGroupTitleTable(b.table));
  // 쪽 보기: 문서 전체를 같은 쪽 나눔 규칙으로 흘려 카드마다 첫 쪽 번호(원본 PDF의 쪽 번호 = 쪽 순서)
  const pageOf = new Map<number, number>();
  if (page) {
    try {
      layoutPages({ doc, imageUrl: () => null }, blocks, page, 0, { measure: true, onBlock: (bi, pi) => pageOf.set(bi, pi) });
    } catch {
      pageOf.clear();
    }
  }
  const pnBlock = sec?.pageNum ? blocks.findIndex((b) => blockPara(b) === sec.pageNum?.para) : -1;
  return starts.map((s, k) => {
    const end = k + 1 < starts.length ? starts[k + 1] : blocks.length;
    const part = blocks.slice(s, end);
    const cut = part.findIndex((b, i) => i > 0 && isBundleHeading(b));
    if (cut > 0) part.length = cut;
    while (part.length > 1 && part[part.length - 1].kind === "para" && !plain((part[part.length - 1] as { para: Para }).para)) part.pop();
    const deco = { footer: sec?.footer, pageNum: sec?.pageNum && pnBlock >= 0 && pnBlock <= s ? sec.pageNum : undefined, firstPage: pageOf.has(s) ? (pageOf.get(s) as number) + 1 : undefined };
    if (!lead) return subset(doc, part, page, deco);
    const l = subset(doc, [lead, ...part], page, deco);
    l.lead = l.blocks.shift();
    return l;
  });
}

/** 덩이가 나온 문단(topBlocks가 달아 둔 번호) */
const blockParaIndex = new WeakMap<LayoutBlock, number>();
const blockPara = (b: LayoutBlock) => blockParaIndex.get(b);

/** 쓰인 모양만 모아 번호를 다시 매김 */
function subset(doc: HwpDoc, blocks: LayoutBlock[], page: PageDef | null, deco: { footer?: HeadFoot; pageNum?: PageNumPos; firstPage?: number } = {}): CardLayout {
  const cp = new Map<number, number>();
  const pp = new Map<number, number>();
  const bf = new Map<number, number>();
  const td = new Map<number, number>();
  const bu = new Map<number, number>();
  const nu = new Map<number, number>();
  const bin = new Map<number, number>();
  const out: CardLayout = { v: 1, faces: {}, charPrs: [], paraPrs: [], borderFills: [null], tabDefs: [], bullets: [], numberings: [], bins: [], textWidth: page ? page.width - page.left - page.right : 48188, ...(page ? { page } : {}), blocks: [] };
  const mapBin = (id: number) => {
    let n = bin.get(id);
    if (n === undefined) {
      n = out.bins.length + 1;
      bin.set(id, n);
      out.bins.push({ id: n, ext: doc.bins.get(id)?.ext ?? "", src: id, key: null });
    }
    return n;
  };
  const mapBorderFill = (id: number): number => {
    if (!id) return 0;
    let n = bf.get(id);
    if (n === undefined) {
      const v = structuredClone(doc.borderFills[id] ?? null);
      if (v?.fill?.image) v.fill.image.bin = mapBin(v.fill.image.bin);
      n = out.borderFills.length;
      bf.set(id, n);
      out.borderFills.push(v);
    }
    return n;
  };
  const addFace = (name: string) => {
    if (name && !out.faces[name] && doc.faces[name]) out.faces[name] = doc.faces[name];
  };
  const mapCharPr = (id: number): number => {
    let n = cp.get(id);
    if (n === undefined) {
      const v = structuredClone(doc.charPrs[id] ?? doc.charPrs[0]);
      v.face.forEach(addFace);
      v.borderFill = mapBorderFill(v.borderFill);
      n = out.charPrs.length;
      cp.set(id, n);
      out.charPrs.push(v);
    }
    return n;
  };
  const mapHead = <T extends { head: { charPr: number } }>(x: T): T => {
    const v = structuredClone(x);
    if (v.head.charPr >= 0) v.head.charPr = mapCharPr(v.head.charPr);
    return v;
  };
  const mapParaPr = (id: number): number => {
    let n = pp.get(id);
    if (n === undefined) {
      const v = structuredClone(doc.paraPrs[id] ?? doc.paraPrs[0]);
      v.borderFill = mapBorderFill(v.borderFill);
      if (doc.tabDefs[v.tabDef]) {
        let t = td.get(v.tabDef);
        if (t === undefined) {
          t = out.tabDefs.length;
          td.set(v.tabDef, t);
          out.tabDefs.push(structuredClone(doc.tabDefs[v.tabDef]));
        }
        v.tabDef = t;
      } else v.tabDef = 0;
      if (v.headingType === "BULLET" && doc.bullets[v.headingId - 1]) {
        let b = bu.get(v.headingId);
        if (b === undefined) {
          out.bullets.push(mapHead(doc.bullets[v.headingId - 1]));
          b = out.bullets.length;
          bu.set(v.headingId, b);
        }
        v.headingId = b;
      } else if ((v.headingType === "NUMBER" || v.headingType === "OUTLINE") && doc.numberings[(v.headingId || 1) - 1]) {
        const key = v.headingId || 1;
        let b = nu.get(key);
        if (b === undefined) {
          const src = doc.numberings[key - 1];
          out.numberings.push({ ...structuredClone(src), levels: src.levels.map((l) => mapHead(l)) });
          b = out.numberings.length;
          nu.set(key, b);
        }
        v.headingId = b;
      }
      n = out.paraPrs.length;
      pp.set(id, n);
      out.paraPrs.push(v);
    }
    return n;
  };
  const mapShape = (s: Shape): Shape => {
    const v: Shape = {
      ...s,
      fill: s.fill ? structuredClone(s.fill) : null,
      children: s.children.map((c) => (c.kind === "pic" ? { ...c, bin: mapBin(c.bin) } : mapShape(c))),
      text: s.text ? { ...s.text, paras: s.text.paras.map(mapPara) } : null,
    };
    if (v.fill?.image) v.fill.image.bin = mapBin(v.fill.image.bin);
    return v;
  };
  const mapTable = (t: Table): Table => ({
    ...t,
    borderFill: mapBorderFill(t.borderFill),
    cells: t.cells.map((c) => ({ ...c, borderFill: mapBorderFill(c.borderFill), paras: c.paras.map(mapPara) })),
    ...(t.zones ? { zones: t.zones.map((z) => ({ ...z, borderFill: mapBorderFill(z.borderFill) })) } : {}),
  });
  function mapPara(p: Para): Para {
    const items: Inline[] = p.items.map((it) => {
      const charPr = mapCharPr(it.charPr);
      if (it.kind === "compose") return { ...it, charPr, charPrs: it.charPrs.map((c) => (c >= 0 ? mapCharPr(c) : c)) };
      if (it.kind !== "obj") return { ...it, charPr };
      const o = it.obj;
      if (o.kind === "table") return { ...it, charPr, obj: mapTable(o) };
      if (o.kind === "pic") return { ...it, charPr, obj: { ...o, bin: mapBin(o.bin) } };
      return { ...it, charPr, obj: mapShape(o) };
    });
    const q: Para = { ...p, paraPr: mapParaPr(p.paraPr), items };
    if (p.endCharPr !== undefined) q.endCharPr = mapCharPr(p.endCharPr);
    return q;
  }
  const mapHost = (h: TableHost): TableHost => ({ ...h, paraPr: mapParaPr(h.paraPr), charPr: mapCharPr(h.charPr), ...(h.endCharPr !== undefined ? { endCharPr: mapCharPr(h.endCharPr) } : {}) });
  out.blocks = blocks.map((b) => (b.kind === "table" ? { kind: "table", table: mapTable(b.table), ...(b.host ? { host: mapHost(b.host) } : {}) } : { kind: "para", para: mapPara(b.para) }));
  if (deco.footer) out.footer = { ...deco.footer, paras: deco.footer.paras.map(mapPara) };
  if (deco.pageNum) out.pageNum = { ...deco.pageNum, charPr: mapCharPr(deco.pageNum.charPr) };
  if (deco.firstPage) out.firstPage = deco.firstPage;
  return out;
}

/**
 * 쪽 보기 첫 쪽에서 카드 첫 덩이를 놓을 본문 위 자리(HWPUNIT). 원본에서 앞 카드 뒤 쪽 중간에 이어 시작한 카드(주요사업1 스무째 등)는
 * 원본과 같은 자리에서 시작해야 쪽 나뉨이 원본과 같음 — 표를 품은 문단의 첫 줄 세로 위치(띄운 표는 문단 위 간격을 뺌).
 * 쪽 나누기로 시작했거나 줄 배치가 없으면 0(쪽 맨 위)
 */
export function layoutStartY(l: Pick<CardLayout, "blocks" | "paraPrs">): number {
  const b0 = l.blocks[0];
  if (!b0 || b0.kind !== "table" || !b0.host?.lines.length || b0.host.pageBreak) return 0;
  return Math.max(0, b0.host.lines[0].vertpos - (b0.table.pos.treatAsChar ? 0 : (l.paraPrs[b0.host.paraPr]?.before ?? 0)));
}

/** 배치 → 렌더러가 쓰는 문서 모양(그림 바이트 없음) */
export function layoutDoc(l: CardLayout): HwpDoc {
  return {
    format: "hwp",
    faces: l.faces,
    charPrs: l.charPrs,
    paraPrs: l.paraPrs,
    borderFills: l.borderFills,
    tabDefs: l.tabDefs,
    bullets: l.bullets,
    numberings: l.numberings,
    bins: new Map(l.bins.map((b) => [b.id, { id: b.id, ext: b.ext, data: null }])),
    sections: [],
  };
}

/** 배치 그림의 저장 이름들(서명 주소 만들기) */
export function layoutImageKeys(layout: CardLayout | null | undefined): string[] {
  return [...new Set((layout?.bins ?? []).map((b) => b.key).filter((k): k is string => Boolean(k)))];
}
