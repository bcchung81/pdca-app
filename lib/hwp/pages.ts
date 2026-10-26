// 쪽 보기(인쇄 모양): 한글이 표·문단을 쪽에 나눠 놓는 규칙대로 조각을 만들어 쪽마다 그림. 입출력 없음.
//
// 표를 쪽 경계에서 나누는 규칙 — 원본 PDF의 쪽 경계 57곳(59장 카드·붙임 표)과 파일 값(표 높이 = 첫 쪽 부분 높이,
// 쪽을 넘은 줄의 세로 위치)에 모두 맞춘 것:
//  · 행이 남은 공간(room)에 다 들어가면 그대로
//  · 아니면 그 행에서 시작하는 칸들의 줄을 들어가는 만큼 넣음(줄 아래 + 칸 위·아래 안 여백 ≤ room)
//    - 한 줄도 못 넣으면 행째 다음 쪽으로, 이 쪽의 마지막 행을 room만큼 늘림
//    - 넣은 부분의 높이 = min(room, max(칸 저장 높이로 정한 행 높이 중 남은 것, 넣은 줄 + 안 여백))
//      → 저장 높이가 내용보다 크면 쪽 끝까지, 내용이 행 높이를 정했으면 넣은 줄에서 끝남
//    - 다음 쪽 부분 = max(저장 높이 중 남은 것, 남은 줄 + 안 여백), 새 쪽의 첫 줄은 한글이 적은 세로 위치에
//    - 내용이 다 들어갔는데 저장 높이만 넘치면: 이 행 아래로 이어지는 병합 칸이 있을 때만 남은 높이를 다음 쪽에, 아니면 쪽 끝에서 끝냄
//  · 행 높이는 놓인 대로 다시 셈: 병합 칸이 정하는 높이는 앞 행이 쪽에서 나뉘며 늘어난 만큼 뒤 행에서 줄어듦
//  · 조각은 본문 끝에서 max(표 바깥 아래 여백, 101) 위에서 끊음
//  · 여러 행에 걸친 칸의 글은 그 칸이 시작하는 조각에, 다음 조각에서는 빈 칸(테두리·채우기만)으로 이어짐
// 본문 흐름: 문단은 줄마다(줄 높이 + 줄 간격), 글자처럼 놓은 표는 한 줄(표 높이 + 바깥 여백, 뒤에 줄 간격),
// 문단 기준으로 띄운 표는 문단 위치 + 세로 떨어짐에서 시작하고 끝난 자리에서 다음 덩이가 이어짐. 쪽 나누기 문단은 새 쪽.

import { type CellLine, type HtmlCtx, type TablePart, cellContentHeight, cellLines, escHtml, f3, fontStack, paraHtml, px, tableGrid, tableHtml, tablePartHtml } from "./html.ts";
import type { LayoutBlock } from "./layout.ts";
import type { Cell, HeadFoot, Inline, PageDef, PageNumPos, Para, Table } from "./model.ts";

/** 행 높이 비교·자리 맞춤 허용치(HWPUNIT) — 줄 배치 값과 칸 높이 값의 반올림 차이 */
const EPS = 4;
/**
 * 한글 규칙: 쪽에 걸친 표 조각은 본문 끝에서 max(표 바깥 아래 여백, 101) 위에서 끊음.
 * 원본 파일의 표 첫 쪽 높이로 확인 — 바깥 여백 141인 카드 표 33곳은 141(반올림 ±2), 바깥 여백이 없는 붙임 표 4곳은 모두 101
 * (가운데 쪽까지 이어진 붙임 표도 같은 자리에서 끊겨 다음 문단 위치가 파일 값과 같음)
 */
export const TABLE_BOTTOM_MIN = 101;

/** 문단의 줄 [from, to)만 남긴 문단(글자는 그 줄들에 든 것만) */
export function sliceParaLines(p: Para, from: number, to: number): Para {
  if (from <= 0 && to >= p.lines.length) return p;
  const start = from > 0 ? p.lines[from].textpos : -Infinity;
  const end = to < p.lines.length ? p.lines[to].textpos : Infinity;
  const items: Inline[] = [];
  for (const it of p.items) {
    if (it.kind === "text") {
      const a = Math.max(0, start - it.pos);
      const b = Math.min(it.text.length, end - it.pos);
      if (b > a) items.push({ ...it, pos: it.pos + a, text: it.text.slice(a, b) });
    } else if (it.pos >= start && it.pos < end) items.push(it);
  }
  return { ...p, items, lines: p.lines.slice(Math.max(0, from), to), ...(to < p.lines.length ? { more: true } : {}) };
}

