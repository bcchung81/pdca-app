// 공통 지식 조각 글(kordoc 마크다운) 풀기(순수). kordoc은 병합 칸이 있는 표를 HTML <table>(colspan·rowspan)로,
// 칸 안 줄바꿈을 <br>로, 마크다운 특수 문자를 \* \| 처럼 적습니다. 화면은 이것을 안전한 표·글 조각으로 그리고(HTML을 그대로 넣지 않음),
// AI에 줄 때와 인용 대조에는 표를 「칸 | 칸」 줄 글로 풉니다.

export interface RichCell {
  /** 칸 글(줄바꿈은 \n, 안쪽 표는 「칸 | 칸」 줄로) */
  text: string;
  colspan: number;
  rowspan: number;
  head: boolean;
}

const ENTITIES: Record<string, string> = { lt: "<", gt: ">", quot: '"', apos: "'", amp: "&", nbsp: " " };

/** HTML 문자 참조(&lt; &#39; &#x27; 등) 풀기 */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
      return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** kordoc이 붙인 마크다운 이스케이프(\* \| \_ \# 등) 풀기 */
export function unescapeMarkdown(s: string): string {
  return s.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, "$1");
}

/** 사설 영역 문자(U+E000~F8FF) — 수식 편집기·기호 글꼴 글리프가 글로 못 옮겨지고 남은 것(뜻 없는 글자) */
const PRIVATE_USE = /[\uE000-\uF8FF]/g;

/** 표 밖 글(또는 닫히지 않은 표)을 줄 글로 */
function flattenText(md: string): string {
  return unescapeMarkdown(
    decodeEntities(
      md
        .replace(/<br\s*\/?>/gi, " / ")
        .replace(/<\/t[dh]>\s*/gi, " | ")
        .replace(/<\/tr>\s*/gi, "\n")
        .replace(/<img\b[^>]*>/gi, "[그림]")
        .replace(/<\/?(?:table|thead|tbody|tr|td|th)\b[^>]*>/gi, "")
        .replace(PRIVATE_USE, ""),
    ),
  );
}

/** 표 하나를 「칸 | 칸 |」 줄들로. 아래 행으로 이어지는 칸(rowspan)은 「〃」로 자리를 채워 열이 어긋나지 않게 함, 가로 병합(colspan)은 한 번만 적음 */
function renderTable(rows: RichCell[][]): string {
  const carry: Array<{ col: number; width: number; left: number }> = [];
  return rows
    .map((row) => {
      const cells: string[] = [];
      let col = 0;
      const flushCarry = () => {
        for (let c = carry.find((x) => x.col === col && x.left > 0); c; c = carry.find((x) => x.col === col && x.left > 0)) {
          cells.push("〃");
          c.left -= 1;
          col += c.width;
        }
      };
      for (const cell of row) {
        flushCarry();
        cells.push(cell.text.replace(/\n/g, " / "));
        if (cell.rowspan > 1) carry.push({ col, width: cell.colspan, left: cell.rowspan - 1 });
        col += cell.colspan;
      }
      flushCarry();
      return `${cells.join(" | ")} |\n`;
    })
    .join("");
}

/** HTML 표(병합 칸)를 줄 표(칸 | 칸)로 — AI 프롬프트·인용 대조·검색 미리보기용 */
export function flattenHtmlTables(md: string): string {
  md = md.replace(/<img\b[^>]*>/gi, "[그림]"); // 칸 안 그림도 자리를 남김(표 칸 글에서는 태그가 지워지므로 먼저)
  let out = "";
  let at = 0;
  for (const [a, b] of tableSpans(md)) {
    out += flattenText(md.slice(at, a)) + renderTable(parseTable(md.slice(a, b)));
    at = b;
  }
  return (out + flattenText(md.slice(at))).replace(/[ \t]+\n/g, "\n");
}

/** 칸 안 HTML → 글(줄바꿈은 \n, 안쪽 표는 줄 표, 그림은 [그림]) — 화면 표와 문서 파서(Pool·AX)가 같이 씀 */
export function cellLines(html: string): string {
  return cellText(html.replace(/<img\b[^>]*>/gi, "[그림]").replace(/!\[[^\]]*\]\([^)]*\)/g, "[그림]"));
}

