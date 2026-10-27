import "server-only";

import { revalidatePath } from "next/cache";
import { AttachmentError, loadMaterialTexts } from "../../../../lib/ai/attachments.ts";
import { MATERIAL_COLS, type MaterialDoc, type MaterialRow } from "../../../../lib/ai/material-text.ts";
import { fileRelation } from "../../../../lib/reports/material-match.ts";
import { CliFailedError } from "../../../../lib/ai/cli-result.ts";
import { loadCardBundle } from "../../../../lib/ai/context.ts";
import { type KnowledgeBundle, relevantRefs } from "../../../../lib/knowledge/bundle.ts";
import { aiErrorMessage } from "../../../../lib/ai/run.ts";
import { reportLockedFor } from "../../../../lib/reports/queries.ts";
import { requireUser } from "../../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../../lib/cards/view.ts";
import { isoDay } from "../../../../lib/format.ts";
import { type YearActuals, yearActuals } from "../../../../lib/reports/actuals.ts";
import { type SplitDraftRow, outlineSiblingLayout, readComposition, splitSiblingsOf } from "../../../../lib/reports/composition.ts";
import type { DiagramHint } from "../../../../lib/reports/diagram-hints.ts";
import type { LensRef } from "../../../../lib/reports/lens.ts";
import { type PriorPick, pickPrior, scorePrior } from "../../../../lib/reports/prior.ts";
import { loadLens } from "../../../../lib/reports/lens-queries.ts";
import { loadPriorSections } from "../../../../lib/reports/prior-queries.ts";
import { type ReportFile, type SectionContext, type SiblingCard, type SiblingLayout, draftEvidence, readSection, sectionContext, sectionHints, siblingLayout } from "../../../../lib/reports/section.ts";
import { createClient } from "../../../../lib/supabase/server.ts";
import { type AiRequestStart, startAiRequest, startAiRequests } from "../../../../lib/ai/request-log.ts";
import { isMgmtCard } from "../../../../lib/cards/mgmt-card.ts";
import { type MgDraftContext, mgCardAsOf, mgMarkers } from "../../../../lib/reports/mg-draft.ts";
import { type MgSibling, defaultEvals, mgSiblingOf } from "../../../../lib/reports/mg-outline.ts";
import { loadMgCardPages, loadMgNumberEvidence, loadMgPrior } from "../../../../lib/reports/mg-queries.ts";
import { MGMT_INDICATORS } from "../../../../lib/tracks/mgmt-units.ts";
import { type FollowupBasis, followupBasis } from "../../../../lib/ai/followup.ts";
import { readResult } from "../../../../lib/inspections/model.ts";
import type { SplitSibling } from "../../../../lib/reports/split-axes.ts";

export type ReportDraftState = { ok: true; message: string } | { ok: false; message: string };

/** 초안에 넣을 첨부 자료: 카드 전용 자료 id · 그 보고서 추가자료 id */
export interface DraftSources {
  card: string[];
  report: string[];
  /** 전년도 보고서 같은 과제 절(조각 키, 최대 2개). 없으면(undefined) 자동으로 고름, 빈 배열이면 넣지 않음 */
  prior?: string[];
}

/** 부서 잠금 안내(최종 판정은 DB 트리거 guard_card_report_draft) — 제출·승인 중 부서는 과제별 초안·구성안·블록 고치기·BP를 못 바꿈 */
export const DRAFT_LOCKED_MSG = "확정(승인)·제출한 보고서의 과제입니다 — 고치려면 「경평 초안」에서 확정(또는 제출)을 취소해 주세요.";

export const refresh = (uid: string) => {
  revalidatePath(`/reports/cards/${uid}`);
  revalidatePath("/reports/cards");
};

/** 첨부 자료 하나(고른 것 — 기본은 전부, 사람이 뺀 것만 빠짐) */
export interface Picked {
  kind: "card" | "report";
  id: string;
  name: string;
}