/** 쪽 보기 표 조각: 그릴 행·칸 + 조각 높이 */
export interface PagedTablePart extends TablePart {
  height: number;
}

/**
 * 표를 쪽 조각으로: first = 첫 쪽에서 표 위부터 쓸 수 있는 높이, next = 다음 쪽들에서 쓸 수 있는 높이(바깥 여백 뺀 본문 높이).
 * 첫 조각이 비면(첫 행의 한 줄도 첫 쪽에 못 넣음) 빈 조각(행 없음)을 돌려주고 표는 다음 쪽부터
 */
export function paginateTable(t: Table, first: number, next: number): PagedTablePart[] {
  const lines = new Map<Cell, CellLine[] | null>();
  for (const c of t.cells) lines.set(c, cellLines(c));
  const byStart = new Map<number, Cell[]>();
  for (const c of t.cells) byStart.set(c.row, [...(byStart.get(c.row) ?? []), c]);
  const placed = new Map<Cell, number>();
  const count = (c: Cell) => lines.get(c)?.length ?? 0;
  const at = (c: Cell) => placed.get(c) ?? 0;
  const margin = (c: Cell) => c.margin[2] + c.margin[3];
  /**
   * 이어지는 조각의 첫 줄 자리: 한글이 그 줄에서 쪽을 넘겼으면(파일의 쪽 경계와 같음) 새 쪽에 적은 세로 위치, 아니면 0
   * (문단 위 간격이 있는 문단이 새 쪽 첫머리에 오면 그 간격이 남음)
   */
  const lead = (ls: CellLine[], from: number) => (from > 0 && ls[from].page !== ls[from - 1].page ? Math.max(0, ls[from].vp) : 0);
  /** 칸 줄 [from, to)가 차지하는 높이(조각 위부터, 안 여백 포함) */
  const extent = (c: Cell, from: number, to: number): number => {
    const ls = lines.get(c);
    if (!ls || to <= from) return 0;
    const base = from === 0 ? 0 : ls[from].top - lead(ls, from);
    let b = 0;
    for (let i = from; i < to; i++) b = Math.max(b, ls[i].bottom - base);
    return b + margin(c);
  };
  /** 남은 줄 중 room에 들어가는 수 */
  const fitCount = (c: Cell, room: number): number => {
    const ls = lines.get(c);
    if (!ls) return 0;
    const from = at(c);
    const base = from === 0 || from >= ls.length ? 0 : ls[from].top - lead(ls, from);
    let n = 0;
    for (let i = from; i < ls.length && ls[i].bottom - base + margin(c) <= room + EPS; i++) n++;
    return n;
  };

  // 행 높이는 그때그때: 그 행에서 끝나는 칸마다 (칸 높이 − 그 칸의 앞 행들에 실제로 놓인 높이) 중 가장 큰 것.
  // 병합 칸은 앞 행이 쪽에서 나뉘며 늘어난(안 여백이 두 번) 만큼 뒤 행이 줄어듦 — 원본 PDF와 같음
  const own = new Map<Cell, number>(t.cells.map((c) => [c, Math.max(c.height, cellContentHeight(c))]));
  const ending = new Map<number, Cell[]>();
  for (const c of t.cells) {
    const end = Math.min(t.rows, c.row + Math.max(1, c.rowSpan)) - 1;
    ending.set(end, [...(ending.get(end) ?? []), c]);
  }
  const placedH: number[] = Array(t.rows).fill(0);
  const needOf = (r: number, size: (c: Cell) => number) => {
    let n = 0;
    for (const c of ending.get(r) ?? []) {
      let prev = 0;
      for (let q = c.row; q < r; q++) prev += placedH[q];
      n = Math.max(n, size(c) - prev);
    }
    return n;
  };
  const partRows: { r: number; h: number }[][] = [[]];
  // 칸 → 조각마다 그릴 줄 범위(whole: 줄 배치가 없는 칸은 처음 놓인 조각에 통째로)
  const slices = new Map<Cell, { part: number; from: number; to: number; whole?: boolean }[]>();
  let k = 0;
  let y = 0;
  let avail = first;
  const nextPage = () => {
    k++;
    partRows.push([]);
    y = 0;
    avail = next;
  };
  const put = (c: Cell, from: number, to: number) => {
    const list = slices.get(c) ?? [];
    if (!lines.get(c)) {
      if (!list.length) list.push({ part: k, from: 0, to: 0, whole: true });
    } else if (to > from) list.push({ part: k, from, to });
    slices.set(c, list);
    placed.set(c, Math.max(at(c), to));
  };

  for (let r = 0; r < t.rows; r++) {
    const starting = byStart.get(r) ?? [];
    let storedLeft = needOf(r, (c) => c.height);
    let fresh = true;
    for (let guard = 0; guard < 200; guard++) {
      const need = fresh ? needOf(r, (c) => own.get(c) ?? c.height) : Math.max(storedLeft, ...starting.map((c) => extent(c, at(c), count(c))));
      if (y + need <= avail + EPS) {
        partRows[k].push({ r, h: need });
        placedH[r] += need;
        for (const c of starting) put(c, at(c), count(c));
        y += need;
        break;
      }
      const room = avail - y;
      const fits = new Map(starting.map((c) => [c, fitCount(c, room)] as const));
      // 남은 줄이 있는 칸 중 하나라도 한 줄을 못 넣으면 이 쪽에 이 행을 나누지 않음(행째 다음 쪽)
      const open = starting.filter((c) => count(c) - at(c) > 0);
      const anyLine = open.length > 0 && open.every((c) => (fits.get(c) ?? 0) > 0);
      const hasLines = open.length > 0;
      // 이 행으로 이어지는 병합 칸(윗행에서 시작)의 저장 높이 중 이 쪽에 놓인 행들로 채우지 못한 것
      const spanNeed = () => {
        let need = 0;
        for (const c of t.cells) {
          if (c.row >= r || c.row + c.rowSpan <= r) continue;
          let got = 0;
          for (const x of partRows[k]) if (x.r >= c.row && x.r < r) got += x.h;
          need = Math.max(need, c.height - got);
        }
        return need;
      };
      if (!anyLine && hasLines) {
        if (fresh && partRows[k].length) {
          // 한 줄도 못 넣음: 행째 다음 쪽으로. 이 행으로 이어지는 병합 칸의 저장 높이가 남았으면 이 쪽 마지막 행을 그만큼(쪽 끝까지) 늘림
          const last = partRows[k][partRows[k].length - 1];
          const grow = Math.min(room, Math.max(0, spanNeed()));
          last.h += grow;
          placedH[last.r] += grow;
          nextPage();
          continue;
        }
        if (!partRows[k].length && avail < next - EPS) {
          // 표 첫 조각에 첫 행이 안 들어감: 표를 다음 쪽부터
          nextPage();
          continue;
        }
        // 빈 쪽에도 한 줄이 안 들어가는 행(쪽보다 큰 줄): 그대로 놓음(넘침)
        partRows[k].push({ r, h: need });
        placedH[r] += need;
        for (const c of starting) put(c, at(c), count(c));
        y += need;
        break;
      }
      const fitted = Math.max(0, ...starting.map((c) => extent(c, at(c), at(c) + (fits.get(c) ?? 0))));
      // 이 행에서 시작해 아래로 이어지는 병합 칸의 저장 높이도 채우려 함(쪽 끝까지)
      let spanStart = 0;
      if (fresh) for (const c of starting) if (c.rowSpan > 1) spanStart = Math.max(spanStart, c.height);
      const h = Math.min(room, Math.max(storedLeft, fitted, spanStart));
      partRows[k].push({ r, h });
      placedH[r] += h;
      for (const c of starting) put(c, at(c), at(c) + (fits.get(c) ?? 0));
      storedLeft = Math.max(0, storedLeft - h);
      fresh = false;
      // 내용이 다 들어갔고 이 행 아래로 이어지는 병합 칸이 없으면 남은 저장 높이는 버리고 이 쪽 끝에서 행이 끝남
      // (원본: 병합이 이 행에서 끝난 3-나·1-가는 버림, 병합이 다음 행으로 이어진 7-가는 다음 쪽 맨 위에 남은 높이)
      const linesLeft = starting.some((c) => count(c) - at(c) > 0);
      const spanGoesOn = t.cells.some((c) => c.row <= r && c.row + c.rowSpan - 1 > r);
      if (!linesLeft && !spanGoesOn) {
        y += h;
        break;
      }
      nextPage();
    }
  }

  return partRows.map((rows, p) => {
    const idx = new Map<number, number>();
    rows.forEach((x, i) => idx.set(x.r, i));
    const cells: TablePart["cells"] = [];
    for (const c of t.cells) {
      const span: number[] = [];
      for (let r = c.row; r < c.row + Math.max(1, c.rowSpan); r++) if (idx.has(r)) span.push(idx.get(r) as number);
      if (!span.length) continue;
      const mine = (slices.get(c) ?? []).filter((s) => s.part === p);
      let paras: Para[] | null = [];
      let gap: number | undefined;
      if (mine.some((s) => s.whole)) paras = null;
      else if (mine.length) {
        const ls = lines.get(c) as CellLine[];
        const { from, to } = mine[0];
        if (from === 0 && to === ls.length) paras = null;
        else {
          if (from > 0) gap = lead(ls, from);
          paras = [];
          for (let i = from; i < to; ) {
            const pi = ls[i].p;
            let j = i;
            while (j < to && ls[j].p === pi) j++;
            paras.push(sliceParaLines(c.paras[pi], ls[i].i, ls[j - 1].i + 1));
            i = j;
          }
        }
      }
      cells.push({ cell: c, row: Math.min(...span), rowSpan: span.length, paras, ...(gap !== undefined ? { gap } : {}) });
    }
    return { hs: rows.map((x) => x.h), cells, height: rows.reduce((s, x) => s + x.h, 0) };
  });
}

