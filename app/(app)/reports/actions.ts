"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { parseStored, recordDescribe } from "../../../lib/ai/attachments.ts";
import { parseColumns } from "../../../lib/ai/material-text.ts";
import { requireAtLeast, requireUser } from "../../../lib/auth/dal.ts";
import { PREVIEW_WRITE_MSG, previewWriteBlocked } from "../../../lib/auth/preview.ts";
import { type MaterialMatch, planMaterialSelection } from "../../../lib/reports/material-match.ts";
import { COMMENT_KINDS, type ReportStatus, canMove, cleanBlocks, needsReturnMemo, reportsToStart, safeExt } from "../../../lib/reports/model.ts";
import { buildOutline, isPageStep } from "../../../lib/reports/outline.ts";
import { buildMgOutline } from "../../../lib/reports/mg-page-plan.ts";
import { loadMgPageRefs } from "../../../lib/reports/mg-queries.ts";
import { getReport, loadSubmitCards, submitKey } from "../../../lib/reports/queries.ts";
import { COMMENT_BODY_MAX, KPI_VALUE_MAX } from "../../../lib/reports/input-limits.ts";
import { REVIEW_NOTE_MAX, submitBlockedReason, submitReadiness } from "../../../lib/reports/submission.ts";
import { createClient } from "../../../lib/supabase/server.ts";
import { getTrack } from "../../../lib/tracks/current.ts";
import { DEFAULT_TRACK } from "../../../lib/tracks/index.ts";

type Result = { ok: boolean; message?: string };
const LOCKED_MSG = "제출·승인된 보고서는 고칠 수 없습니다(부서는 제출 취소 뒤 고침).";
/** 부서는 자료 준비·초안 작성 단계에서만 내용·자료를 바꿈(DB 정책·트리거도 같은 판정) */
const contentLocked = (role: string, status: string) => role === "dept_user" && (status === "submitted" || status === "approved");
const refresh = (id?: number) => {
  revalidatePath("/reports");
  revalidatePath("/my/report");
  if (id) revalidatePath(`/reports/${id}`);
};

/** 그 해 보고서 준비: 머리띠에서 고른 트랙의 과제가 있는 (평가단위 × 부서)마다 보고서 행을 만듦(주요사업 사업 · 경영관리 지표) — 성과관리팀·관리자. 초안이 먼저 있던 보고서는 초안 작성으로(다시 누르면 이미 머문 보고서도 풀림) */
export async function prepareReports(year: number): Promise<Result> {
  const me = await requireAtLeast("pmo", "/reports");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 준비합니다." };
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return { ok: false, message: "연도가 올바르지 않습니다." };
  const supabase = await createClient();
  const track = await getTrack();
  const { data: cards } = await supabase.from("cards").select("eval_unit_id, team_id, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", track);
  const pairs = new Map<string, { eval_unit_id: string; team_id: number }>();
  for (const c of cards ?? []) if (c.team_id) pairs.set(`${c.eval_unit_id}|${c.team_id}`, { eval_unit_id: c.eval_unit_id, team_id: c.team_id });
  const rows = [...pairs.values()].map((p) => ({ ...p, year, created_by: me.id }));
  const { error } = await supabase.from("reports").upsert(rows, { onConflict: "eval_unit_id,year,team_id", ignoreDuplicates: true });
  if (error) {
    console.error("prepareReports", error.message);
    return { ok: false, message: "보고서를 준비하지 못했습니다." };
  }
  // 과제별 초안이 보고서보다 먼저 있으면 DB 트리거(report_drafting_on_draft)가 다시 돌지 않으므로 여기서 작성 중으로
  let started = 0;
  let startFailed = false;
  const [pre, dr] = await Promise.all([
    supabase.from("reports").select("id, eval_unit_id, team_id, year, status, unit:eval_units!inner(track)").eq("year", year).eq("status", "preparing").eq("unit.track", track),
    supabase.from("card_report_drafts").select("year, card:cards!inner(eval_unit_id, team_id)").eq("year", year),
  ]);
  if (pre.error || dr.error) {
    startFailed = true;
    console.error("prepareReports drafting", (pre.error ?? dr.error)?.message);
  } else {
    const drafts = (dr.data ?? []).flatMap((d) => {
      const card = Array.isArray(d.card) ? d.card[0] : d.card;
      return card ? [{ year: d.year, eval_unit_id: card.eval_unit_id, team_id: card.team_id }] : [];
    });
    const ids = reportsToStart(pre.data ?? [], drafts);
    if (ids.length) {
      const up = await supabase.from("reports").update({ status: "drafting" }).in("id", ids).eq("status", "preparing").select("id");
      if (up.error) {
        startFailed = true;
        console.error("prepareReports drafting", up.error.message);
      } else started = up.data?.length ?? 0;
    }
  }
  refresh();
  let message = `${track} ${rows.length}개 부서 보고서를 준비했습니다.`;
  if (started > 0) message += ` 과제별 초안이 이미 있는 ${started}곳은 「초안 작성」으로 두었습니다.`;
  if (startFailed) message += " 초안이 이미 있는 보고서의 단계는 바꾸지 못했습니다 — 다시 누르면 다시 시도합니다.";
  return { ok: true, message };
}