/** 초안·구성안이 함께 쓰는 근거와 맥락 */
/** 초안에 넣는 자료 하나 — 읽은 글 + 이 과제와 맺는 관계·숫자 근거 인정 여부(참고자료 3단계) */
export type DraftFile = MaterialDoc & Required<Pick<ReportFile, "relation" | "numberEvidence">>;

export interface Prepared {
  me: Awaited<ReturnType<typeof requireUser>>;
  supabase: Awaited<ReturnType<typeof createClient>>;
  card: { id: string; eval_unit_id: string; data: unknown; status: string; data_rev: number | null; team_id: string | null; edition: string | null; updated_at: string | null };
  year: number;
  picked: Picked[];
  /** 읽은 첨부(전체 글 — 자르지 않음) */
  files: DraftFile[];
  /** AI가 읽지 못해 뺀 첨부(「이름」(사유)) — 초안 경고로 남김 */
  skipped: string[];
  ctx: SectionContext;
  prior: PriorPick[];
  siblingsLayout: SiblingLayout[];
  lens: LensRef[];
  actuals: YearActuals;
  /** 숫자 대조 근거 글(첨부·전년 절·실사 답변·계량 실적 입력) */
  known: string;
  /** 인용 대조에만 쓰는 글(평가 기준·평가위원 지적·유관기관 사례) */
  quoteOnly: string;
  /** known을 2025 보고서 글(past)과 올해 근거(current)로 나눈 것 — 전년 인용 점검(section.ts priorQuoteIssues). 주요사업만 */
  years?: { past: string; current: string };
  own: DiagramHint[];
  /** 과제별 공통 지식 묶음(규칙 범위 전부 — 참고자료 설계 2단계). 평가 근거(lens)·전년 절은 그중 이 과제에 맞게 고른 것으로 그대로 씀 */
  kb: KnowledgeBundle;
  mode: string;
  /** 경영관리 카드(평가내용 → 대주제 → 절 — lib/reports/mg-draft.ts): 지표·마커·전년 보고서 골격·추천 평가내용. 주요사업은 null */
  mg: MgDraftContext | null;
  /** 경영관리: 같은 지표 다른 카드의 구성안 절(겹침 점검·구성안 요청 — lib/reports/mg-outline.ts). 주요사업은 빈 목록 */
  mgSiblings: MgSibling[];
  /** 주요사업: 같은 실행과제 형제 카드의 소항목 제목·갈래 축·칩(구성안 요청·형제 축 경고 — lib/reports/split-axes.ts). 경영관리는 빈 목록 */
  splitSiblings: SplitSibling[];
  /** 시작할 때 읽은 초안 행의 updated_at(없던 행이면 null) — AI 결과를 저장할 때 그 사이 사람이 고쳤으면 덮지 않음(saveDraftRow) */
  base: string | null;
}

/**
 * 이 과제의 최종 점검표(보완 점검과 같은 규칙 — 부서에 보낸·확인한 것 중 점검월이 가장 늦은 1건, 초안 제외)의 미흡 행 — 원장 → 종합점검 → 경평 구성안(2026-10-09).
 * 구성안 요청에만 넣음(평가 논점 참고 — 근거 원문 대조·숫자 근거에는 안 씀)
 */
export async function loadInspectionBasis(supabase: Prepared["supabase"], cardId: string): Promise<FollowupBasis | null> {
  const { data: ins } = await supabase.from("inspections").select("period, status, result").eq("card_id", cardId).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
  return followupBasis(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null);
}

/**
 * 같은 지표 다른 카드의 경영관리 구성안(형제 짜임 — 대주제·절 겹침 점검과 구성안 요청, 2026-10-09). 이 사용자가 읽을 수 있는 카드만(RLS),
 * 구성안이 없는 카드는 뺌. 경영관리는 카드 여러 장이 한 지표의 대주제를 나눠 맡아 두 카드가 같은 절 표지를 고르면 보고서에서 겹침
 */
