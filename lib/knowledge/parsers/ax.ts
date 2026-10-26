// 2026년 AX협의체 검토 과제(과제관리카드 작성 안내 붙임6, 지침 09 「지식파일」 'AI활용: AX 협의체 검토과제') → 조각.
// 원문은 세 묶음: 붙임1 Idea-Hub 제안 과제별 세부내용(①…) · 붙임2 부처 공모과제 발굴 아이디어(예시, (1)…) · 붙임2 과제별 세부내용(①…).
// 과제마다 「과제 목적·주요 기능·대상 데이터·기대 효과·체크리스트」(아이디어는 「배경·주요 내용·핵심 포인트」) 칸 표가 HTML 또는 파이프 표로 이어집니다.

import { finalizeChunks, makeChunk } from "../chunk.ts";
import { cellLines } from "../rich-text.ts";
import { type SourceBlock, toLineItems } from "../source.ts";
import { parseHtmlTables, parsePipeTable } from "../table.ts";
import type { Check, ParseResult } from "../types.ts";

export const AX_DOC_ID = "ax26-2605";
/** 검산: 묶음별 과제 수(원문 번호 ①…⑧ · (1)…(5) · ①…⑨ + 번호 없이 제목 줄만 있는 2건) */
export const AX_EXPECTED = { bySection: [8, 5, 11], unnumbered: [0, 0, 2] } as const;
/** 과제 칸 표의 첫 칸 — 번호 없는 과제도 이 칸이 다시 나오면 새 과제 */
const FIRST_LABELS = new Set(["과제목적", "배경"]);

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();
const clean = (s: string) => s.replace(/\*\*/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "[그림]");

interface AxItem {
  section: number;
  sectionTitle: string;
  no: number;
  /** 원문에 번호 없이 제목 줄만 있던 과제 */
  unnumbered: boolean;
  name: string;
  page: number;
  fields: Array<[string, string]>;
}

export function parseAx(blocks: SourceBlock[]): ParseResult {
  const items: AxItem[] = [];
  const sections: string[] = [];
  let cur: AxItem | null = null;
  // 앞 표 뒤에 나온 글 줄(번호 없는 과제의 제목 후보)
  let loose: string[] = [];
  const labelOf = (k: string) => oneLine(cellLines(clean(k))).replace(/\s/g, "");
  const addFields = (pairs: Array<[string, string]>, page: number) => {
    if (!sections.length) return;
    const first = pairs[0] ? labelOf(pairs[0][0]) : "";
    if (cur && FIRST_LABELS.has(first) && cur.fields.some(([k]) => k === first)) {
      const prev: AxItem = cur;
      cur = { section: prev.section, sectionTitle: prev.sectionTitle, no: prev.no + 1, unnumbered: true, name: oneLine(clean(loose.join(" "))) || "(제목 없음)", page, fields: [] };
      items.push(cur);
    }
    loose = [];
    if (!cur) return;
    for (const [k, v] of pairs) {
      const label = labelOf(k);
      const value = v.trim();
      if (!label || !value) continue;
      const last = cur.fields.at(-1);
      // 표가 쪽에서 나뉘어 머리 없이 이어지면 앞 칸에 붙임
      if (last && label === last[0]) last[1] = `${last[1]}\n${value}`;
      else cur.fields.push([label, value]);
    }
  };
  for (const it of toLineItems(blocks)) {
    if (it.kind === "line") {
      const text = it.text.trim();
      const m = /^\*\*\s*([①-⑳])\s*\*\*\s*(.+)$/.exec(text) ?? /^\*\*\s*\((\d+)\)\s*(.+?)\s*\*\*$/.exec(text);
      if (m && sections.length) {
        const no = /\d/.test(m[1]) ? Number(m[1]) : CIRCLED.indexOf(m[1]) + 1;
        cur = { section: sections.length, sectionTitle: sections.at(-1)!, no, unnumbered: false, name: oneLine(clean(m[2])), page: it.page, fields: [] };
        items.push(cur);
        loose = [];
      } else if (!/^!\[/.test(text)) loose.push(text);
      continue;
    }
    const t = it.text.trimStart();
    if (t.startsWith("|")) {
      const rows = parsePipeTable(t).rows;
      // 묶음 머리: | 붙임1 |  | Idea-Hub 제안 과제별 세부내용 |
      if (rows.length === 1 && /^붙임\s*\d/.test(rows[0][0] ?? "")) {
        sections.push(oneLine(rows[0].filter(Boolean).slice(1).join(" ")));
        cur = null;
        loose = [];
        continue;
      }
      addFields(rows.filter((r) => r.length >= 2).map((r) => [r[0], cellLines(clean(r.slice(1).join("<br>")))]), it.page);
      continue;
    }
    if (t.startsWith("<table")) {
      for (const table of parseHtmlTables(t)) {
        addFields(table.rows.filter((r) => r.cells.length >= 2).map((r) => [r.cells[0].text, cellLines(clean(r.cells.slice(1).map((c) => c.html).join("<br>")))]), it.page);
      }
    }
  }

  const chunks = items.map((a) =>
    makeChunk({
      chunk_key: `${AX_DOC_ID}/${a.section}-${String(a.no).padStart(2, "0")}`,
      doc_id: AX_DOC_ID,
      unit_type: "ax_task",
      track: "주요사업",
      business: null,
      eval_item: null,
      measure: null,
      title: `AX 검토 과제 · ${a.name}`,
      context_prefix: `2026년 AX협의체 검토 과제 · ${a.sectionTitle}`,
      blocks: a.fields.length ? a.fields.map(([k, v]) => `${k}: ${v}`) : [a.name],
      pdf_page_start: a.page,
      meta: { section: a.section, section_title: a.sectionTitle, no: a.no, unnumbered: a.unnumbered, name: a.name, idea: /아이디어/.test(a.sectionTitle) },
    }),
  );
  const checks: Check[] = AX_EXPECTED.bySection.map((n, i) => {
    const got = items.filter((a) => a.section === i + 1);
    const loose = got.filter((a) => a.unnumbered).length;
    return { name: `AX ${i + 1}번 묶음 과제 수(번호 없는 과제 포함)`, level: "error" as const, ok: got.length === n && loose === AX_EXPECTED.unnumbered[i] && got.every((a, k) => a.no === k + 1), expected: n, actual: got.map((a) => `${a.no}${a.unnumbered ? "*" : ""}`).join(",") };
  });
  const noFields = items.filter((a) => a.fields.length < 2);
  checks.push({ name: "AX 과제마다 내용 칸(2개 이상)", level: "error", ok: noFields.length === 0, actual: noFields.map((a) => `${a.section}-${a.no}`) });
  checks.push({ name: "AX 묶음 수", level: "error", ok: sections.length === AX_EXPECTED.bySection.length, expected: AX_EXPECTED.bySection.length, actual: sections });
  return { chunks: finalizeChunks(chunks), checks };
}
