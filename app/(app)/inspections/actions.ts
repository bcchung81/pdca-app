"use server";

import { revalidatePath } from "next/cache";
import { gatherInspectionKnowledge, loadBizLedger } from "../../../lib/ai/context.ts";
import { type InspectContext, recheckEvidence, verifyInspection } from "../../../lib/ai/inspect.ts";
import { type MgSiblingRow, type MgmtInspectContext, mgSiblingsOf, verifyInspectionMg } from "../../../lib/ai/inspect-mg.ts";
import { aiErrorMessage, callInspection, callInspectionMg, mgLinkIndex, modelLabel } from "../../../lib/ai/run.ts";
import { startAiRequest } from "../../../lib/ai/request-log.ts";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { isPeriod, isoDay } from "../../../lib/format.ts";
import { pickBizLinks } from "../../../lib/inspections/biz-links.ts";
import { checklistItems } from "../../../lib/inspections/checklist.ts";
import { CASE_NO_SOURCE, type InspectionResult, MGMT_FORM_ID, checklistCounts, cleanResult, inspectionSummary, isPreMonth, readResult, readyToSend, tally, inspectionWriteBlock } from "../../../lib/inspections/model.ts";
import { caseKey } from "../../../lib/inspections/summary.ts";
import { BUSINESSES } from "../../../lib/knowledge/dictionaries.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { isMgmtCard } from "../../../lib/cards/mgmt-card.ts";
import { MGMT_INDICATORS } from "../../../lib/tracks/mgmt-units.ts";
import { trackSpecOfUnit } from "../../../lib/tracks/index.ts";
import { getTrack } from "../../../lib/tracks/current.ts";

