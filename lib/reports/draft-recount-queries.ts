// 저장된 과제별 초안의 숫자 근거 글 읽기(2026-11-16 시큐어 코딩 2차 점검 후속 — 다시 세기는 draft-recount.ts).
// prepareDraft(app/(app)/reports/cards/draft-prepare.ts)를 직접 고침·되돌리기처럼 초안 근거 목록(spec.sources·priorKeys)으로 부를 때와 같은 규칙으로 known을 만듭니다:
// 카드 전용 자료·연결(확정)한 보고서 추가자료의 읽은 글 + 전년 절(주요사업) + 실사 답변 평가 근거 + 이 과제에 연결된 2025 절·실사 조각
// (+ 경영관리: 그 지표 2025 보고서·핵심공통항목 + 고른 주요사업 원장·붙임·가린 초안 글). 모두 로그인 사용자 권한(RLS·DB 함수)으로 읽음.
// 다른 점: 첨부는 올릴 때 읽어 둔 글(parsed_text)만 쓰고 여기서 새로 읽지 않음(화면을 열 때 파일 파싱·그림 설명 호출이 없게) — 못 읽은 첨부는 빠져 없는 숫자가 더 잡히는 쪽
// 실패하면 막힘(2026-11-17 3차): 화면은 recountStored·recountSubmitCards·recountLayoutItems만 부르고, 근거 읽기·다시 세기가 던지면 저장값을 그대로 믿지 않고
// 「없는 숫자 확인 불가」(draft-recount.ts recountFailed)로 둠 — 이 모듈의 함수는 던지지 않음(오류는 서버 로그 한 줄)
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCardBundle } from "../ai/context.ts";
import { runPool } from "../ai/pool.ts";
import { isMgmtCard } from "../cards/mgmt-card.ts";
import { isoDay } from "../format.ts";
import { relevantRefs } from "../knowledge/bundle.ts";
import { yearActuals } from "./actuals.ts";
import { type RecountView, recountDraft, recountFailed, specIssue } from "./draft-recount.ts";
import { specSources } from "./draft-sources.ts";
import { loadLens } from "./lens-queries.ts";
import type { LensRef } from "./lens.ts";
import { fileRelation } from "./material-match.ts";
import { bizMaterials } from "./mg-biz.ts";
import { BIZ_TEXT_MAX, type BizRefText, loadBizRefTexts } from "./mg-biz-queries.ts";
import { loadMgNumberEvidence } from "./mg-queries.ts";
import type { PriorPick, PriorSection } from "./prior.ts";
import { loadPriorSections } from "./prior-queries.ts";
import { type ReportFile, type ReportSectionSpec, draftEvidence } from "./section.ts";
import type { SubmitCard } from "./submission.ts";

/** 다시 세기에 쓰는 카드 한 장(cards 행) */
export interface RecountCard {
  id: string;
  eval_unit_id: string;
  team_id: number | string | null;
  data: unknown;
}

/** 화면이 이미 읽은 값(같은 것을 다시 읽지 않음) — reportId는 이 카드가 속한 부서 보고서(없으면 null, 안 주면 여기서 찾음) */
export interface RecountPre {
  lens?: LensRef[];
  priorSections?: PriorSection[];
  reportId?: number | null;
  /** 경영관리: 그 지표 2025 보고서 숫자 근거(loadMgNumberEvidence — 같은 지표 과제 여럿을 셀 때 한 번만 읽음) */
  mgNumbers?: string;
}

interface TextRow {
  id: number | string;
  file_name: string;
  parsed_text: string | null;
  parse_status: string | null;
}

/** 읽어 둔 글이 있는 자료만(읽기 실패는 prepareDraft처럼 뺌) */
const readable = (rows: TextRow[] | null) => (rows ?? []).filter((r) => r.parse_status !== "failed" && typeof r.parsed_text === "string");

