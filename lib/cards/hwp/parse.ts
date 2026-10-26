// 과제관리카드 한글(HWP·HWPX) → 카드 JSON 파서. 초기 변환의 parse_cards.py(파이썬 — 2026-09-28에 지워 git 이력에만)를 그대로 옮긴 것.
// 입력은 kordoc(parse)이 내는 마크다운(HTML 표 포함). 같은 입력이면 파이썬 판과 같은 카드 JSON을 냅니다(parse.test.ts가 59장으로 대조).
// 판단이 끼면 안 되는 일이라 AI를 쓰지 않습니다. 원문은 그대로 두고, 파서가 추정·보정한 것은 parseWarnings에 적습니다.

import type { LooseJson } from "../../loose-json.ts";

// 마크다운 이스케이프(\$ \~ \* …)만 되돌린다. "\ 0.26원" 같은 원화 기호는 그대로 둔다.
const MD_ESCAPE = /\\([\\`*_{}[\]()#+\-.!|~$<>])/g;
const CHECKED = "☑";
const BOXES = "☑□☐■";

// ---------------------------------------------------------------------------
// 파이썬 문자열 동작 맞추기
// ---------------------------------------------------------------------------

/** str.strip(): 파이썬 isspace 문자만 걷음(JS trim은 ﻿도 걷음) */
const PY_WS = "\\t\\n\\v\\f\\r \\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000";
const STRIP_RE = new RegExp(`^[${PY_WS}]+|[${PY_WS}]+$`, "g");
const strip = (s: string) => s.replace(STRIP_RE, "");
const rstrip = (s: string) => s.replace(new RegExp(`[${PY_WS}]+$`), "");
const nospace = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "");

/** 파이썬 repr(str) — 경고 문구의 %r */
export function pyRepr(s: string): string {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = "";
  for (const ch of s) {
    if (ch === "\\") out += "\\\\";
    else if (ch === quote) out += `\\${quote}`;
    else if (ch === "\n") out += "\\n";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\t") out += "\\t";
    else out += ch;
  }
  return quote + out + quote;
}
const pyReprList = (xs: string[]) => `[${xs.map(pyRepr).join(", ")}]`;

/** html.unescape(convert_charrefs) — kordoc 출력에 나오는 참조만 */
function unescapeHtml(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos|nbsp);/g, (m, g: string) => {
    if (g[0] === "#") return String.fromCodePoint(g[1] === "x" || g[1] === "X" ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10));
    return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " } as Record<string, string>)[g] ?? m;
  });
}

// ---------------------------------------------------------------------------
// 1. HTML 표 파서(table/tr/td/th/br/img 만 등장)
// ---------------------------------------------------------------------------

const BR = { br: true } as const;
class Img {
  src: string;
  constructor(src: string) {
    this.src = src;
  }
}
type Node = string | typeof BR | Img | Table;

export class Cell {
  tag: string;
  colspan: number;
  rowspan: number;
  content: Node[] = [];
  r = -1;
  c = -1;
  constructor(tag: string, colspan: number, rowspan: number) {
    this.tag = tag;
    this.colspan = colspan;
    this.rowspan = rowspan;
  }
}

export class Table {
  rows: Cell[][] = [];
  openCell: Cell | null = null;
  stray: Node[] = [];
  pendingMsg: string | null = null;
}

export function parseHtmlTables(text: string): Table[] {
  const root: Node[] = [];
  const stack: Table[] = [];
  const target = (): Node[] | null => {
    if (!stack.length) return root;
    const t = stack[stack.length - 1];
    return t.openCell ? t.openCell.content : null;
  };
  const data = (d: string) => {
    if (!d) return;
    const tgt = target();
    if (tgt === null) {
      if (strip(d) && stack.length) stack[stack.length - 1].stray.push(strip(d));
      return;
    }
    tgt.push(d.replace(MD_ESCAPE, "$1"));
  };
  const attr = (attrs: string, name: string): string | undefined => {
    const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(attrs);
    return m ? unescapeHtml(m[1] ?? m[2] ?? m[3] ?? "") : undefined;
  };
  const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g;
  let last = 0;
  for (let m = TAG.exec(text); m; m = TAG.exec(text)) {
    data(unescapeHtml(text.slice(last, m.index)));
    last = TAG.lastIndex;
    const closing = m[1] === "/";
    const tag = m[2].toLowerCase();
    const attrs = m[3];
    if (closing) {
      if ((tag === "td" || tag === "th") && stack.length) stack[stack.length - 1].openCell = null;
      else if (tag === "table" && stack.length) stack.pop();
      continue;
    }
    if (tag === "table") {
      const t = new Table();
      const tgt = target();
      (tgt ?? stack[stack.length - 1].stray).push(t);
      stack.push(t);
    } else if (tag === "tr") {
      if (stack.length) {
        stack[stack.length - 1].rows.push([]);
        stack[stack.length - 1].openCell = null;
      }
    } else if (tag === "td" || tag === "th") {
      const t = stack[stack.length - 1];
      if (!t.rows.length) t.rows.push([]);
      const cell = new Cell(tag, Number(attr(attrs, "colspan") || 1), Number(attr(attrs, "rowspan") || 1));
      t.rows[t.rows.length - 1].push(cell);
      t.openCell = cell;
    } else if (tag === "br") {
      target()?.push(BR);
    } else if (tag === "img") {
      target()?.push(new Img(attr(attrs, "src") ?? ""));
    }
  }
  data(unescapeHtml(text.slice(last)));
  return root.filter((n): n is Table => n instanceof Table);
}

/**
 * kordoc이 HWPX 글에 붙인 마크다운 표시를 걷음: 글자 모양(굵게·기울임 *, 취소선 ~~, 밑줄 <u>, 코드 `)과 특수 문자 앞 역슬래시.
 * HWP(바이너리)는 kordoc이 이런 표시 없이 글을 그대로 내므로(그대로 걷으면 글 속 *를 잃음) HWPX에만 씀
 */
export function unmarkKordocInline(s: string): string {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length && /[!-/:-@[-`{-~]/.test(s[i + 1])) {
      out += s[++i];
      continue;
    }
    if (ch === "*" || ch === "`") continue;
    if (ch === "~" && s[i + 1] === "~") {
      i++;
      continue;
    }
    if (s.startsWith("<u>", i)) {
      i += 2;
      continue;
    }
    if (s.startsWith("</u>", i)) {
      i += 3;
      continue;
    }
    out += ch;
  }
  return out;
}

/** kordoc의 마크다운 파이프 표 → 같은 HTML 표 구조(inline: HWPX 글의 마크다운 표시를 걷음) */
function pipeTableToHtml(text: string, inline = false): string {
  const out = ["<table>"];
  for (const raw of text.split("\n")) {
    const line = strip(raw);
    if (!line.startsWith("|")) continue;
    const body = line.endsWith("|") ? line.slice(1, -1) : line.slice(1);
    const cells = body.split(/(?<!\\)\|/).map(strip);
    if (cells.length && cells.every((c) => /^:?-{3,}:?$/.test(c))) continue;
    // 그림 표시는 먼저 떼어 두고(경로의 _ 등) 글만 걷음
    const tds = cells.map((c) => `<td>${c.split(/(!\[[^\]]*\]\([^)]*\))/).map((part, k) => (k % 2 ? part.replace(/!\[[^\]]*\]\(([^)]*)\)/, '<img src="$1">') : inline ? unmarkKordocInline(part) : part)).join("")}</td>`);
    out.push(`<tr>${tds.join("")}</tr>`);
  }
  out.push("</table>");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// 2. 표 → 격자 / 줄 목록
// ---------------------------------------------------------------------------

export type Occ = Map<string, Cell>;
export const key = (r: number, c: number) => `${r},${c}`;

export function buildGrid(table: Table): Occ {
  const occ: Occ = new Map();
  table.rows.forEach((row, r) => {
    let c = 0;
    for (const cell of row) {
      while (occ.has(key(r, c))) c += 1;
      cell.r = r;
      cell.c = c;
      for (let dr = 0; dr < cell.rowspan; dr++) for (let dc = 0; dc < cell.colspan; dc++) occ.set(key(r + dr, c + dc), cell);
      c += cell.colspan;
    }
  });
  return occ;
}

function fixStepHeader(table: Table, warnings: string[] | null) {
  if (table.rows.length < 2 || table.rows[0].length !== 1) return;
  const only = table.rows[0][0];
  const inner = only.content.filter((n) => !(typeof n === "string" && !strip(n)));
  if (inner.length !== 1 || !(inner[0] instanceof Table) || inner[0].rows.length !== 1) return;
  const cells = inner[0].rows[0].filter((c) => plainText(c));
  if (cells.length !== table.rows[1].length) return;
  for (const c of cells) {
    c.colspan = 1;
    c.rowspan = 1;
    c.tag = "th";
  }
  table.rows[0] = cells;
  table.pendingMsg = `중첩표 머리행(Step 화살표)을 평평하게 폄: ${cells.map((c) => plainText(c)).join(" | ")}`;
  flushTableMsg(table, warnings);
}

function flushTableMsg(table: Table, warnings: string[] | null) {
  if (table.pendingMsg && warnings !== null) {
    warnings.push(table.pendingMsg);
    table.pendingMsg = null;
  }
}

export type ImageResolver = (kordocSrc: string) => string | null;
let currentResolver: ImageResolver = () => null;

export type Line = string | { table: LooseJson } | { image: { src: string | null; kordoc: string } };

export function cellLines(cell: Cell, warnings: string[] | null = null): Line[] {
  const out: Line[] = [];
  let buf: string[] = [];
  const flush = () => {
    const s = strip(buf.join("").replace(/\n/g, " "));
    buf = [];
    if (s) out.push(s);
  };
  for (const n of cell.content) {
    if (typeof n === "string") buf.push(n);
    else if (n === BR) flush();
    else if (n instanceof Img) {
      flush();
      out.push({ image: { src: currentResolver(n.src), kordoc: n.src } });
    } else if (n instanceof Table) {
      flush();
      out.push({ table: tableJson(n, warnings) });
    }
  }
  flush();
  return out;
}

function tableJson(table: Table, warnings: string[] | null = null) {
  fixStepHeader(table, warnings);
  flushTableMsg(table, warnings);
  return { rows: table.rows.map((row) => row.map((cell) => ({ th: cell.tag === "th", colspan: cell.colspan, rowspan: cell.rowspan, lines: cellLines(cell, warnings) }))) };
}

export function plainText(cell: Cell | undefined | null, sep = " "): string {
  if (!cell) return "";
  const parts: string[] = [];
  const walk = (content: Node[]) => {
    let buf: string[] = [];
    for (const n of content) {
      if (typeof n === "string") buf.push(n);
      else if (n === BR) {
        parts.push(buf.join(""));
        buf = [];
      } else if (n instanceof Table) {
        parts.push(buf.join(""));
        buf = [];
        for (const row of n.rows) for (const c of row) walk(c.content);
      }
    }
    parts.push(buf.join(""));
  };
  walk(cell.content);
  return parts
    .filter((p) => strip(p))
    .map(strip)
    .join(sep);
}

const hasContent = (cell: Cell) => cellLines(cell).length > 0;
const isStr = (x: unknown): x is string => typeof x === "string";

// ---------------------------------------------------------------------------
// 3. 마크다운 → 블록
// ---------------------------------------------------------------------------

export interface Block {
  kind: "html" | "pipe" | "para";
  text: string;
  line: number;
  tables: Table[];
  type: string;
}

export function splitBlocks(md: string, inline = false): Block[] {
  const lines = md.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  const count = (s: string, sub: string) => s.split(sub).length - 1;
  while (i < lines.length) {
    const ln = lines[i];
    if (ln.startsWith("<table")) {
      let depth = 0;
      let j = i;
      const buf: string[] = [];
      while (j < lines.length) {
        depth += count(lines[j], "<table") - count(lines[j], "</table>");
        buf.push(lines[j]);
        j += 1;
        if (depth <= 0) break;
      }
      blocks.push({ kind: "html", text: buf.join("\n"), line: i + 1, tables: [], type: "" });
      i = j;
    } else if (ln.startsWith("|")) {
      let j = i;
      const buf: string[] = [];
      while (j < lines.length && lines[j].startsWith("|")) {
        let row = lines[j];
        j += 1;
        // 칸 안 강제 줄바꿈: kordoc이 HWPX의 줄바꿈을 행 안에 그대로 내면 행이 다음 줄로 이어짐 — 「|」로 끝날 때까지 <br>로 이음
        while (!/(?<!\\)\|\s*$/.test(row) && j < lines.length && strip(lines[j])) {
          row += `<br>${lines[j]}`;
          j += 1;
        }
        buf.push(row);
      }
      blocks.push({ kind: "pipe", text: buf.join("\n"), line: i + 1, tables: [], type: "" });
      i = j;
    } else if (!strip(ln)) {
      i += 1;
    } else {
      blocks.push({ kind: "para", text: strip(ln), line: i + 1, tables: [], type: "" });
      i += 1;
    }
  }
  for (const b of blocks) {
    b.tables = b.kind === "html" ? parseHtmlTables(b.text) : b.kind === "pipe" ? parseHtmlTables(pipeTableToHtml(b.text, inline)) : [];
    b.type = classify(b);
  }
  return blocks;
}

function firstCellText(table: Table): string {
  for (const row of table.rows)
    for (const c of row) {
      const t = plainText(c);
      if (t) return t;
    }
  return "";
}

function classify(b: Block): string {
  if (b.kind === "para") {
    const t = b.text;
    if (/^【[\s\S]*】$/.test(t)) return "summary";
    if (/^-\s*\d+\s*-$/.test(t)) return "pagenum";
    if (/^!\[[^\]]*\]\([^)]*\)$/.test(t)) return "image";
    return "para";
  }
  const t = b.tables[0];
  if (!t) return "unknown";
  const f = firstCellText(t);
  if (f.startsWith("(주요사업")) return "groupTitle";
  if (nospace(f) === "대상사업") return "index";
  if (nospace(f).startsWith("과제명")) return "card";
  if (nospace(f) === "AX연계과제") return "axHeader";
  const labels = new Set(t.rows.filter((row) => row.length).map((row) => nospace(plainText(row[0]))));
  if (labels.has("과제목적") || labels.has("주요기능")) return "axBody";
  return "unknown";
}

// ---------------------------------------------------------------------------
// 4. 목차(인덱스) 표
// ---------------------------------------------------------------------------

const TAG_RE = /【[^】]*】/g;

function parseTags(text: string) {
  const labels = text.match(TAG_RE) ?? [];
  let regional: number | null = null;
  for (const lb of labels) {
    const m = /지역과제\s*(\d+)\s*개/.exec(lb);
    if (m) regional = Number(m[1]);
  }
  return { new: labels.some((lb) => lb.includes("신규과제")), regionalCount: regional, ax: labels.some((lb) => lb.includes("AX")), labels };
}

export interface IndexRow {
  taskNo: string | null;
  title: string;
  tags: ReturnType<typeof parseTags>;
  department: string;
  targetBusiness: string;
  executionTaskNo: string | null;
  executionTask: string;
  raw: string;
}

function parseIndex(table: Table) {
  const occ = buildGrid(table);
  const tbs: LooseJson[] = [];
  const rows: IndexRow[] = [];
  const byTb = new Map<Cell, LooseJson>();
  for (let r = 1; r < table.rows.length; r++) {
    const cells = [0, 1, 2, 3].map((c) => occ.get(key(r, c)));
    if (cells.some((c) => !c)) continue;
    const [c0, c1, c2, c3] = cells as Cell[];
    const tbText = cellLines(c0).filter(isStr).join(" ");
    let m = /^([\s\S]*?)\s*\((\d+)개\)\s*$/.exec(tbText);
    const [tbName, tbCount] = m ? [m[1], Number(m[2])] : [tbText, null];
    const etText = cellLines(c1).filter(isStr).join(" ");
    m = /^(\d+)\.\s*([\s\S]*)$/.exec(etText);
    const [etNo, etTitle] = m ? [m[1], m[2]] : [null, etText];
    const taskText = cellLines(c2).filter(isStr).join(" ");
    const tags = parseTags(taskText);
    m = /^(\d+-[가-힣])\.\s*([\s\S]*)$/.exec(taskText);
    const [taskNo, rawTitle] = m ? [m[1], m[2]] : [null, taskText];
    const taskTitle = strip(rawTitle.replace(TAG_RE, " ").replace(/\s+/g, " "));
    const dept = cellLines(c3).filter(isStr).join(" ");
    rows.push({ taskNo, title: taskTitle, tags, department: dept, targetBusiness: tbName, executionTaskNo: etNo, executionTask: etTitle, raw: taskText });
    if (!byTb.has(c0)) {
      const tb = { name: tbName, count: tbCount, executionTasks: [] as LooseJson[], _ets: new Map<Cell, LooseJson>() };
      byTb.set(c0, tb);
      tbs.push(tb);
    }
    const tb = byTb.get(c0);
    if (!tb._ets.has(c1)) {
      const et = { no: etNo, title: etTitle, taskNos: [] as (string | null)[] };
      tb._ets.set(c1, et);
      tb.executionTasks.push(et);
    }
    tb._ets.get(c1).taskNos.push(taskNo);
  }
  for (const tb of tbs) delete tb._ets;
  return { tbs, rows };
}

// ---------------------------------------------------------------------------
// 5. 카드 표
// ---------------------------------------------------------------------------

const SECTION_LABELS: Array<[string, string]> = [
  ["title", "과제명"],
  ["overview", "과제개요"],
  ["kpi", "계량성과지표"],
  ["strategy", "전략연계성"],
  ["act", "[Act]"],
  ["plan", "[Plan]"],
  ["do", "[Do]"],
  ["check", "[Check]"],
  ["outcome", "추진성과"],
];

function sectionOf(labelText: string): string | null {
  const t = nospace(labelText);
  for (const [k, lb] of SECTION_LABELS) if (t.startsWith(nospace(lb))) return k;
  return null;
}

function box(text: string, label: string): boolean | null {
  const m = new RegExp(`([${BOXES}])\\s*(?:<[^>]*>)?\\s*${label}`).exec(text);
  return m ? m[1] === CHECKED : null;
}

class CardParser {
  t: Table;
  w: string[];
  occ: Occ;
  used = new Set<Cell>();
  labelCells = new Set<Cell>();
  sections = new Map<string, number[]>();
  order: string[] = [];
  stray: Array<{ section: string | null; row: number; lines: Line[] }> = [];

  constructor(table: Table, warnings: string[]) {
    this.t = table;
    this.w = warnings;
    fixStepHeader(table, warnings);
    this.occ = buildGrid(table);
    this.splitSections();
  }

  private sec(k: string): number[] {
    if (!this.sections.has(k)) this.sections.set(k, []);
    return this.sections.get(k)!;
  }

  private splitSections() {
    let cur: string | null = null;
    this.t.rows.forEach((row, r) => {
      const c0 = this.occ.get(key(r, 0));
      const k = c0 ? sectionOf(plainText(c0)) : null;
      if (k) {
        if (c0!.r === r) {
          this.labelCells.add(c0!);
          if (this.sections.has(k)) this.w.push(`구역 '${k}' 이 두 번 나옴(행 ${r})`);
          else this.order.push(k);
          this.sec(k);
        }
        cur = k;
        this.sec(cur).push(r);
        return;
      }
      if (!row.some(hasContent)) {
        cur = c0 && c0.r === r ? null : cur;
        return;
      }
      if (c0 && c0.r === r && !row.filter((c) => c !== c0).some(hasContent)) {
        this.labelCells.add(c0);
        this.stray.push({ section: null, row: r, lines: cellLines(c0) });
        this.w.push(`칸막이 행 ${r} 첫 칸의 글자 ${pyRepr(plainText(c0))} 는 extra 로 옮김`);
        return;
      }
      if (cur === null) {
        this.sec("_orphan").push(r);
        this.w.push(`구역 표지 없이 내용이 있는 행 ${r}`);
      } else {
        this.sec(cur).push(r);
        if (!(c0 && c0.r < r && sectionOf(plainText(c0)))) this.w.push(`구역 '${cur}' 에 rowspan 밖 행 ${r} 을 이어 붙임`);
      }
    });
  }

  rows(k: string): number[] {
    return this.sections.get(k) ?? [];
  }
  cellsInRow(r: number): Cell[] {
    return this.t.rows[r].filter((c) => !this.labelCells.has(c));
  }
  contentCells(k: string): Cell[] {
    const out: Cell[] = [];
    for (const r of this.rows(k)) for (const c of this.cellsInRow(r)) if (hasContent(c)) out.push(c);
    return out;
  }
  take(cell: Cell): Line[] {
    this.used.add(cell);
    return cellLines(cell, this.w);
  }
  text(cell: Cell, sep = " "): string {
    return plainText(cell, sep);
  }

  headerCols(k: string, needles: Record<string, string>, must?: string[]): [number | null, Record<string, Cell>] {
    let best: [number | null, Record<string, Cell>] = [null, {}];
    for (const r of this.rows(k)) {
      const found: Record<string, Cell> = {};
      for (const c of this.cellsInRow(r)) {
        const t = nospace(this.text(c));
        if ([...t].length > 30) continue;
        for (const [name, needle] of Object.entries(needles)) {
          if (!(name in found) && t.includes(needle)) {
            found[name] = c;
            break;
          }
        }
      }
      if (must && !must.some((m) => m in found)) continue;
      if (Object.keys(found).length > Object.keys(best[1]).length) best = [r, found];
    }
    for (const c of Object.values(best[1])) this.used.add(c);
    return best;
  }

  spanCells(r: number, hc: Cell): Cell[] {
    const out: Cell[] = [];
    for (let c = hc.c; c < hc.c + hc.colspan; c++) {
      const cell = this.occ.get(key(r, c));
      if (!cell || this.labelCells.has(cell) || out.includes(cell)) continue;
      out.push(cell);
    }
    return out;
  }

  columnValues(k: string, headerRow: number, colCells: Record<string, Cell>): Record<string, Line[]> {
    const out: Record<string, Line[]> = {};
    for (const name of Object.keys(colCells)) out[name] = [];
    const seen = new Set<Cell>();
    for (const r of this.rows(k)) {
      if (r <= headerRow) continue;
      for (const [name, hc] of Object.entries(colCells)) {
        for (const cell of this.spanCells(r, hc)) {
          if (seen.has(cell)) continue;
          seen.add(cell);
          out[name].push(...this.take(cell));
        }
      }
    }
    return out;
  }

  parseTitle() {
    const res: Record<string, LooseJson> = { title: null, taskNo: null, department: null, team: null, deptText: null, manager: null, writer: null, staffText: null };
    for (const r of this.rows("title")) {
      const row = this.t.rows[r];
      row.forEach((c, i) => {
        const t = nospace(this.text(c));
        const nxt = row.slice(i + 1).find((x) => this.text(x)) ?? null;
        if (t.startsWith("과제명")) {
          this.used.add(c);
          if (nxt) {
            const lines = this.take(nxt).filter(isStr);
            let whole = lines.join(" ");
            const m = /\(\s*과제번호\s*:\s*([^)]+?)\s*\)/.exec(whole);
            if (m) {
              res.taskNo = strip(m[1]);
              whole = whole.slice(0, m.index) + whole.slice(m.index + m[0].length);
            }
            res.title = strip(whole.replace(/\s+/g, " "));
            res.titleLines = lines;
          }
        } else if (t.startsWith("부서(팀)")) {
          this.used.add(c);
          if (nxt) {
            const d = this.take(nxt).filter(isStr).join(" ");
            res.deptText = d;
            const m = /^([\s\S]*?)\s*\(([\s\S]*)\)\s*$/.exec(d);
            if (m) {
              res.department = m[1];
              res.team = m[2];
            } else res.department = d;
          }
        } else if (t.startsWith("관리자/작성자")) {
          this.used.add(c);
          if (nxt) {
            const s = this.take(nxt).filter(isStr).join(" ");
            res.personText = s;
            const parts = s.split("/").map(strip);
            res.manager = parts[0] || null;
            res.writer = parts.length > 1 ? strip(parts.slice(1).join("/")) || null : null;
          }
        }
      });
    }
    return res;
  }

  parseOverview() {
    const cells = this.contentCells("overview");
    const texts = cells.map((c) => this.text(c));
    for (const c of cells) this.used.add(c);
    const joined = texts.join(" ");
    const adv = box(joined, "고도화과제");
    const neu = box(joined, "2?6?년?\\s*신규과제");
    const short = box(joined, "단기과제");
    const long = box(joined, "중장기과제");
    let kind: string | null = null;
    if (adv && !neu) kind = "고도화";
    else if (neu && !adv) kind = "신규";
    else if (adv && neu) this.w.push("과제 개요: 고도화·신규 둘 다 체크");
    const term = short && !long ? "단기" : long && !short ? "중장기" : null;
    if (short && long) this.w.push("과제 개요: 단기·중장기 둘 다 체크");
    const budgetText = texts.find((t) => t.includes("예산")) ?? null;
    const staffText = texts.find((t) => nospace(t).includes("투입인력")) ?? null;
    const amounts: Record<string, string | null> = { agreement: null, own: null };
    for (const seg of (budgetText ?? "").split(new RegExp(`(?=[${BOXES}])`))) {
      const m = new RegExp(`^[${BOXES}]\\s*(협약|자체)\\s*예산\\s*(.*)$`, "s").exec(strip(seg));
      if (!m) continue;
      let rest = strip(m[2]).replace(/^[:：]\s*/, "");
      rest = strip(rest.replace(/\s*[,，]\s*$/, ""));
      amounts[m[1] === "협약" ? "agreement" : "own"] = rest || null;
    }
    const present = [amounts.agreement, amounts.own].filter(Boolean) as string[];
    const amount = present.length ? present.join(", ") : null;
    let staff: string | null = null;
    if (staffText) {
      const m = /투입\s*인력\s*[:：]?\s*(.*)$/.exec(staffText);
      staff = m ? strip(m[1]) : staffText;
    }
    const other = texts.filter((t) => t !== budgetText && t !== staffText && !/고도화과제|신규과제|단기과제|중장기과제/.test(t));
    if (other.length) this.w.push(`과제 개요: 알 수 없는 칸 ${pyReprList(other)}`);
    return {
      kind,
      term,
      budget: {
        agreement: box(budgetText ?? "", "협약\\s*예산"),
        own: box(budgetText ?? "", "자체\\s*예산"),
        amountText: amount,
        agreementAmount: amounts.agreement,
        ownAmount: amounts.own,
        text: budgetText,
      },
      staffText: staff,
      checks: { advanced: adv, new: neu, shortTerm: short, longTerm: long },
      cells: texts,
    };
  }

  parseKpi() {
    const rows = this.rows("kpi");
    const res: Record<string, LooseJson> = { categories: {}, categoriesText: null, headers: null, rows: [], notes: [] };
    let catText: string | null = null;
    for (const r of rows) {
      const t = this.cellsInRow(r)
        .map((c) => this.text(c))
        .join(" ");
      if (t.includes("경영목표") || t.includes("경영계약")) {
        catText = t;
        for (const c of this.cellsInRow(r)) this.used.add(c);
        break;
      }
    }
    res.categoriesText = catText;
    const ct = catText ?? "";
    res.categories = {
      midLongTermGoal: box(ct, "중장기\\s*경영목표"),
      ceoContract: box(ct, "기관장\\s*경영계약"),
      pool: box(ct, "(?:주요사업\\s*)?성과지표\\s*Pool"),
      representative: box(ct, "(?:주요사업\\s*)?대표\\s*계량지표"),
    };
    const [hr, cols] = this.headerCols("kpi", { name: "지표명", formula: "산식", expected: "실적(예상)", prev: "실적", target: "목표" }, ["name"]);
    if (hr === null) {
      this.w.push("계량 성과지표: 머리행 없음");
      for (const r of rows) for (const c of this.cellsInRow(r)) if (!this.used.has(c) && hasContent(c)) res.notes.push(...this.take(c));
      return res;
    }
    const order = Object.keys(cols).sort((a, b) => cols[a].c - cols[b].c);
    res.headers = Object.fromEntries(order.map((k) => [k, this.text(cols[k])]));
    res.columns = order;
    const firstC = cols[order[0]].c;
    const lastEnd = cols[order[order.length - 1]].c + cols[order[order.length - 1]].colspan;
    const seen = new Set<Cell>();
    for (const r of rows) {
      if (r <= hr) continue;
      const rowCells: Record<string, Cell[]> = Object.fromEntries(order.map((k) => [k, this.spanCells(r, cols[k])]));
      const fresh = Object.values(rowCells)
        .flat()
        .filter((c) => !seen.has(c) && c.r === r && hasContent(c));
      if (!fresh.length) continue;
      const wide = fresh.filter((c) => c.c <= firstC && c.c + c.colspan >= lastEnd);
      if (wide.length) {
        for (const c of wide) {
          seen.add(c);
          res.notes.push(...this.take(c));
        }
        continue;
      }
      const row: Record<string, string | null> = {};
      const shared: string[] = [];
      for (const k of order) {
        const parts: string[] = [];
        for (const c of rowCells[k]) {
          if (seen.has(c)) {
            if (c.r < r && hasContent(c)) {
              shared.push(k);
              parts.push(...cellLines(c).filter(isStr));
            }
            continue;
          }
          seen.add(c);
          parts.push(...this.take(c).filter(isStr));
        }
        row[k] = (rowCells[k].length > 1 ? parts.join(" ") : parts.join("\n")) || null;
      }
      if (!Object.values(row).some(Boolean)) continue;
      const rawName = row.name;
      let unit: string | null = null;
      let name: string | null = null;
      if (rawName) {
        const flat = rawName.replace(/\n/g, " ");
        const m = /^([\s\S]*\S)\s*\(([^()]*)\)\s*$/.exec(flat);
        if (m && [...m[2]].length <= 12) {
          name = m[1];
          unit = m[2];
        } else name = flat;
      }
      const out: Record<string, LooseJson> = { name, unit, formula: row.formula ?? null, prev: row.prev ?? null, target: row.target ?? null, nameRaw: rawName ?? null };
      if ("expected" in cols) out.expected = row.expected ?? null;
      if (shared.length) {
        out.sharedWithPrevious = shared;
        this.w.push(`계량 성과지표: 윗행과 병합된 칸 ${pyReprList(shared)}`);
      }
      res.rows.push(out);
    }
    return res;
  }

  parseStrategy() {
    const [hr, cols] = this.headerCols("strategy", { national: "국정과제", esg: "ESG연계", ai: "AI활용" }, ["national", "esg"]);
    const res: Record<string, LooseJson> = {
      nationalAgenda: [],
      nationalAgendaText: null,
      esg: { environment: null, social: null, governance: null },
      esgText: null,
      ai: { checked: null, text: null },
    };
    if (hr === null) {
      this.w.push("전략 연계성: 머리행 없음");
      return res;
    }
    const vals = this.columnValues("strategy", hr, cols);
    const nat = (vals.national ?? []).filter(isStr);
    res.nationalAgendaText = nat.join("\n") || null;
    res.nationalAgenda = parseNationalAgenda(nat);
    const esg = (vals.esg ?? []).filter(isStr).join(" ");
    res.esgText = esg || null;
    res.esg = { environment: box(esg, "환경"), social: box(esg, "사회"), governance: box(esg, "지배구조") };
    const ai = strip((vals.ai ?? []).filter(isStr).join("\n"));
    if (ai) {
      const m = new RegExp(`^([${BOXES}])\\s*(.*)$`, "s").exec(ai);
      res.ai = m ? { checked: m[1] === CHECKED, text: strip(m[2]) || null } : { checked: null, text: ai };
    }
    return res;
  }

  parseAct() {
    const [hr, cols] = this.headerCols("act", { findings: "경영평가지적", self: "자체평가" });
    const res: Record<string, LooseJson> = { findings: null, selfAssessment: [], headers: null };
    if (hr === null) {
      const lines: Line[] = [];
      for (const c of this.contentCells("act")) lines.push(...this.take(c));
      res.selfAssessment = lines;
      this.w.push("[Act]: 머리행 없음 → 전부 자체평가로 둠");
      return res;
    }
    res.headers = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, this.text(v)]));
    const vals = this.columnValues("act", hr, cols);
    if ("findings" in cols) res.findings = vals.findings;
    res.selfAssessment = vals.self ?? [];
    return res;
  }

  block(k: string, rowsIn?: number[]): [Line[], LooseJson] {
    const rows = rowsIn ?? this.rows(k);
    const lines: Line[] = [];
    let multi = false;
    const keep: Cell[] = [];
    for (const r of rows) {
      let cells = this.cellsInRow(r).filter((c) => hasContent(c) && !this.used.has(c));
      cells = this.dropStray(k, r, cells);
      keep.push(...cells);
      if (cells.length > 1) {
        multi = true;
        this.w.push(`[${k}] 행 ${r} 에 본문 칸 ${cells.length}개가 좌우로 놓임 → grid`);
      }
    }
    let grid: LooseJson = null;
    if (multi) {
      const minC = Math.min(...keep.map((c) => c.c));
      const maxC = Math.max(...keep.map((c) => c.c + c.colspan));
      const rowset = new Set(rows);
      const grows: LooseJson[] = [];
      for (const r of rows) {
        const gr: LooseJson[] = [];
        for (const c of this.t.rows[r]) {
          if (this.labelCells.has(c) || c.c < minC || (this.used.has(c) && !keep.includes(c))) continue;
          let spanR = 0;
          for (let rr = c.r; rr < c.r + c.rowspan; rr++) if (rowset.has(rr)) spanR += 1;
          gr.push({ colspan: Math.min(c.colspan, maxC - c.c), rowspan: Math.max(1, spanR), lines: cellLines(c, this.w) });
        }
        grows.push(gr);
      }
      grid = { rows: grows, cols: maxC - minC };
    }
    for (const c of keep) lines.push(...this.take(c));
    return [lines, grid];
  }

  dropStray(k: string, r: number, cells: Cell[]): Cell[] {
    const out: Cell[] = [];
    for (const c of cells) {
      const t = plainText(c);
      if (c.c === 1 && c.colspan === 1 && [...t].length <= 2 && !cellLines(c).some((x) => !isStr(x))) {
        this.used.add(c);
        this.stray.push({ section: k, row: r, lines: cellLines(c) });
        this.w.push(`[${k}] 여백 열의 글자 ${pyRepr(t)} 는 extra 로 옮김`);
        continue;
      }
      out.push(c);
    }
    return out;
  }

  parsePlan() {
    const [lines, grid] = this.block("plan");
    const items: Line[] = [];
    const stars: string[] = [];
    for (const ln of lines) {
      if (isStr(ln) && ln.startsWith("★")) stars.push(ln);
      else {
        if (stars.length) this.w.push("[Plan]: ★ 줄 뒤에 일반 줄이 이어짐(순서는 plan.lines 에 보존)");
        items.push(ln);
      }
    }
    const sus = stars.map((st) => strip([...st].slice(1).join("")).replace(/^\(\s*지속가능\s*여부\s*\)\s*/, ""));
    return { items, sustainability: sus.length ? sus.join("\n") : null, starLines: stars, lines, grid };
  }

  parseDo() {
    const mainRows: number[] = [];
    const monthly: LooseJson[] = [];
    for (const r of this.rows("do")) {
      const row = this.cellsInRow(r).filter(hasContent);
      let per: number | null = null;
      for (let i = 0; i < row.length; i++) {
        const t = nospace(this.text(row[i], ""));
        if (t && /^(?:\d{1,2}월|[~∼])+$/.test(t) && t.includes("월")) {
          per = i;
          break;
        }
      }
      if (per !== null) {
        const i = per;
        this.used.add(row[i]);
        const items: Line[] = [];
        for (const c of [...this.dropStray("do", r, row.slice(0, i)), ...row.slice(i + 1)]) items.push(...this.take(c));
        const plines = cellLines(row[i]).filter(isStr);
        let toks = plines.flatMap((x) => x.match(/\d{1,2}월|[~∼]/g) ?? []);
        const n = toks.length;
        for (let k = 1; k <= Math.floor(n / 2); k++) {
          if (n % k === 0 && toks.every((t, idx) => t === toks[idx % k])) {
            if (n / k > 1) this.w.push(`[Do] 월별 상자 기간 딱지가 쪽 나눔으로 되풀이됨: ${toks.join("")}`);
            toks = toks.slice(0, k);
            break;
          }
        }
        const period = toks.some((t) => "~∼".includes(t)) ? toks.join("") : toks.join(" ");
        monthly.push({ period, periodTokens: toks, periodLines: plines, items });
      } else mainRows.push(r);
    }
    const [lines, grid] = this.block("do", mainRows);
    return { items: structureDo(lines), monthly, lines, grid };
  }

  parseCheck() {
    const [lines, grid] = this.block("check");
    const res: Record<string, LooseJson> = { risks: [], monitoring: [], items: lines, labels: {}, grid };
    let cur: string | null = null;
    for (const ln of lines) {
      if (isStr(ln)) {
        const m = /^([∙·•-]?\s*)\(([^)]*(?:리스크|장애)[^)]*)\)\s*([\s\S]*)$/.exec(ln);
        const m2 = /^([∙·•-]?\s*)\(([^)]*(?:모니터링|해결)[^)]*)\)\s*([\s\S]*)$/.exec(ln);
        if (m || m2) {
          const mm = (m ?? m2)!;
          cur = m ? "risks" : "monitoring";
          res.labels[cur] = mm[2];
          if (mm[3]) res[cur].push(mm[3]);
          continue;
        }
        if (ln.length && TOP_BULLETS.includes(ln[0])) cur = null;
      }
      if (cur !== null) res[cur].push(ln);
    }
    if (!Object.keys(res.labels).length) this.w.push("[Check]: (장애·리스크)/(모니터링·해결) 표지 없음 → check.items 만 채움");
    return res;
  }

  parseOutcome() {
    const [hr, cols] = this.headerCols("outcome", { quantitative: "정량성과", qualitative: "정성성과" });
    const res: Record<string, LooseJson> = { quantitative: [], qualitative: [], headers: null };
    if (hr === null) {
      this.w.push("추진성과: 머리행 없음");
      for (const c of this.contentCells("outcome")) res.quantitative.push(...this.take(c));
      return res;
    }
    res.headers = Object.fromEntries(Object.entries(cols).map(([k, v]) => [k, this.text(v)]));
    const vals = this.columnValues("outcome", hr, cols);
    res.quantitative = vals.quantitative ?? [];
    res.qualitative = vals.qualitative ?? [];
    return res;
  }

  leftovers() {
    const out: Array<{ section: string | null; row: number; lines: Line[] }> = [...this.stray];
    this.t.rows.forEach((row, r) => {
      for (const c of row) {
        if (this.used.has(c) || this.labelCells.has(c)) continue;
        const lines = cellLines(c);
        if (lines.length) {
          let sec: string | null = null;
          for (const [k, rs] of this.sections) if (rs.includes(r)) {
            sec = k;
            break;
          }
          out.push({ section: sec, row: r, lines });
        }
      }
    });
    return out;
  }
}

