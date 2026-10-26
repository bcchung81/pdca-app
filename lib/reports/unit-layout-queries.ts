import "server-only";

// 사업 조판(화면)과 지표 한 파일 한글 내려받기(route)가 같이 쓰는 읽기 — 로그인 사용자 권한(RLS). 조판 과제 읽기(목차 + 과제별 초안)와
// 경영관리 지표의 카드 밖 부분 끼움(R5d): 쪽 기준·카드 밖 장 높이·조판·비고 쪽을 한 곳에서 만들어 두 곳의 쪽·글이 어긋나지 않게 함.
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BusinessItem, type BusinessLayout, layoutBusiness } from "./business-layout.ts";
import { buildMgOutline, mgCardPages } from "./mg-page-plan.ts";
import { loadMgPageRefs } from "./mg-queries.ts";
import type { MgPageRef } from "./mg-page-plan.ts";
import { readSection } from "./section.ts";
import { MG_FRONT_PAGE_2025, findingRemarks, unitPartsOutside } from "./unit-parts-layout.ts";
import type { UnitPartsMg } from "./unit-parts-mg.ts";
import type { LooseJson } from "../loose-json.ts";

const first = <X,>(v: X | X[] | null): X | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** report_outline select 한 행(card 조인은 객체로도 배열로도 옴) */
interface LayoutOutlineDbRow {
  card_id: string;
  section: string;
  subsection: string | null;
  sort: number | string;
  pages: number | string;
  included: boolean | null;
  card: LayoutCardJoin | LayoutCardJoin[] | null;
}
interface LayoutCardJoin {
  id: string;
  uid: string;
  task_no: string;
  title: string;
  data_rev: number | null;
  status: string;
}
/** card_report_drafts select 한 행 */
interface LayoutDraftDbRow {
  card_id: string;
  spec: unknown;
  unknown_numbers: string[] | null;
  source_rev: number | null;
}

/** 조판할 과제(목차 report_outline 행 + 그 연도 과제별 초안 — 구성안만 있는 행은 초안이 아님). 목차 순서(sort) */
export async function loadBusinessItems(supabase: SupabaseClient, unit: string, year: number): Promise<BusinessItem[]> {
  const [{ data: rows }, { data: drafts }] = await Promise.all([
    supabase
      .from("report_outline")
      .select("card_id, section, subsection, sort, pages, included, card:cards!inner(id, uid, task_no, title, data_rev, status)")
      .eq("year", year)
      .eq("eval_unit_id", unit)
      .eq("card.status", "active")
      .order("sort"),
    supabase.from("card_report_drafts").select("card_id, spec, unknown_numbers, source_rev, card:cards!inner(eval_unit_id)").eq("year", year).eq("card.eval_unit_id", unit).not("spec", "is", null),
  ]);
  const draftOf = new Map(((drafts ?? []) as LayoutDraftDbRow[]).map((d) => [d.card_id, d]));
  return ((rows ?? []) as LayoutOutlineDbRow[]).map((r) => {
    const c = first(r.card);
    const d = draftOf.get(r.card_id);
    return {
      cardId: r.card_id,
      uid: c?.uid ?? "",
      taskNo: c?.task_no ?? r.card_id,
      title: c?.title ?? "",
      section: r.section,
      subsection: r.subsection,
      sort: Number(r.sort),
      pages: Number(r.pages),
      included: Boolean(r.included),
      spec: readSection(d?.spec),
      unknownNumbers: d?.unknown_numbers ?? [],
      sourceRev: d?.source_rev ?? null,
      dataRev: c?.data_rev ?? null,
    };
  });
}

export interface MgUnitLayout {
  items: BusinessItem[];
  layout: BusinessLayout;
  /** 쪽 기준(작성분량 적용). 2025 보고서 조각이 없는 지표는 undefined */
  ref: MgPageRef | undefined;
  /** 본문 예산 중 카드가 맡은 쪽(0이면 모름) */
  budget: number;
  /** 지적 행 id → 비고(「p.N」) — 지적 부분이 없으면 빈 객체 */
  remarks: Record<string, string>;
  /** 비고 시작 쪽(책 인쇄 쪽 — 쿼리 값 또는 2025 기본) */
  start: number | null;
  /** 시작 쪽이 2025 기본값인가(쿼리로 바꾸지 않음) */
  startIsDefault: boolean;
}

/**
 * 경영관리 지표 조판: 과제 + 카드 밖 부분(view — 저장된 부분 또는 재료로 만든 초안, loadUnitParts가 줌)을 끼움.
 * 카드 밖 부분은 앞(지적사항 조치실적 + 전년 대비)·뒤(성과분석 및 환류)에 끼워 쪽 번호가 앞 쪽 수만큼 밀리고, 비고 「p.N」은 조판 결과의 절 쪽으로 셈(조판 → 비고 → 한 번에 끝: 비고는 높이에 안 들어감)
 */
export async function loadMgUnitLayout(supabase: SupabaseClient, unit: string, year: number, view: UnitPartsMg | null, startQuery?: number | null): Promise<MgUnitLayout> {
  const [items, refs] = await Promise.all([loadBusinessItems(supabase, unit, year), loadMgPageRefs(supabase)]);
  const ref = refs.get(unit);
  const budget = ref ? mgCardPages(ref, buildMgOutline(unit, ref, items.map((it) => ({ id: it.cardId, taskNo: it.taskNo }))).orphan) : 0;
  const outside = view
    ? unitPartsOutside(view, {
        ...(ref ? { pages2025: Math.max(0, ref.content - (ref.direction ?? 0)) } : {}),
        ...(ref?.volume !== undefined ? { wholeTarget: Math.max(0, ref.volume - (ref.direction ?? 0)) } : {}),
      })
    : undefined;
  const layout = layoutBusiness(items, { mg: { budget, ...(outside ? { outside } : {}) } });
  const startIsDefault = !(startQuery && startQuery > 0);
  const start = startQuery && startQuery > 0 ? startQuery : (MG_FRONT_PAGE_2025[unit] ?? null);
  let remarks: Record<string, string> = {};
  if (view?.findings?.rows.length && start) {
    const { data: cards } = await supabase.from("cards").select("id, data").eq("eval_unit_id", unit).eq("status", "active");
    remarks = findingRemarks(view.findings, {
      start,
      layout,
      cards: Object.fromEntries(((cards ?? []) as Array<{ id: string; data: LooseJson }>).map((c) => [String(c.id), c.data])),
      specs: Object.fromEntries(items.map((it) => [it.cardId, it.spec])),
    });
  }
  return { items, layout, ref, budget, remarks, start, startIsDefault };
}