/** 주요사업 주관 부서 지정(사업 공통 부분 작성) — 성과관리팀·관리자 */
export async function setLeadTeam(unitId: string, teamId: number | null): Promise<Result> {
  const me = await requireAtLeast("pmo", "/reports");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 지정합니다." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("eval_units").update({ lead_team_id: teamId }).eq("id", unitId).select("id");
  if (error || !data?.length) return { ok: false, message: "지정하지 못했습니다." };
  refresh();
  return { ok: true };
}

/**
 * 보고서 상태: 부서는 제출·제출 취소, 성과관리팀은 승인·돌려보내기까지.
 * 제출 조건 = 목차에 든 과제 모두 과제별 초안 있음(submitReadiness — 예전에는 원고 블록 수만 봤음). 나머지 확인할 것은 화면 확인 창에서만.
 * 성과관리팀이 제출된 보고서를 돌려보낼 때(제출 → 초안 작성)·승인을 풀 때(승인 → 작성 중)는 메모 필수 — 부서 화면에 보임(review_note)
 */
export async function setReportStatus(id: number, to: ReportStatus, note?: string): Promise<Result> {
  const me = await requireUser("/reports");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const report = await getReport(supabase, id);
  if (!report) return { ok: false, message: "보고서를 찾을 수 없습니다." };
  const staff = me.role !== "dept_user";
  // 전이 표 한 곳(lib/reports/model.ts canMove — DB 트리거와 같은 목록): 성과관리팀도 표 밖 전이(준비 → 승인 등)는 안 됨
  if (!canMove(me.role, report.status, to)) return { ok: false, message: "이 단계로 바꿀 수 없습니다." };
  if (to === "submitted") {
    const cards = (await loadSubmitCards(supabase, report.year, { evalUnitId: report.evalUnitId, teamId: report.teamId })).get(submitKey(report.evalUnitId, report.teamId)) ?? [];
    const why = submitBlockedReason(submitReadiness(cards));
    if (why) return { ok: false, message: why };
  }
  const memo = String(note ?? "").trim().slice(0, REVIEW_NOTE_MAX);
  const returning = needsReturnMemo(me.role, report.status, to);
  if (returning && !memo) return { ok: false, message: "돌려보내거나 승인을 풀 때는 부서가 고칠 점을 메모로 적어 주세요." };
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to };
  if (to === "submitted") Object.assign(patch, { submitted_at: now, submitted_by: me.id });
  if (to === "approved") Object.assign(patch, { approved_at: now, approved_by: me.id });
  if (to !== "approved" && staff) Object.assign(patch, { approved_at: null, approved_by: null });
  // 성과관리팀 검토 메모: 돌려보내기·승인 풀기(필수)·승인(선택) 때 남김 — 부서는 못 바꿈(guard_report)
  if (staff && (returning || to === "approved")) Object.assign(patch, { review_note: memo, reviewed_at: now, reviewed_by: me.id });
  // 읽은 상태가 그대로일 때만(두 사람이 동시에 바꾸면 늦은 쪽은 0행)
  const { data, error } = await supabase.from("reports").update(patch).eq("id", id).eq("status", report.status).select("id");
  if (error) return { ok: false, message: "바꾸지 못했습니다." };
  if (!data?.length) return { ok: false, message: "다른 사람이 먼저 상태를 바꿨습니다 — 화면을 새로 고친 뒤 다시 해 주세요." };
  refresh(id);
  return { ok: true };
}

