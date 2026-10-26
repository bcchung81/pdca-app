// 조각 만들기: text·search_text를 blocks에서 결정적으로 만듭니다.

import { foldForSearch } from "./normalize.ts";
import { tableSearchText } from "./table.ts";
import type { KnowledgeChunk } from "./types.ts";

export type ChunkInput = Omit<KnowledgeChunk, "text" | "search_text" | "seq" | "searchable" | "q_type" | "dept_resp" | "dept_coop" | "meta" | "printed_page" | "report_page_2025" | "pdf_page_end"> &
  Partial<Pick<KnowledgeChunk, "searchable" | "q_type" | "dept_resp" | "dept_coop" | "meta" | "printed_page" | "report_page_2025" | "pdf_page_end">>;

export function isTableText(block: string): boolean {
  const t = block.trimStart();
  return t.startsWith("<table") || t.startsWith("|");
}

export function makeChunk(input: ChunkInput): KnowledgeChunk {
  const blocks = input.blocks.map((b) => b.trim()).filter(Boolean);
  const searchBody = blocks.map((b) => (isTableText(b) ? tableSearchText(b) : b));
  return {
    chunk_key: input.chunk_key,
    doc_id: input.doc_id,
    unit_type: input.unit_type,
    seq: -1,
    track: input.track,
    business: input.business,
    eval_item: input.eval_item,
    measure: input.measure,
    q_type: input.q_type ?? [],
    title: input.title,
    context_prefix: input.context_prefix,
    blocks,
    text: blocks.join("\n\n"),
    search_text: foldForSearch([input.title, input.context_prefix, ...searchBody].join("\n")),
    searchable: input.searchable ?? true,
    pdf_page_start: input.pdf_page_start,
    pdf_page_end: input.pdf_page_end ?? input.pdf_page_start,
    printed_page: input.printed_page ?? null,
    report_page_2025: input.report_page_2025 ?? null,
    dept_resp: input.dept_resp ?? [],
    dept_coop: input.dept_coop ?? [],
    meta: input.meta ?? {},
  };
}

/** 문서 안 순서를 매기고 키 중복을 막습니다 */
export function finalizeChunks(chunks: KnowledgeChunk[]): KnowledgeChunk[] {
  const seen = new Set<string>();
  return chunks.map((c, i) => {
    if (seen.has(c.chunk_key)) throw new Error(`중복 chunk_key: ${c.chunk_key}`);
    seen.add(c.chunk_key);
    return { ...c, seq: i };
  });
}
