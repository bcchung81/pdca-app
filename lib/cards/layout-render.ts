// 과제관리카드를 원본 배치(한글 파일에서 뗀 cards.layout)와 지금 카드 JSON으로 원본 그대로 그립니다(순수 함수 — 서버·브라우저 공용).
//  · 배치의 문단마다 적재 때 맞춘 경로(layout-bind.ts의 잇기 표시)가 있음. 지금 JSON과는 목록마다 글 내용으로 다시 맞춤
//  · 글이 원본과 같으면(빈칸·기호 차이만) 원본 줄 배치 그대로, 달라졌으면 같은 문단·글자 모양으로 흘려 그림
//  · 목록 줄이 늘면 모양이 같은 줄을 본떠 끼워 넣고, 줄어들면 뺌. 월별 실적 상자·계량지표 행·경영관리 짝 칸 표(전년도 환류·지적 및 개선방안) 행이
//    늘면 앞 상자·행을 복제(복제 행의 잇기 표시는 새 번호로), 줄면 뺌 — 행은 글 내용으로 맞춤(alignLists)
//  · AX 붙임이 새로 늘면(원본에 틀이 없음) 원본 양식 렌더러(render.ts)로 이어 그림
//  · 편집 표시(data-p·contenteditable·kc-ln·data-toggle·data-locked·data-empty)는 render.ts와 같은 뜻 — 편집기·리뷰어가 그대로 동작.
//    편집 글(innerText)은 카드 JSON 글과 같게 둠(원본에만 있는 글자는 CSS로 모양만, JSON에만 있는 글자는 폭 없이)

import { HW_CSS, tableHtml, paraHtml, type HtmlCtx } from "../hwp/html.ts";
import { type CardLayout, layoutDoc, layoutStartY } from "../hwp/layout.ts";
import { PAGES_CSS, pagesHtml } from "../hwp/pages.ts";
import type { Cell, Inline, Para, Shape, Table } from "../hwp/model.ts";
import { type Anchor, type BoundPara, type Target, isSym, isWs, keyOf, paraSegments, targetsOf } from "./layout-bind.ts";
import { esc, lineClass, lineHead, renderAxEditable } from "./render.ts";
import type { LooseJson } from "../loose-json.ts";

type Json = LooseJson;

export interface LayoutRenderOptions {
  editable?: boolean;
  selectable?: boolean;
  locked?: string[];
  /** 그림 저장소 이름 → 주소(없으면 그림 자리만) */
  imageUrl?: (key: string) => string | null;
  /** 새로 는 AX 붙임을 바로 앞 붙임의 표를 본떠 이어 씀(그림은 뺌, 없는 칸은 비움) — 한글 파일로 쓸 때 */
  cloneNewAx?: boolean;
  /** 원본 문서 첫머리 묶음 제목 표(layout.lead)도 맨 위에 그림(renderLayoutCard) — 「한글(화면 그대로)」 숨은 사본: 한글 내려받기(layout-hwpx.ts)처럼
   *  다시 올리면 묶음을 알아보게. 없으면 그리지 않음(카드 화면) */
  lead?: boolean;
}

// ───────────────────────── 배치 훑기(고칠 수 있게 부모·칸·표까지)

interface Entry {
  para: BoundPara;
  /** 이 문단이 든 목록(끼워 넣기·빼기) */
  list: Para[];
  cell: Cell | null;
  table: Table | null;
  block: number;
  /** 글상자 속 문단: 그 글상자를 품은 문단과 그 안의 개체 */
  host: { para: Para; item: Inline } | null;
  /** 바깥 칸부터 이 문단이 든 칸까지(중첩 표) */
  chain: Cell[];
}

function entriesOf(l: CardLayout): Entry[] {
  const out: Entry[] = [];
  const visitParas = (ps: Para[], cell: Cell | null, table: Table | null, block: number, host: Entry["host"], chain: Cell[]) => {
    for (const p of ps) visitPara(p, ps, cell, table, block, host, chain);
  };
  const visitObj = (o: Table | Shape | { kind: "pic" }, block: number, host: Entry["host"], cell: Cell | null, table: Table | null, chain: Cell[]) => {
    if (o.kind === "table") for (const c of (o as Table).cells) visitParas(c.paras, c, o as Table, block, null, [...chain, c]);
    else if (o.kind !== "pic") {
      const s = o as Shape;
      if (s.text) visitParas(s.text.paras, cell, table, block, host, chain);
      for (const ch of s.children) visitObj(ch, block, host, cell, table, chain);
    }
  };
  function visitPara(p: Para, list: Para[], cell: Cell | null, table: Table | null, block: number, host: Entry["host"], chain: Cell[]) {
    out.push({ para: p as BoundPara, list, cell, table, block, host, chain });
    for (const it of p.items) if (it.kind === "obj") visitObj(it.obj, block, { para: p, item: it }, cell, table, chain);
  }
  l.blocks.forEach((b, bi) => {
    if (b.kind === "table") for (const c of b.table.cells) visitParas(c.paras, c, b.table, bi, null, [c]);
    else visitPara(b.para, [], null, null, bi, null, []);
  });
  return out;
}

/** 글이 바뀐 칸들이 든 행은 저장된 높이를 풀어 내용대로(원본 높이는 원본 글 기준) */
function releaseHeights(l: CardLayout, dirty: Set<Cell>) {
  if (!dirty.size) return;
  const visit = (t: Table) => {
    const rows = new Set<number>();
    for (const c of t.cells) if (dirty.has(c)) for (let r = c.row; r < c.row + c.rowSpan; r++) rows.add(r);
    if (rows.size) for (const c of t.cells) if ([...rows].some((r) => r >= c.row && r < c.row + c.rowSpan)) c.height = 0;
    for (const c of t.cells) for (const p of c.paras) for (const it of p.items) if (it.kind === "obj" && it.obj.kind === "table") visit(it.obj);
  };
  for (const b of l.blocks) if (b.kind === "table") visit(b.table);
}

// ───────────────────────── 경로 다루기

const LIST_ITEM = /^(.*)\.(\d+)$/;
const lineContainer = (path: string) => {
  const m = LIST_ITEM.exec(path);
  return m ? { list: m[1], index: Number(m[2]) } : null;
};

/** 순서 보존 맞춤: 같은 열쇠끼리 최장 공통 부분열, 그 사이는 차례대로 짝(글이 고쳐진 줄) — [원래 번호, 지금 번호|null][] + 짝 없는 지금 번호 */
function alignLists(orig: string[], cur: string[]): { pairs: Map<number, number | null>; added: number[] } {
  const n = orig.length;
  const m = cur.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = orig[i] && orig[i] === cur[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const same: [number, number][] = [];
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (orig[i] && orig[i] === cur[j]) {
      same.push([i, j]);
      i++;
      j++;
    } else if (L[i + 1][j] >= L[i][j + 1]) i++;
    else j++;
  }
  const pairs = new Map<number, number | null>();
  const added: number[] = [];
  let pi = 0;
  let pj = 0;
  for (const [si, sj] of [...same, [n, m] as [number, number]]) {
    // 사이 구간: 차례대로 짝(고친 줄), 남는 원래 줄은 지움, 남는 지금 줄은 새 줄
    const gi = si - pi;
    const gj = sj - pj;
    const k = Math.min(gi, gj);
    for (let t = 0; t < k; t++) pairs.set(pi + t, pj + t);
    for (let t = k; t < gi; t++) pairs.set(pi + t, null);
    for (let t = k; t < gj; t++) added.push(pj + t);
    if (si < n) pairs.set(si, sj);
    pi = si + 1;
    pj = sj + 1;
  }
  return { pairs, added };
}

// ───────────────────────── 표 행 복제·삭제(월별 실적 상자·계량지표 행·경영관리 짝 칸 표 행)

function rowRange(cells: Cell[]): [number, number] {
  let a = Infinity;
  let b = -Infinity;
  for (const c of cells) {
    a = Math.min(a, c.row);
    b = Math.max(b, c.row + c.rowSpan - 1);
  }
  return [a, b];
}

/** [r0, r1] 행의 높이 합(한 행짜리 칸 중 가장 큰 높이) — 행을 늘리고 줄일 때 표 크기 높이를 맞춤 */
function rowsHeight(t: Table, r0: number, r1: number): number {
  let sum = 0;
  for (let r = r0; r <= r1; r++) sum += Math.max(0, ...t.cells.filter((c) => c.row === r && c.rowSpan === 1).map((c) => c.height));
  return sum;
}