/** 계량 실적 잠정치 등 부서 입력값 저장(작성 부서·성과관리팀) */
export async function saveReportInputs(id: number, kpi: Record<string, string>): Promise<Result> {
  const me = await requireUser("/my/report");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const report = await getReport(supabase, id);
  if (!report) return { ok: false, message: "보고서를 찾을 수 없습니다." };
  if (report.status === "approved" || contentLocked(me.role, report.status)) return { ok: false, message: LOCKED_MSG };
  const clean = Object.fromEntries(
    Object.entries(kpi)
      .slice(0, 200)
      .map(([k, v]) => [k.slice(0, 200), String(v).trim().slice(0, KPI_VALUE_MAX)]),
  );
  const { data, error } = await supabase
    .from("reports")
    .update({ inputs: { ...(report.inputs ?? {}), kpi: clean } })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "저장하지 못했습니다(자기 부서 보고서만)." };
  refresh(id);
  return { ok: true, message: "저장했습니다." };
}

const MAX_BYTES = 50 * 1024 * 1024;

/** 추가자료 올리기 1단계: 서명 업로드 주소(저장소 insert 권한 = 작성 부서·성과관리팀) */
export async function startMaterialUpload(reportId: number, fileName: string, bytes: number): Promise<{ ok: true; path: string; token: string } | { ok: false; message: string }> {
  const me = await requireUser("/my/report");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (!fileName || bytes <= 0) return { ok: false, message: "파일을 골라 주세요." };
  if (bytes > MAX_BYTES) return { ok: false, message: "파일은 50MB 이하만 올릴 수 있습니다." };
  const supabase = await createClient();
  const report = await getReport(supabase, reportId);
  if (!report) return { ok: false, message: "보고서를 찾을 수 없습니다." };
  if (contentLocked(me.role, report.status)) return { ok: false, message: LOCKED_MSG };
  const path = `${reportId}/${randomUUID()}${safeExt(fileName)}`;
  const { data, error } = await supabase.storage.from("report-materials").createSignedUploadUrl(path);
  if (error || !data) return { ok: false, message: "올릴 수 없습니다(자기 부서 보고서에만 올립니다)." };
  return { ok: true, path: data.path, token: data.token };
}

/**
 * 추가자료 올리기 2단계: 올린 파일을 목록에 등록. 등록할 때 kordoc으로 한 번 읽어 전체 글을 함께 저장합니다(참고자료 설계 1단계 — 경평 초안은 저장본만 씀).
 * 못 읽는 파일도 등록은 되고 목록에 「AI가 못 읽음」으로 보임. 저장소에서 못 내려받으면 읽기를 미뤄 두고(pending) 초안 때 다시 읽음
 */
