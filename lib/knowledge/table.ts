// kordoc 표 읽기: HTML 표(병합·중첩 포함)와 파이프 표.

import { cellText, normalizeText } from "./normalize.ts";

export interface TableCell {
  tag: "th" | "td";
  colspan: number;
  rowspan: number;
  /** 셀 안쪽 원문 HTML(중첩 표 포함) */
  html: string;
  /** 표시용 글자. 줄바꿈은 공백, 중첩 표는 행을 " / "로 이음 */
  text: string;
}

export interface TableRow {
  cells: TableCell[];
  /** <tr>…</tr> 안쪽 원문 */
  html: string;
}

export interface ParsedTable {
  rows: TableRow[];
  /** 원문 안에서의 위치 */
  start: number;
  end: number;
}

const TAG_SOURCE = String.raw`<(\/?)(table|tr|th|td)\b([^>]*)>`;

function attrNumber(attrs: string, name: string): number {
  const m = new RegExp(`${name}\\s*=\\s*"?(\\d+)`, "i").exec(attrs);
  return m ? Number(m[1]) : 1;
}

/** 최상위 표들을 순서대로 읽습니다. 중첩 표는 셀 안의 글자로 풉니다. */
export function parseHtmlTables(html: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  let depth = 0;
  let table: ParsedTable | null = null;
  let row: { start: number; cells: TableCell[] } | null = null;
  let cell: { tag: "th" | "td"; attrs: string; start: number } | null = null;

  // 셀 글자를 만들 때 재귀 호출하므로 정규식 상태를 호출마다 따로 둡니다.
  const tag = new RegExp(TAG_SOURCE, "gi");
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const closing = m[1] === "/";
    const name = m[2].toLowerCase();
    const afterTag = m.index + m[0].length;
    if (name === "table") {
      if (!closing) {
        depth += 1;
        if (depth === 1) table = { rows: [], start: m.index, end: -1 };
      } else {
        if (depth === 1 && table) {
          table.end = afterTag;
          tables.push(table);
          table = null;
        }
        depth = Math.max(0, depth - 1);
      }
      continue;
    }
    if (depth !== 1 || !table) continue;
    if (name === "tr") {
      if (!closing) row = { start: afterTag, cells: [] };
      else if (row) {
        table.rows.push({ cells: row.cells, html: html.slice(row.start, m.index) });
        row = null;
      }
    } else if (!closing) {
      cell = { tag: name as "th" | "td", attrs: m[3], start: afterTag };
    } else if (cell && row) {
      const inner = html.slice(cell.start, m.index);
      row.cells.push({
        tag: cell.tag,
        colspan: attrNumber(cell.attrs, "colspan"),
        rowspan: attrNumber(cell.attrs, "rowspan"),
        html: inner,
        text: htmlFragmentText(inner),
      });
      cell = null;
    }
  }
  return tables;
}

/** 셀 안쪽 HTML → 글자. 중첩 표는 행을 " / ", 칸을 공백으로 잇습니다. */
export function htmlFragmentText(fragment: string): string {
  if (!/<table/i.test(fragment)) return cellText(fragment);
  let out = "";
  let last = 0;
  for (const t of parseHtmlTables(fragment)) {
    out += `${fragment.slice(last, t.start)}<br>${flattenTable(t)}<br>`;
    last = t.end;
  }
  out += fragment.slice(last);
  return cellText(out);
}

function flattenTable(t: ParsedTable): string {
  return t.rows
    .map((r) => r.cells.map((c) => c.text).filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" / ");
}

/** 병합을 펼친 격자. 병합 셀은 차지한 칸마다 같은 글자를 둡니다. */
export function expandGrid(table: ParsedTable): string[][] {
  const grid: string[][] = [];
  const pending: Array<{ text: string; left: number } | undefined> = [];
  table.rows.forEach((row, r) => {
    const out: string[] = [];
    let col = 0;
    const fillPending = () => {
      while (pending[col] && pending[col]!.left > 0) {
        out[col] = pending[col]!.text;
        pending[col]!.left -= 1;
        col += 1;
      }
    };
    fillPending();
    for (const c of row.cells) {
      fillPending();
      for (let k = 0; k < c.colspan; k++) {
        out[col] = c.text;
        if (c.rowspan > 1) pending[col] = { text: c.text, left: c.rowspan - 1 };
        col += 1;
      }
    }
    fillPending();
    grid[r] = Array.from(out, (v) => v ?? "");
  });
  return grid;
}

/** 표를 "열머리=값; …" 문장으로 풉니다(색인용, 분석 §2-3) */
export function linearizeGrid(grid: string[][], headerRows = 1): string[] {
  if (grid.length === 0) return [];
  const header = grid[Math.max(0, headerRows - 1)] ?? [];
  const body = headerRows > 0 ? grid.slice(headerRows) : grid;
  return body
    .map((row) => {
      const parts: string[] = [];
      row.forEach((v, i) => {
        if (!v) return;
        if (i > 0 && row[i - 1] === v) return; // colspan 반복 제거
        const h = header[i];
        parts.push(h && h !== v && headerRows > 0 ? `${h}=${v}` : v);
      });
      return parts.join("; ");
    })
    .filter(Boolean);
}

/** 행 몇 개를 다시 하나의 HTML 표로 감쌉니다(질문 머리로 표를 나눌 때) */
export function wrapRows(rows: TableRow[]): string {
  return `<table>\n${rows.map((r) => `<tr>${r.html}</tr>`).join("\n")}\n</table>`;
}

export interface PipeTable {
  rows: string[][];
}

/** 파이프 표. 구분선(| --- |)은 버리고 칸은 원문(<br> 포함) 그대로 둡니다. */
export function parsePipeTable(text: string): PipeTable {
  const rows: string[][] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line.startsWith("|")) continue;
    if (/^\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) continue;
    const body = line.replace(/^\|/, "").replace(/\|\s*$/, "");
    rows.push(body.split(/(?<!\\)\|/).map((c) => c.trim()));
  }
  return { rows };
}

/** 표 원문(HTML 또는 파이프) → 색인용 선형 문장 */
export function tableSearchText(tableText: string): string {
  const trimmed = tableText.trim();
  if (trimmed.startsWith("|")) {
    const { rows } = parsePipeTable(trimmed);
    const grid = rows.map((r) => r.map((c) => cellText(c)));
    return linearizeGrid(grid, grid.length > 1 ? 1 : 0).join("\n");
  }
  return parseHtmlTables(trimmed)
    .map((t) => {
      const grid = expandGrid(t);
      const headerRows = t.rows[0]?.cells.every((c) => c.tag === "th") && t.rows.length > 1 ? 1 : 0;
      return linearizeGrid(grid, headerRows).join("\n");
    })
    .join("\n");
}

/** 표 원문을 사람이 읽는 글자로(파이프·HTML 모두) */
export function tablePlainText(tableText: string): string {
  const trimmed = tableText.trim();
  if (trimmed.startsWith("|")) {
    return parsePipeTable(trimmed)
      .rows.map((r) => r.map((c) => cellText(c)).filter(Boolean).join(" | "))
      .join("\n");
  }
  return normalizeText(
    parseHtmlTables(trimmed)
      .map((t) => t.rows.map((r) => r.cells.map((c) => c.text).filter(Boolean).join(" | ")).join("\n"))
      .join("\n"),
  );
}
