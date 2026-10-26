"use server";

import { revalidatePath } from "next/cache";
import { CHAT_LIMITS, cleanHistory, inspectionBrief } from "../../../lib/ai/chat.ts";
import { loadCardBundle } from "../../../lib/ai/context.ts";
import { bundleRefs } from "../../../lib/knowledge/bundle.ts";
import { loadMaterialTexts } from "../../../lib/ai/attachments.ts";
import { MATERIAL_COLS, type MaterialDoc, type MaterialRow, fileRefs } from "../../../lib/ai/material-text.ts";
import { type VerifiedComment, readCommentInput, verifyComments } from "../../../lib/ai/comments.ts";
import { aiErrorMessage, callChat, callComments, callWriter, modelLabel } from "../../../lib/ai/run.ts";
import { startAiRequest } from "../../../lib/ai/request-log.ts";
import { type FollowupBasis, NO_INSPECTION_MESSAGE, followupBasis } from "../../../lib/ai/followup.ts";
import { ASSIST_TEXT_MAX, type VerifiedResult, WRITER_MODES, type WriterMode, noRequirementResult, verifyResult } from "../../../lib/ai/writer.ts";
import { requireRole, requireUser } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
import { type CardChange, diffCards } from "../../../lib/cards/diff.ts";
import { checkEditable, recomputeDerived } from "../../../lib/cards/edit.ts";
import { canonicalJson, fixedSectionsOf } from "../../../lib/cards/fixed.ts";
import { mergeDraft } from "../../../lib/cards/merge.ts";
import { editTargets } from "../../../lib/cards/patch.ts";
import { openVersion, withFixedFrom } from "../../../lib/cards/versions.ts";
import { renderCard } from "../../../lib/cards/render.ts";
import { type InspectionResult, readResult } from "../../../lib/inspections/model.ts";
import { currentPeriod } from "../../../lib/cards/view.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { getTrack } from "../../../lib/tracks/current.ts";
import { prepCardChanged } from "../../../lib/prep/triggers.ts";

/** 저장 결과. rev = 원장 개정 번호(원장 저장), versionId = 열린 작성본 번호(작성본 저장) — 편집기가 다음 저장에 씀 */
export type SaveState = { status: "idle" } | { status: "ok"; message: string; at: string; rev?: number; versionId?: number } | { status: "error"; message: string };

const STALE_LEDGER = "다른 곳에서 원장이 바뀌었습니다(작성본 확정·다른 창의 수정). 화면을 새로 고친 뒤 다시 고쳐 주세요.";
const RETIRED = "보관한(삭제한) 과제입니다. 보관함에서 되살린 뒤 고칠 수 있습니다.";

const STAGES = ["Plan", "Do", "Check", "Act"];
const STATUSES = ["진행중", "완료", "보류"];
const HISTORY_MERGE_MS = 30 * 60 * 1000;
const AUTOSAVE_SUMMARY = "내용·운영 값";

/** 과제 속성(PDCA 단계·진도율·상태) 읽기. 편집기가 이 값을 아예 안 보내면(카드 전체 쪽처럼 편집 칩이 없는 화면) null — 원장 값을 그대로 둠(지움 아님) */
function parseMeta(p: { stage?: unknown; progress?: unknown; workStatus?: unknown }): { stage: string | null; progress: number | null; workStatus: string } | string | null {
  if (p.stage === undefined && p.progress === undefined && p.workStatus === undefined) return null;
  const stage = p.stage ? String(p.stage) : null;
  const progress = p.progress === "" || p.progress === null || p.progress === undefined ? null : Number(p.progress);
  const workStatus = String(p.workStatus ?? "진행중");
  if (stage && !STAGES.includes(stage)) return "PDCA 단계를 확인해 주세요.";
  if (progress !== null && (!Number.isInteger(progress) || progress < 0 || progress > 100)) return "진도율은 0~100 사이 정수입니다.";
  if (!STATUSES.includes(workStatus)) return "상태를 확인해 주세요.";
  return { stage, progress, workStatus };
}