export async function finishMaterialUpload(reportId: number, path: string, fileName: string, mime: string, bytes: number): Promise<Result> {
  const me = await requireUser("/my/report");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (!path.startsWith(`${reportId}/`)) return { ok: false, message: "경로가 올바르지 않습니다." };
  const supabase = await createClient();
  const name = fileName.slice(0, 300);
  const parsed = await parseStored(supabase, "report-materials", path, name);
  const { data: inserted, error } = await supabase
    .from("report_materials")
    .insert({ report_id: reportId, storage_path: path, file_name: name, mime_type: mime.slice(0, 200) || null, bytes, uploaded_by: me.id, ...(parsed.sha256 ? parseColumns(parsed) : {}) })
    .select("id")
    .single();
  if (error || !inserted) {
    console.error("finishMaterialUpload", error?.message);
    return { ok: false, message: "목록에 등록하지 못했습니다." };
  }
  await recordDescribe(supabase, parsed, { userId: me.id }); // 그림 설명을 만들었으면 그 호출(토큰)을 남김(보고서 자료라 과제 없음)
  // 어느 과제 자료인지는 올린 사람이 고름(3-5 재정의 — AI가 미리 분석하지 않음). 파일 이름에 과제번호가 있으면 화면이 미리 체크해 줌
  refresh(reportId);
  return { ok: true };
}

export async function deleteMaterial(id: string): Promise<Result> {
  await requireUser("/my/report");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const { data: row } = await supabase.from("report_materials").select("id, report_id, storage_path").eq("id", id).maybeSingle();
  if (!row) return { ok: false, message: "자료를 찾을 수 없습니다." };
  const { data, error } = await supabase.from("report_materials").delete().eq("id", id).select("id"); // 연결(report_material_cards)은 함께 사라짐
  if (error || !data?.length) return { ok: false, message: "지우지 못했습니다(자기 부서 보고서만)." };
  await supabase.storage.from("report-materials").remove([row.storage_path]);
  refresh(row.report_id);
  return { ok: true };
}

/**
 * 보고서 추가자료를 어느 과제에 쓸지 고름(참고자료 3단계). cardIds = 체크한 과제 — 이 보고서(같은 사업·부서)의 활성 과제만.
 * 체크한 과제는 확정(이미 있던 행은 method·근거를 유지, 아니면 사람이 고른 것), 체크를 뺀 과제는 연결을 지움.
 * **사람이 확정한 연결만** 그 과제 경평 초안의 숫자 근거로 인정됨. 하나도 안 고르면 「같은 보고서 자료」(초안에는 들어가되 숫자 근거는 아님)
 */
export async function setMaterialCards(reportId: number, materialId: string, cardIds: string[]): Promise<Result> {
  const me = await requireUser("/my/report");
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const report = await getReport(supabase, reportId);
  if (!report) return { ok: false, message: "보고서를 찾을 수 없습니다." };
  if (contentLocked(me.role, report.status)) return { ok: false, message: LOCKED_MSG };
  const { data: mat } = await supabase.from("report_materials").select("id").eq("id", materialId).eq("report_id", reportId).maybeSingle();
  if (!mat) return { ok: false, message: "자료를 찾을 수 없습니다." };
  const [{ data: cards }, { data: rows }] = await Promise.all([
    supabase.from("cards").select("id").eq("eval_unit_id", report.evalUnitId).eq("team_id", report.teamId).eq("status", "active"),
    supabase.from("report_material_cards").select("card_id, status, method, basis").eq("material_id", materialId),
  ]);
  const existing: MaterialMatch[] = (rows ?? []).map((r) => ({ cardId: String(r.card_id), method: r.method, basis: r.basis ?? null }));
  const plan = planMaterialSelection(existing, Array.isArray(cardIds) ? cardIds.map(String) : [], new Set((cards ?? []).map((c) => String(c.id))));
  if (plan.invalid.length) return { ok: false, message: "이 보고서의 과제가 아닌 것이 있습니다. 화면을 새로 고쳐 다시 골라 주세요." };
  const now = new Date().toISOString();
  if (plan.upsert.length) {
    const { error } = await supabase
      .from("report_material_cards")
      .upsert(plan.upsert.map((u) => ({ material_id: materialId, card_id: u.cardId, status: "confirmed", method: u.method, basis: u.basis, confirmed_by: me.id, confirmed_at: now })), { onConflict: "material_id,card_id" });
    if (error) {
      console.error("setMaterialCards upsert", error.message);
      return { ok: false, message: "과제 연결을 저장하지 못했습니다." };
    }
  }
  if (plan.remove.length) {
    const { error } = await supabase.from("report_material_cards").delete().eq("material_id", materialId).in("card_id", plan.remove);
    if (error) {
      console.error("setMaterialCards delete", error.message);
      return { ok: false, message: "과제 연결을 저장하지 못했습니다." };
    }
  }
  refresh(reportId);
  return { ok: true };
}