/** 카드 전용 자료·보고서 추가자료(이 카드·이 보고서 소속만 — prepareDraft와 같은 조건)와 이 과제에 연결(확정)한 추가자료 → 숫자 근거 여부가 붙은 첨부 */
async function loadFiles(supabase: SupabaseClient, card: RecountCard, year: number, ids: { card: string[]; report: string[] }, pre: RecountPre): Promise<ReportFile[]> {
  const cardRows = ids.card.length ? readable((await supabase.from("card_materials").select("id, file_name, parsed_text, parse_status").eq("card_id", card.id).in("id", ids.card)).data as TextRow[] | null) : [];
  let reportRows: TextRow[] = [];
  let confirmed = new Set<string>();
  if (ids.report.length) {
    const reportId = pre.reportId !== undefined ? pre.reportId : ((await supabase.from("reports").select("id").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle()).data?.id ?? null);
    if (reportId != null) {
      const [{ data: rows }, { data: links }] = await Promise.all([
        supabase.from("report_materials").select("id, file_name, parsed_text, parse_status").eq("report_id", reportId).in("id", ids.report),
        supabase.from("report_material_cards").select("material_id").eq("card_id", card.id).eq("status", "confirmed").in("material_id", ids.report),
      ]);
      reportRows = readable(rows as TextRow[] | null);
      confirmed = new Set((links ?? []).map((l: { material_id: unknown }) => String(l.material_id)));
    }
  }
  const docs = [...cardRows.map((r) => ({ id: String(r.id), kind: "card" as const, name: r.file_name, text: r.parsed_text ?? "" })), ...reportRows.map((r) => ({ id: String(r.id), kind: "report" as const, name: r.file_name, text: r.parsed_text ?? "" }))];
  return docs.map((d) => ({ ...d, ...fileRelation(d, confirmed) }));
}

/** 고른 주요사업 초안(DB 함수 한 번 상한씩) — prepareDraft loadBizRefsChunked와 같음 */
async function loadBizTexts(supabase: SupabaseClient, cardId: string, year: number, ids: string[]): Promise<BizRefText[]> {
  const out: BizRefText[] = [];
  for (let i = 0; i < ids.length; i += BIZ_TEXT_MAX) out.push(...(await loadBizRefTexts(supabase, cardId, year, ids.slice(i, i + BIZ_TEXT_MAX))));
  return out;
}

/** 저장된 초안 하나의 숫자 근거 글(known) — draft-recount.ts recountDraft에 넘김 */
export async function loadDraftKnown(supabase: SupabaseClient, card: RecountCard, spec: ReportSectionSpec, year: number, pre: RecountPre = {}): Promise<string> {
  const src = specSources(spec.sources, spec.priorKeys);
  const ids = { card: [...new Set(src.card)], report: [...new Set(src.report)] };
  const mg = isMgmtCard(card.data);
  const bizIds = mg ? [...new Set(src.biz ?? [])] : [];
  const ref = { id: card.id, evalUnitId: card.eval_unit_id, data: card.data };
  const [files, lens, kb, priorSections, mgNumbers, bizRefs] = await Promise.all([
    loadFiles(supabase, card, year, ids, pre),
    pre.lens ?? loadLens(supabase, ref),
    loadCardBundle(supabase, ref, "report"),
    mg ? Promise.resolve([] as PriorSection[]) : (pre.priorSections ?? loadPriorSections(supabase as Parameters<typeof loadPriorSections>[0], card.eval_unit_id)),
    mg ? (pre.mgNumbers ?? loadMgNumberEvidence(supabase, card.eval_unit_id)) : Promise.resolve(""),
    bizIds.length ? loadBizTexts(supabase, card.id, year, bizIds) : Promise.resolve([] as BizRefText[]),
  ]);
  // 전년 절: 초안 근거 목록의 키(최대 2개 — prepareDraft와 같음, 이 사업 절만)
  const prior: PriorPick[] = [...new Set(src.prior ?? [])]
    .slice(0, 2)
    .flatMap((key) => priorSections.filter((s) => s.key === key).slice(0, 1))
    .map((section) => ({ section, score: 0 }));
  const actuals = yearActuals(card.data, isoDay(), mg ? { wide: true } : {});
  const ev = draftEvidence(files, prior, lens, actuals, relevantRefs(kb));
  if (!mg) return ev.known;
  return [ev.known, mgNumbers, ...(bizRefs.length ? [bizMaterials(bizRefs).known] : [])].join("\n");
}

/** 저장값(unknown_numbers·warnings) — 그대로 넘기면 됨 */
export interface StoredCheck {
  unknown: unknown;
  warnings: readonly string[];
}