/** 표의 [r0, r1] 행을 복제해 after 행 뒤에 넣음. 그 행들을 모두 덮는 바깥 칸(구역 이름 칸 등)은 늘림. 복제한 칸 목록을 돌려줌 */
function cloneRows(t: Table, r0: number, r1: number, after: number): Map<Cell, Cell> {
  t.pos = { ...t.pos, height: t.pos.height + rowsHeight(t, r0, r1) };
  const H = r1 - r0 + 1;
  const ins = after + 1;
  const inner = t.cells.filter((c) => c.row >= r0 && c.row + c.rowSpan - 1 <= r1);
  // 복제는 행을 밀기 전에(본뜰 행보다 앞에 넣을 때 — 짝 칸 표 맨 앞 행 — 본뜰 행이 먼저 밀려 복제 자리가 어긋나지 않게)
  const copies = new Map<Cell, Cell>();
  for (const c of inner) {
    const k = structuredClone(c);
    k.row = c.row - r0 + ins;
    copies.set(c, k);
  }
  for (const c of t.cells) {
    if (c.row >= ins) c.row += H;
    else if (c.row + c.rowSpan - 1 >= ins - 1 && c.row <= r0 && c.row + c.rowSpan - 1 >= r1 && !inner.includes(c)) c.rowSpan += H;
    else if (c.row < ins && c.row + c.rowSpan - 1 >= ins) c.rowSpan += H;
  }
  t.cells.push(...copies.values());
  t.cells.sort((a, b) => a.row - b.row || a.col - b.col);
  for (const z of t.zones ?? []) {
    if (z.r0 >= ins) z.r0 += H;
    if (z.r1 >= ins) z.r1 += H;
  }
  t.rows += H;
  return copies;
}

function dropRows(t: Table, r0: number, r1: number): void {
  const H = r1 - r0 + 1;
  t.pos = { ...t.pos, height: Math.max(0, t.pos.height - rowsHeight(t, r0, r1)) };
  t.cells = t.cells.filter((c) => !(c.row >= r0 && c.row + c.rowSpan - 1 <= r1));
  for (const c of t.cells) {
    if (c.row > r1) c.row -= H;
    else if (c.row <= r1 && c.row + c.rowSpan - 1 >= r0) c.rowSpan = Math.max(1, c.rowSpan - Math.min(H, c.row + c.rowSpan - r0, r1 - c.row + 1));
  }
  t.zones = t.zones?.filter((z) => !(z.r0 >= r0 && z.r1 <= r1));
  for (const z of t.zones ?? []) {
    if (z.r0 > r1) z.r0 -= H;
    if (z.r1 >= r0) z.r1 = Math.max(z.r0, z.r1 - Math.min(H, z.r1 - r0 + 1));
  }
  t.rows -= H;
}

// ───────────────────────── 글자 맞추기(원본 글 T ↔ 카드 글 S)

type Op = { op: "keep"; t: number; s: string } | { op: "gen"; t: number } | { op: "zero"; after: number; s: string };

/**
 * 원본 글 T에 카드 글 S를 얹는 차례(빈칸·기호만 다르면 성공, 아니면 null).
 *  keep: T 글자 자리에 S 글자 · gen: T 글자를 모양만 · zero: S에만 있는 글자(폭 없이)
 *  allowEdge: T 앞뒤에 S에 없는 고정 글이 있어도 됨(과제명 뒤 「과제번호」 등)
 */
function alignChars(T: string[], S: string[], allowEdge: boolean): Op[] | null {
  let t0 = 0;
  let t1 = T.length;
  if (allowEdge) {
    // S의 알맹이(빈칸·기호 뺀 글자)가 T 안 어디서 시작·끝나는지
    const tk: number[] = [];
    let tkey = "";
    T.forEach((ch, i) => {
      if (!isWs(ch) && !isSym(ch)) {
        tk.push(i);
        tkey += ch;
      }
    });
    const skey = S.filter((ch) => !isWs(ch) && !isSym(ch)).join("");
    if (skey) {
      const at = tkey.indexOf(skey);
      if (at < 0) return null;
      t0 = tk[at];
      t1 = tk[at + [...skey].length - 1] + 1;
      // S 앞뒤의 빈칸·기호가 T에도 있으면 함께
      let lead = 0;
      while (lead < S.length && (isWs(S[lead]) || isSym(S[lead]))) lead++;
      while (lead > 0 && t0 > 0 && (isWs(T[t0 - 1]) || isSym(T[t0 - 1]))) {
        t0--;
        lead--;
      }
      let tail = 0;
      while (tail < S.length && (isWs(S[S.length - 1 - tail]) || isSym(S[S.length - 1 - tail]))) tail++;
      while (tail > 0 && t1 < T.length && (isWs(T[t1]) || isSym(T[t1]))) {
        t1++;
        tail--;
      }
    }
  }
  const t = T.slice(t0, t1);
  const n = t.length;
  const m = S.length;
  const INF = 1e9;
  const W = m + 1;
  const cost = new Float64Array((n + 1) * W).fill(INF);
  const how = new Int8Array((n + 1) * W);
  cost[0] = 0;
  const soft = (ch: string) => isWs(ch) || isSym(ch) || ch === "\n";
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= m; j++) {
      const here = cost[i * W + j];
      if (here >= INF) continue;
      if (i < n && j < m) {
        const a = t[i];
        const b = S[j];
        // 빈칸은 줄바꿈(문단 경계·강제 줄바꿈) 자리와 먼저 짝지음 — 편집 글에서 경계가 곧 빈칸이 되어 빈칸이 겹치지 않게
        const c = a === b ? (a === " " && b === " " ? 0.001 : 0) : a === "\n" && isWs(b) ? 0 : isWs(a) && isWs(b) ? 0.001 : isSym(a) && isSym(b) ? 0.01 : INF;
        if (here + c < cost[(i + 1) * W + j + 1]) {
          cost[(i + 1) * W + j + 1] = here + c;
          how[(i + 1) * W + j + 1] = 1;
        }
      }
      if (i < n && soft(t[i]) && here + 0.1 < cost[(i + 1) * W + j]) {
        cost[(i + 1) * W + j] = here + 0.1;
        how[(i + 1) * W + j] = 2;
      }
      if (j < m && (isWs(S[j]) || isSym(S[j])) && here + 0.1 < cost[i * W + j + 1]) {
        cost[i * W + j + 1] = here + 0.1;
        how[i * W + j + 1] = 3;
      }
    }
  if (cost[n * W + m] >= INF) return null;
  const ops: Op[] = [];
  for (let i = n, j = m; i > 0 || j > 0; ) {
    const h = how[i * W + j];
    if (h === 1) {
      ops.push({ op: "keep", t: t0 + i - 1, s: S[j - 1] });
      i--;
      j--;
    } else if (h === 2) {
      ops.push({ op: "gen", t: t0 + i - 1 });
      i--;
    } else {
      ops.push({ op: "zero", after: t0 + i - 1, s: S[j - 1] });
      j--;
    }
  }
  ops.reverse();
  const edge: Op[] = [];
  for (let i = 0; i < t0; i++) edge.push({ op: "gen", t: i });
  const tailOps: Op[] = [];
  for (let i = t1; i < T.length; i++) tailOps.push({ op: "gen", t: i });
  return [...edge, ...ops, ...tailOps];
}

// ───────────────────────── 문단 글 다시 짜기

/** 문단의 글자 자리(개체·겹침 글자 제외): 글자, 한글 위치, 글자 모양 */
interface Slot {
  ch: string;
  pos: number;
  cp: number;
}

function slotsOf(p: Para): Slot[] {
  const out: Slot[] = [];
  for (const it of p.items) {
    if (it.kind === "text") {
      let pos = it.pos;
      for (const ch of it.text) {
        out.push({ ch, pos, cp: it.charPr });
        pos += ch.length;
      }
    } else if (it.kind === "tab") out.push({ ch: "\t", pos: it.pos, cp: it.charPr });
    else if (it.kind === "br") out.push({ ch: "\n", pos: it.pos, cp: it.charPr });
  }
  return out;
}

const BOX = /[☑□☐]/;

interface Toggles {
  inner: string[];
  before: string[];
  /** 잇기 때 칸 글의 체크 상자들(원본 상자 글자를 파일에 그대로 쓸지 가림) */
  orig?: string;
}

