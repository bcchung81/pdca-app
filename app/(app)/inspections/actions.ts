"use server";

import { revalidatePath } from "next/cache";
import { gatherInspectionKnowledge, loadBizLedger } from "../../../lib/ai/context.ts";
import { type InspectContext, recheckEvidence, verifyInspection } from "../../../lib/ai/inspect.ts";
import { type MgSiblingRow, type MgmtInspectContext, mgSiblingsOf, verifyInspectionMg } from "../../../lib/ai/inspect-mg.ts";
import { type InspectionCall, type InspectionMgCall, aiErrorMessage, callInspection, callInspectionMg, mgLinkIndex, modelLabel } from "../../../lib/ai/run.ts";
import { launchAiJob, startAiJob } from "../../../lib/ai/background.ts";
import { INSPECT_EXPECT, rangeText } from "../../../lib/ai/progress.ts";
import { requireAtLeast } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
import { runInspectionJob, saveMissReason } from "../../../lib/inspections/draft-job.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { isPeriod, isoDay } from "../../../lib/format.ts";
import { pickBizLinks } from "../../../lib/inspections/biz-links.ts";
import { checklistItems } from "../../../lib/inspections/checklist.ts";
import { CASE_NO_SOURCE, type InspectionResult, MGMT_FORM_ID, STALE_SAVE_MSG, cleanResult, inspectionSummary, inspectionVersionConflict, isPreMonth, unsendBlock, versionedWriteConflict, readResult, readyToSend, inspectionWriteBlock } from "../../../lib/inspections/model.ts";
import { caseKey } from "../../../lib/inspections/summary.ts";
import { BUSINESSES } from "../../../lib/knowledge/dictionaries.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { isMgmtCard } from "../../../lib/cards/mgmt-card.ts";
import { MGMT_INDICATORS } from "../../../lib/tracks/mgmt-units.ts";
import { trackSpecOfUnit } from "../../../lib/tracks/index.ts";
import { getTrack } from "../../../lib/tracks/current.ts";

/** version = 저장 뒤 점검표의 판(updated_at — 편집기가 다음 저장 조건으로 씀), conflict = 판이 바뀌어 덮지 않음(STALE_SAVE_MSG) */
export type InspectionSaveState = { status: "idle" } | { status: "ok"; message: string; result: InspectionResult; version: string | null } | { status: "error"; message: string; conflict?: boolean };

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
 * base = 편집기가 열 때(또는 마지막 저장 때) 받은 판(updated_at, 행이 없었으면 null): 내용을 쓰는 저장·보내기는 이 판일 때만 — 그사이 다른 사람·AI가
 * 고쳤으면 덮지 않음(2026-11-10 T4 리뷰 X3a, lib/inspections/model.ts inspectionVersionConflict). 보내기 취소(상태만)는 판을 보지 않고 새 판만 돌려줌
 */
