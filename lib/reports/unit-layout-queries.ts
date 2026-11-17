import "server-only";

// 사업 조판(화면)과 지표 한 파일 한글 내려받기(route)가 같이 쓰는 읽기 — 로그인 사용자 권한(RLS). 조판 과제 읽기(목차 + 과제별 초안)와
// 경영관리 지표의 카드 밖 부분 끼움(R5d): 쪽 기준·카드 밖 장 높이·조판·비고 쪽을 한 곳에서 만들어 두 곳의 쪽·글이 어긋나지 않게 함.
// 초안 모양 검사(2026-11-17 3차): 앱 밖에서 깨뜨린 초안은 초안 없음처럼 조판하고(그리기가 던지지 않게) recountFail에 까닭. 화면만 opts.recount로
// 없는 숫자를 다시 셈(저장값 대신 — 붉은 점선, draft-recount-queries.ts recountLayoutItems, 동시 4장) — 한글 내려받기는 점선을 안 써 다시 세지 않음
import type { SupabaseClient } from "@supabase/supabase-js";
import { type BusinessItem, type BusinessLayout, layoutBusiness } from "./business-layout.ts";
import { readDraftSpec } from "./draft-recount.ts";
import { recountLayoutItems } from "./draft-recount-queries.ts";
import { buildMgOutline, mgCardPages } from "./mg-page-plan.ts";
import { loadMgPageRefs } from "./mg-queries.ts";
import type { MgPageRef } from "./mg-page-plan.ts";
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

/** 조판 과제 + 없는 숫자를 확인하지 못한 까닭(초안 모양이 깨졌거나 다시 세지 못함 — 있으면 화면이 「없는 숫자 확인 불가」 알림) */
export type LayoutItem = BusinessItem & { recountFail?: string };

/**
 * 조판할 과제(목차 report_outline 행 + 그 연도 과제별 초안 — 구성안만 있는 행은 초안이 아님). 목차 순서(sort).
 * opts.recount: 없는 숫자를 저장값 대신 다시 센 값으로(사업 조판 화면 — 붉은 점선). 실패한 장은 저장값 + recountFail
 */
export async function loadBusinessItems(supabase: SupabaseClient, unit: string, year: number, opts: { recount?: boolean } = {}): Promise<LayoutItem[]> {
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
  const items = ((rows ?? []) as LayoutOutlineDbRow[]).map((r): LayoutItem => {
    const c = first(r.card);
    const d = draftOf.get(r.card_id);
    const { spec, issue } = readDraftSpec(d?.spec);
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
      spec,
      unknownNumbers: d?.unknown_numbers ?? [],
      sourceRev: d?.source_rev ?? null,
      dataRev: c?.data_rev ?? null,
      ...(issue ? { recountFail: issue } : {}),
    };
  });
  if (!opts.recount) return items;
  // 목차에서 뺀 과제는 조판하지 않으므로(business-layout.ts) 다시 세지 않음
  const views = await recountLayoutItems(supabase, unit, year, items.filter((it) => it.included));
  return items.map((it) => {
    const v = views.get(it.cardId);
    return v ? { ...it, unknownNumbers: v.unknown, ...(v.failed ? { recountFail: v.failed } : {}) } : it;
  });
}

export interface MgUnitLayout {
  items: LayoutItem[];
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
export async function loadMgUnitLayout(supabase: SupabaseClient, unit: string, year: number, view: UnitPartsMg | null, startQuery?: number | null, opts: { recount?: boolean } = {}): Promise<MgUnitLayout> {
  const [items, refs] = await Promise.all([loadBusinessItems(supabase, unit, year, opts), loadMgPageRefs(supabase)]);
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
