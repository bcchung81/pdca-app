import "server-only";

// 구성안 「2025 예시 절 — 이 절처럼」 읽기(2026-10-12): 공통 지식의 2025 경영실적보고서 절 조각(report_section — 주요사업 rpt25-biz 소항목 62개 · 경영관리 rpt25-mg-NN 절 167개).
// 로그인 사용자 권한(공통 지식은 모두 읽음). 고르기 목록은 제목만, 고른 절 하나는 글까지 — 짜임 참고일 뿐 근거 글에는 넣지 않음(lib/reports/framework-pick.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { type ExampleItem, type ExampleSection, exampleItems, exampleOf, isExampleKey } from "./framework-pick.ts";

const COLS = "chunk_key, title, business, report_page_2025, meta, seq";

/** 그 트랙의 2025 보고서 절 목록(같은 사업·지표 먼저) */
export async function loadExampleList(supabase: SupabaseClient, mg: boolean, unit: string): Promise<ExampleItem[]> {
  const q = supabase.from("knowledge_chunks").select(COLS).eq("unit_type", "report_section");
  const { data } = await (mg ? q.like("doc_id", "rpt25-mg-%") : q.eq("doc_id", "rpt25-biz")).order("doc_id").order("seq");
  return exampleItems(data ?? [], unit);
}

/** 고른 절 하나(글 포함). 그 트랙의 절 키가 아니거나 없으면 null */
export async function loadExampleSection(supabase: SupabaseClient, key: string, mg: boolean): Promise<ExampleSection | null> {
  if (!isExampleKey(key, mg)) return null;
  const { data } = await supabase.from("knowledge_chunks").select(`${COLS}, text`).eq("chunk_key", key).eq("unit_type", "report_section").maybeSingle();
  return data ? exampleOf(data) : null;
}