/** 쪽 한 장에 놓을 것: 본문 왼쪽·위에서의 자리(HWPUNIT)와 HTML */
interface Placed {
  x: number;
  y: number;
  html: string;
}

/**
 * 덩이들을 쪽에 나눠 놓음(본문 흐름 규칙은 파일 머리 주석) — 쪽마다 놓을 것.
 * startY: 첫 쪽에서 첫 덩이를 놓을 본문 위 자리(원본에서 앞 카드 뒤에 이어 시작한 카드를 원본과 같은 자리에 — 기본 0)
 */
export function layoutPages(
  ctx: HtmlCtx,
  blocks: LayoutBlock[],
  page: PageDef,
  startY = 0,
  opts: { measure?: boolean; onBlock?: (block: number, page: number) => void } = {},
): Placed[][] {
  const bodyH = page.height - page.top - page.bottom - page.header - page.footer;
  const textW = page.width - page.left - page.right;
  const pages: Placed[][] = [[]];
  let y = startY;
  let prevAfter = 0;
  // 바로 앞 덩이가 띄운 표였으면 그 문단 위 자리(같은 문단의 글자처럼 놓은 표가 그 줄에 놓임)
  let floatPara: { page: number; y: number; prevAfter: number } | null = null;
  const newPage = () => {
    pages.push([]);
    y = 0;
  };
  const cur = () => pages[pages.length - 1];
  // 재기만(문서 전체 쪽 번호 셈): HTML은 만들지 않음
  const html = (f: () => string) => (opts.measure ? "" : f());
  for (let bi = 0; bi < blocks.length; bi++) {
    const b = blocks[bi];
    let told = false;
    const tell = () => {
      if (!told) opts.onBlock?.(bi, pages.length - 1);
      told = true;
    };
    if (b.kind === "para") {
      floatPara = null;
      const p = b.para;
      const pp = ctx.doc.paraPrs[p.paraPr];
      if (p.pageBreak && (y > 0 || cur().length)) newPage();
      if (y > 0) y += prevAfter + (pp?.before ?? 0);
      prevAfter = pp?.after ?? 0;
      const ls = p.lines;
      if (!ls.length) continue;
      // 줄마다 쪽에 넣고, 쪽을 넘는 곳에서 문단을 나눔
      let from = 0;
      let top = y;
      for (let i = 0; i < ls.length; i++) {
        if (y > 0 && i > from && y + ls[i].vertsize > bodyH) {
          tell();
          cur().push({ x: 0, y: top, html: html(() => paraHtml(ctx, sliceParaLines(p, from, i), { first: true, last: true, prevAfter: 0, width: textW, depth: 0, gap: 0 }).html) });
          newPage();
          from = i;
          top = 0;
        } else if (y > 0 && i === from && y + ls[i].vertsize > bodyH) {
          newPage();
          top = 0;
        }
        y += ls[i].vertsize + ls[i].spacing;
      }
      tell();
      cur().push({ x: 0, y: top, html: html(() => paraHtml(ctx, sliceParaLines(p, from, ls.length), { first: true, last: false, prevAfter: 0, width: textW, depth: 0, gap: 0 }).html) });
      continue;
    }
    const t = b.table;
    const host = b.host;
    const hpp = host ? ctx.doc.paraPrs[host.paraPr] : undefined;
    const [ol, , ot, ob] = t.pos.outMargin;
    const grid = tableGrid(t, (id) => ctx.doc.paraPrs[id]?.right ?? 0);
    const inLineX = () => {
      const w = t.pos.width + ol + t.pos.outMargin[1];
      const room = textW - (hpp?.left ?? 0) - (hpp?.right ?? 0) - Math.max(0, hpp?.indent ?? 0);
      const free = room - w;
      return (hpp?.left ?? 0) + Math.max(0, hpp?.indent ?? 0) + ol + (free > 0 ? (hpp?.align === "CENTER" ? free / 2 : hpp?.align === "RIGHT" ? free : 0) : 0);
    };
    // 띄운 표와 같은 문단의 글자처럼 놓은 표: 한글은 문단 줄(문단 위)에 둠 — 띄운 표 뒤가 아님(주요사업2 다섯째 카드 AX 붙임 딱지).
    // 다음 흐름은 줄 끝과 띄운 표 끝 중 아래
    if (host?.join && t.pos.treatAsChar && floatPara) {
      const lineY = floatPara.y + (floatPara.y > 0 ? floatPara.prevAfter : 0) + (hpp?.before ?? 0);
      const h = grid.hs.reduce((a, v) => a + v, 0);
      opts.onBlock?.(bi, floatPara.page);
      if (!opts.measure) pages[floatPara.page].push({ x: inLineX(), y: lineY + ot, html: tableHtml(ctx, t, 0) });
      if (floatPara.page === pages.length - 1) y = Math.max(y, lineY + ot + h + ob + (host.lines[0]?.spacing ?? 0));
      floatPara = null;
      prevAfter = 0;
      continue;
    }
    if (host?.pageBreak && (y > 0 || cur().length)) newPage();
    floatPara = t.pos.treatAsChar ? null : { page: pages.length - 1, y, prevAfter };
    // 글자처럼 놓은 표는 문단 줄 안(문단 위 간격 뒤), 띄운 표는 문단 위(간격 전) + 세로 떨어짐
    if (t.pos.treatAsChar) y += (y > 0 ? prevAfter : 0) + (hpp?.before ?? 0);
    const top = y + (t.pos.treatAsChar ? 0 : Math.max(0, t.pos.vertOffset)) + ot;
    // 가로: 띄운 표는 문단 기준 가로 떨어짐, 글자처럼 놓은 표는 문단 정렬대로(표가 문단 폭보다 넓으면 왼쪽 — 원본 PDF)
    const x = t.pos.treatAsChar ? inLineX() : t.pos.horzOffset + ol;
    const gapBelow = Math.max(ob, TABLE_BOTTOM_MIN);
    const parts = paginateTable(t, bodyH - top - gapBelow, bodyH - ot - gapBelow);
    parts.forEach((part, j) => {
      if (j > 0) newPage();
      const py = j === 0 ? top : ot;
      if (part.hs.length) {
        tell();
        cur().push({ x, y: py, html: html(() => tablePartHtml(ctx, t, part, 0, grid)) });
      }
      y = py + part.height;
    });
    y += ob + (t.pos.treatAsChar ? (host?.lines[0]?.spacing ?? 0) : 0);
    prevAfter = 0;
  }
  return pages;
}

