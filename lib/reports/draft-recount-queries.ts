// 저장된 과제별 초안의 숫자 근거 글 읽기(2026-11-16 시큐어 코딩 2차 점검 후속 — 다시 세기는 draft-recount.ts).
// prepareDraft(app/(app)/reports/cards/draft-prepare.ts)를 직접 고침·되돌리기처럼 초안 근거 목록(spec.sources·priorKeys)으로 부를 때와 같은 규칙으로 known을 만듭니다:
// 카드 전용 자료·연결(확정)한 보고서 추가자료의 읽은 글 + 전년 절(주요사업) + 실사 답변 평가 근거 + 이 과제에 연결된 2025 절·실사 조각
// (+ 경영관리: 그 지표 2025 보고서·핵심공통항목 + 고른 주요사업 원장·붙임·가린 초안 글). 모두 로그인 사용자 권한(RLS·DB 함수)으로 읽음.
// 다른 점: 첨부는 올릴 때 읽어 둔 글(parsed_text)만 쓰고 여기서 새로 읽지 않음(화면을 열 때 파일 파싱·그림 설명 호출이 없게) — 못 읽은 첨부는 빠져 없는 숫자가 더 잡히는 쪽
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCardBundle } from "../ai/context.ts";
import { runPool } from "../ai/pool.ts";
import { isMgmtCard } from "../cards/mgmt-card.ts";
import { isoDay } from "../format.ts";
import { relevantRefs } from "../knowledge/bundle.ts";
import { yearActuals } from "./actuals.ts";
import { recountDraft } from "./draft-recount.ts";
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
    mg ? loadMgNumberEvidence(supabase, card.eval_unit_id) : Promise.resolve(""),
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

/** 보고서 검토에서 과제 여러 장을 다시 셀 때 동시에 읽는 과제 수(과제 하나가 근거 읽기 여러 번) */
const RECOUNT_CONCURRENCY = 4;

/**
 * 부서 보고서 하나(같은 사업·부서·연도)의 과제별 초안 묶음(loadSubmitCards)의 없는 숫자를 다시 셈 — 보고서 검토 화면(/reports/[id])의 점선·확인 목록 건수.
 * 초안(spec)이 있는 과제만, 카드 글은 한 번에, 전년 절은 사업마다 한 번 읽음. 한 과제 다시 세기가 실패하면 그 과제는 저장값 그대로(오류는 로그)
 */
export async function recountSubmitCards(supabase: SupabaseClient, report: { id: number; evalUnitId: string; teamId: number; year: number }, cards: SubmitCard[]): Promise<SubmitCard[]> {
  const drafted = cards.filter((c) => c.draft?.spec);
  if (!drafted.length) return cards;
  const mg = report.evalUnitId.startsWith("MG-");
  const [{ data }, priorSections] = await Promise.all([
    supabase.from("cards").select("id, data").in("id", drafted.map((c) => c.id)),
    mg ? Promise.resolve([] as PriorSection[]) : loadPriorSections(supabase as Parameters<typeof loadPriorSections>[0], report.evalUnitId),
  ]);
  const dataOf = new Map(((data ?? []) as Array<{ id: string; data: unknown }>).map((x) => [x.id, x.data]));
  const fresh = await runPool(
    drafted,
    RECOUNT_CONCURRENCY,
    async (c) => {
      if (!dataOf.has(c.id) || !c.draft?.spec) return null;
      const card: RecountCard = { id: c.id, eval_unit_id: report.evalUnitId, team_id: report.teamId, data: dataOf.get(c.id) };
      const known = await loadDraftKnown(supabase, card, c.draft.spec, report.year, { priorSections, reportId: report.id });
      return recountDraft(c.draft.spec, card.data, known, { unknown: c.draft.unknownNumbers, warnings: [] }).unknown;
    },
    { onError: (e, i) => console.error("recountSubmitCards", drafted[i]?.id, e) },
  );
  const byId = new Map(drafted.map((c, i) => [c.id, fresh[i]]));
  return cards.map((c) => {
    const unknown = byId.get(c.id);
    return unknown && c.draft ? { ...c, draft: { ...c.draft, unknownNumbers: unknown } } : c;
  });
}
