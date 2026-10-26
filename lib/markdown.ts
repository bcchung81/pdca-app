// AI 답(마크다운)을 화면용 블록으로 나누는 순수 파서. HTML은 만들지 않고(화면이 React 요소로 그림) 원문 HTML 태그는 글자로 둡니다.
// 지원: 제목(#~####), 문단, 목록(-·*·+·1.), 인용(>), 표(| … |, 구분 줄), 구분선(---), 코드 블록(```), 지침 기호 줄(◆ ▸ □ ○ ※ ★ ■ ▣).

export type MdInline = { kind: "text" | "bold" | "italic" | "code"; text: string };

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; inline: MdInline[] }
  | { kind: "paragraph"; inline: MdInline[] }
  | { kind: "symbol"; mark: string; inline: MdInline[] }
  | { kind: "list"; ordered: boolean; items: Array<{ depth: number; inline: MdInline[] }> }
  | { kind: "quote"; inline: MdInline[] }
  | { kind: "table"; head: MdInline[][]; rows: MdInline[][][] }
  | { kind: "rule" }
  | { kind: "code"; text: string };

/** 지침 출력 기호(작성지원 지침 09·보고서 개조식). 줄 첫 글자가 이것이면 기호 줄 */
export const SYMBOL_MARKS = ["◆", "▸", "□", "○", "※", "★", "■", "▣", "▶", "◇", "●"] as const;

/** 줄 안 강조: **굵게** · *기울임* · `코드` */
export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = [];
  const re = /(\*\*([^*]+?)\*\*|__([^_]+?)__|`([^`]+?)`|(?<![\w*])\*([^*\s][^*]*?)\*(?!\w))/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    if (m.index > last) out.push({ kind: "text", text: src.slice(last, m.index) });
    if (m[2] !== undefined || m[3] !== undefined) out.push({ kind: "bold", text: m[2] ?? m[3] });
    else if (m[4] !== undefined) out.push({ kind: "code", text: m[4] });
    else out.push({ kind: "italic", text: m[5] });
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out.filter((x) => x.text !== "");
}

const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/(?<!\\)\|$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n"));

/** 마크다운 → 블록 */
export function parseMarkdown(src: string): MdBlock[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MdBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: "paragraph", inline: parseInline(para.join(" ")) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const t = raw.trim();
    if (!t) {
      flush();
      continue;
    }
    if (t.startsWith("```")) {
      flush();
      const body: string[] = [];
      for (i += 1; i < lines.length && !lines[i].trim().startsWith("```"); i++) body.push(lines[i]);
      blocks.push({ kind: "code", text: body.join("\n") });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(t);
    if (h) {
      flush();
      blocks.push({ kind: "heading", level: Math.min(4, h[1].length) as 1 | 2 | 3 | 4, inline: parseInline(h[2].replace(/\s+#+$/, "")) });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    // 표: 이 줄과 다음 줄(구분 줄)이 표 모양
    if (t.startsWith("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) {
      flush();
      const head = cells(t).map(parseInline);
      const rows: MdInline[][][] = [];
      for (i += 2; i < lines.length && lines[i].trim().startsWith("|"); i++) rows.push(cells(lines[i]).map(parseInline));
      i -= 1;
      blocks.push({ kind: "table", head, rows });
      continue;
    }
    // 구분 줄 없는 | 표 | (지침 09의 월별 6열 표처럼 AI가 머리 구분 없이 쓴 경우): 첫 줄을 머리로
    if (t.startsWith("|") && t.endsWith("|") && t.length > 2) {
      flush();
      const all: MdInline[][][] = [];
      for (; i < lines.length && lines[i].trim().startsWith("|"); i++) if (!TABLE_SEP.test(lines[i].trim())) all.push(cells(lines[i]).map(parseInline));
      i -= 1;
      blocks.push({ kind: "table", head: all[0] ?? [], rows: all.slice(1) });
      continue;
    }
    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(raw);
    if (li) {
      flush();
      const ordered = /\d/.test(li[2]);
      const items: Array<{ depth: number; inline: MdInline[] }> = [];
      for (; i < lines.length; i++) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || /\d/.test(m[2]) !== ordered) break;
        items.push({ depth: Math.min(3, Math.floor(m[1].replace(/\t/g, "  ").length / 2)), inline: parseInline(m[3]) });
      }
      i -= 1;
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (t.startsWith(">")) {
      flush();
      const body: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) body.push(lines[i].trim().replace(/^>\s?/, ""));
      i -= 1;
      blocks.push({ kind: "quote", inline: parseInline(body.join(" ")) });
      continue;
    }
    const mark = SYMBOL_MARKS.find((s) => t.startsWith(s));
    if (mark) {
      flush();
      blocks.push({ kind: "symbol", mark, inline: parseInline(t.slice(mark.length).trim()) });
      continue;
    }
    para.push(t);
  }
  flush();
  return blocks;
}

/** 줄 안 강조를 뺀 글(검색·복사용) */
export function inlineText(inline: MdInline[]): string {
  return inline.map((x) => x.text).join("");
}

/** 절 머리: ◆·■·▣ 기호 줄과 # · ## 제목(지침 출력 기호의 큰 절) */
export const isSectionHead = (b: MdBlock) => (b.kind === "symbol" && (b.mark === "◆" || b.mark === "■" || b.mark === "▣")) || (b.kind === "heading" && b.level <= 2);

export interface MdSections {
  /** 첫 절 머리 앞 글(늘 보임) */
  intro: MdBlock[];
  sections: Array<{ head: MdBlock; body: MdBlock[] }>;
  /** 맺음 글(늘 보임): 마지막 절 끝의 문단·인용·※ 한 줄 — 지침 09 모드 A의 「원본자료 수치와 일치하는지 확인 후 반영」처럼 답 끝에 붙는 확인 요청이 접힌 절에 숨지 않게 */
  outro: MdBlock[];
}

/** 절 접기(AI 답 보기)용으로 나눔 — 절 머리가 둘 이상일 때만(아니면 null). 마지막 절은 다른 줄이 남을 때만 맺음 글을 떼어 냄 */
export function foldSections(blocks: MdBlock[]): MdSections | null {
  if (blocks.filter(isSectionHead).length < 2) return null;
  const intro: MdBlock[] = [];
  const sections: MdSections["sections"] = [];
  for (const b of blocks) {
    if (isSectionHead(b)) sections.push({ head: b, body: [] });
    else if (sections.length) sections[sections.length - 1].body.push(b);
    else intro.push(b);
  }
  const last = sections[sections.length - 1].body;
  const tail = last.at(-1);
  const closing = tail && (tail.kind === "paragraph" || tail.kind === "quote" || (tail.kind === "symbol" && tail.mark === "※"));
  const outro = closing && last.length >= 2 ? [last.pop()!] : [];
  return { intro, sections, outro };
}

