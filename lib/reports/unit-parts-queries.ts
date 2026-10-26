import "server-only";

// 경영관리 지표 단위 부분(R5b 뒷단) 읽기 — 로그인 사용자 권한(RLS가 판정: 카드·과제별 초안은 읽을 수 있는 것만, 공통 지식은 모두 읽음, 보고서 계량 실적은 읽을 수 있는 보고서만).
// 한 지표·연도의 R5a 빌더 재료(MgUnitMaterials — lib/reports/unit-parts-mg.ts)와 저장된 부분 행(eval_unit_report_parts)을 모음. 조각 고르기는 경평 초안 평가 근거(lens-queries.ts loadLensMg)와 같은 열쇠
import type { SupabaseClient } from "@supabase/supabase-js";
import { MGMT_TRACK, type UnitPartKey } from "../tracks/index.ts";
import type { ReportInputs } from "./queries.ts";
import { readSection } from "./section.ts";
import type { MgUnitMaterials, UnitChunk, UnitPartsSource } from "./unit-parts-mg.ts";
import type { LooseJson } from "../loose-json.ts";


/** card_report_drafts select 한 행 */
interface UnitDraftDbRow {
  card_id: string;
  spec: unknown;
  updated_at: string;
}
/** report_outline select 한 행 */
interface UnitOutlineDbRow {
  card_id: string;
  section: string | null;
  subsection: string | null;
  included: boolean | null;
  sort: number | null;
}

/** loadUnitMaterials의 cards select 한 행 (data = 카드 JSON — 칸이 많아 넓은 모양 그대로) */
interface UnitCardDbRow {
  id: string;
  uid: string;
  task_no: string | null;
  title: string | null;
  status: string;
  data_rev: number | null;
  data: LooseJson;
}

const CHUNK_COLS = "chunk_key, title, text, unit_type, meta";

/**
 * 한 지표(MG-N)·연도의 재료: 그 지표 활성 카드(원장 data·data_rev) · 그 카드들의 그 연도 과제별 초안(spec이 있는 것) ·
 * 2025 그 지표 보고서 조각 전부(rpt25-mg-NN — 세부평가내용별 골격 + 카드 밖 장의 전년 대비·성과분석 표) · '25 평가위원 지적(plan-2607 eval25/MG-N) ·
 * '26 편람 지표(plan-2607 handbook26/MG-N) · 목차·쪽 배정(report_outline) · 그 지표 모든 부서 보고서의 계량 실적 입력(inputs.kpi).
 * uids = 카드 id → uid(화면이 카드·과제별 초안으로 잇는 주소)
 */
export async function loadUnitMaterials(supabase: SupabaseClient, unit: string, year: number): Promise<{ materials: MgUnitMaterials; uids: Record<string, string> }> {
  const [cards, outline, reports, report2025, evaluator, handbook] = await Promise.all([
    supabase.from("cards").select("id, uid, task_no, title, status, data_rev, data").eq("eval_unit_id", unit).eq("status", "active"),
    supabase.from("report_outline").select("card_id, section, subsection, included, sort").eq("year", year).eq("eval_unit_id", unit),
    supabase.from("reports").select("inputs").eq("eval_unit_id", unit).eq("year", year),
    supabase.from("knowledge_chunks").select(CHUNK_COLS).like("doc_id", "rpt25-mg-%").eq("business", unit).order("seq"),
    supabase.from("knowledge_chunks").select(CHUNK_COLS).eq("unit_type", "evaluator_comment").like("chunk_key", `plan-2607/eval25/${unit}/%`).order("seq"),
    supabase.from("knowledge_chunks").select(CHUNK_COLS).like("chunk_key", `plan-2607/handbook26/${unit}/%`).order("seq"),
  ]);
  const cardRows = (cards.data ?? []) as UnitCardDbRow[];
  const ids = cardRows.map((c) => String(c.id));
  const { data: drafts } = ids.length ? await supabase.from("card_report_drafts").select("card_id, spec, updated_at").eq("year", year).in("card_id", ids).not("spec", "is", null) : { data: [] as UnitDraftDbRow[] };
  return {
    materials: {
      unit,
      year,
      cards: cardRows.map((c) => ({ id: String(c.id), taskNo: String(c.task_no ?? ""), title: String(c.title ?? ""), status: String(c.status), dataRev: c.data_rev ?? null, data: c.data })),
      drafts: ((drafts ?? []) as UnitDraftDbRow[]).map((d) => ({ cardId: String(d.card_id), updatedAt: String(d.updated_at), spec: readSection(d.spec) })),
      report2025: (report2025.data ?? []) as UnitChunk[],
      evaluator: (evaluator.data ?? []) as UnitChunk[],
      handbook: (handbook.data ?? []) as UnitChunk[],
      outline: ((outline.data ?? []) as UnitOutlineDbRow[]).map((r) => ({ card_id: String(r.card_id), section: String(r.section ?? ""), subsection: r.subsection ?? null, included: r.included ?? null, sort: r.sort ?? null })),
      kpiInputs: ((reports.data ?? []) as Array<{ inputs: ReportInputs | null }>).map((r) => (r.inputs?.kpi && typeof r.inputs.kpi === "object" ? (r.inputs.kpi as Record<string, string>) : {})),
    },
    uids: Object.fromEntries(cardRows.map((c) => [String(c.id), String(c.uid)])),
  };
}