/**
 * 저장된 초안 하나를 다시 셈(과제별 초안 화면·검토용 HTML·여러 장 다시 세기 공용). 모양 검사에 걸리면 근거를 읽지 않고, 근거 읽기·다시 세기가 던지면
 * 저장값을 그대로 믿지 않고 「없는 숫자 확인 불가」(막힘). 던지지 않음 — 오류는 서버 로그 한 줄(카드 id만, 초안 글은 남기지 않음)
 */
export async function recountStored(supabase: SupabaseClient, card: RecountCard, spec: ReportSectionSpec, year: number, stored: StoredCheck, pre: RecountPre = {}): Promise<RecountView> {
  const issue = specIssue(spec);
  if (issue) return recountFailed(stored, issue);
  let known: string;
  try {
    known = await loadDraftKnown(supabase, card, spec, year, pre);
  } catch (e) {
    console.error("recountStored known", card.id, e);
    return recountFailed(stored, "근거 자료를 읽지 못함", e);
  }
  const v = recountDraft(spec, card.data, known, stored);
  if (v.error !== undefined) console.error("recountStored", card.id, v.error);
  return v;
}

/** 과제 여러 장을 다시 셀 때 동시에 읽는 과제 수(과제 하나가 근거 읽기 여러 번) */
const RECOUNT_CONCURRENCY = 4;

/** 다시 센 과제(보고서 검토) — recountFail이 있으면 저장값만 보이고 「없는 숫자 확인 불가」 */
export type RecountedSubmitCard = SubmitCard & { recountFail?: string };

/**
 * 부서 보고서 하나(같은 사업·부서·연도)의 과제별 초안 묶음(loadSubmitCards)의 없는 숫자를 다시 셈 — 보고서 검토 화면(/reports/[id])의 점선·확인 목록 건수.
 * 초안(spec)이 있는 과제만, 카드 글은 한 번에, 전년 절(주요사업)·2025 보고서 숫자 근거(경영관리)는 한 번 읽음.
 * 실패하면 막힘: 모양 검사에 걸린 초안은 spec을 빼고(초안 있음 표시는 남김 — hasSpec) 그리지 않으며, 다시 세지 못한 과제는 recountFail(저장값만)
 */
export async function recountSubmitCards(supabase: SupabaseClient, report: { id: number; evalUnitId: string; teamId: number; year: number }, cards: SubmitCard[]): Promise<RecountedSubmitCard[]> {
  const drafted = cards.filter((c) => c.draft?.spec);
  if (!drafted.length) return cards;
  const mg = report.evalUnitId.startsWith("MG-");
  // 미리 읽기가 실패하면 null — 모든 장이 「근거 자료를 읽지 못함」(막힘)
  let pre: { dataOf: Map<string, unknown>; priorSections: PriorSection[]; mgNumbers?: string } | null;
  try {
    const [{ data }, priorSections, mgNumbers] = await Promise.all([
      supabase.from("cards").select("id, data").in("id", drafted.map((c) => c.id)),
      mg ? Promise.resolve([] as PriorSection[]) : loadPriorSections(supabase as Parameters<typeof loadPriorSections>[0], report.evalUnitId),
      mg ? loadMgNumberEvidence(supabase, report.evalUnitId) : Promise.resolve(undefined),
    ]);
    pre = { dataOf: new Map(((data ?? []) as Array<{ id: string; data: unknown }>).map((x) => [x.id, x.data])), priorSections, ...(mgNumbers !== undefined ? { mgNumbers } : {}) };
  } catch (e) {
    console.error("recountSubmitCards pre", report.id, e);
    pre = null;
  }
  const views = await runPool(
    drafted,
    RECOUNT_CONCURRENCY,
    async (c): Promise<RecountView> => {
      const stored = { unknown: c.draft?.unknownNumbers, warnings: [] };
      if (!pre) return recountFailed(stored, "근거 자료를 읽지 못함");
      if (!pre.dataOf.has(c.id)) return recountFailed(stored, "카드 글을 읽지 못함");
      const card: RecountCard = { id: c.id, eval_unit_id: report.evalUnitId, team_id: report.teamId, data: pre.dataOf.get(c.id) };
      return recountStored(supabase, card, c.draft!.spec!, report.year, stored, { priorSections: pre.priorSections, reportId: report.id, ...(pre.mgNumbers !== undefined ? { mgNumbers: pre.mgNumbers } : {}) });
    },
    { onError: (e, i) => console.error("recountSubmitCards", drafted[i]?.id, e) },
  );
  const byId = new Map(drafted.map((c, i) => [c.id, views[i] ?? recountFailed({ unknown: c.draft?.unknownNumbers, warnings: [] }, "다시 세다가 오류가 남")]));
  return cards.map((c) => {
    const v = byId.get(c.id);
    if (!v || !c.draft?.spec) return c;
    // 모양 검사에 걸린 초안은 그리지 않음 — 제출 판정은 초안 있음으로 셈(spec 대신 hasSpec)
    const draft = specIssue(c.draft.spec) ? { ...c.draft, spec: null, hasSpec: true } : c.draft;
    return { ...c, draft: { ...draft, unknownNumbers: v.unknown }, ...(v.failed ? { recountFail: v.failed } : {}) };
  });
}