/**
 * 원장 저장(자동 저장·지금 저장 공용). 카드 JSON만 받아 서버가 같은 렌더러로 원본 양식을 다시 만듭니다.
 * 성과관리팀·관리자 확인 + 로그인 권한 update(RLS). 같은 사람이 30분 안에 이어 고치면 이력 한 행을 갱신합니다.
 */
export async function saveCard(_prev: SaveState, formData: FormData): Promise<SaveState> {
  const me = await requireRole(["pmo", "admin"], "/cards");
  if (!me) return { status: "error", message: "성과관리팀·관리자만 수정할 수 있습니다." };
  if (await previewWriteBlocked()) return { status: "error", message: PREVIEW_WRITE_MSG };
  const uid = String(formData.get("uid") ?? "");
  const raw = String(formData.get("payload") ?? "");
  if (!raw || raw.length > 800_000) return { status: "error", message: "보낼 내용이 없거나 너무 큽니다." };
  let payload: { data?: Record<string, unknown>; rev?: unknown; stage?: unknown; progress?: unknown; workStatus?: unknown };
  try {
    payload = JSON.parse(raw);
  } catch {
    return { status: "error", message: "내용을 읽지 못했습니다." };
  }
  const meta = parseMeta(payload);
  if (typeof meta === "string") return { status: "error", message: meta };

  const supabase = await createClient();
  const { data: row } = await supabase.from("cards").select("id, data, data_rev, stage, progress, work_status, status").eq("uid", uid).maybeSingle();
  if (!row) return { status: "error", message: "카드를 찾을 수 없습니다." };
  if (row.status !== "active") return { status: "error", message: RETIRED };
  if (!payload.data || typeof payload.data !== "object") return { status: "error", message: "카드 내용이 없습니다." };
  // 편집기가 불러온 원장 개정 번호(없으면 예전 화면 — 지금 번호로 봄)
  const rev = typeof payload.rev === "number" ? payload.rev : row.data_rev;
  const after = recomputeDerived(payload.data);
  const problem = checkEditable(row.data, after);
  if (problem) return { status: "error", message: problem };
  let html: string;
  try {
    html = renderCard(after);
  } catch (e) {
    console.error("saveCard render", e);
    return { status: "error", message: "원본 양식으로 그리지 못했습니다. 입력을 확인해 주세요." };
  }
  const now = new Date().toISOString();
  const dataChanged = canonicalJson(row.data) !== canonicalJson(after);
  const metaChanged = meta !== null && (row.stage !== meta.stage || row.progress !== meta.progress || row.work_status !== meta.workStatus);
  if (!dataChanged && !metaChanged) return { status: "ok", message: "저장됨", at: now, rev: row.data_rev };
  if (dataChanged && rev !== row.data_rev) return { status: "error", message: STALE_LEDGER };

  // 카드 내용이 바뀌면 개정 번호가 그대로일 때만 쓰고 1 올림(그사이 확정·다른 창 수정이 있으면 0행 → 거절)
  // meta를 안 보낸 화면(편집 칩 없음)은 stage·progress·work_status를 건드리지 않음(원장 값 그대로)
  let q = supabase
    .from("cards")
    .update({
      ...(dataChanged ? { data: after, title: String(after.title).trim(), original_html: html, data_rev: rev + 1 } : {}),
      ...(meta !== null ? { stage: meta.stage, progress: meta.progress, work_status: meta.workStatus } : {}),
      updated_by: me.id,
    })
    .eq("uid", uid);
  if (dataChanged) q = q.eq("data_rev", rev);
  const { data: updated, error } = await q.select("id, data_rev");
  if (error || !updated?.length) {
    console.error("saveCard update", error?.message ?? "0 rows");
    return { status: "error", message: dataChanged ? STALE_LEDGER : "저장하지 못했습니다." };
  }
  // 운영 값만 바꾼 저장은 원장 번호를 올리지 않으므로 읽은 번호를 그대로 돌려줌(그사이 바뀐 원장을 본 것으로 치지 않게)
  const newRev = dataChanged ? (updated[0].data_rev as number) : row.data_rev;

  // 수정 이력: 30분 안의 내 이력 행이 있으면 after만 갱신(처음 before 유지), 없으면 새 행. meta를 안 보냈으면 원장에 남은 값으로 적음
  const stageLabel = meta ? (meta.stage ?? "—") : (row.stage ?? "—");
  const progressLabel = meta ? (meta.progress ?? "—") : (row.progress ?? "—");
  const workStatusLabel = meta ? meta.workStatus : row.work_status;
  const summary = `${AUTOSAVE_SUMMARY}(${stageLabel}·${progressLabel}%·${workStatusLabel})`;
  const { data: last } = await supabase.from("card_edits").select("id, edited_by, edited_at, summary").eq("card_id", row.id).order("edited_at", { ascending: false }).limit(1).maybeSingle();
  // 자동 저장 이력끼리만 합침(작성본 확정 같은 다른 기록은 그대로 둠)
  const merge = last && last.edited_by === me.id && String(last.summary ?? "").startsWith(AUTOSAVE_SUMMARY) && Date.now() - new Date(last.edited_at).getTime() < HISTORY_MERGE_MS;
  const { error: logError } = merge
    ? await supabase.from("card_edits").update({ after, summary, edited_at: now }).eq("id", last!.id)
    : await supabase.from("card_edits").insert({ card_id: row.id, edited_by: me.id, before: row.data, after, summary });
  if (logError) console.error("saveCard history", logError.message);
  // 과제 정체성(과제명·실행과제·계량지표)이 바뀌었으면 공통 지식 매칭·근거 목록표를 다시 준비(참고자료 3단계 — 실패해도 저장은 그대로)
  if (dataChanged) await prepCardChanged(supabase, me.id, row.id, row.data, after);

  revalidatePath("/cards");
  return { status: "ok", message: "저장됨", at: now, rev: newRev };
}