export async function loadMgSiblings(supabase: Prepared["supabase"], card: { id: string; eval_unit_id: string }, year: number): Promise<MgSibling[]> {
  const { data } = await supabase.from("card_report_drafts").select("outline, cards!inner(task_no, eval_unit_id)").eq("year", year).eq("cards.eval_unit_id", card.eval_unit_id).neq("card_id", card.id).not("outline", "is", null);
  return (data ?? [])
    .map((d: { outline: unknown; cards: { task_no: string } | Array<{ task_no: string }> | null }) => {
      const c = Array.isArray(d.cards) ? d.cards[0] : d.cards;
      return mgSiblingOf(String(c?.task_no ?? ""), readComposition(d.outline));
    })
    .filter((x): x is MgSibling => Boolean(x))
    .sort((a, b) => a.taskNo.localeCompare(b.taskNo, "ko", { numeric: true }))
    .slice(0, 12);
}

/** 같은 실행과제 형제 카드의 갈래 축·칩 읽기(구성안 고치기 — 형제 축 경고를 다시 셈). 이 사용자가 읽을 수 있는 카드만(RLS) */
export async function loadSplitSiblings(supabase: Prepared["supabase"], card: { id: string; eval_unit_id: string; data: unknown }, siblings: SiblingCard[], year: number): Promise<SplitSibling[]> {
  const { data } = await supabase.from("card_report_drafts").select("card_id, spec, outline, cards!inner(eval_unit_id, task_no, title)").eq("year", year).eq("cards.eval_unit_id", card.eval_unit_id).neq("card_id", card.id);
  return splitSiblingsOf(card.data, card.id, siblings, (data ?? []) as SplitDraftRow[]);
}

/**
 * 근거 모으기(초안·구성안 공용): 사용자·권한 확인, 남용 방지(다른 AI 기능과 합쳐 1분 5번), 첨부 자료(이 카드의 전용 자료·이 카드가 속한 보고서의
 * 추가자료만 — 다른 카드·보고서 id는 안 읽힘), 목차·쪽 배정, 전년 절, 형제 짜임, 평가 근거, 올해 실적 재료.
 */