/** 사업 조판 과제(목차 + 과제별 초안 — unit-layout-queries.ts loadBusinessItems)에서 다시 세기에 쓰는 것 */
export interface LayoutRecountItem {
  cardId: string;
  spec: ReportSectionSpec | null;
  unknownNumbers?: string[];
}

/**
 * 사업 조판(/reports/business/<지표>) 과제들의 없는 숫자를 다시 셈(동시 RECOUNT_CONCURRENCY장) → 과제 id별 보기. 초안이 없는 과제는 빠짐.
 * 카드 글·팀(부서 보고서 id)·전년 절(주요사업)·2025 보고서 숫자 근거(경영관리)는 한 번씩만 읽음. 던지지 않음(실패한 장은 recountFailed)
 */
export async function recountLayoutItems(supabase: SupabaseClient, unit: string, year: number, items: readonly LayoutRecountItem[]): Promise<Map<string, RecountView>> {
  const drafted = items.filter((it) => it.spec);
  const out = new Map<string, RecountView>();
  if (!drafted.length) return out;
  const mg = unit.startsWith("MG-");
  // 미리 읽기가 실패하면 null — 모든 장이 「근거 자료를 읽지 못함」(막힘)
  let pre: { cardOf: Map<string, { team_id: number | string | null; data: unknown }>; reportOf: Map<string, number>; priorSections: PriorSection[]; mgNumbers?: string } | null;
  try {
    const [{ data: cards }, { data: reports }, priorSections, mgNumbers] = await Promise.all([
      supabase.from("cards").select("id, team_id, data").in("id", drafted.map((it) => it.cardId)),
      supabase.from("reports").select("id, team_id").eq("eval_unit_id", unit).eq("year", year),
      mg ? Promise.resolve([] as PriorSection[]) : loadPriorSections(supabase as Parameters<typeof loadPriorSections>[0], unit),
      mg ? loadMgNumberEvidence(supabase, unit) : Promise.resolve(undefined),
    ]);
    pre = {
      cardOf: new Map(((cards ?? []) as Array<{ id: string; team_id: number | string | null; data: unknown }>).map((c) => [String(c.id), c])),
      reportOf: new Map(((reports ?? []) as Array<{ id: number; team_id: number | string | null }>).map((r) => [String(r.team_id), Number(r.id)])),
      priorSections,
      ...(mgNumbers !== undefined ? { mgNumbers } : {}),
    };
  } catch (e) {
    console.error("recountLayoutItems pre", unit, e);
    pre = null;
  }
  const views = await runPool(
    drafted,
    RECOUNT_CONCURRENCY,
    async (it): Promise<RecountView> => {
      const stored = { unknown: it.unknownNumbers, warnings: [] };
      if (!pre) return recountFailed(stored, "근거 자료를 읽지 못함");
      const row = pre.cardOf.get(it.cardId);
      if (!row) return recountFailed(stored, "카드 글을 읽지 못함");
      const card: RecountCard = { id: it.cardId, eval_unit_id: unit, team_id: row.team_id, data: row.data };
      return recountStored(supabase, card, it.spec!, year, stored, { priorSections: pre.priorSections, reportId: pre.reportOf.get(String(row.team_id)) ?? null, ...(pre.mgNumbers !== undefined ? { mgNumbers: pre.mgNumbers } : {}) });
    },
    { onError: (e, i) => console.error("recountLayoutItems", drafted[i]?.cardId, e) },
  );
  drafted.forEach((it, i) => out.set(it.cardId, views[i] ?? recountFailed({ unknown: it.unknownNumbers, warnings: [] }, "다시 세다가 오류가 남")));
  return out;
}