/** 쪽 꾸밈: 꼬리말(쪽 번호 자동 번호 포함)·쪽 번호 위치·첫 쪽 번호(원본 문서의 쪽 번호) */
export interface PageDeco {
  footer?: HeadFoot;
  pageNum?: PageNumPos;
  firstPage?: number;
  /** 첫 쪽 위 빈자리(startY 위 — 원본에서 앞 내용이 놓인 자리)에 옅게 적을 안내 글. 없으면 비워 둠 */
  startNote?: string;
}

/** 쪽 번호 글(번호 모양 0 = 1, 2, 3 — 그 밖의 모양도 아라비아 숫자로) */
const pageNumText = (n: number) => String(n);

/** 쪽 보기 HTML: 쪽 크기 상자에 본문 자리를 두고 덩이들을 그 안 제자리에, 꼬리말·쪽 번호는 원본 자리에 */
export function pagesHtml(ctx: HtmlCtx, blocks: LayoutBlock[], page: PageDef, startY = 0, deco: PageDeco = {}): string {
  const pages = layoutPages(ctx, blocks, page, startY);
  const bodyH = page.height - page.top - page.bottom - page.header - page.footer;
  const textW = page.width - page.left - page.right;
  const body = `left:${f3(px(page.left))}px;top:${f3(px(page.top + page.header))}px;width:${f3(px(textW))}px;height:${f3(px(bodyH))}px`;
  // 꼬리말 칸: 본문 아래 꼬리말 높이만큼, 칸 안 세로 정렬대로. 쪽 번호 자동 번호는 자리표시(data-hw-field="page")에 번호
  const foot = deco.footer
    ? `<div class="hw-foot" style="left:${f3(px(page.left))}px;top:${f3(px(page.height - page.bottom - page.footer))}px;width:${f3(px(textW))}px;height:${f3(px(page.footer))}px;justify-content:${deco.footer.vertAlign === "BOTTOM" ? "flex-end" : deco.footer.vertAlign === "CENTER" ? "center" : "flex-start"}">${deco.footer.paras
        .map((p, i, ps) => paraHtml(ctx, p, { first: i === 0, last: i === ps.length - 1, prevAfter: 0, width: textW, depth: 0 }).html)
        .join("")}</div>`
    : "";
  // 쪽 번호 위치(아래 가운데 등): 「- n -」을 꼬리말 칸 아래 끝에 — 한글이 찍는 모양(앞뒤 줄표와 빈칸)
  const cp = deco.pageNum ? ctx.doc.charPrs[deco.pageNum.charPr] : undefined;
  const pnFace = cp ? fontStack(cp.face[0]) : "serif";
  const pnSize = cp ? px(cp.height) : px(1000);
  const pnHtml = (n: number) => {
    const pn = deco.pageNum;
    if (!pn || pn.position < 4 || pn.position > 6) return "";
    const text = `${pn.dash ? `${pn.dash} ` : ""}${pn.prefix}${pageNumText(n)}${pn.suffix}${pn.dash ? ` ${pn.dash}` : ""}`;
    const align = pn.position === 4 ? "left" : pn.position === 6 ? "right" : "center";
    return `<div class="hw-pn" style="left:${f3(px(page.left))}px;top:${f3(px(page.height - page.bottom) - pnSize)}px;width:${f3(px(textW))}px;height:${f3(pnSize)}px;line-height:${f3(pnSize)}px;font-size:${f3(pnSize)}px;font-family:${pnFace};text-align:${align}">${escHtml(text)}</div>`;
  };
  const first = deco.firstPage ?? 1;
  return pages
    .map((list, i) => {
      const n = first + i;
      const f = foot.replace(/(data-hw-field="page"[^>]*>)0</g, `$1${pageNumText(n)}<`);
      const note = i === 0 && startY > 0 && deco.startNote ? `<div class="hw-prev" style="height:${f3(Math.max(0, px(startY) - 6))}px">${escHtml(deco.startNote)}</div>` : "";
      return `<div class="hw-page" data-page="${i + 1}" style="width:${f3(px(page.width))}px;height:${f3(px(page.height))}px"><div class="hw-body" style="${body}">${note}${list
        .map((it) => `<div class="hw-pb" style="left:${f3(px(it.x))}px;top:${f3(px(it.y))}px">${it.html}</div>`)
        .join("")}</div>${f}${pnHtml(n)}</div>`;
    })
    .join("");
}

/** 쪽 보기 CSS(쪽 상자·본문 자리). HW_CSS와 함께 */
export const PAGES_CSS = `
.hw-pages{display:flex;flex-direction:column;align-items:center;gap:16px}
.hw-page{position:relative;flex:none;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.12),0 2px 6px rgba(0,0,0,.08)}
.hw-body{position:absolute}
.hw-pb{position:absolute}
.hw-foot{position:absolute;display:flex;flex-direction:column}
.hw-pn{position:absolute;color:#000;white-space:pre}
.hw-prev{position:absolute;left:0;top:0;width:100%;box-sizing:border-box;border:1px dashed #d4d0c8;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#8a8690;font:12px/1.4 system-ui,sans-serif;pointer-events:none;user-select:none}
`;