export async function prepareDraft(uid: string, sources?: DraftSources, opts: { lenient?: boolean; readOnly?: boolean } = {}): Promise<({ ok: true } & Prepared) | { ok: false; message: string }> {
  const me = await requireUser("/reports/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, data, status, data_rev, team_id, edition, updated_at").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { ok: false, message: "보관한 과제는 초안을 만들지 않습니다." };
  // readOnly(블록 질문 — 초안을 바꾸지 않음): 카드를 읽을 수 있으면(RLS — 주관 부서 등) 물을 수 있음
  if (!opts.readOnly && me.role === "dept_user" && card.team_id !== me.team?.id) return { ok: false, message: "자기 부서 과제만 초안을 만들 수 있습니다." };
  if (!opts.readOnly && me.role === "dept_user" && (await reportLockedFor(supabase, card, Number(currentPeriod().slice(0, 4))))) return { ok: false, message: DRAFT_LOCKED_MSG };


  const year = Number(currentPeriod().slice(0, 4));
  // 시작할 때의 초안 행 버전(AI가 몇 분 쓰는 동안 사람이 고친 것을 덮지 않게 — 저장 때 이 값과 같아야 씀)
  const { data: cur } = await supabase.from("card_report_drafts").select("updated_at").eq("card_id", card.id).eq("year", year).maybeSingle();
  const base: string | null = cur?.updated_at ?? null;
  const cardIds = [...new Set(sources?.card ?? [])];
  const reportIds = [...new Set(sources?.report ?? [])];
  // 첨부: 화면이 기본으로 전부 고르고 사람은 빼기만(참고자료 설계 1단계·D8 — 6건·20MB 한도 없앰). 이 카드의 전용 자료·이 카드가 속한 보고서의 추가자료만(다른 카드·보고서 id는 안 읽힘)
  const cardRows: MaterialRow[] = [];
  if (cardIds.length) {
    const { data } = await supabase.from("card_materials").select(MATERIAL_COLS).eq("card_id", card.id).in("id", cardIds);
    cardRows.push(...((data ?? []) as MaterialRow[]));
  }
  // 이 카드가 속한 보고서(같은 사업·부서·연도) — 추가자료와 부서가 넣은 올해 계량 실적(inputs.kpi)
  const { data: report } = await supabase.from("reports").select("id, inputs").eq("eval_unit_id", card.eval_unit_id).eq("team_id", card.team_id).eq("year", year).maybeSingle();
  const reportRows: MaterialRow[] = [];
  if (reportIds.length && report) {
    const { data } = await supabase.from("report_materials").select(MATERIAL_COLS).eq("report_id", report.id).in("id", reportIds);
    reportRows.push(...((data ?? []) as MaterialRow[]));
  }
  // lenient(블록 고치기): 초안을 만든 뒤 지운 자료는 빼고 남은 근거로
  if (!opts.lenient && cardRows.length + reportRows.length < cardIds.length + reportIds.length) return { ok: false, message: "고른 자료 중 찾을 수 없는 것이 있습니다. 화면을 새로 고친 뒤 다시 골라 주세요." };
  const picked: Picked[] = [...cardRows.map((m) => ({ kind: "card" as const, id: String(m.id), name: m.file_name })), ...reportRows.map((m) => ({ kind: "report" as const, id: String(m.id), name: m.file_name }))];
  // 올릴 때 읽어 둔 전체 글(아직 안 읽었거나 판이 다르면 여기서 읽어 채움). 못 읽은 자료는 빼고 경고로 남김
  const cardText = await loadMaterialTexts(supabase, "card_materials", cardRows);
  const reportText = await loadMaterialTexts(supabase, "report_materials", reportRows);
  // 이 과제에 사람이 확정한 보고서 추가자료 연결(참고자료 3단계) — 확정한 자료의 수치만 숫자 근거로 인정. 연결 없음은 「같은 보고서 자료」(넣되 숫자 근거 아님)
  const { data: links } = reportRows.length ? await supabase.from("report_material_cards").select("material_id").eq("card_id", card.id).eq("status", "confirmed").in("material_id", reportRows.map((m) => m.id)) : { data: [] };
  const confirmed = new Set((links ?? []).map((l) => String(l.material_id)));
  const files: DraftFile[] = [...cardText.docs, ...reportText.docs].map((d) => ({ ...d, ...fileRelation(d, confirmed) }));
  const skipped = [...cardText.failed, ...reportText.failed].map((f) => `「${f.name}」(${f.error})`);

  // 경영관리 카드: 대상사업·실행과제·목차·형제 짜임·주요사업 전년 절(rpt25-biz) 대신 지표의 전년 보고서 골격(rpt25-mg)으로 — 평가 근거·공통 지식 묶음은 같은 함수가 트랙으로 가름
  if (isMgmtCard(card.data)) return prepareMgDraft({ me, supabase, card, year, picked, files, skipped, report, base });
  const { data: sib } = await supabase.from("cards").select("id, task_no, tb:data->>targetBusiness, etn:data->>executionTaskNo, et:data->>executionTask").eq("eval_unit_id", card.eval_unit_id).eq("status", "active");
  const siblings: SiblingCard[] = (sib ?? []).map((c: { id: string; task_no: string; tb: string | null; etn: string | null; et: string | null }) => ({
    id: c.id,
    taskNo: c.task_no,
    targetBusiness: c.tb ?? "",
    executionTaskNo: c.etn ?? "",
    executionTask: c.et ?? "",
  }));
  // 목차·쪽 배정이 있으면 그 쪽수로 분량을 맞춤
  const { data: outline } = await supabase.from("report_outline").select("pages, included").eq("card_id", card.id).eq("year", year).maybeSingle();
  const ctx = sectionContext(card.data, siblings, outline?.included === false ? null : outline?.pages ? Number(outline.pages) : null);
  // 전년도 경영실적보고서 같은 과제 절(과거 실적): 같은 주요사업 절 중 고른 것(최대 2개) 또는 자동으로 닮은 절
  const sections = await loadPriorSections(supabase, card.eval_unit_id);
  const scored = scorePrior(card.data, sections);
  const prior: PriorPick[] = sources?.prior
    ? [...new Set(sources.prior)]
        .slice(0, 2)
        .map((key) => scored.find((p) => p.section.key === key))
        .filter((p): p is PriorPick => Boolean(p))
    : pickPrior(card.data, sections);
  // 같은 주요사업·연도의 다른 과제(형제) 짜임 — 같은 틀이 되풀이되지 않게 요청에 넣고, 초안끼리 같으면 경고. 초안이 없으면 저장된 구성안의 틀·블록 순서(2026-10-10 — 구성안 단계의 카드끼리도 서로를 봄)
  const { data: sibDrafts } = await supabase.from("card_report_drafts").select("card_id, spec, outline, cards!inner(eval_unit_id, task_no, title)").eq("year", year).eq("cards.eval_unit_id", card.eval_unit_id).neq("card_id", card.id);
  const siblingsLayout: SiblingLayout[] = (sibDrafts ?? [])
    .flatMap((d: { spec: unknown; outline: unknown; cards: { task_no: string; title: string } | Array<{ task_no: string; title: string }> | null }) => {
      const sp = readSection(d.spec);
      const fromDraft = sp ? siblingLayout(sp) : null;
      if (fromDraft) return [fromDraft];
      const c = Array.isArray(d.cards) ? d.cards[0] : d.cards;
      const plan = readComposition(d.outline);
      const fromOutline = plan ? outlineSiblingLayout(`${c?.task_no ?? ""} ${(c?.title ?? "").slice(0, 24)}(구성안)`, plan) : null;
      return fromOutline ? [fromOutline] : [];
    })
    .slice(0, 20);
  // 같은 실행과제 형제 카드의 갈래 축·칩(구성안 요청·형제 축 경고 — 2026-10-13)
  const splitSiblings = splitSiblingsOf(card.data, card.id, siblings, (sibDrafts ?? []) as SplitDraftRow[]);
  // 평가 기준·평가위원 관점 — 공통 지식에서 결정론으로 고름
  const [lens, kb] = await Promise.all([loadLens(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }), loadCardBundle(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report")]);
  // 올해 실적 재료 — 없으면 초안이 【확인: …】 자리표시로 남김
  const actuals = yearActuals(card.data, (report?.inputs?.kpi ?? {}) as Record<string, string>, isoDay());
  // 숫자 대조 근거 = 카드 + 첨부 글 + 전년 절 글 + 실사 답변 + 계량 실적 입력. 평가 기준·지적·유관기관 사례는 인용 대조에만
  // 숫자 근거 — 이 과제에 연결된 2025 보고서 절·실사 답변의 수치도(lib/reports/section.ts draftEvidence linked)
  const { known, quoteOnly, past, current } = draftEvidence(files, prior, lens, actuals, relevantRefs(kb));
  // 도식 후보 중 이 과제만의 요소 — 초안이 하나도 안 쓰면 짜임 문제로 고치기
  const own = sectionHints(card.data, prior, files, lens, actuals, year).filter((h) => h.own);
  const mode = `${ctx.module}p${files.length ? `+${files.length}f` : ""}${prior.length ? `+${prior.length}prior` : ""}${lens.length ? `+${lens.length}lens` : ""}`;
  return { ok: true, me, supabase, card, year, picked, files, skipped, ctx, prior, siblingsLayout, lens, actuals, known, quoteOnly, years: { past, current }, own, mode, kb, mg: null, mgSiblings: [], splitSiblings, base };
}

/**
 * 경영관리 카드의 근거 모으기(prepareDraft 뒤쪽): 지표 이름·마커(지적개선·신규)·2025 보고서 골격(평가내용 → 대주제 → 절, 글 포함)·추천 평가내용(분석 §5 첫 대응).
 * 숫자 근거 = 첨부·실사 답변·계량 실적 입력 + 그 지표 2025 보고서 전 장·핵심공통항목(KCA 자신의 수치 — loadMgNumberEvidence). 판면은 맞추지 않고 분량 목표(목차·쪽 배정 쪽수 — loadMgCardPages, 2026-10-12 D1)만 요청·경고에 쓰며,
 * 형제 짜임은 같은 지표 다른 카드의 구성안 절(loadMgSiblings — 주요사업의 형제 초안 짜임과 다름)
 */
async function prepareMgDraft(x: Pick<Prepared, "me" | "supabase" | "card" | "year" | "picked" | "files" | "skipped" | "base"> & { report: { id: string; inputs: { kpi?: Record<string, string> } | null } | null }): Promise<{ ok: true } & Prepared> {
  const { supabase, card, files } = x;
  const data = card.data as { taskNo?: string };
  const [prior, numbers, lens, kb, mgSiblings, pages] = await Promise.all([
    loadMgPrior(supabase, card.eval_unit_id),
    loadMgNumberEvidence(supabase, card.eval_unit_id),
    loadLens(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }),
    loadCardBundle(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: card.data }, "report"),
    loadMgSiblings(supabase, card, x.year),
    loadMgCardPages(supabase, card, x.year),
  ]);
  const taskNo = String(data.taskNo ?? "");
  const mg: MgDraftContext = {
    unit: card.eval_unit_id,
    indicator: MGMT_INDICATORS.find((i) => i.id === card.eval_unit_id)?.name ?? card.eval_unit_id,
    taskNo,
    markers: mgMarkers(card.data),
    prior,
    evals: defaultEvals(taskNo, prior),
    pages,
    cardAsOf: mgCardAsOf(card),
  };
  const actuals = yearActuals(card.data, (x.report?.inputs?.kpi ?? {}) as Record<string, string>, isoDay());
  const ev = draftEvidence(files, [], lens, actuals, relevantRefs(kb));
  // 숫자 근거 = 첨부·실사 답변·계량 실적 입력 + 이 과제에 연결된 공통 지식 조각 + 그 지표 2025 보고서 전 장·핵심공통항목(KCA 자신의 수치)
  const known = [ev.known, numbers].join("\n");
  const ctx = sectionContext(card.data, [], null);
  const mode = `mg${files.length ? `+${files.length}f` : ""}+${prior.length}prior${lens.length ? `+${lens.length}lens` : ""}`;
  return { ok: true, ...x, ctx, prior: [], siblingsLayout: [], lens, actuals, known, quoteOnly: ev.quoteOnly, own: [], mode, kb, mg, mgSiblings, splitSiblings: [] };
}