/** 체크 상자 글자에 토글 표지(render.ts의 boxSpan과 같은 뜻) */
function toggleAttrs(path: string | undefined, checked: boolean): string {
  return path ? ` class="kc-cb" role="img" aria-label="${checked ? "선택함" : "선택 안 함"}" data-toggle="${esc(path)}"` : "";
}

/**
 * 원본 줄 배치를 지키며 글을 바꿈(맞추기 성공한 경우). 개체·겹침 글자·줄바꿈은 제자리에 둠.
 * 돌려주는 items는 원래 위치(pos)를 그대로 써서 줄 배치(lineseg)가 그대로 맞음
 */
function exactItems(p: Para, slots: Slot[], ops: Op[], tg: Toggles, boxBase: { n: number; before: number }): Inline[] {
  const items: Inline[] = p.items.filter((it) => it.kind === "obj" || it.kind === "compose" || it.kind === "br");
  for (const o of ops) {
    if (o.op === "keep") {
      const sl = slots[o.t];
      if (sl.ch === "\n") {
        if (o.s !== "\n") items.push({ kind: "zero", pos: sl.pos + 0.5, charPr: sl.cp, text: o.s });
        continue;
      }
      const s = o.s;
      const k = boxBase.n;
      const attrs = BOX.test(s) ? toggleAttrs(tg.inner[boxBase.n++], s === "☑") : undefined;
      const shown = s === "\u00a0" ? " " : s;
      // 원본 글자와 빈칸·기호 종류만 다르면(묶음·고정폭 빈칸, ☐ 등) 파일에는 원본 글자. 상자는 선택 상태가 같을 때만
      // (기호 글꼴로 그린 상자는 잇기 때의 상태와 같을 때)
      const keepGlyph = BOX.test(s) && !BOX.test(sl.ch) && isSym(sl.ch) && [...(tg.orig ?? "")][k] === s;
      const raw = sl.ch !== shown && (sl.ch === s || sameKind(sl.ch, s) || keepGlyph) ? sl.ch : undefined;
      items.push({ kind: "text", pos: sl.pos, charPr: sl.cp, text: shown, ...(attrs ? { attrs } : {}), ...(raw ? { raw } : {}) });
    } else if (o.op === "gen") {
      const sl = slots[o.t];
      if (sl.ch === "\n") continue;
      const attrs = BOX.test(sl.ch) && boxBase.before < tg.before.length ? toggleAttrs(tg.before[boxBase.before++], sl.ch === "☑") : undefined;
      items.push({ kind: "gen", pos: sl.pos, charPr: sl.cp, text: sl.ch, ...(attrs ? { attrs } : {}) });
    } else {
      const sl = slots[Math.max(0, o.after)] ?? slots[0];
      // 첫 글자 앞 글자는 첫 글자 자리에(같은 자리면 먼저 넣은 것이 앞 — 줄 배치의 첫 줄에 들게)
      const pos = o.after >= 0 && slots[o.after] ? slots[o.after].pos + 0.5 : (slots[0]?.pos ?? 0);
      const attrs = BOX.test(o.s) ? toggleAttrs(tg.inner[boxBase.n++], o.s === "☑") : undefined;
      if (attrs) items.push({ kind: "text", pos, charPr: sl?.cp ?? 0, text: o.s, attrs });
      else items.push({ kind: "zero", pos, charPr: sl?.cp ?? 0, text: o.s });
    }
  }
  items.sort((a, b) => a.pos - b.pos);
  return mergeText(items);
}

/** 빈칸끼리·상자(선택 상태가 같은)끼리·그 밖의 기호끼리 */
function sameKind(a: string, b: string): boolean {
  if (isWs(a) && isWs(b)) return true;
  if (BOX.test(a) || BOX.test(b)) return BOX.test(a) && BOX.test(b) && (a === "☑") === (b === "☑");
  return isSym(a) && isSym(b);
}

/** 이웃한 같은 모양 글자를 한 조각으로 */
function mergeText(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (it.kind === "text" && prev && prev.kind === "text" && prev.charPr === it.charPr && !prev.attrs && !it.attrs && Number.isInteger(it.pos) && prev.pos + prev.text.length === it.pos) {
      if (prev.raw !== undefined || it.raw !== undefined) prev.raw = (prev.raw ?? prev.text) + (it.raw ?? it.text);
      prev.text += it.text;
      continue;
    }
    out.push({ ...it });
  }
  return out;
}

/**
 * 원본과 글이 달라진 문단: 원본 글자 모양을 앞뒤 같은 부분에서 가져와(바뀐 가운데는 그 앞 글자 모양) 흘려 그릴 글로.
 * 개체는 글 앞(원래 글보다 앞에 있던 것)·뒤로 둠
 */
/**
 * 새 글자마다 글자 모양: 원본과 앞뒤가 많이 같으면(조금 고친 글) 같은 부분은 제 모양·바뀐 가운데는 앞 글자 모양,
 * 아니면(새 글) 원본 줄의 짜임(글머리 · 굵은 「(머리)」 · 본문 — 원본 양식 렌더러와 같은 규칙)대로 원본의 그 부분 모양
 */
function charPrMapper(slots: Slot[], S: string[], fallback: number): (j: number) => number {
  const T = slots.map((s) => s.ch);
  let pre = 0;
  while (pre < T.length && pre < S.length && T[pre] === S[pre]) pre++;
  let suf = 0;
  while (suf < T.length - pre && suf < S.length - pre && T[T.length - 1 - suf] === S[S.length - 1 - suf]) suf++;
  const firstCp = slots.find((s) => !isWs(s.ch))?.cp ?? fallback;
  if (S.length && (pre + suf) * 2 >= S.length)
    return (j) => {
      if (j < pre) return slots[j].cp;
      if (j >= S.length - suf) return slots[T.length - (S.length - j)].cp;
      return slots[Math.max(0, pre - 1)]?.cp ?? firstCp;
    };
  const shape = (cs: string[]) => {
    let lead = 0;
    while (lead < cs.length && isWs(cs[lead])) lead++;
    const body = cs.slice(lead).join("");
    const lh = lineHead(body, lineClass(body));
    const m = lh ? [...lh[0]].length : 0;
    const h = lh ? [...lh[1]].length : 0;
    return { lead, m, h, head: Boolean(lh) };
  };
  const ts = shape(T);
  const ss = shape(S);
  const cpOf = (k: number) => slots[Math.min(slots.length - 1, Math.max(0, k))]?.cp ?? firstCp;
  const restStart = ts.lead + ts.m + ts.h;
  const restCp = slots.slice(restStart).find((s) => !isWs(s.ch))?.cp ?? firstCp;
  return (j) => {
    const q = j - ss.lead;
    if (q < 0) return firstCp;
    if (q < ss.m) return ts.m ? cpOf(ts.lead + Math.min(q, ts.m - 1)) : firstCp;
    if (ss.head && q < ss.m + ss.h) return ts.head ? cpOf(ts.lead + ts.m + Math.min(q - ss.m, ts.h - 1)) : restCp;
    return restCp;
  };
}

function flowItems(p: Para, slots: Slot[], S: string[], tg: Toggles): Inline[] {
  const fallback = slots.find((s) => !isWs(s.ch))?.cp ?? p.endCharPr ?? p.items[0]?.charPr ?? 0;
  const cpAt = charPrMapper(slots, S, fallback);
  const firstText = slots.find((s) => !isWs(s.ch))?.pos ?? Infinity;
  const before = p.items.filter((it) => (it.kind === "obj" || it.kind === "compose") && it.pos < firstText);
  const after = p.items.filter((it) => (it.kind === "obj" || it.kind === "compose") && it.pos >= firstText);
  const out: Inline[] = before.map((it, k) => ({ ...it, pos: k - before.length }));
  let box = 0;
  S.forEach((ch, j) => {
    if (ch === "\n") {
      out.push({ kind: "br", pos: j, charPr: cpAt(j) });
      return;
    }
    const attrs = BOX.test(ch) ? toggleAttrs(tg.inner[box++], ch === "☑") : undefined;
    out.push({ kind: "text", pos: j, charPr: cpAt(j), text: ch, ...(attrs ? { attrs } : {}) });
  });
  after.forEach((it, k) => out.push({ ...it, pos: S.length + k }));
  return mergeFlow(out);
}