/** 리뷰 코멘트 달기(보고서를 볼 수 있는 사람) */
export async function addComment(reportId: number, anchor: string, kind: string, body: string): Promise<Result> {
  const me = await requireUser(`/reports/${reportId}`);
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const text = body.trim();
  if (!text) return { ok: false, message: "코멘트 내용을 적어 주세요." };
  if (!(COMMENT_KINDS as readonly string[]).includes(kind)) return { ok: false, message: "코멘트 종류를 골라 주세요." };
  const supabase = await createClient();
  const { error } = await supabase.from("report_comments").insert({ report_id: reportId, anchor: anchor.slice(0, 100) || "all", kind, body: text.slice(0, COMMENT_BODY_MAX), author_id: me.id });
  if (error) return { ok: false, message: "코멘트를 달지 못했습니다." };
  refresh(reportId);
  return { ok: true };
}

/** 코멘트 해결·다시 열기(작성 부서·성과관리팀·쓴 사람) */
export async function setCommentStatus(id: number, reportId: number, status: "open" | "resolved"): Promise<Result> {
  const me = await requireUser(`/reports/${reportId}`);
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  const supabase = await createClient();
  const done = status === "resolved";
  const { data, error } = await supabase
    .from("report_comments")
    .update({ status, resolved_by: done ? me.id : null, resolved_at: done ? new Date().toISOString() : null })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "바꾸지 못했습니다." };
  refresh(reportId);
  return { ok: true };
}

/**
 * 카드로 목차 만들기(없는 과제만 추가) — 머리띠에서 고른 트랙의 과제만. refresh면 목차 위치·순서를 카드에 다시 맞추고 쪽 배정·포함은 유지.
 * 주요사업 = 대상사업 → 실행과제 → 과제(사업마다 15±1쪽), 경영관리 = 평가내용 → 과제(지표 총량은 작성분량, 평가내용·과제 몫은 2025 보고서 쪽 비율로 어림한 배정안 — lib/reports/mg-page-plan.ts)
 */
export async function buildReportOutline(year: number, refresh: boolean): Promise<Result> {
  const me = await requireAtLeast("pmo", "/reports/outline");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 만듭니다." };
  const supabase = await createClient();
  const track = await getTrack();
  const [{ data: cards }, { data: existing }, refs] = await Promise.all([
    supabase.from("cards").select("id, eval_unit_id, task_no, tb:data->>targetBusiness, et:data->>executionTask, etn:data->>executionTaskNo, unit:eval_units!inner(track)").eq("status", "active").eq("unit.track", track),
    supabase.from("report_outline").select("card_id, pages, included").eq("year", year),
    track === DEFAULT_TRACK.id ? Promise.resolve(null) : loadMgPageRefs(supabase),
  ]);
  const have = new Map((existing ?? []).map((r) => [r.card_id, r]));
  const built = refs
    ? [...new Set((cards ?? []).map((c) => c.eval_unit_id))].flatMap((unit) => {
        const ref = refs.get(unit);
        // 2025 보고서가 없는 지표는 평가내용 없이 — 카드마다 0.5쪽(사람이 고침)
        const plan = buildMgOutline(unit, ref ?? { total: 0, body: 0, common: 0, content: 0, evals: [] }, (cards ?? []).filter((c) => c.eval_unit_id === unit).map((c) => ({ id: c.id, taskNo: c.task_no })));
        return plan.rows;
      })
    : buildOutline((cards ?? []).map((c) => ({ id: c.id, evalUnitId: c.eval_unit_id, taskNo: c.task_no, targetBusiness: c.tb ?? "", executionTask: c.et ?? "", executionTaskNo: c.etn ?? "" })));
  const rows = built
    .filter((r) => refresh || !have.has(r.card_id))
    .map((r) => {
      const old = have.get(r.card_id);
      return { ...r, year, pages: old ? Number(old.pages) : r.pages, included: old ? old.included : true, updated_by: me.id };
    });
  if (rows.length) {
    const { error } = await supabase.from("report_outline").upsert(rows, { onConflict: "card_id,year" });
    if (error) {
      console.error("buildReportOutline", error.message);
      return { ok: false, message: "목차를 만들지 못했습니다." };
    }
  }
  revalidatePath("/reports/outline");
  revalidatePath("/my/report");
  return { ok: true, message: refresh ? `목차 ${rows.length}행을 카드에 다시 맞췄습니다(쪽 배정 유지).` : `과제 ${rows.length}개를 목차에 넣었습니다.` };
}