/** AI 호출 직전: 진행 중 호출도 세는 1분 5회·동시 실행 제한과 호출 기록 시작(lib/ai/request-log.ts — 다른 AI 기능과 합산) */
export const beginAi = (p: Prepared, feature: string, mode = p.mode) => startAiRequest(p.supabase, { userId: p.me.id, cardId: p.card.id, feature, mode });
/** 여러 안(같은 요청 n번을 동시에): 진행 중 AI 호출이 없을 때만, 1분 제한에 n건으로 셈 — 안마다 기록 한 행(lib/ai/request-log.ts startAiRequests) */
export const beginAiBatch = (p: Prepared, feature: string, mode: string, n: number) => startAiRequests(p.supabase, { userId: p.me.id, cardId: p.card.id, feature, mode }, n);
export type AiReq = Extract<AiRequestStart, { ok: true }>;

/** AI 실패 기록(실패 종류 — CLI subtype·턴 수, 본문 없음): 시작한 호출 기록을 error로 끝맺음 */
export async function logAiError(ai: AiReq, feature: string, e: unknown): Promise<string> {
  const message = e instanceof AttachmentError ? e.message : aiErrorMessage(e);
  console.error(feature, e);
  const meta = e instanceof CliFailedError && e.meta ? ` [${e.meta}]` : "";
  await ai.finish({ status: "error", error: `${message}${meta}` });
  return message;
}