/** skipped = AI가 못 읽어 빠진 카드 자료 이름(「AI가 못 읽음」 — 요청은 나머지로 함) */
export type AssistState = { status: "idle" } | { status: "ok"; mode: WriterMode; result: VerifiedResult; model: string; sources: number; skipped: string[] } | { status: "error"; message: string };

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * 과제원장 AI(작성지원·질문·코멘트)에 넣는 카드 전용 자료: 이 카드의 자료 전부에서 사람이 뺀 것만 빼고(참고자료 설계 1단계·D8 — 요청마다 6건·20MB 고르기 없앰),
 * 올릴 때 읽어 둔 전체 글을 씁니다(아직 안 읽었거나 판이 다르면 여기서 읽어 채움). 그 카드의 card_materials 안에서만, 사용자 권한으로 읽음(금기 4).
 * 못 읽은 자료(스캔 PDF·형식 밖)는 요청을 막지 않고 skipped로 돌려줌
 */
async function loadCardFiles(supabase: Supabase, cardId: string, exclude: unknown[]): Promise<{ files: MaterialDoc[]; skipped: string[] }> {
  const off = new Set(exclude.map((v) => String(v ?? "").trim()).filter(Boolean));
  const { data } = await supabase.from("card_materials").select(MATERIAL_COLS).eq("card_id", cardId).order("created_at");
  const rows = ((data ?? []) as MaterialRow[]).filter((m) => !off.has(String(m.id)));
  const { docs, failed } = await loadMaterialTexts(supabase, "card_materials", rows);
  return { files: docs, skipped: failed.map((f) => f.name) };
}

/**
 * 카드 AI 작성지원(담당자 작성지원 지침 09). 카드를 볼 수 있는 사람이면 누구나 요청하고, 결과는 제안입니다.
 * 반영은 편집 권한이 있는 사람이 화면에서 합니다.
 */