function mergeFlow(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (it.kind === "text" && prev && prev.kind === "text" && prev.charPr === it.charPr && !prev.attrs && !it.attrs) {
      prev.text += it.text;
      continue;
    }
    out.push({ ...it });
  }
  return out;
}

// ───────────────────────── 편집 표시

interface Marks {
  editable: boolean;
  selectable: boolean;
  locked: string[];
}

const isLocked = (m: Marks, path: string) => m.locked.some((p) => path === p || path.startsWith(`${p}.`));

/** render.ts Ctx.ed와 같은 뜻의 편집 속성 */
function edAttrs(m: Marks, t: Target, opts: { editable?: boolean } = {}): string {
  if (!m.editable && !m.selectable) return "";
  const p = ` data-p="${esc(t.path)}"`;
  const empty = t.empty ? ' data-empty="1"' : "";
  if (m.selectable || opts.editable === false) return `${p} tabindex="0"${empty}`;
  if (isLocked(m, t.path)) return `${p} tabindex="0" data-locked="1"${empty}`;
  return `${p} contenteditable="plaintext-only" spellcheck="false"${empty}`;
}

// ───────────────────────── 그리기

/** 지금 카드 JSON을 얹은 배치(원본 배치의 사본) */
export interface AppliedLayout {
  layout: CardLayout;
  /** 원본에 틀이 없는 새 AX 붙임(카드 JSON 번호) */
  extraAx: number[];
  /** 글이 바뀐 칸(그 행의 저장된 높이는 원본 글 기준) */
  dirty: Set<Cell>;
}

/**
 * 원본 배치에 지금 카드 JSON을 얹음(그리기·한글 파일 쓰기 공통). 배치에 잇기 표시가 없거나 맞출 수 없으면 null
 */