function cellText(html: string): string {
  // 안쪽 표는 범위별로 줄 표로 풀어 끼우고(풀린 글의 「< … >」를 태그로 착각해 지우지 않게), 표 밖 글만 태그를 걷음
  const plain = (s: string) => unescapeMarkdown(decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")));
  let out = "";
  let at = 0;
  for (const [a, b] of tableSpans(html)) {
    out += `${plain(html.slice(at, a))}\n${flattenHtmlTables(html.slice(a, b)).trim()}\n`;
    at = b;
  }
  return `${out}${plain(html.slice(at))}`
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

const attr = (tag: string, name: string) => {
  const m = new RegExp(`${name}\\s*=\\s*["']?(\\d+)`, "i").exec(tag);
  return m ? Math.max(1, Math.min(50, Number(m[1]))) : 1;
};

/** 바깥 표 하나(<table>…</table>)를 행·칸으로. 안쪽 표는 칸 글로 */
function parseTable(html: string): RichCell[][] {
  const rows: RichCell[][] = [];
  const tag = /<(\/?)(table|tr|td|th)\b[^>]*>/gi;
  let depth = 0;
  let row: RichCell[] | null = null;
  let cell: { open: string; head: boolean; from: number } | null = null;
  for (let m = tag.exec(html); m; m = tag.exec(html)) {
    const close = m[1] === "/";
    const name = m[2].toLowerCase();
    if (name === "table") {
      depth += close ? -1 : 1;
      continue;
    }
    if (depth !== 1) continue; // 안쪽 표의 행·칸은 칸 글에 그대로 둠
    if (name === "tr") {
      if (!close) row = [];
      else if (row) {
        if (cell) {
          row.push({ text: cellText(html.slice(cell.from, m.index)), colspan: attr(cell.open, "colspan"), rowspan: attr(cell.open, "rowspan"), head: cell.head });
          cell = null;
        }
        if (row.length) rows.push(row);
        row = null;
      }
      continue;
    }
    // td·th
    if (!close) {
      if (!row) row = [];
      if (cell) row.push({ text: cellText(html.slice(cell.from, m.index)), colspan: attr(cell.open, "colspan"), rowspan: attr(cell.open, "rowspan"), head: cell.head });
      cell = { open: m[0], head: name === "th", from: m.index + m[0].length };
    } else if (cell && row) {
      row.push({ text: cellText(html.slice(cell.from, m.index)), colspan: attr(cell.open, "colspan"), rowspan: attr(cell.open, "rowspan"), head: cell.head });
      cell = null;
    }
  }
  if (row?.length) rows.push(row);
  return rows;
}

/** 글 조각의 HTML 표 위치(바깥 표만, 안쪽 표는 품음). 닫히지 않은 표는 표로 보지 않음 */
function tableSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const re = /<(\/?)table\b[^>]*>/gi;
  let depth = 0;
  let start = -1;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] !== "/") {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) spans.push([start, m.index + m[0].length]);
    }
  }
  return spans;
}

/** 표 밖 글: 태그·문자 참조·이스케이프를 걷은 글(줄은 유지) */
function plainText(s: string): string {
  return unescapeMarkdown(decodeEntities(s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(?:table|thead|tbody|tr|td|th)\b[^>]*>/gi, "")));
}

/** 화면 블록: 제목·문단·표(HTML 표와 마크다운 파이프 표 모두) */
export type ChunkBlock = { kind: "heading"; level: number; text: string } | { kind: "para"; text: string } | { kind: "table"; rows: RichCell[][] };

const PIPE_ROW = /^\s*\|.*\|\s*$/;
const PIPE_SEPARATOR = /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/;

/** 파이프 표 한 줄 → 칸 글(이스케이프된 \| 는 칸 경계가 아님) */
function pipeCells(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split(/(?<!\\)\|/).map((c) => plainText(c).replace(/\t+/g, " ").trim());
}

/**
 * 표 밖 마크다운 글 → 블록. 그림 참조(![](이름)·<img>)는 화면에서 걷고(그림은 조각 meta.images가 따로 보여 줌),
 * 마크다운 파이프 표(헤더 줄 + `| --- |` 구분 줄)는 표로, `#` 제목은 제목으로, 빈 줄마다 문단을 나눔.
 * 칸이 모두 빈 행은 버리고, 머리 줄이 모두 비면 머리 없이 그림(PDF 슬라이드 배치 표에 흔함).
 */
function markdownBlocks(raw: string): ChunkBlock[] {
  const lines = raw.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<img\b[^>]*>/gi, "").split("\n");
  const out: ChunkBlock[] = [];
  let buf: string[] = [];
  const flush = () => {
    // 줄 앞뒤 공백은 걷음(그림 참조를 지운 자리·슬라이드 글상자 들여쓰기 — 뜻 없음)
    const t = plainText(buf.join("\n"))
      .replace(/\t+/g, "  ")
      .split("\n")
      .map((l) => l.trim())
      .join("\n")
      .replace(/^\n+|\n+$/g, "");
    if (t) out.push({ kind: "para", text: t });
    buf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (PIPE_ROW.test(line) && i + 1 < lines.length && PIPE_SEPARATOR.test(lines[i + 1])) {
      flush();
      const head = pipeCells(line);
      const rows: RichCell[][] = [];
      const cellsOf = (cells: string[], isHead: boolean): RichCell[] => cells.map((text) => ({ text, colspan: 1, rowspan: 1, head: isHead }));
      if (head.some(Boolean)) rows.push(cellsOf(head, true));
      for (i += 2; i < lines.length && PIPE_ROW.test(lines[i]); i++) {
        const cells = pipeCells(lines[i]);
        if (cells.some(Boolean)) rows.push(cellsOf(cells, false));
      }
      i -= 1;
      if (rows.length) out.push({ kind: "table", rows });
      continue;
    }
    const h = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      const t = plainText(h[2]).trim();
      if (t) out.push({ kind: "heading", level: h[1].length, text: t });
      continue;
    }
    if (!line.trim()) flush();
    else buf.push(line);
  }
  flush();
  return out;
}

/** 조각 글 → 화면 블록(제목·문단·표). HTML은 그대로 넘기지 않고 글자만 남김. 문단 사이 빈 줄은 한 번의 간격으로 */
export function parseChunkBlocks(text: string): ChunkBlock[] {
  const out: ChunkBlock[] = [];
  let at = 0;
  for (const [a, b] of tableSpans(text)) {
    out.push(...markdownBlocks(text.slice(at, a)));
    const rows = parseTable(text.slice(a, b));
    if (rows.length) out.push({ kind: "table", rows });
    at = b;
  }
  out.push(...markdownBlocks(text.slice(at)));
  return out;
}

/** 검색 결과 미리보기 한 줄 글 */
export function snippetText(text: string, max = 260): string {
  return flattenHtmlTables(text)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // 그림 참조
    .replace(/^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/gm, " ") // 마크다운 표 구분 줄
    .replace(/^#{1,6}\s+/gm, "") // 제목 기호
    .replace(/(?:\|\s*){2,}/g, "| ") // 빈 칸이 이어진 파이프
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