/** 과제(소항목) 쪽 배정·포함 여부 */
export async function setOutline(cardId: string, year: number, patch: { pages?: number; included?: boolean }): Promise<Result> {
  const me = await requireAtLeast("pmo", "/reports/outline");
  if (!me) return { ok: false, message: "성과관리팀·관리자만 배정합니다." };
  if (patch.pages !== undefined && !isPageStep(patch.pages)) return { ok: false, message: "쪽수는 0.5쪽 단위입니다." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("report_outline")
    .update({ ...(patch.pages !== undefined ? { pages: patch.pages } : {}), ...(patch.included !== undefined ? { included: patch.included } : {}), updated_by: me.id })
    .eq("card_id", cardId)
    .eq("year", year)
    .select("card_id");
  if (error || !data?.length) return { ok: false, message: "바꾸지 못했습니다." };
  revalidatePath("/reports/outline");
  revalidatePath("/my/report");
  return { ok: true };
}

/**
 * 보고서 원고 직접 쓰기(블록 저장) — 성과관리팀만(2026-09-27 사용자 결정: 부서 흐름에서 뺌 — 부서의 평가내용2는 과제별 초안이 제출물,
 * 원고 블록은 뒤에 주관 부서 공통 부분 자리로 돌려씀). 처음 저장하면 「초안 작성」
 */
export async function saveReportBlocks(id: number, raw: unknown): Promise<Result & { count?: number }> {
  const me = await requireUser(`/reports/${id}`);
  if (await previewWriteBlocked()) return { ok: false, message: PREVIEW_WRITE_MSG };
  if (me.role === "dept_user") return { ok: false, message: "부서는 원고를 직접 쓰지 않습니다 — 평가내용2는 과제별 초안으로 씁니다." };
  const supabase = await createClient();
  const report = await getReport(supabase, id);
  if (!report) return { ok: false, message: "보고서를 찾을 수 없습니다." };
  if (report.status === "approved" || contentLocked(me.role, report.status)) return { ok: false, message: LOCKED_MSG };
  const cleaned = cleanBlocks(raw, () => `b${randomUUID().slice(0, 8)}`);
  if ("error" in cleaned) return { ok: false, message: cleaned.error };
  const patch: Record<string, unknown> = { blocks: cleaned.blocks };
  if (report.status === "preparing" && cleaned.blocks.length) patch.status = "drafting";
  const { data, error } = await supabase.from("reports").update(patch).eq("id", id).select("id");
  if (error || !data?.length) return { ok: false, message: "저장하지 못했습니다." };
  refresh(id);
  return { ok: true, message: `블록 ${cleaned.blocks.length}개를 저장했습니다.`, count: cleaned.blocks.length };
}
