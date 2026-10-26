import "server-only";

// 경영관리 전년도 경영실적보고서 골격 읽기(공통 지식 rpt25-mg-NN — 지표별 전용 파서 lib/knowledge/parsers/report25-mg.ts) — 로그인 사용자 권한(공통 지식은 모두 읽음)
import type { SupabaseClient } from "@supabase/supabase-js";
import { type MgPriorSection, partOrder, toMgPriorSection } from "./mg-outline.ts";
import { type MgPageRef, buildMgOutline, mgPageRef, withMgVolume } from "./mg-page-plan.ts";
import { MG_VOLUME } from "./mg-volume.ts";

/** 지표(MG-N)마다 쪽 기준(목차·쪽 배정 — lib/reports/mg-page-plan.ts): 2025 보고서 조각의 장·평가내용과 PDF·인쇄 쪽만 읽고 작성분량(mg-volume.ts)을 적용 */
export async function loadMgPageRefs(supabase: SupabaseClient): Promise<Map<string, MgPageRef>> {
  const { data } = await supabase.from("knowledge_chunks").select("business, pdf_page_start, pdf_page_end, ch:meta->>chapter, ev:meta->>eval_no, et:meta->>eval_title, pp:meta->printed_pages").like("doc_id", "rpt25-mg-%");
  const by = new Map<string, Array<{ business: string; pdf_page_start: number | null; pdf_page_end: number | null; ch: string | null; ev: string | null; et: string | null; pp: unknown }>>();
  for (const r of data ?? []) if (r.business) by.set(r.business, [...(by.get(r.business) ?? []), r]);
  return new Map([...by].map(([unit, rows]) => [unit, withMgVolume(mgPageRef(rows.map((r) => ({ chapter: r.ch ?? "", evalNo: r.ev ? Number(r.ev) : null, evalTitle: r.et ?? "", start: r.pdf_page_start, end: r.pdf_page_end, printed: Array.isArray(r.pp) ? r.pp.map(Number) : null }))), MG_VOLUME[unit]?.pages)]));
}

/**
 * 이 카드의 분량 목표 쪽수(2026-10-12 사용자 결정 D1 — 경영관리 구성안·집필 요청과 분량 경고): 저장된 목차·쪽 배정(report_outline.pages — 목차에서 뺀 과제면 없음),
 * 저장된 배정이 없으면 목차·쪽 배정의 「카드로 목차 만들기」가 넣는 기본 배정과 같은 값(buildMgOutline — 그 지표의 활성 카드·본문 예산(작성분량 기준)).
 * 2025 보고서 조각이 없는 지표는 못 정함(null — 분량 목표 없이)
 */
export async function loadMgCardPages(supabase: SupabaseClient, card: { id: string; eval_unit_id: string }, year: number): Promise<number | null> {
  const { data: row } = await supabase.from("report_outline").select("pages, included").eq("card_id", card.id).eq("year", year).maybeSingle();
  if (row) return row.included === false || !(Number(row.pages) > 0) ? null : Number(row.pages);
  const [refs, { data: cards }] = await Promise.all([loadMgPageRefs(supabase), supabase.from("cards").select("id, task_no").eq("eval_unit_id", card.eval_unit_id).eq("status", "active")]);
  const ref = refs.get(card.eval_unit_id);
  if (!ref?.evals.length) return null;
  return buildMgOutline(card.eval_unit_id, ref, (cards ?? []).map((c) => ({ id: String(c.id), taskNo: String(c.task_no ?? "") }))).rows.find((r) => r.card_id === card.id)?.pages ?? null;
}

/** 그 지표(MG-N)의 2025 보고서 세부평가내용별 장: 절(report_section)과 대주제 본문·도입(report_chapter detail_theme) — 평가내용·대주제·절 순 */
export async function loadMgPrior(supabase: SupabaseClient, evalUnitId: string): Promise<MgPriorSection[]> {
  const { data } = await supabase
    .from("knowledge_chunks")
    .select("chunk_key, text, meta, report_page_2025, seq")
    .like("doc_id", "rpt25-mg-%")
    .eq("business", evalUnitId)
    .in("unit_type", ["report_section", "report_chapter"])
    .order("seq");
  return (data ?? []).flatMap((r) => {
    const s = toMgPriorSection(r);
    return s ? [s] : [];
  }).sort(partOrder);
}

/**
 * 경영관리 숫자 근거 글(설계 §4.2·§4.3): 그 지표 2025 보고서 전 장(rpt25-mg-NN — 절·대주제 본문·지적사항 조치실적·전년 대비·성과분석 및 환류)과
 * 핵심공통항목(core_item — 기관이 낸 수치표). 평가위원 의견·중간보고서 지적에 인용된 수치는 넣지 않음(인용 대조에만 — 주요사업과 같은 규칙)
 */
export async function loadMgNumberEvidence(supabase: SupabaseClient, evalUnitId: string): Promise<string> {
  const [report, core] = await Promise.all([
    supabase.from("knowledge_chunks").select("text").like("doc_id", "rpt25-mg-%").eq("business", evalUnitId),
    supabase.from("knowledge_chunks").select("text").eq("unit_type", "core_item").eq("business", evalUnitId),
  ]);
  return [...(report.data ?? []), ...(core.data ?? [])].map((r) => String(r.text ?? "")).join("\n");
}