export function applyCardToLayout(card: Json, layout: CardLayout, opts: LayoutRenderOptions = {}): AppliedLayout | null {
  const marks: Marks = { editable: Boolean(opts.editable || opts.selectable), selectable: Boolean(opts.selectable && !opts.editable), locked: opts.locked ?? [] };
  const L = structuredClone(layout) as CardLayout;
  const targets = targetsOf(card, opts.locked);
  const cur = new Map(targets.map((t) => [t.path, t]));
  let entries = entriesOf(L);
  const anchored = () => entries.flatMap((e) => (e.para.bind ?? []).map((a, seg) => (a ? { e, a, seg } : null)).filter(Boolean) as { e: Entry; a: Anchor; seg: number }[]);
  if (!anchored().length) return null;

  // 1) 붙임(AX)·월별 상자·계량지표 행: 원래 몇째였는지 → 지금 몇째인지(글로 맞춤). 없어진 것은 뺌, 새로 는 것은 복제
  const extraAx: number[] = [];
  const remap = (prefix: string, from: number, to: number | null) => {
    for (const { e, a, seg } of anchored()) {
      const m = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d+)(\\..*|~.*)?$`).exec(a.path);
      if (!m || Number(m[1]) !== from) continue;
      const bind = e.para.bind as (Anchor | null)[];
      bind[seg] = to === null ? null : { ...a, path: `${prefix}.${to}${m[2] ?? ""}`, remapped: true } as Anchor;
    }
  };
  const groupText = (prefix: string, keyOfTarget: (i: number) => string, count: number) => ({
    orig: (() => {
      const byIdx = new Map<number, string[]>();
      for (const { e, a, seg } of anchored()) {
        const m = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d+)[.~]`).exec(a.path);
        if (m) byIdx.set(Number(m[1]), [...(byIdx.get(Number(m[1])) ?? []), paraSegments(e.para)[seg] ?? ""]);
      }
      return byIdx;
    })(),
    cur: Array.from({ length: count }, (_, i) => keyOfTarget(i)),
  });
  const curGroupKey = (prefix: string) => (i: number) =>
    keyOf(
      targets
        .filter((t) => t.path.startsWith(`${prefix}.${i}.`) || t.path.startsWith(`${prefix}.${i}~`))
        .map((t) => t.text)
        .join(""),
    );

  // AX 붙임
  {
    const n = Array.isArray(card.axAttachments) ? card.axAttachments.length : 0;
    const g = groupText("axAttachments", curGroupKey("axAttachments"), n);
    const origIdx = [...g.orig.keys()].sort((a, b) => a - b);
    const { pairs, added } = alignLists(
      origIdx.map((i) => keyOf((g.orig.get(i) ?? []).join(""))),
      g.cur,
    );
    const dropBlocks = new Set<number>();
    origIdx.forEach((oi, k) => {
      const to = pairs.get(k) ?? null;
      if (to === null) for (const { e, a } of anchored()) if (a.path.startsWith(`axAttachments.${oi}.`) || a.path.startsWith(`axAttachments.${oi}~`)) dropBlocks.add(e.block);
    });
    // 번호를 한꺼번에 바꿈(겹치지 않게 임시 표시 거쳐)
    origIdx.forEach((oi, k) => remap("axAttachments", oi, pairs.get(k) === null ? null : -1000 - (pairs.get(k) as number)));
    for (const { a } of anchored()) if (/^axAttachments\.-\d+/.test(a.path)) a.path = a.path.replace(/^axAttachments\.-(\d+)/, (_m, d) => `axAttachments.${Number(d) - 1000}`);
    if (dropBlocks.size) {
      L.blocks = L.blocks.filter((_, bi) => !dropBlocks.has(bi));
      entries = entriesOf(L);
    }
    const axBlocks = (idx: number) => {
      const set = new Set<number>();
      for (const { e, a } of anchored()) if (a.path.startsWith(`axAttachments.${idx}.`) || a.path.startsWith(`axAttachments.${idx}~`)) set.add(e.block);
      return [...set].sort((x, y) => x - y);
    };
    for (const c of [...added].sort((x, y) => x - y)) {
      // 본뜰 붙임: 가장 가까운 앞 번호(없으면 뒤 번호)의 표 덩이들
      let src = -1;
      for (let q = c - 1; q >= 0 && src < 0; q--) if (axBlocks(q).length) src = q;
      for (let q = c + 1; q < n && src < 0; q++) if (axBlocks(q).length) src = q;
      if (!opts.cloneNewAx || src < 0) {
        extraAx.push(c);
        continue;
      }
      const tpl = axBlocks(src);
      let last = -1;
      for (let q = 0; q < c; q++) last = Math.max(last, ...axBlocks(q));
      const copies = tpl.map((bi) => structuredClone(L.blocks[bi]));
      for (const blk of copies) cloneAxBlock(blk, src, c);
      L.blocks.splice(last >= 0 ? last + 1 : tpl[0], 0, ...copies);
      entries = entriesOf(L);
    }
  }

  // 월별 실적 상자·계량지표 행·경영관리 짝 칸 표(전년도 환류·지적 및 개선방안 — 행마다 [왼쪽 칸 | 오른쪽 칸])의 행
  const cloned: Cell[] = [];
  for (const prefix of ["do.monthly", "kpi.rows", "feedback.rows", "findings.rows"]) {
    const arr = prefix.split(".").reduce((o, k) => o?.[k], card);
    const n = Array.isArray(arr) ? arr.length : 0;
    const pair = prefix === "feedback.rows" || prefix === "findings.rows";
    const g = groupText(prefix, curGroupKey(prefix), n);
    const origIdx = [...g.orig.keys()].sort((a, b) => a - b);
    if (!origIdx.length) {
      if (n && !pair) return null; // 틀로 쓸 행이 없음(짝 칸 표는 예전처럼 행 맞춤 없이 글줄만 — 주요사업 카드는 이 표가 없음)
      continue;
    }
    // 짝 칸 표가 0행(현행화에서 「삭제」를 승인해 글만 비운 표): 원본 행을 그대로 두고 글줄만 비움(행 맞춤 전과 같음)
    if (pair && !n) continue;
    const { pairs, added } = alignLists(
      origIdx.map((i) => keyOf((g.orig.get(i) ?? []).join(""))),
      g.cur,
    );
    // 행 범위(상자마다): 그 상자 글이 든 칸들이 차지하는 행
    const boxCells = (idx: number) => {
      const cells = new Set<Cell>();
      let table: Table | null = null;
      for (const { e, a } of anchored())
        if (new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.${idx}[.~]`).test(a.path) && e.cell && e.table) {
          // 칸 속 표(월별 상자 안의 작은 표)가 아니라 바깥 표의 칸을 찾음: 같은 덩이의 최상위 표
          const top = L.blocks[e.block];
          if (top?.kind !== "table") continue;
          const outer = top.table.cells.find((c) => c === e.cell || containsPara(c, e.para));
          if (outer) {
            cells.add(outer);
            table = top.table;
          }
        }
      return { cells: [...cells], table };
    };
    const origBox = new Map(origIdx.map((oi) => [oi, boxCells(oi)]));
    // 없어진 상자: 행 빼기(뒤에서부터)
    const dropped = origIdx.filter((_, k) => pairs.get(k) === null);
    for (const oi of [...dropped].sort((a, b) => b - a)) {
      const { cells, table } = origBox.get(oi)!;
      if (!table || !cells.length) continue;
      const [r0, r1] = rowRange(cells);
      dropRows(table, r0, r1);
    }
    // 번호 바꾸기
    origIdx.forEach((oi, k) => remap(prefix, oi, pairs.get(k) === null ? null : -1000 - (pairs.get(k) as number)));
    for (const { a } of anchored()) {
      const re = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.-(\\d+)`);
      if (re.test(a.path)) a.path = a.path.replace(re, (_m, d) => `${prefix}.${Number(d) - 1000}`);
    }
    entries = entriesOf(L);
    // 새 상자: 바로 앞 상자(없으면 첫 상자)의 행을 복제해 그 뒤에
    const liveOrig = origIdx.map((oi, k) => ({ oi, to: pairs.get(k) })).filter((x) => x.to !== null && x.to !== undefined) as { oi: number; to: number }[];
    for (const c of [...added].sort((a, b) => a - b)) {
      const prev = [...liveOrig].reverse().find((x) => x.to < c) ?? liveOrig[0];
      if (!prev) return null;
      const { cells: tcells, table } = boxCells(prev.to);
      if (!table || !tcells.length) return null;
      const [r0, r1] = rowRange(tcells);
      // 넣을 자리: 지금 번호 c보다 앞선 상자 중 마지막 상자의 행 뒤
      const before = [...liveOrig].filter((x) => x.to < c).map((x) => boxCells(x.to)).filter((b) => b.table === table && b.cells.length);
      const after = before.length ? Math.max(...before.map((b) => rowRange(b.cells)[1])) : r0 - 1;
      const copies = cloneRows(table, r0, r1, after);
      for (const k of copies.values()) cloned.push(k);
      // 복제한 칸의 잇기 표시를 새 상자 번호로
      for (const k of copies.values())
        forEachPara(k.paras, (p) => {
          const bp = p as BoundPara;
          if (!bp.bind) return;
          bp.bind = bp.bind.map((a) => {
            if (!a) return null;
            const re = new RegExp(`^${prefix.replace(/\./g, "\\.")}\\.(\\d+)`);
            return re.test(a.path) ? ({ ...a, path: a.path.replace(re, `${prefix}.${c}`), cloned: true } as Anchor) : null;
          });
        });
      liveOrig.push({ oi: -1, to: c });
      entries = entriesOf(L);
    }
  }

  // 글이 바뀐 칸(행 높이를 내용대로 풀 칸): 바깥 칸까지
  const dirty = new Set<Cell>();
  const touch = (p: Para) => {
    const e = entries.find((x) => x.para === p);
    if (e) for (const c of e.chain) dirty.add(c);
  };
  for (const c of cloned) dirty.add(c);

  // 2) 글줄 목록마다 원래 줄 ↔ 지금 줄 맞춤. 칸 글(한 칸·여러 문단에 걸친 칸)은 경로 그대로
  interface Hit {
    e: Entry;
    a: Anchor;
    seg: number;
  }
  const lists = new Map<string, (Hit & { idx: number })[]>();
  const cells = new Map<string, Hit[]>();
  for (const x of anchored()) {
    const lc = x.a.line ? lineContainer(x.a.path) : null;
    if (lc) lists.set(lc.list, [...(lists.get(lc.list) ?? []), { ...x, idx: lc.index }]);
    else cells.set(x.a.path, [...(cells.get(x.a.path) ?? []), x]);
  }
  // 문단 조각 → 지금 칸(없으면 null = 지운 줄)
  const segTarget = new Map<BoundPara, Map<number, { target: Target | null; anchor: Anchor; list: boolean }>>();
  const setSeg = (x: Hit, target: Target | null, list: boolean) => {
    const m = segTarget.get(x.e.para) ?? new Map();
    m.set(x.seg, { target, anchor: x.a, list });
    segTarget.set(x.e.para, m);
  };
  const inserts: { entry: Entry; where: "after" | "before"; t: Target; list: string }[] = [];
  const curListItems = (list: string) => {
    const out: Target[] = [];
    for (const t of targets) {
      const lc = lineContainer(t.path);
      if (lc && lc.list === list && t.line) out[lc.index] = t;
    }
    return out.filter(Boolean);
  };
  for (const [list, xs] of lists) {
    const origIdx = [...new Set(xs.map((x) => x.idx))].sort((p, q) => p - q);
    const origText = origIdx.map((i) =>
      keyOf(
        xs
          .filter((x) => x.idx === i)
          .map((x) => paraSegments(x.e.para)[x.seg] ?? "")
          .join(""),
      ),
    );
    const curItems = curListItems(list);
    const { pairs, added } = alignLists(
      origText,
      curItems.map((t) => keyOf(t.text)),
    );
    const posOf = new Map<number, Entry>();
    origIdx.forEach((oi, k) => {
      const to = pairs.get(k);
      const mine = xs.filter((y) => y.idx === oi);
      for (const x of mine) setSeg(x, to === null || to === undefined ? null : curItems[to], true);
      if (to !== null && to !== undefined && mine.length) posOf.set(to, mine[mine.length - 1].e);
    });
    const firstEntry = xs.find((x) => x.idx === origIdx[0])?.e;
    for (const j of added) {
      let anchorEntry: Entry | undefined;
      for (let q = j - 1; q >= 0; q--)
        if (posOf.has(q)) {
          anchorEntry = posOf.get(q);
          break;
        }
      if (anchorEntry) inserts.push({ entry: anchorEntry, where: "after", t: curItems[j], list });
      else if (firstEntry) inserts.push({ entry: firstEntry, where: "before", t: curItems[j], list });
    }
  }
  // 칸 글: 여러 문단에 걸친 칸(조각)은 칸째로 나눠 담고, 한 문단짜리는 문단째
  const boxCount = new Map<string, { n: number; before: number }>();
  for (const [path, xs] of cells) {
    const t = cur.get(path) ?? null;
    if (!t) {
      // 지금 카드에 없는 칸: 원본 글 그대로(고칠 수 없음). 본떠 이은 붙임의 칸이면 본뜬 글이 남지 않게 비움
      if (xs.some((x) => x.a.cloned))
        for (const x of xs) {
          x.e.para.items = x.e.para.items.filter((it) => it.kind === "obj" && it.obj.kind !== "pic");
          x.e.para.flow = true;
          touch(x.e.para);
        }
      continue;
    }
    // 여러 문단에 걸친 칸은 칸째로, 한 문단의 조각들(강제 줄바꿈으로 나뉜 과제명 등)은 문단째
    const paras = new Set(xs.map((x) => x.e.para));
    if (xs.some((x) => x.a.role === "part") && paras.size > 1) {
      // 한 칸의 여러 문단(두 줄 과제명 등)은 칸째 편집. 글상자에 든 조각(월 표시 딱지 등)은 조각마다 나눠 담음
      if (new Set(xs.map((x) => x.e.cell)).size === 1 && xs[0].e.cell && xs.every((x) => !x.e.host) && [...paras].every((p) => paraSegments(p).length === 1)) shapeCellParts(xs, t, marks, boxCount, touch);
      else shapeParts(xs, t, marks, boxCount, touch);
    } else for (const x of xs) setSeg(x, t, false);
  }

  // 3) 문단 다시 짜기
  for (const [para, bySeg] of segTarget) {
    const segs = paraSegments(para);
    const entry = entries.find((e) => e.para === para);
    // 지운 줄: 문단의 모든 조각이 지운 줄이면 문단째 뺌
    if ([...bySeg.values()].every((v) => v.list && !v.target) && segs.every((_, s) => bySeg.has(s))) {
      touch(para);
      if (entry) {
        const at = entry.list.indexOf(para);
        if (at >= 0) {
          entry.list.splice(at, 1);
          // 줄 사이 빈 문단(간격)도 하나 함께: 뒤 문단, 끝 줄이면 앞 문단
          if (isSpacer(entry.list[at])) entry.list.splice(at, 1);
          else if (at === entry.list.length && at > 0 && isSpacer(entry.list[at - 1])) entry.list.splice(at - 1, 1);
        }
      }
      continue;
    }
    const paths = new Set([...bySeg.values()].map((v) => v.target?.path ?? "-"));
    const whole = paths.size === 1 && segs.every((_, s) => bySeg.get(s)?.target);
    if (whole) {
      const v = [...bySeg.values()][0];
      shapePara(para, v.target as Target, v.anchor, marks, boxCount, touch);
    } else shapeSegments(para, segs, bySeg, marks, boxCount, touch);
  }

  // 4) 새 줄 끼워 넣기(본뜰 문단: 같은 목록에서 글머리가 같은 줄, 없으면 바로 앞 줄)
  for (const ins of inserts) insertNew(ins.entry, [ins.t], ins.where, marks, lists.get(ins.list) ?? [], touch);
  return { layout: L, extraAx, dirty };
}