export async function saveInspection(uid: string, period: string, payload: unknown, intent: "save" | "send" | "unsend", base: string | null): Promise<InspectionSaveState> {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return { status: "error", message: "성과관리팀·관리자만 점검표를 씁니다." };
  if (await previewWriteBlocked()) return { status: "error", message: PREVIEW_WRITE_MSG };
  if (!isPeriod(period)) return { status: "error", message: "점검 기간이 올바르지 않습니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id").eq("uid", uid).maybeSingle();
  if (!card) return { status: "error", message: "카드를 찾을 수 없습니다." };
  const { data: existing } = await supabase.from("inspections").select("id, status, result, updated_at").eq("card_id", card.id).eq("period", period).maybeSingle();
  // 초안만 저장·보내기, 보낸 점검표는 보내기 취소만, 확인한 점검표는 아무것도(lib/inspections/model.ts — DB 트리거 guard_inspection_ack도 같은 규칙)
  const blocked = inspectionWriteBlock(existing?.status ?? null, intent);
  if (blocked) return { status: "error", message: blocked };
  // 보내기 취소는 상태만 초안으로(내용 열은 그대로 — 보낸 점검표의 내용 변경은 DB 트리거가 거절, 20261027100000).
  // 보낸 점검표가 아니면(그사이 다른 창·다른 사람이 먼저 취소·지움) 내용을 저장하지 않고 끝냄(T4 리뷰 T3-R6 — 예전에는 일반 저장으로 흘러 「초안을 저장했습니다」)
  if (intent === "unsend") {
    const not = unsendBlock(existing?.status ?? null);
    if (not) {
      revalidatePath("/inspections");
      return existing ? { status: "ok", result: readResult(existing.result), version: String(existing.updated_at), message: not } : { status: "error", message: not };
    }
  }
  if (intent === "unsend" && existing?.status === "sent") {
    const { data, error } = await supabase.from("inspections").update({ status: "draft" }).eq("id", existing.id).eq("status", "sent").select("id, updated_at");
    if (error || !data?.length) {
      console.error("saveInspection unsend", error?.message ?? "0 rows");
      return { status: "error", message: "보내기를 취소하지 못했습니다." };
    }
    revalidatePath("/inspections");
    revalidatePath("/my/inspections");
    return { status: "ok", result: readResult(existing.result), version: String(data[0].updated_at), message: "보내기를 취소했습니다(초안)." };
  }
  // 판 조건: 편집기가 받은 판이 아니면 덮지 않음(입력은 화면에 남김 — 새로 불러와 다시 고치게)
  if (inspectionVersionConflict(existing, base)) return { status: "error", conflict: true, message: STALE_SAVE_MSG };

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
  // 쓰기에도 같은 판 조건(읽은 뒤 쓰기 전 사이의 경합): 있던 행은 updated_at이 그대로일 때만, 없던 행은 넣기만(그사이 생겼으면 고유 키에 걸림)
  const { data: written, error } = existing
    ? await supabase.from("inspections").update(row).eq("id", existing.id).eq("updated_at", base ?? "").select("updated_at")
    : await supabase.from("inspections").insert({ ...row, card_id: card.id, period, created_by: me.id }).select("updated_at");
  if (versionedWriteConflict(error, written?.length ?? 0)) return { status: "error", conflict: true, message: STALE_SAVE_MSG };
  if (error || !written?.length) {
    console.error("saveInspection", error?.message ?? "0 rows");
    return { status: "error", message: "저장하지 못했습니다." };
  }
  revalidatePath("/inspections");
  revalidatePath("/my/inspections");
  return { status: "ok", result, version: String(written[0].updated_at), message: intent === "send" ? "부서에 보냈습니다." : "초안을 저장했습니다." };
}

