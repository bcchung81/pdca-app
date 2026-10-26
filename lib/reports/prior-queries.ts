import "server-only";

// 전년도 경영실적보고서 소항목(공통 지식 rpt25-biz) 읽기 — 로그인 사용자 권한(공통 지식은 모두 읽음)
import type { createClient } from "../supabase/server.ts";
import { type PriorSection, toPriorSection } from "./prior.ts";

export const PRIOR_DOC_ID = "rpt25-biz";

/** 그 주요사업(eval_unit_id = BZ-N)의 2025 보고서 평가내용2 소항목들 */
export async function loadPriorSections(supabase: Awaited<ReturnType<typeof createClient>>, evalUnitId: string): Promise<PriorSection[]> {
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("chunk_key, business, title, text, report_page_2025, meta, seq")
    .eq("doc_id", PRIOR_DOC_ID)
    .eq("unit_type", "report_section")
    .eq("business", evalUnitId)
    .order("seq");
  return (data ?? []).map(toPriorSection);
}