/**
 * 원본 배치로 카드 그리기. 배치에 잇기 표시가 없거나 맞출 수 없으면 null(부르는 쪽이 원본 양식 렌더러로 그림)
 */
export function renderLayoutCard(card: Json, layout: CardLayout, opts: LayoutRenderOptions = {}): string | null {
  const applied = applyCardToLayout(card, layout, opts);
  if (!applied) return null;
  const { layout: L, extraAx, dirty } = applied;
  releaseHeights(L, dirty);

  // 그리기
  const doc = layoutDoc(L);
  const keyOfBin = new Map(L.bins.map((b) => [b.id, b.key]));
  const ctx: HtmlCtx = { doc, imageUrl: (bin) => (keyOfBin.get(bin) && opts.imageUrl ? opts.imageUrl(keyOfBin.get(bin) as string) : null) };
  const html: string[] = [];
  let prevTable = false;
  // 띄운 표와 같은 문단의 글자처럼 놓은 표(딱지)는 원본에서 문단 줄(위)에 있으므로 띄운 표보다 먼저
  const order = opts.lead && L.lead ? [L.lead, ...L.blocks] : L.blocks.slice();
  for (let i = 1; i < order.length; i++) {
    const b = order[i];
    const a = order[i - 1];
    if (b.kind === "table" && b.host?.join && a.kind === "table" && !a.table.pos.treatAsChar) [order[i - 1], order[i]] = [b, a];
  }
  order.forEach((b) => {
    if (b.kind === "table") {
      html.push(`<div class="hw-blk"${prevTable ? ' style="margin-top:8px"' : ""}>${tableHtml(ctx, b.table)}</div>`);
      prevTable = true;
    } else {
      html.push(paraHtml(ctx, b.para, { first: false, last: false, prevAfter: 0, width: L.textWidth, depth: 0 }).html);
      prevTable = false;
    }
  });
  const extra = extraAx.map((i) => renderAxEditable(card, i, { editable: opts.editable, selectable: opts.selectable, locked: opts.locked })).join("");
  return `<div class="kca-card kca-hwp" data-card-id="${esc(card.id)}" lang="ko"><div class="hw-doc">${html.join("")}</div>${extra}</div>\n`;
}

/**
 * 쪽 보기(인쇄 모양): 원본 배치에 지금 카드 글을 얹은 뒤 한글이 쪽을 나누는 규칙대로 쪽마다(lib/hwp/pages.ts). 읽기 전용.
 * 쪽 크기가 없는 배치·맞출 수 없는 배치는 null. 원본에 없던 새 AX 붙임은 쪽 뒤에 원본 양식으로
 */
export function renderLayoutPages(card: Json, layout: CardLayout, opts: Pick<LayoutRenderOptions, "imageUrl"> = {}): string | null {
  if (!layout.page) return null;
  const applied = applyCardToLayout(card, layout, { selectable: true, imageUrl: opts.imageUrl });
  if (!applied) return null;
  const { layout: L, extraAx, dirty } = applied;
  releaseHeights(L, dirty);
  const doc = layoutDoc(L);
  const keyOfBin = new Map(L.bins.map((b) => [b.id, b.key]));
  const ctx: HtmlCtx = { doc, imageUrl: (bin) => (keyOfBin.get(bin) && opts.imageUrl ? opts.imageUrl(keyOfBin.get(bin) as string) : null) };
  const extra = extraAx.map((i) => renderAxEditable(card, i, { selectable: true })).join("");
  return `<div class="kca-card kca-hwp" data-card-id="${esc(card.id)}" lang="ko"><div class="hw-doc hw-pages">${pagesHtml(ctx, L.blocks, layout.page, layoutStartY(L), { footer: L.footer, pageNum: L.pageNum, firstPage: L.firstPage, startNote: "원본에서 앞 과제가 이어지는 자리" })}</div>${extra}</div>\n`;
}

/** 본뜬 AX 붙임 덩이: 잇기 표시를 새 번호로(본뜸 표시), 그림은 뺌 */
function cloneAxBlock(blk: CardLayout["blocks"][number], from: number, to: number) {
  const re = new RegExp(`^axAttachments\\.${from}(?=[.~])`);
  const fix = (ps: Para[]) =>
    forEachPara(ps, (p) => {
      p.items = p.items.filter((it) => !(it.kind === "obj" && it.obj.kind === "pic"));
      const bp = p as BoundPara;
      if (bp.bind) bp.bind = bp.bind.map((a) => (a && re.test(a.path) ? { ...a, path: a.path.replace(re, `axAttachments.${to}`), cloned: true } : a));
    });
  if (blk.kind === "table") for (const c of blk.table.cells) fix(c.paras);
  else fix([blk.para]);
}

/** 줄 사이 간격용 빈 문단(글·개체·잇기 표시 없음) */
function isSpacer(p: Para | undefined): boolean {
  return Boolean(p) && !(p as BoundPara).bind?.some(Boolean) && !p!.items.some((it) => it.kind === "obj" || it.kind === "compose" || ((it.kind === "text" || it.kind === "gen") && it.text.trim()));
}

function forEachPara(ps: Para[], f: (p: Para) => void) {
  for (const p of ps) {
    f(p);
    for (const it of p.items)
      if (it.kind === "obj") {
        const o = it.obj;
        if (o.kind === "table") for (const c of o.cells) forEachPara(c.paras, f);
        else if (o.kind !== "pic" && o.text) forEachPara(o.text.paras, f);
      }
  }
}

function containsPara(c: Cell, target: Para): boolean {
  let hit = false;
  forEachPara(c.paras, (p) => {
    if (p === target) hit = true;
  });
  return hit;
}

/** 문단 하나 = 칸 하나 */
function shapePara(para: BoundPara, t: Target, a: Anchor, marks: Marks, boxCount: Map<string, { n: number; before: number }>, touch: (p: Para) => void) {
  const slots = slotsOf(para);
  let S = [...t.text];
  const tg: Toggles = { inner: t.toggles, before: t.before, orig: a.boxes };
  const base = boxCount.get(t.path) ?? { n: 0, before: 0 };
  boxCount.set(t.path, base);
  // 번호 글: JSON이 본문에 적었으면 머리를 편집 글로
  para.headText = false;
  if (para.head) {
    const lead = t.text.replace(/^\s+/, "");
    if (lead.startsWith(para.head)) {
      para.headText = true;
      S = [...lead.slice(para.head.length).replace(/^\s/, "")];
    }
  }
  const edge = a.role === "sub" || a.role === "part";
  const ops = alignChars(
    slots.map((s) => s.ch),
    S,
    edge,
  );
  if (ops) para.items = exactItems(para, slots, ops, tg, base);
  else if (!edge && oneLine(para, slots, S, tg)) {
    // 한 줄짜리 짧은 글: 원본 줄 칸에 글만 바꿔 넣음
  } else {
    touch(para);
    // 원본 앞뒤 고정 글(과제번호 등)은 흘려 그릴 때도 모양 그대로 남김
    const [pre, post] = edge && para.edge ? para.edge : [0, 0];
    const core = slots.slice(pre, slots.length - post);
    const items = flowItems(para, core.length ? core : slots, S, tg);
    const fixed = (sl: Slot[]) => sl.filter((x) => x.ch !== "\n").map((x): Inline => ({ kind: "gen", pos: 0, charPr: x.cp, text: x.ch }));
    const head = fixed(slots.slice(0, pre));
    const tail = fixed(slots.slice(slots.length - post));
    para.items = [...head, ...items, ...tail].map((it, k) => ({ ...it, pos: k }));
    para.flow = true;
  }
  // 문단 안에 글상자·표(그 안 글은 따로 편집 칸)가 있으면 문단 글만 감쌈
  const boxes = para.items.filter((it) => it.kind === "obj" && (it.obj.kind === "table" || (it.obj.kind !== "pic" && hasText(it.obj))));
  if (boxes.length) {
    // 글 앞·뒤에 붙은 글상자만 떼어 낼 수 있음. 글 사이에 끼면 편집 글에 섞이므로 고르기만
    const texts = para.items.filter((it) => (it.kind === "text" || it.kind === "zero") && /\S/.test(it.text));
    const first = texts.length ? Math.min(...texts.map((it) => it.pos)) : Infinity;
    const last = texts.length ? Math.max(...texts.map((it) => it.pos)) : -Infinity;
    const inside = boxes.some((it) => it.pos > first && it.pos < last);
    para.textAttrs = ` class="hw-tw${t.line ? " kc-ln" : ""}"${edAttrs(marks, t, inside ? { editable: false } : {})}`;
    para.attrs = "";
    para.cls = "";
    return;
  }
  para.attrs = edAttrs(marks, t);
  para.cls = t.line ? "kc-ln" : "";
}