/** 그 달 초안 중 보낼 수 있는 것(모든 항목 판단·미흡 근거·총평)을 모두 보냄 — 머리띠에서 고른 트랙의 과제만(다른 트랙 초안은 안 건드림) */
export async function sendAllDrafts(period: string): Promise<{ ok: boolean; message: string }> {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 보냅니다." };
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
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

/** AI 점검 초안 시작: requestId = 백그라운드 작업(끝맺음 글·점검표는 화면이 GET /api/ai/requests·/api/ai/results로 받음 — lib/inspections/draft-job.ts InspectionJobData) */
export type InspectionDraftState = { ok: true; requestId: number; message: string } | { ok: false; message: string };

/**
 * AI 점검 초안(종합점검 지침 14 점검 모드) — 성과관리팀·관리자. 확정 카드(원장) + 관리계획 발췌만 근거로 주고(경영관리는 붙임4 자리에 원장 주요사업 카드 발췌도),
 * 결과는 초안으로 저장합니다(보내기는 성과관리팀이 확인한 뒤). 보낸·확인한 점검표는 다시 만들지 않습니다.
 * 백그라운드(2026-11-10): 여기서는 권한·잠금·근거 모으기와 작업 시작(같은 과제 점검 중복 막기 → 1분 5회·동시 2건 → running 행)까지만 하고
 * AI 호출·검증·초안 저장은 응답 뒤(after — lib/ai/background.ts launchAiJob)에 사용자 권한 작업 클라이언트(RLS)로 함. 화면은 requestId로 끝을 기다림.
 */
export async function runInspectionDraft(uid: string, period: string): Promise<InspectionDraftState> {
  const me = await requireAtLeast("pmo", "/inspections");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 AI 점검을 씁니다." };
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (!isPeriod(period)) return { ok: false, message: "점검 기간이 올바르지 않습니다." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, data, status").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { ok: false, message: "보관된 과제는 점검하지 않습니다." };
  const mgmt = isMgmtCard(card.data);
  // 시작 때 본 판(updated_at): AI 저장은 이 판일 때만 — 그사이 다른 사람이 고치거나 만든 점검표를 덮지 않음(T4 리뷰 X3, 경평 saveDraftRow와 같은 방식)
  const { data: existing } = await supabase.from("inspections").select("id, status, updated_at").eq("card_id", card.id).eq("period", period).maybeSingle();
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
  // 저장할 행의 근거 기록(이 달 확정 작성본) — 응답 전에 읽어 둠(after 안에서는 쿠키 클라이언트를 쓰지 않음)
  const versionId = await confirmedVersionId(supabase, card.id, period);
  // 남용 방지·호출 기록: 같은 과제 점검 중복 막기 + 진행 중 호출도 세는 1분 5회·동시 실행 제한(lib/ai/request-log.ts — AI 작성지원·코멘트와 합산, 일괄 점검 동시 2건과 같음)
  const job = await startAiJob({ userId: me.id, cardId: card.id, kind: "inspect", mode: ctx.preMonth ? "pre" : "month" });
  if (!job.ok) return { ok: false, message: job.message };
  const ai = job.reqs[0];
  const db = job.db;
  const t0 = Date.now();
  const at = new Date().toISOString();
  // 호출 기록·점검표 행의 모델 이름(CLI는 「cli/」 — 예전 동기 액션과 같은 값)
  let model = "";
  // AI 호출·검증·저장은 응답 뒤(after) — 트랙마다 답 모양이 달라 호출·검증을 나눠 둠(경영관리 지침 13 — 체크리스트 대조·내부관리형)
  launchAiJob(job, () =>
    runInspectionJob({
      period,
      sources: refs.length,
      call: async (): Promise<{ mg?: InspectionMgCall; biz?: InspectionCall }> => (mgCtx ? { mg: await callInspectionMg({ card: card.data, refs, ctx: mgCtx }) } : { biz: await callInspection({ card: card.data, refs, ctx }) }),
      recorded: async (c) => {
        const call = (c.mg ?? c.biz)!;
        model = call.provider === "cli" ? `cli/${call.model}` : call.model;
        await ai.finish({ status: "ok", model, usage: call.usage, timings: { call: Date.now() - t0 } });
      },
      verify: (c) => (c.mg && mgCtx ? verifyInspectionMg(c.mg.output, refs, mgCtx, { model: modelLabel(c.mg), at }) : verifyInspection(c.biz!.output, refs, ctx, { model: modelLabel(c.biz!), at })),
      save: async (result) => {
        // 시작 때 본 판일 때만 씀: 있던 행은 초안이고 updated_at이 그대로일 때만 고치고, 없던 행은 넣기만(그사이 누가 만들었으면 고유 키에 걸려 덮지 않음)
        const row = { result: { ...result, summary: inspectionSummary(result) }, status: "draft", model, knowledge_keys: refs.map((r) => r.key), card_version_id: versionId };
        const write = existing
          ? await db.from("inspections").update(row).eq("id", existing.id).eq("status", "draft").eq("updated_at", existing.updated_at).select("id, updated_at")
          : await db.from("inspections").insert({ ...row, card_id: card.id, period, created_by: me.id }).select("id, updated_at");
        // 새 판(updated_at)을 결과에 실어 편집 화면이 다음 저장 조건으로 씀(X3a)
        if (!write.error && write.data?.length) return { ok: true as const, version: String(write.data[0].updated_at) };
        // 못 썼으면 까닭을 나눠 알림(T4 리뷰 X4): 지금 그 달 행과 본인 권한(본인 프로필은 늘 읽힘)을 다시 읽음
        const [now, self] = await Promise.all([
          db.from("inspections").select("status, updated_at").eq("card_id", card.id).eq("period", period).maybeSingle(),
          db.from("profiles").select("role, active").eq("id", me.id).maybeSingle(),
        ]);
        const staff = Boolean(self.data?.active && (self.data.role === "pmo" || self.data.role === "admin"));
        const reason = saveMissReason({ base: existing?.updated_at ?? null, error: write.error ? { code: write.error.code, message: write.error.message } : null, row: now.data ?? null, staff });
        if (reason === "error") console.error("runInspectionDraft save", write.error?.message ?? "0 rows", now.error?.message ?? "");
        return { ok: false as const, reason };
      },
      failed: async (e) => {
        const message = aiErrorMessage(e);
        console.error("runInspectionDraft", e);
        await ai.finish({ status: "error", error: message });
        return message;
      },
    }),
  );
  return { ok: true, requestId: job.requestId, message: `AI 점검을 시작했습니다(${rangeText(INSPECT_EXPECT)}) — 다른 화면으로 가도 서버에서 끝까지 돌고, 끝나면 초안으로 저장됩니다.` };
}
