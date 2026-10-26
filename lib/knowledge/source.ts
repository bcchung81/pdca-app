// kordoc 산출물(<이름>.chunks.json) 읽기. 조각 경계는 버리고 쪽이 붙은 블록 흐름으로만 씁니다.

export interface SourceBlock {
  id: string;
  type: string;
  text: string;
  /** 시작 쪽(PDF 쪽 또는 HWP 조판 쪽) */
  page: number;
  /** 상위 제목들(kordoc breadcrumb — 자기 제목은 빼고, 없으면 빈 배열). 범용 조각기가 씀 */
  breadcrumb: string[];
}

export function loadKordocChunks(json: unknown): SourceBlock[] {
  if (!Array.isArray(json)) throw new Error("kordoc chunks.json: 배열이 아닙니다");
  let lastPage = 1;
  return json.map((c, i) => {
    const o = c as Record<string, unknown>;
    if (typeof o.text !== "string") throw new Error(`kordoc chunks.json: ${i}번째 조각에 text가 없습니다`);
    // 문서 끝 그림 조각처럼 page가 없으면 앞 조각의 쪽을 씁니다.
    const page = typeof o.page === "number" ? o.page : lastPage;
    lastPage = page;
    const breadcrumb = Array.isArray(o.breadcrumb) ? o.breadcrumb.filter((x): x is string => typeof x === "string") : [];
    return { id: String(o.id ?? `c${i}`), type: String(o.type ?? "text"), text: o.text, page, breadcrumb };
  });
}

export type LineItem =
  | { kind: "line"; text: string; page: number }
  | { kind: "table"; text: string; page: number };

/**
 * 블록 흐름을 줄 단위로 폅니다. 표(HTML·파이프)는 한 덩어리로 둡니다.
 * kordoc은 글상자(1×1 표)를 table로 내기도 하므로 유형이 아니라 글자로 판정합니다.
 */
export function toLineItems(blocks: SourceBlock[]): LineItem[] {
  const items: LineItem[] = [];
  for (const b of blocks) {
    const segments = splitTables(b.text);
    for (const seg of segments) {
      if (seg.table) {
        items.push({ kind: "table", text: seg.text, page: b.page });
      } else {
        for (const line of seg.text.split("\n")) {
          if (line.trim()) items.push({ kind: "line", text: line.trim(), page: b.page });
        }
      }
    }
  }
  return items;
}

/** 글 안의 HTML 표와 파이프 표 구간을 나눕니다 */
function splitTables(text: string): Array<{ table: boolean; text: string }> {
  const out: Array<{ table: boolean; text: string }> = [];
  const lines = text.split("\n");
  let buf: string[] = [];
  let mode: "text" | "html" | "pipe" = "text";
  let depth = 0;
  const flush = (table: boolean) => {
    const t = buf.join("\n");
    if (t.trim()) out.push({ table, text: t });
    buf = [];
  };
  for (const line of lines) {
    const trimmed = line.trim();
    if (mode === "text") {
      if (trimmed.startsWith("<table")) {
        flush(false);
        mode = "html";
        depth = 0;
      } else if (trimmed.startsWith("|")) {
        flush(false);
        mode = "pipe";
      }
    } else if (mode === "pipe" && !trimmed.startsWith("|")) {
      flush(true);
      mode = trimmed.startsWith("<table") ? "html" : "text";
      depth = 0;
    }
    buf.push(line);
    if (mode === "html") {
      depth += (line.match(/<table\b/gi) ?? []).length;
      depth -= (line.match(/<\/table>/gi) ?? []).length;
      if (depth <= 0) {
        flush(true);
        mode = "text";
      }
    }
  }
  flush(mode !== "text");
  return out;
}