function hasText(s: Shape): boolean {
  return Boolean(s.text?.paras.length) || s.children.some((c) => c.kind !== "pic" && hasText(c));
}

/**
 * 여러 문단(칸 여러 개·글상자)에 걸친 칸: 체크 상자 칸들, 월 표시(「1월 ~ 8월」 글상자) 등. 고칠 수는 없고 고르기·토글만.
 * 글이 원본과 같으면(상자 상태 차이만) 조각마다 그대로, 다르면 조각 수에 맞춰 나눠 담음(월 표시는 「~」로 나눔).
 * 남는 조각은 비우고, 글상자 조각이면 그 글상자를 뺌
 */
function shapeParts(xs: { e: Entry; a: Anchor; seg: number }[], t: Target, marks: Marks, boxCount: Map<string, { n: number; before: number }>, touch: (p: Para) => void) {
  const parts = [...xs].sort((p, q) => (p.a.part ?? 0) - (q.a.part ?? 0));
  const base = boxCount.get(t.path) ?? { n: 0, before: 0 };
  boxCount.set(t.path, base);
  const full = parts.map((x) => paraSegments(x.e.para)[x.seg] ?? "");
  const same = keyOf(full.join("")) === keyOf(t.text) && raw(full.join("")).replace(/[☑□☐]/g, "□") === raw(t.text).replace(/[☑□☐]/g, "□");
  // 글이 있는 조각(기호만 있는 조각 — 월 표시의 「~」 — 도 한 조각)
  const hasText = (k: number) => Boolean(raw(full[k]));
  const nonEmpty = parts.filter((_, k) => hasText(k));
  let tokens: string[];
  if (same) tokens = [];
  else if (/\.period$/.test(t.path)) tokens = t.text.split(/([~∼])/).map((x) => x.trim()).filter(Boolean);
  else tokens = [t.text];
  if (!same && tokens.length > nonEmpty.length && nonEmpty.length) tokens = [...tokens.slice(0, nonEmpty.length - 1), tokens.slice(nonEmpty.length - 1).join(" ")];
  let ti = 0;
  for (const x of parts) {
    const para = x.e.para;
    const slots = slotsOf(para);
    const T = slots.map((s) => s.ch);
    let S: string[];
    const k = parts.indexOf(x);
    if (same) S = T.map((ch) => (BOX.test(ch) ? (currentBox(t, base.n + T.slice(0, T.indexOf(ch)).filter((c) => BOX.test(c)).length) ?? ch) : ch));
    else S = hasText(k) ? [...(tokens[ti++] ?? "")] : T;
    if (!same && !S.length && hasText(k)) {
      touch(x.e.host ? x.e.host.para : para);
      // 남는 조각: 글상자면 글상자째 빼고, 아니면 문단째 뺌
      if (x.e.host) x.e.host.para.items = x.e.host.para.items.filter((it) => it !== x.e.host?.item);
      else {
        const at = x.e.list.indexOf(para);
        if (at >= 0) x.e.list.splice(at, 1);
      }
      continue;
    }
    const tg: Toggles = { inner: t.toggles, before: [], orig: x.a.boxes };
    const ops = alignChars(T, S, false);
    if (ops) para.items = exactItems(para, slots, ops, tg, base);
    else if (!oneLine(para, slots, S, tg)) {
      touch(x.e.host ? x.e.host.para : para);
      para.items = flowItems(para, slots, S, tg);
      para.flow = true;
    }
    if (hasText(k)) {
      para.attrs = edAttrs(marks, t, { editable: false });
      para.cls = "";
    }
  }
}

/**
 * 한 칸 안 여러 문단에 걸친 칸 글(두 줄 과제명 등): 칸 내용(.hw-cc)을 편집 칸으로. 문단 사이 경계는 JSON의 빈칸 자리(편집 글에서는
 * 문단 나눔이 줄바꿈 → 편집기가 빈칸으로 합침). 글이 달라졌으면 첫 문단에 흘려 그리고(앞뒤 고정 글은 모양만) 나머지 문단은 뺌
 */
function shapeCellParts(xs: { e: Entry; a: Anchor; seg: number }[], t: Target, marks: Marks, boxCount: Map<string, { n: number; before: number }>, touch: (p: Para) => void) {
  const parts = [...xs].sort((p, q) => (p.a.part ?? 0) - (q.a.part ?? 0));
  const paras = [...new Set(parts.map((x) => x.e.para))];
  const cell = parts[0].e.cell as Cell;
  const base = boxCount.get(t.path) ?? { n: 0, before: 0 };
  boxCount.set(t.path, base);
  const tg: Toggles = { inner: t.toggles, before: t.before, orig: parts[0].a.boxes };
  const segs = paras.map((p) => ({ para: p, slots: slotsOf(p) }));
  const T: string[] = [];
  const where: { k: number; i: number }[] = [];
  segs.forEach((sg, k) => {
    if (k) {
      T.push("\n");
      where.push({ k, i: -1 });
    }
    sg.slots.forEach((sl, i) => {
      T.push(sl.ch);
      where.push({ k, i });
    });
  });
  const ops = alignChars(T, [...t.text], true);
  if (ops) {
    const per: Op[][] = segs.map(() => []);
    for (const o of ops) {
      if (o.op === "zero") {
        const w = where[o.after];
        if (w && w.i === -1) continue; // 문단 경계의 빈칸: 문단 나눔이 대신함
        const k = w ? w.k : 0;
        per[k].push({ op: "zero", after: w ? w.i : -1, s: o.s });
      } else {
        const w = where[o.t];
        if (w.i === -1) continue;
        per[w.k].push({ ...o, t: w.i });
      }
    }
    segs.forEach((sg, k) => {
      sg.para.items = exactItems(sg.para, sg.slots, per[k], tg, base);
    });
  } else {
    // 글이 달라짐: 첫 문단에 흘려 그림(첫 문단 앞 고정 글·끝 문단 뒤 고정 글은 모양만), 나머지 문단은 뺌
    touch(segs[0].para);
    const first = segs[0];
    const last = segs[segs.length - 1];
    const pre = first.para.edge?.[0] ?? 0;
    const post = last.para.edge?.[1] ?? 0;
    const fixed = (sl: Slot[]) => sl.filter((x) => x.ch !== "\n").map((x): Inline => ({ kind: "gen", pos: 0, charPr: x.cp, text: x.ch }));
    const body = flowItems(first.para, first.slots.slice(pre), [...t.text], tg);
    first.para.items = [...fixed(first.slots.slice(0, pre)), ...body, ...fixed(last.slots.slice(last.slots.length - post))].map((it, k) => ({ ...it, pos: k }));
    first.para.flow = true;
    cell.paras = cell.paras.filter((p) => p === first.para || !paras.includes(p));
  }
  // 칸 안에 글상자·표(그 안 글은 따로 편집 칸)가 있으면 칸째 편집하면 그 글이 섞임: 고르기만
  const nested = cell.paras.some((p) => p.items.some((it) => it.kind === "obj" && (it.obj.kind === "table" || (it.obj.kind !== "pic" && hasText(it.obj)))));
  cell.attrs = edAttrs(marks, t, nested ? { editable: false } : {});
}