export async function runCardAssist(_prev: AssistState, formData: FormData): Promise<AssistState> {
  const me = await requireUser("/cards");
  if (await previewWriteBlocked()) return { status: "error", message: PREVIEW_WRITE_MSG };
  const uid = String(formData.get("uid") ?? "");
  const mode = String(formData.get("mode") ?? "") as WriterMode;
  if (!(mode in WRITER_MODES)) return { status: "error", message: "요청 종류를 골라 주세요." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, data, status").eq("uid", uid).maybeSingle();
  if (!card) return { status: "error", message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { status: "error", message: RETIRED };

  // 보완 점검(모드 C): 질문과 같은 규칙의 최종 점검표 1건(보낸·확인한 것 중 점검월이 가장 늦은 것 — 초안 제외, 부서 담당자는 RLS로 받은 것만)을 근거로.
  // 점검표가 없거나 미흡이 0건이면 AI를 부르지 않고(호출 기록·첨부 읽기도 하지 않음) 안내/코드 결과를 돌려준다.
  let followup: FollowupBasis | null = null;
  if (mode === "followup") {
    const { data: ins } = await supabase.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle();
    followup = followupBasis(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null);
    if (!followup) return { status: "error", message: NO_INSPECTION_MESSAGE };
    if (!followup.rows.length) return { status: "ok", mode, result: noRequirementResult(followup), model: "코드(AI 호출 없음)", sources: 0, skipped: [] };
  }

  // 요청 칸 하나: 실적 반영이면 붙여 넣은 실적 문장·수치(와 요청)를 「실적 자료·요청」으로(2만 자), 그 밖은 요청 내용(2천 자)
  const text = String(formData.get("note") ?? "").trim();
  const attachmentText = mode === "reflect" ? text.slice(0, ASSIST_TEXT_MAX.reflect) || null : null;
  // 카드 전용 자료(모든 요청 종류): 이 카드의 자료 전부 — 화면에서 뺀 자료(exclude_ids)만 빼고, 올릴 때 읽어 둔 전체 글로
  const loaded = await loadCardFiles(supabase, card.id, formData.getAll("exclude_ids"));
  const files = loaded.files;
  if (mode === "reflect" && !attachmentText && !files.length) return { status: "error", message: "실적 반영은 이번 달 실적 자료가 필요합니다. 파일을 이 창에 끌어 놓아 카드 자료로 올리거나 실적 문장·수치를 요청 칸에 붙여 넣어 주세요." };

  const period = currentPeriod();
  const req = {
    mode,
    note: mode === "reflect" ? "" : text.slice(0, ASSIST_TEXT_MAX.note),
    periodLabel: `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`,
    attachmentText,
  };
  // AI 기준 카드 = 편집기에 지금 보이는 카드(부서는 작성본). 제안 경로도 이것으로 검사해 반영 위치가 어긋나지 않게
  let working: Record<string, unknown> = card.data;
  const rawCard = String(formData.get("card_json") ?? "");
  if (rawCard && rawCard.length <= 800_000) {
    try {
      const parsed = JSON.parse(rawCard);
      if (parsed && typeof parsed === "object" && !checkEditable(card.data, parsed)) working = parsed;
    } catch {
      // 편집기 카드를 못 읽으면 저장된 카드로
    }
  } else if (me.role === "dept_user") {
    working = (await openVersion(supabase, card.id))?.data ?? card.data;
  }
  // 공통 지식: 규칙 범위 전부(참고자료 설계 2단계 — 요청 종류와 상관없이 같은 묶음, 요청 종류별 쓰임은 프롬프트가 정함)
  const kb = await loadCardBundle(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: working });
  // 남용 방지·호출 기록: 진행 중 호출도 세는 1분 5회·동시 실행 제한(lib/ai/request-log.ts — 다른 AI 기능과 합산)
  const ai = await startAiRequest(supabase, { userId: me.id, cardId: card.id, feature: "card_assist", mode });
  if (!ai.ok) return { status: "error", message: ai.message };
  const t0 = Date.now();
  try {
    const call = await callWriter({ card: working, kb, req: { ...req, followup }, files });
    // 토큰은 검증 전에 기록(검증이 예외를 던져도 쓴 토큰이 남음)
    await ai.finish({ status: "ok", model: call.provider === "cli" ? `cli/${call.model}` : call.model, usage: call.usage, timings: { call: Date.now() - t0 } });
    // 인용 대조: 공통 지식 조각 + 첨부 전체 글(file:N)
    const result = verifyResult(call.result, working, [...bundleRefs(kb), ...fileRefs(files)], followup);
    return { status: "ok", mode, result, model: modelLabel(call), sources: bundleRefs(kb).length + files.length, skipped: loaded.skipped };
  } catch (e) {
    const message = aiErrorMessage(e);
    console.error("runCardAssist", e);
    await ai.finish({ status: "error", error: message });
    return { status: "error", message };
  }
}

export type ChatState = { ok: true; answer: string; model: string; sources: number; inspected: boolean; skipped: string[] } | { ok: false; message: string };

/**
 * 카드 「AI 작성지원 › 질문」(담당자 작성지원 지침 09를 채팅으로, 앞의 요청·답을 이력으로 받음). 카드를 볼 수 있는 사람이면 누구나 묻고, 카드는 고치지 않고 개선안(마크다운)만 돌려줍니다.
 * 근거는 편집기에 지금 보이는 카드(부서는 작성본) + 공통 지식 + 이 과제의 최종 점검표(부서에 보낸·확인한 것 중 점검월이 가장 늦은 1건 — 초안은 성과관리팀이 물어도 주지 않음).
 * 대화 이력은 브라우저에만 두고 서버는 본문을 저장하지 않습니다(호출 기록만 ai_requests.feature = card_chat).
 */
/** excludeIds = 화면에서 뺀 카드 자료(나머지 카드 자료는 전부 근거로) */
export async function runCardChat(uid: string, question: string, history: unknown, cardJson: string | null, excludeIds: string[] = []): Promise<ChatState> {
  const me = await requireUser("/cards");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const q = String(question ?? "")
    .trim()
    .slice(0, CHAT_LIMITS.question);
  if (!q) return { ok: false, message: "질문을 적어 주세요." };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, data, status").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { ok: false, message: RETIRED };

  const loaded = await loadCardFiles(supabase, card.id, Array.isArray(excludeIds) ? excludeIds : []);

  // AI 기준 카드 = 편집기에 지금 보이는 카드(부서는 작성본)
  let working: Record<string, unknown> = card.data;
  if (cardJson && cardJson.length <= 800_000) {
    try {
      const parsed = JSON.parse(cardJson);
      if (parsed && typeof parsed === "object" && !checkEditable(card.data, parsed)) working = parsed;
    } catch {
      // 편집기 카드를 못 읽으면 저장된 카드로
    }
  } else if (me.role === "dept_user") {
    working = (await openVersion(supabase, card.id))?.data ?? card.data;
  }
  const [kb, { data: ins }] = await Promise.all([
    loadCardBundle(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: working }),
    // 최종 점검표: 보낸·확인한 것 중 점검월이 가장 늦은 1건(초안은 최종이 아님)
    supabase.from("inspections").select("period, status, result").eq("card_id", card.id).neq("status", "draft").order("period", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const period = currentPeriod();
  const req = {
    question: q,
    history: cleanHistory(history),
    periodLabel: `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`,
    inspection: inspectionBrief(ins ? { period: ins.period, status: ins.status, result: readResult(ins.result) } : null),
  };
  // 남용 방지·호출 기록(AI 작성지원·코멘트·점검과 합산 — lib/ai/request-log.ts)
  const ai = await startAiRequest(supabase, { userId: me.id, cardId: card.id, feature: "card_chat", mode: req.history.length ? `turn:${Math.floor(req.history.length / 2) + 1}` : "turn:1" });
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const call = await callChat({ card: working, kb, req, files: loaded.files });
    await ai.finish({ status: "ok", model: call.provider === "cli" ? `cli/${call.model}` : call.model, usage: call.usage, timings: { call: Date.now() - t0 } });
    const answer = call.result.answer.trim();
    if (!answer) return { ok: false, message: "AI가 빈 답을 보냈습니다. 다시 물어 주세요." };
    return { ok: true, answer, model: modelLabel(call), sources: bundleRefs(kb).length + loaded.files.length, inspected: Boolean(ins), skipped: loaded.skipped };
  } catch (e) {
    const message = aiErrorMessage(e);
    console.error("runCardChat", e);
    await ai.finish({ status: "error", error: message });
    return { ok: false, message };
  }
}

export type CommentRunResult = { ok: true; comments: VerifiedComment[]; model: string } | { ok: false; message: string };

/**
 * 카드 리뷰어 코멘트 묶음 → AI(담당자 작성지원 지침 09). 카드를 볼 수 있는 사람이면 누구나 보냅니다.
 * AI는 화면이 보낸 카드(편집기에 지금 보이는 카드 — 부서는 작성본) 기준으로 편집·답을 돌려주고, 서버는 저장하지 않습니다.
 * 편집은 편집 권한이 있는 화면이 지금 카드에 합친 뒤 평소 자동 저장(원장 saveCard·작성본 saveDraft)으로 저장됩니다.
 */
export async function runCardComments(uid: string, payload: string): Promise<CommentRunResult> {
  const me = await requireUser("/cards");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (!payload || payload.length > 900_000) return { ok: false, message: "보낼 내용이 없거나 너무 큽니다." };
  let raw: { card?: unknown; comments?: unknown; keeps?: unknown };
  try {
    raw = JSON.parse(payload);
  } catch {
    return { ok: false, message: "코멘트를 읽지 못했습니다." };
  }
  const input = readCommentInput(raw);
  if (typeof input === "string") return { ok: false, message: input };
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id, eval_unit_id, data, status, fixed_locked_at").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  if (card.status !== "active") return { ok: false, message: RETIRED };
  // 편집 경로가 화면의 카드와 어긋나지 않게, 화면이 보낸 카드만 기준으로 씀
  const working = raw.card && typeof raw.card === "object" ? (raw.card as Record<string, unknown>) : null;
  if (!working || checkEditable(card.data, working)) return { ok: false, message: "카드 내용을 확인하지 못했습니다. 화면을 새로 고친 뒤 다시 보내 주세요." };

  // 부서 작성본은 확정된 고정 영역을 고치지 않음(서버·트리거도 원장 값으로 맞춤)
  const locked = card.fixed_locked_at && me.role === "dept_user" ? [...fixedSectionsOf(card.data)] : undefined;
  const targets = editTargets(working, locked);
  const period = currentPeriod();
  const mode = (["edit", "ask"] as const)
    .map((k) => [k, input.comments.filter((c) => c.kind === k).length] as const)
    .filter(([, n]) => n)
    .map(([k, n]) => `${k}:${n}`)
    .join(",");
  // 근거: 공통 지식 규칙 범위 전부 + 이 카드의 카드 전용 자료 전부(참고자료 설계 1·2단계 — 「첨부 기준으로 수치 고쳐 줘」 같은 코멘트도 근거로 처리)
  const [kb, loaded] = await Promise.all([loadCardBundle(supabase, { id: card.id, evalUnitId: card.eval_unit_id, data: working }), loadCardFiles(supabase, card.id, [])]);
  // 남용 방지·호출 기록(AI 작성지원과 합산 — lib/ai/request-log.ts)
  const ai = await startAiRequest(supabase, { userId: me.id, cardId: card.id, feature: "card_comment", mode });
  if (!ai.ok) return { ok: false, message: ai.message };
  const t0 = Date.now();
  try {
    const call = await callComments({ card: working, targets, kb, req: { periodLabel: `${period.slice(0, 4)}년 ${Number(period.slice(5))}월`, comments: input.comments, keeps: input.keeps }, files: loaded.files });
    await ai.finish({ status: "ok", model: call.provider === "cli" ? `cli/${call.model}` : call.model, usage: call.usage, timings: { call: Date.now() - t0 } });
    const comments = verifyComments(call.result, working, targets, input.comments);
    return { ok: true, comments, model: modelLabel(call) };
  } catch (e) {
    const message = aiErrorMessage(e);
    console.error("runCardComments", e);
    await ai.finish({ status: "error", error: message });
    return { ok: false, message };
  }
}

/**
 * 제출된 작성본 확정 — 성과관리팀·관리자.
 * 1) 작성본을 먼저 「확정」으로 선점(제출 상태일 때만 — 그사이 부서가 제출을 취소했으면 멈춤)
 * 2) 작성본을 시작할 때의 원장(base)과 비교해 부서가 바꾼 구역만 지금 원장에 반영(성과관리팀의 다른 원장 변경은 지킴)
 * 3) 원장 쓰기에 실패하면 작성본을 다시 제출 상태로 되돌림. 돌아온 값(data)으로 편집기가 원장을 새로 보여 줍니다.
 */
export async function confirmDraft(versionId: number): Promise<{ ok: boolean; message?: string; data?: Record<string, unknown>; rev?: number }> {
  const me = await requireRole(["pmo", "admin"], "/cards");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 확정할 수 있습니다." };
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("card_versions")
    .update({ status: "confirmed", confirmed_by: me.id, confirmed_at: now })
    .eq("id", versionId)
    .eq("status", "submitted")
    .select("id, card_id, period, data, base")
    .maybeSingle();
  if (!claimed) return { ok: false, message: "제출 상태의 작성본이 아닙니다(부서가 제출을 취소했거나 이미 처리됨)." };
  const release = async () => {
    await supabase.from("card_versions").update({ status: "submitted", confirmed_by: null, confirmed_at: null }).eq("id", claimed.id);
  };
  const { data: row } = await supabase.from("cards").select("id, data, data_rev, fixed_locked_at, status").eq("id", claimed.card_id).maybeSingle();
  if (!row || row.status !== "active") {
    await release();
    return { ok: false, message: row ? RETIRED : "카드를 찾을 수 없습니다." };
  }
  // 고정 영역이 잠겼으면 작성본·base 모두 원장 값으로 맞춰 그 영역은 원장 그대로
  const draft = row.fixed_locked_at ? withFixedFrom(claimed.data, row.data) : claimed.data;
  const base = row.fixed_locked_at && claimed.base ? withFixedFrom(claimed.base, row.data) : claimed.base;
  const { merged } = mergeDraft(row.data, base, draft);
  const after = recomputeDerived(merged);
  const problem = checkEditable(row.data, after);
  let html = "";
  try {
    html = problem ? "" : renderCard(after);
  } catch {
    html = "";
  }
  if (problem || !html) {
    await release();
    return { ok: false, message: problem ?? "원본 양식으로 그리지 못했습니다." };
  }
  // 읽은 뒤 원장이 바뀌었으면(다른 창 저장) 쓰지 않고 되돌림 — 다시 확정하면 최신 원장에 병합
  const { data: updated, error } = await supabase
    .from("cards")
    .update({ data: after, title: String(after.title).trim(), original_html: html, data_rev: row.data_rev + 1, updated_by: me.id })
    .eq("id", row.id)
    .eq("data_rev", row.data_rev)
    .select("id, data_rev");
  if (error || !updated?.length) {
    await release();
    return { ok: false, message: error ? "원장에 반영하지 못했습니다." : "그사이 원장이 바뀌었습니다. 다시 확정해 주세요." };
  }
  const month = `${Number(String(claimed.period).slice(5))}월`;
  const { error: logError } = await supabase.from("card_edits").insert({ card_id: row.id, edited_by: me.id, before: row.data, after, summary: `${month} 작성본 확정` });
  if (logError) console.error("confirmDraft history", logError.message);
  await prepCardChanged(supabase, me.id, row.id, row.data, after);
  revalidatePath("/cards");
  revalidatePath("/inspections");
  return { ok: true, data: after, rev: updated[0].data_rev as number };
}

/** 제출된 작성본 돌려보내기(메모와 함께 부서 작성 중으로) — 성과관리팀·관리자 */
export async function returnDraft(versionId: number, note: string): Promise<{ ok: boolean; message?: string }> {
  const me = await requireRole(["pmo", "admin"], "/cards");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 돌려보낼 수 있습니다." };
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const memo = note.trim().slice(0, 1000);
  if (!memo) return { ok: false, message: "돌려보내는 이유를 적어 주세요." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("card_versions").update({ status: "draft", note: memo, submitted_at: null }).eq("id", versionId).eq("status", "submitted").select("id");
  if (error || !data?.length) return { ok: false, message: "돌려보내지 못했습니다." };
  revalidatePath("/cards");
  revalidatePath("/inspections");
  return { ok: true };
}

export interface HistoryEntry {
  id: number;
  at: string;
  who: string;
  summary: string;
  changes: CardChange[];
  more: number;
}

/** 카드 수정 이력(원장 변경·작성본 확정) — 카드를 볼 수 있는 사람. 칸별 전후 비교를 함께 */
export async function getCardHistory(uid: string): Promise<{ ok: boolean; items?: HistoryEntry[]; message?: string }> {
  await requireUser("/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, message: "카드를 찾을 수 없습니다." };
  const { data: rows, error } = await supabase.from("card_edits").select("id, edited_by, edited_at, summary, before, after").eq("card_id", card.id).order("edited_at", { ascending: false }).limit(30);
  if (error) return { ok: false, message: "이력을 읽지 못했습니다." };
  const ids = [...new Set((rows ?? []).map((r) => r.edited_by).filter(Boolean))] as string[];
  const { data: people } = ids.length ? await supabase.from("profiles").select("id, display_name, email").in("id", ids) : { data: [] };
  const name = new Map((people ?? []).map((p) => [p.id, p.display_name || p.email || ""]));
  const items = (rows ?? []).map((r) => {
    const changes = diffCards(r.before, r.after);
    return { id: r.id, at: r.edited_at, who: name.get(r.edited_by ?? "") || "성과관리팀", summary: r.summary ?? "수정", changes: changes.slice(0, 40), more: Math.max(0, changes.length - 40) };
  });
  return { ok: true, items };
}

export interface CardInspection {
  id: number;
  period: string;
  status: "draft" | "sent" | "acknowledged";
  result: InspectionResult;
  updatedAt: string;
}

/** 카드 옆 창 「점검」: 이 과제의 최근 월간 점검(부서 담당자는 보낸 것만 — RLS) */
export async function getCardInspections(uid: string): Promise<{ ok: boolean; items: CardInspection[]; message?: string }> {
  await requireUser("/cards");
  const supabase = await createClient();
  const { data: card } = await supabase.from("cards").select("id").eq("uid", uid).maybeSingle();
  if (!card) return { ok: false, items: [], message: "카드를 찾을 수 없습니다." };
  const { data } = await supabase.from("inspections").select("id, period, status, result, updated_at").eq("card_id", card.id).order("period", { ascending: false }).limit(6);
  return { ok: true, items: (data ?? []).map((r) => ({ id: r.id, period: r.period, status: r.status, result: readResult(r.result), updatedAt: r.updated_at })) };
}

/** 고정 영역(주요사업 Act·Plan·계량지표, 경영관리 전년도 환류·지적 및 개선방안·계량지표) 확정·풀기 — 성과관리팀·관리자. uids를 비우면 머리띠에서 고른 트랙의 아직 확정하지 않은(풀기면 확정된) 과제 모두 */
export async function setFixedLock(uids: string[], lock: boolean): Promise<{ ok: boolean; message?: string; count?: number }> {
  const me = await requireRole(["pmo", "admin"], "/cards");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 확정합니다." };
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  let q = supabase.from("cards").update(lock ? { fixed_locked_at: new Date().toISOString(), fixed_locked_by: me.id } : { fixed_locked_at: null, fixed_locked_by: null });
  if (uids.length) q = q.in("uid", uids.slice(0, 200));
  else {
    // 일괄은 고른 트랙의 과제만(경영관리 평가단위 id는 MG-…) — 주요사업 원장의 「모두 확정」이 경영관리 카드까지 잠그지 않게
    q = (await getTrack()) === "경영관리" ? q.like("eval_unit_id", "MG-%") : q.not("eval_unit_id", "like", "MG-%");
    q = lock ? q.is("fixed_locked_at", null).eq("status", "active") : q.not("fixed_locked_at", "is", null);
  }
  const { data, error } = await q.select("id");
  if (error) return { ok: false, message: "바꾸지 못했습니다." };
  revalidatePath("/cards");
  revalidatePath("/my");
  if (lock && uids.length && !data?.length) return { ok: false, count: 0, message: "확정할 과제가 없습니다." };
  return { ok: true, count: data?.length ?? 0, message: `${data?.length ?? 0}개 과제 고정 영역을 ${lock ? "확정했습니다" : "풀었습니다"}.` };
}