/**
 * AI 문장 채우기(R5c — 설계 §3.7 자료 범위)에만 더 쓰는 공통 지식: 그 지표의 '25 지적 시정조치 계획(corrective_action — 검색 전용 기관장 행은 뺌, 약속 표지는 요청 때 revisionNote)과
 * 핵심공통항목('25 — core_item, 숫자 근거). 나머지 재료(카드 원장·과제별 초안·2025 보고서 조각·평가위원 지적·편람·실적 입력)는 loadUnitMaterials 그대로
 */
export async function loadUnitAiExtras(supabase: SupabaseClient, unit: string): Promise<{ corrective: UnitChunk[]; core: UnitChunk[] }> {
  const [corrective, core] = await Promise.all([
    supabase.from("knowledge_chunks").select(CHUNK_COLS).eq("unit_type", "corrective_action").eq("business", unit).order("seq"),
    supabase.from("knowledge_chunks").select(CHUNK_COLS).eq("unit_type", "core_item").eq("business", unit).order("seq"),
  ]);
  return {
    corrective: ((corrective.data ?? []) as UnitChunk[]).filter((c) => !c.meta?.search_only),
    core: (core.data ?? []) as UnitChunk[],
  };
}

/** 저장된 부분 행 하나 */
export interface StoredUnitPart {
  part: UnitPartKey;
  spec: unknown;
  source: UnitPartsSource | null;
  warnings: string[];
  model: string | null;
  promptVersion: string | null;
  status: "draft" | "confirmed";
  updatedBy: string | null;
  /** 버전(다음 저장의 조건) */
  updatedAt: string;
}

const PART_COLS = "part, spec, source, warnings, model, prompt_version, status, updated_by, updated_at";

/** eval_unit_report_parts select(PART_COLS) 한 행 */
interface UnitPartDbRow {
  part: UnitPartKey;
  spec: unknown;
  source: (Partial<UnitPartsSource> & Record<string, unknown>) | null;
  warnings: unknown;
  model: string | null;
  prompt_version: string | null;
  status: string;
  updated_by: string | null;
  updated_at: string;
}

const toStored = (r: UnitPartDbRow): StoredUnitPart => ({
  part: r.part,
  spec: r.spec,
  source: r.source && typeof r.source === "object" && r.source.cards ? (r.source as UnitPartsSource) : null,
  warnings: Array.isArray(r.warnings) ? (r.warnings as unknown[]).map(String) : [],
  model: r.model ?? null,
  promptVersion: r.prompt_version ?? null,
  status: r.status === "confirmed" ? "confirmed" : "draft",
  updatedBy: r.updated_by ?? null,
  updatedAt: String(r.updated_at),
});

/** 그 지표·연도의 저장된 부분 행(읽을 수 있을 때만 — RLS). parts를 주면 그 부분만 */
export async function loadUnitPartRows(supabase: SupabaseClient, unit: string, year: number, parts?: UnitPartKey[]): Promise<Map<UnitPartKey, StoredUnitPart>> {
  let q = supabase.from("eval_unit_report_parts").select(PART_COLS).eq("eval_unit_id", unit).eq("year", year);
  if (parts) q = q.in("part", parts);
  const { data } = await q;
  const known = new Set<string>(MGMT_TRACK.unitParts);
  return new Map(((data ?? []) as UnitPartDbRow[]).filter((r) => known.has(r.part)).map((r) => [r.part as UnitPartKey, toStored(r)]));
}

/** 그 연도의 모든 지표 단위 부분 spec(경평 초안 「채울 것」 모음용 — 자리표시를 셈. 읽을 수 있는 것만, RLS) */
export async function loadUnitPartSpecs(supabase: SupabaseClient, year: number): Promise<Array<{ unitId: string; part: string; spec: unknown }>> {
  const { data } = await supabase.from("eval_unit_report_parts").select("eval_unit_id, part, spec").eq("year", year);
  const known = new Set<string>(MGMT_TRACK.unitParts);
  return ((data ?? []) as Array<{ eval_unit_id: string; part: string; spec: unknown }>).filter((r) => known.has(r.part)).map((r) => ({ unitId: r.eval_unit_id, part: r.part, spec: r.spec }));
}