const BADGE_WORDS = ["정부정책"];

export function parseNationalAgenda(lines: string[]) {
  const toks: Array<["B" | "T", string]> = [];
  for (const ln of lines)
    for (let part of ln.split(/(#\s*\d+)/)) {
      part = strip(part);
      if (!part) continue;
      toks.push(/^#\s*\d+$/.test(part) || BADGE_WORDS.includes(part) ? ["B", part] : ["T", part]);
    }
  const items: Array<{ titleParts: string[]; badges: string[] }> = [];
  let cur: { titleParts: string[]; badges: string[] } | null = null;
  toks.forEach(([kind, val], i) => {
    if (kind === "B") {
      if (cur === null) {
        cur = { titleParts: [], badges: [] };
        items.push(cur);
      }
      cur.badges.push(val);
      return;
    }
    const nxtIsBadge = i + 1 < toks.length && toks[i + 1][0] === "B";
    if (cur !== null && !cur.badges.length) cur.titleParts.push(val);
    else if (cur !== null && !nxtIsBadge) cur.titleParts.push(val);
    else {
      cur = { titleParts: [val], badges: [] };
      items.push(cur);
    }
  });
  return items.map((it) => {
    let title = "";
    for (const part of it.titleParts) {
      if (title && !["·", "‧", "･", "-"].some((e) => title.endsWith(e))) title += " ";
      title += part;
    }
    const nos = it.badges.filter((b) => b.startsWith("#")).map((b) => b.replace(/\D/g, ""));
    return { no: nos[0] ?? null, title: title || null, nos, badges: it.badges.map((b) => b.replace(/ /g, "")) };
  });
}

const TIMING_RE = /\(\s*([^()]*?(?:\d\s*월|분기|반기|연중|상시|수시|매월|매년|[上下]|\d{2}년|\d+\.\d+\.?)[^()]*?)\s*\)\s*$/;

function splitHeading(s: string): [string | null, string] {
  if (!s.startsWith("(")) return [null, s];
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return [strip(s.slice(1, i)), strip(s.slice(i + 1))];
    }
  }
  return [null, s];
}

const TOP_BULLETS = "∙•▪◦○●■";
const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳➀➁➂➃➄➅➆➇➈➉";
const NEG_CIRCLED = "❶❷❸❹❺❻❼❽❾❿➊➋➌➍➎➏➐➑➒➓";

function markerClass(line: Line): string | null {
  const ch = isStr(line) ? line.slice(0, 1) : "";
  if (!ch) return null;
  if (TOP_BULLETS.includes(ch)) return "bullet";
  if (CIRCLED.includes(ch)) return "circled";
  if (NEG_CIRCLED.includes(ch)) return "negcircled";
  return null;
}

function structureDo(lines: Line[]) {
  const top = lines.map(markerClass).find(Boolean) ?? null;
  const items: LooseJson[] = [];
  for (const ln of lines) {
    if (!isStr(ln)) {
      if (items.length) items[items.length - 1].subs.push(ln);
      else items.push({ marker: null, heading: null, text: null, timing: null, line: null, subs: [ln] });
      continue;
    }
    let s = ln;
    let marker: string | null = null;
    if (top !== null && markerClass(ln) === top) {
      marker = ln[0];
      s = strip(ln.slice(1));
    } else if (items.length) {
      items[items.length - 1].subs.push(ln);
      continue;
    }
    const [heading, restIn] = splitHeading(s);
    let rest = restIn;
    let timing: string | null = null;
    const m = TIMING_RE.exec(rest);
    if (m) {
      timing = m[1];
      rest = rstrip(rest.slice(0, m.index));
    }
    items.push({ marker, heading, text: rest || null, timing, line: ln, subs: [] });
  }
  return items;
}

// ---------------------------------------------------------------------------
// 6. AX 연계과제 붙임
// ---------------------------------------------------------------------------

function parseAxBody(table: Table, warnings: string[]): [string | null, LooseJson[], Line[]] {
  fixStepHeader(table, warnings);
  buildGrid(table);
  let purpose: string | null = null;
  const sections: LooseJson[] = [];
  const notes: Line[] = [];
  for (const row of table.rows) {
    const cells = [...row];
    if (!cells.length) continue;
    const label = plainText(cells[0]);
    const rest: Line[] = [];
    for (const c of cells.slice(1)) rest.push(...cellLines(c, warnings));
    if (cells.length === 1) {
      notes.push(...cellLines(cells[0], warnings));
      continue;
    }
    if (nospace(label) === "과제목적") {
      purpose = rest.filter(isStr).join("\n") || null;
      if (rest.some((x) => !isStr(x))) {
        sections.push({ heading: label, items: rest });
        warnings.push("AX 과제 목적 칸에 표/그림이 있어 sections 에도 둠");
      }
      continue;
    }
    sections.push({ heading: label, items: rest });
  }
  return [purpose, sections, notes];
}

type Seq = ["H", string, Block] | ["B", Table, Block];

function buildAttachments(seq: Seq[], warnings: string[]) {
  const heads = seq.filter((x) => x[0] === "H");
  const bodies = seq.filter((x) => x[0] === "B");
  const pattern = seq.map((x) => x[0]).join("");
  let pairs: Array<[Seq | null, Seq | null]> = [];
  if (heads.length === bodies.length) {
    pairs = heads.map((h, i) => [h, bodies[i]]);
    if (pattern !== "HB".repeat(heads.length)) warnings.push(`AX 머리/본문 순서가 뒤섞여 있어(${pattern}) 등장 순서대로 짝지음`);
  } else {
    warnings.push(`AX 머리 ${heads.length}개 / 본문 ${bodies.length}개 수가 다름(${pattern})`);
    let i = 0;
    while (i < seq.length) {
      if (seq[i][0] === "H" && i + 1 < seq.length && seq[i + 1][0] === "B") {
        pairs.push([seq[i], seq[i + 1]]);
        i += 2;
      } else if (seq[i][0] === "H") {
        pairs.push([seq[i], null]);
        i += 1;
      } else {
        pairs.push([null, seq[i]]);
        i += 1;
      }
    }
  }
  return pairs.map(([h, b], idx) => {
    let [purpose, sections, notes]: [string | null, LooseJson[], Line[]] = [null, [], []];
    if (b) [purpose, sections, notes] = parseAxBody(b[1] as Table, warnings);
    return { no: null, seq: idx + 1, marker: null, markerSource: null, title: h ? (h[1] as string) : null, purpose, sections, notes: notes.length ? notes : null };
  });
}

// ---------------------------------------------------------------------------
// 7. 파일 하나 처리
// ---------------------------------------------------------------------------

export interface ParsedGroup {
  group: { id: string; title: string | null; count: number | null; summary: string | null; source: string; targetBusinesses: LooseJson[]; titleText?: string };
  cards: LooseJson[];
  ignored: Array<{ line: number; type: string; text: string }>;
  indexRows: IndexRow[];
}

/**
 * kordoc 마크다운 한 파일 → 목차·카드. groupId는 목차 첫 칸 「(주요사업N)」에서 읽고, 없으면 fallbackGroup.
 * 그림은 imageResolver가 kordoc 그림 이름을 앱의 그림 경로로 바꿉니다(없으면 null).
 */
export function parseCardMarkdown(md: string, opts: { groupNo?: number; sourceName: string; imageResolver?: ImageResolver; fileType?: string }): ParsedGroup {
  currentResolver = opts.imageResolver ?? (() => null);
  const fileType = opts.fileType ?? (/\.hwpx$/i.test(opts.sourceName) ? "hwpx" : "hwp");
  const blocks = splitBlocks(md, fileType === "hwpx");
  let groupNo = opts.groupNo;
  const gt = blocks.find((b) => b.type === "groupTitle");
  if (!groupNo && gt) {
    const m = /^\(주요사업\s*(\d+)\)/.exec(firstCellText(gt.tables[0]));
    if (m) groupNo = Number(m[1]);
  }
  const group: ParsedGroup["group"] = { id: groupNo ? `주요사업${groupNo}` : "주요사업?", title: null, count: null, summary: null, source: opts.sourceName, targetBusinesses: [] };
  let indexRows: IndexRow[] = [];
  const cardsRaw: Array<{ card: Block; tail: Block[] }> = [];
  const ignored: ParsedGroup["ignored"] = [];
  for (const b of blocks) {
    const typ = b.type;
    if (typ === "groupTitle") {
      const t = firstCellText(b.tables[0]);
      const m = /^\((주요사업\s*\d+)\)\s*([\s\S]*?)\s*\((\d+)\s*개\)\s*$/.exec(t);
      if (m) {
        group.title = m[2];
        group.count = Number(m[3]);
      } else group.title = t;
      group.titleText = t;
    } else if (typ === "summary") {
      group.summary = strip(b.text.replace(/^[【】]+|[【】]+$/g, ""));
    } else if (typ === "index") {
      const r = parseIndex(b.tables[0]);
      group.targetBusinesses = r.tbs;
      indexRows = r.rows;
    } else if (typ === "card") {
      cardsRaw.push({ card: b, tail: [] });
    } else if ((typ === "axHeader" || typ === "axBody") && cardsRaw.length) {
      cardsRaw[cardsRaw.length - 1].tail.push(b);
    } else {
      ignored.push({ line: b.line, type: typ, text: [...b.text].slice(0, 200).join("") });
    }
  }
  const idx = new Map(indexRows.map((r) => [r.taskNo, r]));
  const cards = cardsRaw.map((cr) => {
    const warnings: string[] = [];
    const table = cr.card.tables[0];
    const cp = new CardParser(table, warnings);
    const head = cp.parseTitle();
    const overview = cp.parseOverview();
    const kpi = cp.parseKpi();
    const strategy = cp.parseStrategy();
    const act = cp.parseAct();
    const plan = cp.parsePlan();
    const doSec = cp.parseDo();
    const check = cp.parseCheck();
    const outcome = cp.parseOutcome();
    const extra = cp.leftovers();
    if (extra.length) warnings.push(`알려진 칸 밖 내용 ${extra.length}칸 → extra`);
    const missing = SECTION_LABELS.map(([k]) => k).filter((k) => !cp.sections.has(k));
    if (missing.length) warnings.push(`없는 구역: ${missing.join(", ")}`);
    const seq: Seq[] = [];
    for (const b of cr.tail) {
      for (const t of b.tables) {
        if (b.type === "axHeader") {
          const titleCells = t.rows.length ? t.rows[0].slice(1) : [];
          const title = strip(titleCells.map((c) => cellLines(c).filter(isStr).join(" ")).join(" "));
          seq.push(["H", title, b]);
          if (t.rows.length > 1) {
            const body = new Table();
            body.rows = t.rows.slice(1);
            seq.push(["B", body, b]);
          }
        } else seq.push(["B", t, b]);
      }
    }
    const attachments = seq.length ? buildAttachments(seq, warnings) : [];
    const taskNo = head.taskNo;
    const ix = idx.get(taskNo);
    if (!ix) warnings.push(`목차에서 과제번호 ${taskNo} 를 찾지 못함`);
    const raw = [cr.card.text, ...cr.tail.map((b) => b.text)].join("\n\n");
    return {
      id: `${group.id}/${taskNo}`,
      group: group.id,
      taskNo,
      title: head.title,
      indexTitle: ix ? ix.title : null,
      tags: ix ? { new: ix.tags.new, regionalCount: ix.tags.regionalCount, ax: ix.tags.ax, labels: ix.tags.labels } : { new: null, regionalCount: null, ax: null, labels: [] },
      targetBusiness: ix ? ix.targetBusiness : null,
      executionTask: ix ? ix.executionTask : null,
      executionTaskNo: ix ? ix.executionTaskNo : null,
      department: head.department,
      team: head.team,
      deptText: head.deptText,
      indexDepartment: ix ? ix.department : null,
      manager: head.manager,
      writer: head.writer,
      overview,
      kpi,
      strategy,
      act,
      plan,
      do: doSec,
      check,
      outcome,
      axAttachment: attachments[0] ?? null,
      axAttachments: attachments,
      extra,
      sectionOrder: cp.order,
      source: { file: opts.sourceName, kordocLine: cr.card.line },
      parseWarnings: warnings,
      raw,
    };
  });
  currentResolver = () => null;
  return { group, cards, ignored, indexRows };
}