export type InspectionSaveState = { status: "idle" } | { status: "ok"; message: string; result: InspectionResult } | { status: "error"; message: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** 이 주요사업의 세부 대상사업(원장 카드 기본정보 '대상사업' 칸 이름들) — 정합성 5 판단용 */
async function subBusinesses(supabase: Supabase, evalUnitId: string): Promise<string[]> {
  const { data } = await supabase.from("cards").select("tb:data->>targetBusiness").eq("eval_unit_id", evalUnitId).eq("status", "active");
  return [...new Set((data ?? []).map((r: { tb: string | null }) => (r.tb ?? "").trim()).filter(Boolean))].sort((x, y) => x.localeCompare(y, "ko"));
}

/** 같은 경영관리 지표(평가단위)의 활성 과제 목록과 다른 과제의 「지적 및 개선방안」 행(원장) — 체크리스트 소관·'25 지적 소관을 나눌 때 AI에 알림(mgSiblingsOf) */
async function siblingsCtx(supabase: Supabase, evalUnitId: string, cardId: string): Promise<Pick<MgmtInspectContext, "siblings" | "siblingFindings">> {
  const { data } = await supabase.from("cards").select("id, status, no:data->>taskNo, title:data->>title, findings:data->findings").eq("eval_unit_id", evalUnitId).eq("status", "active");
  const { siblings, findings } = mgSiblingsOf((data ?? []) as MgSiblingRow[], cardId);
  return { siblings, siblingFindings: findings };
}

/** 이 달 확정 작성본(점검 근거 기록용) */
async function confirmedVersionId(supabase: Supabase, cardId: string, period: string): Promise<number | null> {
  const { data } = await supabase.from("card_versions").select("id").eq("card_id", cardId).eq("period", period).eq("status", "confirmed").order("version", { ascending: false }).limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * 월간 점검표 저장·보내기·보내기 취소 — 성과관리팀·관리자(종합점검 지침 14 양식).
 * 근거는 확정 카드 + 관리계획 발췌(공통 지식)만이며, 카드 전용 자료는 쓰지 않습니다. 저장할 때 인용을 원문과 다시 대조합니다.
 */
export async function saveInspection(uid: string, period: string, payload: unknown, intent: "save" | "send" | "unsend"): Promise<InspectionSaveState> {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return { status: "error", message: "성과관리팀·관리자만 점검표를 씁니다." };
  if (!isPeriod(period)) return { status: "error", message: "점검 기간이 올바르지 않습니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id").eq("uid", uid).maybeSingle();
  if (!card) return { status: "error", message: "카드를 찾을 수 없습니다." };
  const { data: existing } = await supabase.from("inspections").select("id, status").eq("card_id", card.id).eq("period", period).maybeSingle();
  // 초안만 저장·보내기, 보낸 점검표는 보내기 취소만, 확인한 점검표는 아무것도(lib/inspections/model.ts — DB 트리거도 확인한 점검표를 막음)
  const blocked = inspectionWriteBlock(existing?.status ?? null, intent);
  if (blocked) return { status: "error", message: blocked };

  const refs = await gatherInspectionKnowledge(supabase, card.eval_unit_id);
  const result = recheckEvidence(cleanResult(payload, trackSpecOfUnit(card.eval_unit_id).inspectionForm), refs);
  // 사례제안 머리(기관명 — 사업명(등급))가 붙임2 표기와 같은지(지침 자가검증 23) — 다르면 운영 알림
  const peers = refs.filter((r) => r.unitType === "peer_case");
  const head = caseKey(result.overview.case);
  const peerHeads = new Set(peers.map((r) => r.title.replace(/^붙임2 · /, "")));
  const caseWarn = "사례제안: 기관명 — 사업명(등급)이 붙임2 표기와 다릅니다.";
  result.notices = result.notices.filter((n) => n !== caseWarn);
  if (head && result.overview.case !== CASE_NO_SOURCE && peers.length && !peerHeads.has(head)) result.notices.push(caseWarn);
  if (intent === "send") {
    const problem = readyToSend(result);
    if (problem) return { status: "error", message: problem };
  }
  const status = intent === "send" ? "sent" : "draft";
  // result.summary: 목록 「AI 컨설팅」용 판정 요약(파생 값 — 목록이 점검표 전체를 읽지 않게)
  const row = { result: { ...result, summary: inspectionSummary(result) }, status, model: result.ai?.model ?? "manual", knowledge_keys: refs.map((r) => r.key), card_version_id: await confirmedVersionId(supabase, card.id, period) };
  const { error } = existing
    ? await supabase.from("inspections").update(row).eq("id", existing.id)
    : await supabase.from("inspections").insert({ ...row, card_id: card.id, period, created_by: me.id });
  if (error) {
    console.error("saveInspection", error.message);
    return { status: "error", message: "저장하지 못했습니다." };
  }
  revalidatePath("/inspections");
  revalidatePath("/my/inspections");
  return { status: "ok", result, message: intent === "send" ? "부서에 보냈습니다." : intent === "unsend" ? "보내기를 취소했습니다(초안)." : "초안을 저장했습니다." };
}

/** 그 달 초안 중 보낼 수 있는 것(모든 항목 판단·미흡 근거·총평)을 모두 보냄 — 머리띠에서 고른 트랙의 과제만(다른 트랙 초안은 안 건드림) */
export async function sendAllDrafts(period: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 보냅니다." };
  if (!isPeriod(period)) return { ok: false, message: "점검 기간이 올바르지 않습니다." };
  const supabase = await createClient();
  const { data } = await supabase.from("inspections").select("id, result, card:cards!inner(unit:eval_units!inner(track))").eq("period", period).eq("status", "draft").eq("card.unit.track", await getTrack());
  const ready = (data ?? []).filter((r) => !readyToSend(readResult(r.result))).map((r) => r.id);
  if (ready.length) {
    const { error } = await supabase.from("inspections").update({ status: "sent" }).in("id", ready).eq("status", "draft");
    if (error) return { ok: false, message: "보내지 못했습니다." };
  }
  revalidatePath("/inspections");
  const skipped = (data ?? []).length - ready.length;
  return { ok: true, message: `${ready.length}건 보냄${skipped ? ` · 작성이 덜 된 초안 ${skipped}건은 남김` : ""}` };
}

export type InspectionDraftState = { ok: true; result: InspectionResult; message: string } | { ok: false; message: string };

/**
 * AI 점검 초안(종합점검 지침 14 점검 모드) — 성과관리팀·관리자. 확정 카드(원장) + 관리계획 발췌만 근거로 주고(경영관리는 붙임4 자리에 원장 주요사업 카드 발췌도),
 * 결과는 초안으로 저장합니다(보내기는 성과관리팀이 확인한 뒤). 보낸·확인한 점검표는 다시 만들지 않습니다.
 */
export async function runInspectionDraft(uid: string, period: string): Promise<InspectionDraftState> {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 AI 점검을 씁니다." };
  if (!isPeriod(period)) return { ok: false, message: "점검 기간이 올바르지 않습니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, data, status").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { ok: false, message: "보관된 과제는 점검하지 않습니다." };
  const mgmt = isMgmtCard(card.data);
  const { data: existing } = await supabase.from("inspections").select("id, status").eq("card_id", card.id).eq("period", period).maybeSingle();
  if (existing && existing.status !== "draft") {
    return { ok: false, message: existing.status === "sent" ? "부서에 보낸 점검표입니다. 보내기를 취소한 뒤 다시 만드세요." : "부서가 확인한 점검표는 다시 만들 수 없습니다." };
  }

  const refs = await gatherInspectionKnowledge(supabase, card.eval_unit_id);
  // 지침: 붙임1(판정 기준 원문)이 없으면 점검을 시작하지 않음
  if (!refs.some((r) => r.unitType === "checklist_group") || !refs.some((r) => r.unitType === "evaluator_comment")) {
    return { ok: false, message: "점검 근거(관리계획 발췌 — 자가진단·'25 평가보고서 지적)가 공통 지식에 없습니다. 관리자에게 공통 지식 적재를 요청하세요." };
  }
  const base = { period, today: isoDay(), preMonth: isPreMonth(period, currentPeriod()) };
  let mgCtx: MgmtInspectContext | null = null;
  if (mgmt) {
    const unit = MGMT_INDICATORS.find((u) => u.id === card.eval_unit_id);
    const items = checklistItems(refs);
    if (!unit || !items.length) return { ok: false, message: "점검 근거에 이 지표의 자가진단 체크리스트가 없습니다. 관리자에게 공통 지식 적재를 요청하세요." };
    // 붙임4 자리: 원장 주요사업 카드 발췌(연계 후보·인용 대조 — 2026-10-12 사용자 결정, lib/inspections/biz-links.ts)
    const biz = pickBizLinks(card.data, await loadBizLedger(supabase), mgLinkIndex(), unit.id);
    mgCtx = { ...base, business: null, subBusinesses: [], hasPeerCases: false, form: MGMT_FORM_ID, unit: { id: unit.id, no: unit.no, name: unit.name, bonus: unit.no >= 12 }, ...(await siblingsCtx(supabase, card.eval_unit_id, card.id)), items, biz };
  }
  const biz = BUSINESSES.find((b) => b.id === card.eval_unit_id && b.cardGroup);
  const ctx: InspectContext = mgCtx ?? {
    ...base,
    business: biz ? { id: biz.id, name2026: biz.name2026, name2025: biz.name2025 } : null,
    subBusinesses: await subBusinesses(supabase, card.eval_unit_id),
    hasPeerCases: refs.some((r) => r.unitType === "peer_case"),
  };
  const mode = ctx.preMonth ? "pre" : "month";
  // 남용 방지·호출 기록: 진행 중 호출도 세는 1분 5회·동시 실행 제한(lib/ai/request-log.ts — AI 작성지원·코멘트와 합산)
  const ai = await startAiRequest(supabase, { userId: me.id, cardId: card.id, feature: "inspection", mode });
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const at = new Date().toISOString();
    // 트랙마다 답 모양이 달라 호출·검증을 나눠 둠(경영관리 지침 13 — 체크리스트 대조·내부관리형)
    const mgCall = mgCtx ? await callInspectionMg({ card: card.data, refs, ctx: mgCtx }) : null;
    const bizCall = mgCtx ? null : await callInspection({ card: card.data, refs, ctx });
    const call = (mgCall ?? bizCall)!;
    const model = call.provider === "cli" ? `cli/${call.model}` : call.model;
    // 토큰은 검증 전에 기록(검증이 예외를 던져도 쓴 토큰이 남음)
    await ai.finish({ status: "ok", model, usage: call.usage, timings: { call: Date.now() - t0 } });
    const { result, unverified, missing } = mgCall && mgCtx ? verifyInspectionMg(mgCall.output, refs, mgCtx, { model: modelLabel(call), at }) : verifyInspection(bizCall!.output, refs, ctx, { model: modelLabel(call), at });
    // AI가 도는 사이 누가 보냈으면 덮지 않음(초안일 때만 씀)
    const row = { result: { ...result, summary: inspectionSummary(result) }, status: "draft", model, knowledge_keys: refs.map((r) => r.key), card_version_id: await confirmedVersionId(supabase, card.id, period) };
    let saved = false;
    if (existing) saved = Boolean((await supabase.from("inspections").update(row).eq("id", existing.id).eq("status", "draft").select("id")).data?.length);
    else {
      const ins = await supabase.from("inspections").insert({ ...row, card_id: card.id, period, created_by: me.id }).select("id");
      saved = !ins.error;
      if (ins.error) saved = Boolean((await supabase.from("inspections").update(row).eq("card_id", card.id).eq("period", period).eq("status", "draft").select("id")).data?.length);
    }
    if (!saved) return { ok: false, message: "AI가 점검하는 사이 점검표가 부서에 보내져 초안을 저장하지 않았습니다." };
    revalidatePath("/inspections");
    // 지침의 결과 메시지처럼: 충족 수 · 보완 건수 · 집중보완 여부
    const t = tally(result);
    const cl = mgCtx ? checklistCounts(result.checklist) : null;
    const counts = `7대축 ${t.tables.axes.met}/7 · 질의패턴 ${t.tables.patterns.met}/8 · 정합성 ${t.tables.coherence.met}/5, 보완 ${t.needs}건, ${t.focus ? "집중보완" : "집중보완 아님"}${cl ? ` · 체크리스트 대조 ${cl.total}개(예 ${cl.yes}·부분 ${cl.partial}·아니오 ${cl.no})` : ""}`;
    const notes = [`근거 조각 ${refs.length}개`, unverified ? `원문과 다른 인용 ${unverified}개` : "", missing ? `빠진 항목 ${missing}개` : ""].filter(Boolean).join(" · ");
    return { ok: true, result, message: `AI 초안을 저장했습니다(${counts}). ${notes} — 확인한 뒤 부서에 보내세요.` };
  } catch (e) {
    const message = aiErrorMessage(e);
    console.error("runInspectionDraft", e);
    await ai.finish({ status: "error", error: message });
    return { ok: false, message };
  }
}
