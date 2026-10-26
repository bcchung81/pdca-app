import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { followupBasis } from "../../../../../lib/ai/followup.ts";
import { readResult } from "../../../../../lib/inspections/model.ts";
import { inspectionSourceLabel } from "../../../../../lib/reports/inspection-input.ts";
import { loadLens } from "../../../../../lib/reports/lens-queries.ts";
import { loadPriorSections } from "../../../../../lib/reports/prior-queries.ts";
import { listComments, listMaterials, reportLockedFor } from "../../../../../lib/reports/queries.ts";

/** 과제별 초안 화면이 읽는 카드 한 줄(cards + 평가단위·팀 이름) */
export interface CardRow {
  id: string;
  uid: string;
  task_no: string;
  title: string;
  data: unknown;
  data_rev: number;
  team_id: number;
  status: string;
  eval_unit_id: string;
  updated_at: string;
  unit: { name: string; card_group: string | null } | { name: string; card_group: string | null }[] | null;
  team: { name: string } | { name: string }[] | null;
}

/** 이 카드의 올해 초안 행(card_report_drafts) */
export interface DraftRow {
  spec: unknown;
  warnings: unknown;
  unknown_numbers: string[] | null;
  model: string | null;
  source_rev: number | null;
  updated_at: string | null;
  outline: unknown;
  outline_status: string | null;
  outline_warnings: unknown;
  outline_model: string | null;
  outline_at: string | null;
}

/** 카드가 속한 사업·부서의 올해 보고서 행 */
export interface ReportRef {
  id: number;
  status: string;
  inputs: { kpi?: Record<string, string> } | null;
}

export interface MaterialRowDb {
  id: number | string;
  file_name: string;
  bytes: number | null;
  storage_path: string;
  created_at: string;
  parse_status: string | null;
  parse_error: string | null;
  parsed_chars: number | null;
}

export interface SiblingRow {
  id: string;
  uid: string;
  task_no: string;
  title: string;
}

export async function loadCard(supabase: SupabaseClient, uid: string): Promise<CardRow | null> {
  const { data } = await supabase
    .from("cards")
    .select("id, uid, task_no, title, data, data_rev, team_id, status, eval_unit_id, updated_at, unit:eval_units(name, card_group), team:teams(name)")
    .eq("uid", uid)
    .maybeSingle();
  return data as CardRow | null;
}

/**
 * 과제별 초안 화면 재료 조회: 초안·보고서·카드 전용 자료·앞뒤 과제·목차 순서·부서 잠금·전년 절·평가 근거·최종 점검표를 한꺼번에,
 * 이어서 자료 서명 주소와 보고서 추가자료·코멘트. 모두 로그인 사용자 권한(RLS)으로 읽음.
 */
export async function loadReportCardData(supabase: SupabaseClient, card: CardRow, opts: { year: number; staff: boolean; staffView: boolean }) {
  const { year, staff, staffView } = opts;
  const [{ data: draft }, { data: report }, { data: mats }, { data: sibs }, { data: outlineSort }, locked, priorSections, lens, { data: finalIns }] = await Promise.all([
    supabase.from("card_report_drafts").select("spec, warnings, unknown_numbers, model, source_rev, updated_at, outline, outline_status, outline_warnings, outline_model, outline_at").eq("card_id", card.id).eq("year", year).maybeSingle(),
    supabase.from("reports").select("id, status, inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle(),
    supabase.from("card_materials").select("id, file_name, bytes, storage_path, created_at, parse_status, parse_error, parsed_chars").eq("card_id", card.id).order("created_at", { ascending: false }),
    // 앞뒤 과제(‹ ›): 성과관리팀·관리자는 같은 사업 전체(목차 순서), 부서는 자기 부서 안에서(과제번호 순 — compareTaskNo)
    staffView
      ? supabase.from("cards").select("id, uid, task_no, title").eq("eval_unit_id", card.eval_unit_id).eq("status", "active")
      : supabase.from("cards").select("id, uid, task_no, title").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("status", "active"),
    staffView ? supabase.from("report_outline").select("card_id, sort").eq("year", year).eq("eval_unit_id", card.eval_unit_id) : Promise.resolve({ data: [] as Array<{ card_id: string; sort: number }> }),
    // 부서 잠금(최종 판정은 DB 트리거 guard_card_report_draft) — 제출·승인 중인 보고서의 과제는 부서가 못 고침
    !staff ? reportLockedFor(supabase, { eval_unit_id: card.eval_unit_id, team_id: card.team_id }, year) : Promise.resolve(false),
    loadPriorSections(supabase, card.eval_unit_id),
    loadLens(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }),
    // 최종 점검표(보완 점검과 같은 규칙 — 보낸·확인한 것 중 점검월이 가장 늦은 1건) — 구성안 요청의 「월간 점검 보완 요청」과 진행 줄
    supabase.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const inspectionLabel = inspectionSourceLabel(followupBasis(finalIns ? { period: finalIns.period, status: finalIns.status, result: readResult(finalIns.result) } : null));
  const matRows = (mats ?? []) as MaterialRowDb[];
  const reportRef = report as ReportRef | null;
  const [{ data: signed }, reportMats, comments] = await Promise.all([
    matRows.length ? supabase.storage.from("card-materials").createSignedUrls(matRows.map((m) => m.storage_path), 600) : Promise.resolve({ data: [] as { signedUrl: string }[] }),
    reportRef ? listMaterials(supabase, [reportRef.id]) : Promise.resolve([]),
    reportRef ? listComments(supabase, reportRef.id) : Promise.resolve([]),
  ]);
  return {
    draft: draft as DraftRow | null,
    report: reportRef,
    matRows,
    sibs: (sibs ?? []) as SiblingRow[],
    outlineSort: (outlineSort ?? []) as Array<{ card_id: string; sort: number }>,
    locked,
    priorSections,
    lens,
    inspectionLabel,
    signed,
    reportMats,
    comments,
  };
}

export type ReportCardData = Awaited<ReturnType<typeof loadReportCardData>>;