const raw = (s: string) => [...s].filter((ch) => !isWs(ch)).join("");

/**
 * 한 줄짜리 짧은 글(월 딱지 「1월」→「9월」 등): 원본 줄 칸을 그대로 두고 글만 바꿈(정렬은 문단 모양대로). 줄이 넘칠 만큼 길면 안 함
 */
function oneLine(para: Para, slots: Slot[], S: string[], tg: Toggles): boolean {
  if (para.lines.length > 1 || S.includes("\n") || !slots.length || S.length > slots.length + 3) return false;
  const items = flowItems(para, slots, S, tg);
  const start = slots[0].pos;
  para.items = items.map((it, k) => ({ ...it, pos: start + k / 1000 }));
  para.relaid = true;
  return true;
}

/** 여러 문단에 걸친 칸에서 k째 체크 상자의 지금 상태(글에서) */
function currentBox(t: Target, k: number): string | null {
  const boxes = [...t.text].filter((ch) => BOX.test(ch));
  return boxes[k] ?? null;
}

/** 강제 줄바꿈으로 나뉜 조각마다 다른 칸(또는 일부만 칸) */
function shapeSegments(para: BoundPara, segs: string[], bySeg: Map<number, { target: Target | null; anchor: Anchor; list: boolean }>, marks: Marks, boxCount: Map<string, { n: number; before: number }>, touch: (p: Para) => void) {
  const slots = slotsOf(para);
  // 조각 경계(줄바꿈 자리)
  const bounds: number[] = [0];
  slots.forEach((s, i) => {
    if (s.ch === "\n") bounds.push(i + 1);
  });
  bounds.push(slots.length + 1);
  const newItems: Inline[] = para.items.filter((it) => it.kind === "obj" || it.kind === "compose" || it.kind === "br");
  const segAttrs: (string | null)[] = [];
  let ok = true;
  segs.forEach((_, s) => {
    const sub = slots.slice(bounds[s], Math.min(slots.length, bounds[s + 1] - 1));
    const v = bySeg.get(s);
    if (!v || !v.target) {
      // 칸 없는 조각은 원본 글 그대로, 지운 줄 조각은 비움
      if (!v) for (const sl of sub) newItems.push({ kind: "text", pos: sl.pos, charPr: sl.cp, text: sl.ch });
      segAttrs.push(null);
      return;
    }
    const t = v.target;
    const base = boxCount.get(t.path) ?? { n: 0, before: 0 };
    boxCount.set(t.path, base);
    // 첫 조각의 번호 글: JSON이 본문에 적었으면 머리를 편집 글로
    let S = [...t.text];
    if (s === 0 && para.head) {
      const lead = t.text.replace(/^\s+/, "");
      if (lead.startsWith(para.head)) {
        para.headText = true;
        S = [...lead.slice(para.head.length).replace(/^\s/, "")];
      }
    }
    const ops = alignChars(
      sub.map((x) => x.ch),
      S,
      v.anchor.role === "sub",
    );
    if (!ops) {
      ok = false;
      segAttrs.push(null);
      return;
    }
    newItems.push(...exactItems({ ...para, items: [] }, sub, ops, { inner: t.toggles, before: t.before, orig: v.anchor.boxes }, base));
    segAttrs.push(` class="hw-seg${t.line ? " kc-ln" : ""}"${edAttrs(marks, t)}`);
  });
  if (!ok) {
    touch(para);
    // 조각 글이 원본과 달라짐: 문단째 흘려 그림(조각은 줄바꿈으로 나눠 따로 감쌈)
    const S: string[] = [];
    const attrs: (string | null)[] = [];
    segs.forEach((seg, s) => {
      const v = bySeg.get(s);
      if (v && !v.target) return;
      if (attrs.length) S.push("\n");
      S.push(...(v?.target ? [...v.target.text] : [...seg]));
      attrs.push(v?.target ? ` class="hw-seg${v.target.line ? " kc-ln" : ""}"${edAttrs(marks, v.target)}` : null);
    });
    para.items = flowItems(para, slots, S, { inner: [], before: [] });
    para.flow = true;
    para.segAttrs = attrs;
    return;
  }
  newItems.sort((x, y) => x.pos - y.pos);
  para.items = mergeText(newItems);
  para.segAttrs = segAttrs;
}

/** 새 줄(원본에 없던 줄)을 본뜬 문단 모양으로 끼워 넣음 */
function insertNew(entry: Entry, ts: Target[], where: "after" | "before", marks: Marks, same: { e: Entry; seg: number }[], touch: (p: Para) => void) {
  touch(entry.para);
  const list = entry.list;
  let at = list.indexOf(entry.para);
  if (at < 0) return;
  if (where === "after") at += 1;
  // 같은 자리에 먼저 끼운 새 줄 뒤로(순서 유지)
  while (at < list.length && (list[at] as BoundPara & { inserted?: boolean }).inserted) at++;
  const made: Para[] = [];
  for (const t of ts) {
    // 글머리 글자가 같은 원래 줄을 본뜸(없으면 기준 문단)
    const lead = [...t.text.trim()][0] ?? "";
    const model = same.find((x) => ([...(paraSegments(x.e.para)[x.seg] ?? "").trim()][0] ?? "") === lead)?.e.para ?? entry.para;
    const slots = slotsOf(model);
    const cp = slots.find((s) => !isWs(s.ch) && !isSym(s.ch))?.cp ?? model.endCharPr ?? model.items[0]?.charPr ?? 0;
    const cpAt = charPrMapper(slots, [...t.text], cp);
    const p: BoundPara & { inserted?: boolean } = {
      paraPr: model.paraPr,
      style: model.style,
      items: [],
      lines: [],
      length: 0,
      pageBreak: false,
      endCharPr: model.endCharPr ?? cp,
      // 글머리표는 그대로, 번호(가.·1.)는 JSON 글에 있으므로 뺌
      head: model.head && !/[0-9가-힣]/.test(model.head) ? model.head : undefined,
      flow: true,
      inserted: true,
    };
    let box = 0;
    const items: Inline[] = [];
    [...t.text].forEach((ch, j) => {
      const attrs = BOX.test(ch) ? toggleAttrs(t.toggles[box++], ch === "☑") : undefined;
      items.push({ kind: "text", pos: j, charPr: cpAt(j), text: ch, ...(attrs ? { attrs } : {}) });
    });
    p.items = mergeFlow(items);
    p.attrs = edAttrs(marks, t);
    p.cls = t.line ? "kc-ln" : "";
    made.push(p);
  }
  list.splice(at, 0, ...made);
}

/**
 * 원본 배치 화면에 쓰는 CSS(한글 문서 조각 + 카드 양식 CSS와 겹치는 규칙 되돌림).
 * 줄 나눔 단위: 원본 줄 배치 문단은 줄마다 놓으므로 word-break:normal로 되돌리되, 흘려 그리는 문단(hw-flow — 인라인 word-break)과
 * 편집 흐름(hw-edit — --hw-wb)은 문단 값을 물려받아야 함(덮으면 어절 단위 제목·라벨이 낱말 가운데서 끊김). 그래서 되돌림 뒤에 둠
 */
export const CARD_LAYOUT_CSS = `${HW_CSS}
.kca-hwp{width:max-content;max-width:none;font-size:13.5px;line-height:normal}
.kca-hwp .hw-doc,.kca-hwp .hw-doc *{word-break:normal;overflow-wrap:normal}
.kca-hwp .hw-flow *,.kca-hwp .hw-edit *{word-break:inherit}
.kca-hwp .hw-p.hw-edit,.kca-hwp .hw-edit .hw-p,.kca-hwp .hw-seg.hw-edit{word-break:var(--hw-wb)}
.kca-hwp .hw-flow,.kca-hwp .hw-edit,.kca-hwp .hw-edit *{overflow-wrap:anywhere}
.kca-hwp table.hw-t{border-collapse:separate;width:auto;max-width:none}
.kca-hwp img{max-width:none}
.kca-hwp .kc-cb{cursor:pointer}
.kca-hwp [data-empty]:empty::before{content:"여기에 입력";color:#8a8690}
${PAGES_CSS}
.kca-hwp .hw-pages{padding:4px 0}
`;

